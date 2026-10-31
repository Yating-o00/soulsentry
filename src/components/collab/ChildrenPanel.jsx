// 子约定面板：全部/待处理/已完成胶囊过滤（>4 折叠）+ 草案确认 + 拖动挂载合并同类项
import React, { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ChevronDown, ChevronUp, Circle, Clock3, GripVertical, Plus, Sparkles } from "lucide-react";
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
  const collab = sub.metadata?.collab;
  if (collab?.state === "draft") {
    if (Array.isArray(collab.rejectedBy) && collab.rejectedBy.length > 0) {
      return { label: "已被勾掉", className: "bg-rose-50 text-rose-700" };
    }
    return { label: "草案待确认", className: "bg-[#fff0d5] text-[#7b4500]" };
  }
  return { label: "进行中", className: "bg-[#e4e6f8] text-[#2a2861]" };
};

function ChildRow({
  sub, depth, members, currentUserId, confirmingId, togglingId, rejectingId,
  isDragging, isDropTarget, descendantIds,
  onConfirm, onReject, onToggleDone, onJumpToDiscussion,
  onRowDragStart, onRowDragEnd, onRowDragOver, onRowDrop
}) {
  const done = isTaskEffectivelyCompleted(sub);
  const subCollab = sub.metadata?.collab;
  const isDraft = subCollab?.state === "draft";
  const confirmedCount = Array.isArray(subCollab?.confirmedBy) ? subCollab.confirmedBy.length : 0;
  const rejectedBy = Array.isArray(subCollab?.rejectedBy) ? subCollab.rejectedBy : [];
  const rejectedCount = rejectedBy.length;
  const rejected = isDraft && rejectedCount > 0;
  const rejectedNames = rejectedBy
    .map((id) => members.find((m) => m.user_id === id)?.display_name || members.find((m) => m.id === id)?.display_name)
    .map((name) => name || "成员");
  const iRejected = currentUserId && rejectedBy.includes(currentUserId);
  const alreadyConfirmed = currentUserId && Array.isArray(subCollab?.confirmedBy) && subCollab.confirmedBy.includes(currentUserId);
  const assigneeId = subCollab?.assignee;
  const assignee = assigneeId ? members.find((m) => m.user_id === assigneeId || m.id === assigneeId) : null;
  const isAgentDraft = !!subCollab?.sourceCommentId;
  const autoDone = done && !!subCollab?.autoCompleted;
  const meta = subStatusMeta(sub, done);
  const busy = confirmingId === sub.id || togglingId === sub.id || rejectingId === sub.id;
  const droppable = !isDragging && !descendantIds.has(sub.id);

  return (
    <article
      aria-label={`子约定 ${sub.title}`}
      draggable
      onDragStart={(e) => onRowDragStart(e, sub)}
      onDragEnd={onRowDragEnd}
      onDragOver={(e) => onRowDragOver(e, sub, droppable)}
      onDrop={(e) => onRowDrop(e, sub)}
      className={cn(
        "group border-b py-4 transition-colors last:border-b-0",
        isDragging ? "opacity-40" : "",
        isDropTarget ? "rounded-md bg-[#efeee8] shadow-[inset_0_0_0_1.5px_#38487755]" : ""
      )}
      style={{
        borderColor: "#dfddd6",
        marginLeft: depth * 18,
        ...(depth > 0 ? { borderLeft: "2px solid #ecebe5", paddingLeft: 12 } : {})
      }}
    >
      <div className="flex items-start gap-2">
        {/* 拖动把手：拖到其他子约定上=挂载为其从属 */}
        <GripVertical
          className="mt-1 h-4 w-4 shrink-0 cursor-grab opacity-0 transition-opacity active:cursor-grabbing group-hover:opacity-60"
          style={{ color: "#b8b4ab" }}
          aria-hidden="true"
        />
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
            {autoDone && (
              <span className="flex items-center gap-0.5 text-[10px] font-medium" style={{ color: "#384877" }} title={subCollab?.autoCompletedReason || "心栈根据讨论共识自动完成"}>
                <Sparkles className="h-3 w-3" /> 心栈确定完成
              </span>
            )}
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
            {isDraft && !iRejected && (
              <button
                onClick={() => onReject(sub)}
                disabled={busy}
                className="text-[10px] text-[#b3443c] hover:underline underline-offset-2 disabled:opacity-50"
                title="不同意该草案：勾掉后它不会生效，可随时恢复"
              >
                勾掉
              </button>
            )}
            {isDraft && iRejected && (
              <button
                onClick={() => onConfirm(sub)}
                disabled={busy}
                className="text-[10px] font-medium text-[#384877] hover:underline underline-offset-2 disabled:opacity-50"
                title="撤回勾掉，重新参与确认"
              >
                已勾掉 · 点击恢复
              </button>
            )}
          </div>
          <h3 className={cn("mt-2 text-sm font-semibold leading-6", (done || rejected) ? "text-[#7d7972] line-through" : "")} style={(done || rejected) ? undefined : { color: "#35312f" }}>
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
                <span style={{ color: rejectedCount > 0 ? "#b3443c" : C.amberInk }}>
                  {rejectedCount > 0 ? `被 ${rejectedNames.join("、")} 勾掉 · ` : ""}{alreadyConfirmed ? "已确认" : iRejected ? "已勾掉" : "待确认"} · {confirmedCount}/{members.length || 1}
                </span>
              )}
              {isDraft && subCollab?.reminder && (
                <span style={{ color: "#8a867e" }}>已提醒待确认成员</span>
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
  const [rejectingId, setRejectingId] = useState(null);
  const [togglingId, setTogglingId] = useState(null);
  const [draggingId, setDraggingId] = useState(null);
  const [dropHintId, setDropHintId] = useState(null); // "root" 或某个子约定 id
  const [reparenting, setReparenting] = useState(false);

  const task = summary?.task;
  const members = summary?.members || [];
  // 扁平化（带层级深度），保留树用于从属关系判断
  const subtasks = useMemo(() => {
    const out = [];
    const walk = (list, depth) => {
      for (const n of list || []) {
        out.push({ node: n, depth });
        walk(n.children || [], depth + 1);
      }
    };
    walk(summary?.subtasks, 0);
    return out;
  }, [summary?.subtasks]);

  const childIdMap = useMemo(() => {
    const map = new Map();
    const walk = (list) => {
      for (const n of list || []) {
        map.set(n.id, (n.children || []).map((c) => c.id));
        walk(n.children);
      }
    };
    walk(summary?.subtasks);
    return map;
  }, [summary?.subtasks]);

  const descendantsOf = (id) => {
    const out = new Set();
    const stack = [...(childIdMap.get(id) || [])];
    while (stack.length > 0) {
      const cur = stack.pop();
      if (out.has(cur)) continue;
      out.add(cur);
      stack.push(...(childIdMap.get(cur) || []));
    }
    return out;
  };

  useEffect(() => { setFilter("all"); setExpanded(false); }, [taskId]);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['collab', taskId] });
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
  };

  const filtered = subtasks.filter(({ node: sub }) => {
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

  // 勾掉草案：表达不同意，阻止生效（再点「恢复勾选」即撤回）
  const handleReject = async (subtask) => {
    setRejectingId(subtask.id);
    try {
      await httpRequest(`/api/collab/${taskId}/subtasks/${subtask.id}/reject`, { method: "POST" });
      invalidateAll();
      toast.success(`已勾掉「${subtask.title}」，该草案不会生效`);
    } catch (error) {
      toast.error(error?.message || "操作失败");
    } finally {
      setRejectingId(null);
    }
  };

  // 勾选完成/重新打开：与全站任务卡片同一口径（PATCH status + completed_at）
  // 人工操作会覆盖「心栈确定完成」标记（清掉 metadata.collab.autoCompleted）
  const handleToggleDone = async (subtask) => {
    const done = isTaskEffectivelyCompleted(subtask);
    setTogglingId(subtask.id);
    const collabMeta = subtask.metadata?.collab;
    const body = {
      status: done ? "pending" : "completed",
      completed_at: done ? null : new Date().toISOString(),
    };
    if (collabMeta?.autoCompleted) {
      body.metadata = {
        ...subtask.metadata,
        collab: { ...collabMeta, autoCompleted: false, autoCompletedAt: null, autoCompletedReason: "" },
      };
    }
    try {
      await httpRequest(`/api/tasks/${subtask.id}`, { method: "PATCH", body });
      invalidateAll();
      toast.success(done ? "已重新打开" : "已完成该子约定");
    } catch (error) {
      toast.error(error?.message || "操作失败");
    } finally {
      setTogglingId(null);
    }
  };

  // ── 拖动挂载：把子约定挂到其他子约定下（合并同类项），或拖回顶层 ──
  const handleReparent = async (subId, parentId) => {
    if (reparenting) return;
    setReparenting(true);
    try {
      const res = await httpRequest(`/api/collab/${taskId}/subtasks/${subId}/reparent`, {
        method: "PATCH",
        body: { parent_id: parentId },
      });
      invalidateAll();
      if (res?.moved) {
        const targetTitle = parentId ? subtasks.find((s) => s.node.id === parentId)?.node?.title : null;
        toast.success(parentId ? `已挂载到「${targetTitle}」下` : "已移回顶层");
      }
    } catch (error) {
      toast.error(error?.message || "挂载失败");
    } finally {
      setReparenting(false);
      setDraggingId(null);
      setDropHintId(null);
    }
  };

  const handleRowDragStart = (e, sub) => {
    e.dataTransfer.setData("text/plain", sub.id);
    e.dataTransfer.effectAllowed = "move";
    setDraggingId(sub.id);
  };
  const handleRowDragEnd = () => { setDraggingId(null); setDropHintId(null); };
  const handleRowDragOver = (e, sub, droppable) => {
    if (!draggingId || draggingId === sub.id || !droppable) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropHintId((prev) => (prev === sub.id ? prev : sub.id));
  };
  const handleRowDrop = (e, sub) => {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData("text/plain") || draggingId;
    if (draggedId && draggedId !== sub.id) {
      void handleReparent(draggedId, sub.id);
    } else {
      setDraggingId(null);
      setDropHintId(null);
    }
  };

  return (
    <section id="content-children" className="border-b px-4 py-5 sm:px-6" style={{ borderColor: C.line }}>
      <PanelHeader
        eyebrow="Agreements"
        title={`子约定 · ${subtasks.length}`}
        description="完成内容、负责人和确认状态都集中在这里；拖动可把同类项挂载到一起。"
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

      {/* 拖动中的回到顶层放置区 */}
      {draggingId && (
        <div
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDropHintId((prev) => (prev === "root" ? prev : "root")); }}
          onDragLeave={() => setDropHintId((prev) => (prev === "root" ? null : prev))}
          onDrop={(e) => {
            e.preventDefault();
            const draggedId = e.dataTransfer.getData("text/plain") || draggingId;
            if (draggedId) void handleReparent(draggedId, null);
          }}
          className={cn(
            "mt-2 flex items-center justify-center gap-1.5 rounded-md border border-dashed py-2 text-[11px] font-medium transition-colors",
            dropHintId === "root" ? "bg-[#e4e6f8] text-[#2a2861]" : "text-[#8a867e]"
          )}
          style={dropHintId === "root" ? { borderColor: "#384877" } : { borderColor: "#cfcdc6" }}
        >
          <GripVertical className="h-3.5 w-3.5" /> 拖到此处移回顶层
        </div>
      )}

      <div className="mt-1">
        {visible.length === 0 && (
          <p className="py-6 text-center text-xs italic" style={{ color: "#99958d" }}>
            {filter === "all" ? "还没有子约定：在讨论里「转为子约定」，或在下方添加" : "该筛选下暂无子约定"}
          </p>
        )}
        {visible.map(({ node: sub, depth }) => (
          <ChildRow
            key={sub.id}
            sub={sub}
            depth={depth}
            members={members}
            currentUserId={currentUserId}
            confirmingId={confirmingId}
            togglingId={togglingId}
            rejectingId={rejectingId}
            isDragging={draggingId === sub.id}
            isDropTarget={dropHintId === sub.id}
            descendantIds={draggingId ? descendantsOf(draggingId) : new Set()}
            onConfirm={handleConfirm}
            onReject={handleReject}
            onToggleDone={handleToggleDone}
            onJumpToDiscussion={onJumpToDiscussion}
            onRowDragStart={handleRowDragStart}
            onRowDragEnd={handleRowDragEnd}
            onRowDragOver={handleRowDragOver}
            onRowDrop={handleRowDrop}
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
