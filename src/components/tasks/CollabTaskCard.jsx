// 协同约定卡片：概览/生活视图中的多人+Agent 约定卡片（点击进入共创空间，只读摘要，编辑一律进空间）
import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Check, ChevronRight, MessageSquare, Bot, Sparkles, AlertCircle, Pin } from "lucide-react";
import { cn } from "@/lib/utils";
import { httpRequest } from "@/api/httpClient";
import { toast } from "sonner";
import { isTaskEffectivelyCompleted } from "@/lib/taskStatus";
import CollabInviteDialog from "./CollabInviteDialog";

export const SCENARIO_LABELS = {
  couple: "情侣约定",
  friends: "朋友约定",
  colleagues: "同事约定",
  custom: "自定义约定",
};

const getInitials = (name) => {
  if (!name || typeof name !== "string") return "?";
  const trimmed = name.trim();
  if (!trimmed) return "?";
  if (/^[\u4e00-\u9fa5]/.test(trimmed)) return trimmed.slice(0, 1);
  const parts = trimmed.split(/\s+/).filter(Boolean);
  return parts.map((p) => p[0]).join("").toUpperCase().slice(0, 2) || "?";
};

const flattenTree = (nodes) => {
  const out = [];
  const walk = (list) => {
    for (const node of list || []) {
      out.push(node);
      walk(node.children);
    }
  };
  walk(nodes);
  return out;
};

// 文档内容摘要：取前几条非空行作为 bullet
const docBullets = (content, max = 3) =>
  String(content || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*•\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, max);

export default function CollabTaskCard({ task }) {
  const navigate = useNavigate();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [filter, setFilter] = useState("all"); // all | pending | done
  const collab = task?.metadata?.collab;

  const { data: summary } = useQuery({
    queryKey: ['collab-card', task.id],
    queryFn: () => httpRequest(`/api/collab/${task.id}/summary`),
    enabled: !!task?.id && !!collab,
    refetchInterval: 20000,
  });

  const members = summary?.members || [];
  const memberCount = members.length || 1;
  const subtasks = useMemo(() => flattenTree(summary?.subtasks), [summary?.subtasks]);
  const docs = summary?.docs || [];

  const consensusDoc = docs.find((d) => d.doc_type === "consensus");
  const disputeDoc = docs.find((d) => d.doc_type === "dispute");
  const consensusBullets = docBullets(consensusDoc?.content);
  const disputeBullets = docBullets(disputeDoc?.content);

  const filteredSubtasks = useMemo(() => {
    if (filter === "done") return subtasks.filter((s) => isTaskEffectivelyCompleted(s));
    if (filter === "pending") return subtasks.filter((s) => !isTaskEffectivelyCompleted(s));
    return subtasks;
  }, [subtasks, filter]);

  const agentActive = collab?.agent?.enabled && !collab?.agent?.paused;

  const openSpace = () => navigate(`/collabspace?taskId=${task.id}`);

  // 卡片上直接勾选/确认子约定（阻止冒泡到卡片跳转）
  const [togglingId, setTogglingId] = useState(null);
  const queryClient = useQueryClient();
  const handleToggleSub = async (e, sub) => {
    e.stopPropagation();
    if (togglingId === sub.id) return;
    const isDraft = sub.metadata?.collab?.state === "draft";
    const done = isTaskEffectivelyCompleted(sub);
    setTogglingId(sub.id);
    try {
      if (isDraft) {
        const res = await httpRequest(`/api/collab/${task.id}/subtasks/${sub.id}/confirm`, { method: "POST" });
        if (res?.state === "active") toast.success(`子约定「${sub.title}」已确认生效`);
        else toast.info(`已确认，还差 ${res?.pending_confirm_users?.length ?? 0} 位成员确认`);
      } else {
        await httpRequest(`/api/tasks/${sub.id}`, {
          method: "PATCH",
          body: { status: done ? "pending" : "completed", completed_at: done ? null : new Date().toISOString() },
        });
      }
      queryClient.invalidateQueries({ queryKey: ['collab-card', task.id] });
      queryClient.invalidateQueries({ queryKey: ['collab', task.id] });
    } catch (error) {
      toast.error(error?.message || "操作失败");
    } finally {
      setTogglingId(null);
    }
  };

  // 置顶/取消置顶：与普通约定同一套 pinned_at 语义，列表排序置顶优先
  const [isPinning, setIsPinning] = useState(false);
  const handleTogglePin = async (e) => {
    e.stopPropagation();
    if (isPinning) return;
    setIsPinning(true);
    try {
      const pinned = Boolean(task.pinned_at);
      await httpRequest(`/api/tasks/${task.id}`, {
        method: "PATCH",
        body: { pinned_at: pinned ? null : new Date().toISOString() },
      });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      toast.success(pinned ? "已取消置顶" : "已置顶，会排在列表最前");
    } catch (_err) {
      toast.error("操作没成功，再试一次");
    } finally {
      setIsPinning(false);
    }
  };

  if (!collab) return null;

  const assigneeOf = (sub) => {
    const assigneeId = sub?.metadata?.collab?.assignee;
    if (!assigneeId) return null;
    return members.find((m) => m.user_id === assigneeId) || null;
  };

  return (
    <div
      onClick={openSpace}
      className={cn(
        "group relative bg-white rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md hover:border-[#384877]/30 transition-all cursor-pointer p-5 md:p-6",
        task.pinned_at && "border-[#c9d5ef] shadow-md"
      )}
    >
      {/* 置顶/取消置顶：置顶时常显（实心图钉），未置顶悬停卡片显示 */}
      <button
        onClick={handleTogglePin}
        title={task.pinned_at ? "取消置顶" : "置顶"}
        className={cn(
          "absolute right-3 top-3 z-10 p-1.5 rounded-full transition-all",
          task.pinned_at
            ? "text-[#384877] bg-[#eef2ff]/80"
            : "text-slate-300 hover:text-[#384877] hover:bg-stone-50 md:opacity-0 md:group-hover:opacity-100"
        )}
      >
        <Pin className="w-4 h-4" fill={task.pinned_at ? "currentColor" : "none"} />
      </button>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {/* 徽标行 */}
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <Badge className="bg-[#384877] hover:bg-[#384877] text-white border-transparent text-[11px] px-2 py-0.5">
              {SCENARIO_LABELS[collab.scenario] || SCENARIO_LABELS.custom}
            </Badge>
            <Badge variant="outline" className="text-[11px] px-2 py-0.5 border-emerald-200 text-emerald-700 bg-emerald-50 gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              共创中
            </Badge>
            {collab?.agent?.enabled && (
              <Badge
                variant="outline"
                className={cn(
                  "text-[11px] px-2 py-0.5 gap-1",
                  agentActive
                    ? "border-indigo-200 text-indigo-700 bg-indigo-50"
                    : "border-slate-200 text-slate-400 bg-slate-50"
                )}
              >
                <Bot className="w-3 h-3" />
                1 个 Agent{!agentActive && "（已暂停）"}
              </Badge>
            )}
          </div>

          {/* 标题 + 共同目标 */}
          <h3 className="text-lg font-bold text-slate-900 truncate">{task.title}</h3>
          {collab.goal && <p className="text-sm text-slate-500 mt-1 line-clamp-1">{collab.goal}</p>}

          {/* 成员行 */}
          <div className="flex items-center gap-3 mt-3">
            <div className="flex -space-x-2">
              {members.slice(0, 5).map((m) => (
                <Avatar key={m.user_id || m.id} className="w-7 h-7 border-2 border-white">
                  <AvatarFallback className="text-[10px] bg-[#384877]/90 text-white">
                    {getInitials(m.display_name)}
                  </AvatarFallback>
                </Avatar>
              ))}
              {memberCount === 1 && (
                <Avatar className="w-7 h-7 border-2 border-white">
                  <AvatarFallback className="text-[10px] bg-slate-300 text-white">?</AvatarFallback>
                </Avatar>
              )}
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setInviteOpen(true); }}
              className="text-xs text-[#384877] hover:underline underline-offset-2"
            >
              {memberCount} 人共同构建 · 管理与邀请
            </button>
          </div>
        </div>

        {/* 右端：讨论入口 */}
        <button
          onClick={(e) => { e.stopPropagation(); openSpace(); }}
          className="flex-shrink-0 flex items-center gap-1.5 text-sm font-medium text-[#384877] border border-[#c7d2fe] rounded-full px-4 py-2 hover:bg-[#eef2ff] transition-colors"
        >
          <MessageSquare className="w-4 h-4" />
          讨论
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* 子约定区块 */}
      <div className="mt-5 pt-4 border-t border-slate-100">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[11px] font-bold tracking-widest text-slate-400 uppercase">
            Agreements 子约定 · {subtasks.length}
          </p>
          <div className="flex items-center gap-1 bg-slate-100 rounded-full p-0.5">
            {[["all", "全部"], ["pending", "待处理"], ["done", "已完成"]].map(([key, label]) => (
              <button
                key={key}
                onClick={(e) => { e.stopPropagation(); setFilter(key); }}
                className={cn(
                  "px-2.5 py-1 rounded-full text-[11px] font-medium transition-all",
                  filter === key ? "bg-white text-[#384877] shadow-sm" : "text-slate-500 hover:text-slate-700"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {filteredSubtasks.length === 0 ? (
          <p className="text-xs text-slate-400 italic py-3 text-center">
            {subtasks.length === 0 ? "还没有子约定，进空间把讨论转成子约定吧" : "该筛选下暂无子约定"}
          </p>
        ) : (
          <div className="space-y-1">
            {filteredSubtasks.slice(0, 5).map((sub) => {
              const done = isTaskEffectivelyCompleted(sub);
              const subCollab = sub.metadata?.collab;
              const isDraft = subCollab?.state === "draft";
              const assignee = assigneeOf(sub);
              const confirmedCount = Array.isArray(subCollab?.confirmedBy) ? subCollab.confirmedBy.length : 0;
              return (
                <div key={sub.id} className="flex items-center gap-3 py-1.5">
                  <button
                    type="button"
                    onClick={(e) => handleToggleSub(e, sub)}
                    disabled={togglingId === sub.id}
                    className="w-[18px] h-[18px] rounded-full border flex items-center justify-center flex-shrink-0 transition-opacity disabled:opacity-50 focus-visible:outline-none"
                    style={done ? { backgroundColor: "#384877", borderColor: "#384877", color: "#fff" } : { borderColor: "#cbd5e1" }}
                    aria-label={isDraft ? "确认子约定" : done ? "标记为未完成" : "标记完成"}
                    title={isDraft ? "确认子约定" : done ? "重新打开" : "标记完成"}
                  >
                    {done && <Check className="w-3 h-3" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn("text-sm truncate", done ? "text-slate-400 line-through" : "text-slate-700")}>
                        {sub.title}
                      </span>
                      {isDraft && (
                        <Badge className="text-[10px] px-1.5 py-0 bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-50">
                          <AlertCircle className="w-2.5 h-2.5 mr-0.5" />
                          待确认
                        </Badge>
                      )}
                      {(sub.tags || []).slice(0, 2).map((tag) => (
                        <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                          {tag}
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-400">
                      {subCollab?.standard && <span className="truncate">标准：{subCollab.standard}</span>}
                      {assignee && <span>· 负责 {assignee.display_name}</span>}
                      {sub.reminder_time && (
                        <span>· {new Date(sub.reminder_time).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                      )}
                      {isDraft && <span className="text-amber-600">· 确认 {confirmedCount}/{memberCount}</span>}
                    </div>
                  </div>
                </div>
              );
            })}
            {filteredSubtasks.length > 5 && (
              <p className="text-[11px] text-slate-400 pl-6 pt-1">+ 还有 {filteredSubtasks.length - 5} 条，点击查看全部</p>
            )}
          </div>
        )}
      </div>

      {/* 共识 / 分歧摘要 */}
      {(consensusBullets.length > 0 || disputeBullets.length > 0) && (
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          {consensusBullets.length > 0 && (
            <div className="rounded-xl bg-emerald-50/60 border border-emerald-100 p-3">
              <p className="text-[11px] font-semibold text-emerald-700 mb-1.5 flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> 已达成共识
              </p>
              <ul className="space-y-1">
                {consensusBullets.map((b, i) => (
                  <li key={i} className="text-[11px] text-emerald-900/80 line-clamp-1">· {b}</li>
                ))}
              </ul>
            </div>
          )}
          {disputeBullets.length > 0 && (
            <div className="rounded-xl bg-amber-50/60 border border-amber-100 p-3">
              <p className="text-[11px] font-semibold text-amber-700 mb-1.5 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> 仍待确认
              </p>
              <ul className="space-y-1">
                {disputeBullets.map((b, i) => (
                  <li key={i} className="text-[11px] text-amber-900/80 line-clamp-1">· {b}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <CollabInviteDialog
        task={task}
        members={members}
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onChanged={() => { /* summary 轮询自动刷新 */ }}
      />
    </div>
  );
}
