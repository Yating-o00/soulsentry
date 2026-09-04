import { useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

const MAX_ATTEMPTS = 3;

function reasonOf(e) {
  const msg = e?.response?.data?.error || e?.response?.data?.message || e?.message || "";
  const status = e?.response?.status;
  if (status === 502 || status === 504 || /timeout|timed out|502|504/i.test(msg)) {
    return "AI 生成耗时过长，被服务网关中断（内容量偏大）";
  }
  if (status === 402 || /INSUFFICIENT_CREDITS|点数不足/i.test(msg)) return "AI 点数不足";
  if (/429|rate limit|排队繁忙/i.test(msg)) return "AI 服务排队繁忙（频率/额度受限）";
  return msg || "未知错误";
}

// 执行智能执行任务：失败/中断自动重试，最多 3 次；3 次仍失败则写明原因
export function useAutoRetryExecution(refresh) {
  const [busy, setBusy] = useState(false);
  const autoTried = useRef(new Set());

  const run = async (execId, { silent = false } = {}) => {
    setBusy(true);
    let lastReason = "";
    try {
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          await base44.functions.invoke("executeAutomation", { execution_id: execId, phase: "execute" });
          if (!silent) toast.success("心栈已经做好了，请验收");
          return true;
        } catch (e) {
          lastReason = reasonOf(e);
          if (/点数不足/.test(lastReason)) break;
          if (attempt < MAX_ATTEMPTS) {
            if (!silent) toast.info(`执行中断，正在自动重试（第 ${attempt + 1}/${MAX_ATTEMPTS} 次）`);
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

  // 中断状态的执行：每个卡片自动补跑一次（内部仍会重试 3 次）
  const autoRecover = (execId) => {
    if (autoTried.current.has(execId)) return;
    autoTried.current.add(execId);
    run(execId, { silent: true });
  };

  return { busy, run, autoRecover };
}