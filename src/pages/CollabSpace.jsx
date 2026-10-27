// 共创空间：人 + 人 + Agent 协同 Group 的统一双栏工作区
// 左栏内容区（Agreement 头卡 → 子约定 → 执行节点 → 沉淀），右栏会话窗（讨论/动态）
// 桌面 ≥900px 双栏等高；移动端单栏 + 底部四格导航。数据：GET /api/collab/:taskId/summary 聚合，15s 轮询
import React, { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { httpRequest } from "@/api/httpClient";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import AgreementHead from "@/components/collab/AgreementHead";
import ChildrenPanel from "@/components/collab/ChildrenPanel";
import MilestonesPanel from "@/components/collab/MilestonesPanel";
import DocsPanel from "@/components/collab/DocsPanel";
import ConversationPane from "@/components/collab/ConversationPane";
import AgentDrawer from "@/components/collab/AgentDrawer";
import MobileNav from "@/components/collab/MobileNav";
import CollabInviteDialog from "@/components/tasks/CollabInviteDialog";

const smooth = () => (window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth");

export default function CollabSpace() {
  const [searchParams] = useSearchParams();
  const taskId = searchParams.get("taskId");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [agentDrawerOpen, setAgentDrawerOpen] = useState(false);
  const [conversationView, setConversationView] = useState("discussion");
  const [highlightCommentId, setHighlightCommentId] = useState(null);
  const [mobileNavActive, setMobileNavActive] = useState("content");
  const [togglingAgent, setTogglingAgent] = useState(false);

  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const {
    data: summary,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['collab', taskId],
    queryFn: () => httpRequest(`/api/collab/${taskId}/summary`),
    enabled: !!taskId,
    refetchInterval: 15000,
    retry: false,
  });

  // 与会话窗共享同一条 messages 缓存，仅取计数用于 tab 标签
  const { data: messageCount = 0 } = useQuery({
    queryKey: ['collab', taskId, 'messages'],
    queryFn: () => httpRequest(`/api/comments?task_id=${taskId}&limit=300`),
    enabled: !!taskId,
    select: (data) => (Array.isArray(data) ? data.length : 0),
  });

  const task = summary?.task;
  const collab = task?.metadata?.collab;
  const members = summary?.members || [];

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['collab', taskId] });
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
  };

  // Agent 暂停/恢复（PATCH metadata.collab.agent.paused）
  const handleToggleAgent = async () => {
    if (!task || togglingAgent) return;
    const meta = task.metadata || {};
    const nextCollab = {
      ...collab,
      agent: { ...(collab?.agent || { enabled: true }), paused: !collab?.agent?.paused },
    };
    setTogglingAgent(true);
    try {
      await httpRequest(`/api/tasks/${task.id}`, {
        method: "PATCH",
        body: { metadata: { ...meta, collab: nextCollab } },
      });
      invalidateAll();
      toast.success(nextCollab.agent.paused ? "心栈 Agent 已暂停" : "心栈 Agent 已恢复");
    } catch (e) {
      toast.error(e?.message || "操作失败");
    } finally {
      setTogglingAgent(false);
    }
  };

  // 来源讨论跳转：切到讨论 tab + 滚动 + 高亮（移动端先把会话窗滚入视口）
  const jumpToDiscussion = (commentId) => {
    setConversationView("discussion");
    setMobileNavActive("discussion");
    setHighlightCommentId(commentId);
    if (window.matchMedia("(max-width: 899px)").matches) {
      window.requestAnimationFrame(() => {
        document.getElementById("conversation-pane")?.scrollIntoView({ behavior: smooth(), block: "start" });
      });
    }
  };

  const showContent = () => {
    setMobileNavActive("content");
    const pane = document.getElementById("content-pane");
    pane?.scrollTo({ top: 0, behavior: smooth() });
    pane?.scrollIntoView({ behavior: smooth(), block: "start" });
  };

  const showConversation = (view) => {
    setConversationView(view);
    setMobileNavActive(view);
    window.requestAnimationFrame(() => {
      document.getElementById("conversation-pane")?.scrollIntoView({ behavior: smooth(), block: "start" });
    });
  };

  const openAgent = () => {
    setMobileNavActive("agent");
    setAgentDrawerOpen(true);
  };

  if (!taskId) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ backgroundColor: "#f1f0ec" }}>
        <p className="text-sm" style={{ color: "#77736c" }}>缺少 taskId 参数</p>
        <Button variant="outline" onClick={() => navigate("/tasks")}>返回约定列表</Button>
      </div>
    );
  }

  return (
    <div
      className="min-h-dvh pb-[64px] min-[900px]:grid min-[900px]:h-dvh min-[900px]:grid-cols-2 min-[900px]:overflow-hidden min-[900px]:pb-0"
      style={{ backgroundColor: "#f1f0ec", color: "#231f20" }}
    >
      <style>{`
        .collab-msg-flash { animation: collabFlash 2s ease-out; }
        @keyframes collabFlash {
          0%, 40% { background-color: #eef2ff; box-shadow: 0 0 0 3px rgba(56,72,119,0.18); }
          100% { background-color: transparent; box-shadow: none; }
        }
        .collab-agent-breathe { animation: collabBreathe 1.6s ease-in-out infinite; }
        @keyframes collabBreathe {
          0%, 100% { box-shadow: 0 0 0 0 rgba(56,72,119,0.28); }
          50% { box-shadow: 0 0 0 7px rgba(56,72,119,0); }
        }
        .collab-typing-dot { animation: collabTyping 1.2s ease-in-out infinite; }
        .collab-typing-dot:nth-child(2) { animation-delay: 0.18s; }
        .collab-typing-dot:nth-child(3) { animation-delay: 0.36s; }
        @keyframes collabTyping {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-3px); opacity: 1; }
        }
      `}</style>

      {/* 左栏：内容区 */}
      <main id="content-pane" className="min-w-0 min-[900px]:h-dvh min-[900px]:overflow-y-auto">
        <AgreementHead
          task={task}
          summary={summary}
          isLoading={isLoading}
          onBack={() => navigate("/tasks")}
          onOpenInvite={() => setInviteOpen(true)}
        />

        {error && (
          <div className="mx-4 my-6 rounded-2xl border border-rose-200 bg-rose-50/60 p-8 text-center sm:mx-6">
            <p className="text-sm text-rose-700">{error?.data?.message || error?.message || "无法打开共创空间"}</p>
            <Button variant="outline" className="mt-4" onClick={() => navigate("/tasks")}>返回约定列表</Button>
          </div>
        )}

        {isLoading && !summary && (
          <div className="flex items-center justify-center py-16 text-sm" style={{ color: "#99958d" }}>
            <Loader2 className="w-4 h-4 animate-spin mr-2" /> 加载共创空间…
          </div>
        )}

        {summary && (
          <>
            <ChildrenPanel
              summary={summary}
              taskId={taskId}
              currentUserId={currentUser?.id}
              onJumpToDiscussion={jumpToDiscussion}
            />
            <MilestonesPanel summary={summary} taskId={taskId} />
            <DocsPanel
              docs={summary.docs || []}
              taskId={taskId}
              onJumpToSource={jumpToDiscussion}
            />
          </>
        )}
      </main>

      {/* 右栏：会话窗 */}
      <aside className="min-w-0 border-t min-[900px]:h-full min-[900px]:border-l min-[900px]:border-t-0" style={{ borderColor: "#d5d3cc" }}>
        <ConversationPane
          taskId={taskId}
          view={conversationView}
          onViewChange={setConversationView}
          highlightId={highlightCommentId}
          onClearHighlight={() => setHighlightCommentId(null)}
          onOpenAgent={openAgent}
          messageCount={messageCount}
        />
      </aside>

      <MobileNav
        active={mobileNavActive}
        onNavigate={(id) => (id === "content" ? showContent() : showConversation(id))}
        onOpenAgent={openAgent}
      />

      <AgentDrawer
        open={agentDrawerOpen}
        onOpenChange={setAgentDrawerOpen}
        agentEnabled={!!collab?.agent?.enabled}
        agentPaused={!!collab?.agent?.paused}
        toggling={togglingAgent}
        onToggleAgent={handleToggleAgent}
      />

      <CollabInviteDialog
        task={task}
        members={members}
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onChanged={invalidateAll}
      />
    </div>
  );
}
