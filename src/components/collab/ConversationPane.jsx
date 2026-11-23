// 会话窗（右栏全高）：成员讨论 / 共同动态双 tab + 输入框
// 讨论可按主题分窗口：每个主题独立沉淀上下文，Agent 归纳时按主题分节；
// 讨论 = 各方 + Agent 的自由聊天：输入 @ 自动弹出 Agent（总结 / 查外部信息 / 转子约定·节点·沉淀），
// 支持插入图片与文档附件（可随消息沉淀为文件）；发送含 @ 的内容后显示打字指示器，
// 轮询发现更新的 agent 消息后撤下指示器、滚动到底部并高亮该消息 2 秒
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown, ArrowUp, Bot, Check, FileText, Loader2, MoreHorizontal, Paperclip, Sparkles, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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

const formatSize = (bytes) => {
  if (bytes == null || Number.isNaN(bytes)) return "";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
};

// 聊天日期分隔：今天 / 昨天 / 10月27日
const dayKey = (iso) => new Date(iso).toDateString();
const dayLabel = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "今天";
  if (d.toDateString() === yesterday.toDateString()) return "昨天";
  return `${d.getMonth() + 1}月${d.getDate()}日`;
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

// 消息操作：收进“⋯”菜单，像即时通讯一样不打断阅读
function MessageMenu({ message, canDelete, onConvert, onMark, onReply, onDelete }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="消息操作"
          className="flex h-6 w-6 items-center justify-center rounded-full text-[#a8a29e] transition-colors hover:bg-[#efefe9] hover:text-[#384877] focus-visible:outline-none"
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40 text-xs">
        <DropdownMenuItem onClick={() => onReply(message)}>回复</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onConvert(message, "subtask")}>转为子约定</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onConvert(message, "node")}>标记执行节点</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onConvert(message, "doc")}>存为沉淀文件</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onMark(message, "consensus")}>
          <span className="mr-1.5 h-2 w-2 rounded-full bg-emerald-500" />标记共识
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onMark(message, "dispute")}>
          <span className="mr-1.5 h-2 w-2 rounded-full bg-rose-500" />标记分歧
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onMark(message, "pending")}>
          <span className="mr-1.5 h-2 w-2 rounded-full bg-amber-500" />标记待确认
        </DropdownMenuItem>
        {message.mark && (
          <DropdownMenuItem onClick={() => onMark(message, null)} className="text-slate-400">
            清除标记
          </DropdownMenuItem>
        )}
        {canDelete && (
          <DropdownMenuItem
            className="text-rose-600 focus:text-rose-700"
            onClick={() => {
              if (window.confirm("删除这条消息？删除后无法恢复。")) onDelete(message);
            }}
          >
            删除
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ──────────────────────────── 讨论视图 ────────────────────────────

function DiscussionView({ taskId, highlightId, onClearHighlight, currentUserId, compact = false, savedTopics = [], members = [], onInvite }) {
  const queryClient = useQueryClient();
  const [topicFilter, setTopicFilter] = useState("all");
  const [createdTopics, setCreatedTopics] = useState([]);
  const [addingTopic, setAddingTopic] = useState(false);
  const [newTopicName, setNewTopicName] = useState("");
  const [savingTopic, setSavingTopic] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [content, setContent] = useState("");
  const [attachments, setAttachments] = useState([]); // {url,name,type,size}
  const [uploading, setUploading] = useState(false);
  const [mentionOpen, setMentionOpen] = useState(false); // @Agent 自动弹出
  const [agentPendingSince, setAgentPendingSince] = useState(null); // @Agent 打字指示器
  const [flashingId, setFlashingId] = useState(null);
  const [hasNewMessages, setHasNewMessages] = useState(false);
  const streamRef = useRef(null);
  const inputRef = useRef(null);
  const fileRef = useRef(null);
  const nearBottomRef = useRef(true);
  const lastMessageIdRef = useRef("");

  // 输入框随内容长高（紧凑模式最多 4 行，桌面最多 6 行）
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, compact ? 120 : 160)}px`;
  }, [content, compact]);

  // 可 @ 的协同成员（不含自己；Agent 单独展示）
  const mentionableMembers = useMemo(
    () => (Array.isArray(members) ? members : []).filter(
      (m) => m?.user_id && m.user_id !== currentUserId && (m.display_name || m.name)
    ),
    [members, currentUserId]
  );

  // 只滚动消息流内部，避免 scrollIntoView 连带滚动页面祖先（手机端会导致整个版面上移）
  const scrollStreamToBottom = (behavior = "smooth") => {
    const el = streamRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior });
  };

  const handleStreamScroll = () => {
    const el = streamRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    nearBottomRef.current = atBottom;
    if (atBottom) setHasNewMessages(false);
  };

  // 即时通讯式同步：可见时每 3 秒拉取新消息，切到后台自动暂停
  const { data: messages = [], isLoading } = useQuery({
    queryKey: ['collab', taskId, 'messages'],
    queryFn: () => httpRequest(`/api/comments?task_id=${taskId}&limit=300`),
    enabled: !!taskId,
    refetchInterval: 3000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    initialData: [],
  });

  const topics = useMemo(() => {
    const out = [];
    const add = (name) => {
      const value = typeof name === "string" ? name.trim() : "";
      if (value && !out.includes(value)) out.push(value);
    };
    savedTopics.forEach(add);
    messages.forEach((m) => add(m.topic));
    createdTopics.forEach(add);
    return out;
  }, [savedTopics, messages, createdTopics]);

  const filteredMessages = useMemo(() => {
    if (topicFilter === "all") return messages;
    // 主题窗口：根消息属于该主题，或该线程里有该主题的回复时，整条线程都保留
    return messages.filter(
      (m) => m.topic === topicFilter || (m.replies || []).some((r) => r.topic === topicFilter)
    );
  }, [messages, topicFilter]);

  // 即时通讯式消息流：把线程树摊平成时间顺序，回复用“回复某人”标注，
  // 不再用论坛式的缩进和每层标题。
  const flatMessages = useMemo(() => {
    const out = [];
    const walk = (message, replyToName) => {
      out.push({ ...message, reply_to_name: replyToName || "" });
      (message.replies || []).forEach((reply) => walk(reply, message.created_by_name || "成员"));
    };
    filteredMessages.forEach((message) => walk(message, ""));
    out.sort((a, b) => new Date(a.created_date).getTime() - new Date(b.created_date).getTime());
    return out;
  }, [filteredMessages]);

  // 新消息到达：如果用户在底部就自动跟随；否则保留阅读位置并提示“新消息”
  useEffect(() => {
    const el = streamRef.current;
    if (!el || flatMessages.length === 0) return;
    const lastId = flatMessages[flatMessages.length - 1]?.id || "";
    if (!lastId || lastId === lastMessageIdRef.current) return;
    const firstLoad = !lastMessageIdRef.current;
    lastMessageIdRef.current = lastId;
    if (firstLoad || nearBottomRef.current || agentPendingSince) {
      window.requestAnimationFrame(() => {
        el.scrollTo({ top: el.scrollHeight, behavior: firstLoad ? "auto" : "smooth" });
        setHasNewMessages(false);
      });
    } else {
      setHasNewMessages(true);
    }
  }, [flatMessages, agentPendingSince]);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['collab', taskId] });
  };

  // 新建主题窗口：主题本身持久化在约定的 metadata.collab.topics 里，空窗口也能保留
  const addTopic = async () => {
    const name = newTopicName.trim().replace(/\s+/g, " ").slice(0, 20);
    if (!name) {
      setAddingTopic(false);
      setNewTopicName("");
      return;
    }
    setSavingTopic(true);
    try {
      const res = await httpRequest(`/api/collab/${taskId}/topics`, { method: "POST", body: { name } });
      const nextTopics = Array.isArray(res?.topics) ? res.topics : [name];
      setCreatedTopics(nextTopics);
      setTopicFilter(name);
      setAddingTopic(false);
      setNewTopicName("");
      queryClient.invalidateQueries({ queryKey: ["collab", taskId] });
      window.setTimeout(() => inputRef.current?.focus(), 80);
    } catch (error) {
      toast.error(error?.message || "创建主题失败");
    } finally {
      setSavingTopic(false);
    }
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
  }, [messages, agentPendingSince]);

  // 光标前出现 @xx 时自动弹出 Agent 选项
  const detectMention = (value, cursorPos) => {
    const before = value.slice(0, cursorPos ?? value.length);
    setMentionOpen(/@[^\s@]{0,20}$/.test(before));
  };

  const insertMention = (label = "@心栈 Agent") => {
    const el = inputRef.current;
    const pos = el?.selectionStart ?? content.length;
    const before = content.slice(0, pos);
    const after = content.slice(pos);
    const replaced = before.replace(/@[^\s@]{0,20}$/, `${label} `);
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

  const handleSend = async (overrideText) => {
    const text = String(overrideText ?? content).trim();
    const sendingAttachments = overrideText ? [] : attachments;
    if ((!text && sendingAttachments.length === 0) || uploading) return;
    const mentionAgent = /@\s*(agent|心栈)/i.test(text);
    const mentionedUserIds = [...new Set(
      mentionableMembers
        .filter((m) => text.includes(`@${m.display_name || m.name}`))
        .map((m) => m.user_id)
    )];
    try {
      const parentId = replyTo?.id || undefined;
      await httpRequest(`/api/collab/${taskId}/messages`, {
        method: "POST",
        body: {
          content: text || "（分享附件）",
          parent_id: parentId,
          topic: topicFilter === "all" ? undefined : topicFilter,
          ...(mentionedUserIds.length > 0 ? { mentions: mentionedUserIds } : {}),
          attachments: sendingAttachments.length > 0 ? sendingAttachments : undefined,
        },
      });
      if (!overrideText) {
        // 先把自己的消息放进时间线，拿到服务端结果后由刷新替换；发出去立刻可见
        const optimistic = {
          id: `local-${Date.now()}`,
          task_id: taskId,
          content: text || "（分享附件）",
          parent_id: parentId || null,
          topic: topicFilter === "all" ? null : topicFilter,
          attachments: sendingAttachments,
          created_by_id: currentUserId,
          created_by_name: "我",
          created_date: new Date().toISOString(),
          replies: [],
        };
        queryClient.setQueryData(['collab', taskId, 'messages'], (old) => {
          if (!Array.isArray(old)) return old;
          if (parentId) {
            return old.map((root) =>
              root.id === parentId
                ? { ...root, replies: [...(root.replies || []), optimistic] }
                : root
            );
          }
          return [...old, optimistic];
        });
        nearBottomRef.current = true;
        setHasNewMessages(false);
        setContent("");
        setReplyTo(null);
        setAttachments([]);
        window.setTimeout(() => scrollStreamToBottom("auto"), 30);
      }
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

  // 即时通讯式气泡：自己靠右、成员/Agent 靠左；操作收进“⋯”菜单
  const renderMessage = (message, index) => {
    const isAgent = !!message.agent;
    const mine = message.created_by_id === currentUserId;
    const previous = index > 0 ? flatMessages[index - 1] : null;
    const showDay = !previous || dayKey(previous.created_date) !== dayKey(message.created_date);
    const attachmentsAndCards = (
      <>
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
      </>
    );

    return (
      <React.Fragment key={message.id}>
        {showDay && (
          <div className="my-2 flex justify-center">
            <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-[10px] text-stone-400">
              {dayLabel(message.created_date)}
            </span>
          </div>
        )}
        <div
          id={`collab-msg-${message.id}`}
          className={cn(
            "group flex gap-2 py-1",
            mine ? "justify-end" : "items-start",
            flashingId === message.id && "collab-msg-flash"
          )}
        >
          {!mine && (isAgent
            ? <AgentAvatar size="sm" />
            : <MemberAvatar name={message.created_by_name || "成员"} seed={message.created_by} size="sm" className="border-white" />)}
          <div className={cn("min-w-0 max-w-[86%] md:max-w-[76%]", mine && "flex flex-col items-end")}>
            {!mine && (
              <div className="mb-0.5 px-1 text-[10px]" style={{ color: "#8a867e" }}>
                {isAgent ? "心栈 Agent" : message.created_by_name || "成员"}
              </div>
            )}
            {message.reply_to_name && (
              <div className="mb-1 max-w-full truncate px-1 text-[10px]" style={{ color: "#a8a29e" }}>
                回复 {message.reply_to_name}
              </div>
            )}
            <div
              className={cn(
                "max-w-full whitespace-pre-wrap break-words px-3.5 py-2.5 text-[14px] leading-relaxed",
                mine
                  ? "rounded-2xl rounded-tr-md bg-[#384877] text-[#FAF9F7] shadow-sm"
                  : isAgent
                    ? "rounded-2xl rounded-tl-md border border-[#e6ddca] bg-[#F5F0E8] text-[#5B4A3A]"
                    : "rounded-2xl rounded-tl-md border border-stone-200 bg-white text-stone-700 shadow-[0_1px_2px_rgba(36,36,36,0.04)]"
              )}
            >
              {message.content}
            </div>
            <div className={cn("mt-1 flex flex-wrap items-center gap-1.5 px-1 text-[9px]", mine && "justify-end")} style={{ color: "#a8a29e" }}>
              <span>{formatTime(message.created_date)}</span>
              {message.topic && (
                <span className="rounded-full bg-stone-100 px-1.5 py-0.5 text-[#8a867e]">{message.topic}</span>
              )}
              {message.mark && (
                <span className={cn("rounded-full border px-1.5 py-0.5", MARK_STYLES[message.mark])}>
                  {MARK_LABELS[message.mark]}
                </span>
              )}
              {!compact && !isAgent && (
                <span className="min-[900px]:opacity-0 min-[900px]:transition-opacity min-[900px]:group-hover:opacity-100">
                  <MessageMenu
                    message={message}
                    canDelete={message.created_by_id === currentUserId}
                    onConvert={handleConvert}
                    onMark={handleMark}
                    onReply={(m) => setReplyTo({ id: m.parent_id || m.id, name: m.created_by_name })}
                    onDelete={handleDelete}
                  />
                </span>
              )}
            </div>
            {attachmentsAndCards}
          </div>
        </div>
      </React.Fragment>
    );
  };

  return (
    <div
      id="section-discussion"
      role="tabpanel"
      aria-label={compact ? "共同讨论" : undefined}
      aria-labelledby={compact ? undefined : "discussion-tab"}
      className="flex min-h-0 flex-1 flex-col"
    >
      {/* 主题窗口：每个主题是一间独立讨论；全部窗口汇总所有主题。
          搭子空间内的紧凑聊天不显示主题筛选，把空间留给消息。 */}
      {!compact && (
      <div
        className={cn(
          "flex shrink-0 items-center gap-1.5 overflow-x-auto border-b",
          compact ? "px-3 py-1.5" : "px-4 py-2.5 sm:px-6"
        )}
        style={{ borderColor: C.lineSoft }}
        role="group"
        aria-label="讨论主题"
      >
        <button
          type="button"
          aria-pressed={topicFilter === "all"}
          onClick={() => setTopicFilter("all")}
          className={cn(
            "shrink-0 rounded-full border px-2.5 text-[11px] transition-colors min-h-7",
            topicFilter === "all" ? "border-transparent text-white" : ""
          )}
          style={topicFilter === "all" ? { backgroundColor: "#384877" } : { borderColor: "#d8d6cf", color: "#77736c" }}
        >
          全部
        </button>
        {topics.map((topicName) => (
          <button
            key={topicName}
            type="button"
            aria-pressed={topicFilter === topicName}
            onClick={() => setTopicFilter(topicName)}
            className={cn("shrink-0 rounded-full border px-2.5 text-[11px] transition-colors min-h-7")}
            style={topicFilter === topicName
              ? { backgroundColor: "#384877", borderColor: "#384877", color: "#fff" }
              : { borderColor: "#d8d6cf", color: "#77736c" }}
          >
            {topicName}
          </button>
        ))}
        {addingTopic ? (
          <form
            className="flex shrink-0 items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              addTopic();
            }}
          >
            <input
              autoFocus
              value={newTopicName}
              onChange={(e) => setNewTopicName(e.target.value)}
              maxLength={20}
              placeholder="主题"
              aria-label="新主题名称"
              className="h-7 w-24 rounded-full border bg-transparent px-2.5 text-[11px] outline-none focus:border-[#384877]"
              style={{ borderColor: "#d8d6cf", color: "#45413d" }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setAddingTopic(false);
                  setNewTopicName("");
                }
              }}
            />
            <button
              type="submit"
              disabled={savingTopic || !newTopicName.trim()}
              className="flex h-7 w-7 items-center justify-center rounded-full text-[#384877] disabled:opacity-40"
              aria-label="创建主题"
            >
              {savingTopic ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              onClick={() => {
                setAddingTopic(false);
                setNewTopicName("");
              }}
              className="flex h-7 w-7 items-center justify-center rounded-full text-[#99958d]"
              aria-label="取消"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setAddingTopic(true)}
            className="shrink-0 rounded-full border border-dashed px-2.5 text-[11px] transition-colors min-h-7 hover:text-[#384877]"
            style={{ borderColor: "#d8d6cf", color: "#8a867e" }}
          >
            ＋ 主题
          </button>
        )}
      </div>
      )}

      {/* 消息流：即时通讯式气泡，滚动只发生在流内部 */}
      <div className="relative min-h-0 flex-1">
        <div
          ref={streamRef}
          onScroll={handleStreamScroll}
          className="h-full overflow-y-auto px-4 py-2 sm:px-6"
        >
          {isLoading ? (
            <div className="flex items-center justify-center py-10 text-sm" style={{ color: "#99958d" }}>
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> 加载聊天…
            </div>
          ) : flatMessages.length === 0 ? (
            <EmptyState
              title={topicFilter === "all" ? (compact ? "还没有人说话" : "还没有消息") : "该主题下暂无消息"}
              description={
                topicFilter === "all"
                  ? compact
                    ? "先打个招呼，或说说这次想一起推进什么。"
                    : "发一条消息，和大家同步现在的想法。"
                  : `在「${topicFilter}」里说点什么。`
              }
            />
          ) : (
            flatMessages.map((m, index) => renderMessage(m, index))
          )}

          {/* 聊天快捷回应：只在最后一条是搭子时出现，点一下就能继续聊 */}
          {compact && !agentPendingSince && flatMessages[flatMessages.length - 1]?.agent && (
            <div className="flex flex-wrap gap-2 px-1 pb-2 pt-1">
              {["收到，我来跟进", "这一步再商量一下", "帮我整理成约定"].map((label) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => handleSend(label)}
                  className="min-h-[32px] rounded-full border border-[#d8d6cf] bg-white px-3 text-[12px] text-stone-600 transition-colors hover:border-[#B89A6A] hover:text-[#8B6F47]"
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* 空间还空时，给出一个显眼的邀请入口 */}
          {compact && !agentPendingSince && flatMessages[flatMessages.length - 1]?.agent && members.length <= 1 && onInvite && (
            <div className="pb-2 pl-9 pt-0.5">
              <button
                type="button"
                onClick={onInvite}
                className="rounded-full border border-[#B89A6A] bg-white px-4 py-1.5 text-[12px] font-medium text-[#8B6F47] transition-colors hover:bg-[#F5F0E8]"
              >
                邀请伙伴加入
              </button>
            </div>
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

        {/* 用户在看旧消息时，新消息只提示不打断阅读 */}
        {hasNewMessages && (
          <button
            type="button"
            onClick={() => {
              nearBottomRef.current = true;
              setHasNewMessages(false);
              scrollStreamToBottom();
            }}
            className="absolute bottom-3 right-4 z-10 inline-flex items-center gap-1 rounded-full bg-[#384877] px-3 py-1.5 text-[11px] font-medium text-white shadow-lg"
          >
            新消息 <ArrowDown className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* 输入区 */}
      <div className={compact ? "relative shrink-0 border-t p-2.5" : "relative shrink-0 border-t p-4 sm:px-6"} style={{ borderColor: C.line, backgroundColor: C.card }}>
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
              onClick={() => insertMention()}
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
            {mentionableMembers.map((member) => (
              <button
                key={member.user_id}
                type="button"
                role="option"
                aria-selected="false"
                onClick={() => insertMention(`@${member.display_name || member.name}`)}
                className="flex w-full items-center gap-3 border-t px-3.5 py-2.5 text-left transition-colors hover:bg-[#eef2ff]"
                style={{ borderColor: C.lineSoft }}
              >
                <MemberAvatar name={member.display_name || member.name} seed={member.user_id} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium" style={{ color: "#302c2a" }}>
                    {member.display_name || member.name}
                  </span>
                  <span className="mt-0.5 block text-[10px]" style={{ color: "#77736c" }}>
                    @ 提醒这位成员
                  </span>
                </span>
              </button>
            ))}
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
        {compact ? (
          // 手机搭子空间：极简圆角输入条，焦糖色发送按钮，把视觉重心让给对话内容
          <div className="rounded-full border border-stone-200 bg-white px-1 py-1 pl-3 transition-colors focus-within:border-[#B89A6A]">
            <div className="flex items-center gap-2">
              <Textarea
                ref={inputRef}
                value={content}
                onChange={(e) => {
                  setContent(e.target.value);
                  detectMention(e.target.value, e.target.selectionStart);
                }}
                onSelect={(e) => detectMention(e.target.value, e.target.selectionStart)}
                placeholder={
                  topicFilter === "all"
                    ? "@ 召唤搭子总结 · 把讨论变成约定…"
                    : `在「${topicFilter}」里说…`
                }
                className="min-h-[38px] max-h-[120px] flex-1 resize-none border-0 bg-transparent py-2 text-[14px] leading-5 text-stone-700 placeholder:text-stone-400 focus-visible:ring-0"
                rows={1}
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
                onClick={() => handleSend()}
                disabled={(!content.trim() && attachments.length === 0) || uploading}
                className="h-9 flex-shrink-0 rounded-full bg-[#B89A6A] px-4 text-[13px] font-medium text-white hover:bg-[#A88A5A] disabled:opacity-50"
                aria-label="发送讨论"
              >
                发送
              </Button>
            </div>
          </div>
        ) : (
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
                placeholder={
                  topicFilter === "all"
                    ? "发消息，输入 @ 可召唤 Agent…"
                    : `在「${topicFilter}」里说…`
                }
                className="min-h-[52px] max-h-40 flex-1 resize-none border-0 bg-transparent p-0 text-[13px] leading-6 focus-visible:ring-0"
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
                onClick={() => handleSend()}
                disabled={(!content.trim() && attachments.length === 0) || uploading}
                className="h-9 w-9 flex-shrink-0 p-0 rounded-full text-[#faf9f5] hover:opacity-90"
                style={{ backgroundColor: C.ink }}
                aria-label="发送讨论"
              >
                <ArrowUp className="w-4 h-4" />
              </Button>
            </div>
          </div>
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
  taskId, view, onViewChange, highlightId, onClearHighlight, onOpenAgent, messageCount, currentUserId, compact = false, savedTopics = [], members = [], onInvite,
}) {
  return (
    <section
      id="conversation-pane"
      className={compact ? "flex h-full min-h-0 flex-col" : "flex h-[calc(100dvh_-_64px_-_env(safe-area-inset-bottom))] flex-col min-[900px]:h-full min-[900px]:min-h-0"}
      style={{ backgroundColor: C.pane }}
    >
      {!compact && (
      <div className="shrink-0 border-b px-4 pt-3 sm:px-6" style={{ borderColor: C.line }}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="truncate text-[17px] font-semibold tracking-[-0.01em]" style={{ color: "#302c2a" }}>
              {view === "discussion" ? "协同聊天" : "协同动态"}
            </h2>
            {view === "discussion" && (
              <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-medium text-emerald-600">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                实时
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onOpenAgent}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors hover:border-[#384877] hover:text-[#384877] min-h-8"
            style={{ borderColor: "#d4d2cb", color: "#5b5751" }}
          >
            <Bot className="h-3.5 w-3.5" />Agent
          </button>
        </div>
        <div className="mt-2 flex gap-5" role="tablist" aria-label="谈话内容切换">
          <button
            id="discussion-tab"
            type="button"
            role="tab"
            aria-selected={view === "discussion"}
            aria-controls="section-discussion"
            onClick={() => onViewChange("discussion")}
            className="border-b-2 px-0 pb-2 text-xs font-medium transition-colors min-h-8 focus-visible:outline-none"
            style={view === "discussion"
              ? { borderColor: "#384877", color: "#384877" }
              : { borderColor: "transparent", color: "#77736c" }}
          >
            聊天
          </button>
          <button
            id="activity-tab"
            type="button"
            role="tab"
            aria-selected={view === "activity"}
            onClick={() => onViewChange("activity")}
            className="border-b-2 px-0 pb-2 text-xs font-medium transition-colors min-h-8 focus-visible:outline-none"
            style={view === "activity"
              ? { borderColor: "#384877", color: "#384877" }
              : { borderColor: "transparent", color: "#77736c" }}
          >
            动态
          </button>
        </div>
      </div>
      )}
      {view === "discussion"
        ? <DiscussionView taskId={taskId} highlightId={highlightId} onClearHighlight={onClearHighlight} currentUserId={currentUserId} compact={compact} savedTopics={savedTopics} members={members} onInvite={onInvite} />
        : <ActivityView taskId={taskId} />}
    </section>
  );
}
