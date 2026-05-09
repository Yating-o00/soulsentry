import React, { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { invokeAI } from "@/components/utils/aiHelper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Send, Loader2, Check, RotateCcw, Bot, User, CalendarIcon, Clock, Tag, Flag, ListTodo, MapPin, Brain } from "lucide-react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
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

  const callAI = async (userText, prevDraft, lastAiReply) => {
    const now = new Date();
    const prompt = `你是一个任务结构化助手。用户用自然语言描述任务，可能分多轮补充修正。请基于"已有解析"、"上一轮 AI 提问"和"本轮用户输入"，更新结构化任务。

当前时间：${now.toISOString()}（用户时区 Asia/Shanghai）
${prevDraft ? `已有解析：\n${JSON.stringify(prevDraft, null, 2)}` : "（首轮，无已有解析）"}
${lastAiReply ? `上一轮 AI 提问/回复："${lastAiReply}"` : ""}

本轮用户输入："${userText}"

⚠️ 极其重要的对话规则：
- 如果"上一轮 AI 提问"是一个**是/否问题**（如"是否需要添加提醒？"、"是否要设置截止时间？"、"要不要拆成子任务？"），那么用户的简短回答（如"是"、"好"、"添加"、"要"、"对"、"嗯"、"否"、"不"、"不用"、"不需要"、"算了"）是对该问题的**回答**，绝对不可以当作任务标题、子任务或描述内容！
  - "是/好/要/添加/对/嗯" → 表示同意，请执行 AI 上一轮提议的操作（如开启提醒、添加默认子任务等），并在 reply 中再追问具体细节（如"好的，要在什么时间提醒？"）
  - "否/不/不用/不需要/算了" → 表示拒绝，跳过该项设置即可
- 如果用户输入是具体内容（如"准备会议资料"、"明天下午3点"），才作为新字段或新子任务处理。
- 当不确定用户意图时，宁可在 reply 中再问一次，也不要乱填字段。

其他规则：
1. 合并/修正字段（用户新的具体输入优先覆盖旧值）
2. 时间表达解析为 ISO 字符串
3. 只有当用户明确说出**多个具体动作**时，才拆为 subtasks；不要把"添加""好""是"这类回应词当作 subtask
4. 用一句简短中文回复，告诉用户你理解了什么；如果有歧义请提出 1 个澄清问题
5. confidence 表示当前解析的完整度（0-100），>=80 表示信息已较完整
返回 JSON。`;

    return await invokeAI({
      prompt,
      response_json_schema: {
        type: "object",
        properties: {
          reply: { type: "string", description: "给用户的简短回复或澄清问题" },
          confidence: { type: "number" },
          task: {
            type: "object",
            properties: {
              title: { type: "string" },
              description: { type: "string" },
              reminder_time: { type: "string", description: "ISO 时间" },
              end_time: { type: "string" },
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
                  }
                }
              }
            }
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
      const lastAiMsg = [...messages].reverse().find(m => m.role === "ai");
      const res = await callAI(text, draft, lastAiMsg?.content);
      if (res?.task) setDraft(res.task);
      setMessages(prev => [...prev, {
        role: "ai",
        content: res?.reply || "已理解，请确认下方信息。",
        confidence: res?.confidence ?? 0
      }]);
    } catch (e) {
      console.error(e);
      toast.error("AI 解析失败，请重试");
      setMessages(prev => [...prev, { role: "ai", content: "抱歉，解析失败了，请换个说法再试一次。" }]);
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
    if (!draft?.title) {
      toast.error("请先描述任务标题");
      return;
    }
    await onConfirm(draft);
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

              <div className="flex flex-wrap gap-2">
                {draft.reminder_time && (
                  <Badge variant="outline" className="bg-white gap-1">
                    <CalendarIcon className="w-3 h-3" />
                    {(() => { try { return format(new Date(draft.reminder_time), "M月d日 HH:mm", { locale: zhCN }); } catch { return draft.reminder_time; } })()}
                  </Badge>
                )}
                {draft.end_time && (
                  <Badge variant="outline" className="bg-white gap-1">
                    <Clock className="w-3 h-3" />
                    至 {(() => { try { return format(new Date(draft.end_time), "HH:mm"); } catch { return draft.end_time; } })()}
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