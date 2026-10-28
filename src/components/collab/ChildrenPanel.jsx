// 子约定面板：全部/待处理/已完成胶囊过滤（>4 折叠）+ 草案确认
import React, { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ChevronDown, ChevronUp, Circle, Clock3, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { httpRequest } from "@/api/httpClient";
import { isTaskEffectivelyCompleted } from "@/lib/taskStatus";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { C, formatTime } from "./constants";
import { MemberAvatar, PanelHeader } from "./Common";

const subStatusMeta = (sub, done) => {
  if (done) return { label: "已完成", className: "bg-[#edf0ea] text-[#4c5b48]" };
  if (sub.metadata?.collab?.state === "draft") return { label: "草案待确认", className: "bg-[#fff0d5] text-[#7b4500]" };
  return { label: "进行中", className: "bg-[#e4e6f8] text-[#2a2861]" };
};

function ChildRow({ sub, members, currentUserId, confirmingId, togglingId, onConfirm, onToggleDone, onJumpToDiscussion }) {
  const done = isTaskEffectivelyCompleted(sub);
  const subCollab = sub.metadata?.collab;
  const isDraft = subCollab?.state === "draft";
  const confirmedCount = Array.isArray(subCollab?.confirmedBy) ? subCollab.confirmedBy.length : 0;
  const alreadyConfirmed = currentUserId && Array.isArray(subCollab?.confirmedBy) && subCollab.confirmedBy.includes(currentUserId);
  const assigneeId = subCollab?.assignee;
  const assignee = assigneeId ? members.find((m) => m.user_id === assigneeId || m.id === assigneeId) : null;
  const isAgentDraft = !!subCollab?.sourceCommentId;
  const meta = subStatusMeta(sub, done);
  const busy = confirmingId === sub.id || togglingId === sub.id;

  return (
    <article className="border-b py-4 last:border-b-0" style={{ borderColor: "#dfddd6" }} aria-label={`子约定 ${sub.title}`}>
      <div className="flex items-start gap-3">
        {/* 勾选：草案=确认；进行中=标记完成/重新打开 */}
        <button
          type="button"
          onClick={() => (isDraft ? onConfirm(sub) : onToggleDone(sub))}
          disabled={busy}
          className="mt-0.5 shrink-0 rounded-full transition-opacity disabled:opacity-50 min-h-7 min-w-7 focus-visible:outline-none"
          aria-label={isDraft ? "确认子约定" : done ? "标记为未完成" : "标记完成"}
          title={isDraft ? "确认子约定" : done ? "重新打开" : "标记完成"}
        >
          {done
            ? <CheckCircle2 className="h-[18px] w-[18px]" style={{ color: C.green }} />
            : <Circle className="h-[18px] w-[18px]" strokeWidth={1.5} style={{ color: isDraft ? C.amberInk : "#aaa69e" }} />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium leading-none", meta.className)}>
              {meta.label}
            </span>
            {isAgentDraft && (
              <span className="flex items-center gap-0.5 text-[10px] font-medium" style={{ color: "#384877" }}>
                <Sparkles className="h-3 w-3" /> Agent 草案
              </span>
            )}
            {isAgentDraft && (
              <button
                onClick={() => onJumpToDiscussion?.(subCollab.sourceCommentId)}
                className="text-[10px] text-[#8a867e] hover:text-[#384877] hover:underline underline-offset-2"
              >
                来源讨论
              </button>
            )}
          </div>
          <h3 className={cn("mt-2 text-sm font-semibold leading-6", done ? "text-[#7d7972] line-through" : "")} style={done ? undefined : { color: "#35312f" }}>
            {sub.title}
          </h3>
          {subCollab?.standard && (
            <p className="mt-1 text-xs leading-5" style={{ color: "#716e68" }}>
              <span className="font-medium" style={{ color: "#57534d" }}>完成标准：</span>{subCollab.standard}
            </p>
          )}
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px]" style={{ color: "#77736c" }}>
              {assignee && (
                <span className="flex items-center gap-1.5">
                  <MemberAvatar name={assignee.display_name} seed={assignee.user_id || assignee.id} size="sm" className="border-[#faf9f5]" />
                  {assignee.display_name}
                </span>
              )}
              {sub.reminder_time && (
                <span className="flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />{formatTime(sub.reminder_time)}</span>
              )}
              {isDraft && (
                <span style={{ color: C.amberInk }}>
                  {alreadyConfirmed ? "已确认" : "待确认"} · {confirmedCount}/{members.length || 1}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

export default function ChildrenPanel({ summary, taskId, currentUserId, onJumpToDiscussion }) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState(false);
  const [newSubTitle, setNewSubTitle] = useState("");
  const [addingSub, setAddingSub] = useState(false);
  const [confirmingId, setConfirmingId] = useState(null);
  const [togglingId, setTogglingId] = useState(null);

  const task = summary?.task;
  const members = summary?.members || [];
  const subtasks = useMemo(() => {
    const out = [];
    const walk = (list) => { for (const n of list || []) { out.push(n); walk(n.children); } };
    walk(summary?.subtasks);
    return out;
  }, [summary?.subtasks]);

  useEffect(() => { setFilter("all"); setExpanded(false); }, [taskId]);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['collab', taskId] });
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
  };

  const filtered = subtasks.filter((sub) => {
    const done = isTaskEffectivelyCompleted(sub);
    if (filter === "attention") return !done;
    if (filter === "done") return done;
    return true;
  });
  const visible = expanded ? filtered : filtered.slice(0, 4);

  const handleAddSubtask = async () => {
    const title = newSubTitle.trim();
    if (!title) return;
    setAddingSub(true);
    try {
      await httpRequest("/api/tasks", {
        method: "POST",
        body: {
          title,
          parent_task_id: taskId,
          status: "pending",
          priority: "medium",
          category: task?.category || "collab",
          metadata: {
            collab: {
              state: "active",
              standard: "",
              assignee: null,
              confirmedBy: currentUserId ? [currentUserId] : [],
              sourceCommentId: null,
            },
          },
        },
      });
      setNewSubTitle("");
      invalidateAll();
      toast.success("子约定已添加");
    } catch (error) {
      toast.error(error?.message || "添加失败");
    } finally {
      setAddingSub(false);
    }
  };

  const handleConfirm = async (subtask) => {
    setConfirmingId(subtask.id);
    try {
      const res = await httpRequest(`/api/collab/${taskId}/subtasks/${subtask.id}/confirm`, { method: "POST" });
      if (res?.state === "active") toast.success(`子约定「${subtask.title}」已确认生效`);
      else toast.info(`已确认，还差 ${res?.pending_confirm_users?.length ?? 0} 位成员确认`);
      invalidateAll();
    } catch (error) {
      toast.error(error?.message || "确认失败");
    } finally {
      setConfirmingId(null);
    }
  };

  // 勾选完成/重新打开：与全站任务卡片同一口径（PATCH status + completed_at）
  const handleToggleDone = async (subtask) => {
    const done = isTaskEffectivelyCompleted(subtask);
    setTogglingId(subtask.id);
    try {
      await httpRequest(`/api/tasks/${subtask.id}`, {
        method: "PATCH",
        body: {
          status: done ? "pending" : "completed",
          completed_at: done ? null : new Date().toISOString(),
        },
      });
      invalidateAll();
      toast.success(done ? "已重新打开" : "已完成该子约定");
    } catch (error) {
      toast.error(error?.message || "操作失败");
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <section id="content-children" className="border-b px-4 py-5 sm:px-6" style={{ borderColor: C.line }}>
      <PanelHeader
        eyebrow="Agreements"
        title={`子约定 · ${subtasks.length}`}
        description="完成内容、负责人和确认状态都集中在这里。"
      />
      <div className="mt-3 flex flex-wrap gap-1.5">
        {([["all", "全部"], ["attention", "待处理"], ["done", "已完成"]]).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => { setFilter(id); setExpanded(false); }}
            className={cn(
              "rounded-full px-3 text-[11px] font-medium transition-colors min-h-8 focus-visible:outline-none",
              filter === id ? "text-[#faf9f5]" : "hover:bg-[#e7e6e0]"
            )}
            style={filter === id ? { backgroundColor: C.ink } : { color: "#77736c" }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-1">
        {visible.length === 0 && (
          <p className="py-6 text-center text-xs italic" style={{ color: "#99958d" }}>
            {filter === "all" ? "还没有子约定：在讨论里「转为子约定」，或在下方添加" : "该筛选下暂无子约定"}
          </p>
        )}
        {visible.map((sub) => (
          <ChildRow
            key={sub.id}
            sub={sub}
            members={members}
            currentUserId={currentUserId}
            confirmingId={confirmingId}
            togglingId={togglingId}
            onConfirm={handleConfirm}
            onToggleDone={handleToggleDone}
            onJumpToDiscussion={onJumpToDiscussion}
          />
        ))}
      </div>

      {filtered.length > 4 && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="mt-2 flex w-full items-center justify-center gap-1.5 border-t pt-2 text-xs font-medium transition-colors min-h-8 focus-visible:outline-none"
          style={{ borderColor: "#dfddd6", color: "#6d6962" }}
        >
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          {expanded ? "收起列表" : `展开其余 ${filtered.length - 4} 项`}
        </button>
      )}

      {/* 行内添加普通子约定 */}
      <div className="mt-3 flex items-center gap-2">
        <Plus className="h-4 w-4 shrink-0" style={{ color: "#99958d" }} />
        <Input
          value={newSubTitle}
          onChange={(e) => setNewSubTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleAddSubtask(); }}
          placeholder="添加子约定，回车保存"
          className="h-8 text-xs border-dashed"
        />
        <Button
          size="sm"
          variant="outline"
          onClick={handleAddSubtask}
          disabled={addingSub || !newSubTitle.trim()}
          className="h-8 text-xs flex-shrink-0"
        >
          {addingSub ? "添加中…" : "添加"}
        </Button>
      </div>
    </section>
  );
}
