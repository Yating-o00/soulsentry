import React, { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { invokeAI } from "@/components/utils/aiHelper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Send, Loader2, Check, RotateCcw, Bot, User, CalendarIcon, Clock, Tag, Flag, ListTodo, MapPin, Brain } from "lucide-react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import {
  formatShanghai, formatShanghaiDateTime, formatShanghaiTime,
  getTimeContextForAI, parseAsShanghai, parseRelativeMinutes,
  parseRelativeHours, parseTimeOfDay, parseBeforeTime, parseHybridTime,
  getShanghaiNow, normalizeTaskTime, toShanghaiTimeStr
} from "@/lib/timeCore";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { getCurrentLocationContext } from "@/lib/locationContext";

const CATEGORY_LABELS = {
  work: "💼 工作", personal: "👤 个人", health: "❤️ 健康", study: "📚 学习",
  family: "👨‍👩‍👧‍👦 家庭", shopping: "🛒 购物", finance: "💰 财务", other: "📌 其他"
};
const PRIORITY_LABELS = {
  low: "低", medium: "中", high: "高", urgent: "紧急"
};

/**
 * 综合解析用户自然语言中的时间意图，返回兜底 ISO。
 * 覆盖：X分钟后/小时后、X点前、明天下午3点、今晚等 AI 容易漏算或算错的表达。
 * 对明确的相对时间（X分钟后/小时后）直接覆盖，不再容忍 AI 的默认值。
 */
function resolveNaturalLanguageTime(text, aiReminderTime) {
  if (!text) return null;

  const aiTime = aiReminderTime ? parseAsShanghai(aiReminderTime) : null;
  const withinTolerance = (expected) => {
    if (!aiTime || !expected) return false;
    return Math.abs(aiTime.getTime() - expected.getTime()) <= 5 * 60 * 1000;
  };

  // 1. 相对分钟：语义明确，直接以当前时间 + X 分钟为准
  const relativeMinutes = parseRelativeMinutes(text);
  if (relativeMinutes != null && relativeMinutes > 0) {
    const base = getShanghaiNow();
    base.setMinutes(base.getMinutes() + relativeMinutes);
    return { iso: base.toISOString(), reasoning: `用户要求 ${relativeMinutes} 分钟后提醒` };
  }

  // 2. 相对小时：语义明确，直接以当前时间 + X 小时为准
  const relativeHours = parseRelativeHours(text);
  if (relativeHours != null && relativeHours > 0) {
    const base = getShanghaiNow();
    base.setMinutes(base.getMinutes() + Math.round(relativeHours * 60));
    return { iso: base.toISOString(), reasoning: `用户要求 ${relativeHours} 小时后提醒` };
  }

  // 3. 组合日期+时刻：明天下午3点、后天上午、下周一晚上
  const hybridISO = parseHybridTime(text);
  if (hybridISO) {
    const hybridTime = parseAsShanghai(hybridISO);
    if (!withinTolerance(hybridTime)) {
      return { iso: hybridISO, reasoning: "用户指定了具体日期和时刻" };
    }
    return null;
  }

  // 4. 今天内的时刻："下午3点提醒我"、"晚上8点"、"1点前提醒"
  const timeStr = parseTimeOfDay(text);
  if (timeStr) {
    const now = getShanghaiNow();
    const todayStr = now.toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
    let candidate = parseAsShanghai(`${todayStr}T${timeStr}:00+08:00`);

    // "X点前" 且该时刻已过 → 顺延到明天
    const before = parseBeforeTime(text);
    if (before && candidate && candidate.getTime() <= now.getTime()) {
      const tomorrowStr = new Date(now.getTime() + 24 * 60 * 60 * 1000)
        .toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
      candidate = parseAsShanghai(`${tomorrowStr}T${timeStr}:00+08:00`);
    }

    if (candidate && !withinTolerance(candidate)) {
      return { iso: candidate.toISOString(), reasoning: before ? `用户要求 ${before.timeStr} 前提醒` : `用户指定了今天的时刻 ${timeStr}` };
    }
    return null;
  }

  return null;
}

/**
 * 多轮对话式任务输入
 * - 用户用自然语言描述
 * - AI 解析为结构化预览
 * - 用户可继续追加补充/修正，多轮迭代
 * - 确认后通过 onConfirm 把结构化数据交给父组件填表
 */
export default function SmartDialogInput({ value, onChange, onConfirm }) {
  const [messages, setMessages] = useState([]); // {role, content}
  const [draft, setDraft] = useState(null); // 当前 AI 解析的结构化任务
  const [isLoading, setIsLoading] = useState(false);
  const [lastLocationCtx, setLastLocationCtx] = useState(null);
  const inputRef = useRef(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, draft, isLoading]);

  function looksLikeSubtask(text) {
    const t = String(text || "").trim();
    if (!t) return false;
    const prepKeywords = /提前|准备|提醒|通知|发邮件|发资料|发文件|发链接|叫上|邀请|预约|确认|顺便|先|记得/;
    return prepKeywords.test(t);
  }

  function addOneDayBefore(iso) {
    const d = parseAsShanghai(iso);
    if (!d) return null;
    d.setDate(d.getDate() - 1);
    d.setHours(9, 0, 0, 0);
    return d.toISOString();
  }

  const buildLocationCtxBlock = (locationCtx) => {
    if (!locationCtx) return "";
    const placeMap = {
      home: "家中", office: "办公室", gym: "健身房", school: "学校",
      shopping: "购物场所", hospital: "医院", restaurant: "餐厅",
      other: "外出", unknown: "位置未知",
    };
    const placeText = placeMap[locationCtx.current_place_type] || "位置未知";
    const placeName = locationCtx.current_place_name ? `（${locationCtx.current_place_name}）` : "";
    let block = `\n【当前位置】${placeText}${placeName}`;
    block += `\n【当前时间】${locationCtx.current_time}（${locationCtx.is_workday ? "工作日" : "休息日"}）`;
    if (locationCtx.daily_routine) {
      const r = locationCtx.daily_routine;
      const lines = [];
      if (r.wake_up) lines.push(`起床 ${r.wake_up}`);
      if (r.leave_home) lines.push(`出门 ${r.leave_home}`);
      if (r.arrive_office) lines.push(`到办公室 ${r.arrive_office}`);
      if (r.leave_office) lines.push(`下班 ${r.leave_office}`);
      if (r.arrive_home) lines.push(`到家 ${r.arrive_home}`);
      if (r.sleep) lines.push(`睡觉 ${r.sleep}`);
      if (lines.length > 0) block += `\n【用户日常作息】${lines.join(" → ")}`;
    }
    return block;
  };

  const callAI = async (userText, prevDraft, lastAiReply, locationCtx, isFollowUp = false) => {
    const timeCtx = getTimeContextForAI();
    const nowISO = timeCtx.now_iso;
    const nowLocal = timeCtx.now_local;
    const ctxBlock = buildLocationCtxBlock(locationCtx);

    // 多轮时只保留核心字段，避免 prompt 膨胀导致超时
    const compactDraft = prevDraft
      ? {
          title: prevDraft.title,
          description: prevDraft.description,
          reminder_time: prevDraft.reminder_time,
          end_time: prevDraft.end_time,
          time_reasoning: prevDraft.time_reasoning,
          priority: prevDraft.priority,
          category: prevDraft.category,
          location: prevDraft.location,
          location_type: prevDraft.location_type,
          tags: prevDraft.tags,
          subtasks: (prevDraft.subtasks || []).map((s) => ({
            title: s.title,
            reminder_time: s.reminder_time,
            priority: s.priority
          }))
        }
      : null;

    let prompt;
    if (isFollowUp) {
      // 后续轮次：精简 prompt，只保留必要上下文和更新规则
      prompt = `你是任务结构化助手。用户正在多轮补充一个已有约定，请基于"已有解析"和"本轮输入"更新，返回完整更新后的约定 JSON。

当前时间（ISO/UTC）: ${nowISO}
当前时间（北京时间）: ${nowLocal}${ctxBlock}

已有解析：
${JSON.stringify(compactDraft, null, 2)}

本轮用户输入："${userText}"

关键规则：
1. 用户的新输入是补充/修正，优先作为新字段或子约定处理，**不要替换已有标题**。
2. "提前发邮件"、"准备资料"、"提醒大家"等表述 → 作为 subtasks 追加，并把时间设在父约定之前。
3. 时间解析为 ISO 8601（带 +08:00），相对时间基于当前时间计算。
4. 时间锚点参考：早上=09:00, 中午=12:00, 下午=15:00, 傍晚=18:00, 晚上=20:00, 深夜=22:00, 凌晨=00:00。
5. 返回 JSON。`;
    } else {
      // 首轮：完整 prompt
      prompt = `你是一个任务结构化助手。用户用自然语言描述任务。请解析为结构化约定。

${timeCtx.promptSnippet}
当前时间（ISO/UTC）: ${nowISO}
当前时间（北京时间显示）: ${nowLocal}${ctxBlock}

本轮用户输入："${userText}"

⏰ 相对时间处理（最高优先级）：
- "X分钟后" / "几分钟后" / "马上" / "立刻" → 当前时间加 X 分钟
- "X小时后" → 当前时间加 X 小时
- "半小时后" → 加 30 分钟；"一刻钟后" → 加 15 分钟

🤝 提醒语义：
- "提醒我X分钟后做某事" = X 分钟后提醒开始，默认 1 小时后跟进。
- reminder_time = 当前时间 + X；end_time = reminder_time + 1 小时。

⚠️ 对话规则：
- 已有约定标题时，不要随意替换标题。
- "提前发邮件"、"准备资料"、"提醒大家"等是准备步骤/子约定，作为 subtasks 追加。
- 用户输入是具体内容时，才作为新字段或新子任务处理。

🧠 智能时间推断：
- 无明确时间时结合【当前位置】+【当前时间】+【用户作息】推断，不要简单默认 09:00。
- 顺路/位置型任务：找下一次经过该地点的时间窗口。
- 时间锚定型：晨跑 7:30 / 午饭 12:00 / 学习 20:00 / 睡前 22:00。

📍 地点与事件识别：
- 地点关键词：公司/家/医院/学校/健身房/超市/餐厅/机场 → task.location + task.location_type。
- 事件类型：会议/用餐/就医/出行/生活/工作/学习/运动/社交 → task.event_type。
- 无地点时用当前位置兜底，无当前位置则 location_type="unknown"。

其他规则：
1. 时间输出 ISO 8601 带 +08:00，例如 "2026-08-21T15:00:00+08:00"。
2. 只有用户明确说多个具体动作才拆 subtasks。
3. confidence 0-100，>=80 表示信息完整。

返回 JSON。`;
    }

    return await invokeAI({
      prompt,
      response_json_schema: {
        type: "object",
        properties: {
          reply: { type: "string", description: "给用户的简短回复或澄清问题" },
          confidence: { type: "number" },
          needs_user_context: { type: "boolean", description: "是否需要用户补充位置/作息信息" },
          task: {
            type: "object",
            properties: {
              title: { type: "string" },
              description: { type: "string" },
              reminder_time: { type: "string", description: "ISO 8601 时间，必须带 +08:00 时区" },
              end_time: { type: "string", description: "ISO 8601 时间，必须带 +08:00 时区" },
              time_reasoning: { type: "string", description: "为什么定在这个时间（中文一句话）" },
              location: { type: "string", description: "地点名称，如公司/家/医院" },
              location_type: { type: "string", enum: ["office", "home", "hospital", "school", "gym", "shopping", "restaurant", "transit", "unknown", "other"], description: "地点类型" },
              event_type: { type: "string", enum: ["会议", "用餐", "就医", "出行", "生活", "工作", "学习", "运动", "社交", "其他"], description: "事件类型" },
              priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
              category: { type: "string", enum: ["work", "personal", "health", "study", "family", "shopping", "finance", "other"] },
              tags: { type: "array", items: { type: "string" } },
              subtasks: {
                type: "array",
                description: "父约定的准备步骤或子动作。每个子约定必须有 title，可独立设置 reminder_time（必须在父约定 reminder_time 之前）",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    reminder_time: { type: "string", description: "子约定提醒时间 ISO 8601，必须带 +08:00 时区，且应在父约定之前" },
                    time_reasoning: { type: "string", description: "为什么子约定定在这个时间" },
                    priority: { type: "string", enum: ["low", "medium", "high", "urgent"] }
                  },
                  required: ["title"]
                }
              }
            },
            required: ["title"]
          }
        },
        required: ["reply", "task"]
      }
    }, "task_breakdown");
  };

  const handleSend = async () => {
    const text = (value || "").trim();
    if (!text || isLoading) return;

    const userMsg = { role: "user", content: text };
    setMessages(prev => [...prev, userMsg]);
    onChange("");
    setIsLoading(true);

    try {
      // 获取当前位置 + 作息上下文（仅首轮或 draft 还没时间时拿一次，避免重复定位）
      let locationCtx = null;
      try {
        locationCtx = await getCurrentLocationContext();
        setLastLocationCtx(locationCtx);
      } catch (e) {
        console.warn("Location context unavailable:", e);
      }

      const lastAiMsg = [...messages].reverse().find(m => m.role === "ai");
      const res = await callAI(text, draft, lastAiMsg?.content, locationCtx, messages.length > 0);

      // 兼容 AI 可能未按 schema 返回 task 或遗漏 title 的情况
      let nextTask = res?.task;
      if (!nextTask || typeof nextTask !== "object") {
        nextTask = { title: text };
      }
      if (!nextTask.title || typeof nextTask.title !== "string" || !nextTask.title.trim()) {
        // 优先从用户原文提取第一句作为标题兜底
        nextTask.title = text.split(/[。，,；;!！?？\n]/)[0].trim().slice(0, 120) || text.slice(0, 120);
      }

      // 客户端兜底：覆盖 AI 没按相对时间解析的常见表达（主约定）
      let timeSource = nextTask.reminder_time ? "ai" : null;
      const fallbackTime = resolveNaturalLanguageTime(text, nextTask.reminder_time);
      if (fallbackTime) {
        nextTask.reminder_time = fallbackTime.iso;
        timeSource = "explicit";
        if (fallbackTime.reasoning) {
          nextTask.time_reasoning = fallbackTime.reasoning;
        }
      }

      // 多轮补充：如果用户输入看起来像准备步骤/子约定，不要替换父约定标题，而是追加子约定
      if (draft?.title && draft.title !== nextTask.title && looksLikeSubtask(text)) {
        const subtaskTime = nextTask.reminder_time
          || addOneDayBefore(draft.reminder_time)
          || fallbackTime?.iso;
        const subtaskTimeReasoning = subtaskTime
          ? (nextTask.reminder_time
              ? nextTask.time_reasoning || "按你指定时间安排"
              : "安排在父约定前一天上午，便于提前准备")
          : undefined;
        const newSubtask = {
          title: nextTask.title,
          priority: nextTask.priority || "medium",
          ...(subtaskTime ? { reminder_time: subtaskTime } : {}),
          ...(subtaskTimeReasoning ? { time_reasoning: subtaskTimeReasoning } : {})
        };
        nextTask = {
          ...draft,
          subtasks: [...(draft.subtasks || []), newSubtask]
        };
        timeSource = nextTask.reminder_time ? timeSource : (draft.reminder_time ? "ai" : "now");
      }

      // 客户端兜底：地点未识别时使用当前位置上下文
      if (!nextTask.location || !nextTask.location.trim()) {
        if (locationCtx?.current_place_name) {
          nextTask.location = locationCtx.current_place_name;
          nextTask.location_type = locationCtx.current_place_type || "unknown";
          nextTask.time_reasoning = nextTask.time_reasoning
            ? `${nextTask.time_reasoning}；未指定地点，使用你当前所在位置「${locationCtx.current_place_name}」`
            : `未指定地点，使用你当前所在位置「${locationCtx.current_place_name}」`;
        } else {
          nextTask.location_type = nextTask.location_type || "unknown";
        }
      }

      // 记录创建时的时空上下文，供后端情境感知使用
      nextTask.spatiotemporal = {
        created_at: new Date().toISOString(),
        input: text.slice(0, 500),
        current_place_type: locationCtx?.current_place_type || "unknown",
        current_place_name: locationCtx?.current_place_name || null,
        time_source: timeSource || "now",
        ...(locationCtx?.coords ? { coords: locationCtx.coords } : {})
      };

      setDraft(nextTask);
      setMessages(prev => [...prev, {
        role: "ai",
        content: res?.reply || "已理解，请确认下方信息。",
        confidence: res?.confidence ?? 0
      }]);
    } catch (e) {
      console.error(e);
      const errMsg = e?.message || "AI 解析失败，请重试";
      toast.error(errMsg);
      setMessages(prev => [...prev, { role: "ai", content: `抱歉，${errMsg}` }]);
    } finally {
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleConfirm = async () => {
    const userText = (value || "").trim();
    if (!draft?.title) {
      if (userText) {
        setDraft(prev => ({
          ...prev,
          title: userText.split(/[。，,；;!！?？\n]/)[0].trim().slice(0, 120)
        }));
        // 让状态更新后再继续，这里直接构造提交对象
      } else {
        toast.error("请先描述任务标题");
        return;
      }
    }

    const finalTitle = draft?.title || userText.split(/[。，,；;!！?？\n]/)[0].trim().slice(0, 120);

    // 若用户直接确认而无 AI 解析，尝试用当前位置兜底
    let spatiotemporal = draft?.spatiotemporal || {
      created_at: new Date().toISOString(),
      input: userText.slice(0, 500),
      current_place_type: lastLocationCtx?.current_place_type || "unknown",
      current_place_name: lastLocationCtx?.current_place_name || null,
      time_source: "now",
      ...(lastLocationCtx?.coords ? { coords: lastLocationCtx.coords } : {})
    };

    // 把 time_reasoning 作为 ai_context_summary 透传，让灵魂哨兵卡片能展示
    const enriched = normalizeTaskTime({
      ...draft,
      title: finalTitle,
      ai_context_summary: draft?.time_reasoning || draft?.ai_context_summary,
      location: draft?.location || lastLocationCtx?.current_place_name || "",
      location_type: draft?.location_type || lastLocationCtx?.current_place_type || "unknown",
      event_type: draft?.event_type || "其他",
      metadata: {
        ...(draft?.metadata || {}),
        _extraFields: {
          ...(draft?.metadata?._extraFields || {}),
          spatiotemporal
        }
      }
    });
    await onConfirm(enriched);
    setMessages([]);
    setDraft(null);
    setLastLocationCtx(null);
    onChange("");
  };

  const handleReset = () => {
    setMessages([]);
    setDraft(null);
    setLastLocationCtx(null);
    onChange("");
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      {/* 对话区 */}
      {messages.length > 0 && (
        <div ref={scrollRef} className="max-h-72 overflow-y-auto p-4 space-y-3 bg-slate-50/50 border-b border-slate-100">
          <AnimatePresence initial={false}>
            {messages.map((m, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {m.role === "ai" && (
                  <div className="h-7 w-7 rounded-full bg-[#384877] flex items-center justify-center flex-shrink-0">
                    <Bot className="w-4 h-4 text-white" />
                  </div>
                )}
                <div className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm ${
                  m.role === "user"
                    ? "bg-[#384877] text-white rounded-br-sm"
                    : "bg-white text-slate-700 border border-slate-200 rounded-bl-sm"
                }`}>
                  {m.content}
                </div>
                {m.role === "user" && (
                  <div className="h-7 w-7 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0">
                    <User className="w-4 h-4 text-slate-600" />
                  </div>
                )}
              </motion.div>
            ))}
            {isLoading && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-2 justify-start">
                <div className="h-7 w-7 rounded-full bg-[#384877] flex items-center justify-center flex-shrink-0">
                  <Bot className="w-4 h-4 text-white" />
                </div>
                <div className="px-3 py-2 rounded-2xl bg-white border border-slate-200 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* 解析预览 */}
      <AnimatePresence>
        {draft && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="border-b border-slate-100 bg-gradient-to-br from-blue-50/50 to-indigo-50/30"
          >
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#384877]">
                <Sparkles className="w-3.5 h-3.5" /> AI 解析结果（可继续补充修正）
              </div>

              {draft.title && (
                <div className="text-base font-bold text-slate-800">{draft.title}</div>
              )}
              {draft.description && (
                <div className="text-sm text-slate-600">{draft.description}</div>
              )}

              {draft.time_reasoning && (
                <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-100">
                  <Brain className="w-3.5 h-3.5 text-purple-600 flex-shrink-0 mt-0.5" />
                  <span className="text-xs text-slate-700 leading-relaxed">
                    <span className="font-semibold text-purple-700">AI 时机推断：</span>
                    {draft.time_reasoning}
                  </span>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {draft.reminder_time && (
                  <Badge variant="outline" className="bg-white gap-1">
                    <CalendarIcon className="w-3 h-3" />
                    {formatShanghaiDateTime(draft.reminder_time)}
                  </Badge>
                )}
                {draft.end_time && (
                  <Badge variant="outline" className="bg-white gap-1">
                    <Clock className="w-3 h-3" />
                    至 {formatShanghaiTime(draft.end_time)}
                  </Badge>
                )}
                {draft.location && (
                  <Badge variant="outline" className="bg-white gap-1">
                    <MapPin className="w-3 h-3" />
                    {draft.location}
                  </Badge>
                )}
                {draft.category && (
                  <Badge variant="outline" className="bg-white">{CATEGORY_LABELS[draft.category] || draft.category}</Badge>
                )}
                {draft.priority && (
                  <Badge variant="outline" className="bg-white gap-1">
                    <Flag className="w-3 h-3" /> {PRIORITY_LABELS[draft.priority] || draft.priority}
                  </Badge>
                )}
                {(draft.tags || []).map(t => (
                  <Badge key={t} variant="secondary" className="bg-blue-100 text-blue-700 gap-1">
                    <Tag className="w-3 h-3" /> {t}
                  </Badge>
                ))}
              </div>

              {draft.subtasks && draft.subtasks.length > 0 && (
                <div className="pt-2 border-t border-slate-200/60">
                  <div className="flex items-center gap-1 text-xs font-medium text-slate-500 mb-1.5">
                    <ListTodo className="w-3 h-3" /> 子约定 ({draft.subtasks.length})
                  </div>
                  <ul className="space-y-1">
                    {draft.subtasks.map((st, i) => (
                      <li key={i} className="text-sm text-slate-600 flex items-center gap-2">
                        <span className="w-1 h-1 rounded-full bg-slate-400" />
                        <span className="flex-1">{st.title}</span>
                        {st.reminder_time && (
                          <span className="text-xs text-slate-400">
                            {formatShanghaiDateTime(st.reminder_time)}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <Button onClick={handleConfirm} className="flex-1 bg-[#384877] hover:bg-[#2c3b63] text-white">
                  <Check className="w-4 h-4 mr-1.5" /> 确认无误，生成约定
                </Button>
                <Button onClick={handleReset} variant="outline" size="icon" title="重新开始">
                  <RotateCcw className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 输入区 */}
      <div className="p-3 flex items-end gap-2">
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={messages.length === 0 ? "用一句话描述你的约定，比如：明天下午3点和李明开会讨论方案..." : "继续补充或修正，比如：改成下周三、加个准备资料的子任务..."}
          disabled={isLoading}
          className="flex-1 bg-slate-50 border-slate-200 rounded-xl"
        />
        <Button
          onClick={handleSend}
          disabled={!value?.trim() || isLoading}
          className="bg-[#384877] hover:bg-[#2c3b63] text-white rounded-xl flex-shrink-0"
        >
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </Button>
      </div>
    </div>
  );
}