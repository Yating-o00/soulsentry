import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { format, addDays, startOfWeek, endOfWeek } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { 
  Mic, 
  Image as ImageIcon, 
  ChevronDown, 
  ArrowRight, 
  ChevronLeft, 
  ChevronRight,
  CheckCircle2,
  Calendar as CalendarIcon,
  Sparkles,
  Smartphone,
  Watch,
  Glasses,
  Car,
  Home as HomeIcon,
  Monitor,
  Zap,
  Plus,
  Loader2
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { base44 } from "@/api/base44Client";
import { useAICreditGate } from "@/components/credits/useAICreditGate";
import InsufficientCreditsDialog from "@/components/credits/InsufficientCreditsDialog";
import { extractAndCreateTasks } from "@/components/utils/extractAndCreateTasks";
import { syncPlanToNote } from "@/components/utils/syncPlanToNote";

// Device Configurations with icons mapping
const DEVICE_MAP = {
  phone: { name: '智能手机', icon: Smartphone, role: '主控终端' },
  watch: { name: '智能手表', icon: Watch, role: '触觉管家' },
  glasses: { name: '智能眼镜', icon: Glasses, role: 'AR秘书' },
  car: { name: '电动汽车', icon: Car, role: '移动办公室' },
  home: { name: '智能家居', icon: HomeIcon, role: '环境调节师' },
  pc: { name: '工作站', icon: Monitor, role: '深度工作舱' }
};

const QUICK_TEMPLATES = [
  { text: '下周一到周五深度工作模式，每天上午9-12点专注研发，下午处理会议，周三下午需要去医院体检，周五晚上团队聚餐', label: '🎯 深度工作周' },
  { text: '下周三飞上海参加Chinajoy，周四见投资人，周五回京，帮我安排好行程和资料准备', label: '✈️ 商务差旅' },
  { text: '下周是产品发布周，周一准备发布会，周三正式发布，周四用户反馈收集，全周保持高强度响应', label: '🚀 产品发布周' },
  { text: '下周想调整作息，每天早上6点起床跑步，晚上11点前睡觉，工作日专注工作，周末完全放松', label: '🌱 生活调整周' }
];

const PROCESSING_STEPS = [
  { icon: '📅', text: '解析时间跨度与核心意图...' },
  { icon: '🎯', text: '提取关键事件与场景...' },
  { icon: '🗺️', text: '规划全设备协同策略...' },
  { icon: '⚡', text: '生成自动化执行链路...' },
  { icon: '✨', text: '最终编织周情境网络...' }
];

export default function SoulWeekPlanner({ currentDate: initialDate }) {
  const [stage, setStage] = useState('input'); // input, processing, results
  const [userInput, setUserInput] = useState('');
  const [currentWeekDate, setCurrentWeekDate] = useState(initialDate || new Date());
  const [processingStepIndex, setProcessingStepIndex] = useState(0);
  const [weekData, setWeekData] = useState(null);
  const [selectedDevice, setSelectedDevice] = useState('phone');
  const [expandedDays, setExpandedDays] = useState({});
  const [showQuickTemplates, setShowQuickTemplates] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [existingPlanId, setExistingPlanId] = useState(null);
  const [appendInput, setAppendInput] = useState('');
  const [isAppending, setIsAppending] = useState(false);
  const [showAppendInput, setShowAppendInput] = useState(false);
  const { gate, showInsufficientDialog, insufficientProps, dismissDialog } = useAICreditGate();

  // Sync internal state with prop changes (e.g. when user navigates in the parent Dashboard)
  useEffect(() => {
    if (initialDate) {
      setCurrentWeekDate(initialDate);
    }
  }, [initialDate]);

  const resultsRef = useRef(null);

  const start = startOfWeek(currentWeekDate, { locale: zhCN, weekStartsOn: 1 });
  const end = endOfWeek(currentWeekDate, { locale: zhCN, weekStartsOn: 1 });
  const currentWeekStartStr = format(start, 'yyyy-MM-dd');
  const weekRangeLabel = `${format(start, 'M月d日')} - ${format(end, 'M月d日')}`;

  const queryClient = useQueryClient();

  // Load existing plan from DB with react-query caching
  const { data: weekPlans } = useQuery({
    queryKey: ['weeklyPlan', currentWeekStartStr],
    queryFn: () => base44.entities.WeeklyPlan.filter({ week_start_date: currentWeekStartStr }),
    staleTime: 2 * 60 * 1000,
  });

  useEffect(() => {
    if (weekPlans === undefined) return; // still loading
    if (weekPlans && weekPlans.length > 0) {
      const plan = weekPlans[0];
      setExistingPlanId(plan.id);
      setWeekData({
        ...plan.plan_json,
        theme: plan.theme,
        summary: plan.summary
      });
      setUserInput(plan.original_input || '');
      setStage('results');
    } else {
      setExistingPlanId(null);
      setWeekData(null);
      setUserInput('');
      setStage('input');
    }
  }, [weekPlans]);

  const savePlanToDB = async (data, input) => {
    try {
      const planData = {
        week_start_date: data.plan_start_date || currentWeekStartStr,
        original_input: input,
        theme: data.theme,
        summary: data.summary,
        plan_json: data,
        is_active: true
      };

      if (existingPlanId) {
        await base44.entities.WeeklyPlan.update(existingPlanId, planData);
        toast.success("规划已更新");
      } else {
        const newPlan = await base44.entities.WeeklyPlan.create(planData);
        setExistingPlanId(newPlan.id);
        toast.success("规划已保存");
      }
      queryClient.invalidateQueries({ queryKey: ['weeklyPlan'] });
    } catch (error) {
      console.error("Failed to save plan:", error);
      toast.error("保存规划失败");
    }
  };

  const deletePlan = async () => {
    if (!existingPlanId) return;
    try {
      await base44.entities.WeeklyPlan.delete(existingPlanId);
      setExistingPlanId(null);
      resetView();
      queryClient.invalidateQueries({ queryKey: ['weeklyPlan'] });
      toast.success("规划已删除");
    } catch (error) {
      console.error("Failed to delete plan:", error);
      toast.error("删除失败");
    }
  };

  const handleProcess = async () => {
    if (!userInput.trim()) return;
    
    const allowed = await gate("weekly_plan", "周计划生成");
    if (!allowed) return;

    setStage('processing');
    setIsProcessing(true);
    setProcessingStepIndex(0);

    // Start processing animation loop
    const stepInterval = setInterval(() => {
        setProcessingStepIndex(prev => (prev < PROCESSING_STEPS.length - 1 ? prev + 1 : prev));
    }, 1500);

    try {
        const { data } = await base44.functions.invoke('generateWeekPlan', {
            input: userInput,
            startDate: format(start, 'yyyy-MM-dd'),
            currentDate: format(new Date(), 'yyyy-MM-dd')
        });

        if (data) {
            setWeekData(data);
            
            // Intelligent Date Alignment
            if (data.plan_start_date) {
                // Parse manually to ensure local time (avoid UTC timezone shifts)
                const [py, pm, pd] = data.plan_start_date.split('-').map(Number);
                const plannedStart = new Date(py, pm - 1, pd);
                
                const currentStartStr = format(start, 'yyyy-MM-dd');
                
                // If the planned week is different from the currently viewed week, switch view
                if (data.plan_start_date !== currentStartStr && !isNaN(plannedStart.getTime())) {
                    setCurrentWeekDate(plannedStart);
                    toast.info(`已自动跳转到规划周: ${data.plan_start_date}`, { icon: "📅" });
                }
            }

            clearInterval(stepInterval);
            setProcessingStepIndex(PROCESSING_STEPS.length - 1);
            
            // Short delay to show completion
            setTimeout(() => {
                setStage('results');
                setIsProcessing(false);
                
                if (data.is_demo) {
                    toast.warning("AI服务不可用 (API Key无效)，已显示演示数据", { duration: 5000 });
                } else {
                    toast.success("已生成全情境规划");
                    savePlanToDB(data, userInput);

                    // 同步到约定和心签
                    const weekStart = data.plan_start_date || format(start, 'yyyy-MM-dd');
                    extractAndCreateTasks(userInput, weekStart).then(tasks => {
                      if (tasks.length > 0) toast.success(`已同步 ${tasks.length} 个约定`);
                    }).catch(e => console.error("Task sync failed", e));
                    syncPlanToNote(userInput, "week_plan", { dateRange: weekRangeLabel, theme: data.theme }).then(note => {
                      if (note) toast.success("已同步到心签");
                    }).catch(e => console.error("Note sync failed", e));
                }
                
                setTimeout(() => {
                    resultsRef.current?.scrollIntoView({ behavior: 'smooth' });
                }, 100);
            }, 800);
        }
    } catch (error) {
        console.error("Planning failed details:", error);
        // Show more detailed error if available
        const errorMsg = error.response?.data?.error || error.message || "未知错误";
        toast.error(`规划生成失败: ${errorMsg}`);
        setStage('input');
        setIsProcessing(false);
        clearInterval(stepInterval);
    }
  };

  const resetView = () => {
    setStage('input');
    setUserInput('');
    setWeekData(null);
  };

  const handleAppend = async () => {
    if (!appendInput.trim() || !weekData) return;

    const allowed = await gate("general_ai", "追加周计划内容");
    if (!allowed) return;

    setIsAppending(true);
    try {
      const { data } = await base44.functions.invoke('generateWeekPlan', {
        input: `现有规划摘要: ${weekData.summary}\n\n新增内容: ${appendInput}`,
        startDate: weekData.plan_start_date || currentWeekStartStr,
        currentDate: format(new Date(), 'yyyy-MM-dd'),
        existingPlan: weekData
      });
      if (data) {
        // Merge: keep existing events and add new ones, merge strategies
        const merged = {
          ...weekData,
          ...data,
          events: [
            ...(weekData.events || []),
            ...(data.events || []).filter(newE =>
              !(weekData.events || []).some(e => e.title === newE.title && e.date === newE.date)
            )
          ],
          automations: [
            ...(weekData.automations || []),
            ...(data.automations || []).filter(newA =>
              !(weekData.automations || []).some(a => a.title === newA.title)
            )
          ]
        };
        setWeekData(merged);
        savePlanToDB(merged, userInput + '\n' + appendInput);
        setAppendInput('');
        setShowAppendInput(false);
        toast.success('已将新内容智能融入本周规划');
      }
    } catch (e) {
      toast.error('更新失败，请重试');
    } finally {
      setIsAppending(false);
    }
  };

  const getWeekDays = () => {
    const days = [];
    for (let i = 0; i < 7; i++) {
      days.push(addDays(start, i));
    }
    return days;
  };

  const weekDays = getWeekDays();

  // Helper to find events for a specific day index (0-6)
  const getEventsForDay = (dayIndex, dayDate) => {
    if (!weekData || !weekData.events) return [];
    
    // Strict Date Matching
    if (dayDate) {
        const dateStr = format(dayDate, 'yyyy-MM-dd');
        
        return weekData.events.filter(e => {
            // Case 1: Event has a specific date (Priority)
            if (e.date) {
                return e.date === dateStr;
            }
            
            // Case 2: Event has no date (Legacy/Fallback)
            // Only show by day_index if the current week view matches the plan's start date
            // This prevents "Next Week's Tuesday" event from showing up on "This Week's Tuesday"
            if (weekData.plan_start_date) {
                const currentWeekStart = format(start, 'yyyy-MM-dd');
                if (weekData.plan_start_date === currentWeekStart) {
                    return e.day_index === dayIndex;
                }
                return false; // Plan is for another week, don't show generic events here
            }

            // Case 3: No date and no plan start date (Fallback, least specific)
            return e.day_index === dayIndex;
        });
    }

    return [];
  };

  return (
    <>
    <div className="min-h-screen bg-[#f8f9fa] text-slate-900 font-sans rounded-3xl overflow-hidden relative">
      
      <div className="relative z-10 p-6 md:p-8 max-w-7xl mx-auto flex flex-col min-h-[calc(100vh-100px)]">
        
        {/* Input Section */}
        <AnimatePresence mode="wait">
          {stage === 'input' && (
            <motion.section 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex-1 flex flex-col justify-center items-center text-center space-y-8 mt-8"
            >
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-white rounded-full border border-slate-200 shadow-sm">
                  <span className="w-2 h-2 bg-[#384877] rounded-full animate-pulse"></span>
                  <span className="text-xs font-medium text-slate-600">AI Week Planner</span>
                </div>
                <h1 className="text-3xl md:text-5xl font-bold text-slate-900 tracking-tight leading-tight">
                  规划这一周，<br />
                  <span className="text-[#384877]">从容且坚定</span>
                </h1>
                <p className="text-base text-slate-500 max-w-lg mx-auto leading-relaxed">
                  告诉我本周的重要安排，心栈将为你编织全设备协同的执行网络。
                </p>
              </div>

              <div className="w-full max-w-2xl relative group">
                 <div className="relative bg-white rounded-3xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-slate-100 p-2 transition-shadow duration-300 hover:shadow-[0_12px_40px_rgba(0,0,0,0.08)]">
                    <div className="bg-white rounded-2xl flex flex-col">
                      <Textarea 
                        value={userInput}
                        onChange={(e) => setUserInput(e.target.value)}
                        placeholder="例如：下周一到周三在深圳出差，周二下午3点拜访客户；周四回京参加行业峰会..."
                        className="w-full bg-transparent border-none outline-none text-lg text-slate-800 placeholder:text-slate-400 resize-none px-6 py-5 font-light min-h-[140px] focus-visible:ring-0 leading-relaxed"
                      />
                      <div className="flex items-center justify-between px-4 pb-4 pt-2 border-t border-slate-50">
                         <div className="flex gap-2">
                            <Button variant="ghost" size="icon" className="text-slate-400 hover:text-[#384877] hover:bg-slate-50">
                              <Mic className="w-5 h-5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="text-slate-400 hover:text-[#384877] hover:bg-slate-50">
                              <ImageIcon className="w-5 h-5" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => setShowQuickTemplates(!showQuickTemplates)}
                              className="text-xs text-slate-500 hover:text-[#384877] hover:bg-slate-50 gap-1"
                            >
                              快速模板 <ChevronDown className="w-3 h-3" />
                            </Button>
                         </div>
                         <Button 
                            onClick={handleProcess}
                            disabled={!userInput.trim() || isProcessing}
                            className="bg-[#384877] hover:bg-[#2d3a5f] text-white rounded-xl px-6 h-10 shadow-lg shadow-[#384877]/20 transition-all duration-300"
                         >
                            {isProcessing ? '规划中...' : '生成规划'} <ArrowRight className="w-4 h-4 ml-2" />
                         </Button>
                      </div>
                    </div>
                 </div>
              </div>

              {showQuickTemplates && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-wrap justify-center gap-3 max-w-2xl"
                >
                  {QUICK_TEMPLATES.map((tpl, idx) => (
                    <button 
                      key={idx}
                      onClick={() => {
                        setUserInput(tpl.text);
                        setShowQuickTemplates(false);
                      }}
                      className="px-4 py-2 bg-white border border-slate-200 rounded-full text-sm text-slate-600 hover:border-[#384877] hover:text-[#384877] transition-all shadow-sm"
                    >
                      {tpl.label}
                    </button>
                  ))}
                </motion.div>
              )}
            </motion.section>
          )}

          {stage === 'processing' && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex items-center justify-center"
            >
               <div className="w-full max-w-xl bg-white rounded-3xl p-8 border border-slate-100 shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
                  <div className="flex items-center gap-3 mb-8 text-[#384877]">
                     <Sparkles className="w-5 h-5 animate-pulse" />
                     <span className="font-medium text-lg">正在生成周规划...</span>
                  </div>
                  <div className="space-y-6 pl-2">
                     {PROCESSING_STEPS.map((step, idx) => (
                       <motion.div 
                         key={idx}
                         initial={{ opacity: 0, x: -10 }}
                         animate={{ 
                           opacity: idx <= processingStepIndex ? 1 : 0.4,
                           x: idx <= processingStepIndex ? 0 : -10,
                           scale: idx === processingStepIndex ? 1.02 : 1
                         }}
                         className="flex items-center gap-4"
                       >
                          <div className={cn(
                              "w-8 h-8 rounded-full flex items-center justify-center text-sm border transition-colors duration-500",
                              idx < processingStepIndex ? "bg-emerald-50 border-emerald-200 text-emerald-600" :
                              idx === processingStepIndex ? "bg-[#384877]/10 border-[#384877]/30 text-[#384877]" :
                              "bg-slate-50 border-slate-100 text-slate-300"
                          )}>
                             {idx < processingStepIndex ? <CheckCircle2 className="w-4 h-4" /> : 
                              idx === processingStepIndex ? <div className="w-2 h-2 bg-[#384877] rounded-full animate-ping" /> :
                              <div className="w-2 h-2 bg-slate-200 rounded-full" />
                             }
                          </div>
                          <span className={cn(
                              "text-sm font-medium transition-colors duration-300",
                              idx <= processingStepIndex ? "text-slate-800" : "text-slate-400"
                          )}>{step.text}</span>
                       </motion.div>
                     ))}
                  </div>
               </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Results Section */}
        {stage === 'results' && weekData && (
          <motion.div 
            ref={resultsRef}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="w-full space-y-10 pb-20"
          >
             {/* Header */}
             <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                   <div className="flex items-center gap-3 mb-1">
                       <h3 className="text-2xl font-bold text-slate-900">已为你安排</h3>
                       <span className="px-3 py-1 bg-[#384877]/10 text-[#384877] text-xs font-medium rounded-full">
                          {weekData.theme || '周计划'}
                       </span>
                   </div>
                   <p className="text-sm text-slate-500">基于输入: "{userInput.length > 30 ? userInput.substring(0, 30) + '...' : userInput}"</p>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-sm font-medium text-slate-600 bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm">
                        {weekRangeLabel}
                    </span>
                   <Button
                     size="sm"
                     className="bg-[#384877] hover:bg-[#2d3a5f] text-white rounded-xl"
                     onClick={() => setShowAppendInput(v => !v)}
                   >
                     <Plus className="w-3.5 h-3.5 mr-1" /> 追加内容
                   </Button>
                   <Button 
                     variant="outline" 
                     onClick={() => { if (confirm('确定要删除当前规划并开始新的对话吗？')) { deletePlan(); } }} 
                     className="rounded-xl border-slate-200 text-slate-600 hover:bg-red-50 hover:text-red-600"
                   >
                      删除规划
                   </Button>
                   <Button variant="outline" onClick={() => setStage('input')} className="rounded-xl border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-[#384877]">
                      重新规划
                   </Button>
                </div>
             </div>

             {/* Append Input */}
             <AnimatePresence>
               {showAppendInput && (
                 <motion.div
                   initial={{ height: 0, opacity: 0 }}
                   animate={{ height: 'auto', opacity: 1 }}
                   exit={{ height: 0, opacity: 0 }}
                   className="overflow-hidden"
                 >
                   <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200">
                     <p className="text-xs text-slate-500 mb-2 font-medium">追加内容将被 AI 智能融入现有规划：</p>
                     <Textarea
                       value={appendInput}
                       onChange={e => setAppendInput(e.target.value)}
                       placeholder="例如：周三新增了一个重要会议，下午2点..."
                       className="bg-white border-slate-200 rounded-xl resize-none text-sm min-h-[80px] focus-visible:ring-[#384877]/20"
                       rows={3}
                       autoFocus
                     />
                     <div className="flex gap-2 mt-3">
                       <Button onClick={handleAppend} disabled={!appendInput.trim() || isAppending} className="bg-[#384877] hover:bg-[#2d3a5f] text-white rounded-xl h-9 px-4 text-sm">
                         {isAppending ? <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />融入中...</> : <><Sparkles className="w-3.5 h-3.5 mr-1" />智能融入</>}
                       </Button>
                       <Button variant="ghost" size="sm" onClick={() => setShowAppendInput(false)} className="text-slate-400 h-9 rounded-xl">取消</Button>
                     </div>
                   </div>
                 </motion.div>
               )}
             </AnimatePresence>

             {/* Logic to check if we are viewing the planned week */}
             {(() => {
                const viewingStartStr = format(start, 'yyyy-MM-dd');
                const isViewingPlan = weekData.plan_start_date === viewingStartStr;

                if (!isViewingPlan) {
                    return (
                        <div className="bg-white rounded-[24px] p-8 border border-slate-100 shadow-sm text-center py-16">
                            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
                                <CalendarIcon className="w-8 h-8" />
                            </div>
                            <h3 className="text-lg font-bold text-slate-900 mb-2">本周暂无AI规划</h3>
                            <p className="text-slate-500 mb-6 max-w-md mx-auto">
                                您当前查看的日期（{weekRangeLabel}）与生成的规划日期（{weekData.plan_start_date}）不一致。
                            </p>
                            <div className="flex items-center justify-center gap-3">
                                <Button 
                                    onClick={() => {
                                        const [y, m, d] = weekData.plan_start_date.split('-').map(Number);
                                        setCurrentWeekDate(new Date(y, m - 1, d));
                                    }}
                                    className="bg-[#384877] hover:bg-[#2d3a5f] text-white"
                                >
                                    跳转到已规划周
                                </Button>
                                <Button 
                                    variant="outline" 
                                    onClick={() => {
                                        setStage('input');
                                        setUserInput('');
                                        setWeekData(null);
                                        setExistingPlanId(null);
                                    }}
                                >
                                    为本周生成新规划
                                </Button>
                            </div>
                        </div>
                    );
                }

                return (
                    <>
                        {/* Summary & Stats Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            {/* Summary Card - Wide */}
                            <div className="md:col-span-2 bg-[#384877] rounded-[24px] p-6 text-white relative overflow-hidden group">
                                <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                                    <Sparkles className="w-24 h-24" />
                                </div>
                                <div className="relative z-10">
                                    <div className="text-white/60 text-xs font-medium uppercase tracking-wider mb-2">本周摘要</div>
                                    <p className="text-lg font-medium leading-relaxed opacity-95">
                                        {weekData.summary}
                                    </p>
                                </div>
                            </div>

                            {/* Stat Cards */}
                            <div className="bg-white rounded-[24px] p-6 border border-slate-100 shadow-sm flex flex-col justify-center items-center text-center">
                                <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 mb-2">
                                    <Zap className="w-5 h-5" />
                                </div>
                                <div className="text-3xl font-bold text-slate-900 mb-1">{weekData.stats?.focus_hours || 0}h</div>
                                <div className="text-xs text-slate-400 font-medium">深度专注</div>
                            </div>

                            <div className="bg-white rounded-[24px] p-6 border border-slate-100 shadow-sm flex flex-col justify-center items-center text-center">
                                <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600 mb-2">
                                    <CalendarIcon className="w-5 h-5" />
                                </div>
                                <div className="text-3xl font-bold text-slate-900 mb-1">{weekData.stats?.meetings || 0}</div>
                                <div className="text-xs text-slate-400 font-medium">重要会议</div>
                            </div>
                        </div>

                        {/* Device Strategy Matrix */}
                        <section>
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-xl font-bold text-slate-900">全设备智能协同</h3>
                            <div className="px-3 py-1 bg-white rounded-full border border-slate-200 text-xs font-medium text-emerald-600 flex items-center gap-1.5 shadow-sm">
                                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                                云端同步正常
                            </div>
                        </div>
                        
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                            {Object.entries(DEVICE_MAP).map(([key, config]) => {
                                const DeviceIcon = config.icon;
                                const strategy = weekData.device_strategies?.[key];
                                const isSelected = selectedDevice === key;

                                return (
                                    <div 
                                    key={key}
                                    onClick={() => setSelectedDevice(key)}
                                    className={cn(
                                        "bg-white rounded-[24px] p-5 flex flex-col items-center justify-center gap-3 border transition-all duration-300 cursor-pointer relative overflow-hidden",
                                        isSelected 
                                            ? "border-[#384877] ring-1 ring-[#384877]/10 shadow-[0_8px_30px_rgba(56,72,119,0.08)]" 
                                            : "border-slate-100 hover:border-slate-200 hover:shadow-md"
                                    )}
                                    >
                                    <div className={cn(
                                        "w-12 h-12 rounded-2xl flex items-center justify-center text-xl shadow-sm transition-colors",
                                        isSelected ? "bg-[#384877] text-white" : "bg-slate-50 text-slate-600"
                                    )}>
                                        <DeviceIcon className="w-6 h-6" />
                                    </div>
                                    <div className="text-center">
                                        <h4 className={cn("font-medium text-sm mb-1", isSelected ? "text-[#384877]" : "text-slate-900")}>
                                            {config.name}
                                        </h4>
                                        <div className="flex items-center justify-center gap-1.5">
                                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400"></div>
                                            <span className="text-[10px] text-emerald-600 font-medium bg-emerald-50 px-2 py-0.5 rounded-full">在线</span>
                                        </div>
                                    </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Device Detail Panel */}
                        <AnimatePresence mode="wait">
                            <motion.div 
                            key={selectedDevice}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="mt-4 bg-white rounded-[24px] p-6 border border-slate-100 shadow-sm"
                            >
                                <div className="flex items-start gap-4">
                                    <div className="w-10 h-10 rounded-full bg-[#384877]/5 flex items-center justify-center text-[#384877]">
                                        <Zap className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-medium text-slate-500 mb-1">本周策略 · {DEVICE_MAP[selectedDevice].name}</h4>
                                        <p className="text-base text-slate-900 font-medium leading-relaxed">
                                            {weekData.device_strategies?.[selectedDevice] || "本周无特殊策略，保持常规辅助模式。"}
                                        </p>
                                    </div>
                                </div>
                            </motion.div>
                        </AnimatePresence>
                        </section>
                    </>
                );
             })()}

             {/* Day-by-Day Timeline */}
             <section>
                <div className="flex items-center justify-between mb-6">
                   <h3 className="text-xl font-bold text-slate-900">情境感知日程</h3>
                </div>
                
                <div className="space-y-3">
                   {weekDays.map((day, idx) => {
                      const dayEvents = getEventsForDay(idx, day);
                      const isExpanded = expandedDays[idx] !== false; // Default expanded?
                      const hasEvents = dayEvents.length > 0;
                      const isToday = format(day, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
                      
                      return (
                         <div 
                            key={idx} 
                            className={cn(
                                "bg-white rounded-2xl overflow-hidden border transition-all duration-300",
                                isToday ? "border-[#384877]/30 shadow-md ring-1 ring-[#384877]/10" : "border-slate-100 hover:border-slate-200"
                            )}
                         >
                            <div 
                              onClick={() => setExpandedDays(prev => ({ ...prev, [idx]: !prev[idx] }))}
                              className={cn(
                                  "p-4 flex items-center justify-between cursor-pointer hover:bg-slate-50/50 transition-colors",
                                  isToday && "bg-[#384877]/5"
                              )}
                            >
                               <div className="flex items-center gap-4">
                                  <div className={cn(
                                    "w-12 h-12 rounded-xl flex flex-col items-center justify-center border",
                                    isToday ? "bg-[#384877] border-[#384877] text-white" : "bg-white border-slate-100 text-slate-900"
                                  )}>
                                     <span className="text-xs font-medium opacity-80">{format(day, 'EEE', { locale: zhCN })}</span>
                                     <span className="text-lg font-bold">{format(day, 'd')}</span>
                                  </div>
                                  <div>
                                     <div className="flex items-center gap-2">
                                         <h4 className={cn("font-bold text-base", isToday ? "text-[#384877]" : "text-slate-900")}>
                                            {format(day, 'EEEE', { locale: zhCN })}
                                         </h4>
                                         {isToday && <span className="text-[10px] bg-[#384877] text-white px-2 py-0.5 rounded-full font-medium">Today</span>}
                                     </div>
                                     <p className="text-xs text-slate-400 font-medium mt-0.5">
                                         {hasEvents ? `${dayEvents.length} 个事件` : '暂无特定安排'}
                                     </p>
                                  </div>
                               </div>
                               <ChevronDown className={cn("w-5 h-5 text-slate-300 transition-transform", isExpanded && "rotate-180")} />
                            </div>
                            
                            <AnimatePresence>
                               {(isExpanded && hasEvents) && (
                                 <motion.div 
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="overflow-hidden"
                                 >
                                    <div className="px-4 pb-4 pt-0">
                                       <div className="pl-[22px] border-l-2 border-slate-100 ml-6 space-y-4 pt-2">
                                           {dayEvents.map((e, i) => (
                                              <div key={i} className="relative group">
                                                 <div className="absolute -left-[29px] top-1.5 w-3.5 h-3.5 bg-white border-2 border-[#384877] rounded-full z-10"></div>
                                                 <div className="bg-slate-50 hover:bg-[#384877]/5 rounded-xl p-3 transition-colors border border-slate-100">
                                                    <div className="flex justify-between items-start mb-1">
                                                       <h5 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                                                           <span>{e.icon || '📅'}</span>
                                                           {e.title}
                                                       </h5>
                                                       <span className="text-xs font-mono text-[#384877] bg-[#384877]/10 px-2 py-0.5 rounded-md">
                                                           {e.time}
                                                       </span>
                                                    </div>
                                                    <div className="flex items-center gap-2 mt-2">
                                                        <span className={cn(
                                                            "text-[10px] px-2 py-0.5 rounded-full border",
                                                            e.type === 'travel' ? "bg-blue-50 text-blue-600 border-blue-100" :
                                                            e.type === 'focus' ? "bg-purple-50 text-purple-600 border-purple-100" :
                                                            e.type === 'meeting' ? "bg-amber-50 text-amber-600 border-amber-100" :
                                                            "bg-slate-100 text-slate-500 border-slate-200"
                                                        )}>
                                                            {{travel: '差旅', meeting: '会议', focus: '专注', work: '工作', rest: '休息', other: '其他'}[e.type] || '事项'}
                                                        </span>
                                                    </div>
                                                 </div>
                                              </div>
                                           ))}
                                       </div>
                                    </div>
                                 </motion.div>
                               )}
                            </AnimatePresence>
                         </div>
                      );
                   })}
                </div>
             </section>

             {/* Automations List */}
             {weekData.automations && weekData.automations.length > 0 && (
                 <section>
                    <div className="flex items-center justify-between mb-6">
                       <h3 className="text-xl font-bold text-slate-900">自动执行清单</h3>
                    </div>

                    <div className="grid md:grid-cols-2 gap-4">
                       {weekData.automations.map((task, idx) => (
                          <div key={idx} className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                             <div className="flex items-start gap-4">
                                <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-xl">
                                   {task.icon || '🤖'}
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-center justify-between mb-1">
                                        <h4 className="font-bold text-slate-900 text-sm">{task.title}</h4>
                                        <div className="flex items-center gap-1.5">
                                            <span className={cn(
                                                "w-1.5 h-1.5 rounded-full",
                                                task.status === 'active' ? "bg-emerald-500 animate-pulse" : "bg-slate-300"
                                            )}></span>
                                            <span className="text-[10px] text-slate-400 uppercase font-medium">
                                                {task.status === 'active' ? '运行中' : '待就绪'}
                                            </span>
                                        </div>
                                    </div>
                                    <p className="text-xs text-slate-500 leading-relaxed">{task.description}</p>
                                </div>
                             </div>
                          </div>
                       ))}
                    </div>
                 </section>
             )}
          </motion.div>
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