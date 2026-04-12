import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { format, parseISO, addDays } from "date-fns";
import { useAICreditGate } from "@/components/credits/useAICreditGate";
import InsufficientCreditsDialog from "@/components/credits/InsufficientCreditsDialog";
import { zhCN } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  Plus,
  ArrowRight,
  Loader2,
  Trash2,
  Edit2,
  Target,
  Mic,
  Type,
  Send,
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import AnalysisSteps from "./planner/AnalysisSteps";
import VoiceInput from "./planner/VoiceInput";
import DeviceStrategyMap from "./planner/DeviceStrategyMap";
import ContextTimeline from "./planner/ContextTimeline";
import AutoExecCards from "./planner/AutoExecCards";
import { extractAndCreateTasks } from "@/components/utils/extractAndCreateTasks";
import { syncPlanToNote } from "@/components/utils/syncPlanToNote";

const DEFAULT_STEPS = [
  { key: 'time_extraction', text: '提取时间实体…' },
  { key: 'intent', text: '识别意图与优先级…' },
  { key: 'spatial', text: '空间/路径计算…' },
  { key: 'device', text: '设备协同分发策略…' },
  { key: 'automation', text: '生成自动化任务…' },
];

export default function SmartDailyPlanner() {
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const [selectedDateStr, setSelectedDateStr] = useState(todayStr);
  const draftKey = `smart_daily_draft_${selectedDateStr}`;
  const [dayPlan, setDayPlan] = useState(null);
  const [existingPlanId, setExistingPlanId] = useState(null);
  const [userInput, setUserInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showInput, setShowInput] = useState(false);
  // AI analysis result (same structure as CalendarDayView)
  const [analysis, setAnalysis] = useState(null);
  const [resolvedDateHint, setResolvedDateHint] = useState(null);
  const [inputMode, setInputMode] = useState("text"); // "text" | "voice"
  const resultsRef = useRef(null);
  const { gate, showInsufficientDialog, insufficientProps, dismissDialog } = useAICreditGate();

  // Load daily plan from DB
  useEffect(() => {
    const loadPlan = async () => {
      setIsLoading(true);
      try {
        const plans = await base44.entities.DailyPlan.filter({ plan_date: selectedDateStr });
        if (plans && plans.length > 0) {
          const plan = plans[0];
          setExistingPlanId(plan.id);
          setDayPlan(plan);
          const draft = localStorage.getItem(draftKey);
          setUserInput(draft ?? "");
          setShowInput(false);
        } else {
          const draft = localStorage.getItem(draftKey);
          setUserInput(draft || "");
          setExistingPlanId(null);
          setDayPlan(null);
          setShowInput(true);
        }
        setAnalysis(null);
        setResolvedDateHint(null);
      } catch (err) {
        console.error("Failed to load daily plan", err);
      } finally {
        setIsLoading(false);
      }
    };
    loadPlan();
  }, [selectedDateStr, draftKey]);

  // Scroll to results
  useEffect(() => {
    if (analysis && resultsRef.current) {
      resultsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [analysis]);

  // Use analyzeIntent (same as CalendarDayView)
  const handleAnalyze = async () => {
    if (!userInput.trim() || isProcessing) return;

    const allowed = await gate("schedule_optimize", "智能日程规划");
    if (!allowed) return;

    setIsProcessing(true);
    try {
      // Build existing plan context
      let existingPlan = null;
      if (analysis) {
        existingPlan = {
          timeline: analysis.timeline || [],
          devices: analysis.devices || [],
          automations: analysis.automations || [],
        };
      } else if (dayPlan?.plan_json) {
        const dp = dayPlan.plan_json;
        existingPlan = {
          timeline: (dp.focus_blocks || []).map(b => ({ time: b.time, title: b.title, description: b.description, type: b.type || 'focus', date: selectedDateStr })),
          devices: [],
          automations: (dp.key_tasks || []).map(t => ({ title: t.title, desc: t.description || '', status: t.status === 'completed' ? 'active' : 'ready' })),
        };
      }

      const { data } = await base44.functions.invoke('analyzeIntent', { input: userInput, date: selectedDateStr, existingPlan });
      const targetDate = data.resolved_date || selectedDateStr;

      if (targetDate === selectedDateStr) {
        setAnalysis(data);
        setResolvedDateHint(null);

        // Save to DailyPlan
        const planRecord = {
          plan_date: selectedDateStr,
          original_input: [dayPlan?.original_input, userInput].filter(Boolean).join('\n'),
          theme: data.parsed?.intents?.[0] || '',
          summary: '',
          plan_json: {
            key_tasks: [...(dayPlan?.plan_json?.key_tasks || []), ...(data.automations || []).map(a => ({ title: a.title, description: a.desc || '', status: 'pending', priority: 'medium', category: 'other' }))],
            focus_blocks: [...(dayPlan?.plan_json?.focus_blocks || []), ...(data.timeline || []).filter(t => !t.date || t.date === selectedDateStr).map(t => ({ time: t.time, title: t.title, description: t.description || '', type: t.type || 'focus' }))],
          },
          is_active: true,
        };

        if (existingPlanId) {
          await base44.entities.DailyPlan.update(existingPlanId, planRecord);
        } else {
          const newPlan = await base44.entities.DailyPlan.create(planRecord);
          setExistingPlanId(newPlan.id);
          setDayPlan(newPlan);
        }
        toast.success("规划已生成");

        // 同步到约定和心签
        extractAndCreateTasks(userInput, selectedDateStr).then(tasks => {
          if (tasks.length > 0) toast.success(`已同步 ${tasks.length} 个约定`);
        }).catch(e => console.error("Task sync failed", e));
        syncPlanToNote(userInput, "daily_plan", { date: selectedDateStr }).then(note => {
          if (note) toast.success("已同步到心签");
        }).catch(e => console.error("Note sync failed", e));
      } else {
        setAnalysis(null);
        setResolvedDateHint(targetDate);

        // Persist to target date's DailyPlan
        const targetPlanRecord = {
          plan_date: targetDate,
          original_input: userInput,
          theme: data.parsed?.intents?.[0] || '',
          summary: '',
          plan_json: {
            key_tasks: (data.automations || []).map(a => ({ title: a.title, description: a.desc || '', status: 'pending', priority: 'medium', category: 'other' })),
            focus_blocks: (data.timeline || []).filter(t => !t.date || t.date === targetDate).map(t => ({ time: t.time, title: t.title, description: t.description || '', type: t.type || 'focus' })),
          },
          is_active: true,
        };
        const targetPlans = await base44.entities.DailyPlan.filter({ plan_date: targetDate });
        if (targetPlans && targetPlans.length > 0) {
          const tp = targetPlans[0];
          targetPlanRecord.plan_json.key_tasks = [...(tp.plan_json?.key_tasks || []), ...targetPlanRecord.plan_json.key_tasks];
          targetPlanRecord.plan_json.focus_blocks = [...(tp.plan_json?.focus_blocks || []), ...targetPlanRecord.plan_json.focus_blocks];
          targetPlanRecord.original_input = [tp.original_input, userInput].filter(Boolean).join('\n');
          await base44.entities.DailyPlan.update(tp.id, targetPlanRecord);
        } else {
          await base44.entities.DailyPlan.create(targetPlanRecord);
        }
        toast.success(`已保存到 ${targetDate} 的规划`);

        // 同步到约定和心签
        extractAndCreateTasks(userInput, targetDate).then(tasks => {
          if (tasks.length > 0) toast.success(`已同步 ${tasks.length} 个约定`);
        }).catch(e => console.error("Task sync failed", e));
        syncPlanToNote(userInput, "daily_plan", { date: targetDate }).then(note => {
          if (note) toast.success("已同步到心签");
        }).catch(e => console.error("Note sync failed", e));
      }
      localStorage.removeItem(draftKey);
      setUserInput("");
      setShowInput(false);
    } catch (err) {
      console.error("Analysis failed", err);
      toast.error(err?.response?.data?.error || err?.message || '分析失败，请重试');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDelete = async () => {
    if (!existingPlanId) return;
    try {
      await base44.entities.DailyPlan.delete(existingPlanId);
      setExistingPlanId(null);
      setDayPlan(null);
      setAnalysis(null);
      setUserInput("");
      localStorage.removeItem(draftKey);
      toast.success("规划已清除");
    } catch (err) {
      toast.error("删除失败");
    }
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm animate-pulse">
        <div className="h-5 bg-slate-100 rounded w-1/3 mb-4" />
        <div className="h-20 bg-slate-50 rounded-2xl" />
      </div>
    );
  }

  return (
    <>
    <div className="bg-white rounded-[28px] border border-slate-100/80 shadow-[0_8px_28px_rgba(140,147,201,0.12)] overflow-hidden">
      {/* Header */}
      <div className="px-5 md:px-6 pt-5 pb-4 border-b border-slate-100/60">
        {/* Top row: Title + Actions */}
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#384877] to-[#5b6dae] flex items-center justify-center shadow-lg shadow-[#384877]/25 shrink-0">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-slate-900 text-[15px] leading-tight">智能日程规划</h3>
              <p className="text-xs text-slate-400 mt-0.5">AI 自动识别时间与意图</p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1 shrink-0">
            {dayPlan && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-xl text-slate-400 hover:text-[#384877] hover:bg-[#384877]/5"
                  onClick={() => setShowInput(true)}
                  title="追加内容"
                >
                  <Edit2 className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50"
                  onClick={handleDelete}
                  title="删除当日规划"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </>
            )}
            {!dayPlan && !showInput && (
              <Button
                size="sm"
                className="bg-[#384877] hover:bg-[#2d3a5f] text-white rounded-xl h-8 px-3.5 text-xs shadow-sm shadow-[#384877]/20"
                onClick={() => setShowInput(true)}
              >
                <Plus className="w-3.5 h-3.5 mr-1" /> 新建规划
              </Button>
            )}
          </div>
        </div>

        {/* Bottom row: Date nav + input badge */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Date switcher */}
          <div className="flex items-center bg-slate-50 rounded-xl border border-slate-200/60 overflow-hidden">
            <button
              onClick={() => setSelectedDateStr(format(addDays(parseISO(selectedDateStr), -1), "yyyy-MM-dd"))}
              className="h-8 w-8 flex items-center justify-center text-slate-400 hover:text-[#384877] hover:bg-slate-100 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="px-3 py-1.5 text-xs font-medium text-slate-700 min-w-[100px] text-center border-x border-slate-200/60 select-none">
              {format(parseISO(selectedDateStr), "M月d日 EEE", { locale: zhCN })}
              {selectedDateStr === todayStr && (
                <span className="ml-1.5 text-[10px] text-white bg-[#384877] px-1.5 py-0.5 rounded-md font-bold">今</span>
              )}
            </div>
            <button
              onClick={() => setSelectedDateStr(format(addDays(parseISO(selectedDateStr), 1), "yyyy-MM-dd"))}
              className="h-8 w-8 flex items-center justify-center text-slate-400 hover:text-[#384877] hover:bg-slate-100 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Input source badge */}
          {dayPlan?.original_input && (
            <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 bg-[#384877]/5 border border-[#384877]/10 rounded-xl max-w-[280px]" title={dayPlan.original_input}>
              <Target className="w-3 h-3 text-[#384877]/60 shrink-0" />
              <span className="text-[11px] text-[#384877]/70 truncate leading-tight">
                {dayPlan.original_input}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Input Area */}
      <AnimatePresence>
        {showInput && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-5 md:px-6 py-5 space-y-3">
              {/* Unified input card */}
              <div className="rounded-2xl border border-slate-200/80 bg-gradient-to-b from-white to-slate-50/40 shadow-sm overflow-hidden">
                {/* Mode tabs inside card top */}
                <div className="flex items-center border-b border-slate-100 px-1 pt-1">
                  <button
                    type="button"
                    onClick={() => setInputMode("text")}
                    className={cn(
                      "flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-all border-b-2 -mb-px",
                      inputMode === "text"
                        ? "border-[#384877] text-[#384877]"
                        : "border-transparent text-slate-400 hover:text-slate-600"
                    )}
                  >
                    <Type className="w-3.5 h-3.5" /> 文本
                  </button>
                  <button
                    type="button"
                    onClick={() => setInputMode("voice")}
                    className={cn(
                      "flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-all border-b-2 -mb-px",
                      inputMode === "voice"
                        ? "border-[#384877] text-[#384877]"
                        : "border-transparent text-slate-400 hover:text-slate-600"
                    )}
                  >
                    <Mic className="w-3.5 h-3.5" /> 语音
                  </button>
                  <div className="flex-1" />
                  {dayPlan && (
                    <button
                      type="button"
                      onClick={() => setShowInput(false)}
                      className="text-[11px] text-slate-400 hover:text-slate-600 px-3 py-2 transition-colors"
                    >
                      取消
                    </button>
                  )}
                </div>

                {/* Text input body */}
                {inputMode === "text" && (
                  <div className="p-3">
                    <Textarea
                      value={userInput}
                      onChange={(e) => { const v = e.target.value; setUserInput(v); localStorage.setItem(draftKey, v); }}
                      placeholder={`输入安排，AI 会自动识别日期和意图…`}
                      className="min-h-[76px] border-none shadow-none focus-visible:ring-0 resize-none bg-transparent text-sm placeholder:text-slate-350"
                      autoFocus
                      onKeyDown={(e) => {
                        const composing = e.nativeEvent && e.nativeEvent.isComposing;
                        if (!composing && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAnalyze(); }
                      }}
                    />
                    {/* Bottom bar */}
                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100/80 mt-1">
                      <div className="flex gap-1.5 flex-wrap overflow-hidden">
                        {['📞 打电话','📊 报告DDL','✈️ 航班'].map((s, i) => {
                          const texts = ['今晚8点给妈妈打电话，聊聊最近身体情况','下周二前完成Q4报告，每天下午提醒我进度','明天早上7点飞深圳，提前一晚提醒收拾行李'];
                          return (
                            <button
                              key={i}
                              type="button"
                              onClick={() => setUserInput(texts[i])}
                              className="px-2.5 py-1 rounded-lg text-[11px] bg-slate-50 border border-slate-150 text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors whitespace-nowrap"
                            >
                              {s}
                            </button>
                          );
                        })}
                      </div>
                      <Button
                        onClick={handleAnalyze}
                        disabled={isProcessing || !userInput.trim()}
                        className={cn(
                          "rounded-xl h-8 px-5 text-xs font-medium shadow-sm transition-all shrink-0",
                          userInput.trim()
                            ? "bg-[#384877] hover:bg-[#2d3a5f] text-white shadow-[#384877]/20"
                            : "bg-slate-100 text-slate-400 shadow-none"
                        )}
                      >
                        {isProcessing ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />分析中</> : <><Send className="w-3 h-3 mr-1" />发送</>}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Voice input body */}
                {inputMode === "voice" && (
                  <div className="p-5">
                    <VoiceInput
                      disabled={isProcessing}
                      onResult={(text) => {
                        setUserInput((prev) => prev ? prev + "\n" + text : text);
                        setInputMode("text");
                      }}
                    />
                    {userInput && (
                      <div className="mt-4 pt-3 border-t border-slate-100">
                        <p className="text-[11px] text-slate-400 mb-1">已识别内容</p>
                        <p className="text-sm text-slate-700 leading-relaxed">{userInput}</p>
                        <Button
                          onClick={handleAnalyze}
                          disabled={isProcessing || !userInput.trim()}
                          className="mt-3 bg-[#384877] hover:bg-[#2d3a5f] text-white rounded-xl h-8 px-5 text-xs shadow-sm shadow-[#384877]/20"
                        >
                          {isProcessing ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />分析中</> : <><Sparkles className="w-3 h-3 mr-1" />发送分析</>}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Date navigation hint */}
              {resolvedDateHint && resolvedDateHint !== selectedDateStr && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800"
                >
                  <CalendarIcon className="w-4 h-4 shrink-0" />
                  <span className="text-sm flex-1">
                    AI 识别到该安排属于 <strong>{resolvedDateHint}</strong>，已自动保存
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-amber-300 text-amber-700 hover:bg-amber-100 rounded-xl h-8 text-xs gap-1.5 shrink-0"
                    onClick={() => {
                      setSelectedDateStr(resolvedDateHint);
                      setResolvedDateHint(null);
                    }}
                  >
                    跳转查看 <ArrowRight className="w-3.5 h-3.5" />
                  </Button>
                </motion.div>
              )}

              {isProcessing && <AnalysisSteps steps={DEFAULT_STEPS} running={true} />}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Results from AI analysis */}
      <div ref={resultsRef} className="px-6 pb-6 space-y-5">
        {/* Context Timeline (from analysis) - only current date entries */}
        {analysis?.timeline?.length > 0 && (() => {
          const dayBlocks = analysis.timeline.filter(t => !t.date || t.date === selectedDateStr);
          return dayBlocks.length > 0 ? (
            <ContextTimeline blocks={dayBlocks.map(t => ({ time: t.time, title: t.title, description: t.description, type: t.type || 'focus' }))} />
          ) : null;
        })()}

        {/* Auto Exec Cards (from analysis) */}
        {analysis?.automations?.length > 0 && (
          <AutoExecCards
            tasks={analysis.automations.map(a => ({ title: a.title, desc: a.desc, status: a.status }))}
            userText={userInput}
          />
        )}

        {/* Device Strategy Map (from analysis) - at the bottom */}
        {analysis?.devices?.length > 0 && (
          <DeviceStrategyMap devices={analysis.devices} />
        )}

        {/* Fallback: show saved dayPlan data when no fresh analysis */}
        {!analysis && dayPlan && (
          <div className="space-y-5">
            {/* Saved timeline */}
            {dayPlan.plan_json?.focus_blocks?.length > 0 && (
              <ContextTimeline blocks={dayPlan.plan_json.focus_blocks} />
            )}

            {/* Saved tasks */}
            {dayPlan.plan_json?.key_tasks?.length > 0 && (
              <AutoExecCards tasks={dayPlan.plan_json.key_tasks.map(t => ({ title: t.title, desc: t.description || '', status: t.status === 'completed' ? 'active' : 'ready' }))} />
            )}

            {/* Append CTA */}
            {!showInput && (
              <button
                onClick={() => setShowInput(true)}
                className="w-full flex items-center justify-center gap-2 py-2.5 text-xs text-slate-400 hover:text-[#384877] border border-dashed border-slate-200 rounded-xl hover:border-[#384877]/30 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> 追加新内容到规划
              </button>
            )}
          </div>
        )}

        {/* Empty state */}
        {!analysis && !dayPlan && !showInput && (
          <div className="p-8 text-center">
            <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <Target className="w-7 h-7 text-slate-300" />
            </div>
            <p className="text-slate-400 text-sm mb-4">还没有当日规划，输入你的安排开始</p>
            <Button
              size="sm"
              className="bg-[#384877] hover:bg-[#2d3a5f] text-white rounded-xl"
              onClick={() => setShowInput(true)}
            >
              <Sparkles className="w-3.5 h-3.5 mr-2" /> 开始规划
            </Button>
          </div>
        )}
      </div>
    </div>
    <InsufficientCreditsDialog
      open={showInsufficientDialog}
      onOpenChange={dismissDialog}
      {...insufficientProps}
    />
    </>
  );
}