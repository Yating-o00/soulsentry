import React, { useState, useEffect, useRef } from 'react';
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
  Plane,
  Briefcase,
  Coffee,
  Target,
  Home,
  Zap,
  Leaf,
  BarChart,
  Calendar as CalendarIcon
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// Device Configurations
const DEVICE_CONFIGS = {
  phone: {
    name: '智能手机',
    icon: Smartphone,
    color: 'bg-[#384877]',
    role: '主控终端',
    weeklyStrategies: [
      { day: '周一', time: '早晨', method: '锁屏简报', content: '本周概览：3个重点会议，2天差旅', priority: 'high' },
      { day: '每日', time: '20:00', method: '智能复盘', content: '当日完成度检查，明日预备提醒', priority: 'medium' },
      { day: '周五', time: '下午', method: '周报生成', content: '自动生成本周行为报告与下周建议', priority: 'low' }
    ]
  },
  watch: {
    name: '智能手表',
    icon: Watch,
    color: 'bg-[#384877]',
    role: '触觉管家',
    weeklyStrategies: [
      { day: '工作日', time: '09:00', method: '节律唤醒', content: '晨间运动提醒，轻度振动唤醒', priority: 'medium' },
      { day: '会议日', time: '会前15分', method: '触觉导航', content: '静默提醒，不打扰他人的预备信号', priority: 'high' },
      { day: '差旅日', time: '全程', method: '健康监控', content: '久坐提醒、心率监测、压力管理', priority: 'high' }
    ]
  },
  glasses: {
    name: '智能眼镜',
    icon: Glasses,
    color: 'bg-[#8b5cf6]',
    role: 'AR秘书',
    weeklyStrategies: [
      { day: '会议日', time: '见面时', method: 'AR识别', content: '客户资料浮窗显示，上次见面回顾', priority: 'high' },
      { day: '差旅日', time: '导航时', method: '路径投影', content: '机场/车站AR导航，登机口提示', priority: 'high' },
      { day: '周末', time: '休闲时', method: '拍照备忘', content: '所见即所录，灵感瞬间捕捉', priority: 'low' }
    ]
  },
  car: {
    name: '电动汽车',
    icon: Car,
    color: 'bg-[#10b981]',
    role: '移动办公室',
    weeklyStrategies: [
      { day: '周一', time: '早晨', method: '路线规划', content: '基于本周日程的智能路线预热', priority: 'medium' },
      { day: '差旅日', time: '往返途中', method: '车载会议', content: '降噪通话环境，日程语音播报', priority: 'high' },
      { day: '周五', time: '下班', method: '放松模式', content: '自动播放本周收藏音乐，调节氛围灯', priority: 'low' }
    ]
  },
  home: {
    name: '智能家居',
    icon: Home,
    color: 'bg-[#f97316]',
    role: '环境调节师',
    weeklyStrategies: [
      { day: '每日', time: '06:30', method: '渐进唤醒', content: '模拟日出灯光，配合本周作息调整', priority: 'medium' },
      { day: '工作日晚', time: '22:00', method: '睡眠预备', content: '自动调暗灯光，白噪音启动，明日预备', priority: 'medium' },
      { day: '周末', time: '全天', method: '休闲模式', content: '背景音乐、香氛、灯光调至放松状态', priority: 'low' }
    ]
  },
  pc: {
    name: '工作站',
    icon: Laptop,
    color: 'bg-[#ec4899]',
    role: '深度工作舱',
    weeklyStrategies: [
      { day: '周一', time: '上午', method: '周计划看板', content: '自动生成Notion/飞书周计划文档', priority: 'high' },
      { day: '专注日', time: '工作时段', method: '深度模式', content: '屏蔽干扰，仅允许紧急通知', priority: 'high' },
      { day: '周五', time: '下午', method: '归档整理', content: '自动整理本周文件，生成知识库', priority: 'medium' }
    ]
  }
};

const QUICK_TEMPLATES = [
  { text: '下周一到周五深度工作模式，每天上午9-12点专注研发，下午处理会议，周三下午需要去医院体检，周五晚上团队聚餐', label: '🎯 深度工作周' },
  { text: '下周三飞上海参加Chinajoy，周四见投资人，周五回京，帮我安排好行程和资料准备', label: '✈️ 商务差旅' },
  { text: '下周是产品发布周，周一准备发布会，周三正式发布，周四用户反馈收集，全周保持高强度响应', label: '🚀 产品发布周' },
  { text: '下周想调整作息，每天早上6点起床跑步，晚上11点前睡觉，工作日专注工作，周末完全放松', label: '🌱 生活调整周' }
];

const PROCESSING_STEPS = [
  { icon: '📅', text: '解析时间跨度：识别周一到周日的时间分布...' },
  { icon: '🎯', text: '提取核心事件：商务会议、差旅、个人时间...' },
  { icon: '🗺️', text: '空间规划：深圳-北京双城路线优化...' },
  { icon: '⚡', text: '生成周设备协同矩阵：跨天策略分配...' },
  { icon: '🔄', text: '建立自动化链路：差旅监控、会议预备、健康追踪...' },
  { icon: '✨', text: '编织完成：生成本周情境感知网络' }
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
  
  const resultsRef = useRef(null);

  const start = startOfWeek(currentWeekDate, { locale: zhCN });
  const end = endOfWeek(currentWeekDate, { locale: zhCN });
  const weekRangeLabel = `${format(start, 'yyyy年M月d日')} - ${format(end, 'M月d日')}`;

  const handleProcess = async () => {
    if (!userInput.trim()) return;
    
    setStage('processing');
    setProcessingStepIndex(0);

    // Simulate processing steps
    for (let i = 0; i < PROCESSING_STEPS.length; i++) {
      setProcessingStepIndex(i);
      await new Promise(r => setTimeout(r, 800));
    }

    // Generate mock data
    const data = generateMockData(userInput);
    setWeekData(data);
    setStage('results');
    
    toast.success("已生成本周全情境规划，跨6设备协同");
    
    setTimeout(() => {
      resultsRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const generateMockData = (input) => {
    const events = [];
    const isBusiness = input.includes('出差') || input.includes('飞') || input.includes('上海') || input.includes('北京');
    
    if (isBusiness) {
      events.push({ day: 0, title: '启程出发', type: 'travel', time: '09:00', icon: '✈️' });
      events.push({ day: 1, title: '客户拜访', type: 'meeting', time: '15:00', icon: '🤝' });
      events.push({ day: 2, title: '商务考察', type: 'work', time: '全天', icon: '🏢' });
    }
    if (input.includes('峰会') || input.includes('会')) {
      events.push({ day: 3, title: '行业峰会', type: 'meeting', time: '10:00', icon: '🎤' });
    }
    if (input.includes('放松') || input.includes('周末') || input.includes('休息')) {
      events.push({ day: 5, title: '家庭时光', type: 'rest', time: '全天', icon: '🌲' });
      events.push({ day: 6, title: '身心调整', type: 'rest', time: '全天', icon: '🧘' });
    }
    if (input.includes('深度') || input.includes('专注') || input.includes('工作')) {
      for (let i = 0; i < 5; i++) {
        events.push({ day: i, title: '深度工作', type: 'focus', time: '09:00-12:00', icon: '🎯' });
      }
    }
    
    // Fallback if no keywords matched
    if (events.length === 0) {
       events.push({ day: 0, title: '周计划启动', type: 'work', time: '09:00', icon: '🚀' });
       events.push({ day: 2, title: '项目推进', type: 'focus', time: '14:00', icon: '⚡' });
       events.push({ day: 4, title: '周复盘', type: 'work', time: '16:00', icon: '📊' });
    }

    return { events, input };
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
    <div className="min-h-screen bg-[#f5f5f0] text-[#0a0a0f] font-sans selection:bg-[#e8d5b7] selection:text-[#0a0a0f] rounded-3xl overflow-hidden relative">
      
      {/* Background Ambient Effects */}
      <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-[#e8d5b7]/20 rounded-full blur-[120px] animate-[breathe_6s_ease-in-out_infinite]"></div>
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-[#6366f1]/10 rounded-full blur-[120px] animate-[breathe_6s_ease-in-out_infinite_3s]"></div>
      </div>

      <div className="relative z-10 p-6 md:p-12 max-w-7xl mx-auto flex flex-col min-h-[calc(100vh-100px)]">
        
        {/* Input Section */}
        <AnimatePresence mode="wait">
          {stage === 'input' && (
            <motion.section 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex-1 flex flex-col justify-center items-center text-center space-y-8 mt-12"
            >
              <div className="space-y-4">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/40 backdrop-blur-md rounded-full border border-white/60">
                  <span className="w-2 h-2 bg-[#a78bfa] rounded-full animate-pulse"></span>
                  <span className="text-xs text-[#0a0a0f]/60 tracking-wider uppercase">Week View Mode</span>
                </div>
                <h1 className="text-4xl md:text-6xl font-serif font-light text-[#0a0a0f] tracking-tight leading-tight">
                  规划这一周，<br />
                  <span className="bg-clip-text text-transparent bg-gradient-to-r from-slate-700 via-slate-500 to-slate-700 animate-shimmer italic">
                    从容且坚定
                  </span>
                </h1>
                <p className="text-lg text-[#0a0a0f]/50 max-w-xl mx-auto font-light leading-relaxed">
                  告诉我本周的重要约定与目标，我会为你编织成一张流动的网，<br/>在恰当的时间、恰当的设备上轻触你。
                </p>
              </div>

              <div className="w-full max-w-2xl relative group">
                 <div className="absolute -inset-1 bg-gradient-to-r from-[#e8d5b7]/30 to-[#6366f1]/20 rounded-3xl blur opacity-30 group-hover:opacity-50 transition duration-1000"></div>
                 <div className="relative bg-white/40 backdrop-blur-xl border border-white/60 shadow-lg rounded-3xl p-2">
                    <div className="bg-white/40 rounded-2xl flex flex-col">
                      <Textarea 
                        value={userInput}
                        onChange={(e) => setUserInput(e.target.value)}
                        placeholder="下周一到周三在深圳出差，周二下午3点拜访客户王总；周四回北京参加行业峰会..."
                        className="w-full bg-transparent border-none outline-none text-lg text-[#0a0a0f] placeholder-[#0a0a0f]/30 resize-none px-6 py-5 font-light min-h-[120px] focus-visible:ring-0"
                      />
                      <div className="flex items-center justify-between px-4 pb-4">
                         <div className="flex gap-2">
                            <Button variant="ghost" size="icon" className="text-[#0a0a0f]/40 hover:text-[#0a0a0f]/70 hover:bg-[#0a0a0f]/5">
                              <Mic className="w-5 h-5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="text-[#0a0a0f]/40 hover:text-[#0a0a0f]/70 hover:bg-[#0a0a0f]/5">
                              <ImageIcon className="w-5 h-5" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => setShowQuickTemplates(!showQuickTemplates)}
                              className="text-xs bg-[#e8d5b7]/20 text-[#0a0a0f]/60 rounded-full hover:bg-[#e8d5b7]/30"
                            >
                              快速模板 <ChevronDown className="w-3 h-3 ml-1" />
                            </Button>
                         </div>
                         <Button 
                            onClick={handleProcess}
                            disabled={!userInput.trim()}
                            className="bg-gradient-to-br from-[#0a0a0f] to-[#1e293b] text-[#f5f5f0] rounded-full px-6 shadow-lg hover:shadow-xl hover:translate-y-[-2px] transition-all duration-300"
                         >
                            规划本周 <ArrowRight className="w-4 h-4 ml-2" />
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
                      className="px-4 py-2 bg-white/40 backdrop-blur-md border border-white/60 rounded-full text-sm text-[#0a0a0f]/60 hover:text-[#0a0a0f] hover:border-[#e8d5b7]/50 transition-all"
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
               <div className="w-full max-w-2xl glass-refined rounded-2xl p-8 border-l-4 border-[#e8d5b7]">
                  <div className="flex items-center gap-3 mb-8 text-[#0a0a0f]/70">
                     <div className="flex gap-1.5">
                        <div className="w-2 h-2 bg-[#e8d5b7] rounded-full thinking-dot"></div>
                        <div className="w-2 h-2 bg-[#e8d5b7] rounded-full thinking-dot" style={{ animationDelay: '-0.16s' }}></div>
                        <div className="w-2 h-2 bg-[#e8d5b7] rounded-full thinking-dot" style={{ animationDelay: '-0.32s' }}></div>
                     </div>
                     <span className="font-serif italic text-sm">心栈正在编织周计划...</span>
                  </div>
                  <div className="space-y-6">
                     {PROCESSING_STEPS.map((step, idx) => (
                       <motion.div 
                         key={idx}
                         initial={{ opacity: 0, x: -10 }}
                         animate={{ 
                           opacity: idx <= processingStepIndex ? 1 : 0.3,
                           x: idx <= processingStepIndex ? 0 : -10
                         }}
                         className="flex items-center gap-4"
                       >
                          <span className="text-xl">{step.icon}</span>
                          <span className="text-sm font-light flex-1">{step.text}</span>
                          {idx < processingStepIndex && (
                            <CheckCircle2 className="w-4 h-4 text-[#10b981]" />
                          )}
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
            className="w-full space-y-12 pb-20 mt-8"
          >
             {/* Header */}
             <div className="flex items-center justify-between">
                <div>
                   <h3 className="text-2xl font-serif font-light text-[#0a0a0f] mb-1">本周概览</h3>
                   <p className="text-sm text-[#0a0a0f]/50">{weekRangeLabel}</p>
                </div>
                <div className="flex gap-2">
                   <Button variant="ghost" size="icon" className="rounded-full bg-white/40 hover:bg-white/60" onClick={() => setCurrentWeekDate(addDays(currentWeekDate, -7))}>
                      <ChevronLeft className="w-5 h-5" />
                   </Button>
                   <Button variant="ghost" size="icon" className="rounded-full bg-white/40 hover:bg-white/60" onClick={() => setCurrentWeekDate(addDays(currentWeekDate, 7))}>
                      <ChevronRight className="w-5 h-5" />
                   </Button>
                   <Button variant="ghost" onClick={resetView} className="ml-4 text-xs text-[#0a0a0f]/60">
                      新计划
                   </Button>
                </div>
             </div>

             {/* Week Grid */}
             <div className="grid grid-cols-7 gap-3">
               {weekDays.map((day, idx) => {
                 const dayEvents = weekData.events.filter(e => e.day === idx);
                 return (
                   <motion.div 
                     key={idx}
                     initial={{ opacity: 0, y: 20 }}
                     animate={{ opacity: 1, y: 0 }}
                     transition={{ delay: idx * 0.05 }}
                     className="glass-refined rounded-2xl p-4 min-h-[120px] cursor-pointer hover:border-[#e8d5b7]/30 hover:-translate-y-1 transition-all duration-300"
                   >
                     <div className="text-center mb-3">
                        <div className="text-xs text-[#0a0a0f]/40 uppercase tracking-wider mb-1">{format(day, 'EEE', { locale: zhCN })}</div>
                        <div className="text-2xl font-serif text-[#0a0a0f]">{format(day, 'd')}</div>
                     </div>
                     <div className="flex justify-center gap-1 flex-wrap">
                        {dayEvents.length > 0 ? (
                          dayEvents.map((e, i) => (
                             <div key={i} className="w-2 h-2 rounded-full bg-[#e8d5b7] shadow-sm" title={e.title} />
                          ))
                        ) : (
                          <div className="text-[10px] text-[#0a0a0f]/20">无安排</div>
                        )}
                     </div>
                     {dayEvents.length > 0 && (
                       <div className="mt-3 text-center text-[10px] text-[#0a0a0f]/50">{dayEvents.length} 个事件</div>
                     )}
                   </motion.div>
                 );
               })}
             </div>

             {/* Stats */}
             <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: '事件总数', value: weekData.events.length, color: 'text-[#0a0a0f]' },
                  { label: '专注日', value: weekData.events.filter(e => e.type === 'focus').length || 2, color: 'text-[#a78bfa]' },
                  { label: '差旅日', value: weekData.events.filter(e => e.type === 'travel').length, color: 'text-[#6366f1]' },
                  { label: '自动任务', value: 8, color: 'text-[#10b981]' }
                ].map((stat, idx) => (
                  <div key={idx} className="glass-refined rounded-2xl p-4 text-center">
                     <div className={`text-3xl font-serif mb-1 ${stat.color}`}>{stat.value}</div>
                     <div className="text-xs text-[#0a0a0f]/50 uppercase tracking-wider">{stat.label}</div>
                  </div>
                ))}
             </div>

             {/* Device Matrix */}
             <section>
               <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-2xl font-serif font-light text-[#0a0a0f] mb-1">全设备协同策略</h3>
                    <p className="text-sm text-[#0a0a0f]/50">基于周情境的设备分工与接力</p>
                  </div>
                  <div className="px-3 py-1 glass-refined rounded-full text-xs text-[#0a0a0f]/60 border border-[#e8d5b7]/20 flex items-center gap-2">
                     <span className="w-1.5 h-1.5 bg-[#10b981] rounded-full animate-pulse"></span>
                     跨设备同步正常
                  </div>
               </div>
               
               <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6">
                  {Object.entries(DEVICE_CONFIGS).map(([key, config]) => (
                    <div 
                      key={key}
                      onClick={() => setSelectedDevice(key)}
                      className={cn(
                        "glass-refined rounded-2xl p-5 text-center cursor-pointer transition-all duration-300 hover:-translate-y-1",
                        selectedDevice === key && "border-[#e8d5b7] bg-[#e8d5b7]/15 ring-2 ring-[#e8d5b7]/20"
                      )}
                    >
                       <div className="w-12 h-12 mx-auto mb-3 bg-gradient-to-br from-[#0a0a0f] to-[#1e293b] rounded-2xl flex items-center justify-center text-[#f5f5f0] shadow-lg text-2xl">
                          {config.icon}
                       </div>
                       <h4 className="font-medium text-[#0a0a0f] text-sm mb-1">{config.name}</h4>
                       <p className="text-[10px] text-[#0a0a0f]/40 uppercase tracking-wider">{config.role}</p>
                    </div>
                  ))}
               </div>

               {/* Device Details */}
               <AnimatePresence mode="wait">
                 <motion.div 
                   key={selectedDevice}
                   initial={{ opacity: 0, y: 10 }}
                   animate={{ opacity: 1, y: 0 }}
                   exit={{ opacity: 0, y: -10 }}
                   className="glass-refined rounded-2xl p-6"
                 >
                    <div className="flex justify-between items-start mb-6">
                       <div>
                          <h4 className="text-lg font-serif text-[#0a0a0f]">{DEVICE_CONFIGS[selectedDevice].name} 策略</h4>
                          <p className="text-sm text-[#0a0a0f]/50 mt-1">本周跨天协同规划</p>
                       </div>
                    </div>
                    <div className="grid gap-3">
                       {DEVICE_CONFIGS[selectedDevice].weeklyStrategies.map((strat, idx) => (
                         <div key={idx} className="flex items-start gap-4 p-4 bg-white/40 rounded-xl border border-white/60 hover:bg-white/60 transition-colors">
                            <div className="w-10 h-10 bg-[#e8d5b7]/20 rounded-full flex items-center justify-center text-[#0a0a0f]/70 text-sm font-serif flex-shrink-0">
                               {strat.day === '每日' ? 'D' : strat.day.charAt(1)}
                            </div>
                            <div className="flex-1">
                               <div className="flex justify-between items-start mb-1">
                                  <div>
                                     <span className="font-medium text-[#0a0a0f] text-sm">{strat.day} · {strat.time}</span>
                                     <span className={cn(
                                       "px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider ml-2",
                                       strat.priority === 'high' ? "bg-[#0a0a0f]/10 text-[#0a0a0f]" : 
                                       strat.priority === 'medium' ? "bg-[#6366f1]/10 text-[#6366f1]" : 
                                       "bg-[#0a0a0f]/5 text-[#0a0a0f]/50"
                                     )}>
                                        {strat.method}
                                     </span>
                                  </div>
                               </div>
                               <p className="text-[#0a0a0f]/60 text-sm leading-relaxed">{strat.content}</p>
                            </div>
                         </div>
                       ))}
                    </div>
                 </motion.div>
               </AnimatePresence>
             </section>

             {/* Timeline */}
             <section>
                <div className="flex items-center justify-between mb-6">
                   <div>
                      <h3 className="text-2xl font-serif font-light text-[#0a0a0f] mb-1">情境感知时间线</h3>
                      <p className="text-sm text-[#0a0a0f]/50">流动的周日程，核心事件作为时间锚点</p>
                   </div>
                   <div className="flex gap-2">
                      <Button variant="ghost" size="sm" className="glass-refined rounded-full h-8 text-xs" onClick={() => setExpandedDays({})}>收起全部</Button>
                   </div>
                </div>
                
                <div className="space-y-4">
                   {weekDays.map((day, idx) => {
                      const dayEvents = weekData.events.filter(e => e.day === idx);
                      const isExpanded = expandedDays[idx];
                      const hasEvents = dayEvents.length > 0;
                      
                      return (
                         <div key={idx} className="glass-refined rounded-2xl overflow-hidden border border-white/60">
                            <div 
                              onClick={() => setExpandedDays(prev => ({ ...prev, [idx]: !prev[idx] }))}
                              className="p-4 bg-white/20 flex items-center justify-between cursor-pointer hover:bg-white/40 transition-colors"
                            >
                               <div className="flex items-center gap-3">
                                  <div className={cn(
                                    "w-10 h-10 rounded-full flex items-center justify-center text-[#0a0a0f] font-serif",
                                    hasEvents ? "bg-[#e8d5b7]/30" : "bg-[#0a0a0f]/5"
                                  )}>
                                     {format(day, 'EEE', { locale: zhCN }).charAt(1)}
                                  </div>
                                  <div>
                                     <h4 className="font-medium text-[#0a0a0f]">{format(day, 'EEEE', { locale: zhCN })}</h4>
                                     <p className="text-xs text-[#0a0a0f]/50">{hasEvents ? `${dayEvents.length} 个事件` : '暂无安排'}</p>
                                  </div>
                               </div>
                               <ChevronDown className={cn("w-5 h-5 text-[#0a0a0f]/40 transition-transform", isExpanded && "rotate-180")} />
                            </div>
                            <AnimatePresence>
                               {(isExpanded || hasEvents) && ( // Default expanded if has events? maybe just respect state. Let's respect state but default expand today?
                                 <motion.div 
                                    initial={false}
                                    animate={{ height: isExpanded ? 'auto' : 0, opacity: isExpanded ? 1 : 0 }}
                                    className="overflow-hidden"
                                 >
                                    <div className="border-t border-white/40">
                                       {hasEvents ? dayEvents.map((e, i) => (
                                          <div key={i} className="p-4 flex items-start gap-4 hover:bg-white/30 transition-colors border-b border-white/20 last:border-0">
                                             <div className="text-2xl">{e.icon}</div>
                                             <div className="flex-1">
                                                <div className="flex justify-between items-start">
                                                   <h5 className="font-medium text-[#0a0a0f] text-sm">{e.title}</h5>
                                                   <span className="text-xs text-[#0a0a0f]/40 font-mono">{e.time}</span>
                                                </div>
                                                <p className="text-xs text-[#0a0a0f]/50 mt-1">
                                                   {{travel: '差旅出行', meeting: '商务会议', work: '工作事务', rest: '休息放松', focus: '深度工作'}[e.type]} · 已同步至3个设备
                                                </p>
                                             </div>
                                          </div>
                                       )) : (
                                          <div className="p-4 text-center text-sm text-[#0a0a0f]/40">本日为自由时间，建议休息或处理琐事</div>
                                       )}
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
                   <div className="flex items-center gap-3">
                      <h3 className="text-2xl font-serif font-light text-[#0a0a0f]">周自动执行清单</h3>
                      <span className="px-2.5 py-0.5 bg-[#e8d5b7]/20 text-[#0a0a0f]/70 text-xs rounded-full border border-[#e8d5b7]/30">5 项待执行</span>
                   </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                   {[
                      { title: '跨城差旅管家', desc: '监测深圳-北京航班动态，自动值机、接送机调度、酒店入住提醒', status: 'active', icon: '✈️', type: 'weekly' },
                      { title: '会议智能预备', desc: '提前1小时打开相关文档、检查设备电量、预备AR资料浮窗', status: 'ready', icon: '📋', type: 'recurring' },
                      { title: '健康节律守护', desc: '监测本周睡眠质量，差旅日自动调整提醒强度，防止过劳', status: 'monitoring', icon: '❤️', type: 'weekly' },
                      { title: '周末数字排毒', desc: '周五晚自动开启免打扰，隐藏工作应用，播放白噪音', status: 'pending', icon: '🌿', type: 'recurring' },
                      { title: '周报自动生成', desc: '周五下午汇总本周完成事项、时间分布、下周建议', status: 'pending', icon: '📊', type: 'weekly' }
                   ].map((task, idx) => (
                      <div key={idx} className="glass-refined rounded-2xl p-5 border border-white/60 hover:-translate-y-1 transition-all duration-300">
                         <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-3">
                               <span className="text-2xl">{task.icon}</span>
                               <div>
                                  <h4 className="font-medium text-[#0a0a0f] text-sm mb-0.5">{task.title}</h4>
                                  <div className="flex items-center gap-2">
                                     <div className={cn(
                                       "w-1.5 h-1.5 rounded-full",
                                       task.status === 'active' ? "bg-[#10b981] animate-pulse" :
                                       task.status === 'ready' ? "bg-[#6366f1]" :
                                       task.status === 'monitoring' ? "bg-amber-400 animate-pulse" :
                                       "bg-[#0a0a0f]/20"
                                     )}></div>
                                     <span className="text-[10px] text-[#0a0a0f]/40 uppercase tracking-wider">{task.status}</span>
                                  </div>
                               </div>
                            </div>
                         </div>
                         <p className="text-[#0a0a0f]/50 text-sm leading-relaxed">{task.desc}</p>
                      </div>
                   ))}
                </div>
             </section>

             {/* Commitments */}
             <section className="glass-refined rounded-3xl p-8 border border-[#e8d5b7]/20 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-[#e8d5b7]/10 rounded-full blur-3xl -mr-32 -mt-32"></div>
                <h3 className="text-2xl font-serif font-light text-[#0a0a0f] mb-6 relative z-10">本周核心约定</h3>
                <div className="grid md:grid-cols-3 gap-6 relative z-10">
                   {[
                      { title: '商务核心', desc: '深圳客户拜访 · 北京行业峰会', metric: '2 城 3 场', color: 'text-[#6366f1]', border: 'border-[#6366f1]' },
                      { title: '深度工作', desc: '周一至周五上午 · 专注研发', metric: '5 个时段', color: 'text-[#e8d5b7]', border: 'border-[#e8d5b7]' },
                      { title: '身心平衡', desc: '周末家庭时光 · 数字排毒', metric: '48 小时', color: 'text-[#10b981]', border: 'border-[#10b981]' }
                   ].map((c, i) => (
                      <div key={i} className={`glass-refined rounded-2xl p-6 border-t-4 ${c.border} hover:-translate-y-1 transition-all duration-300`}>
                         <h4 className="font-serif text-lg text-[#0a0a0f] mb-2">{c.title}</h4>
                         <p className="text-sm text-[#0a0a0f]/60 mb-4 leading-relaxed">{c.desc}</p>
                         <span className={`text-2xl font-serif ${c.color}`}>{c.metric}</span>
                      </div>
                   ))}
                </div>
                <div className="mt-8 pt-6 border-t border-[#0a0a0f]/5 flex items-center justify-between text-sm text-[#0a0a0f]/50">
                    <span>心栈将持续守护这些约定，在恰当的时刻给予你温柔的支持</span>
                    <Button variant="ghost" size="sm" onClick={() => toast.success("周计划已导出")}>
                       导出周计划
                    </Button>
                </div>
             </section>
          </motion.div>
        )}
      </div>
    </div>
  );
}