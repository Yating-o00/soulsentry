import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowUpRight, CheckCircle2, Circle, Loader2, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { httpRequest } from "@/api/httpClient";
import { createPageUrl } from "@/utils";
import { isTaskEffectivelyCompleted } from "@/lib/taskStatus";
import { cn } from "@/lib/utils";
import ConversationPane from "./ConversationPane";
import CollabInviteDialog from "@/components/tasks/CollabInviteDialog";
import Orb from "@/components/buddy/Orb";
import { MemberAvatar } from "./Common";

const toPlain = (value) =>
  String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

function flatten(list, depth = 0, out = []) {
  for (const node of list || []) {
    out.push({ node, depth });
    flatten(node.children, depth + 1, out);
  }
  return out;
}

/**
 * 搭子空间内的极简协同面板（手机优先）：
 * 讨论是主视图；约定/沉淀由 Agent 从讨论中整理，用户只在需要时切换查看。
 * 不铺说明文字，用顶部进度、成员和分段切换传达状态。
 */
export default function BuddyCollabPanel({ taskId, buddy, tint, profile = null, guest = false, className = "" }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [view, setView] = useState("chat");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [busyId, setBusyId] = useState(null);
  // Agent 从讨论里新整理出约定/沉淀时，在对应切换上点一个未读点，不弹提示
  const [fresh, setFresh] = useState({ pacts: false, knowledge: false });
  const [highlightMessageId, setHighlightMessageId] = useState(null);
  const lastCountsRef = useRef(null);
  const [searchParams] = useSearchParams();
  // 通知深链：?messageId=... 打开搭子协同后直接定位到被 @ 的讨论
  const messageIdParam = searchParams.get("messageId");
  useEffect(() => {
    if (!messageIdParam) return;
    setView("chat");
    setHighlightMessageId(messageIdParam);
  }, [messageIdParam]);

  const { data: summary, isLoading, error } = useQuery({
    queryKey: ["collab", taskId],
    queryFn: () => httpRequest(`/api/collab/${taskId}/summary`),
    refetchInterval: 15000,
    retry: false,
  });
  const { data: currentUser } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => base44.auth.me(),
    staleTime: 5 * 60 * 1000,
  });

  const task = summary?.task;
  const collab = task?.metadata?.collab;
  const agentActive = collab?.agent?.enabled !== false && !collab?.agent?.paused;
  const members = summary?.members || [];
  const tree = summary?.subtasks || [];
  const docs = summary?.docs || [];
  const digest = docs.find((doc) => doc.doc_type === "digest");
  const sediments = docs.filter((doc) => doc.doc_type !== "digest");
  const pactRows = useMemo(() => flatten(tree), [tree]);
  const fullSpaceUrl = `${createPageUrl("CollabSpace")}?taskId=${taskId}&from=buddy&buddy=${buddy.id}&collab=${taskId}${
    guest ? "&guest=1&view=discussion" : ""
  }`;

  useEffect(() => {
    if (!summary) return;
    const counts = { pacts: pactRows.length, knowledge: sediments.length };
    const previous = lastCountsRef.current;
    if (previous) {
      setFresh((cur) => ({
        pacts: cur.pacts || (counts.pacts > previous.pacts && view !== "pacts"),
        knowledge: cur.knowledge || (counts.knowledge > previous.knowledge && view !== "knowledge"),
      }));
    }
    lastCountsRef.current = counts;
  }, [summary, pactRows.length, sediments.length, view]);

  const switchView = (next) => {
    setView(next);
    if (next !== "chat") setFresh((cur) => ({ ...cur, [next]: false }));
  };

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["collab", taskId] });
    await queryClient.invalidateQueries({ queryKey: ["tasks"] });
  };

  const togglePact = async (subtask) => {
    const done = isTaskEffectivelyCompleted(subtask);
    setBusyId(subtask.id);
    try {
      await httpRequest(`/api/tasks/${subtask.id}`, {
        method: "PATCH",
        body: {
          status: done ? "pending" : "completed",
          completed_at: done ? null : new Date().toISOString(),
        },
      });
      await refresh();
    } catch (error) {
      toast.error(error?.message || "操作失败");
    } finally {
      setBusyId(null);
    }
  };

  const confirmPact = async (subtask) => {
    setBusyId(subtask.id);
    try {
      const res = await httpRequest(`/api/collab/${taskId}/subtasks/${subtask.id}/confirm`, { method: "POST" });
      await refresh();
      toast.success(res?.state === "active" ? "已确认生效" : "已确认，等待其他成员");
    } catch (error) {
      toast.error(error?.message || "确认失败");
    } finally {
      setBusyId(null);
    }
  };

  const confirmDoc = async (doc) => {
    setBusyId(doc.id);
    try {
      await httpRequest(`/api/collab/${taskId}/docs/${doc.id}/confirm`, { method: "POST" });
      await refresh();
      toast.success("沉淀已确认");
    } catch (error) {
      toast.error(error?.message || "确认失败");
    } finally {
      setBusyId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-[420px] items-center justify-center rounded-3xl border border-stone-200 bg-white">
        <Loader2 className="h-4 w-4 animate-spin text-stone-400" />
        <span className="ml-2 text-xs text-stone-400">正在打开协同空间…</span>
      </div>
    );
  }

  if (error || !task) {
    return (
      <div className="flex h-[220px] items-center justify-center rounded-3xl border border-stone-200 bg-white px-6 text-center">
        <p className="text-xs leading-5 text-stone-400">
          {error?.data?.message || error?.message || "这个协同暂时打不开"}
        </p>
      </div>
    );
  }

  const tabs = [
    { key: "chat", label: "讨论" },
    { key: "pacts", label: `约定 ${pactRows.length}` },
    { key: "knowledge", label: `沉淀 ${sediments.length}` },
  ];

  const otherMembers = members.filter((m) => m.user_id !== currentUser?.id && m.id !== currentUser?.id);
  const memberCount = members.length || 1; // at least current user

  return (
    <div className={cn("flex h-[calc(100dvh-140px)] min-h-[320px] flex-col overflow-hidden rounded-t-2xl rounded-b-none border border-stone-200 border-b-0 bg-white shadow-[0_1px_2px_rgba(36,36,36,0.05)] md:h-[calc(100dvh-180px)] md:min-h-[540px] md:max-h-[820px] md:rounded-3xl md:border-b", className)}>
      {/* 手机优先的协同头：压到最薄，把高度让给聊天 */}
      <header className="shrink-0 border-b border-stone-100 bg-[#FAF9F7] px-3 pb-1 pt-1 md:px-4 md:pb-1.5 md:pt-2">
        {/* 第一行：标题居左，成员（1区）放右上角，完整入口紧随其后 */}
        <div className="flex items-start gap-1.5">
          <Orb size={24} tint={tint} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="shrink-0 rounded-full bg-[#F3F0E8] px-1.5 py-0 text-[9px] font-medium text-[#6b5c45]">共创中</span>
              <h3 className="truncate text-[13px] font-semibold leading-tight text-stone-900">{task.title}</h3>
            </div>
            <div className="mt-0 flex items-center gap-1.5 truncate text-[10px] text-stone-400">
              <span className="inline-flex items-center gap-1">
                <span className={`h-1.5 w-1.5 rounded-full ${agentActive ? "bg-emerald-500" : "bg-stone-300"}`} />
                {agentActive ? "Agent 参与中" : "Agent 未参与"}
              </span>
              <span className="hidden sm:inline">·</span>
              <span className="hidden sm:inline truncate">
                {profile?.plan_title || buddy.planTitle?.(profile?.answers || {}) || buddy.duration}
              </span>
            </div>
          </div>

          {/* 成员：只呈现空间人员，添加按钮与用户圈同大并以品牌色标识 */}
          <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
            <div className="flex shrink-0 -space-x-1">
              <span
                className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-[#8B6F47] text-[8px] font-medium text-white"
                title="我"
              >
                我
              </span>
              {otherMembers.slice(0, 2).map((member) => (
                <MemberAvatar
                  key={member.user_id || member.id}
                  name={member.display_name || "成员"}
                  seed={member.user_id || member.id}
                  size="xs"
                  className="border-2 border-white"
                />
              ))}
              <button
                type="button"
                onClick={() => setInviteOpen(true)}
                className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-dashed border-[#384877]/40 bg-[#eef2ff] text-[#384877] transition-colors hover:border-[#384877]"
                title="邀请成员"
                aria-label="邀请成员"
              >
                <Plus className="h-2.5 w-2.5" />
              </button>
            </div>
            <span className="hidden shrink-0 text-[9px] text-stone-400 sm:inline">{memberCount}人</span>
            <Link
              to={fullSpaceUrl}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-stone-400 transition-colors hover:bg-stone-100 hover:text-[#384877] md:h-6 md:w-6"
              title="完整协同空间"
              aria-label="打开完整协同空间"
            >
              <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
        </div>

        {/* 三个内容切换：2区，上下压缩 */}
        <div className="mt-1 grid grid-cols-3 gap-1 rounded-full bg-[#F3F0E8] p-0.5" role="tablist" aria-label="协同内容">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={view === tab.key}
              onClick={() => switchView(tab.key)}
              className={cn(
                "relative min-h-[22px] rounded-full text-[11px] transition-colors leading-none",
                view === tab.key ? "bg-white font-medium text-stone-900 shadow-sm" : "text-stone-500"
              )}
            >
              {tab.label}
              {fresh[tab.key] && (
                <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full" style={{ backgroundColor: tint[2] }} />
              )}
            </button>
          ))}
        </div>
      </header>

      <div className="min-h-0 flex-1">
        {/* 讨论常驻挂载：切到约定/沉淀再回来时，保留当前主题窗口与输入 */}
        <div className={view === "chat" ? "h-full" : "hidden"}>
          <ConversationPane
            taskId={taskId}
            view="discussion"
            onViewChange={() => {}}
            highlightId={highlightMessageId}
            onClearHighlight={() => setHighlightMessageId(null)}
            onOpenAgent={() => navigate(fullSpaceUrl)}
            messageCount={0}
            currentUserId={currentUser?.id}
            savedTopics={collab?.topics || []}
            members={members}
            onInvite={() => setInviteOpen(true)}
            compact
          />
        </div>

        {view === "pacts" && (
          <div className="h-full space-y-2.5 overflow-y-auto px-4 py-3.5">
            {digest && (
              <div className="rounded-2xl bg-[#F7F4EC] p-3.5">
                <div className="flex items-center justify-between text-[10px] text-stone-400">
                  <span>执行概览</span>
                  <span>Agent 整理</span>
                </div>
                <p className="mt-1.5 whitespace-pre-wrap text-[12px] leading-relaxed text-stone-600">
                  {toPlain(digest.content).slice(0, 600)}
                </p>
              </div>
            )}
            {pactRows.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-stone-200 p-6 text-center text-xs text-stone-400">
                讨论后，Agent 会把行动整理成约定
              </p>
            ) : (
              pactRows.map(({ node, depth }) => {
                const done = isTaskEffectivelyCompleted(node);
                const subCollab = node.metadata?.collab || {};
                const isDraft = subCollab.state === "draft";
                const confirmedMine = (subCollab.confirmedBy || []).includes(currentUser?.id);
                const assignee = members.find(
                  (member) => member.user_id === subCollab.assignee || member.id === subCollab.assignee
                );
                return (
                  <div
                    key={node.id}
                    className="flex items-start gap-2.5 rounded-2xl border border-stone-100 bg-white p-3"
                    style={{ marginLeft: Math.min(depth, 2) * 12 }}
                  >
                    {isDraft ? (
                      <button
                        type="button"
                        onClick={() => confirmPact(node)}
                        disabled={busyId === node.id || confirmedMine}
                        className={cn(
                          "mt-0.5 min-h-7 shrink-0 rounded-full px-2.5 text-[10px] font-medium disabled:opacity-60",
                          confirmedMine ? "bg-stone-100 text-stone-400" : "bg-amber-50 text-amber-700"
                        )}
                      >
                        {confirmedMine ? "已确认" : "确认"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => togglePact(node)}
                        disabled={busyId === node.id}
                        className="-m-1 mt-0 shrink-0 rounded-full p-1 disabled:opacity-50"
                        aria-label={done ? "取消完成" : "标记完成"}
                      >
                        {done ? (
                          <CheckCircle2 className="h-[18px] w-[18px]" style={{ color: tint[2] }} />
                        ) : (
                          <Circle className="h-[18px] w-[18px]" style={{ color: "#c7c2b8" }} />
                        )}
                      </button>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={cn("text-[13.5px] font-medium leading-5", done ? "text-stone-400 line-through" : "text-stone-800")}>
                          {node.title}
                        </span>
                        {isDraft && (
                          <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] text-amber-700">
                            {confirmedMine ? "待成员确认" : "待确认"}
                          </span>
                        )}
                        {subCollab.autoCompleted && <Sparkles className="h-3 w-3 text-[#384877]" />}
                      </div>
                      {subCollab.standard && (
                        <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-stone-400">{subCollab.standard}</p>
                      )}
                      {assignee && <p className="mt-1 text-[10px] text-stone-400">{assignee.display_name}</p>}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {view === "knowledge" && (
          <div className="h-full space-y-2.5 overflow-y-auto px-4 py-3.5">
            {sediments.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-stone-200 p-6 text-center text-xs text-stone-400">
                讨论里的方法、攻略会沉淀在这里
              </p>
            ) : (
              sediments.map((doc) => (
                <div key={doc.id} className="rounded-2xl border border-stone-100 bg-white p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[13.5px] font-medium leading-5 text-stone-800">{doc.title}</span>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-1.5 py-0.5 text-[9px]",
                        doc.status === "confirmed" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                      )}
                    >
                      {doc.status === "confirmed" ? "已确认" : "待确认"}
                    </span>
                  </div>
                  {toPlain(doc.content) && (
                    <p className="mt-1 line-clamp-3 text-[11px] leading-4 text-stone-500">
                      {toPlain(doc.content).replace(/\s+/g, " ").slice(0, 160)}
                    </p>
                  )}
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-[9px] text-stone-300">讨论沉淀</span>
                    {doc.status !== "confirmed" && (
                      <button
                        type="button"
                        onClick={() => confirmDoc(doc)}
                        disabled={busyId === doc.id}
                        className="min-h-7 rounded-full border border-[#384877]/30 px-2.5 text-[10px] font-medium text-[#384877] disabled:opacity-50"
                      >
                        确认收下
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <CollabInviteDialog
        open={inviteOpen}
        task={task}
        members={members}
        subtasks={tree}
        onClose={() => setInviteOpen(false)}
        onChanged={refresh}
      />
    </div>
  );
}
