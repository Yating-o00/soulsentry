// 会话窗（右栏全高）：成员讨论 / 共同动态双 tab + Agent 快捷 chips + 输入框（召唤 Agent）
// @Agent 增强：发送含 @ 内容后立即显示「心栈 Agent 思考中…」打字指示器，
// 轮询发现更新的 agent 消息后撤下指示器、滚动到底部并高亮该消息 2 秒
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUp, Bot, Check, ChevronDown, FileText, Handshake,
  ListChecks, Loader2, MapPin, Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { httpRequest } from "@/api/httpClient";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  ACTIVITY_LABELS, AGENT_ACTION_TEXT, MARK_LABELS, MARK_STYLES,
  agentIntentFor, agentSuccessText, C, formatTime,
} from "./constants";
import { AgentAvatar, EmptyState, MemberAvatar } from "./Common";

const msgActionCls = "inline-flex items-center rounded px-1.5 text-[10px] font-medium text-[#77736c] transition-colors hover:bg-[#efefe9] hover:text-[#384877] min-h-7 focus-visible:outline-none";

// ──────────────────────────── 讨论视图 ────────────────────────────

function DiscussionView({ taskId, highlightId, onClearHighlight }) {
  const queryClient = useQueryClient();
  const [topicFilter, setTopicFilter] = useState("all");
  const [selectedId, setSelectedId] = useState(null); // 提取子约定前先选一条消息
  const [replyTo, setReplyTo] = useState(null);
  const [content, setContent] = useState("");
  const [topic, setTopic] = useState("");
  const [showTopicInput, setShowTopicInput] = useState(false);
  const [agentRunning, setAgentRunning] = useState(false);
  const [agentPendingSince, setAgentPendingSince] = useState(null); // @Agent 打字指示器
  const [flashingId, setFlashingId] = useState(null);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ['collab', taskId, 'messages'],
    queryFn: () => httpRequest(`/api/comments?task_id=${taskId}&limit=300`),
    enabled: !!taskId,
    refetchInterval: 15000,
    initialData: [],
  });

  const topics = useMemo(
    () => [...new Set(messages.map((m) => m.topic).filter(Boolean))],
    [messages]
  );

  const filteredMessages = useMemo(
    () => (topicFilter === "all" ? messages : messages.filter((m) => m.topic === topicFilter)),
    [messages, topicFilter]
  );

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['collab', taskId] });
  };

  // 来源讨论跳转：滚动 + 高亮
  useEffect(() => {
    if (!highlightId) return;
    setTopicFilter("all");
    const el = document.getElementById(`collab-msg-${highlightId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("collab-msg-flash");
      setTimeout(() => el.classList.remove("collab-msg-flash"), 2400);
    }
    onClearHighlight?.();
  }, [highlightId, messages, onClearHighlight]);

  // @Agent 兜底：轮询发现比 @消息更新的 agent 消息 → 撤指示器、滚到底、高亮 2 秒
  useEffect(() => {
    if (!agentPendingSince) return;
    const latestAgent = [...messages].reverse().find(
      (m) => m.agent && new Date(m.created_date).getTime() > agentPendingSince
    );
    if (latestAgent) {
      setAgentPendingSince(null);
      setFlashingId(latestAgent.id);
      setTimeout(() => {
        const el = document.getElementById(`collab-msg-${latestAgent.id}`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "end" });
      }, 100);
      setTimeout(() => setFlashingId(null), 2200);
    }
  }, [messages, agentPendingSince]);

  const runAgent = async (action) => {
    if (agentRunning) return;
    if (action === "extract_subtasks" && !selectedId) {
      toast.info("先点选一条消息，再让 Agent 从中提取子约定");
      return;
    }
    setAgentRunning(true);
    const toastId = toast.loading(AGENT_ACTION_TEXT[action] || "心栈 Agent 正在执行（约 30 秒）…");
    try {
      const res = await httpRequest(`/api/collab/${taskId}/agent`, {
        method: "POST",
        body: { action, comment_id: action === "extract_subtasks" ? selectedId : undefined },
      });
      toast.success(agentSuccessText(action, res), { id: toastId });
      setSelectedId(null);
      invalidateAll();
    } catch (error) {
      const msg = error?.status === 402
        ? `积分不足：${error?.data?.message || "请先充值"}`
        : error?.data?.message || error?.message || "Agent 执行失败，请稍后重试";
      toast.error(msg, { id: toastId });
    } finally {
      setAgentRunning(false);
    }
  };

  const handleConvert = async (message, target) => {
    try {
      await httpRequest(`/api/collab/${taskId}/convert`, {
        method: "POST",
        body: { comment_id: message.id, target },
      });
      if (target === "subtask") toast.success("已转为子约定草案，待确认后生效");
      else if (target === "node") toast.success("已标记为执行节点");
      else toast.success("已存为沉淀文件");
      invalidateAll();
    } catch (error) {
      toast.error(error?.message || "转换失败");
    }
  };

  const handleMark = async (message, mark) => {
    try {
      await httpRequest(`/api/comments/${message.id}`, { method: "PATCH", body: { mark } });
      invalidateAll();
    } catch (error) {
      toast.error(error?.message || "标记失败");
    }
  };

  const handleSend = async () => {
    const text = content.trim();
    if (!text) return;
    const mentionAgent = /@\s*(agent|心栈)/i.test(text);
    try {
      await httpRequest(`/api/collab/${taskId}/messages`, {
        method: "POST",
        body: {
          content: text,
          parent_id: replyTo?.id || undefined,
          topic: topic.trim() || undefined,
        },
      });
      setContent("");
      setTopic("");
      setShowTopicInput(false);
      setReplyTo(null);
      invalidateAll();
      if (mentionAgent) {
        // 展示层意图提示（实际触发由后端完成）+ 打字指示器兜底
        const intent = agentIntentFor(text);
        toast(intent.toast, { duration: 3000 });
        toast.info("Agent 正在结合全部讨论与联网信息整理，可能需要 30-90 秒", { duration: 5000 });
        setAgentPendingSince(Date.now());
      }
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 150);
    } catch (error) {
      toast.error(error?.message || "发送失败");
    }
  };

  const renderMessage = (message, isReply = false) => {
    const isAgent = !!message.agent;
    const isSelected = selectedId === message.id;
    const hasReplies = !isReply && (message.replies?.length || 0) > 0;
    return (
      <div
        key={message.id}
        id={`collab-msg-${message.id}`}
        className={cn(
          "group relative border-b py-4 transition-colors last:border-b-0",
          isReply ? "ml-10 border-transparent py-2.5" : "",
          flashingId === message.id && "collab-msg-flash"
        )}
        style={isReply ? undefined : { borderColor: C.lineSoft }}
      >
        <div className="flex gap-3">
          {isAgent
            ? <AgentAvatar size="sm" />
            : <MemberAvatar name={message.created_by_name || "成员"} seed={message.created_by} size="sm" className="border-[#fdfcf9]" />}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
              <span className="font-semibold" style={{ color: "#45413d" }}>
                {isAgent ? "心栈 Agent" : message.created_by_name || "成员"}
              </span>
              {isAgent && (
                <Badge className="text-[10px] px-1.5 py-0 border-transparent hover:bg-[#e4e6f8]" style={{ backgroundColor: "#e4e6f8", color: "#2a2861" }}>
                  <Bot className="w-2.5 h-2.5 mr-0.5" />整理建议
                </Badge>
              )}
              {message.topic && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0" style={{ borderColor: "#d8d6cf", color: "#77736c" }}>
                  {message.topic}
                </Badge>
              )}
              {message.mark && (
                <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", MARK_STYLES[message.mark])}>
                  {MARK_LABELS[message.mark]}
                </Badge>
              )}
              <span className="text-[10px]" style={{ color: "#8a867e" }}>{formatTime(message.created_date)}</span>
            </div>
            <p className="mt-1.5 text-[13px] leading-6 whitespace-pre-wrap break-words" style={{ color: isAgent ? "#49465b" : "#57534d" }}>
              {message.content}
            </p>

            {/* hover 操作（Agent 消息与回复不提供转换）；移动端常驻 */}
            {!isAgent && !isReply && (
              <div className="hidden min-[900px]:flex flex-wrap gap-x-1 mt-1 opacity-0 transition-opacity group-hover:opacity-100">
                <button type="button" onClick={() => handleConvert(message, "subtask")} className={msgActionCls}><ListChecks className="h-3 w-3 mr-0.5" />转为子约定</button>
                <button type="button" onClick={() => handleConvert(message, "node")} className={msgActionCls}>标记节点</button>
                <button type="button" onClick={() => handleConvert(message, "doc")} className={msgActionCls}>存为文件</button>
                <button
                  type="button"
                  onClick={() => setSelectedId(isSelected ? null : message.id)}
                  className={cn(msgActionCls, isSelected && "text-[#384877]")}
                >
                  {isSelected ? "✓ 已选为提取源" : "选为提取源"}
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button" className={cn(msgActionCls, message.mark && MARK_STYLES[message.mark])}>
                      {message.mark ? MARK_LABELS[message.mark] : "标记"}
                      <ChevronDown className="h-3 w-3 ml-0.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="text-xs">
                    {Object.entries(MARK_LABELS).map(([value, label]) => (
                      <DropdownMenuItem key={value} onClick={() => handleMark(message, value)} className="gap-1.5">
                        <span className={cn("inline-block w-2 h-2 rounded-full", {
                          "bg-emerald-500": value === "consensus",
                          "bg-rose-500": value === "dispute",
                          "bg-amber-500": value === "pending",
                        })} />
                        {label}
                        {message.mark === value && <Check className="w-3 h-3 ml-auto" />}
                      </DropdownMenuItem>
                    ))}
                    {message.mark && (
                      <DropdownMenuItem onClick={() => handleMark(message, null)} className="text-slate-400">
                        清除标记
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
                <button type="button" onClick={() => setReplyTo({ id: message.id, name: message.created_by_name })} className="collab-msg-action">回复</button>
              </div>
            )}
            {!isAgent && !isReply && (
              <div className="flex min-[900px]:hidden flex-wrap items-center gap-x-2 gap-y-1 mt-1.5 text-[11px]">
                <button type="button" onClick={() => handleConvert(message, "subtask")} className="text-[#384877]">转为子约定</button>
                <button type="button" onClick={() => handleConvert(message, "node")} className="text-[#384877]">标记节点</button>
                <button type="button" onClick={() => handleConvert(message, "doc")} className="text-[#384877]">存为文件</button>
                <button
                  type="button"
                  onClick={() => setSelectedId(isSelected ? null : message.id)}
                  className={isSelected ? "text-[#384877] font-medium" : "text-[#77736c]"}
                >
                  {isSelected ? "已选为提取源" : "选为提取源"}
                </button>
                <button type="button" onClick={() => setReplyTo({ id: message.id, name: message.created_by_name })} className="text-[#77736c]">回复</button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="text-[#77736c]">{message.mark ? MARK_LABELS[message.mark] : "标记"}</button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="text-xs">
                    {Object.entries(MARK_LABELS).map(([value, label]) => (
                      <DropdownMenuItem key={value} onClick={() => handleMark(message, value)}>
                        {label}
                        {message.mark === value && <Check className="w-3 h-3 ml-auto" />}
                      </DropdownMenuItem>
                    ))}
                    {message.mark && (
                      <DropdownMenuItem onClick={() => handleMark(message, null)} className="text-slate-400">
                        清除标记
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
            {!isAgent && !isReply && hasReplies === false && (
              <button
                type="button"
                onClick={() => setReplyTo({ id: message.id, name: message.created_by_name })}
                className="hidden min-[900px]:inline-block mt-1 text-[11px] opacity-0 transition-opacity group-hover:opacity-100"
                style={{ color: "#8a867e" }}
              >
                回复
              </button>
            )}
          </div>
        </div>
        {!isReply && (message.replies || []).map((reply) => renderMessage(reply, true))}
      </div>
    );
  };

  return (
    <div id="section-discussion" role="tabpanel" aria-labelledby="discussion-tab" className="flex min-h-0 flex-1 flex-col">
      {/* Agent 快捷 chips */}
      <div className="flex shrink-0 gap-2 overflow-x-auto border-b px-4 py-3 sm:px-6" style={{ borderColor: C.lineSoft }}>
        <button
          type="button"
          onClick={() => runAgent("tidy")}
          disabled={agentRunning}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 text-[11px] font-medium transition-colors disabled:opacity-50 min-h-8"
          style={{ backgroundColor: C.ink, color: "#faf9f5" }}
        >
          {agentRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          整理
        </button>
        {[
          { action: "extract_subtasks", label: "提取子约定", icon: ListChecks },
          { action: "disputes", label: "协调分歧", icon: Handshake },
          { action: "minutes", label: "生成纪要", icon: FileText },
        ].map(({ action, label, icon: Icon }) => (
          <button
            key={action}
            type="button"
            onClick={() => runAgent(action)}
            disabled={agentRunning}
            className={cn(
              "inline-flex shrink-0 items-center gap-1 rounded-full px-3 text-[11px] font-medium transition-colors disabled:opacity-50 min-h-8",
              action === "extract_subtasks" && selectedId ? "text-[#384877]" : ""
            )}
            style={action === "extract_subtasks" && selectedId
              ? { backgroundColor: C.brandTint, border: "1px solid #c7d2fe" }
              : { backgroundColor: "#efefe9", color: "#625e58" }}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
        {selectedId && (
          <button type="button" onClick={() => setSelectedId(null)} className="shrink-0 px-1 text-[11px] text-[#384877] hover:underline">
            取消选中的提取源
          </button>
        )}
      </div>

      {/* 主题过滤 */}
      {topics.length > 0 && (
        <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto px-4 py-2.5 sm:px-6">
          <button
            type="button"
            onClick={() => setTopicFilter("all")}
            className={cn(
              "shrink-0 rounded-full border px-2.5 text-[11px] transition-colors min-h-7",
              topicFilter === "all" ? "border-transparent text-white" : ""
            )}
            style={topicFilter === "all" ? { backgroundColor: "#384877" } : { borderColor: "#d8d6cf", color: "#77736c" }}
          >
            全部主题
          </button>
          {topics.map((topicName) => (
            <button
              key={topicName}
              type="button"
              onClick={() => setTopicFilter(topicName)}
              className={cn("shrink-0 rounded-full border px-2.5 text-[11px] transition-colors min-h-7")}
              style={topicFilter === topicName
                ? { backgroundColor: "#384877", borderColor: "#384877", color: "#fff" }
                : { borderColor: "#d8d6cf", color: "#77736c" }}
            >
              {topicName}
            </button>
          ))}
        </div>
      )}

      {/* 消息流 */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-2 sm:px-6" style={{ minHeight: 200 }}>
        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-sm" style={{ color: "#99958d" }}>
            <Loader2 className="w-4 h-4 animate-spin mr-2" /> 加载讨论…
          </div>
        ) : filteredMessages.length === 0 ? (
          <EmptyState
            title={topicFilter === "all" ? "还没有讨论" : "该主题下暂无讨论"}
            description="写下第一条想法，共同约定会从这里开始。也可以 @心栈 Agent 让它整理。"
          />
        ) : (
          filteredMessages.map((m) => renderMessage(m))
        )}

        {/* @Agent 打字指示器 */}
        {agentPendingSince && (
          <div className="flex items-center gap-2.5 py-3" aria-live="polite">
            <AgentAvatar size="sm" breathing />
            <span className="text-xs font-medium" style={{ color: "#45413d" }}>心栈 Agent 思考中…</span>
            <span className="flex gap-1">
              <span className="collab-typing-dot h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "#8a867e" }} />
              <span className="collab-typing-dot h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "#8a867e" }} />
              <span className="collab-typing-dot h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "#8a867e" }} />
            </span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* 输入区 */}
      <div className="shrink-0 border-t p-4 sm:px-6" style={{ borderColor: C.line, backgroundColor: C.card }}>
        {replyTo && (
          <div className="mb-2 flex items-center gap-2 text-[11px]" style={{ color: "#77736c" }}>
            回复 <span className="font-medium" style={{ color: "#45413d" }}>{replyTo.name || "成员"}</span>
            <button type="button" onClick={() => setReplyTo(null)} className="hover:text-[#231f20]">取消</button>
          </div>
        )}
        <div className="rounded-md border bg-[#fdfcf9] p-2.5 focus-within:border-[#384877]" style={{ borderColor: "#d4d2cb" }}>
          <div className="flex items-start gap-2">
            <button
              type="button"
              onClick={() => setShowTopicInput((v) => !v)}
              className={cn(
                "mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border transition-colors",
                showTopicInput || topic ? "border-[#c7d2fe] text-[#384877]" : "text-[#99958d] hover:text-[#57534d]"
              )}
              style={showTopicInput || topic ? { backgroundColor: C.brandTint } : { borderColor: "#d8d6cf" }}
              title="给这条讨论加个主题"
            >
              <MapPin className="w-3.5 h-3.5" />
            </button>
            <Textarea
              ref={inputRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="写下想法，或 @心栈 Agent…"
              className="min-h-[38px] max-h-28 flex-1 resize-none border-0 bg-transparent p-0 text-[13px] leading-6 focus-visible:ring-0"
              rows={1}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            <Button
              size="sm"
              onClick={handleSend}
              disabled={!content.trim()}
              className="h-9 w-9 flex-shrink-0 p-0 rounded-full text-[#faf9f5] hover:opacity-90"
              style={{ backgroundColor: C.ink }}
              aria-label="发送讨论"
            >
              <ArrowUp className="w-4 h-4" />
            </Button>
          </div>
          <div className="mt-2 flex items-center justify-between border-t pt-2" style={{ borderColor: C.lineSoft }}>
            <button
              type="button"
              onClick={() => {
                setContent((cur) => `${cur}${cur.endsWith(" ") || !cur ? "" : " "}@心栈 Agent `);
                inputRef.current?.focus();
              }}
              className="inline-flex items-center gap-1 px-1.5 text-[11px] font-medium text-[#384877] min-h-7 focus-visible:outline-none"
            >
              <Bot className="h-3.5 w-3.5" />召唤 Agent
            </button>
            <span className="font-mono text-[9px] uppercase tracking-[0.12em]" style={{ color: "#b8b4ab" }}>
              {content.trim() ? "Enter 发送 · Shift+Enter 换行" : "成员与 Agent 的共同讨论"}
            </span>
          </div>
        </div>
        {showTopicInput && (
          <Input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="主题，如：住宿安排（可留空）"
            maxLength={50}
            className="mt-2 h-8 text-xs"
          />
        )}
      </div>
    </div>
  );
}

// ──────────────────────────── 动态视图 ────────────────────────────

function ActivityView({ taskId }) {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['collab', taskId, 'activity'],
    queryFn: () => httpRequest(`/api/collab/${taskId}/activity`),
    enabled: !!taskId,
    refetchInterval: 30000,
    initialData: [],
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10 text-sm" style={{ color: "#99958d" }}>
        <Loader2 className="w-4 h-4 animate-spin mr-2" /> 加载动态…
      </div>
    );
  }
  if (logs.length === 0) {
    return <EmptyState title="还没有动态" description="成员操作、确认进度与 Agent 沉淀都会按时间记录在这里。" />;
  }

  return (
    <div role="tabpanel" aria-labelledby="activity-tab" className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
      <div className="relative pl-5">
        <div className="absolute left-[7px] top-2 bottom-2 w-px" style={{ backgroundColor: "#dcdad3" }} />
        <div className="space-y-4">
          {logs.map((log) => (
            <div key={log.id} className="relative">
              <span className="absolute -left-5 top-1.5 h-[9px] w-[9px] rounded-full border-2" style={{ backgroundColor: "#fdfcf9", borderColor: "#384877" }} />
              <div className="flex flex-wrap items-center gap-2 text-[12px]">
                <span className="font-semibold" style={{ color: "#514d48" }}>{log.display_name || "成员"}</span>
                <span style={{ color: "#77736c" }}>{ACTIVITY_LABELS[log.change_type] || "更新了"}</span>
                <span className="ml-auto text-[10px]" style={{ color: "#8a867e" }}>{formatTime(log.created_date)}</span>
              </div>
              {(log.changes_detail || []).length > 0 && (
                <div className="mt-1 space-y-0.5">
                  {log.changes_detail.map((d, i) => (
                    <p key={i} className="text-[12px]" style={{ color: "#77736c" }}>
                      <span style={{ color: "#8a867e" }}>{d.field_label}</span>
                      {d.old_value !== undefined && d.old_value !== null && d.old_value !== ""
                        ? <>：<span className="line-through" style={{ color: "#8a867e" }}>{String(d.old_value).slice(0, 40)}</span> → <span style={{ color: "#45413d" }}>{String(d.new_value ?? "").slice(0, 60)}</span></>
                        : <>：<span style={{ color: "#45413d" }}>{String(d.new_value ?? "").slice(0, 60)}</span></>}
                    </p>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────── 会话窗（右栏） ────────────────────────────

export default function ConversationPane({
  taskId, view, onViewChange, highlightId, onClearHighlight, onOpenAgent, messageCount,
}) {
  return (
    <section
      id="conversation-pane"
      className="flex min-h-[75dvh] flex-col min-[900px]:h-full min-[900px]:min-h-0"
      style={{ backgroundColor: C.pane }}
    >
      <div className="shrink-0 border-b px-4 pt-4 sm:px-6" style={{ borderColor: C.line }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-mono text-[9px] uppercase tracking-[0.16em]" style={{ color: C.sub }}>Conversation</div>
            <h2 className="mt-1.5 text-[19px] font-semibold tracking-[-0.02em]" style={{ color: "#302c2a" }}>
              {view === "discussion" ? "共同讨论" : "共同动态"}
              <span className="ml-1.5 font-mono text-[11px] align-middle" style={{ color: "#8a867e" }}>
                {view === "discussion" ? `· ${messageCount}` : ""}
              </span>
            </h2>
            <p className="mt-1 text-xs leading-5" style={{ color: C.sub }}>
              {view === "discussion" ? "成员的讨论与 Agent 整理，都可以回到约定内容。" : "查看成员操作、确认进度与 Agent 沉淀记录。"}
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenAgent}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-xs font-medium transition-colors hover:border-[#384877] hover:text-[#384877] min-h-9"
            style={{ borderColor: "#d4d2cb", color: "#5b5751" }}
          >
            <Bot className="h-4 w-4" />Agent 协同
          </button>
        </div>
        <div className="mt-3 flex gap-6" role="tablist" aria-label="谈话内容切换">
          <button
            id="discussion-tab"
            type="button"
            role="tab"
            aria-selected={view === "discussion"}
            aria-controls="section-discussion"
            onClick={() => onViewChange("discussion")}
            className="border-b-2 px-0 pb-2.5 text-xs font-medium transition-colors min-h-8 focus-visible:outline-none"
            style={view === "discussion"
              ? { borderColor: "#384877", color: "#384877" }
              : { borderColor: "transparent", color: "#77736c" }}
          >
            成员讨论 <span className="ml-1 font-mono text-[10px]">{messageCount}</span>
          </button>
          <button
            id="activity-tab"
            type="button"
            role="tab"
            aria-selected={view === "activity"}
            onClick={() => onViewChange("activity")}
            className="border-b-2 px-0 pb-2.5 text-xs font-medium transition-colors min-h-8 focus-visible:outline-none"
            style={view === "activity"
              ? { borderColor: "#384877", color: "#384877" }
              : { borderColor: "transparent", color: "#77736c" }}
          >
            共同动态
          </button>
        </div>
      </div>
      {view === "discussion"
        ? <DiscussionView taskId={taskId} highlightId={highlightId} onClearHighlight={onClearHighlight} />
        : <ActivityView taskId={taskId} />}
    </section>
  );
}
