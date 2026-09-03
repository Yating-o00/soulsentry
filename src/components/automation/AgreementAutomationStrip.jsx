import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { Bot, Loader2, Play, CheckCircle2, AlertCircle, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { AUTOMATION_TYPES } from "./automationConfig";

const STATE = {
  parsing: { label: "正在理解", cls: "bg-slate-50 text-slate-600 border-slate-200", Icon: Loader2 },
  pending: { label: "可执行", cls: "bg-[#6B8E23]/10 text-[#4d6619] border-[#6B8E23]/30", Icon: Play },
  waiting_confirm: { label: "等你确认", cls: "bg-amber-50 text-amber-700 border-amber-200", Icon: AlertCircle },
  executing: { label: "心栈正在做", cls: "bg-sky-50 text-sky-700 border-sky-200", Icon: Loader2 },
  completed: { label: "已完成，请验收", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", Icon: CheckCircle2 },
  failed: { label: "执行失败", cls: "bg-red-50 text-red-700 border-red-200", Icon: AlertCircle },
  cancelled: { label: "已取消", cls: "bg-slate-50 text-slate-500 border-slate-200", Icon: AlertCircle },
};

// 约定卡片内嵌的「自动执行」条：让机器可做的那部分在约定里可见、可执行、可验收
export default function AgreementAutomationStrip({ task }) {
  const queryClient = useQueryClient();
  const [busyId, setBusyId] = useState(null);
  const [creating, setCreating] = useState(false);

  const { data: executions = [] } = useQuery({
    queryKey: ["task-automations", task.id],
    queryFn: () => base44.entities.TaskExecution.filter({ task_id: task.id }, "-created_date", 5),
    staleTime: 60 * 1000,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["task-automations", task.id] });

  const runExecution = async (execId) => {
    setBusyId(execId);
    try {
      await base44.functions.invoke("executeAutomation", { execution_id: execId, phase: "execute" });
      toast.success("心栈已做完，去验收产物吧");
      refresh();
    } catch (e) {
      toast.error(e?.response?.data?.error || "执行失败，请稍后重试");
      refresh();
    } finally {
      setBusyId(null);
    }
  };

  const delegate = async () => {
    setCreating(true);
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
      if (planned?.automation_type === "none") {
        toast.info("这条约定需要你亲自来，心栈只负责提醒");
        return;
      }
      if (planned?.requires_approval) {
        toast.info("方案已就绪，确认后心栈才动手");
        return;
      }
      await runExecution(exec.id);
    } catch (e) {
      toast.error(e?.response?.data?.error || "交给心栈失败，请稍后重试");
    } finally {
      setCreating(false);
    }
  };

  if (executions.length === 0) {
    if (task.status === "completed") return null;
    return (
      <div className="mt-3 pt-3 border-t border-stone-100">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            delegate();
          }}
          disabled={creating}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-[#6B8E23]/8 border border-[#6B8E23]/25 text-[11px] text-[#4d6619] hover:bg-[#6B8E23]/15 transition-colors disabled:opacity-60"
        >
          {creating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Bot className="w-3 h-3" />}
          {creating ? "心栈正在拆解这条约定…" : "让心栈做掉能自动做的部分"}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3 pt-3 border-t border-stone-100 space-y-1.5">
      <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-0.5">
        自动执行 · 机器可做的部分
      </div>
      {executions.map((ex) => {
        const st = STATE[ex.execution_status] || STATE.pending;
        const cfg = AUTOMATION_TYPES[ex.automation_type];
        const running = busyId === ex.id || ex.execution_status === "executing";
        const canRun = ["pending", "waiting_confirm", "failed"].includes(ex.execution_status);
        return (
          <div
            key={ex.id}
            className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl border text-[11px] ${st.cls}`}
          >
            <st.Icon className={`w-3.5 h-3.5 flex-shrink-0 ${running ? "animate-spin" : ""}`} />
            <span className="truncate flex-1">
              {cfg ? `${cfg.emoji} ${cfg.label}` : "自动执行"} · {running ? "心栈正在做" : st.label}
              {ex.execution_status === "failed" && ex.error_message ? `：${ex.error_message.slice(0, 40)}` : ""}
            </span>
            {ex.execution_status === "completed" ? (
              <Link
                to="/Notifications"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/80 border border-emerald-200 text-emerald-700 hover:bg-white transition-colors flex-shrink-0"
              >
                验收产物 <ArrowRight className="w-3 h-3" />
              </Link>
            ) : canRun ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  runExecution(ex.id);
                }}
                disabled={running}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/80 border border-black/10 hover:bg-white transition-colors flex-shrink-0 disabled:opacity-60"
              >
                <Play className="w-3 h-3" />
                {ex.execution_status === "failed" ? "重试" : ex.execution_status === "waiting_confirm" ? "确认执行" : "执行"}
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}