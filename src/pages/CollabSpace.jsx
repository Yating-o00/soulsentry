// 共创空间：围绕一个协同约定的四栏目（约定/讨论/沉淀/动态）+ Agent 面板
// 数据：GET /api/collab/:taskId/summary 聚合 + 讨论/动态独立查询，15s 轮询实现成员间轻量同步
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { httpRequest } from "@/api/httpClient";
import { cn } from "@/lib/utils";
import { isTaskEffectivelyCompleted } from "@/lib/taskStatus";
import { SCENARIO_LABELS } from "@/components/tasks/CollabTaskCard";
import CollabInviteDialog from "@/components/tasks/CollabInviteDialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArrowLeft, Bot, Check, Circle, CircleCheck, Clock, FileText,
  Flag, Handshake, Link2, ListChecks, Loader2, MapPin, Milestone, Plus,
  Scale, Send, Sparkles, AlertCircle, Target, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

const BRAND = "#384877";

const getInitials = (name) => {
  if (!name || typeof name !== "string") return "?";
  const trimmed = name.trim();
  if (!trimmed) return "?";
  if (/^[\u4e00-\u9fa5]/.test(trimmed)) return trimmed.slice(0, 1);
  const parts = trimmed.split(/\s+/).filter(Boolean);
  return parts.map((p) => p[0]).join("").toUpperCase().slice(0, 2) || "?";
};

const formatTime = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return d.toLocaleString("zh-CN", sameDay
    ? { hour: "2-digit", minute: "2-digit" }
    : { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
};

const NODE_TYPE_LABELS = { time: "时间节点", stage: "阶段", decision: "决策", review: "复盘" };
const NODE_TYPE_ICONS = { time: Clock, stage: Flag, decision: Scale, review: RefreshCw };

const MARK_LABELS = { consensus: "共识", dispute: "分歧", pending: "待确认" };
const MARK_STYLES = {
  consensus: "bg-emerald-50 text-emerald-700 border-emerald-200",
  dispute: "bg-rose-50 text-rose-700 border-rose-200",
  pending: "bg-amber-50 text-amber-700 border-amber-200",
};

const DOC_GROUP_ORDER = ["consensus", "dispute", "minutes", "file", "decision", "review"];
const DOC_TYPE_LABELS = {
  consensus: "共识纪要",
  dispute: "分歧清单",
  minutes: "纪要",
  file: "文件",
  decision: "决策",
  review: "复盘",
};

const ACTIVITY_LABELS = {
  collab_member_added: "新增成员",
  collab_subtask_draft: "新增子约定草案",
  collab_subtask_confirmed: "子约定已确认",
  collab_doc_updated: "更新文档",
  collab_node_done: "完成节点",
  collab_agent_action: "Agent 操作",
  collab_message: "新讨论",
  collab_node_created: "新增执行节点",
  collab_node_updated: "更新执行节点",
  collab_node_deleted: "删除执行节点",
  collab_doc_created: "新建沉淀文档",
  collab_doc_confirmed: "确认沉淀文档",
};

const AGENT_ACTION_TEXT = {
  tidy: "心栈 Agent 正在整理讨论（约 30 秒）…",
  minutes: "心栈 Agent 正在生成纪要（约 30 秒）…",
  disputes: "心栈 Agent 正在协调分歧（约 30 秒）…",
  extract_subtasks: "心栈 Agent 正在提取子约定（约 30 秒）…",
};

const agentSuccessText = (action, res) => {
  const r = res?.result || {};
  switch (action) {
    case "tidy": return r.summary || "整理完成：共识纪要与分歧清单已更新";
    case "minutes": return r.doc ? `纪要「${r.doc.title}」已生成` : "纪要已生成";
    case "disputes": return `已向相关成员发出 ${r.questions_count ?? 0} 个补充问题`;
    case "extract_subtasks": return `已生成 ${r.created?.length ?? 0} 条子约定草案，待确认后生效`;
    default: return "Agent 执行完成";
  }
};

// ──────────────────────────── 讨论 Tab ────────────────────────────

function DiscussionTab({ taskId, highlightId, onClearHighlight }) {
  const queryClient = useQueryClient();
  const [topicFilter, setTopicFilter] = useState("all");
  const [selectedId, setSelectedId] = useState(null); // 提取子约定前先选一条消息
  const [replyTo, setReplyTo] = useState(null);
  const [content, setContent] = useState("");
  const [topic, setTopic] = useState("");
  const [showTopicInput, setShowTopicInput] = useState(false);
  const [agentRunning, setAgentRunning] = useState(false);
  const bottomRef = useRef(null);

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

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['collab', taskId] });
  };

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
      const res = await httpRequest(`/api/collab/${taskId}/convert`, {
        method: "POST",
        body: { comment_id: message.id, target },
      });
      if (target === "subtask") toast.success("已转为子约定草案，待确认后生效");
      else if (target === "node") toast.success("已标记为执行节点");
      else toast.success("已存为沉淀文件");
      invalidateAll();
      return res;
    } catch (error) {
      toast.error(error?.message || "转换失败");
    }
  };

  const handleMark = async (message, mark) => {
    try {
      await httpRequest(`/api/comments/${message.id}`, { method: "PATCH", body: { mark } } );
      invalidateAll();
    } catch (error) {
      toast.error(error?.message || "标记失败");
    }
  };

  const handleSend = async () => {
    const text = content.trim();
    if (!text) return;
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
      if (/@\s*(agent|心栈)/i.test(text)) {
        toast.info("已 @心栈 Agent，它整理后会回复到讨论里", { duration: 4000 });
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
          "group relative rounded-xl border transition-colors",
          isReply ? "ml-10 border-transparent bg-slate-50/60 p-3" : "border-slate-100 bg-white p-3.5",
          isSelected && "border-indigo-300 ring-2 ring-indigo-100"
        )}
      >
        <div className="flex items-start gap-2.5">
          <Avatar className={cn("w-8 h-8 flex-shrink-0", isAgent && "ring-2 ring-indigo-200")}>
            <AvatarFallback className={cn("text-xs", isAgent ? "bg-indigo-500 text-white" : "bg-[#384877] text-white")}>
              {isAgent ? <Bot className="w-4 h-4" /> : getInitials(message.created_by_name)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[13px] font-semibold text-slate-800">
                {isAgent ? "心栈 Agent" : message.created_by_name || "成员"}
              </span>
              {isAgent && (
                <Badge className="text-[10px] px-1.5 py-0 bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-50">
                  <Bot className="w-2.5 h-2.5 mr-0.5" />机器人
                </Badge>
              )}
              {message.topic && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-slate-200 text-slate-500">
                  {message.topic}
                </Badge>
              )}
              {message.mark && (
                <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", MARK_STYLES[message.mark])}>
                  {MARK_LABELS[message.mark]}
                </Badge>
              )}
              <span className="text-[11px] text-slate-400">{formatTime(message.created_date)}</span>
            </div>
            <p className="text-[13px] text-slate-700 leading-relaxed mt-1 whitespace-pre-wrap break-words">{message.content}</p>

            {/* hover 操作（Agent 消息与回复不提供转换） */}
            {!isAgent && !isReply && (
              <div className="hidden md:flex absolute right-2 top-2 items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => handleConvert(message, "subtask")}
                  className="text-[11px] px-2 py-1 rounded-md bg-slate-100 hover:bg-[#eef2ff] text-slate-600 hover:text-[#384877] transition-colors"
                >
                  转为子约定
                </button>
                <button
                  onClick={() => handleConvert(message, "node")}
                  className="text-[11px] px-2 py-1 rounded-md bg-slate-100 hover:bg-[#eef2ff] text-slate-600 hover:text-[#384877] transition-colors"
                >
                  标记节点
                </button>
                <button
                  onClick={() => handleConvert(message, "doc")}
                  className="text-[11px] px-2 py-1 rounded-md bg-slate-100 hover:bg-[#eef2ff] text-slate-600 hover:text-[#384877] transition-colors"
                >
                  存为文件
                </button>
                <button
                  onClick={() => setSelectedId(isSelected ? null : message.id)}
                  className={cn(
                    "text-[11px] px-2 py-1 rounded-md transition-colors",
                    isSelected ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 hover:bg-indigo-50 text-slate-600 hover:text-indigo-700"
                  )}
                >
                  {isSelected ? "已选为提取源" : "选为提取源"}
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className={cn(
                        "text-[11px] px-2 py-1 rounded-md transition-colors flex items-center gap-0.5",
                        message.mark ? MARK_STYLES[message.mark] : "bg-slate-100 hover:bg-[#eef2ff] text-slate-600 hover:text-[#384877]"
                      )}
                    >
                      {message.mark ? MARK_LABELS[message.mark] : "标记"}
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
              </div>
            )}
            {!isAgent && !isReply && (
              <div className="flex md:hidden items-center gap-2 mt-1.5">
                <button onClick={() => handleConvert(message, "subtask")} className="text-[11px] text-[#384877]">转为子约定</button>
                <button onClick={() => handleConvert(message, "node")} className="text-[11px] text-[#384877]">标记节点</button>
                <button onClick={() => handleConvert(message, "doc")} className="text-[11px] text-[#384877]">存为文件</button>
                <button
                  onClick={() => setReplyTo({ id: message.id, name: message.created_by_name })}
                  className="text-[11px] text-slate-400"
                >
                  回复
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="text-[11px] text-slate-400">
                      {message.mark ? MARK_LABELS[message.mark] : "标记"}
                    </button>
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
                onClick={() => setReplyTo({ id: message.id, name: message.created_by_name })}
                className="hidden md:inline-block mt-1 text-[11px] text-slate-400 hover:text-[#384877] opacity-0 group-hover:opacity-100 transition-opacity"
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
    <div className="flex flex-col h-full">
      {/* Agent 操作区 */}
      <div className="flex items-center gap-2 flex-wrap pb-3 border-b border-slate-100">
        <Button
          size="sm"
          onClick={() => runAgent("tidy")}
          disabled={agentRunning}
          className="bg-[#384877] hover:bg-[#2e3a62] h-8"
        >
          {agentRunning ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1" />}
          整理
        </Button>
        {[
          { action: "extract_subtasks", label: "提取子约定", icon: ListChecks },
          { action: "disputes", label: "协调分歧", icon: Handshake },
          { action: "minutes", label: "生成纪要", icon: FileText },
        ].map(({ action, label, icon: Icon }) => (
          <button
            key={action}
            onClick={() => runAgent(action)}
            disabled={agentRunning}
            className={cn(
              "flex items-center gap-1 text-xs px-3 py-1.5 rounded-full border transition-colors disabled:opacity-50",
              action === "extract_subtasks" && selectedId
                ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                : "border-slate-200 text-slate-600 hover:border-[#c7d2fe] hover:text-[#384877] hover:bg-[#eef2ff]"
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
        {selectedId && (
          <button onClick={() => setSelectedId(null)} className="text-[11px] text-indigo-500 hover:underline">
            取消选中的提取源
          </button>
        )}
      </div>

      {/* 主题过滤 */}
      {topics.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap py-3">
          <button
            onClick={() => setTopicFilter("all")}
            className={cn(
              "text-[11px] px-2.5 py-1 rounded-full border transition-colors",
              topicFilter === "all" ? "bg-[#384877] text-white border-[#384877]" : "border-slate-200 text-slate-500 hover:border-slate-300"
            )}
          >
            全部主题
          </button>
          {topics.map((topicName) => (
            <button
              key={topicName}
              onClick={() => setTopicFilter(topicName)}
              className={cn(
                "text-[11px] px-2.5 py-1 rounded-full border transition-colors",
                topicFilter === topicName ? "bg-[#384877] text-white border-[#384877]" : "border-slate-200 text-slate-500 hover:border-slate-300"
              )}
            >
              {topicName}
            </button>
          ))}
        </div>
      )}

      {/* 消息流 */}
      <div className="flex-1 overflow-y-auto space-y-3 py-2 pr-1" style={{ minHeight: 280 }}>
        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-slate-400 text-sm">
            <Loader2 className="w-4 h-4 animate-spin mr-2" /> 加载讨论…
          </div>
        ) : filteredMessages.length === 0 ? (
          <p className="text-center text-sm text-slate-400 py-10">
            {topicFilter === "all" ? "还没有讨论，写下第一条想法吧" : "该主题下暂无讨论"}
          </p>
        ) : (
          filteredMessages.map((m) => renderMessage(m))
        )}
        <div ref={bottomRef} />
      </div>

      {/* 输入区 */}
      <div className="pt-3 border-t border-slate-100 space-y-2">
        {replyTo && (
          <div className="flex items-center gap-2 text-[11px] text-slate-500">
            回复 <span className="font-medium text-slate-700">{replyTo.name || "成员"}</span>
            <button onClick={() => setReplyTo(null)} className="text-slate-400 hover:text-slate-600">取消</button>
          </div>
        )}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowTopicInput((v) => !v)}
            className={cn(
              "flex-shrink-0 w-8 h-8 rounded-lg border flex items-center justify-center transition-colors",
              showTopicInput || topic ? "border-[#c7d2fe] bg-[#eef2ff] text-[#384877]" : "border-slate-200 text-slate-400 hover:text-slate-600"
            )}
            title="给这条讨论加个主题"
          >
            <MapPin className="w-4 h-4" />
          </button>
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="写下想法，或 @心栈 Agent…"
            className="min-h-[38px] max-h-28 text-[13px] resize-none"
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
            className="flex-shrink-0 h-9 w-9 p-0 bg-[#384877] hover:bg-[#2e3a62]"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
        {showTopicInput && (
          <Input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="主题，如：住宿安排（可留空）"
            maxLength={50}
            className="h-8 text-xs"
          />
        )}
      </div>
    </div>
  );
}

// ──────────────────────────── 沉淀 Tab ────────────────────────────

function DocsTab({ docs, onConfirm, onJumpToSource }) {
  const [expanded, setExpanded] = useState({});
  const groups = DOC_GROUP_ORDER
    .map((type) => ({ type, items: docs.filter((d) => d.doc_type === type) }))
    .filter((g) => g.items.length > 0);

  if (docs.length === 0) {
    return (
      <p className="text-center text-sm text-slate-400 py-12">
        还没有沉淀文档，在讨论里「存为文件」或让 Agent 整理 / 生成纪要
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {groups.map(({ type, items }) => (
        <div key={type}>
          <p className="text-[11px] font-bold tracking-widest text-slate-400 uppercase mb-2.5">
            {DOC_TYPE_LABELS[type]} · {items.length}
          </p>
          <div className="space-y-2">
            {items.map((doc) => {
              const isOpen = expanded[doc.id];
              const isDraft = doc.status === "draft";
              return (
                <div key={doc.id} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-slate-800">{doc.title}</span>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-slate-500">
                      v{doc.version}
                    </Badge>
                    {isDraft ? (
                      <Badge className="text-[10px] px-1.5 py-0 bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-50">
                        <AlertCircle className="w-2.5 h-2.5 mr-0.5" /> 待确认
                      </Badge>
                    ) : (
                      <Badge className="text-[10px] px-1.5 py-0 bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50">
                        <Check className="w-2.5 h-2.5 mr-0.5" /> 已确认
                      </Badge>
                    )}
                    <span className="text-[11px] text-slate-400 ml-auto">
                      更新于 {formatTime(doc.updated_date)}
                    </span>
                  </div>
                  <div
                    className={cn(
                      "mt-2 text-[13px] text-slate-600 whitespace-pre-wrap break-words leading-relaxed",
                      !isOpen && "line-clamp-3"
                    )}
                  >
                    {doc.content || "（空文档）"}
                  </div>
                  <div className="flex items-center gap-3 mt-2.5">
                    <button
                      onClick={() => setExpanded((prev) => ({ ...prev, [doc.id]: !prev[doc.id] }))}
                      className="text-[11px] text-slate-400 hover:text-[#384877]"
                    >
                      {isOpen ? "收起" : "展开全文"}
                    </button>
                    {doc.source_comment_id && (
                      <button
                        onClick={() => onJumpToSource?.(doc.source_comment_id)}
                        className="flex items-center gap-1 text-[11px] text-[#384877] hover:underline underline-offset-2"
                      >
                        <Link2 className="w-3 h-3" /> 来源讨论
                      </button>
                    )}
                    {isDraft && (
                      <button
                        onClick={() => onConfirm(doc)}
                        className="ml-auto flex items-center gap-1 text-[11px] font-medium text-white bg-[#384877] hover:bg-[#2e3a62] rounded-full px-3 py-1.5 transition-colors"
                      >
                        <Check className="w-3 h-3" /> 确认此版本
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ──────────────────────────── 动态 Tab ────────────────────────────

function ActivityTab({ taskId }) {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['collab', taskId, 'activity'],
    queryFn: () => httpRequest(`/api/collab/${taskId}/activity`),
    enabled: !!taskId,
    refetchInterval: 30000,
    initialData: [],
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10 text-slate-400 text-sm">
        <Loader2 className="w-4 h-4 animate-spin mr-2" /> 加载动态…
      </div>
    );
  }
  if (logs.length === 0) {
    return <p className="text-center text-sm text-slate-400 py-12">还没有动态，去讨论里说点什么吧</p>;
  }

  return (
    <div className="relative pl-5">
      <div className="absolute left-[7px] top-2 bottom-2 w-px bg-slate-200" />
      <div className="space-y-4">
        {logs.map((log) => (
          <div key={log.id} className="relative">
            <span className="absolute -left-5 top-1.5 w-[9px] h-[9px] rounded-full bg-white border-2 border-[#384877]" />
            <div className="flex items-center gap-2 flex-wrap text-[13px]">
              <span className="font-medium text-slate-800">{log.display_name || "成员"}</span>
              <span className="text-slate-500">{ACTIVITY_LABELS[log.change_type] || "更新了"}</span>
              <span className="text-[11px] text-slate-400 ml-auto">{formatTime(log.created_date)}</span>
            </div>
            {(log.changes_detail || []).length > 0 && (
              <div className="mt-1 space-y-0.5">
                {log.changes_detail.map((d, i) => (
                  <p key={i} className="text-[12px] text-slate-500">
                    <span className="text-slate-400">{d.field_label}</span>
                    {d.old_value !== undefined && d.old_value !== null && d.old_value !== ""
                      ? <>：<span className="text-slate-400 line-through">{String(d.old_value).slice(0, 40)}</span> → <span className="text-slate-700">{String(d.new_value ?? "").slice(0, 60)}</span></>
                      : <>：<span className="text-slate-700">{String(d.new_value ?? "").slice(0, 60)}</span></>}
                  </p>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ──────────────────────────── 约定 Tab ────────────────────────────

function AgreementsTab({ summary, taskId, currentUserId, onOpenInvite, onJumpToDiscussion }) {
  const queryClient = useQueryClient();
  const [newSubTitle, setNewSubTitle] = useState("");
  const [addingSub, setAddingSub] = useState(false);
  const [newNode, setNewNode] = useState({ title: "", node_type: "stage" });
  const [addingNode, setAddingNode] = useState(false);
  const [confirmingId, setConfirmingId] = useState(null);
  const [togglingNodeId, setTogglingNodeId] = useState(null);

  const task = summary?.task;
  const collab = task?.metadata?.collab;
  const members = summary?.members || [];
  const nodes = summary?.nodes || [];
  const subtasks = useMemo(() => {
    const out = [];
    const walk = (list) => { for (const n of list || []) { out.push(n); walk(n.children); } };
    walk(summary?.subtasks);
    return out;
  }, [summary?.subtasks]);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['collab', taskId] });
  };

  const pendingConfirmCount = subtasks.filter((s) => s.metadata?.collab?.state === "draft").length;

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

  const handleToggleNode = async (node) => {
    setTogglingNodeId(node.id);
    try {
      await httpRequest(`/api/collab/${taskId}/nodes/${node.id}`, {
        method: "PATCH",
        body: { done_at: node.done_at ? null : new Date().toISOString() },
      });
      invalidateAll();
    } catch (error) {
      toast.error(error?.message || "操作失败");
    } finally {
      setTogglingNodeId(null);
    }
  };

  const handleAddNode = async () => {
    const title = newNode.title.trim();
    if (!title) return;
    setAddingNode(true);
    try {
      await httpRequest(`/api/collab/${taskId}/nodes`, {
        method: "POST",
        body: { title, node_type: newNode.node_type },
      });
      setNewNode({ title: "", node_type: "stage" });
      invalidateAll();
      toast.success("节点已添加");
    } catch (error) {
      toast.error(error?.message || "添加失败");
    } finally {
      setAddingNode(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 目标 + 成员卡 */}
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-[#eef2ff]/70 to-white p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-[220px]">
            <p className="text-[11px] font-bold tracking-widest text-[#384877]/70 uppercase mb-1.5 flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5" /> 共同目标
            </p>
            <p className="text-[15px] font-semibold text-slate-800">{collab?.goal || task?.title}</p>
            <p className="text-[11px] text-slate-400 mt-1.5">
              确认规则：{collab?.confirmRule === "all" ? "重要约定全员确认" : "发起人确认生效"}
              {pendingConfirmCount > 0 && <span className="text-amber-600"> · {pendingConfirmCount} 条草案待确认</span>}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex -space-x-2">
              {members.map((m) => (
                <Avatar key={m.user_id || m.id} className="w-8 h-8 border-2 border-white" title={m.display_name}>
                  <AvatarFallback className="text-[11px] bg-[#384877] text-white">
                    {getInitials(m.display_name)}
                  </AvatarFallback>
                </Avatar>
              ))}
            </div>
            <button
              onClick={onOpenInvite}
              className="text-xs text-[#384877] hover:underline underline-offset-2 whitespace-nowrap"
            >
              {members.length} 人共同构建 · 管理与邀请
            </button>
          </div>
        </div>
      </div>

      {/* 子约定 */}
      <div>
        <p className="text-[11px] font-bold tracking-widest text-slate-400 uppercase mb-2.5">
          Agreements 子约定 · {subtasks.length}
        </p>
        <div className="space-y-2">
          {subtasks.length === 0 && (
            <p className="text-xs text-slate-400 italic py-3 text-center bg-slate-50/60 rounded-xl border border-dashed border-slate-200">
              还没有子约定：在讨论里「转为子约定」，或直接在下添加
            </p>
          )}
          {subtasks.map((sub) => {
            const done = isTaskEffectivelyCompleted(sub);
            const subCollab = sub.metadata?.collab;
            const isDraft = subCollab?.state === "draft";
            const confirmedCount = Array.isArray(subCollab?.confirmedBy) ? subCollab.confirmedBy.length : 0;
            const alreadyConfirmed = currentUserId && Array.isArray(subCollab?.confirmedBy) && subCollab.confirmedBy.includes(currentUserId);
            const assigneeId = subCollab?.assignee;
            const assignee = assigneeId ? members.find((m) => m.user_id === assigneeId) : null;
            return (
              <div
                key={sub.id}
                className={cn(
                  "flex items-center gap-3 rounded-xl border p-3",
                  isDraft ? "border-amber-200 bg-amber-50/40" : "border-slate-200 bg-white"
                )}
              >
                <button
                  onClick={() => toast.info("完成状态请在约定卡片或详情中勾选；草案需先确认生效")}
                  className="flex-shrink-0"
                  title={done ? "已完成" : "进行中"}
                >
                  {done
                    ? <CircleCheck className="w-5 h-5 text-[#384877]" />
                    : <Circle className="w-5 h-5 text-slate-300" />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={cn("text-sm font-medium truncate", done && "text-slate-400 line-through")}>
                      {sub.title}
                    </span>
                    {isDraft && (
                      <Badge className="text-[10px] px-1.5 py-0 bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-50">
                        <AlertCircle className="w-2.5 h-2.5 mr-0.5" /> 待确认
                      </Badge>
                    )}
                    {subCollab?.sourceCommentId && (
                      <button
                        onClick={() => onJumpToDiscussion?.(subCollab.sourceCommentId)}
                        className="text-[10px] text-[#384877] hover:underline underline-offset-2"
                      >
                        来源讨论
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-400 flex-wrap">
                    {subCollab?.standard && <span>完成标准:{subCollab.standard}</span>}
                    {assignee && <span>· 负责 {assignee.display_name}</span>}
                    {sub.reminder_time && <span>· {formatTime(sub.reminder_time)}</span>}
                    {isDraft && <span className="text-amber-600">· 确认 {confirmedCount}/{members.length || 1}</span>}
                  </div>
                </div>
                {isDraft && !alreadyConfirmed && (
                  <Button
                    size="sm"
                    onClick={() => handleConfirm(sub)}
                    disabled={confirmingId === sub.id}
                    className="h-7 text-xs bg-[#384877] hover:bg-[#2e3a62] flex-shrink-0"
                  >
                    {confirmingId === sub.id ? "确认中…" : "确认"}
                  </Button>
                )}
                {isDraft && alreadyConfirmed && (
                  <span className="text-[11px] text-amber-600 flex-shrink-0">已确认，待他人</span>
                )}
              </div>
            );
          })}

          {/* 行内添加普通子约定 */}
          <div className="flex items-center gap-2">
            <Plus className="w-4 h-4 text-slate-400 flex-shrink-0" />
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
        </div>
      </div>

      {/* 执行节点时间线 */}
      <div>
        <p className="text-[11px] font-bold tracking-widest text-slate-400 uppercase mb-2.5 flex items-center gap-1.5">
          <Milestone className="w-3.5 h-3.5" /> 执行节点 · {nodes.filter((n) => n.done_at).length}/{nodes.length}
        </p>
        {nodes.length === 0 && (
          <p className="text-xs text-slate-400 italic py-3 text-center bg-slate-50/60 rounded-xl border border-dashed border-slate-200 mb-2">
            还没有执行节点：把讨论「标记节点」，或在下方添加
          </p>
        )}
        <div className="space-y-1.5">
          {nodes.map((node) => {
            const Icon = NODE_TYPE_ICONS[node.node_type] || Flag;
            const done = !!node.done_at;
            return (
              <div key={node.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                <button
                  onClick={() => handleToggleNode(node)}
                  disabled={togglingNodeId === node.id}
                  className="flex-shrink-0"
                  title={done ? "标记为未完成" : "勾选完成"}
                >
                  {done
                    ? <CircleCheck className="w-5 h-5 text-[#384877]" />
                    : <Circle className="w-5 h-5 text-slate-300 hover:text-[#384877] transition-colors" />}
                </button>
                <Icon className={cn("w-4 h-4 flex-shrink-0", done ? "text-slate-300" : "text-[#384877]/70")} />
                <span className={cn("text-sm flex-1 min-w-0 truncate", done ? "text-slate-400 line-through" : "text-slate-700")}>
                  {node.title}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 flex-shrink-0">
                  {NODE_TYPE_LABELS[node.node_type] || node.node_type}
                </span>
                {node.due_at && <span className="text-[11px] text-slate-400 flex-shrink-0">{formatTime(node.due_at)}</span>}
                {done && <span className="text-[11px] text-slate-400 flex-shrink-0">{formatTime(node.done_at)}</span>}
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-2 mt-2">
          {(["time", "stage", "decision", "review"]).map((type) => (
            <button
              key={type}
              onClick={() => setNewNode((prev) => ({ ...prev, node_type: type }))}
              className={cn(
                "text-[11px] px-2.5 py-1.5 rounded-full border transition-colors",
                newNode.node_type === type
                  ? "border-[#384877] bg-[#eef2ff] text-[#384877]"
                  : "border-slate-200 text-slate-500 hover:border-slate-300"
              )}
            >
              {NODE_TYPE_LABELS[type]}
            </button>
          ))}
          <Input
            value={newNode.title}
            onChange={(e) => setNewNode((prev) => ({ ...prev, title: e.target.value }))}
            onKeyDown={(e) => { if (e.key === "Enter") handleAddNode(); }}
            placeholder="节点内容，回车保存"
            className="h-8 text-xs border-dashed"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={handleAddNode}
            disabled={addingNode || !newNode.title.trim()}
            className="h-8 text-xs flex-shrink-0"
          >
            {addingNode ? "添加中…" : "添加"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────── 页面主体 ────────────────────────────

export default function CollabSpace() {
  const [searchParams] = useSearchParams();
  const taskId = searchParams.get("taskId");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("agreements");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [highlightCommentId, setHighlightCommentId] = useState(null);
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

  const task = summary?.task;
  const collab = task?.metadata?.collab;
  const members = summary?.members || [];
  const agentOn = collab?.agent?.enabled && !collab?.agent?.paused;

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['collab', taskId] });
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
  };

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

  const handleConfirmDoc = async (doc) => {
    try {
      await httpRequest(`/api/collab/${taskId}/docs/${doc.id}/confirm`, { method: "POST" });
      invalidateAll();
      toast.success(`「${doc.title}」已确认（v${doc.version + 1}）`);
    } catch (e) {
      toast.error(e?.message || "确认失败");
    }
  };

  const jumpToDiscussion = (commentId) => {
    setTab("discussion");
    setHighlightCommentId(commentId);
  };

  if (!taskId) {
    return (
      <div className="min-h-screen bg-[#f8f9fa] flex flex-col items-center justify-center gap-4">
        <p className="text-slate-500">缺少 taskId 参数</p>
        <Button variant="outline" onClick={() => navigate("/tasks")}>返回约定列表</Button>
      </div>
    );
  }

  const TABS = [
    { key: "agreements", label: "约定" },
    { key: "discussion", label: "讨论" },
    { key: "docs", label: "沉淀" },
    { key: "activity", label: "动态" },
  ];

  return (
    <div className="min-h-screen bg-[#f8f9fa] pb-16 font-sans text-slate-900">
      <style>{`
        .collab-msg-flash { animation: collabFlash 2.4s ease-out; }
        @keyframes collabFlash {
          0%, 40% { background-color: #eef2ff; box-shadow: 0 0 0 3px rgba(56,72,119,0.18); }
          100% { background-color: transparent; box-shadow: none; }
        }
      `}</style>

      <main className="pt-8 px-4 md:px-6 max-w-5xl mx-auto">
        {/* 头部 */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => navigate("/tasks")}
            className="w-9 h-9 rounded-xl border border-slate-200 bg-white flex items-center justify-center text-slate-500 hover:text-[#384877] hover:border-[#c7d2fe] transition-colors"
            title="返回约定列表"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-slate-900 truncate">
                {isLoading ? "加载中…" : task?.title || "共创空间"}
              </h1>
              {collab && (
                <Badge className="bg-[#384877] hover:bg-[#384877] text-white border-transparent text-[10px] px-2 py-0">
                  {SCENARIO_LABELS[collab.scenario] || SCENARIO_LABELS.custom}
                </Badge>
              )}
              {summary?.stats?.pending_confirms > 0 && (
                <Badge className="bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-50 text-[10px] px-2 py-0">
                  {summary.stats.pending_confirms} 条待确认
                </Badge>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5 truncate">
              {members.length} 位成员 · 每 15 秒自动同步
            </p>
          </div>

          {/* Agent 暂停开关 */}
          {collab?.agent?.enabled && (
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className={cn("hidden sm:flex items-center gap-1 text-[11px]", agentOn ? "text-indigo-600" : "text-slate-400")}>
                <Bot className="w-3.5 h-3.5" />
                {agentOn ? "Agent 运行中" : "Agent 已暂停"}
              </span>
              <Switch
                checked={agentOn}
                onCheckedChange={handleToggleAgent}
                disabled={togglingAgent}
                className="data-[state=checked]:bg-[#384877]"
              />
            </div>
          )}
        </div>

        {/* 错误态 */}
        {error && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-8 text-center">
            <p className="text-rose-700 text-sm">{error?.data?.message || error?.message || "无法打开共创空间"}</p>
            <Button variant="outline" className="mt-4" onClick={() => navigate("/tasks")}>返回约定列表</Button>
          </div>
        )}

        {summary && (
          <>
            {/* Tab 栏 */}
            <div className="flex items-center gap-1 bg-white p-1 rounded-full shadow-sm border border-slate-200/60 mb-6 w-fit">
              {TABS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={cn(
                    "px-5 py-2 rounded-full text-sm font-medium transition-all",
                    tab === key ? "bg-[#384877] text-white shadow-md" : "text-slate-600 hover:bg-slate-50"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="bg-white/60 rounded-2xl p-4 md:p-6">
              {tab === "agreements" && (
                <AgreementsTab
                  summary={summary}
                  taskId={taskId}
                  currentUserId={currentUser?.id}
                  onOpenInvite={() => setInviteOpen(true)}
                  onJumpToDiscussion={jumpToDiscussion}
                />
              )}
              {tab === "discussion" && (
                <div className="h-[calc(100vh-320px)] min-h-[420px] flex flex-col">
                  <DiscussionTab
                    taskId={taskId}
                    highlightId={highlightCommentId}
                    onClearHighlight={() => setHighlightCommentId(null)}
                  />
                </div>
              )}
              {tab === "docs" && (
                <DocsTab
                  docs={summary.docs || []}
                  onConfirm={handleConfirmDoc}
                  onJumpToSource={jumpToDiscussion}
                />
              )}
              {tab === "activity" && <ActivityTab taskId={taskId} />}
            </div>
          </>
        )}
      </main>

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
