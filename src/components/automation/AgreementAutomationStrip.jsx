import React, { useState, useEffect } from "react";
import { useAutoRetryExecution } from "./useAutoRetryExecution";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Bot, Loader2, CheckCircle2, AlertCircle, KeyRound, Hand } from "lucide-react";
import { toast } from "sonner";
import { AUTOMATION_TYPES } from "./automationConfig";
import AgreementDeliveryDialog from "./AgreementDeliveryDialog";

// 约定卡片内嵌的「机器可兑现部分」：AI 直接预执行，用户看到的是「已完成，请验收」
export default function AgreementAutomationStrip({ task }) {
  const queryClient = useQueryClient();
  const [localBusy, setLocalBusy] = useState(false);
  const [reviewing, setReviewing] = useState(null);
  const refreshQ = () => queryClient.invalidateQueries({ queryKey: ["task-automations", task.id] });
  const { busy: runBusy, run: runExecution, autoRecover } = useAutoRetryExecution(refreshQ);
  const busy = localBusy || runBusy;
  const setBusy = setLocalBusy;

  const { data: allExecutions = [] } = useQuery({
    queryKey: ["task-automations", task.id],
    queryFn: () => base44.entities.TaskExecution.filter({ task_id: task.id }, "-created_date", 5),
    staleTime: 60 * 1000,
  });

  // 过滤掉「无可自动执行内容」的空记录（automation_type=none 且没有任何交付物）
  const executions = allExecutions.filter((ex) => {
    if (!ex.automation_type || ex.automation_type === "none") return false;
    // 已完成但没有任何交付物 → 点开也是空的，不展示
    if (ex.execution_status === "completed" && !ex.automation_result) return false;
    return true;
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["task-automations", task.id] });

  const acceptDelivery = async () => {
    if (!reviewing) return;
    setBusy(true);
    try {
      await base44.entities.TaskExecution.update(reviewing.id, {
        user_feedback: { rating: 5, comment: "验收通过", rated_at: new Date().toISOString() },
      });
      toast.success("已验收完成");
      setReviewing(null);
    } catch (e) {
      toast.error("验收失败，请稍后重试");
    } finally {
      setBusy(false);
      refresh();
    }
  };

  // 一步到底：解析约定 → 判断机器可做部分 → 需要权限就停下来问，否则直接做完
  const delegate = async () => {
    setBusy(true);
    try {
      const exec = await base44.entities.TaskExecution.create({
        task_id: task.id,
        task_title: task.title,
        execution_status: "parsing",
        original_input: [task.title, task.description].filter(Boolean).join("\n"),
      });
      const planRes = await base44.functions.invoke("executeAutomation", {
        execution_id: exec.id,
        phase: "plan",
      });
      const planned = planRes?.data?.execution;
      refresh();
      if (!planned || planned.automation_type === "none") {
        toast.info("这条约定需要你亲自来，心栈只负责守候提醒");
        return;
      }
      if (planned.requires_approval) {
        toast.info("心栈需要你先补充授权信息，之后立刻动手");
        return;
      }
      await runExecution(exec.id);
    } catch (e) {
      toast.error(e?.response?.data?.error || "交给心栈失败，请稍后重试");
      refresh();
    } finally {
      setBusy(false);
    }
  };

  if (executions.length === 0) {
    if (task.status === "completed") return null;
    return (
      <div className="mt-3 pt-3 border-t border-stone-100">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); delegate(); }}
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-[#6B8E23]/8 border border-[#6B8E23]/25 text-[11px] text-[#4d6619] hover:bg-[#6B8E23]/15 transition-colors disabled:opacity-60"
        >
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Bot className="w-3 h-3" />}
          {busy ? "心栈正在读这条约定并动手…" : "让心栈先把能做的做掉"}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3 pt-3 border-t border-stone-100 space-y-1.5">
      <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-0.5">
        智能执行
      </div>
      {executions.map((ex) => (
        <ExecutionRow
          key={ex.id}
          ex={ex}
          busy={busy}
          onRun={() => runExecution(ex.id)}
          onAutoRecover={() => autoRecover(ex.id)}
          onReview={() => setReviewing(ex)}
        />
      ))}

      <AgreementDeliveryDialog
        open={!!reviewing}
        onOpenChange={(v) => !v && setReviewing(null)}
        execution={reviewing}
        onAccept={acceptDelivery}
        accepting={busy}
      />
    </div>
  );
}

function ExecutionRow({ ex, busy, onRun, onReview, onAutoRecover }) {
  const cfg = AUTOMATION_TYPES[ex.automation_type];
  const typeLabel = cfg ? `${cfg.emoji} ${cfg.label}` : "自动执行";
  const inFlight = ex.execution_status === "executing" || ex.execution_status === "parsing";
  // 后台执行被中断（超时/重启）时状态会永远停在「进行中」，超过 10 分钟即视为中断，给出重试出口
  const lastTouch = new Date(ex.updated_date || ex.created_date || 0).getTime();
  const stalled = inFlight && Date.now() - lastTouch > 10 * 60 * 1000;
  const running = (busy || inFlight) && !stalled;
  const deliverable = ex.automation_plan?.description || "";
  const need = ex.automation_plan?.risk_warning || "";

  // 执行被中断（卡在进行中）→ 自动补跑，内部最多重试 3 次
  useEffect(() => {
    if (stalled && !busy) onAutoRecover?.();
  }, [stalled]);

  if (running) {
    return (
      <Row cls="bg-sky-50 text-sky-700 border-sky-200" Icon={Loader2} spin
        text={`${typeLabel} · 心栈正在做${deliverable ? `：${deliverable}` : "…"}`} />
    );
  }

  if (stalled) {
    return (
      <Row cls="bg-amber-50 text-amber-800 border-amber-200" Icon={AlertCircle}
        text={`${typeLabel} · 上次执行中断了，心栈正在自动重试（最多 3 次）`}
        action={{ label: "立即重试", onClick: onRun }} />
    );
  }

  if (ex.execution_status === "completed") {
    if (ex.user_feedback?.rated_at) {
      return (
        <Row cls="bg-emerald-50 text-emerald-800 border-emerald-200" Icon={CheckCircle2}
          text={`${typeLabel} · 完成${deliverable ? `：${deliverable}` : ""}`}
          action={{ label: "查看", onClick: onReview }} />
      );
    }
    return (
      <Row cls="bg-emerald-50 text-emerald-800 border-emerald-200" Icon={CheckCircle2}
        text={`${typeLabel} · 已完成，请验收${deliverable ? `：${deliverable}` : ""}`}
        action={{ label: "验收", onClick: onReview }} />
    );
  }

  if (ex.execution_status === "cancelled") {
    return (
      <Row cls="bg-stone-50 text-stone-500 border-stone-200" Icon={Hand}
        text={ex.error_message || "这部分需要你亲自完成"} />
    );
  }

  if (ex.execution_status === "waiting_confirm") {
    return (
      <Row cls="bg-amber-50 text-amber-800 border-amber-200" Icon={KeyRound}
        text={`${typeLabel} · ${need || "需要你确认后心栈才动手"}`}
        action={{ label: "授权并执行", onClick: onRun }} />
    );
  }

  if (ex.execution_status === "failed") {
    return (
      <Row cls="bg-red-50 text-red-700 border-red-200" Icon={AlertCircle}
        text={`${typeLabel} · 执行失败${ex.error_message ? `：${ex.error_message.slice(0, 90)}` : ""}`}
        action={{ label: "重试", onClick: onRun }} />
    );
  }

  return (
    <Row cls="bg-[#6B8E23]/10 text-[#4d6619] border-[#6B8E23]/30" Icon={Bot}
      text={`${typeLabel} · ${deliverable || "可执行"}`}
      action={{ label: "现在做", onClick: onRun }} />
  );
}

function Row({ cls, Icon, text, spin, action }) {
  return (
    <div className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl border text-[11px] ${cls}`}>
      <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${spin ? "animate-spin" : ""}`} />
      <span className="truncate flex-1">{text}</span>
      {action && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); action.onClick(); }}
          className="px-2 py-0.5 rounded-full bg-white/80 border border-black/10 hover:bg-white transition-colors flex-shrink-0"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}