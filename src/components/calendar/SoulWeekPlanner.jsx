import React, { useState, useRef } from 'react';
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
  Smartphone,
  Watch,
  Glasses,
  Car,
  Home,
  Laptop,
  Loader2,
  Sparkles
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { base44 } from "@/api/base44Client";

// Device Icons Mapping
const DEVICE_ICONS = {
  phone: { icon: Smartphone, label: '智能手机', color: 'bg-blue-50 text-blue-600' },
  watch: { icon: Watch, label: '智能手表', color: 'bg-indigo-50 text-indigo-600' },
  glasses: { icon: Glasses, label: '智能眼镜', color: 'bg-purple-50 text-purple-600' },
  car: { icon: Car, label: '电动汽车', color: 'bg-emerald-50 text-emerald-600' },
  home: { icon: Home, label: '智能家居', color: 'bg-orange-50 text-orange-600' },
  pc: { icon: Laptop, label: '工作站', color: 'bg-pink-50 text-pink-600' }
};

const QUICK_TEMPLATES = [
  { text: '下周一到周五深度工作模式，每天上午9-12点专注研发，下午处理会议，周三下午需要去医院体检，周五晚上团队聚餐', label: '🎯 深度工作周' },
  { text: '下周三飞上海参加Chinajoy，周四见投资人，周五回京，帮我安排好行程和资料准备', label: '✈️ 商务差旅' },
  { text: '下周是产品发布周，周一准备发布会，周三正式发布，周四用户反馈收集，全周保持高强度响应', label: '🚀 产品发布周' },
  { text: '下周想调整作息，每天早上6点起床跑步，晚上11点前睡觉，工作日专注工作，周末完全放松', label: '🌱 生活调整周' }
];

export default function SoulWeekPlanner({ currentDate: initialDate }) {
  const [stage, setStage] = useState('input'); // input, processing, results
  const [userInput, setUserInput] = useState('');
  const [currentWeekDate, setCurrentWeekDate] = useState(initialDate || new Date());
  const [weekData, setWeekData] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [expandedDays, setExpandedDays] = useState({});
  const [showQuickTemplates, setShowQuickTemplates] = useState(false);
  
  const resultsRef = useRef(null);

  const start = startOfWeek(currentWeekDate, { locale: zhCN, weekStartsOn: 1 });
  const end = endOfWeek(currentWeekDate, { locale: zhCN, weekStartsOn: 1 });
  const weekRangeLabel = `${format(start, 'yyyy年M月d日')} - ${format(end, 'M月d日')}`;

  const handleProcess = async () => {
    if (!userInput.trim()) return;
    
    setStage('processing');
    setIsProcessing(true);

    try {
      const { data } = await base44.functions.invoke('generateWeekPlan', {
        input: userInput,
        startDate: format(start, 'yyyy-MM-dd')
      });
      
      setWeekData(data);
      setStage('results');
      toast.success("周计划已生成");
      
      // Default expand today
      const todayIndex = (new Date().getDay() + 6) % 7; // Adjust for Monday start (0-6)
      setExpandedDays({ [todayIndex]: true });
      
    } catch (error) {
      console.error("Planning failed", error);
      toast.error("生成计划失败，请重试");
      setStage('input');
    } finally {
      setIsProcessing(false);
    }
  };

  const resetView = () => {
    setStage('input');
    setUserInput('');
    setWeekData(null);
  };

  const getWeekDays = () => {
    const days = [];
    for (let i = 0; i < 7; i++) {
      days.push(addDays(start, i));
    }
    return days;
  };

  const weekDays = getWeekDays();

  return (
    <div className="min-h-screen bg-[#f8f9fa] text-slate-900 font-sans p-6 md:p-8">
      
      <div className="max-w-7xl mx-auto flex flex-col space-y-8">
        
        {/* Input Section */}
        <AnimatePresence mode="wait">
          {stage === 'input' && (
            <motion.section 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex-1 flex flex-col justify-center items-center text-center space-y-8 mt-12"
            >
              <div className="space-y-4">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-white rounded-full border border-slate-200 shadow-sm">
                  <span className="w-2 h-2 bg-[#384877] rounded-full animate-pulse"></span>
                  <span className="text-xs text-slate-500 font-medium">智能规划助手</span>
                </div>
                <h1 className="text-3xl md:text-5xl font-bold text-slate-900 tracking-tight">
                  已为你安排
                </h1>
                <p className="text-lg text-slate-500 max-w-xl mx-auto leading-relaxed">
                  基于输入: "{userInput || '告诉我本周的重要安排...'}"
                </p>
              </div>

              <div className="w-full max-w-2xl">
                 <div className="bg-white rounded-[24px] border border-slate-200 shadow-lg p-2 transition-shadow hover:shadow-xl">
                    <div className="bg-slate-50 rounded-2xl flex flex-col">
                      <Textarea 
                        value={userInput}
                        onChange={(e) => setUserInput(e.target.value)}
                        placeholder="输入本周计划，例如：下周一到周三在深圳出差，周二下午3点拜访客户..."
                        className="w-full bg-transparent border-none outline-none text-lg text-slate-900 placeholder:text-slate-400 resize-none px-6 py-5 min-h-[140px] focus-visible:ring-0"
                      />
                      <div className="flex items-center justify-between px-4 pb-4">
                         <div className="flex gap-2">
                            <Button variant="ghost" size="icon" className="text-slate-400 hover:text-slate-600 hover:bg-slate-200/50">
                              <Mic className="w-5 h-5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="text-slate-400 hover:text-slate-600 hover:bg-slate-200/50">
                              <ImageIcon className="w-5 h-5" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => setShowQuickTemplates(!showQuickTemplates)}
                              className="text-xs bg-white text-slate-600 border border-slate-200 rounded-full hover:bg-slate-50"
                            >
                              快速模板 <ChevronDown className="w-3 h-3 ml-1" />
                            </Button>
                         </div>
                         <Button 
                            onClick={handleProcess}
                            disabled={!userInput.trim() || isProcessing}
                            className="bg-[#384877] hover:bg-[#2c3a63] text-white rounded-full px-6 shadow-md transition-all duration-300"
                         >
                            {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <>开始规划 <ArrowRight className="w-4 h-4 ml-2" /></>}
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
                      className="px-4 py-2 bg-white border border-slate-200 rounded-full text-sm text-slate-600 hover:text-[#384877] hover:border-[#384877] transition-all shadow-sm"
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
              className="flex-1 flex flex-col items-center justify-center space-y-6 mt-20"
            >
               <div className="relative">
                 <div className="w-16 h-16 rounded-full bg-[#384877]/10 flex items-center justify-center animate-pulse">
                   <Sparkles className="w-8 h-8 text-[#384877]" />
                 </div>
               </div>
               <div className="text-center space-y-2">
                 <h3 className="text-xl font-medium text-slate-900">正在生成智能规划...</h3>
                 <p className="text-slate-500">解析语义 · 匹配设备策略 · 优化时间分布</p>
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
             <div className="flex items-center justify-between">
                <div>
                   <h3 className="text-2xl font-bold text-slate-900 mb-1">本周概览</h3>
                   <div className="flex items-center gap-2 text-sm text-slate-500">
                     <CalendarIcon className="w-4 h-4" />
                     {weekRangeLabel}
                     <span className="px-2 py-0.5 bg-slate-100 rounded-full text-xs font-medium text-slate-600">{weekData.theme}</span>
                   </div>
                </div>
                <div className="flex gap-2">
                   <Button variant="outline" size="icon" className="rounded-full bg-white border-slate-200" onClick={() => setCurrentWeekDate(addDays(currentWeekDate, -7))}>
                      <ChevronLeft className="w-4 h-4" />
                   </Button>
                   <Button variant="outline" size="icon" className="rounded-full bg-white border-slate-200" onClick={() => setCurrentWeekDate(addDays(currentWeekDate, 7))}>
                      <ChevronRight className="w-4 h-4" />
                   </Button>
                   <Button variant="ghost" onClick={resetView} className="ml-2 text-slate-500 hover:text-[#384877]">
                      新对话
                   </Button>
                </div>
             </div>

             {/* Stats Cards - Matching the image style */}
             <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-[#384877] rounded-[24px] p-6 text-white relative overflow-hidden shadow-lg group hover:-translate-y-1 transition-transform duration-300">
                   <div className="relative z-10">
                      <div className="text-sm opacity-80 mb-2 font-medium">专注时长</div>
                      <div className="text-5xl font-bold mb-4">{weekData.stats?.focus_hours || 0}<span className="text-2xl ml-1 opacity-60">h</span></div>
                      <div className="w-full bg-white/20 h-1.5 rounded-full overflow-hidden">
                         <div className="bg-white h-full rounded-full w-[75%]"></div>
                      </div>
                      <div className="mt-2 text-xs opacity-60 text-right">目标达成 75%</div>
                   </div>
                   {/* Decorative background elements */}
                   <div className="absolute right-[-20px] bottom-[-20px] opacity-10 transform rotate-12">
                      <Laptop className="w-32 h-32" />
                   </div>
                </div>

                <div className="bg-white rounded-[24px] p-6 border border-slate-200 shadow-sm relative group hover:-translate-y-1 transition-transform duration-300">
                   <div className="flex justify-between items-start mb-4">
                      <div className="text-slate-500 font-medium">本周会议</div>
                      <span className="w-8 h-8 rounded-full bg-orange-50 text-orange-600 flex items-center justify-center text-xs font-bold">!</span>
                   </div>
                   <div className="text-5xl font-bold text-slate-900 mb-2">{weekData.stats?.meetings || 0}</div>
                   <div className="text-sm text-slate-400">需要重点准备</div>
                </div>

                <div className="bg-white rounded-[24px] p-6 border border-slate-200 shadow-sm relative group hover:-translate-y-1 transition-transform duration-300">
                   <div className="flex justify-between items-start mb-4">
                      <div className="text-slate-500 font-medium">差旅天数</div>
                      <span className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
                        <CheckCircle2 className="w-4 h-4" />
                      </span>
                   </div>
                   <div className="text-5xl font-bold text-slate-900 mb-2">{weekData.stats?.travel_days || 0}</div>
                   <div className="text-sm text-slate-400">行程已同步</div>
                </div>
             </div>

             {/* Device Matrix - "All Devices Intelligent Synergy" */}
             <section>
               <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-bold text-slate-900">全设备智能协同</h3>
                  <div className="px-3 py-1 bg-white rounded-full border border-slate-200 text-xs text-slate-600 flex items-center gap-2 shadow-sm">
                     <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
                     云端同步正常
                  </div>
               </div>
               
               <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                  {Object.entries(DEVICE_ICONS).map(([key, config]) => (
                    <div 
                      key={key}
                      className="bg-white rounded-[24px] p-6 flex flex-col items-center justify-center gap-4 border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.02)] transition-all duration-300 hover:shadow-[0_10px_40px_rgba(0,0,0,0.06)] hover:-translate-y-1 group"
                    >
                       <div className={cn(
                         "w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shadow-sm transition-colors duration-300",
                         config.color.split(' ')[0], 
                         config.color.split(' ')[1]
                       )}>
                          <config.icon className="w-7 h-7" />
                       </div>
                       <div className="text-center">
                         <h4 className="font-bold text-slate-900 mb-1">{config.label}</h4>
                         <p className="text-xs text-slate-400 line-clamp-2 min-h-[2.5em]">
                           {weekData.device_strategies?.[key] || '待机中'}
                         </p>
                       </div>
                       <div className="px-3 py-1 bg-emerald-50 text-emerald-600 text-[10px] font-medium rounded-full">
                          ● 在线
                       </div>
                    </div>
                  ))}
               </div>
             </section>

             {/* Timeline - List View */}
             <section>
                <div className="flex items-center justify-between mb-6">
                   <h3 className="text-xl font-bold text-slate-900">每日安排</h3>
                   <Button variant="ghost" size="sm" onClick={() => setExpandedDays({})}>收起全部</Button>
                </div>
                
                <div className="space-y-4">
                   {weekDays.map((day, idx) => {
                      // Adjust for Monday start (0=Monday in our weekDays array, but day.getDay() returns 0 for Sunday)
                      // Our backend returns day_index 0 for Monday.
                      // Let's just match based on array index since weekDays starts on Monday.
                      const dayEvents = weekData.events.filter(e => e.day_index === idx);
                      const isExpanded = expandedDays[idx];
                      const hasEvents = dayEvents.length > 0;
                      
                      return (
                         <div key={idx} className="bg-white rounded-[20px] border border-slate-100 overflow-hidden shadow-sm hover:shadow-md transition-all duration-300">
                            <div 
                              onClick={() => setExpandedDays(prev => ({ ...prev, [idx]: !prev[idx] }))}
                              className={cn(
                                "p-5 flex items-center justify-between cursor-pointer transition-colors",
                                isExpanded ? "bg-slate-50/50" : "hover:bg-slate-50"
                              )}
                            >
                               <div className="flex items-center gap-4">
                                  <div className={cn(
                                    "w-12 h-12 rounded-2xl flex flex-col items-center justify-center font-bold border",
                                    hasEvents ? "bg-blue-50 text-[#384877] border-blue-100" : "bg-slate-50 text-slate-400 border-slate-100"
                                  )}>
                                     <span className="text-xs uppercase">{format(day, 'EEE', { locale: zhCN })}</span>
                                     <span className="text-lg leading-none">{format(day, 'd')}</span>
                                  </div>
                                  <div>
                                     <h4 className={cn("font-bold", hasEvents ? "text-slate-900" : "text-slate-400")}>
                                       {format(day, 'EEEE', { locale: zhCN })}
                                     </h4>
                                     <p className="text-xs text-slate-500 mt-0.5">
                                       {hasEvents ? `${dayEvents.length} 个事项` : '暂无安排'}
                                     </p>
                                  </div>
                               </div>
                               <ChevronDown className={cn("w-5 h-5 text-slate-400 transition-transform duration-300", isExpanded && "rotate-180")} />
                            </div>
                            
                            <AnimatePresence>
                               {(isExpanded && hasEvents) && (
                                 <motion.div 
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="overflow-hidden"
                                 >
                                    <div className="px-5 pb-5 pt-0 space-y-3">
                                       <div className="h-px bg-slate-100 mb-4" />
                                       {dayEvents.map((e, i) => (
                                          <div key={i} className="flex items-center gap-4 p-3 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-100 transition-all">
                                             <div className="text-2xl w-10 text-center">{e.icon}</div>
                                             <div className="flex-1 min-w-0">
                                                <div className="flex justify-between items-center mb-1">
                                                   <h5 className="font-bold text-slate-900 truncate">{e.title}</h5>
                                                   <span className="text-xs font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">{e.time}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                   <span className={cn(
                                                     "w-2 h-2 rounded-full",
                                                     e.type === 'work' ? "bg-blue-400" :
                                                     e.type === 'meeting' ? "bg-orange-400" :
                                                     e.type === 'travel' ? "bg-emerald-400" :
                                                     e.type === 'focus' ? "bg-purple-400" : "bg-slate-400"
                                                   )} />
                                                   <span className="text-xs text-slate-500">
                                                      {{work: '工作', meeting: '会议', travel: '差旅', focus: '专注', rest: '休息', other: '其他'}[e.type] || '事项'}
                                                   </span>
                                                </div>
                                             </div>
                                          </div>
                                       ))}
                                    </div>
                                 </motion.div>
                               )}
                            </AnimatePresence>
                         </div>
                      );
                   })}
                </div>
             </section>

             {/* Automations */}
             <section>
                <div className="flex items-center justify-between mb-6">
                   <h3 className="text-xl font-bold text-slate-900">本周自动化</h3>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                   {weekData.automations?.map((task, idx) => (
                      <div key={idx} className="bg-white rounded-[20px] p-5 border border-slate-100 shadow-sm hover:shadow-md transition-all duration-300 group">
                         <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-3">
                               <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-xl group-hover:scale-110 transition-transform">
                                 {task.icon}
                               </div>
                               <div>
                                  <h4 className="font-bold text-slate-900 text-sm">{task.title}</h4>
                                  <div className="flex items-center gap-2 mt-1">
                                     <span className={cn(
                                       "w-1.5 h-1.5 rounded-full",
                                       task.status === 'active' ? "bg-emerald-500 animate-pulse" :
                                       task.status === 'ready' ? "bg-blue-500" :
                                       "bg-slate-300"
                                     )}></span>
                                     <span className="text-[10px] text-slate-400 uppercase tracking-wider">{task.status}</span>
                                  </div>
                               </div>
                            </div>
                         </div>
                         <p className="text-slate-500 text-sm leading-relaxed pl-[52px]">{task.description}</p>
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