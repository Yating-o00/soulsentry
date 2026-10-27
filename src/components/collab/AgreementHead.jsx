// 共创空间头卡：返回 + 场景/状态/Agent 徽标 + 标题与共同目标 + 成员行（成员 Avatar 叠放嵌入 AgentAvatar）+ 执行进度统计
import React, { useMemo } from "react";
import { ArrowLeft, Bot, Sparkles } from "lucide-react";
import { SCENARIO_LABELS } from "@/components/tasks/CollabTaskCard";
import { isTaskEffectivelyCompleted } from "@/lib/taskStatus";
import { C, formatTime } from "./constants";
import { AgentAvatar, MemberAvatar } from "./Common";

export default function AgreementHead({ task, summary, isLoading, onBack, onOpenInvite }) {
  const collab = task?.metadata?.collab;
  const members = summary?.members || [];
  const nodes = summary?.nodes || [];
  const agentEnabled = !!collab?.agent?.enabled;
  const agentPaused = !!collab?.agent?.paused;

  const subtasks = useMemo(() => {
    const out = [];
    const walk = (list) => { for (const n of list || []) { out.push(n); walk(n.children); } };
    walk(summary?.subtasks);
    return out;
  }, [summary?.subtasks]);

  const done = subtasks.filter((s) => isTaskEffectivelyCompleted(s)).length;
  const pendingConfirms = subtasks.filter((s) => s.metadata?.collab?.state === "draft").length;
  const nextNode = nodes.find((n) => !n.done_at);
  const progress = subtasks.length ? Math.round((done / subtasks.length) * 100) : 0;

  return (
    <section className="border-b px-4 py-5 sm:px-6 sm:py-6" style={{ borderColor: "#d5d3cc", backgroundColor: C.head }}>
      {/* 第一行：返回 + 徽标 */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={onBack}
          className="flex h-9 w-9 items-center justify-center rounded-full border transition-colors hover:text-[#384877] hover:border-[#c7d2fe] focus-visible:outline-none"
          style={{ borderColor: "#d8d6cf", color: "#625e58" }}
          title="返回约定列表"
          aria-label="返回约定列表"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        {collab && (
          <span className="rounded-full px-2.5 py-1 text-[11px] font-medium" style={{ backgroundColor: "#e9e8e2", color: "#5d5953" }}>
            {SCENARIO_LABELS[collab.scenario] || SCENARIO_LABELS.custom}
          </span>
        )}
        <span className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium" style={{ backgroundColor: C.greenBg, color: C.greenInk }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: C.green }} />
          共创中
        </span>
        {agentEnabled && (
          agentPaused ? (
            <span className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium" style={{ backgroundColor: "#e9e8e2", color: "#8a867e" }}>
              <Bot className="h-3 w-3" /> Agent 已暂停
            </span>
          ) : (
            <span className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium" style={{ backgroundColor: "#e4e6f8", color: "#2a2861" }}>
              <Sparkles className="h-3 w-3" /> Agent 参与中
            </span>
          )
        )}
        <span className="ml-auto font-mono text-[9px] uppercase tracking-[0.16em] hidden sm:block" style={{ color: C.faint }}>
          每 15 秒自动同步
        </span>
      </div>

      {/* 标题 + 共同目标 */}
      <h1 className="mt-4 text-[24px] font-semibold leading-[1.35] tracking-[-0.03em] sm:text-[28px]" style={{ color: "#282423" }}>
        {isLoading ? "加载中…" : task?.title || "共创空间"}
      </h1>
      <p className="mt-2 max-w-2xl text-sm leading-6" style={{ color: "#69665f" }}>
        {collab?.goal || "围绕这个共同目标，把讨论落成约定、节点与沉淀。"}
      </p>

      {/* 成员行：成员头像叠放 + Agent 头像，点击管理邀请 */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onOpenInvite}
          className="group flex min-h-12 items-center gap-3 rounded-full py-1 pr-3 text-left transition-colors hover:bg-[#efeee8] focus-visible:outline-none"
          aria-label="管理成员与 Agent"
        >
          <span className="flex -space-x-2">
            {members.slice(0, 4).map((m) => (
              <MemberAvatar key={m.user_id || m.id} name={m.display_name} seed={m.user_id || m.id} size="md" className="border-[#faf9f5]" />
            ))}
            {members.length > 4 && (
              <span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-[#faf9f5] bg-[#e9e8e2] text-[11px] font-medium" style={{ color: "#5d5953" }}>
                +{members.length - 4}
              </span>
            )}
            {agentEnabled && <AgentAvatar size="md" className="border-2 border-[#faf9f5]" />}
          </span>
          <span className="text-xs">
            <span className="block font-medium" style={{ color: "#45413d" }}>
              {members.length} 位成员 · {agentEnabled ? 1 : 0} 个 Agent
            </span>
            <span className="mt-0.5 block" style={{ color: "#716e68" }}>管理与邀请</span>
          </span>
        </button>
      </div>

      {/* 执行进度 + 三统计 */}
      <div className="mt-5 border-t pt-4" style={{ borderColor: "#deddd7" }}>
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium" style={{ color: "#57534d" }}>执行进度</span>
          <span className="font-mono text-sm font-semibold" style={{ color: C.ink }}>{progress}%</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: "#deddd7" }} role="progressbar" aria-label="子约定执行进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
          <div className="h-full rounded-full transition-[width] duration-200" style={{ width: `${progress}%`, backgroundColor: "#384877" }} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div>
            <div className="font-mono text-[9px] uppercase tracking-[0.12em]" style={{ color: C.faint }}>已完成</div>
            <div className="mt-1 text-xs font-semibold" style={{ color: "#45413d" }}>{done}/{subtasks.length} 项子约定</div>
          </div>
          <div>
            <div className="font-mono text-[9px] uppercase tracking-[0.12em]" style={{ color: C.faint }}>等待确认</div>
            <div className="mt-1 text-xs font-semibold" style={{ color: pendingConfirms > 0 ? C.amberInk : "#45413d" }}>
              {pendingConfirms} 项由成员决定
            </div>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <div className="font-mono text-[9px] uppercase tracking-[0.12em]" style={{ color: C.faint }}>下一节点</div>
            <div className="mt-1 truncate text-xs font-semibold" style={{ color: "#45413d" }}>
              {nextNode ? `${nextNode.title}${nextNode.due_at ? ` · ${formatTime(nextNode.due_at)}` : ""}` : "未设置"}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
