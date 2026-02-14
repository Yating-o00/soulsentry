import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format, startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { 
  Mic, 
  Image as ImageIcon, 
  ChevronDown, 
  ArrowRight, 
  Sparkles,
  Calendar as CalendarIcon,
  Zap,
  Target,
  Flag,
  Lightbulb
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { base44 } from "@/api/base44Client";

const QUICK_TEMPLATES = [
  { text: '下个月重点是项目冲刺，前两周完成开发，第三周测试，最后一周发布。希望能保持每天高效率工作，周末适当休息。', label: '🚀 项目冲刺月' },
  { text: '我想利用下个月好好提升自己，计划读完3本书，每周去健身房3次，还需要准备月底的资格考试。', label: '📚 自我提升月' },
  { text: '下个月比较轻松，主要是维护现有工作，想多花时间陪家人，安排一次短途旅行。', label: '🌿 生活平衡月' }
];

const PROCESSING_STEPS = [
  { icon: '📅', text: '分析月度时间跨度...' },
  { icon: '🎯', text: '提取核心目标与里程碑...' },
  { icon: '📊', text: '规划周度节奏与重点...' },
  { icon: '⚖️', text: '平衡工作与生活策略...' },
  { icon: '✨', text: '生成月度全景蓝图...' }
];

export default function SoulMonthPlanner({ currentDate: initialDate }) {
  const [stage, setStage] = useState('input');
  const [userInput, setUserInput] = useState('');
  const [currentMonthDate, setCurrentMonthDate] = useState(initialDate || new Date());
  const [processingStepIndex, setProcessingStepIndex] = useState(0);
  const [monthData, setMonthData] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [existingPlanId, setExistingPlanId] = useState(null);
  const [showQuickTemplates, setShowQuickTemplates] = useState(false);

  const resultsRef = useRef(null);

  const start = startOfMonth(currentMonthDate);
  const currentMonthStartStr = format(start, 'yyyy-MM-dd');
  const monthLabel = format(start, 'yyyy年M月', { locale: zhCN });

  useEffect(() => {
    if (initialDate) {
      setCurrentMonthDate(initialDate);
    }
  }, [initialDate]);

  useEffect(() => {
    const loadPlan = async () => {
      try {
        const plans = await base44.entities.MonthlyPlan.filter({
          month_start_date: currentMonthStartStr
        });
        
        if (plans && plans.length > 0) {
          const plan = plans[0];
          setExistingPlanId(plan.id);
          setMonthData({
            ...plan.plan_json,
            theme: plan.theme,
            summary: plan.summary
          });
          setUserInput(plan.original_input || '');
          setStage('results');
        } else {
          setExistingPlanId(null);
          setMonthData(null);
          setUserInput('');
          setStage('input');
        }
      } catch (error) {
        console.error("Failed to load plan:", error);
      }
    };
    
    loadPlan();
  }, [currentMonthStartStr]);

  const savePlanToDB = async (data, input) => {
    try {
      const planData = {
        month_start_date: data.plan_start_date || currentMonthStartStr,
        original_input: input,
        theme: data.theme,
        summary: data.summary,
        plan_json: data,
        is_active: true
      };

      if (existingPlanId) {
        await base44.entities.MonthlyPlan.update(existingPlanId, planData);
        toast.success("月度规划已更新");
      } else {
        const newPlan = await base44.entities.MonthlyPlan.create(planData);
        setExistingPlanId(newPlan.id);
        toast.success("月度规划已保存");
      }
    } catch (error) {
      console.error("Failed to save plan:", error);
      toast.error("保存规划失败");
    }
  };

  const deletePlan = async () => {
    if (!existingPlanId) return;
    try {
      await base44.entities.MonthlyPlan.delete(existingPlanId);
      setExistingPlanId(null);
      resetView();
      toast.success("规划已删除");
    } catch (error) {
      console.error("Failed to delete plan:", error);
      toast.error("删除失败");
    }
  };

  const handleProcess = async () => {
    if (!userInput.trim()) return;
    
    setStage('processing');
    setIsProcessing(true);
    setProcessingStepIndex(0);

    const stepInterval = setInterval(() => {
        setProcessingStepIndex(prev => (prev < PROCESSING_STEPS.length - 1 ? prev + 1 : prev));
    }, 1500);

    try {
        const { data } = await base44.functions.invoke('generateMonthPlan', {
            input: userInput,
            startDate: format(start, 'yyyy-MM-dd')
        });

        if (data) {
            setMonthData(data);
            clearInterval(stepInterval);
            setProcessingStepIndex(PROCESSING_STEPS.length - 1);
            
            setTimeout(() => {
                setStage('results');
                setIsProcessing(false);
                toast.success("已生成月度全景规划");
                savePlanToDB(data, userInput);
                
                setTimeout(() => {
                    resultsRef.current?.scrollIntoView({ behavior: 'smooth' });
                }, 100);
            }, 800);
        }
    } catch (error) {
        console.error("Planning failed details:", error);
        toast.error("规划生成失败，请重试");
        setStage('input');
        setIsProcessing(false);
        clearInterval(stepInterval);
    }
  };

  const resetView = () => {
    setStage('input');
    setUserInput('');
    setMonthData(null);
  };

  return (
    <div className="min-h-screen bg-[#f8f9fa] text-slate-900 font-sans rounded-3xl overflow-hidden relative">
      <div className="relative z-10 p-6 md:p-8 max-w-7xl mx-auto flex flex-col min-h-[calc(100vh-100px)]">
        
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
                  <span className="text-xs font-medium text-slate-600">AI Month Planner</span>
                </div>
                <h1 className="text-3xl md:text-5xl font-bold text-slate-900 tracking-tight leading-tight">
                  规划 {monthLabel}，<br />
                  <span className="text-[#384877]">预见未来的自己</span>
                </h1>
                <p className="text-base text-slate-500 max-w-lg mx-auto leading-relaxed">
                  告诉我本月的重要目标和期望，心栈将为你生成结构化的月度全景蓝图。
                </p>
              </div>

              <div className="w-full max-w-2xl relative group">
                 <div className="relative bg-white rounded-3xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-slate-100 p-2 transition-shadow duration-300 hover:shadow-[0_12px_40px_rgba(0,0,0,0.08)]">
                    <div className="bg-white rounded-2xl flex flex-col">
                      <Textarea 
                        value={userInput}
                        onChange={(e) => setUserInput(e.target.value)}
                        placeholder="例如：本月重点是完成新产品上线，前两周集中开发，第三周测试；同时想养成晨跑习惯..."
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
                            {isProcessing ? '规划中...' : '生成蓝图'} <ArrowRight className="w-4 h-4 ml-2" />
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
                     <span className="font-medium text-lg">正在生成月度蓝图...</span>
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
                             {idx < processingStepIndex ? <div className="w-2 h-2 bg-emerald-500 rounded-full" /> : 
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

        {stage === 'results' && monthData && (
          <motion.div 
            ref={resultsRef}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="w-full space-y-8 pb-20"
          >
             <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                   <div className="flex items-center gap-3 mb-1">
                       <h3 className="text-2xl font-bold text-slate-900">月度全景蓝图</h3>
                       <span className="px-3 py-1 bg-[#384877]/10 text-[#384877] text-xs font-medium rounded-full">
                          {monthData.theme || '月度规划'}
                       </span>
                   </div>
                   <p className="text-sm text-slate-500">{monthLabel} · {monthData.summary}</p>
                </div>
                <div className="flex items-center gap-3">
                   <Button variant="outline" onClick={() => { if(confirm('确定删除?')) deletePlan() }} className="text-red-600 hover:bg-red-50 border-slate-200">
                      删除
                   </Button>
                   <Button variant="outline" onClick={() => setStage('input')} className="border-slate-200">
                      重新规划
                   </Button>
                </div>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Stats */}
                <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm flex flex-col items-center justify-center text-center">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 mb-3">
                        <Zap className="w-6 h-6" />
                    </div>
                    <div className="text-4xl font-bold text-slate-900 mb-1">{monthData.stats?.focus_hours || 0}</div>
                    <div className="text-sm text-slate-500">预计专注小时</div>
                </div>
                <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm flex flex-col items-center justify-center text-center">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600 mb-3">
                        <Target className="w-6 h-6" />
                    </div>
                    <div className="text-4xl font-bold text-slate-900 mb-1">{monthData.stats?.milestones_count || 0}</div>
                    <div className="text-sm text-slate-500">关键里程碑</div>
                </div>
                
                {/* Strategies */}
                <div className="bg-[#384877] rounded-3xl p-6 text-white relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-10">
                        <Lightbulb className="w-24 h-24" />
                    </div>
                    <h4 className="font-semibold mb-4 flex items-center gap-2">
                        <Sparkles className="w-4 h-4" /> 核心策略
                    </h4>
                    <div className="space-y-3 relative z-10 text-sm opacity-90">
                        {monthData.strategies && Object.entries(monthData.strategies).map(([key, val]) => (
                            <div key={key}>
                                <span className="font-medium opacity-70 block text-xs uppercase tracking-wider mb-0.5">
                                    {key.replace(/_/g, ' ')}
                                </span>
                                <p>{val}</p>
                            </div>
                        ))}
                    </div>
                </div>
             </div>

             {/* Milestones */}
             {monthData.key_milestones && monthData.key_milestones.length > 0 && (
                 <section>
                    <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                        <Flag className="w-5 h-5 text-slate-400" /> 关键里程碑
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {monthData.key_milestones.map((m, i) => (
                            <div key={i} className="bg-white p-4 rounded-2xl border border-slate-100 flex items-center justify-between">
                                <div>
                                    <div className="font-semibold text-slate-800">{m.title}</div>
                                    <div className="text-xs text-slate-500 mt-1 capitalize">{m.type}</div>
                                </div>
                                <div className="text-sm font-medium text-[#384877] bg-[#384877]/5 px-3 py-1 rounded-lg">
                                    {m.deadline}
                                </div>
                            </div>
                        ))}
                    </div>
                 </section>
             )}

             {/* Weeks Breakdown */}
             <section>
                <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                    <CalendarIcon className="w-5 h-5 text-slate-400" /> 周度节奏
                </h3>
                <div className="space-y-4">
                    {monthData.weeks_breakdown?.map((week, idx) => (
                        <div key={idx} className="bg-white rounded-2xl p-5 border border-slate-100 hover:shadow-md transition-shadow">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-3">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-600 text-sm">
                                        W{idx + 1}
                                    </div>
                                    <h4 className="font-semibold text-slate-900">{week.week_label}</h4>
                                </div>
                                <div className="bg-slate-50 px-3 py-1 rounded-lg text-sm text-slate-600 border border-slate-100">
                                    <span className="font-medium mr-2">Focus:</span>
                                    {week.focus}
                                </div>
                            </div>
                            {week.key_events && week.key_events.length > 0 && (
                                <div className="pl-11">
                                    <div className="flex flex-wrap gap-2">
                                        {week.key_events.map((evt, i) => (
                                            <span key={i} className="text-xs bg-slate-50 text-slate-600 px-2 py-1 rounded border border-slate-100">
                                                {evt}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
             </section>
          </motion.div>
        )}
      </div>
    </div>
  );
}