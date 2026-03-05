import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { format, parseISO, addDays } from "date-fns";
import { zhCN } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  Plus,
  ArrowRight,
  Loader2,
  Trash2,
  Edit2,
  Clock,
  Zap,
  CheckCircle2,
  Target,
  Coffee,
  Moon,
  Mic,
  Image as ImageIcon,
  Send,
  Smartphone,
  Watch,
  Monitor,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { extractAndCreateTasks } from "@/components/utils/extractAndCreateTasks";
import { cn } from "@/lib/utils";

const TYPE_STYLES = {
  focus: "bg-blue-50 text-blue-700 border-blue-200",
  meeting: "bg-amber-50 text-amber-700 border-amber-200",
  personal: "bg-purple-50 text-purple-700 border-purple-200",
  rest: "bg-green-50 text-green-700 border-green-200",
};

const TYPE_LABELS = {
  focus: "专注",
  meeting: "会议",
  personal: "个人",
  rest: "休息",
};

const PRIORITY_DOT = {
  high: "bg-red-500",
  medium: "bg-amber-400",
  low: "bg-slate-300",
};

const SLOT_ICONS = {
  morning: <Coffee className="w-3.5 h-3.5" />,
  afternoon: <Zap className="w-3.5 h-3.5" />,
  evening: <Moon className="w-3.5 h-3.5" />,
};

export default function SmartDailyPlanner() {
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const [selectedDateStr, setSelectedDateStr] = useState(todayStr);
  const draftKey = `smart_daily_draft_${selectedDateStr}`; // 每日独立草稿键
  const [planData, setPlanData] = useState(null);
  const [existingPlanId, setExistingPlanId] = useState(null);
  const [userInput, setUserInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showInput, setShowInput] = useState(false);
  const [executed, setExecuted] = useState({});

  // Load today's plan from DB on mount
  useEffect(() => {
    const loadTodayPlan = async () => {
      try {
        const plans = await base44.entities.DailyPlan.filter({ plan_date: selectedDateStr });
        if (plans && plans.length > 0) {
          const plan = plans[0];
          setExistingPlanId(plan.id);
          setPlanData({ ...plan.plan_json, theme: plan.theme, summary: plan.summary, original_input: plan.original_input });
          const draft = localStorage.getItem(draftKey);
          setUserInput(draft ?? (plan.original_input || ""));
          setShowInput(true); // 加载到已有计划时，默认展示输入框（可手动收起）
        } else {
          const draft = localStorage.getItem(draftKey);
          setUserInput(draft || "");
          setExistingPlanId(null);
          setPlanData(null);
          // 无计划时直接展示图2模式的英雄输入区
          setShowInput(true);
        }
      } catch (err) {
        console.error("Failed to load daily plan", err);
      } finally {
        setIsLoading(false);
      }
    };
    loadTodayPlan();
  }, [selectedDateStr, draftKey]); // 根据所选日期与草稿键重新加载

  // 当规划数据变化时重置本地执行清单勾选状态（必须在任何 early return 之前）
  useEffect(() => {
    setExecuted({});
  }, [existingPlanId, planData?.theme, planData?.summary]);

  const handleGenerate = async () => {
    if (!userInput.trim()) return;
    setIsProcessing(true);
    try {
      // 累积 original_input
      const prevOriginal = planData?.original_input || "";
      const originalInputToSave = existingPlanId ? [prevOriginal, userInput].filter(Boolean).join("\n") : userInput;

      const { data } = await base44.functions.invoke("generateDailyPlan", {
        input: userInput,
        planDate: selectedDateStr,
        existingPlan: planData || null,
      });

      if (data) {
        // 更新 planData，包含累积的 original_input
        setPlanData({ ...data, original_input: originalInputToSave });

        // Extract & create tasks from the user input
        extractAndCreateTasks(userInput, selectedDateStr).then(tasks => {
          if (tasks.length > 0) {
            toast.success(`已自动添加 ${tasks.length} 个约定到列表`);
          }
        }).catch(e => console.error("Task extraction failed", e));

        const planRecord = {
          plan_date: selectedDateStr,
          original_input: originalInputToSave, // 保存累积后的 original_input
          theme: data.theme,
          summary: data.summary,
          plan_json: data,
          is_active: true,
        };

        if (existingPlanId) {
          await base44.entities.DailyPlan.update(existingPlanId, planRecord);
          toast.success("今日规划已智能更新");
        } else {
          const newPlan = await base44.entities.DailyPlan.create(planRecord);
          setExistingPlanId(newPlan.id);
          toast.success("今日规划已生成");
        }
        localStorage.removeItem(draftKey); // 生成或更新成功后清除草稿
        setShowInput(false);
      }
    } catch (err) {
      console.error("Daily plan generation failed", err);
      toast.error("规划生成失败，请重试");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDelete = async () => {
    if (!existingPlanId) return;
    try {
      await base44.entities.DailyPlan.delete(existingPlanId);
      setExistingPlanId(null);
      setPlanData(null);
      setUserInput("");
      localStorage.removeItem(draftKey); // 删除计划时清除草稿
      toast.success("今日规划已清除");
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
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-5 pb-4 flex items-center justify-between border-b border-slate-50">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-[#384877] to-[#3b5aa2] flex items-center justify-center shadow-md shadow-[#384877]/20">
            <Target className="w-4.5 h-4.5 text-white" />
          </div>
          <div>
            <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
              今日智能规划
              {planData?.original_input && (
                <Badge
                  variant="outline"
                  className="hidden md:inline-flex max-w-[240px] truncate text-[11px] font-normal"
                  title={planData.original_input}
                >
                  基于输入：{planData.original_input}
                </Badge>
              )}
            </h3>
            <p className="text-xs text-slate-400">{format(parseISO(selectedDateStr), "M月d日 EEEE", { locale: zhCN })}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* 日期切换 */}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-xl text-slate-500 hover:text-[#384877]"
            onClick={() => setSelectedDateStr(format(addDays(parseISO(selectedDateStr), -1), "yyyy-MM-dd"))}
            title="前一天"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="px-2 py-1 rounded-lg bg-slate-50 text-slate-600 text-xs border border-slate-200/70 min-w-[108px] text-center">
            {format(parseISO(selectedDateStr), "M月d日 EEEE", { locale: zhCN })}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-xl text-slate-500 hover:text-[#384877]"
            onClick={() => setSelectedDateStr(format(addDays(parseISO(selectedDateStr), 1), "yyyy-MM-dd"))}
            title="后一天"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>

          {/* 计划操作 */}
          {planData && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-xl text-slate-400 hover:text-[#384877]"
                onClick={() => setShowInput(true)}
                title="追加内容"
              >
                <Edit2 className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-xl text-slate-400 hover:text-red-500"
                onClick={handleDelete}
                title="删除当日规划"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </>
          )}
          {!planData && !showInput && (
            <Button
              size="sm"
              className="bg-[#384877] hover:bg-[#2d3a5f] text-white rounded-xl h-8 px-3 text-xs"
              onClick={() => setShowInput(true)}
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> 创建当日规划
            </Button>
          )}
        </div>
      </div>

      {/* Hero-style Input Area (图2模式) */}
      <AnimatePresence>
        {showInput && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-6 py-10 bg-gradient-to-b from-[#f1f5ff] via-white to-white rounded-3xl border border-slate-100/70 shadow-[0_10px_40px_rgba(56,72,119,0.06)]">
              <div className="max-w-3xl mx-auto">
                <div className="mb-4">
                  <h2 className="text-4xl md:text-5xl font-extrabold text-[#384877] tracking-tight leading-tight">告诉我，任何事情</h2>
                  <p className="mt-3 text-slate-600">像与朋友倾诉般自然。我会倾听、理解，在所有设备上为你悄然安排妥当。</p>
                </div>

                <div className="bg-white rounded-[20px] border border-slate-200/70 p-4 md:p-5 shadow-[0_8px_30px_rgba(56,72,119,0.06)]">
                  <Textarea
                    value={userInput}
                    onChange={(e) => { const v = e.target.value; setUserInput(v); localStorage.setItem(draftKey, v); }}
                    placeholder={planData ? "明天下午三点和林总在望京SOHO见面，帮我提前准备好项目资料..." : "明天下午三点和林总在望京SOHO见面，帮我提前准备好项目资料..."}
                    className="bg-white border-slate-200 rounded-2xl resize-none text-[15px] min-h-[140px] px-4 py-3 placeholder:text-slate-400 focus-visible:ring-[#384877]/20 focus-visible:border-[#384877]"
                    rows={5}
                    autoFocus
                    onKeyDown={(e) => {
                      const composing = e.nativeEvent && e.nativeEvent.isComposing;
                      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                        e.preventDefault();
                        if (userInput.trim() && !isProcessing && !composing) handleGenerate();
                        return;
                      }
                      if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
                        if (composing) return; // 中文输入法组合键时不提交
                        e.preventDefault();
                        if (userInput.trim() && !isProcessing) handleGenerate();
                      }
                    }}
                  />

                  <div className="mt-4 flex items-end justify-between">
                    <div className="flex items-center gap-2 text-slate-500">
                      <button type="button" className="h-9 w-9 rounded-full hover:bg-slate-100 flex items-center justify-center" title="语音输入（占位）">
                        <Mic className="w-4 h-4" />
                      </button>
                      <button type="button" className="h-9 w-9 rounded-full hover:bg-slate-100 flex items-center justify-center" title="添加图片（占位）">
                        <ImageIcon className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        onClick={handleGenerate}
                        disabled={!userInput.trim() || isProcessing}
                        title="⌘/Ctrl + Enter 发送"
                        aria-label="发送"
                        className="bg-[#384877] hover:bg-[#2d3a5f] text-white rounded-full h-11 px-6 text-sm shadow-md shadow-[#384877]/20"
                      >
                        {isProcessing ? (
                          <><Loader2 className="w-4 h-4 mr-2 animate-spin" />发送中...</>
                        ) : (
                          <><Send className="w-4 h-4 mr-2" />发送</>
                        )}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setShowInput(false)} className="text-slate-500 hover:text-slate-700 h-9 rounded-xl">取消</Button>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {['今晚8点给妈妈打电话','下周二完成Q4报告','明早7点飞深圳'].map((s) => (
                    <button key={s} type="button" onClick={() => setUserInput(s)} className="px-3 py-1.5 rounded-full bg-white text-slate-600 text-xs border border-slate-200/80 shadow-sm hover:bg-slate-50">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Plan Display */}
      {planData ? (
        <div className="p-6 space-y-5">
          {/* Theme & Summary */}
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="font-semibold text-slate-800 text-base">{planData.theme || "今日规划"}</span>
                {planData.stats?.energy_level && (
                  <Badge variant="outline" className={cn(
                    "text-[10px] h-5 px-2 border",
                    planData.stats.energy_level === 'high' ? "bg-green-50 text-green-700 border-green-200" :
                    planData.stats.energy_level === 'medium' ? "bg-amber-50 text-amber-700 border-amber-200" :
                    "bg-slate-50 text-slate-600 border-slate-200"
                  )}>
                    {planData.stats.energy_level === 'high' ? '💪 高能量' : planData.stats.energy_level === 'medium' ? '⚡ 正常' : '🌙 轻松'}
                  </Badge>
                )}
              </div>
              <p className="text-sm text-slate-500 leading-relaxed">{planData.summary}</p>
            </div>
          </div>

          {/* Stats Row */}
          {planData.stats && (
            <div className="flex items-center gap-4 text-xs text-slate-500">
              {planData.stats.focus_hours > 0 && (
                <div className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-blue-500" />
                  <span>{planData.stats.focus_hours}h 专注</span>
                </div>
              )}
              {planData.stats.tasks_count > 0 && (
                <div className="flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  <span>{planData.stats.tasks_count} 项任务</span>
                </div>
              )}
            </div>
          )}

          {/* 已为你安排 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* 全设备智能协同 */}
            <div className="p-4 rounded-2xl border border-slate-100 bg-slate-50/50">
              <p className="text-xs font-bold text-slate-500 mb-2">已为你安排 · 全设备智能协同</p>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-[#384877]/10 text-[#384877] flex items-center justify-center"><Smartphone className="w-4 h-4" /></div>
                  <div className="text-sm text-slate-600">
                    手机：日程与提醒已同步（{(planData.key_tasks?.length||0)+(planData.focus_blocks?.length||0)} 项）
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-[#384877]/10 text-[#384877] flex items-center justify-center"><Watch className="w-4 h-4" /></div>
                  <div className="text-sm text-slate-600">手表：短提醒与站立提示已安排</div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-[#384877]/10 text-[#384877] flex items-center justify-center"><Monitor className="w-4 h-4" /></div>
                  <div className="text-sm text-slate-600">电脑：{planData.focus_blocks?.length||0} 段专注时段已设置免打扰</div>
                </div>
              </div>
            </div>

            {/* 情境感知时间线 */}
            <div className="p-4 rounded-2xl border border-slate-100 bg-slate-50/50">
              <p className="text-xs font-bold text-slate-500 mb-2">已为你安排 · 情境感知时间线</p>
              <div className="space-y-2">
                {(planData.focus_blocks||[])
                  .slice()
                  .sort((a,b)=> (a.time||'').localeCompare(b.time||''))
                  .slice(0,5)
                  .map((b, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span className="px-2 py-0.5 rounded-lg bg-white border border-slate-200 text-slate-600 font-mono text-xs">{b.time}</span>
                      <span className="text-slate-700 truncate">{b.title}</span>
                    </div>
                  ))}
                {(planData.focus_blocks?.length||0) === 0 && (
                  <div className="text-xs text-slate-400">等待你的输入生成时间线…</div>
                )}
              </div>
            </div>

            {/* 自动执行清单 */}
            <div className="p-4 rounded-2xl border border-slate-100 bg-slate-50/50">
              <p className="text-xs font-bold text-slate-500 mb-2">已为你安排 · 自动执行清单</p>
              <div className="space-y-2">
                {(planData.key_tasks||[]).slice(0,6).map((t, idx) => (
                  <label key={idx} className="flex items-start gap-2 text-sm text-slate-700">
                    <Checkbox checked={!!executed[idx]} onCheckedChange={(v)=> setExecuted(prev=>({...prev,[idx]: !!v}))} className="mt-0.5" />
                    <span className="flex-1">
                      {t.title}
                      {t.estimated_minutes ? <span className="text-xs text-slate-400 ml-1">· {t.estimated_minutes}min</span> : null}
                    </span>
                  </label>
                ))}
                {(planData.key_tasks?.length||0) === 0 && (
                  <div className="text-xs text-slate-400">无关键任务，发送输入后将自动生成清单</div>
                )}
              </div>
            </div>
          </div>

          {/* Focus Blocks */}
          {planData.focus_blocks && planData.focus_blocks.length > 0 && (
            <div>
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2.5">⏰ 时间规划</h4>
              <div className="space-y-2">
                {planData.focus_blocks.map((block, idx) => (
                  <div key={idx} className={cn(
                    "flex items-center gap-3 p-3 rounded-xl border text-sm",
                    TYPE_STYLES[block.type] || TYPE_STYLES.focus
                  )}>
                    <span className="font-mono text-xs font-bold shrink-0 opacity-70">{block.time}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold truncate">{block.title}</div>
                      {block.description && (
                        <div className="text-xs opacity-70 mt-0.5 truncate">{block.description}</div>
                      )}
                    </div>
                    <Badge variant="outline" className={cn("text-[10px] h-5 px-1.5 shrink-0 border", TYPE_STYLES[block.type])}>
                      {TYPE_LABELS[block.type] || block.type}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Key Tasks */}
          {planData.key_tasks && planData.key_tasks.length > 0 && (
            <div>
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2.5">✅ 关键任务</h4>
              <div className="grid grid-cols-1 gap-2">
                {planData.key_tasks.map((task, idx) => (
                  <div key={idx} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <div className={cn("w-2 h-2 rounded-full shrink-0", PRIORITY_DOT[task.priority] || "bg-slate-300")} />
                    <span className="text-sm text-slate-700 flex-1 font-medium">{task.title}</span>
                    <div className="flex items-center gap-2 text-xs text-slate-400 shrink-0">
                      {SLOT_ICONS[task.time_slot]}
                      {task.estimated_minutes && <span>{task.estimated_minutes}min</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Evening Review */}
          {planData.evening_review && (
            <div className="flex items-start gap-3 p-3 bg-indigo-50/50 rounded-xl border border-indigo-100/80">
              <Moon className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-indigo-600 mb-0.5 uppercase tracking-wide">晚间复盘</p>
                <p className="text-xs text-indigo-700/80 leading-relaxed">{planData.evening_review}</p>
              </div>
            </div>
          )}

          {/* Append CTA */}
          {!showInput && (
            <button
              onClick={() => setShowInput(true)}
              className="w-full flex items-center justify-center gap-2 py-2.5 text-xs text-slate-400 hover:text-[#384877] border border-dashed border-slate-200 rounded-xl hover:border-[#384877]/30 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> 追加新内容到今日规划
            </button>
          )}
        </div>
      ) : !showInput ? (
        <div className="p-8 text-center">
          <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <Target className="w-7 h-7 text-slate-300" />
          </div>
          <p className="text-slate-400 text-sm mb-4">还没有今日规划，告诉 AI 你今天的安排</p>
          <Button
            size="sm"
            className="bg-[#384877] hover:bg-[#2d3a5f] text-white rounded-xl"
            onClick={() => setShowInput(true)}
          >
            <Sparkles className="w-3.5 h-3.5 mr-2" /> 开始规划今天
          </Button>
        </div>
      ) : null}
    </div>
  );
}