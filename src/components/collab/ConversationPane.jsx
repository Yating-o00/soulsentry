// 会话窗（右栏全高）：成员讨论 / 共同动态双 tab + 输入框
// 讨论 = 各方 + Agent 的自由聊天：输入 @ 自动弹出 Agent（总结 / 查外部信息 / 转子约定·节点·沉淀），
// 支持插入图片与文档附件（可随消息沉淀为文件）；发送含 @ 的内容后显示打字指示器，
// 轮询发现更新的 agent 消息后撤下指示器、滚动到底部并高亮该消息 2 秒
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUp, Bot, Check, ChevronDown, FileText, Loader2, MapPin, Paperclip, Sparkles, X,
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
  ACTIVITY_LABELS, MARK_LABELS, MARK_STYLES, agentIntentFor, C, formatTime,
} from "./constants";
import { AgentAvatar, EmptyState, MemberAvatar } from "./Common";
import OptionCardView from "./OptionCardView";

const msgActionCls = "inline-flex items-center rounded px-1.5 text-[10px] font-medium text-[#77736c] transition-colors hover:bg-[#efefe9] hover:text-[#384877] min-h-7 focus-visible:outline-none";

const formatSize = (bytes) => {
  if (bytes == null || Number.isNaN(bytes)) return "";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
};

// 消息附件：图片内联预览，其他文件卡片下载；Agent 选项卡由 OptionCardView 单独渲染
function AttachmentView({ attachments }) {
  if (!attachments || attachments.length === 0) return null;
  const images = attachments.filter((a) => (a?.type || "").startsWith("image/"));
  const files = attachments.filter((a) => !(a?.type || "").startsWith("image/") && a?.type !== "option_card");
  return (
    <div className="mt-2 space-y-2">
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((a, i) => (
            <a key={i} href={a.url} target="_blank" rel="noreferrer" className="block">
              <img
                src={a.url}
                alt={a.name || "图片附件"}
                className="max-h-44 rounded-lg border object-cover"
                style={{ borderColor: C.lineSoft }}
                loading="lazy"
              />
            </a>
          ))}
        </div>
      )}
      {files.map((a, i) => (
        <a
          key={i}
          href={a.url}
          target="_blank"
          rel="noreferrer"
          className="flex max-w-sm items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors hover:border-[#384877]"
          style={{ borderColor: C.lineSoft, color: "#45413d" }}
        >
          <FileText className="h-3.5 w-3.5 shrink-0" style={{ color: "#77736c" }} />
          <span className="truncate">{a.name || "文件"}</span>
          {a.size != null && (
            <span className="shrink-0 font-mono text-[10px]" style={{ color: "#8a867e" }}>
              {formatSize(a.size)}
            </span>
          )}
        </a>
      ))}
    </div>
  );
}

// 删除消息（自己的内容）：第一次点击变为确认，3 秒后自动复位
function DeleteMessageButton({ onDelete }) {
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => setConfirming(false), 3000);
    return () => clearTimeout(timer);
  }, [confirming]);
  return (
    <button
      type="button"
      onClick={() => (confirming ? onDelete() : setConfirming(true))}
      className={cn(msgActionCls, confirming && "text-rose-600 hover:text-rose-600")}
    >
      {confirming ? "确认删除？" : "删除"}
    </button>
  );
}

// 消息操作（桌面 hover 显示，移动端常驻）：转为子约定 / 标记节点 / 存为文件 / 标记 / 回复 / 删除
function MessageActions({ message, canDelete, onConvert, onMark, onReply, onDelete }) {
  return (
    <div className="mt-1 flex flex-wrap gap-x-1 min-[900px]:opacity-0 min-[900px]:transition-opacity min-[900px]:group-hover:opacity-100">
      <button type="button" onClick={() => onConvert(message, "subtask")} className={msgActionCls}>转为子约定</button>
      <button type="button" onClick={() => onConvert(message, "node")} className={msgActionCls}>标记节点</button>
      <button type="button" onClick={() => onConvert(message, "doc")} className={msgActionCls}>存为文件</button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className={cn(msgActionCls, message.mark && MARK_STYLES[message.mark])}>
            {message.mark ? MARK_LABELS[message.mark] : "标记"}
            <ChevronDown className="h-3 w-3 ml-0.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="text-xs">
          {Object.entries(MARK_LABELS).map(([value, label]) => (
            <DropdownMenuItem key={value} onClick={() => onMark(message, value)} className="gap-1.5">
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
            <DropdownMenuItem onClick={() => onMark(message, null)} className="text-slate-400">
              清除标记
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <button type="button" onClick={() => onReply(message)} className={msgActionCls}>回复</button>
      {canDelete && <DeleteMessageButton onDelete={() => onDelete(message)} />}
    </div>
  );
}

// ──────────────────────────── 讨论视图 ────────────────────────────

function DiscussionView({ taskId, highlightId, onClearHighlight, currentUserId }) {
  const queryClient = useQueryClient();
  const [topicFilter, setTopicFilter] = useState("all");
  const [replyTo, setReplyTo] = useState(null);
  const [content, setContent] = useState("");
  const [topic, setTopic] = useState("");
  const [showTopicInput, setShowTopicInput] = useState(false);
  const [attachments, setAttachments] = useState([]); // {url,name,type,size}
  const [uploading, setUploading] = useState(false);
  const [mentionOpen, setMentionOpen] = useState(false); // @Agent 自动弹出
  const [agentPendingSince, setAgentPendingSince] = useState(null); // @Agent 打字指示器
  const [flashingId, setFlashingId] = useState(null);
  const streamRef = useRef(null);
  const inputRef = useRef(null);
  const fileRef = useRef(null);

  // 只滚动消息流内部，避免 scrollIntoView 连带滚动页面祖先（手机端会导致整个版面上移）
  const scrollStreamToBottom = (behavior = "smooth") => {
    const el = streamRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior });
  };

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
      setTimeout(() => scrollStreamToBottom(), 100);
      setTimeout(() => setFlashingId(null), 2200);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, agentPendingSince]);

  // 光标前出现 @xx 时自动弹出 Agent 选项
  const detectMention = (value, cursorPos) => {
    const before = value.slice(0, cursorPos ?? value.length);
    setMentionOpen(/@[^\s@]{0,20}$/.test(before));
  };

  const insertMention = () => {
    const el = inputRef.current;
    const pos = el?.selectionStart ?? content.length;
    const before = content.slice(0, pos);
    const after = content.slice(pos);
    const replaced = before.replace(/@[^\s@]{0,20}$/, "@心栈 Agent ");
    setContent(replaced + after);
    setMentionOpen(false);
    window.requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(replaced.length, replaced.length);
    });
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

  // 删除自己发的消息（回复也可删）
  const handleDelete = async (message) => {
    try {
      await httpRequest(`/api/comments/${message.id}`, { method: "DELETE" });
      invalidateAll();
      toast.success("已删除");
    } catch (error) {
      toast.error(error?.message || "删除失败");
    }
  };

  // 插入附件：上传后挂到待发列表
  const handlePickFiles = async (fileList) => {
    const list = Array.from(fileList || []).slice(0, Math.max(0, 10 - attachments.length));
    if (!list.length) return;
    setUploading(true);
    for (const file of list) {
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await httpRequest("/api/uploads", { method: "POST", body: formData });
        setAttachments((cur) => [...cur, {
          url: res.file_url, name: res.file_name, type: res.file_type, size: res.file_size,
        }]);
      } catch (error) {
        toast.error(error?.message || `「${file.name}」上传失败`);
      }
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleSend = async () => {
    const text = content.trim();
    if ((!text && attachments.length === 0) || uploading) return;
    const mentionAgent = /@\s*(agent|心栈)/i.test(text);
    try {
      await httpRequest(`/api/collab/${taskId}/messages`, {
        method: "POST",
        body: {
          content: text || "（分享附件）",
          parent_id: replyTo?.id || undefined,
          topic: topic.trim() || undefined,
          attachments: attachments.length > 0 ? attachments : undefined,
        },
      });
      setContent("");
      setTopic("");
      setShowTopicInput(false);
      setReplyTo(null);
      setAttachments([]);
      setMentionOpen(false);
      invalidateAll();
      if (mentionAgent) {
        // 展示层意图提示（实际触发由后端完成）+ 打字指示器兜底
        const intent = agentIntentFor(text);
        toast(intent.toast, { duration: 3000 });
        toast.info("Agent 正在结合全部讨论与联网信息整理，可能需要 30-90 秒", { duration: 5000 });
        setAgentPendingSince(Date.now());
      }
      setTimeout(() => scrollStreamToBottom(), 150);
    } catch (error) {
      toast.error(error?.message || "发送失败");
    }
  };

  const renderMessage = (message, isReply = false) => {
    const isAgent = !!message.agent;
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
            <AttachmentView attachments={message.attachments} />
            {(message.attachments || [])
              .filter((a) => a?.type === "option_card")
              .map((card, i) => (
                <OptionCardView
                  key={`${message.id}-card-${i}`}
                  taskId={taskId}
                  commentId={message.id}
                  card={card}
                  currentUserId={currentUserId}
                />
              ))}

            {!isAgent && !isReply && (
              <MessageActions
                message={message}
                canDelete={message.created_by_id === currentUserId}
                onConvert={handleConvert}
                onMark={handleMark}
                onReply={(m) => setReplyTo({ id: m.id, name: m.created_by_name })}
                onDelete={handleDelete}
              />
            )}
            {!isAgent && isReply && message.created_by_id === currentUserId && (
              <div className="min-[900px]:opacity-0 min-[900px]:transition-opacity min-[900px]:group-hover:opacity-100">
                <DeleteMessageButton onDelete={() => handleDelete(message)} />
              </div>
            )}
          </div>
        </div>
        {!isReply && (message.replies || []).map((reply) => renderMessage(reply, true))}
      </div>
    );
  };

  return (
    <div id="section-discussion" role="tabpanel" aria-labelledby="discussion-tab" className="flex min-h-0 flex-1 flex-col">
      {/* 主题过滤 */}
      {topics.length > 0 && (
        <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b px-4 py-2.5 sm:px-6" style={{ borderColor: C.lineSoft }}>
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

      {/* 消息流：可被输入区挤压（多行输入/附件时），保证输入框始终在视口内；滚动仅限流内部 */}
      <div ref={streamRef} className="min-h-20 flex-1 overflow-y-auto px-4 py-2 sm:px-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-sm" style={{ color: "#99958d" }}>
            <Loader2 className="w-4 h-4 animate-spin mr-2" /> 加载讨论…
          </div>
        ) : filteredMessages.length === 0 ? (
          <EmptyState
            title={topicFilter === "all" ? "还没有讨论" : "该主题下暂无讨论"}
            description="写下第一条想法，共同约定会从这里开始。输入 @ 可以召唤心栈 Agent 总结、查资料或转化内容。"
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
      </div>

      {/* 输入区 */}
      <div className="relative shrink-0 border-t p-4 sm:px-6" style={{ borderColor: C.line, backgroundColor: C.card }}>
        {/* @ 自动弹出：选择心栈 Agent */}
        {mentionOpen && (
          <div
            className="absolute bottom-full left-4 right-4 mb-2 overflow-hidden rounded-xl border shadow-lg sm:left-6 sm:right-6"
            style={{ borderColor: C.line, backgroundColor: "#fdfcf9" }}
            role="listbox"
            aria-label="召唤 Agent"
          >
            <button
              type="button"
              role="option"
              aria-selected="true"
              onClick={insertMention}
              className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-[#eef2ff]"
            >
              <AgentAvatar size="sm" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: "#302c2a" }}>
                  心栈 Agent
                  <Sparkles className="h-3 w-3" style={{ color: "#384877" }} />
                </span>
                <span className="mt-0.5 block text-[11px] leading-4" style={{ color: "#77736c" }}>
                  总结讨论 · 查外部攻略 · 转成子约定 / 节点 / 沉淀
                </span>
              </span>
              <span className="shrink-0 font-mono text-[9px]" style={{ color: "#b8b4ab" }}>Enter</span>
            </button>
          </div>
        )}

        {replyTo && (
          <div className="mb-2 flex items-center gap-2 text-[11px]" style={{ color: "#77736c" }}>
            回复 <span className="font-medium" style={{ color: "#45413d" }}>{replyTo.name || "成员"}</span>
            <button type="button" onClick={() => setReplyTo(null)} className="hover:text-[#231f20]">取消</button>
          </div>
        )}
        {attachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {attachments.map((a, i) => (
              <span
                key={`${a.url}-${i}`}
                className="inline-flex max-w-48 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px]"
                style={{ borderColor: C.lineSoft, color: "#57534d" }}
              >
                <FileText className="h-3 w-3 shrink-0" style={{ color: "#77736c" }} />
                <span className="truncate">{a.name || "附件"}</span>
                <button
                  type="button"
                  aria-label="移除附件"
                  onClick={() => setAttachments((cur) => cur.filter((_, idx) => idx !== i))}
                  className="shrink-0 rounded-full p-0.5 hover:bg-[#efefe9]"
                >
                  <X className="h-3 w-3" style={{ color: "#8a867e" }} />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="rounded-md border bg-[#fdfcf9] p-2.5 focus-within:border-[#384877]" style={{ borderColor: "#d4d2cb" }}>
          <div className="flex items-start gap-2">
            <div className="mt-0.5 flex flex-shrink-0 flex-col gap-1.5">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading || attachments.length >= 10}
                className="flex h-7 w-7 items-center justify-center rounded-md border text-[#99958d] transition-colors hover:text-[#57534d] disabled:opacity-50 min-h-7"
                style={{ borderColor: "#d8d6cf" }}
                title="插入图片或文档"
                aria-label="插入图片或文档"
              >
                {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Paperclip className="w-3.5 h-3.5" />}
              </button>
              <button
                type="button"
                onClick={() => setShowTopicInput((v) => !v)}
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-md border transition-colors",
                  showTopicInput || topic ? "border-[#c7d2fe] text-[#384877]" : "text-[#99958d] hover:text-[#57534d]"
                )}
                style={showTopicInput || topic ? { backgroundColor: C.brandTint } : { borderColor: "#d8d6cf" }}
                title="给这条讨论加个主题"
                aria-label="给这条讨论加个主题"
              >
                <MapPin className="w-3.5 h-3.5" />
              </button>
            </div>
            <input
              ref={fileRef}
              type="file"
              multiple
              className="hidden"
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md"
              onChange={(e) => handlePickFiles(e.target.files)}
            />
            <Textarea
              ref={inputRef}
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
                detectMention(e.target.value, e.target.selectionStart);
              }}
              onSelect={(e) => detectMention(e.target.value, e.target.selectionStart)}
              placeholder="写下想法，输入 @ 召唤心栈 Agent…"
              className="min-h-[60px] max-h-28 flex-1 resize-none border-0 bg-transparent p-0 text-[13px] leading-6 focus-visible:ring-0"
              rows={2}
              onKeyDown={(e) => {
                if (mentionOpen) {
                  if (e.key === "Enter" || e.key === "Tab") {
                    e.preventDefault();
                    insertMention();
                    return;
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setMentionOpen(false);
                    return;
                  }
                }
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            <Button
              size="sm"
              onClick={handleSend}
              disabled={(!content.trim() && attachments.length === 0) || uploading}
              className="h-9 w-9 flex-shrink-0 p-0 rounded-full text-[#faf9f5] hover:opacity-90"
              style={{ backgroundColor: C.ink }}
              aria-label="发送讨论"
            >
              <ArrowUp className="w-4 h-4" />
            </Button>
          </div>
          <div className="mt-2 flex items-center justify-between border-t pt-2" style={{ borderColor: C.lineSoft }}>
            <span className="px-1.5 text-[11px]" style={{ color: "#8a867e" }}>
              <span className="font-medium" style={{ color: "#384877" }}>@</span> 召唤 Agent 总结 · 查攻略 · 转化
            </span>
            <span className="font-mono text-[9px] uppercase tracking-[0.12em]" style={{ color: "#b8b4ab" }}>
              {content.trim() || attachments.length > 0 ? "Enter 发送 · Shift+Enter 换行" : "成员与 Agent 的共同讨论"}
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
  taskId, view, onViewChange, highlightId, onClearHighlight, onOpenAgent, messageCount, currentUserId,
}) {
  return (
    <section
      id="conversation-pane"
      className="flex min-h-[75vh] flex-col min-[900px]:h-full min-[900px]:min-h-0"
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
              {view === "discussion" ? "各方与 Agent 的自由聊天：@ 它总结、查资料，或把内容转成子约定、节点、沉淀。" : "查看成员操作、确认进度与 Agent 沉淀记录。"}
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
        ? <DiscussionView taskId={taskId} highlightId={highlightId} onClearHighlight={onClearHighlight} currentUserId={currentUserId} />
        : <ActivityView taskId={taskId} />}
    </section>
  );
}
