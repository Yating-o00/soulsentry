import React, { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { invokeAI } from "@/components/utils/aiHelper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Send, Loader2, Check, RotateCcw, Bot, User, CalendarIcon, Clock, Tag, Flag, ListTodo, MapPin, Brain } from "lucide-react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { formatShanghai, formatShanghaiDateTime, formatShanghaiTime, getTimeContextForAI, parseAsShanghai, parseRelativeMinutes, toShanghaiTimeStr } from "@/lib/timeCore";
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
  const inputRef = useRef(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, draft, isLoading]);

  const callAI = async (userText, prevDraft, lastAiReply, locationCtx) => {
    const timeCtx = getTimeContextForAI();
    const nowISO = timeCtx.now_iso;
    const nowLocal = timeCtx.now_local;

    // 构建位置/作息上下文区块
    let ctxBlock = "";
    if (locationCtx) {
      const placeMap = {
        home: "家中", office: "办公室", gym: "健身房", school: "学校",
        shopping: "购物场所", hospital: "医院", restaurant: "餐厅",
        other: "外出（非常用地点）", unknown: "位置未知（用户拒绝定位或无匹配）",
      };
      const placeText = placeMap[locationCtx.current_place_type] || "位置未知";
      const placeName = locationCtx.current_place_name ? `（${locationCtx.current_place_name}）` : "";
      ctxBlock += `\n【当前位置】${placeText}${placeName}`;
      ctxBlock += `\n【当前时间】${locationCtx.current_time}（${locationCtx.is_workday ? "工作日" : "休息日"}）`;
      if (locationCtx.daily_routine) {
        const r = locationCtx.daily_routine;
        const lines = [];
        if (r.wake_up) lines.push(`起床 ${r.wake_up}`);
        if (r.leave_home) lines.push(`出门 ${r.leave_home}`);
        if (r.arrive_office) lines.push(`到办公室 ${r.arrive_office}`);
        if (r.leave_office) lines.push(`下班 ${r.leave_office}`);
        if (r.arrive_home) lines.push(`到家 ${r.arrive_home}`);
        if (r.sleep) lines.push(`睡觉 ${r.sleep}`);
        if (lines.length > 0) ctxBlock += `\n【用户日常作息】${lines.join(" → ")}`;
      }
    }

    const prompt = `你是一个任务结构化助手。用户用自然语言描述任务，可能分多轮补充修正。请基于"已有解析"、"上一轮 AI 提问"和"本轮用户输入"，更新结构化任务。

${timeCtx.promptSnippet}
当前时间（ISO/UTC）: ${nowISO}
当前时间（北京时间显示）: ${nowLocal}${ctxBlock}
${prevDraft ? `已有解析：\n${JSON.stringify(prevDraft, null, 2)}` : "（首轮，无已有解析）"}
${lastAiReply ? `上一轮 AI 提问/回复："${lastAiReply}"` : ""}

本轮用户输入："${userText}"

⏰ 相对时间处理（最高优先级）：
- "X分钟后" / "几分钟后" / "马上" / "立刻" → 必须基于"当前时间"精确加 X 分钟
  - 例：当前 14:30，用户说"两分钟后提醒我" → reminder_time = "2026-08-21T14:32:00+08:00"
- "X小时后" → 当前时间加 X 小时
- "半小时后" → 加 30 分钟
- "一刻钟后" → 加 15 分钟

⚠️ 极其重要的对话规则：
- 如果"上一轮 AI 提问"是一个**是/否问题**，用户的简短回答（"是/好/要/对/嗯/否/不/不用"）是对该问题的**回答**，绝不可当作任务标题或子任务！
  - 同意 → 执行上一轮 AI 提议，在 reply 里追问下一步具体细节
  - 拒绝 → 跳过该设置
- 用户输入是具体内容时，才作为新字段或新子任务处理
- 不确定时宁可再问一次，也不乱填

🧠 智能时间推断：
当用户**没有明确说出时间**（如"路过加油站提醒我加油"、"出门买菜"），你必须结合【当前位置】+【当前时间】+【用户作息】综合推断 reminder_time，不要简单默认 09:00：

★ 顺路型 / 位置触发型任务（含"路过"、"顺便"、"出门"、"下班路上"等）：
  - 关键：找用户**下一次会经过该地点**的时间窗口
  - 当前在【家中】→ 推断为下次出门通勤前 15 分钟（参考作息 leave_home，无则默认 08:45）
  - 当前在【办公室】或【外出】→ 推断为下次回家路上（参考作息 leave_office/arrive_home，无则默认 18:30）
  - 当前时间已接近通勤时段（差 ≤30 分钟）→ 直接安排在通勤开始时刻
  - 周末/休息日 → 安排在白天外出常见时段（10:00 或 15:30）

★ 时间锚定型任务：晨跑 7:30 / 午饭 12:00 / 吃药 餐后30分钟 / 学习 20:00 / 睡前 22:00

★ 在 task.time_reasoning 字段（不是 description）用一句中文说明**为什么定在这个时间**（例如"你现在在办公室，下班 18:00 后回家路上会路过"）

★ 如果【当前位置】= "unknown" 或【用户作息】缺失，且任务是顺路/位置型 → 在 reply 里**主动追问一句**："为了帮你算最佳提醒时机，告诉我一下：你现在大概在家还是办公室？平时几点出门、几点到家？"，并把 needs_user_context 设为 true。

其他规则：
1. 合并/修正字段（用户新的具体输入优先覆盖旧值）
2. 时间表达解析为 ISO 8601 字符串，必须带 +08:00 时区，例如 "2026-08-21T15:00:00+08:00"
3. 只有用户明确说**多个具体动作**才拆 subtasks
4. confidence 表示当前解析完整度（0-100），>=80 表示信息已完整

返回 JSON。`;

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
              priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
              category: { type: "string", enum: ["work", "personal", "health", "study", "family", "shopping", "finance", "other"] },
              tags: { type: "array", items: { type: "string" } },
              subtasks: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
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
      } catch (e) {
        console.warn("Location context unavailable:", e);
      }

      const lastAiMsg = [...messages].reverse().find(m => m.role === "ai");
      const res = await callAI(text, draft, lastAiMsg?.content, locationCtx);

      // 兼容 AI 可能未按 schema 返回 task 或遗漏 title 的情况
      let nextTask = res?.task;
      if (!nextTask || typeof nextTask !== "object") {
        nextTask = { title: text };
      }
      if (!nextTask.title || typeof nextTask.title !== "string" || !nextTask.title.trim()) {
        // 优先从用户原文提取第一句作为标题兜底
        nextTask.title = text.split(/[。，,；;!！?？\n]/)[0].trim().slice(0, 120) || text.slice(0, 120);
      }

      // 客户端兜底：如果用户明确说了"X分钟后"，但 AI 没按相对时间解析，直接修正
      const relativeMinutes = parseRelativeMinutes(text);
      if (relativeMinutes != null && relativeMinutes > 0) {
        const base = new Date();
        base.setMinutes(base.getMinutes() + relativeMinutes);
        const fallbackISO = base.toLocaleString("en-CA", { timeZone: "Asia/Shanghai", hour12: false }).replace(", ", "T") + ":00+08:00";
        // 仅在 AI 返回的时间与预期相差超过 5 分钟时才覆盖
        const aiTime = nextTask.reminder_time ? parseAsShanghai(nextTask.reminder_time) : null;
        const expectedTime = parseAsShanghai(fallbackISO);
        if (!aiTime || Math.abs(aiTime.getTime() - expectedTime.getTime()) > 5 * 60 * 1000) {
          nextTask.reminder_time = fallbackISO;
          nextTask.time_reasoning = `用户要求 ${relativeMinutes} 分钟后提醒`;
        }
      }

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
    // 把 time_reasoning 作为 ai_context_summary 透传，让灵魂哨兵卡片能展示
    const enriched = {
      ...draft,
      title: finalTitle,
      ai_context_summary: draft?.time_reasoning || draft?.ai_context_summary,
    };
    await onConfirm(enriched);
    setMessages([]);
    setDraft(null);
    onChange("");
  };

  const handleReset = () => {
    setMessages([]);
    setDraft(null);
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
                        <span className="w-1 h-1 rounded-full bg-slate-400" /> {st.title}
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