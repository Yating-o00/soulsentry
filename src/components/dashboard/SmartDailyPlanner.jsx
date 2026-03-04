import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { format, parseISO } from "date-fns";
import { zhCN } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Plus, ArrowRight, Loader2, Trash2, Edit2, Clock, Zap, CheckCircle2, Target, Coffee, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
  const draftKey = `smart_daily_draft_${todayStr}`; // 修复后的草稿键定义
  const [planData, setPlanData] = useState(null);
  const [existingPlanId, setExistingPlanId] = useState(null);
  const [userInput, setUserInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showInput, setShowInput] = useState(false);

  // Load today's plan from DB on mount
  useEffect(() => {
    const loadTodayPlan = async () => {
      try {
        const plans = await base44.entities.DailyPlan.filter({ plan_date: todayStr });
        if (plans && plans.length > 0) {
          const plan = plans[0];
          setExistingPlanId(plan.id);
          setPlanData({ ...plan.plan_json, theme: plan.theme, summary: plan.summary, original_input: plan.original_input });
          const draft = localStorage.getItem(draftKey);
          setUserInput(draft ?? (plan.original_input || ""));
          setShowInput(false); // 加载到已有计划时，隐藏输入框
        } else {
          const draft = localStorage.getItem(draftKey);
          setUserInput(draft || "");
          // 默认使用“图2”英雄输入卡片，顶部小输入区保持收起
          setShowInput(false);
        }
      } catch (err) {
        console.error("Failed to load daily plan", err);
      } finally {
        setIsLoading(false);
      }
    };
    loadTodayPlan();
  }, [todayStr, draftKey]); // draftKey 加入依赖，以确保其变化时重新加载

  const handleGenerate = async () => {
    if (!userInput.trim()) return;
    setIsProcessing(true);
    try {
      // 累积 original_input
      const prevOriginal = planData?.original_input || "";
      const originalInputToSave = existingPlanId ? [prevOriginal, userInput].filter(Boolean).join("\n") : userInput;

      const { data } = await base44.functions.invoke("generateDailyPlan", {
        input: userInput,
        planDate: todayStr,
        existingPlan: planData || null,
      });

      if (data) {
        // 更新 planData，包含累积的 original_input
        setPlanData({ ...data, original_input: originalInputToSave });

        // Extract & create tasks from the user input
        extractAndCreateTasks(userInput, todayStr).then(tasks => {
          if (tasks.length > 0) {
            toast.success(`已自动添加 ${tasks.length} 个约定到列表`);
          }
        }).catch(e => console.error("Task extraction failed", e));

        const planRecord = {
          plan_date: todayStr,
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
            <h3 className="font-bold text-slate-800 text-base">今日智能规划</h3>
            <p className="text-xs text-slate-400">{format(new Date(), "M月d日 EEEE", { locale: zhCN })}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {planData && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-xl text-slate-400 hover:text-[#384877]"
                onClick={() => setShowInput(true)}
              >
                <Edit2 className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-xl text-slate-400 hover:text-red-500"
                onClick={handleDelete}
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
              <Plus className="w-3.5 h-3.5 mr-1" /> 创建今日规划
            </Button>
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
            <div className="px-6 py-4 bg-slate-50/60 border-b border-slate-100">
              <Textarea
                value={userInput}
                onChange={(e) => { const v = e.target.value; setUserInput(v); localStorage.setItem(draftKey, v); }} // 文本框输入时保存到本地草稿
                placeholder={planData
                  ? "告诉我要追加什么内容，AI会智能融入现有规划..."
                  : "告诉我今天的安排，AI将为你生成完整规划..."}
                className="bg-white border-slate-200 rounded-2xl resize-none text-sm min-h-[90px] focus-visible:ring-[#384877]/20 focus-visible:border-[#384877]"
                rows={3}
                autoFocus
              />
              <div className="flex items-center gap-2 mt-3">
                <Button
                  onClick={handleGenerate}
                  disabled={!userInput.trim() || isProcessing}
                  className="bg-[#384877] hover:bg-[#2d3a5f] text-white rounded-xl h-9 px-4 text-sm"
                >
                  {isProcessing ? (
                    <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />生成中...</>
                  ) : (
                    <><Sparkles className="w-3.5 h-3.5 mr-2" />{planData ? "智能更新" : "生成规划"}</>
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowInput(false)}
                  className="text-slate-400 h-9 rounded-xl"
                >
                  取消
                </Button>
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
        <div className="px-6 py-8">
          <div className="max-w-3xl mx-auto">
            <div className="rounded-3xl bg-gradient-to-b from-white to-slate-50 border border-slate-100 p-6 md:p-10 shadow-sm">
              <div className="text-center mb-6 md:mb-8">
                <h2 className="text-2xl md:text-5xl font-extrabold leading-tight tracking-tight text-[#384877]">
                  告诉我，任何事情
                </h2>
                <p className="mt-3 text-sm md:text-base text-slate-500">
                  像与朋友倾诉般自然。我会倾听、理解，<br className="hidden md:block" />
                  在所有设备上为你悄然安排妥当。
                </p>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 p-3 md:p-4 shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
                <Textarea
                  value={userInput}
                  onChange={(e) => { const v = e.target.value; setUserInput(v); localStorage.setItem(draftKey, v); }}
                  placeholder="比如：今天下午三点在望京见林总，提前准备好项目资料…"
                  className="bg-white border-slate-200 rounded-2xl resize-none text-sm md:text-base min-h-[110px] focus-visible:ring-[#384877]/20 focus-visible:border-[#384877]"
                  rows={4}
                />
                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span className="hidden md:inline">可输入自然语言描述你的安排</span>
                  </div>
                  <Button
                    onClick={handleGenerate}
                    disabled={!userInput.trim() || isProcessing}
                    className="bg-[#384877] hover:bg-[#2d3a5f] text-white rounded-xl h-9 px-5 text-sm"
                  >
                    {isProcessing ? (<><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />发送并规划</>) : (<><Sparkles className="w-3.5 h-3.5 mr-2" />发送</>)}
                  </Button>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {[
                  "今晚8点给妈妈打电话",
                  "下周二完成Q4报告",
                  "明早7点飞深圳"
                ].map((tip) => (
                  <button
                    key={tip}
                    onClick={() => setUserInput(tip)}
                    className="px-3 py-1.5 text-xs md:text-sm rounded-full border border-slate-200 bg-white hover:bg-slate-50 text-slate-600"
                  >
                    {tip}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}