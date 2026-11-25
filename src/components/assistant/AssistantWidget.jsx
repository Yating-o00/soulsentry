// 心栈小助手（Web 端）：右下角机器人入口 + 持续对话面板
// - 对话历史走 /api/companion（老后端自动降级 /api/chat，仅当次有效）
// - 两类提案，用户确认后才落库：
//   创建提案（约定/心签/链接/智能规划）与动作提案（勾掉子约定、改约定/心签内容等）
// - 确认执行后失效 react-query 缓存，产品各页面数据即时刷新
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AtSign, FileText, Loader2, Mic, Monitor, Paperclip, X } from "lucide-react";
import { toast } from "sonner";
import { httpRequest } from "@/api/httpClient";
import { applyBuddyCapture } from "@/lib/buddyCapture";
import { getAllBuddies } from "@/lib/customBuddies";
import { BUDDY_TINTS } from "@/lib/buddies";
import Orb from "@/components/buddy/Orb";
import AgentLiveWindow from "@/components/automation/AgentLiveWindow";
import assistantPlanet from "@/assets/assistant-planet.png";

const TYPE_LABEL = { task: "约定", heart: "心签", link: "链接", plan: "智能规划", collab: "协同约定" };
// 首页对话只呈现「心栈」，不向用户暴露底层模型/供应商品牌；
// 同时兜住模型偶尔在正文里自称供应商的情况。
const PROVIDER_BRAND_RE = /(?:Kimi|DeepSeek)/gi;
const withoutProviderBrand = (value) => String(value ?? "").replace(PROVIDER_BRAND_RE, "心栈");
const TYPE_ICON = { task: "🤝", heart: "💌", link: "🔗", plan: "🗓️", collab: "👥" };

function fmtTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return sameDay ? hm : `${d.getMonth() + 1}月${d.getDate()}日 ${hm}`;
}

/** 主聊天里搭子回执：优先用客户端真正落库后的回执，刷新后用服务端 capture 还原 */
function captureDisplay(capture) {
  if (!capture || !capture.kind || capture.kind === "none") return null;
  const data = capture.data || {};
  const parts = [];
  if (capture.kind === "running_log") {
    if (data.distance_km) parts.push(`${data.distance_km} km`);
    if (data.duration_min) parts.push(`${data.duration_min} 分钟`);
    if (data.avg_hr) parts.push(`心率 ${data.avg_hr}`);
    return { title: "已同步到跑步记录", detail: [data.date, ...parts].filter(Boolean).join(" · ") };
  }
  if (capture.kind === "reading_log") {
    if (data.book) parts.push(`《${data.book}》`);
    if (data.minutes) parts.push(`+${data.minutes} 分钟`);
    if (data.pages_read) parts.push(`${data.pages_read} 页`);
    if (data.finished) parts.push("已读完");
    return { title: "已同步到读书记录", detail: parts.join(" · ") || capture.summary || "" };
  }
  if (capture.kind === "wake_log") {
    return {
      title: "已记入早起记录",
      detail: [data.wake_time ? `${data.wake_time} 起床` : "", capture.checkin ? "已打卡" : ""].filter(Boolean).join(" · ") || capture.summary || "",
    };
  }
  if (capture.kind === "study_log") {
    return {
      title: "已记入学习记录",
      detail: [data.topic, data.minutes ? `${data.minutes} 分钟` : ""].filter(Boolean).join(" · ") || capture.summary || "",
    };
  }
  if (capture.kind === "travel_note") {
    return { title: "已记入旅行手记", detail: data.note || capture.summary || "" };
  }
  return { title: "已记入日常记录", detail: data.note || data.topic || capture.summary || "" };
}

function extractUrl(text) {
  const m = String(text || "").match(/https?:\/\/[^\s"'，。）)]+/i);
  return m ? m[0] : null;
}

function detectLedgerLike(t) {
  const s = String(t || "");
  const moneyHits = (s.match(/\d+(?:\.\d{1,2})?\s*(?:元|块|¥|RMB|rmb)/g) || []).length;
  const consumeWords = /(饭|餐|咖啡|奶茶|外卖|超市|买菜|打车|地铁|火车|机票|房租|水电|电影|游戏|会员|充值|门票|旅行|酒店|工资|报销|退款|红包|转账|购物|淘宝|京东|拼多多|衣服|鞋|数码|手机|耳机)/.test(s);
  if (moneyHits >= 2) return true;
  if (moneyHits >= 1 && consumeWords) return true;
  return false;
}

function AssistantWidget({ inline = false, newUser = false, summary = "", quickAsks = null }) {
  const queryClient = useQueryClient();
  // inline 模式：内嵌在首页（通用 Agent 对话层），无浮动按钮、面板常开；
  // 历史对话默认折叠，只保留一条按真实数据生成的今日问候
  const [open, setOpen] = useState(inline);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(null); // 创建提案
  const [actions, setActions] = useState(null); // 动作提案
  const [acting, setActing] = useState(false);
  const [unread, setUnread] = useState(0);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [memories, setMemories] = useState([]);
  const [memoryError, setMemoryError] = useState("");
  const [editingMemory, setEditingMemory] = useState(null);
  const [memoryText, setMemoryText] = useState("");
  const [memoryHistory, setMemoryHistory] = useState(null);
  const [revisionSource, setRevisionSource] = useState(null);
  const [memoryLearning, setMemoryLearning] = useState(null);
  const [showArchivedMemories, setShowArchivedMemories] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [mentionBuddies, setMentionBuddies] = useState([]);
  const [mentionBuddy, setMentionBuddy] = useState(null);
  const [mentionQuery, setMentionQuery] = useState(null);
  const [mentionStart, setMentionStart] = useState(-1);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [recording, setRecording] = useState(false);
  const [voiceText, setVoiceText] = useState("");
  const [agentExecId, setAgentExecId] = useState(null);
  const [agentLiveOpen, setAgentLiveOpen] = useState(false);
  const [agentActive, setAgentActive] = useState(false);
  const [agentWaiting, setAgentWaiting] = useState(null);
  const [agentReplyText, setAgentReplyText] = useState("");
  const [agentResponding, setAgentResponding] = useState(false);
  const [agentTakeoverRequested, setAgentTakeoverRequested] = useState(0);
  const fileInputRef = useRef(null);
  const recognitionRef = useRef(null);
  const voiceTranscriptRef = useRef("");
  const voiceErrorRef = useRef(false);

  const loadMemories = async (showArchived = showArchivedMemories) => {
    try {
      const [records, learning] = await Promise.all([
        httpRequest("/api/memory-records?limit=300" + (showArchived ? "" : "&active=true")),
        httpRequest("/api/memory-records/learning").catch(() => null),
      ]);
      setMemories(records);
      setMemoryLearning(learning);
      setMemoryError("");
    } catch {
      setMemoryError("记忆加载失败，请重试。");
    }
  };

  const changeMemoryLearning = async (enabled) => {
    try {
      setMemoryLearning(await httpRequest("/api/memory-records/learning", { method: "PUT", body: { enabled } }));
      setMemoryError("");
    } catch {
      setMemoryError("自动学习设置未能保存。");
    }
  };

  const saveMemoryEdit = async () => {
    const content = memoryText.trim();
    if (!content) return;
    try {
      await httpRequest(`/api/memory-records/${editingMemory.id}`, {
        method: "PATCH",
        body: { title: content.slice(0, 200), content, expected_version: editingMemory.version },
      });
      setEditingMemory(null);
      setMemoryHistory(null);
      await loadMemories();
    } catch {
      setMemoryError("记忆未能更新，请重新打开记忆面板查看当前版本。");
    }
  };

  const deleteMemory = async (id) => {
    if (!window.confirm("忘记后将清除这条记忆的历史版本。原对话仍可在聊天记录查看。是否继续？")) return;
    try {
      await httpRequest(`/api/memory-records/${id}`, { method: "DELETE" });
      setMemoryHistory(null);
      setRevisionSource(null);
      await loadMemories();
    } catch {
      setMemoryError("记忆删除失败，请重试。");
    }
  };

  const loadMemoryHistory = async (id, before) => {
    setRevisionSource(null);
    try {
      const history = await httpRequest(`/api/memory-records/${id}/revisions${before ? `?before=${before}` : ""}`);
      setMemoryHistory((previous) => ({
        id, version: history.version,
        revisions: before && previous?.id === id ? [...previous.revisions, ...history.revisions] : history.revisions,
        hasMore: history.revisions.length === 30,
      }));
      setMemoryError("");
    } catch {
      setMemoryError("记忆历史加载失败，请重试。");
    }
  };

  const viewRevisionSource = async (id, version, messageId) => {
    try {
      const source = await httpRequest(`/api/memory-records/${id}/revisions/${version}/source/${messageId}`);
      setRevisionSource({ ...source, memoryId: id, version });
    } catch {
      setMemoryError("这条来源已不可用。");
    }
  };

  const restoreRevision = async (id, version, expectedVersion) => {
    try {
      await httpRequest(`/api/memory-records/${id}/restore`, {
        method: "POST", body: { version, expected_version: expectedVersion },
      });
      await loadMemories();
      await loadMemoryHistory(id);
    } catch {
      setMemoryError("记忆未能恢复，请刷新历史后重试。");
    }
  };
  const supportedRef = useRef(true);
  const messagesRef = useRef([]);
  const scrollRef = useRef(null);
  const lastIdRef = useRef("");
  const composerRef = useRef(null);

  // 输入框随内容长高（最多约 5 行）；空着时锁回一行，别让 placeholder 把聊天框撑高
  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${input.trim() ? Math.min(el.scrollHeight, 140) : 40}px`;
  }, [input]);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, []);

  // 主聊天框可 @ 的搭子：只列已认领、正在陪伴中的
  const loadMentionBuddies = useCallback(async () => {
    try {
      const mine = await httpRequest("/api/buddies/mine");
      const active = getAllBuddies(mine)
        .filter((buddy) => mine?.buddies?.[buddy.id]?.status === "active")
        .map((buddy) => ({
          id: buddy.id,
          name: buddy.name,
          tint: buddy.tint || BUDDY_TINTS[buddy.id] || BUDDY_TINTS.study,
          custom: Boolean(buddy.custom),
        }));
      setMentionBuddies(active);
      return mine;
    } catch (_error) {
      return null;
    }
  }, []);

  useEffect(() => {
    if (open) loadMentionBuddies();
  }, [open, loadMentionBuddies]);

  // 浏览器小助手：等真实浏览器会话启动后自动打开实时小窗；结束时把结果送回对话
  useEffect(() => {
    if (!agentExecId) return undefined;
    let cancelled = false;
    let opened = false;
    let sawActive = false;
    let inactiveTicks = 0;
    const check = async () => {
      try {
        const state = await httpRequest(`/api/task-executions/${agentExecId}/agent-state`);
        if (cancelled) return;
        if (state?.active) {
          sawActive = true;
          inactiveTicks = 0;
          setAgentActive(true);
          setAgentWaiting(state.status === "waiting_input" ? state.waiting || null : null);
          if (!opened) {
            opened = true;
            setAgentLiveOpen(true);
          }
          return;
        }
        const status = String(state?.execution_status || "").toLowerCase();
        const terminal = ["completed", "failed", "cancelled"].includes(status);
        if (!sawActive && !terminal) return;
        if (sawActive) inactiveTicks += 1;
        // 会话结束后执行单还要落库；等终态或一小段宽限再收尾，避免把结果弄丢
        if (!terminal && inactiveTicks < 12) return;

        const summary = state?.automation_result?.data?.agent?.summary
          || state?.automation_result?.preview
          || "";
        if (summary) {
          const content = `浏览器小助手办好了：${String(summary).slice(0, 800)}`;
          const doneMsg = {
            id: `agent-done-${Date.now()}`,
            role: "assistant",
            content,
            kind: "chat",
            created_date: new Date().toISOString(),
          };
          messagesRef.current = [...messagesRef.current, doneMsg];
          setMessages(messagesRef.current);
          lastIdRef.current = doneMsg.id;
          httpRequest("/api/companion/messages", { method: "POST", body: { assistant_echo: content } }).catch(() => {});
          requestAnimationFrame(() => scrollToBottom());
        } else if (terminal && status === "failed") {
          const content = "浏览器小助手这次没能完成，过程和现场保留在守护记录里，可以稍后再试一次。";
          const failMsg = {
            id: `agent-fail-${Date.now()}`,
            role: "assistant",
            content,
            kind: "chat",
            created_date: new Date().toISOString(),
          };
          messagesRef.current = [...messagesRef.current, failMsg];
          setMessages(messagesRef.current);
          lastIdRef.current = failMsg.id;
          httpRequest("/api/companion/messages", { method: "POST", body: { assistant_echo: content } }).catch(() => {});
          requestAnimationFrame(() => scrollToBottom());
        }
        setAgentExecId(null);
        setAgentLiveOpen(false);
        setAgentActive(false);
        setAgentWaiting(null);
        setAgentReplyText("");
      } catch (_error) {
        // 执行单可能还在创建中，下一轮再试
      }
    };
    check();
    const timer = setInterval(check, 2500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [agentExecId]);

  const mentionResults = useMemo(() => {
    const query = String(mentionQuery ?? "").trim();
    return mentionBuddies
      .filter((buddy) => !query || buddy.name.includes(query) || buddy.id.includes(query))
      .slice(0, 8);
  }, [mentionBuddies, mentionQuery]);

  const updateMentionFromInput = useCallback((value, cursor) => {
    const before = String(value || "").slice(0, cursor ?? String(value || "").length);
    const match = before.match(/(?:^|\s)@([^\s@]*)$/);
    if (match) {
      setMentionStart(before.lastIndexOf("@"));
      setMentionQuery(match[1]);
      setMentionIndex(0);
    } else {
      setMentionStart(-1);
      setMentionQuery(null);
    }
    if (mentionBuddy && !String(value || "").includes(`@${mentionBuddy.name}`)) {
      setMentionBuddy(null);
    }
  }, [mentionBuddy]);

  const chooseMention = useCallback((buddy) => {
    if (!buddy) return;
    const el = composerRef.current;
    const cursor = el?.selectionStart ?? input.length;
    const start = mentionStart >= 0 ? mentionStart : input.lastIndexOf("@");
    if (start < 0) return;
    const next = `${input.slice(0, start)}@${buddy.name} ${input.slice(cursor)}`;
    setInput(next);
    setMentionBuddy(buddy);
    setMentionQuery(null);
    setMentionStart(-1);
    requestAnimationFrame(() => {
      const node = composerRef.current;
      if (!node) return;
      const pos = start + buddy.name.length + 2;
      node.focus();
      node.setSelectionRange(pos, pos);
    });
  }, [input, mentionStart]);

  const openMentionPicker = useCallback(() => {
    if (busy) return;
    const el = composerRef.current;
    const cursor = el?.selectionStart ?? input.length;
    const before = input.slice(0, cursor);
    const insertion = before.length > 0 && !/\s$/.test(before) ? " @" : "@";
    setInput(`${before}${insertion}${input.slice(cursor)}`);
    setMentionStart(before.length + insertion.length - 1);
    setMentionQuery("");
    setMentionIndex(0);
    loadMentionBuddies();
    requestAnimationFrame(() => {
      const node = composerRef.current;
      if (!node) return;
      const pos = before.length + insertion.length;
      node.focus();
      node.setSelectionRange(pos, pos);
    });
  }, [busy, input, loadMentionBuddies]);

  const appendMessage = useCallback((m) => {
    messagesRef.current = [...messagesRef.current, m];
    setMessages(messagesRef.current);
    lastIdRef.current = m.id;
  }, []);

  const markUnsupported = useCallback(() => {
    supportedRef.current = false;
  }, []);

  // ── 数据 ──
  const fetchHistory = useCallback(async ({ quiet = false } = {}) => {
    if (!supportedRef.current) return;
    try {
      const list = await httpRequest("/api/companion/messages?limit=100");
      if (!Array.isArray(list)) return;
      if (quiet && list.length && list[list.length - 1].id === lastIdRef.current) return;
      messagesRef.current = list;
      setMessages(list);
      if (list.length) lastIdRef.current = list[list.length - 1].id;
      httpRequest("/api/companion/read", { method: "POST", body: {} }).catch(() => {});
      setUnread(0);
    } catch (err) {
      if (err?.status === 404) markUnsupported();
    }
  }, [markUnsupported]);

  const fetchUnread = useCallback(async () => {
    try {
      const res = await httpRequest("/api/companion/unread");
      setUnread(res?.count || 0);
    } catch (_err) {
      // 老后端/网络异常：不显示角标
    }
  }, []);

  useEffect(() => {
    fetchUnread();
    const timer = setInterval(fetchUnread, 30000);
    return () => clearInterval(timer);
  }, [fetchUnread]);

  useEffect(() => {
    if (!open) return undefined;
    fetchHistory().then(() => {
      if (inline) {
        // 首页只展示今日问候：历史折叠时停在顶部，不自动滚到旧消息
        requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: 0 }));
      } else {
        scrollToBottom();
      }
    });
    const timer = setInterval(() => fetchHistory({ quiet: true }), 10000);
    return () => clearInterval(timer);
  }, [open, inline, fetchHistory, scrollToBottom]);

  // ── 发送 ──
  const sendViaLegacyChat = async (t, lastExtracted) => {
    const history = messagesRef.current
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(-29)
      .map((m) => ({ role: m.role, content: String(m.content).slice(0, 1500) }));
    const res = await httpRequest("/api/chat", {
      method: "POST",
      body: { messages: history, last_extracted: lastExtracted || undefined }
    });
    const reply = String(res?.reply || "").trim() || "我在听，你继续说～";
    appendMessage({ id: `local-a-${Date.now()}`, role: "assistant", content: reply, kind: "chat", meta: { ai: res?.ai }, created_date: new Date().toISOString() });
    setPending(res?.extracted?.type === "plan" ? { ...res.extracted, proposal_id: crypto.randomUUID() } : res?.extracted || null);
    setActions(null);
    scrollToBottom();
    return true;
  };

  const handleFiles = useCallback(async (fileList) => {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;
    const room = 3 - attachments.length;
    if (room <= 0) {
      toast.info("最多随一条消息发送 3 个附件");
      return;
    }
    setUploading(true);
    for (const file of files.slice(0, room)) {
      if (file.size > 20 * 1024 * 1024) {
        toast.error(`「${file.name}」超过 20MB，暂时不能上传`);
        continue;
      }
      try {
        const form = new FormData();
        form.append("file", file);
        const res = await httpRequest("/api/uploads", { method: "POST", body: form });
        setAttachments((cur) => [...cur, {
          url: res.file_url,
          name: res.file_name,
          type: res.file_type,
          size: res.file_size,
        }].slice(0, 3));
      } catch (error) {
        toast.error(error?.message || `「${file.name}」上传失败`);
      }
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [attachments.length]);

  const startVoice = useCallback(() => {
    if (busy || recording) return;
    const Recognition = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
    if (!Recognition) {
      toast.info("当前浏览器不支持语音输入，先用键盘说给我听吧");
      return;
    }
    try {
      const recognition = new Recognition();
      recognition.lang = "zh-CN";
      recognition.continuous = true;
      recognition.interimResults = true;
      voiceTranscriptRef.current = "";
      voiceErrorRef.current = false;
      recognition.onresult = (event) => {
        let finalText = "";
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const transcript = event.results[i][0]?.transcript || "";
          if (event.results[i].isFinal) finalText += transcript;
          else interim += transcript;
        }
        if (finalText) voiceTranscriptRef.current += finalText;
        setVoiceText(`${voiceTranscriptRef.current}${interim}`.trim());
      };
      recognition.onerror = (event) => {
        if (event.error === "aborted") return;
        voiceErrorRef.current = true;
        setRecording(false);
        setVoiceText("");
        toast.error(
          event.error === "not-allowed" || event.error === "service-not-allowed"
            ? "需要麦克风权限才能语音输入"
            : "没听清，再按住说一次"
        );
      };
      recognition.onend = () => {
        setRecording(false);
        setVoiceText("");
        recognitionRef.current = null;
        const text = voiceTranscriptRef.current.trim();
        if (!voiceErrorRef.current && text) {
          setInput((prev) => `${prev}${prev && !/\s$/.test(prev) ? " " : ""}${text}`);
          toast.success("已转成文字，发送前可以改");
        }
      };
      recognitionRef.current = recognition;
      setRecording(true);
      setVoiceText("");
      recognition.start();
    } catch (_error) {
      setRecording(false);
      recognitionRef.current = null;
      toast.error("语音输入没启动成功，再试一次");
    }
  }, [busy, recording]);

  const stopVoice = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch (_error) {
      // 识别已经结束时忽略
    }
  }, []);

  useEffect(() => () => {
    try {
      recognitionRef.current?.abort();
    } catch (_error) {
      // 卸载时识别已结束
    }
  }, []);

  // @搭子回复里带 capture：主聊天负责把它真正写进对应搭子空间（跑步记录/读书/打卡…）
  const applyCaptureFromMain = useCallback(async (res, sentAttachments) => {
    const replyId = res?.reply?.id;
    try {
      const mine = await httpRequest("/api/buddies/mine");
      const profile = mine?.buddies?.[res.buddy.id];
      const applied = await applyBuddyCapture({
        buddyId: res.buddy.id,
        capture: res.capture,
        state: profile?.state || {},
        profile,
        projectTask: res.project_task || null,
        attachments: sentAttachments,
        queryClient,
      });
      if (!applied) return;
      if (applied.patch && Object.keys(applied.patch).length > 0) {
        await httpRequest(`/api/buddies/${res.buddy.id}/state`, {
          method: "POST",
          body: { patch: applied.patch },
        });
      }
      queryClient.invalidateQueries({ queryKey: ["buddies", "mine"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      if (replyId) {
        messagesRef.current = messagesRef.current.map((m) =>
          m.id === replyId ? { ...m, meta: { ...(m.meta || {}), capture_receipt: applied.receipt } } : m
        );
        setMessages(messagesRef.current);
      }
      loadMentionBuddies();
    } catch (error) {
      if (replyId) {
        const failure = {
          kind: res?.capture?.kind,
          title: "识别到数据，但同步没成功",
          detail: error?.message || "稍后到搭子空间手动补一次",
          failed: true,
        };
        messagesRef.current = messagesRef.current.map((m) =>
          m.id === replyId ? { ...m, meta: { ...(m.meta || {}), capture_receipt: failure } } : m
        );
        setMessages(messagesRef.current);
      }
    }
  }, [queryClient, loadMentionBuddies]);

  const respondToBrowserAgent = async (payload) => {
    if (!agentExecId || agentResponding) return;
    setAgentResponding(true);
    try {
      await httpRequest(`/api/task-executions/${agentExecId}/agent-respond`, { method: "POST", body: payload });
      setAgentWaiting(null);
      setAgentReplyText("");
    } catch (error) {
      toast.error(error?.message || "回应没送到，再试一次");
    } finally {
      setAgentResponding(false);
    }
  };

  const takeoverBrowserAgent = async () => {
    if (!agentExecId || agentResponding) return;
    setAgentResponding(true);
    try {
      await httpRequest(`/api/task-executions/${agentExecId}/agent-takeover`, { method: "POST", body: {} });
      setAgentWaiting(null);
      setAgentTakeoverRequested((value) => value + 1);
      setAgentLiveOpen(true);
    } catch (error) {
      toast.error(error?.message || "接管没成功，再试一次");
    } finally {
      setAgentResponding(false);
    }
  };

  const sendText = useCallback(async (text, lastExtracted = null, options = {}) => {
    const t = String(text || "").trim();
    const sentAttachments = Array.isArray(options.attachments) ? options.attachments : [];
    const sentBuddy = options.buddy || null;
    if ((!t && sentAttachments.length === 0) || busy) return false;
    if (inline) setHistoryOpen(true); // 用户开口后才展开对话流
    setBusy(true);
    const optimistic = {
      id: `local-${Date.now()}`,
      role: "user",
      content: t || "（附件）",
      kind: "chat",
      created_date: new Date().toISOString(),
      ...(sentAttachments.length > 0 ? { meta: { attachments: sentAttachments } } : {}),
    };
    appendMessage(optimistic);
    scrollToBottom();
    try {
      if (supportedRef.current) {
        try {
          const res = await httpRequest("/api/companion/messages", {
            method: "POST",
            body: {
              content: optimistic.content,
              last_extracted: lastExtracted || undefined,
              ...(sentAttachments.length > 0 ? { attachments: sentAttachments } : {}),
              ...(sentBuddy?.id ? { buddy_id: sentBuddy.id } : {}),
            }
          });
          if (res?.reply) {
            const next = [...messagesRef.current.filter((m) => m.id !== optimistic.id), res.message || optimistic, res.reply];
            messagesRef.current = next;
            setMessages(next);
            lastIdRef.current = res.reply.id;
          }
          const pendingFromFlow = res?.extracted?.type === "plan"
            ? { ...res.extracted, proposal_id: crypto.randomUUID() }
            : res?.extracted || null;
          if (res?.task?.title) {
            setPending({
              type: "task",
              title: res.task.title,
              description: res.task.description || "",
              due_at: res.task.due_at || undefined,
              buddy_id: res.buddy?.id,
              buddy_name: res.buddy?.name,
            });
          } else if (res?.proposal?.type === "create_collab") {
            setPending({
              type: "collab",
              title: res.proposal.title,
              goal: res.proposal.goal || "",
              description: res.proposal.goal || "",
              scenario: res.proposal.scenario || "friends",
              buddy_id: res.buddy?.id,
              buddy_name: res.buddy?.name,
            });
          } else {
            setPending(pendingFromFlow);
          }
          setActions(Array.isArray(res?.actions) && res.actions.length > 0 ? res.actions : null);
          if (res?.agent?.executionId) {
            setAgentExecId(res.agent.executionId);
            setAgentActive(false);
            setAgentLiveOpen(false);
            setAgentWaiting(null);
            setAgentReplyText("");
            setAgentTakeoverRequested(0);
          }
          scrollToBottom();
          if (res?.capture && res?.buddy?.id) {
            await applyCaptureFromMain(res, sentAttachments);
          }
          return true;
        } catch (err) {
          if (err?.status !== 404) throw err;
          markUnsupported();
        }
      }
      return await sendViaLegacyChat(t, lastExtracted);
    } catch (_err) {
      appendMessage({ id: `local-err-${Date.now()}`, role: "assistant", content: "网络好像不太顺…等下再跟我说一次好吗？", kind: "chat", created_date: new Date().toISOString() });
      scrollToBottom();
      return false;
    } finally {
      setBusy(false);
    }
  }, [busy, appendMessage, markUnsupported, scrollToBottom, inline, applyCaptureFromMain]);

  const send = async () => {
    const sentAttachments = attachments;
    const sentMention = mentionBuddy;
    const raw = input.trim();
    if ((!raw && sentAttachments.length === 0) || busy || uploading) return;
    const fallbackLabel = sentAttachments.some((a) => String(a.type || "").startsWith("image/"))
      ? "（图片）"
      : sentAttachments.some((a) => String(a.type || "").startsWith("video/"))
        ? "（视频）"
        : "（文件）";
    let content = raw || fallbackLabel;
    if (sentMention && !content.includes(`@${sentMention.name}`)) {
      content = `@${sentMention.name} ${content}`;
    }
    // 先把输入区清空，不让「同步跑步记录/打卡」的等待把已发出的文字留在输入框里
    const sendingPromise = sendText(content, pending, { attachments: sentAttachments, buddy: sentMention });
    setInput("");
    setAttachments([]);
    setMentionBuddy(null);
    setMentionQuery(null);
    const ok = await sendingPromise;
    if (!ok) {
      setInput(raw);
      setAttachments(sentAttachments);
      setMentionBuddy(sentMention);
    }
  };

  // 「不对，再聊聊」：创建提案收回，继续对话
  const rejectPending = () => {
    if (!pending || busy) return;
    const last = pending;
    setPending(null);
    sendText("这个不对，我想改一下", last);
  };

  // ── 创建提案确认：真正落库 ──
  const confirmCreate = async () => {
    if (!pending || acting) return;
    setActing(true);
    try {
      let doneLabel = "";
      let planChildCount = 0;
      let collabCreated = false;
      if (pending.type === "task") {
        const firstUserText = messagesRef.current.find((m) => m.role === "user")?.content || "";
        await httpRequest("/api/tasks", {
          method: "POST",
          body: {
            title: pending.title,
            description: pending.description || firstUserText || undefined,
            category: pending.category || "personal",
            priority: pending.priority || "medium",
            due_at: pending.due_at || undefined,
            ...(pending.buddy_id
              ? { metadata: { _extraFields: { buddy_id: pending.buddy_id, buddy_name: pending.buddy_name } } }
              : {}),
          }
        });
        doneLabel = pending.title;
      } else if (pending.type === "heart") {
        const isLedger = detectLedgerLike(pending.content);
        await httpRequest("/api/notes", {
          method: "POST",
          body: {
            title: isLedger ? "账本" : "心签",
            content: pending.content,
            plain_text: pending.content,
            source_type: isLedger ? "ledger" : "emotion",
            tags: isLedger ? ["账本", "心签"] : ["情绪", "心签"]
          }
        });
        doneLabel = isLedger ? "账本" : "心签";
      } else if (pending.type === "link") {
        const url = extractUrl(pending.text) || "";
        await httpRequest("/api/notes", {
          method: "POST",
          body: {
            title: pending.text.slice(0, 60).replace(url, "").trim() || "外部链接",
            content: pending.text,
            tags: ["外部信息", "链接"]
          }
        });
        doneLabel = "链接";
      } else if (pending.type === "collab") {
        const scenario = pending.scenario || "friends";
        await httpRequest("/api/tasks", {
          method: "POST",
          body: {
            title: pending.title,
            description: pending.goal || pending.description || "",
            category: "collab",
            status: "pending",
            priority: "medium",
            metadata: {
              collab: {
                scenario,
                goal: pending.goal || "",
                agent: { enabled: true, paused: false },
                confirmRule: scenario === "couple" ? "all" : "owner",
              },
              ...(pending.buddy_id
                ? { _extraFields: { buddy_id: pending.buddy_id, buddy_name: pending.buddy_name } }
                : {}),
            },
          },
        });
        doneLabel = pending.title;
        collabCreated = true;
      } else if (pending.type === "plan") {
        const pl = pending.plan || {};
        if (!pl.parent || !Array.isArray(pl.children) || pl.children.length === 0 || pl.source === "fallback") {
          throw new Error("计划尚未准备好，请重新生成后再确认。");
        }
        const { parent: p, children } = pl;
        if (pending.plan_proposal_id) {
          await httpRequest(`/api/tasks/plan-proposals/${encodeURIComponent(pending.plan_proposal_id)}/confirm`, {
            method: "POST", body: {},
          });
        } else {
          await httpRequest("/api/tasks/plan", {
            method: "POST",
            body: {
              proposal_id: pending.proposal_id,
              memory_proposal_id: pending.memory_proposal_id,
              parent: {
                title: p.title,
                description: p.description || undefined,
                category: p.category || "personal",
                priority: p.priority || "medium",
                status: "pending"
              },
              children: children.map((c) => ({
                title: c.title,
                description: c.description || undefined,
                category: p.category || "personal",
                priority: p.priority || "medium",
                reminder_time: `${c.date}T${c.start_time}:00+08:00`,
                end_time: `${c.date}T${c.end_time}:00+08:00`,
                plan_kind: c.kind,
                plan_group: c.plan_group,
                session_type: c.session_type,
                note: c.note || undefined,
                tags: ["智能规划"]
              }))
            }
          });
        }
        doneLabel = p.title;
        planChildCount = children.length;
      } else {
        return;
      }
      const echo = collabCreated
        ? `协同约定「${doneLabel}」已创建 ✓ 去约定列表就能邀请伙伴一起推进。`
        : planChildCount
          ? `「${doneLabel}」的智能规划已生成 ✓ 共 ${planChildCount} 条子约定排在接下来的日子里。`
          : `「${doneLabel}」已为你记下了 ✓ 还想聊点什么吗？`;
      setPending(null);
      await appendEcho(echo);
      queryClient.invalidateQueries();
    } catch (err) {
      appendMessage({ id: `local-err-${Date.now()}`, role: "assistant", content: `生成时出了点问题：${err?.message || "请再试一次"}`, kind: "chat", created_date: new Date().toISOString() });
    } finally {
      setActing(false);
    }
  };

  // ── 动作提案确认：服务端校验权限并落库 ──
  const confirmActions = async () => {
    if (!actions?.length || acting) return;
    setActing(true);
    try {
      const res = await httpRequest("/api/companion/actions", {
        method: "POST",
        body: { actions }
      });
      const results = Array.isArray(res?.results) ? res.results : [];
      const okList = results.filter((r) => r.ok);
      const failList = results.filter((r) => !r.ok);
      const lines = [];
      if (okList.length > 0) lines.push(okList.map((r) => `✓ ${r.label || "已完成"}`).join("\n"));
      if (failList.length > 0) lines.push(failList.map((r) => `✗ ${r.label || "有一项"}：${r.error || "没成功"}`).join("\n"));
      const echo = lines.join("\n") || "处理好了。";
      setActions(null);
      await appendEcho(echo);
      queryClient.invalidateQueries();
    } catch (err) {
      appendMessage({ id: `local-err-${Date.now()}`, role: "assistant", content: `执行时出了点问题：${err?.message || "请再试一次"}`, kind: "chat", created_date: new Date().toISOString() });
    } finally {
      setActing(false);
    }
  };

  const appendEcho = async (echo) => {
    if (supportedRef.current) {
      const res = await httpRequest("/api/companion/messages", {
        method: "POST",
        body: { assistant_echo: echo }
      }).catch(() => null);
      if (res?.message) {
        appendMessage(res.message);
      }
    } else {
      appendMessage({ id: `local-e-${Date.now()}`, role: "assistant", content: echo, kind: "chat", created_date: new Date().toISOString() });
    }
    scrollToBottom();
  };

  // ── 渲染 ──
  const MessageItem = React.memo(function MessageItem({ m }) {
    const mine = m.role === "user";
    const buddy = m.meta?.buddy;
    const buddyTint = buddy?.tint || BUDDY_TINTS[buddy?.id] || BUDDY_TINTS.study;
    const sentAttachments = Array.isArray(m.meta?.attachments) ? m.meta.attachments : [];
    const receipt = m.meta?.capture_receipt || captureDisplay(m.meta?.capture);
    return (
      <div className={`flex items-start gap-2 px-4 mb-4 ${mine ? "flex-row-reverse" : ""}`}>
        {!mine && (
          buddy ? (
            <div className="shrink-0 mt-0.5"><Orb size={32} tint={buddyTint} /></div>
          ) : (
            <img
              src={assistantPlanet}
              alt="心栈小助手"
              className="assistant-avatar w-8 h-8 rounded-full shrink-0 object-cover"
            />
          )
        )}
        <div className={`max-w-[78%] flex flex-col ${mine ? "items-end" : "items-start"}`}>
          {m.kind === "proactive" && (
            <span className="text-[10px] mb-1" style={{ color: "#384877" }}>小助手主动来聊</span>
          )}
          {!mine && buddy && (
            <span className="text-[10px] mb-1" style={{ color: "#63666e" }}>{buddy.name}</span>
          )}
          <div
            className="rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-relaxed whitespace-pre-wrap break-all"
            style={
              mine
                ? { background: "#384877", color: "#fff", borderTopRightRadius: 6 }
                : { background: "#eef1f9", color: "#1c1c1e", border: "1px solid #dbe3f2", borderTopLeftRadius: 6 }
            }
          >
            {mine ? m.content : withoutProviderBrand(m.content)}
            {sentAttachments.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {sentAttachments.map((att, index) =>
                  String(att.type || "").startsWith("image/") ? (
                    <a key={att.url || index} href={att.url} target="_blank" rel="noreferrer" className="block" title="点击查看原图">
                      <img
                        src={att.url}
                        alt={att.name || "图片"}
                        className="max-h-40 w-auto max-w-full rounded-lg border border-white/20 bg-white/10 object-contain"
                      />
                    </a>
                  ) : String(att.type || "").startsWith("video/") ? (
                    <video
                      key={att.url || index}
                      src={att.url}
                      controls
                      preload="metadata"
                      className="max-h-40 w-auto max-w-full rounded-lg border border-white/20 bg-white/10"
                    />
                  ) : (
                    <a
                      key={att.url || index}
                      href={att.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex max-w-[180px] items-center gap-1.5 rounded-lg bg-white/15 px-2 py-1 text-[11px]"
                    >
                      <FileText className="h-3 w-3 shrink-0" />
                      <span className="truncate">{att.name || "文件"}</span>
                    </a>
                  )
                )}
              </div>
            )}
          </div>
          {!mine && receipt && (
            <div
              className={`mt-1.5 flex items-start gap-2 rounded-xl border px-3 py-2 text-[11px] leading-relaxed ${
                receipt.failed
                  ? "border-amber-200/70 bg-amber-50/70 text-amber-700"
                  : "border-emerald-200/70 bg-emerald-50/70 text-emerald-700"
              }`}
            >
              <span className="mt-0.5">{receipt.failed ? "!" : "✓"}</span>
              <div className="min-w-0">
                <span className="font-medium">{receipt.title}</span>
                {receipt.detail && <span className="opacity-80"> · {receipt.detail}</span>}
              </div>
            </div>
          )}
          {!mine && m.meta?.ai && <span className="text-[10px] mt-1" style={{ color: "#9ca0a8" }}>
            {m.meta.ai.source === "ai"
              ? "心栈"
              : ["fallback", "error"].includes(m.meta.ai.source) ? "基础回复" : "系统回复"}
          </span>}
          <span className="text-[10px] mt-1" style={{ color: "#9ca0a8" }}>{fmtTime(m.created_date)}</span>
        </div>
      </div>
    );
  });

  // 内嵌形态的快捷问句：只保留一行，放进消息流里，不再固定占住输入框上方一大块
  const inlineQuickItems = React.useMemo(
    () =>
      (
        quickAsks && quickAsks.length > 0
          ? quickAsks
          : newUser
            ? [
                "提醒我每周日给妈妈打电话",
                "把「先做最重要的一件事」记成心签",
                "帮我做一个 7 天晨读计划",
                "帮我规划一周的产品上新计划",
                "帮我排一个 2 个月的半马计划",
                "拉个协同约定，和朋友一起背单词",
                "帮我订一张明天去上海的高铁票",
                "心里有点乱，陪我聊聊",
              ]
            : [
                "帮我安排今天的计划",
                "帮我规划一周的产品上新计划",
                "帮我排一个 2 个月的半马计划",
                "把现在脑子里的事记成心签",
                "这周我做得怎么样？",
                "拉个协同约定，和朋友一起推进",
                "帮我订一张明天去上海的高铁票",
                "心里有点乱，陪我聊聊",
              ]
      ).map((item) => ({
        label: typeof item === "string" ? item : item.label,
        prompt: typeof item === "string" ? item : item.prompt,
      })),
    [quickAsks, newUser]
  );

  // 面板主体（浮动与内嵌两种形态共用）
  const panelBody = (
    <>
      {/* 头部（浮动形态；内嵌形态用问候区代替） */}
      {!inline && (
      <div className="flex items-center gap-2.5 px-4 py-2.5 shrink-0" style={{ background: "#fff", borderBottom: "1px solid #e8ecef" }}>
        <img src={assistantPlanet} alt="" className={`assistant-avatar w-9 h-9 rounded-full object-cover ${busy ? "assistant-avatar--active" : ""}`} />
        <div className="flex-1 min-w-0">
          <div className="text-[14px] font-semibold" style={{ color: "#1c1c1e" }}>心栈小助手</div>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: busy ? "#f0c36d" : "#1f9d55" }} />
            <span className="text-[11px]" style={{ color: "#63666e" }}>
              {busy ? "正在思考…" : "在线"}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-lg px-2"
          style={{ color: "#9ca0a8", background: "none", border: "none", cursor: "pointer" }}
          aria-label="收起"
        >
          ×
        </button>
      </div>
      )}
      <div className="flex items-center justify-end gap-3 px-4 py-1.5">
        {inline && messages.length > 0 && (
          <button
            type="button"
            onClick={() => {
              const next = !historyOpen;
              setHistoryOpen(next);
              if (next) requestAnimationFrame(scrollToBottom);
            }}
            className="text-xs text-slate-500"
          >
            {historyOpen ? "收起历史" : `历史对话 ${messages.length}`}
          </button>
        )}
        <button type="button" onClick={() => { const next = !memoryOpen; setMemoryOpen(next); if (next) loadMemories(); }} className="text-xs text-slate-500">我的记忆</button>
      </div>
      {memoryOpen && <div className="max-h-52 overflow-auto bg-white px-4 py-3 text-sm border-b border-slate-200">
        <p className="text-xs text-slate-500 mb-2">对小助手说“记住我……”可以添加记忆。</p>
        {memoryLearning?.available && <label className="mb-2 flex items-center gap-2">
          <input type="checkbox" checked={memoryLearning.enabled} onChange={(event) => changeMemoryLearning(event.target.checked)} />
          从对话中自动学习
        </label>}
        <label className="mb-2 flex items-center gap-2">
          <input type="checkbox" checked={showArchivedMemories} onChange={(event) => {
            setShowArchivedMemories(event.target.checked);
            loadMemories(event.target.checked);
          }} />
          显示已停用的记忆
        </label>
        {memoryError && <p role="alert" className="text-red-600">{memoryError}</p>}
        {memories.length === 0 && !memoryError && <p className="text-slate-500">暂无记忆</p>}
        {memories.map((memory) => <div key={memory.id} className="py-2 border-b border-slate-100">
          {editingMemory?.id === memory.id ? (
            <>
              <textarea aria-label="编辑记忆" value={memoryText} onChange={(event) => setMemoryText(event.target.value)} className="w-full border rounded p-1" />
              <button type="button" onClick={saveMemoryEdit}>保存</button>{" "}
              <button type="button" onClick={() => setEditingMemory(null)}>取消</button>
            </>
          ) : (
            <>
              <p>{memory.content || memory.title}</p>
              {memory.memory_status === "superseded" && <p className="text-xs text-slate-500">已被新记忆替代</p>}
              {memory.memory_status === "expired" && <p className="text-xs text-slate-500">已过期</p>}
              {memory.ai_insight?.sourceMessageId && <p className="text-xs text-slate-500">
                来自对话{memory.ai_insight.editedAt ? "，已编辑" : ""} · {fmtTime(memory.created_date)}
                {messages.find((message) => message.id === memory.ai_insight.sourceMessageId)?.content && (
                  <span className="block">原话：{messages.find((message) => message.id === memory.ai_insight.sourceMessageId).content}</span>
                )}
              </p>}
              <button type="button" onClick={() => { setEditingMemory(memory); setMemoryText(memory.content || memory.title); }} className="mr-3 text-blue-700">编辑</button>
              <button type="button" onClick={() => memoryHistory?.id === memory.id ? setMemoryHistory(null) : loadMemoryHistory(memory.id)} className="mr-3 text-blue-700">版本历史</button>
              <button type="button" onClick={() => deleteMemory(memory.id)} className="text-red-700">忘记</button>
              {memoryHistory?.id === memory.id && <div className="mt-2 border-l border-slate-200 pl-3">
                {memoryHistory.revisions.map((revision) => (
                  <div className="mb-2" key={revision.version}>
                    <p className="text-xs text-slate-500">版本 {revision.version} · {fmtTime(revision.createdAt)} · {{ legacy: "旧记录", user: "你", worker: "自动更新" }[revision.actor] || revision.actor}</p>
                    <p>{revision.content || revision.title}</p>
                    {revision.sourceMessageIds.map((source, index) => (
                      <button type="button" key={source} onClick={() => viewRevisionSource(memory.id, revision.version, source)} className="mr-3 text-xs text-blue-700">查看来源 {index + 1}</button>
                    ))}
                    {revision.version !== memoryHistory.version && <button type="button" onClick={() => restoreRevision(memory.id, revision.version, memoryHistory.version)} className="text-xs text-blue-700">恢复此版本</button>}
                    {revisionSource?.memoryId === memory.id && revisionSource.version === revision.version && (
                      <p className="mt-1 text-xs text-slate-500">原话：{revisionSource.content}</p>
                    )}
                  </div>
                ))}
                {memoryHistory.hasMore && <button type="button" onClick={() => loadMemoryHistory(memory.id, memoryHistory.revisions.at(-1).version)} className="text-xs text-blue-700">更早版本</button>}
              </div>}
            </>
          )}
        </div>)}
      </div>}

      {/* 消息流 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto py-4" style={{ minHeight: 0 }}>
        {messages.length === 0 && !inline && (
          <div className="flex flex-col items-center px-6 pb-2">
            <img src={assistantPlanet} alt="" className="assistant-avatar w-20 h-20 rounded-full object-cover mb-3" />
            <div className="rounded-2xl px-4 py-3 text-[13px] leading-relaxed" style={{ background: "#eef1f9", border: "1px solid #dbe3f2", color: "#384877" }}>
              想记的、想定的都可以说给我听；也可以让我直接改东西，确认后我就动手。
            </div>
          </div>
        )}
        {inline && (
          /* 问候（常驻页首）：新用户给引导，老用户给今日总结；之后的提醒与沟通都在本窗口继续 */
          <div className="px-4 pb-3">
            <div className="flex items-start gap-3">
              <img src={assistantPlanet} alt="心栈小助手" className="assistant-avatar w-10 h-10 rounded-full object-cover shrink-0 mt-0.5" style={{ border: "2px solid #d8e0f0" }} />
              <p className="text-[15px] leading-relaxed" style={{ color: "#1c1c1e" }}>
                {newUser
                  ? "今天想做点什么？日程、情绪、随便聊聊都可以找我；你的搭子们也在各自的岗位上待命。"
                  : withoutProviderBrand(summary) || "欢迎回来。想从哪件开始，还是先说点别的？"}
              </p>
            </div>
          </div>
        )}
        {inline && !historyOpen && !input.trim() && !mentionBuddy && inlineQuickItems.length > 0 && (
          /* 快捷问句：单行横滑小胶囊，把纵向空间留给对话 */
          <div className="px-4 pb-3">
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide pb-0.5">
              {inlineQuickItems.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => sendText(item.prompt, null)}
                  disabled={busy}
                  className="shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-[12px] transition-all active:scale-[0.99] disabled:opacity-50"
                  style={{ border: "1px solid #d8e0f0", color: "#384877", background: "#fff", cursor: "pointer" }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        )}
        {(!inline || historyOpen) && messages.map((m) => <MessageItem key={m.id} m={m} />)}
        {busy && (!inline || historyOpen) && (
          <div className="flex items-center gap-2 px-4 mb-4">
            <img src={assistantPlanet} alt="" className="assistant-avatar assistant-avatar--active w-8 h-8 rounded-full shrink-0 object-cover" />
            <div className="rounded-2xl px-3.5 py-2.5 text-[12.5px]" style={{ background: "#eef1f9", border: "1px solid #dbe3f2", color: "#384877" }}>
              正在结合你的真实约定和心签…
            </div>
          </div>
        )}
      </div>

      {/* 动作提案卡片 */}
      {actions && actions.length > 0 && (
        <div className="mx-3 mb-3 rounded-2xl p-4 shrink-0 max-h-80 overflow-y-auto" style={{ background: "#fff", border: "1.5px solid #4a5d8f", boxShadow: "0 4px 16px rgba(56,72,119,0.10)" }}>
          <div className="text-[12px] font-semibold mb-2" style={{ color: "#384877" }}>✋ 确认后我将执行这些修改</div>
          {actions.map((a) => (
            <div key={a.id} className="text-[13px] py-1" style={{ color: "#1c1c1e" }}>· {a.label}</div>
          ))}
          <div className="flex gap-2 mt-3">
            <button
              type="button"
              onClick={() => setActions(null)}
              className="flex-1 rounded-full py-2 text-[12.5px]"
              style={{ border: "1px solid #e8ecef", color: "#63666e", background: "#fff", cursor: "pointer" }}
            >
              先不了
            </button>
            <button
              type="button"
              onClick={confirmActions}
              disabled={acting}
              className="rounded-full py-2 text-[12.5px] font-semibold text-white"
              style={{ flex: 1.4, background: "#384877", border: "none", cursor: "pointer", opacity: acting ? 0.6 : 1 }}
            >
              {acting ? "执行中…" : "确认执行"}
            </button>
          </div>
        </div>
      )}

      {/* 创建提案卡片 */}
      {pending && (
        <div className="mx-3 mb-3 rounded-2xl p-4 shrink-0" style={{ background: "#fff", border: "1.5px solid #4a5d8f", boxShadow: "0 4px 16px rgba(56,72,119,0.10)" }}>
          <div className="text-[12px] font-semibold mb-2" style={{ color: "#384877" }}>
            {TYPE_ICON[pending.type] || "✨"} 帮你整理好了 · {TYPE_LABEL[pending.type] || "提案"}
          </div>
          {pending.type === "plan" ? (
            <div className="text-[13px]" style={{ color: "#1c1c1e" }}>
              <div className="font-semibold">{pending.plan?.parent?.title || "智能规划"}</div>
              <div className="text-[11.5px] mt-1" style={{ color: "#63666e" }}>
                共 {(pending.plan?.children || []).length} 条子约定，按天排好具体时刻
              </div>
              <ul className="mt-2 max-h-56 overflow-auto space-y-2">
                {(pending.plan?.children || []).map((child, index) => (
                  <li key={`${child.date}-${child.start_time}-${index}`} className="rounded-lg bg-slate-50 p-2">
                    <div>{child.date} {child.start_time}–{child.end_time} · {child.title} {child.session_type === "recovery" ? "（恢复）" : child.session_type === "session" ? "（主要活动）" : ""} · {child.duration_minutes} 分钟</div>
                    {child.description && <p className="mt-1 text-xs text-slate-600 whitespace-pre-wrap">{child.description}</p>}
                    {child.note && <p className="mt-1 text-xs text-slate-500">{child.note}</p>}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="text-[13px]" style={{ color: "#1c1c1e" }}>
              <div className="font-semibold">{pending.title || pending.content || pending.text}</div>
              {(pending.goal || pending.description) && (
                <div className="text-[11.5px] mt-1" style={{ color: "#63666e" }}>{pending.goal || pending.description}</div>
              )}
              {pending.type === "task" && pending.due_at && fmtTime(pending.due_at) && (
                <div className="text-[11.5px] mt-1" style={{ color: "#63666e" }}>提醒：{fmtTime(pending.due_at)}</div>
              )}
            </div>
          )}
          <div className="flex gap-2 mt-3">
            <button
              type="button"
              onClick={rejectPending}
              className="flex-1 rounded-full py-2 text-[12.5px]"
              style={{ border: "1px solid #e8ecef", color: "#63666e", background: "#fff", cursor: "pointer" }}
            >
              不对，再聊聊
            </button>
            <button
              type="button"
              onClick={confirmCreate}
              disabled={acting || (pending.type === "plan" && (!pending.plan?.children?.length || pending.plan?.source === "fallback"))}
              className="rounded-full py-2 text-[12.5px] font-semibold text-white"
              style={{ flex: 1.4, background: "#384877", border: "none", cursor: "pointer", opacity: acting ? 0.6 : 1 }}
            >
              {acting ? "生成中…" : "确认生成"}
            </button>
          </div>
        </div>
      )}

      {agentExecId && agentWaiting?.question && (
        <div className="mx-3 mb-2 rounded-2xl border border-amber-200 bg-amber-50/80 p-3">
          <p className="max-h-56 overflow-y-auto whitespace-pre-wrap text-[12.5px] leading-relaxed text-stone-800">
            {agentWaiting.question}
          </p>
          {Array.isArray(agentWaiting.choices) && agentWaiting.choices.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {agentWaiting.choices.map((choice) => (
                <button
                  key={choice}
                  type="button"
                  disabled={agentResponding}
                  onClick={() => {
                    if (String(choice).includes("我自己来操作")) takeoverBrowserAgent();
                    else respondToBrowserAgent({ choice });
                  }}
                  className="rounded-full border border-[#384877]/30 bg-white px-3 py-1.5 text-[11.5px] text-[#384877] transition-colors hover:bg-[#384877]/8 disabled:opacity-50"
                >
                  {choice}
                </button>
              ))}
            </div>
          )}
          <div className="mt-2 flex items-center gap-1.5">
            <input
              value={agentReplyText}
              onChange={(event) => setAgentReplyText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && agentReplyText.trim()) respondToBrowserAgent({ text: agentReplyText.trim() });
              }}
              placeholder="补充说明（可选）…"
              className="min-h-[34px] min-w-0 flex-1 rounded-full border border-stone-200 bg-white px-3 text-[12px] text-stone-800 placeholder:text-stone-400 focus:border-[#384877] focus:outline-none"
            />
            <button
              type="button"
              disabled={agentResponding || !agentReplyText.trim()}
              onClick={() => respondToBrowserAgent({ text: agentReplyText.trim() })}
              className="shrink-0 rounded-full bg-[#384877] px-3 py-1.5 text-[11.5px] font-medium text-white disabled:opacity-50"
            >
              回应
            </button>
          </div>
          <button
            type="button"
            disabled={agentResponding}
            onClick={takeoverBrowserAgent}
            className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-[#384877]/30 px-3 py-1.5 text-[11.5px] font-medium text-[#384877] disabled:opacity-50"
          >
            <Monitor className="h-3.5 w-3.5" /> 我自己来操作网页
          </button>
        </div>
      )}

      {agentExecId && !agentLiveOpen && !agentWaiting?.question && (
        <button
          type="button"
          onClick={() => agentActive && setAgentLiveOpen(true)}
          disabled={!agentActive}
          className="mx-3 mb-2 flex items-center gap-2 rounded-2xl border px-3 py-2 text-left text-[12px] shadow-sm disabled:opacity-70"
          style={{ borderColor: "#dbe3f2", background: "#fff", color: "#384877" }}
        >
          {agentActive ? <Monitor className="h-4 w-4 shrink-0" /> : <Loader2 className="h-4 w-4 shrink-0 animate-spin" />}
          <span className="min-w-0 flex-1 truncate">{agentActive ? "浏览器小助手正在操作网页" : "浏览器小助手准备中…"}</span>
          {agentActive && <span className="shrink-0 text-[11px] text-[#63666e]">查看小窗 →</span>}
        </button>
      )}

      {/* 输入区：@搭子 / 图片文件视频 / 长按语音 */}
      <div className="shrink-0 px-3 py-2.5" style={inline ? { background: "transparent" } : { background: "#fff", borderTop: "1px solid #e8ecef" }}>
        <div className="relative">
          {mentionQuery !== null && (
            <div className="absolute bottom-full left-0 right-0 z-20 mb-2 overflow-hidden rounded-2xl border border-[#dbe3f2] bg-white shadow-[0_12px_30px_rgba(30,42,64,0.18)]">
              <div className="max-h-56 overflow-y-auto py-1">
                {mentionResults.length === 0 && (
                  <p className="px-3 py-2.5 text-[12px] leading-relaxed text-[#9ca0a8]">
                    {mentionBuddies.length === 0 ? "还没有认领搭子，先去搭子Store看看" : "没有匹配的搭子"}
                  </p>
                )}
                {mentionResults.map((buddy, index) => (
                  <button
                    key={buddy.id}
                    type="button"
                    onPointerDown={(event) => {
                      event.preventDefault();
                      chooseMention(buddy);
                    }}
                    className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] transition-colors ${
                      index === mentionIndex ? "bg-[#eef2ff]" : "hover:bg-[#f7f8fc]"
                    }`}
                  >
                    <Orb size={24} tint={buddy.tint} />
                    <span className="flex-1" style={{ color: "#1c1c1e" }}>{buddy.name}</span>
                    <span className="text-[10px]" style={{ color: "#9ca0a8" }}>@{buddy.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {attachments.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {attachments.map((att, index) => (
                <div key={`${att.url}-${index}`} className="relative">
                  {String(att.type || "").startsWith("image/") ? (
                    <a href={att.url} target="_blank" rel="noreferrer" className="block" title="点击查看原图">
                      <img
                        src={att.url}
                        alt={att.name || "图片"}
                        className="h-12 w-12 rounded-xl border border-[#e8ecef] bg-white object-cover"
                      />
                    </a>
                  ) : String(att.type || "").startsWith("video/") ? (
                    <video
                      src={att.url}
                      muted
                      preload="metadata"
                      className="h-12 w-16 rounded-xl border border-[#e8ecef] bg-black object-cover"
                    />
                  ) : (
                    <span className="inline-flex h-12 max-w-[180px] items-center gap-1.5 rounded-xl border border-[#e8ecef] bg-white px-2.5 text-[11px] text-[#63666e]">
                      <FileText className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{att.name || "文件"}</span>
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setAttachments((cur) => cur.filter((_, i) => i !== index))}
                    aria-label="移除附件"
                    className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[#384877] text-white shadow"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {mentionBuddy && (
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px]" style={{ color: "#384877" }}>
              <span className="rounded-full bg-[#eef2ff] px-2 py-0.5">{mentionBuddy.name} 会接这条</span>
              <button
                type="button"
                onClick={() => {
                  setMentionBuddy(null);
                  setInput((prev) => prev.replace(`@${mentionBuddy.name}`, "").trimStart());
                }}
                className="text-[#9ca0a8]"
                aria-label="取消 @搭子"
              >
                ×
              </button>
            </div>
          )}

          {recording && (
            <div className="mb-2 flex items-center gap-2 rounded-2xl border border-[#c9d5ef] bg-[#eef2ff]/80 px-3 py-2 text-[12px]" style={{ color: "#384877" }}>
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#384877] opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[#384877]" />
              </span>
              <span className="shrink-0">正在听…松开结束</span>
              {voiceText && <span className="truncate" style={{ color: "#63666e" }}>{voiceText}</span>}
            </div>
          )}

          <div className="flex items-end gap-1.5">
            <div className="flex shrink-0 items-center gap-0.5 pb-0.5">
              <button
                type="button"
                onClick={openMentionPicker}
                disabled={busy || uploading}
                className="flex h-9 w-8 items-center justify-center rounded-full text-[#63666e] transition-colors hover:bg-[#eef0f5] hover:text-[#384877] disabled:opacity-40"
                title="选择搭子"
                aria-label="选择搭子"
              >
                <AtSign className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={busy || uploading || attachments.length >= 3}
                className="flex h-9 w-8 items-center justify-center rounded-full text-[#63666e] transition-colors hover:bg-[#eef0f5] hover:text-[#384877] disabled:opacity-40"
                title="添加图片、视频或文件"
                aria-label="添加图片、视频或文件"
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
              </button>
            </div>
            <textarea
              ref={composerRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                updateMentionFromInput(e.target.value, e.target.selectionStart);
              }}
              onClick={(e) => updateMentionFromInput(e.target.value, e.target.selectionStart)}
              onPaste={(e) => {
                const files = Array.from(e.clipboardData?.files || []);
                if (files.length > 0) {
                  e.preventDefault();
                  handleFiles(files);
                }
              }}
              onKeyDown={(e) => {
                if (mentionQuery !== null) {
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setMentionQuery(null);
                    return;
                  }
                  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                    e.preventDefault();
                    if (mentionResults.length > 0) {
                      setMentionIndex((index) =>
                        (index + (e.key === "ArrowDown" ? 1 : -1) + mentionResults.length) % mentionResults.length
                      );
                    }
                    return;
                  }
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    const pick = mentionResults[mentionIndex] || mentionResults[0];
                    if (pick) chooseMention(pick);
                    else setMentionQuery(null);
                    return;
                  }
                }
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={1}
              aria-label="聊天输入"
              placeholder={
                mentionBuddy
                  ? `和${mentionBuddy.name}说…`
                  : inline
                    ? "说点什么…"
                    : "跟小助手说…"
              }
              className="flex-1 resize-none px-3.5 py-2.5 text-[13.5px] outline-none"
              style={
                inline
                  ? { background: "#fff", border: "1px solid #e8ecef", borderRadius: 20, maxHeight: 140, minHeight: 40, color: "#1c1c1e" }
                  : { background: "#eef0f5", border: "none", borderRadius: 16, maxHeight: 140, minHeight: 40, color: "#1c1c1e" }
              }
            />
            {input.trim() || attachments.length > 0 ? (
              <button
                type="button"
                onClick={send}
                disabled={busy || uploading}
                className="rounded-full text-white text-[13px] font-semibold shrink-0"
                style={
                  inline
                    ? {
                        minWidth: 48,
                        height: 40,
                        padding: "0 10px",
                        background: "#384877",
                        border: "none",
                        cursor: "pointer",
                        opacity: busy || uploading ? 0.6 : 1,
                      }
                    : {
                        width: 40,
                        height: 40,
                        background: "#384877",
                        border: "none",
                        cursor: "pointer",
                        opacity: busy || uploading ? 0.6 : 1,
                      }
                }
                aria-label="发送"
              >
                {inline ? "发送" : "➤"}
              </button>
            ) : (
              <button
                type="button"
                onPointerDown={(e) => {
                  e.preventDefault();
                  startVoice();
                }}
                onPointerUp={stopVoice}
                onPointerCancel={stopVoice}
                onPointerLeave={() => {
                  if (recording) stopVoice();
                }}
                onContextMenu={(e) => e.preventDefault()}
                onKeyDown={(e) => {
                  if (e.key === " " || e.key === "Enter") {
                    e.preventDefault();
                    if (recording) stopVoice();
                    else startVoice();
                  }
                }}
                disabled={busy || uploading}
                className="flex shrink-0 items-center justify-center rounded-full disabled:opacity-40"
                style={{
                  ...(inline ? { minWidth: 48, padding: "0 10px" } : { width: 40 }),
                  height: 40,
                  background: recording ? "#c9d5ef" : "#eef2ff",
                  color: "#384877",
                  border: "none",
                  cursor: "pointer",
                  touchAction: "none",
                  userSelect: "none",
                  WebkitUserSelect: "none",
                  WebkitTouchCallout: "none",
                }}
                title="长按说话"
                aria-label="长按语音输入"
              >
                <Mic className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.md,.csv"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {agentExecId && agentLiveOpen && (
        <AgentLiveWindow
          executionId={agentExecId}
          compact
          takeoverRequested={agentTakeoverRequested}
          onClose={() => setAgentLiveOpen(false)}
        />
      )}
    </>
  );

  // 内嵌形态（首页通用 Agent 对话层）：无浮动按钮，面板常开
  if (inline) {
    return (
      <div
        className="flex flex-col overflow-hidden rounded-3xl h-[min(680px,calc(100dvh-160px))] min-h-[480px] lg:h-[min(720px,calc(100dvh-120px))]"
        style={{ background: "#FAF9F7", border: "1px solid #e7e5e4" }}
      >
        {panelBody}
      </div>
    );
  }

  return (
    <>
      {/* 右下角机器人入口：手机上抬到底部导航之上，避免压住“我的/通知” */}
      <button
        type="button"
        aria-label="心栈小助手"
        onClick={() => setOpen((v) => !v)}
        className="fixed right-4 bottom-[calc(72px_+_env(safe-area-inset-bottom))] z-[90] rounded-full focus:outline-none md:right-5 md:bottom-5"
        style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer" }}
      >
        <img
          src={assistantPlanet}
          alt=""
          className="assistant-avatar w-14 h-14 rounded-full object-cover"
          style={{ border: "2px solid #fff", boxShadow: "0 8px 24px rgba(61,71,99,0.40)" }}
        />
        {unread > 0 && (
          <span
            className="absolute flex items-center justify-center text-white text-[10px] rounded-full"
            style={{ top: -2, right: -2, minWidth: 18, height: 18, padding: "0 5px", background: "#db3356", border: "2px solid #fff" }}
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {/* 聊天面板 */}
      {open && (
        <div
          className="fixed z-[90] flex flex-col overflow-hidden rounded-3xl inset-x-2 top-[calc(52px_+_env(safe-area-inset-top))] bottom-[calc(72px_+_env(safe-area-inset-bottom))] md:inset-auto md:right-5 md:bottom-[84px] md:top-auto md:w-[min(400px,calc(100vw-40px))] md:h-[min(620px,calc(100dvh-120px))]"
          style={{
            background: "#f5f6fa",
            boxShadow: "0 20px 60px rgba(30,42,64,0.25)",
            border: "1px solid #e8ecef"
          }}
        >
          {panelBody}
        </div>
      )}
    </>
  );
}

export default React.memo(AssistantWidget);
