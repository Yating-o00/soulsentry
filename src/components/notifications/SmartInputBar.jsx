import React, { useState, useEffect, useRef, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Mic, MicOff, Loader2 } from "lucide-react";
import { format, parseISO, isToday, isTomorrow } from "date-fns";
import { generateExecutionPlan, executeStep } from "./ExecutionPlanGenerator";
import { getShanghaiNow } from "@/lib/timeCore";
import { deepSemanticParse } from "@/components/utils/semanticParser";
import ChatPasteRecognizer from "@/components/heartsign/ChatPasteRecognizer";
import { looksLikeChatLog } from "@/components/utils/processPastedContent";

const SAMPLES = ['明早7点飞深圳', '今晚8点给妈妈打电话', '突然想去看看海', '今天有点累，但很踏实'];

// 可自动执行的差事关键词:命中则除约定卡片外,还会自动编织产物(邮件/调研/PPT/笔记/账本…)
const AUTO_RE = /邮件|email|e-mail|调研|调查报告|报告|ppt|PPT|总结|笔记|账本|文档|周报|月报|纪要|简历|方案|数据分析|邀请函|合同|议程/;

// 心签二级分类
function noteFlavor(text, intent) {
  if (intent === 'wish') return '愿望';
  if (/灵感|点子|想法|感悟|意识到|学到|突然想到/.test(text)) return '灵感';
  if (/复盘|反思|总结|记录一下/.test(text)) return '复盘';
  return '心绪';
}

const NOTE_CATEGORY_LABELS = {
  work: '工作', personal: '生活', health: '健康', study: '学习',
  family: '家人', shopping: '购物', finance: '财务', other: '点滴',
};

function fmtDayTime(iso) {
  try {
    const d = parseISO(iso);
    const day = isToday(d) ? '今天' : isTomorrow(d) ? '明天' : format(d, 'M月d日');
    return `${day} ${format(d, 'HH:mm')}`;
  } catch {
    return '';
  }
}

/**
 * 心栈之门 —— 今日页统一记忆入口(视觉对齐参考稿 HeroGate)
 * 用户只管说,后台判断归属:
 *  - 约定(schedule/task/reminder/meeting):建约定卡片,AI 规划详细说明 + 子约定链路
 *  - 心签(note/wish):按内容与语义自动分类收进心签
 *  - 可自动执行的差事(关键词命中):约定卡片 + 自动编织产物
 */
export default function SmartInputBar() {
  const [inputValue, setInputValue] = useState("");
  const [focused, setFocused] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [echo, setEcho] = useState(null); // 记忆回响:刚才那一句去了哪里
  const [semanticAnalysis, setSemanticAnalysis] = useState(null);
  const [isAiAnalyzing, setIsAiAnalyzing] = useState(false);
  const [isListeningVoice, setIsListeningVoice] = useState(false);
  const [showChatRecognizer, setShowChatRecognizer] = useState(false);
  const aiTimerRef = useRef(null);
  const recognitionRef = useRef(null);
  const queryClient = useQueryClient();

  // —— 实时倾听:输入停顿 1s 后做一次深度语义解析,驱动「我会把它收进…」预览 ——
  const analyzeWithAI = useCallback(async (text) => {
    if (!text || text.trim().length < 3) {
      setSemanticAnalysis(null);
      return;
    }
    setIsAiAnalyzing(true);
    try {
      const result = await deepSemanticParse(text, { enableSmartComplete: false });
      setSemanticAnalysis(result);
    } catch (e) {
      console.error('Semantic analysis failed:', e);
      setSemanticAnalysis(null);
    } finally {
      setIsAiAnalyzing(false);
    }
  }, []);

  useEffect(() => {
    if (aiTimerRef.current) clearTimeout(aiTimerRef.current);
    if (!inputValue || inputValue.trim().length < 3) {
      setSemanticAnalysis(null);
      return;
    }
    aiTimerRef.current = setTimeout(() => analyzeWithAI(inputValue), 1000);
    return () => { if (aiTimerRef.current) clearTimeout(aiTimerRef.current); };
  }, [inputValue, analyzeWithAI]);

  useEffect(() => () => {
    try { recognitionRef.current?.stop?.(); } catch {}
  }, []);

  // —— 预览分类:优先用 AI 意图,关键词补充「自动执行」判定 ——
  const preview = (() => {
    const text = inputValue.trim();
    if (text.length < 4) return null;
    const intent = semanticAnalysis?.primary_intent;
    const isHeartSign = intent === 'note' || intent === 'wish';
    const auto = AUTO_RE.test(text);
    const kindLabel = isHeartSign ? '心签' : '约定';
    const artifacts = isHeartSign ? ['心签'] : auto ? ['约定', '自动执行'] : ['约定'];
    const timeEntity = semanticAnalysis?.time_entities?.find(
      (t) => t.resolved_datetime && t.time_confidence !== 'low'
    );
    return {
      kindLabel,
      artifacts,
      time: timeEntity?.resolved_datetime ? fmtDayTime(timeEntity.resolved_datetime) : null,
      analyzing: isAiAnalyzing && !semanticAnalysis,
    };
  })();

  const resolveSemanticNow = async () => {
    if (semanticAnalysis) return semanticAnalysis;
    if (inputValue.trim().length < 3) return null;
    setIsAiAnalyzing(true);
    try {
      return await deepSemanticParse(inputValue, { enableSmartComplete: false });
    } catch {
      return null;
    } finally {
      setIsAiAnalyzing(false);
    }
  };

  // —— 心签路径:自动分类,收进 Note ——
  const createHeartSign = async (text, semantic) => {
    const now = new Date().toISOString();
    const intent = semantic?.primary_intent;
    const flavor = noteFlavor(text, intent);
    const catLabel = NOTE_CATEGORY_LABELS[semantic?.category] || '生活';
    const title = semantic?.refined_title || text.slice(0, 24);

    const note = await base44.entities.Note.create({
      title,
      content: text,
      plain_text: text,
      tags: ['心签', flavor, catLabel, ...(semantic?.tags || [])].slice(0, 5),
      color: 'blue',
    });

    // 轻量执行记录:category=note 且无 automation_type,不会混入「心栈为你编织」甲板
    try {
      await base44.entities.TaskExecution.create({
        task_title: title.slice(0, 60),
        original_input: text,
        execution_status: 'completed',
        category: 'note',
        completed_at: now,
        ai_parsed_result: {
          intent: intent || 'note',
          summary: semantic?.intent_reasoning || '',
        },
        execution_steps: [{
          step_name: '收进心签',
          status: 'completed',
          detail: `已分类：${flavor} · ${catLabel}`,
          timestamp: now,
        }],
      });
      queryClient.invalidateQueries({ queryKey: ['task-executions'] });
    } catch (e) {
      console.warn('note execution record skipped:', e?.message);
    }

    queryClient.invalidateQueries({ queryKey: ['notes'] });
    return note;
  };

  const handleAddTask = async (taskData) => {
    const userInput = taskData.title || "";
    if (!userInput.trim()) return;

    const now = new Date().toISOString();
    const semanticHint = taskData._semantic || null;
    let execution = null;

    // Create initial execution record
    try {
      execution = await base44.entities.TaskExecution.create({
        task_title: userInput.slice(0, 60),
        original_input: userInput,
        execution_status: "parsing",
        category: semanticHint?.primary_intent === "wish" ? "note" :
                  semanticHint?.primary_intent === "note" ? "note" : "task",
        execution_steps: [
          { step_name: "深度语义解析", status: "completed", detail: semanticHint ? `意图: ${semanticHint.primary_intent} (${Math.round((semanticHint.intent_confidence || 0) * 100)}%)` : "跳过", timestamp: now },
          { step_name: "AI执行规划", status: "running", detail: "正在生成执行链路...", timestamp: now },
        ],
        ai_parsed_result: semanticHint ? {
          intent: semanticHint.primary_intent,
          summary: semanticHint.intent_reasoning || "",
          entities: [
            ...(semanticHint.people || []).map(p => "@" + p.name),
            ...(semanticHint.locations || []).map(l => "📍" + l.name),
            ...(semanticHint.tags || []),
          ],
          time_expression: semanticHint.time_entities?.[0]?.original_text || "",
          priority: semanticHint.priority || "medium",
        } : undefined,
      });
      queryClient.invalidateQueries({ queryKey: ['task-executions'] });
    } catch (e) {
      console.error("Failed to create execution record:", e);
    }

    // Generate AI execution plan with semantic hints
    let plan = null;
    try {
      plan = await generateExecutionPlan(userInput, semanticHint);
    } catch (e) {
      console.error("AI plan generation failed:", e);
    }

    if (plan && plan.execution_steps?.length > 0) {
      const mergedTaskData = {
        ...taskData,
        title: plan.task_data?.title || taskData.title,
        description: plan.task_data?.description || taskData.description || "",
        category: plan.task_data?.category || taskData.category || "personal",
        priority: plan.task_data?.priority || taskData.priority || "medium",
        reminder_time: plan.task_data?.reminder_time || taskData.reminder_time || getShanghaiNow().toISOString(),
        end_time: plan.task_data?.end_time || null,
        is_all_day: plan.task_data?.is_all_day || false,
        tags: plan.task_data?.tags || taskData.tags || [],
      };

      const planSteps = plan.execution_steps.map((s, i) => ({
        step_name: s.step_name,
        status: i === 0 ? "running" : "pending",
        detail: s.detail,
        timestamp: i === 0 ? now : null,
      }));

      if (execution) {
        await base44.entities.TaskExecution.update(execution.id, {
          category: plan.category || "task",
          execution_status: "executing",
          ai_parsed_result: {
            intent: plan.intent_summary,
            summary: plan.intent_summary,
            entities: mergedTaskData.tags,
            priority: mergedTaskData.priority,
          },
          execution_steps: planSteps,
        });
        queryClient.invalidateQueries({ queryKey: ['task-executions'] });
      }

      let taskId = null;
      const confirmsNeeded = [];
      const completedSteps = [];

      for (let i = 0; i < plan.execution_steps.length; i++) {
        const step = plan.execution_steps[i];

        if (step.action_type === "confirm") {
          confirmsNeeded.push(step);
          completedSteps.push({
            step_name: step.step_name,
            status: "pending",
            detail: "⏸ 待确认: " + step.detail,
            timestamp: null,
          });
          continue;
        }

        try {
          const result = await executeStep(step, taskId, mergedTaskData, execution);
          if (result.taskId) taskId = result.taskId;
          completedSteps.push({
            step_name: step.step_name,
            status: result.success ? "completed" : "failed",
            detail: result.detail,
            timestamp: new Date().toISOString(),
          });
        } catch (err) {
          completedSteps.push({
            step_name: step.step_name,
            status: "failed",
            detail: err.message || "执行失败",
            timestamp: new Date().toISOString(),
          });
        }

        if (execution) {
          await base44.entities.TaskExecution.update(execution.id, {
            task_id: taskId || "",
            execution_steps: completedSteps,
          });
          queryClient.invalidateQueries({ queryKey: ['task-executions'] });
        }
      }

      // 🆕 把 AI 规划的"情境感知事项链路"作为子约定挂到父约定下
      // 每一条子约定 = 一个 execution_step，备注情境时间(when_hint) 与「自动执行」来源
      if (taskId && Array.isArray(plan.execution_steps) && plan.execution_steps.length > 0) {
        try {
          const childPayloads = plan.execution_steps
            .filter(s => s && s.step_name && s.action_type !== "confirm")
            .map(s => {
              const parts = [];
              if (s.detail) parts.push(s.detail);
              if (s.when_hint) parts.push(`⏱ 情境时间：${s.when_hint}`);
              parts.push("⚙️ 自动执行：由哨兵 AI 规划");
              return {
                title: s.step_name,
                description: parts.join("\n"),
                parent_task_id: taskId,
                category: mergedTaskData.category || "personal",
                priority: mergedTaskData.priority || "medium",
                status: "pending",
                tags: ["AI自动执行"],
              };
            });
          if (childPayloads.length > 0) {
            await base44.entities.Task.bulkCreate(childPayloads);
            queryClient.invalidateQueries({ queryKey: ['tasks'] });
          }
        } catch (e) {
          console.error("Failed to create child tasks from execution steps:", e);
        }
      }

      const hasFailures = completedSteps.some(s => s.status === "failed");
      const hasConfirms = confirmsNeeded.length > 0;

      let autoPlanned = false;
      if (execution) {
        await base44.entities.TaskExecution.update(execution.id, {
          task_id: taskId || "",
          execution_status: hasConfirms ? "waiting_confirm" : hasFailures ? "failed" : "completed",
          completed_at: !hasConfirms && !hasFailures ? new Date().toISOString() : null,
          execution_steps: completedSteps,
        });
        queryClient.invalidateQueries({ queryKey: ['task-executions'] });

        // 🤖 自动判定是否属于"自动执行"类型（邮件草稿/调研/办公文档/文件整理/总结心签/日历事件）
        // 是 → 写入 automation_type & automation_plan，由用户在 UI 点击触发 execute 阶段
        try {
          const planResp = await base44.functions.invoke('executeAutomation', {
            execution_id: execution.id,
            phase: "plan",
          });
          autoPlanned = !!planResp?.data?.success;
          if (autoPlanned) {
            queryClient.invalidateQueries({ queryKey: ['task-executions'] });
          }
        } catch (e) {
          console.warn("Automation plan probing failed (non-fatal):", e?.message);
        }
      }

      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['notes'] });

      if (hasConfirms) {
        toast(plan.intent_summary + " — " + confirmsNeeded.length + "项需要确认", { icon: "⚡" });
      } else if (hasFailures) {
        toast.error("部分步骤执行失败，请查看详情");
      } else {
        toast.success("执行完成: " + plan.intent_summary, { icon: "✅" });
      }

      if (plan.user_prompts?.length > 0) {
        plan.user_prompts.forEach(function(p) {
          toast.info(p, { duration: 6000 });
        });
      }

      // 记忆回响:约定(可能附带自动执行)
      setEcho({
        kind: autoPlanned ? 'auto' : 'task',
        title: mergedTaskData.title,
        time: mergedTaskData.reminder_time ? fmtDayTime(mergedTaskData.reminder_time) : null,
      });
    } else {
      // Fallback: simple task creation
      try {
        const newTask = await base44.entities.Task.create({
          title: userInput,
          description: taskData.description || "",
          category: taskData.category || "personal",
          priority: taskData.priority || "medium",
          status: "pending",
          reminder_time: taskData.reminder_time || now,
          tags: taskData.tags || [],
        });

        if (execution) {
          await base44.entities.TaskExecution.update(execution.id, {
            task_id: newTask.id,
            execution_status: "completed",
            completed_at: new Date().toISOString(),
            execution_steps: [
              { step_name: "创建任务", status: "completed", detail: "已创建: " + userInput.slice(0, 40), timestamp: new Date().toISOString() },
            ],
          });
        }

        queryClient.invalidateQueries({ queryKey: ['tasks'] });
        queryClient.invalidateQueries({ queryKey: ['task-executions'] });
        toast.success("任务已创建");
        setEcho({
          kind: 'task',
          title: userInput,
          time: taskData.reminder_time ? fmtDayTime(taskData.reminder_time) : null,
        });
      } catch (error) {
        console.error("Task creation failed:", error);
        if (execution) {
          await base44.entities.TaskExecution.update(execution.id, {
            execution_status: "failed",
            error_message: error.message || "创建失败",
          });
          queryClient.invalidateQueries({ queryKey: ['task-executions'] });
        }
        toast.error("创建失败，请重试");
      }
    }

    setInputValue("");
    setSemanticAnalysis(null);
  };

  // —— 提交:先听懂,再决定收进哪个模块 ——
  const handleSubmit = async () => {
    const text = inputValue.trim();
    if (!text || submitting) return;

    setSubmitting(true);
    try {
      const semantic = await resolveSemanticNow();
      const isHeartSign = semantic?.primary_intent === 'note' || semantic?.primary_intent === 'wish';

      if (isHeartSign) {
        try {
          await createHeartSign(text, semantic);
          const flavor = noteFlavor(text, semantic?.primary_intent);
          setEcho({
            kind: 'note',
            title: semantic?.refined_title || text.slice(0, 24),
            flavor,
          });
          toast.success('已收进心签', { icon: '✦' });
          setInputValue("");
          setSemanticAnalysis(null);
        } catch (e) {
          console.error('Heart sign creation failed:', e);
          toast.error('收进心签失败，请重试');
        }
        return;
      }

      // 约定路径:沿用 AI 规划链路(详细说明 + 子约定 + 自动执行判定)
      let rawReminderTime = null;
      let tags = semantic?.tags || [];
      const highConfTime = semantic?.time_entities?.find(
        (t) => t.resolved_datetime && t.time_confidence !== 'low'
      );
      if (highConfTime?.resolved_datetime) rawReminderTime = highConfTime.resolved_datetime;
      (semantic?.people || []).forEach((p) => { if (p.name) tags.push('@' + p.name); });
      (semantic?.locations || []).forEach((l) => { if (l.name) tags.push('📍' + l.name); });

      await handleAddTask({
        title: semantic?.refined_title || text,
        description: semantic?.refined_description || '',
        category: semantic?.category || 'personal',
        priority: semantic?.priority || 'medium',
        status: 'pending',
        reminder_time: rawReminderTime,
        tags,
        _semantic: semantic,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleVoiceInput = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.info('当前浏览器不支持语音输入');
      return;
    }

    if (isListeningVoice) {
      recognitionRef.current?.stop();
      setIsListeningVoice(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'zh-CN';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognitionRef.current = recognition;

    recognition.onstart = () => setIsListeningVoice(true);
    recognition.onend = () => setIsListeningVoice(false);
    recognition.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      setInputValue((v) => (v ? v + transcript : transcript));
    };
    recognition.start();
  };

  const handlePaste = (e) => {
    const pasted = (e.clipboardData || window.clipboardData)?.getData("text") || "";
    if (looksLikeChatLog((inputValue + pasted).trim())) setShowChatRecognizer(true);
  };

  const echoReply = (() => {
    if (!echo) return '';
    if (echo.kind === 'note') return `「${echo.title}」—— 这句我替你收好了。心事放在这里，不会被弄丢。`;
    if (echo.kind === 'auto') return `差事已接下：「${echo.title}」。我会把它织成可以直接用的成果。`;
    return `「${echo.title}」已收进今日印记${echo.time ? `，${echo.time}` : ''}，到点我会轻轻唤你。`;
  })();

  return (
    <div className="mx-auto mt-8 w-full max-w-[680px]">
      {showChatRecognizer && inputValue.trim() && (
        <div className="px-1 mb-2">
          <ChatPasteRecognizer
            text={inputValue}
            onDone={() => { setInputValue(""); setShowChatRecognizer(false); }}
            onDismiss={() => setShowChatRecognizer(false)}
          />
        </div>
      )}

      <p className="mb-3 text-center font-[var(--font-serif)] text-[17px] text-[var(--sky-ink)]">
        告诉我，<span className="text-[var(--signal)]">任何事情</span>
      </p>

      {/* 心栈之门 */}
      <div className={`gate-vessel rounded-2xl ${focused ? 'is-listening' : 'is-quiet'}`}>
        <textarea
          value={inputValue}
          rows={2}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(e) => setInputValue(e.target.value)}
          onPaste={handlePaste}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
          placeholder="约定、心事、一闪而过的念头……说给我听，就是交给记忆"
          className="w-full resize-none bg-transparent px-5 sm:px-6 pt-5 text-[15.5px] leading-relaxed text-[var(--sky-ink)] placeholder:text-[var(--sky-sub)]/70 focus:outline-none"
        />

        {/* 实时倾听预览:自动分类 + 产物预告 */}
        {preview && (
          <div className="parse-preview echo-born mx-4 sm:mx-5 mb-1 rounded-xl bg-[var(--sentinel)]/[0.06] px-4 py-2.5 text-[12px] text-[var(--ink-2)]">
            <div className="flex flex-wrap items-center gap-2">
              {preview.analyzing ? (
                <span className="flex items-center gap-1.5 text-[var(--ink-3)]">
                  <Loader2 className="w-3 h-3 animate-spin" /> 正在倾听…
                </span>
              ) : (
                <>
                  <span className="text-[var(--signal)]">◈</span>
                  <span>
                    我会把它收进 <b>{preview.kindLabel}</b>
                  </span>
                </>
              )}
              {preview.time && (
                <span className="num rounded-full bg-white/70 px-2.5 py-0.5">
                  {preview.time}，我记得
                </span>
              )}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-[var(--hairline)] pt-2">
              <span className="text-[var(--ink-3)]">将为你生成</span>
              {preview.artifacts.map((a) => (
                <span
                  key={a}
                  className={`rounded-full px-2.5 py-0.5 font-medium ${
                    a === '约定'
                      ? 'bg-[var(--signal-soft)] text-[var(--signal)]'
                      : a === '心签'
                        ? 'bg-[var(--sentinel)]/[0.09] text-[var(--sentinel)]'
                        : 'bg-[var(--jade)]/10 text-[var(--jade)]'
                  }`}
                >
                  {a === '约定' ? '♪' : a === '心签' ? '✦' : '⚙'} {a}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 px-4 sm:px-5 pb-4 pt-1">
          <button
            type="button"
            onClick={handleVoiceInput}
            title={isListeningVoice ? '点击停止' : '语音输入'}
            className={`flex h-8 w-8 items-center justify-center rounded-full transition-all duration-200 ${
              isListeningVoice
                ? 'bg-red-100 text-red-500 animate-pulse'
                : 'text-[var(--sky-sub)] hover:text-[var(--sky-ink)] hover:bg-black/[0.04]'
            }`}
          >
            {isListeningVoice ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>
          <span className="text-[11.5px] tracking-wide text-[var(--sky-sub)]/80">
            我替你记住，并陪你慢慢读懂它
          </span>
          <button
            onClick={handleSubmit}
            disabled={!inputValue.trim() || submitting}
            className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-[var(--sentinel)] px-5 py-2 text-[13px] font-medium text-white transition-all duration-300 hover:bg-[var(--sentinel-deep)] disabled:opacity-35"
          >
            {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            说给心栈 →
          </button>
        </div>
      </div>

      {/* 示例引路 */}
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {SAMPLES.map((s) => (
          <button
            key={s}
            onClick={() => setInputValue(s)}
            className="sky-chip rounded-full border border-[var(--hairline)] bg-white/60 px-3.5 py-1.5 text-[12.5px] text-[var(--ink-2)] transition-all duration-300 hover:border-[var(--sentinel)]/50 hover:text-[var(--sentinel)]"
          >
            {s}
          </button>
        ))}
      </div>

      {/* 记忆回响:被听见、被记住的瞬间 */}
      {echo && (
        <div key={echo.title + echo.kind} className="echo-born hairline-card mt-6 rounded-2xl p-5">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--signal-soft)] text-[13px] text-[var(--signal)]">
              ✦
            </span>
            <div className="min-w-0">
              <p className="font-[var(--font-serif)] text-[14.5px] leading-relaxed text-[var(--ink)]">
                {echoReply}
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-[11.5px]">
                {echo.kind === 'note' ? (
                  <span className="rounded-md bg-[var(--sentinel)]/[0.09] px-2.5 py-1 font-medium text-[var(--sentinel)]">
                    已生成心签{echo.flavor ? ` · ${echo.flavor}` : ''}
                  </span>
                ) : (
                  <>
                    <span className="rounded-md bg-[var(--signal-soft)] px-2.5 py-1 font-medium text-[var(--signal)]">
                      已生成约定{echo.time ? ` · ${echo.time}` : ''}
                    </span>
                    {echo.kind === 'auto' && (
                      <span className="rounded-md bg-[var(--jade)]/10 px-2.5 py-1 font-medium text-[var(--jade)]">
                        已生成自动执行
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
