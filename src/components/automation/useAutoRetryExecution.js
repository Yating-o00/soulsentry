import { useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

const MAX_ATTEMPTS = 3;
// 网关中断后继续等待后台把结果写回的时长（长文/PPT 常需 2~5 分钟）
const WAIT_AFTER_TIMEOUT_MS = 8 * 60 * 1000;
const POLL_INTERVAL_MS = 6000;

function reasonOf(e) {
  const msg = e?.response?.data?.error || e?.response?.data?.message || e?.message || "";
  const status = e?.response?.status;
  if (status === 502 || status === 503 || status === 504 || status === 408 || status === 0 || !status ||
      /timeout|timed out|DEPLOYMENT_TIMED_OUT|502|503|504|network/i.test(msg)) {
    return "__GATEWAY_TIMEOUT__";
  }
  if (status === 402 || /INSUFFICIENT_CREDITS|点数不足/i.test(msg)) return "AI 点数不足";
  if (/429|rate limit|排队繁忙/i.test(msg)) return "AI 服务排队繁忙（频率/额度受限）";
  return msg || "未知错误";
}

// 网关掐断连接后，后台其实仍在生成 —— 继续轮询这条执行记录，等结果落库
async function waitForResult(execId, refresh) {
  const deadline = Date.now() + WAIT_AFTER_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    let rec = null;
    try {
      rec = await base44.entities.TaskExecution.get(execId);
    } catch (_) { /* 网络抖动，继续等 */ }
    if (rec?.execution_status === "completed") { refresh?.(); return "completed"; }
    if (rec?.execution_status === "failed") return "failed";
  }
  return "pending";
}

// 长文档类型走"分段接力"生成：每次请求只做一步，规避平台 120 秒硬超时
const CHUNK_TYPES = ["office_doc", "summary_note"];
const MAX_CHUNK_STEPS = 12;

async function runChunked(execId, silent) {
  let pendingFile = null;
  for (let step = 0; step < MAX_CHUNK_STEPS; step++) {
    const res = await base44.functions.invoke("generateDocChunk", { execution_id: execId, ...(pendingFile || {}) });
    const d = res?.data || {};
    if (d.done) return true;
    if (d.stage === "uploaded" && d.file_url) {
      // 文档已生成好文件，下一步单独把结果写回记录
      pendingFile = { save_file_url: d.file_url, save_file_name: d.file_name };
      continue;
    }
    if (!silent && d.stage === "section" && d.total) {
      toast.info(`正在逐节生成（${d.filled}/${d.total}）`);
    }
  }
  throw new Error("章节过多，未在限定步骤内完成");
}

// 执行智能执行任务：耗时过长时继续等待后台出结果；真失败才自动重试，最多 3 次
export function useAutoRetryExecution(refresh) {
  const [busy, setBusy] = useState(false);
  const autoTried = useRef(new Set());

  const run = async (execId, { silent = false } = {}) => {
    setBusy(true);
    let lastReason = "";
    try {
      let chunked = false;
      try {
        const rec = await base44.entities.TaskExecution.get(execId);
        chunked = CHUNK_TYPES.includes(rec?.automation_type);
      } catch (_) { /* ignore */ }

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          if (chunked) await runChunked(execId, silent);
          else await base44.functions.invoke("executeAutomation", { execution_id: execId, phase: "execute" });
          if (!silent) toast.success("心栈已经做好了，请验收");
          return true;
        } catch (e) {
          const reason = reasonOf(e);
          if (reason === "__GATEWAY_TIMEOUT__") {
            // 不当失败处理：后台仍在生成，继续等它落库（最多 8 分钟）
            if (!silent) toast.info("这份内容比较长，心栈仍在生成，完成后会自动出现在这里");
            const outcome = await waitForResult(execId, refresh);
            if (outcome === "completed") {
              if (!silent) toast.success("心栈已经做好了，请验收");
              return true;
            }
            lastReason = outcome === "pending"
              ? "内容体量较大，生成时间超过 8 分钟仍未完成"
              : "后台生成过程中出错";
          } else {
            lastReason = reason;
          }
          if (/点数不足/.test(lastReason)) break;
          if (attempt < MAX_ATTEMPTS) {
            if (!silent) toast.info(`还没出结果，正在自动重试（第 ${attempt + 1}/${MAX_ATTEMPTS} 次）`);
            await new Promise((r) => setTimeout(r, 2000 * attempt));
          }
        }
      }
      const detail = `已自动重试 ${MAX_ATTEMPTS} 次仍未出结果。原因：${lastReason}。建议：把这条约定拆成更小的部分，或稍后再试。`;
      try {
        await base44.entities.TaskExecution.update(execId, {
          execution_status: "failed",
          error_message: detail,
        });
      } catch (_) { /* ignore */ }
      toast.error(detail);
      return false;
    } finally {
      setBusy(false);
      refresh?.();
    }
  };

  // 中断状态的执行：先看后台是否已经悄悄跑完，没有才补跑
  const autoRecover = async (execId) => {
    if (autoTried.current.has(execId)) return;
    autoTried.current.add(execId);
    try {
      const rec = await base44.entities.TaskExecution.get(execId);
      if (rec?.execution_status === "completed") { refresh?.(); return; }
    } catch (_) { /* ignore */ }
    run(execId, { silent: true });
  };

  return { busy, run, autoRecover };
}