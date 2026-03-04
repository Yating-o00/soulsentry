import React, { useState, useEffect } from "react";
import { format, startOfWeek, endOfWeek, addDays, addWeeks, subWeeks, isSameDay } from "date-fns";
import { zhCN } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Smartphone, Watch, Glasses, Car, Home, Laptop, 
  Plane, Users, Briefcase, Coffee, Zap,
  ChevronLeft, ChevronRight, Mic, Image as ImageIcon,
  Sparkles, RotateCcw
} from "lucide-react";
import { toast } from "sonner";
import { extractAndCreateTasks } from "@/components/utils/extractAndCreateTasks";
import { base44 } from "@/api/base44Client";

const deviceConfigs = {
  phone: {
    name: '智能手机',
    icon: Smartphone,
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
    role: '深度工作舱',
    weeklyStrategies: [
      { day: '周一', time: '上午', method: '周计划看板', content: '自动生成Notion/飞书周计划文档', priority: 'high' },
      { day: '专注日', time: '工作时段', method: '深度模式', content: '屏蔽干扰，仅允许紧急通知', priority: 'high' },
      { day: '周五', time: '下午', method: '归档整理', content: '自动整理本周文件，生成知识库', priority: 'medium' }
    ]
  }
};

const automations = [
  { title: '跨城差旅管家', desc: '监测深圳-北京航班动态，自动值机、接送机调度、酒店入住提醒', status: 'active', icon: Plane, type: 'weekly' },
  { title: '会议智能预备', desc: '提前1小时打开相关文档、检查设备电量、预备AR资料浮窗', status: 'ready', icon: Users, type: 'recurring' },
  { title: '健康节律守护', desc: '监测本周睡眠质量，差旅日自动调整提醒强度，防止过劳', status: 'monitoring', icon: Zap, type: 'weekly' },
  { title: '周末数字排毒', desc: '周五晚自动开启免打扰，隐藏工作应用，播放白噪音', status: 'pending', icon: Coffee, type: 'recurring' },
  { title: '周报自动生成', desc: '周五下午汇总本周完成事项、时间分布、下周建议', status: 'pending', icon: Briefcase, type: 'weekly' }
];

export default function CalendarWeekView({ 
  currentDate, 
  tasks, 
  onDateClick, 
  onTaskClick 
}) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDayIndex, setSelectedDayIndex] = useState(null);
  const [selectedDevice, setSelectedDevice] = useState('phone');
  const [showInput, setShowInput] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Calculate display week based on currentDate + offset
  const displayDate = addWeeks(currentDate, weekOffset);
  const startOfDisplayWeek = startOfWeek(displayDate, { locale: zhCN, weekStartsOn: 1 });
  const endOfDisplayWeek = endOfWeek(displayDate, { locale: zhCN, weekStartsOn: 1 });
  const weekRangeLabel = `${format(startOfDisplayWeek, "yyyy年M月d日", { locale: zhCN })} - ${format(endOfDisplayWeek, "M月d日", { locale: zhCN })}`;

  const days = Array.from({ length: 7 }).map((_, i) => {
    const day = addDays(startOfDisplayWeek, i);
    const dayTasks = tasks.filter(t => t.reminder_time && isSameDay(new Date(t.reminder_time), day));
    return {
      date: day,
      dayName: format(day, "EEE", { locale: zhCN }),
      dayNum: format(day, "d"),
      tasks: dayTasks,
      isToday: isSameDay(day, new Date())
    };
  });

  const handlePrevWeek = () => setWeekOffset(prev => prev - 1);
  const handleNextWeek = () => setWeekOffset(prev => prev + 1);

  const processIntent = async () => {
    if (!inputValue.trim()) return;
    setIsProcessing(true);
    
    try {
        const weekStartStr = format(startOfDisplayWeek, "yyyy-MM-dd");
        const tasks = await extractAndCreateTasks(inputValue, weekStartStr);
        toast.success(tasks.length > 0 ? `已生成本周规划，并添加 ${tasks.length} 个约定` : "已生成本周规划");
        setInputValue("");
        setShowInput(false);
    } catch (e) {
        toast.error("规划生成失败");
    } finally {
        setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-8 animate-fade-up">
      {/* Header / Navigation */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="text-2xl font-serif font-light text-[#0a0a0f] mb-1">本周概览</h3>
          <p className="text-sm text-[#0a0a0f]/50">{weekRangeLabel}</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => setShowInput(!showInput)}
            className="px-4 py-2 glass-refined rounded-full text-sm text-[#0a0a0f]/60 hover:text-[#0a0a0f] transition-all flex items-center gap-2 mr-2"
          >
            <Sparkles className="w-4 h-4" />
            {showInput ? "隐藏规划器" : "智能规划"}
          </button>
          <button onClick={handlePrevWeek} className="w-10 h-10 rounded-full glass-refined flex items-center justify-center hover:bg-white/60 transition-colors">
            <ChevronLeft className="w-5 h-5 text-[#0a0a0f]/60" />
          </button>
          <button onClick={handleNextWeek} className="w-10 h-10 rounded-full glass-refined flex items-center justify-center hover:bg-white/60 transition-colors">
            <ChevronRight className="w-5 h-5 text-[#0a0a0f]/60" />
          </button>
        </div>
      </div>

      {/* Input Section (Collapsible) */}
      <AnimatePresence>
        {(showInput || isProcessing) && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="w-full max-w-3xl mx-auto relative group input-glow rounded-3xl transition-all duration-500 mb-8">
                <div className="absolute -inset-1 bg-gradient-to-r from-[#e8d5b7]/30 to-[#6366f1]/20 rounded-3xl blur opacity-30 group-hover:opacity-50 transition duration-1000"></div>
                <div className="relative glass-refined rounded-3xl p-2">
                    <div className="bg-white/40 rounded-2xl flex flex-col">
                        {isProcessing ? (
                            <div className="p-8 text-center text-[#0a0a0f]/70">
                                <div className="flex items-center justify-center gap-2 mb-4">
                                    <div className="w-2 h-2 bg-[#e8d5b7] rounded-full thinking-dot"></div>
                                    <div className="w-2 h-2 bg-[#e8d5b7] rounded-full thinking-dot"></div>
                                    <div className="w-2 h-2 bg-[#e8d5b7] rounded-full thinking-dot"></div>
                                </div>
                                <span className="font-serif italic text-sm">心栈正在编织周计划...</span>
                            </div>
                        ) : (
                            <>
                                <textarea 
                                    className="w-full bg-transparent border-none outline-none text-lg text-[#0a0a0f] placeholder-[#0a0a0f]/30 resize-none px-6 py-5 font-light leading-relaxed scrollbar-hide"
                                    rows="3"
                                    placeholder="告诉我本周的重要约定与目标，我会为你编织成一张流动的网..."
                                    value={inputValue}
                                    onChange={(e) => setInputValue(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), processIntent())}
                                ></textarea>
                                <div className="flex items-center justify-between px-4 pb-4">
                                    <div className="flex gap-2">
                                        <button className="p-2 hover:bg-[#0a0a0f]/5 rounded-lg transition-colors text-[#0a0a0f]/40 hover:text-[#0a0a0f]/70">
                                            <Mic className="w-5 h-5" />
                                        </button>
                                        <button className="p-2 hover:bg-[#0a0a0f]/5 rounded-lg transition-colors text-[#0a0a0f]/40 hover:text-[#0a0a0f]/70">
                                            <ImageIcon className="w-5 h-5" />
                                        </button>
                                    </div>
                                    <button 
                                        onClick={processIntent} 
                                        className="bg-gradient-to-br from-[#0a0a0f] to-[#1e293b] text-[#f5f5f0] px-6 py-2.5 rounded-full text-sm font-medium flex items-center gap-2 shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all"
                                    >
                                        <span>规划本周</span>
                                        <Sparkles className="w-4 h-4" />
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Week Grid */}
      <div className="grid grid-cols-7 gap-3 mb-6">
        {days.map((day, idx) => (
          <div 
            key={idx}
            onClick={() => {
                setSelectedDayIndex(idx);
                onDateClick && onDateClick(day.date);
            }}
            className={`
                glass-refined rounded-2xl p-4 cursor-pointer border-2 border-transparent transition-all duration-300
                hover:-translate-y-1 hover:shadow-md
                ${day.isToday ? 'bg-[#e8d5b7]/30 border-[#e8d5b7] shadow-sm' : 'hover:border-[#e8d5b7]/30'}
                ${selectedDayIndex === idx ? 'ring-2 ring-[#e8d5b7]' : ''}
            `}
          >
            <div className="text-center mb-2">
                <div className="text-xs text-[#0a0a0f]/40 uppercase tracking-wider mb-1">{day.dayName}</div>
                <div className="text-2xl font-serif text-[#0a0a0f]">{day.dayNum}</div>
            </div>
            <div className="flex justify-center gap-1 flex-wrap min-h-[24px]">
                {day.tasks.length > 0 ? (
                    day.tasks.slice(0, 4).map((_, i) => (
                        <div key={i} className="w-2 h-2 rounded-full bg-[#e8d5b7] shadow-sm"></div>
                    ))
                ) : (
                    <div className="text-xs text-[#0a0a0f]/20">无安排</div>
                )}
                {day.tasks.length > 4 && <div className="w-2 h-2 rounded-full bg-[#e8d5b7]/50"></div>}
            </div>
            {day.tasks.length > 0 && (
                <div className="mt-2 text-center text-[10px] text-[#0a0a0f]/50">{day.tasks.length} 个事件</div>
            )}
          </div>
        ))}
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
            { label: '事件总数', value: tasks.length, color: 'text-[#0a0a0f]' },
            { label: '专注日', value: Math.floor(tasks.length / 3), color: 'text-[#a78bfa]' },
            { label: '差旅日', value: tasks.filter(t => t.title.includes('差旅') || t.title.includes('出差')).length, color: 'text-[#6366f1]' },
            { label: '自动任务', value: automations.length, color: 'text-[#10b981]' }
        ].map((stat, i) => (
            <div key={i} className="glass-refined rounded-2xl p-4 text-center hover-lift">
                <div className={`text-3xl font-serif mb-1 ${stat.color}`}>{stat.value}</div>
                <div className="text-xs text-[#0a0a0f]/50 uppercase tracking-wider">{stat.label}</div>
            </div>
        ))}
      </div>

      {/* Device Matrix */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
            <div>
                <h3 className="text-2xl font-serif font-light text-[#0a0a0f] mb-1">全设备协同策略</h3>
                <p className="text-sm text-[#0a0a0f]/50">基于周情境的设备分工与接力</p>
            </div>
            <span className="px-3 py-1 glass-refined rounded-full text-xs text-[#0a0a0f]/60 border border-[#e8d5b7]/20 flex items-center">
                <span className="w-1.5 h-1.5 bg-[#10b981] rounded-full inline-block mr-1.5 animate-pulse"></span>
                跨设备同步正常
            </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {Object.entries(deviceConfigs).map(([key, config]) => {
                const Icon = config.icon;
                const isActive = selectedDevice === key;
                return (
                    <div 
                        key={key}
                        onClick={() => setSelectedDevice(key)}
                        className={`
                            glass-refined rounded-2xl p-5 text-center cursor-pointer transition-all duration-500 border-2
                            hover:-translate-y-1 hover:shadow-lg
                            ${isActive 
                                ? 'border-[#e8d5b7] bg-[#e8d5b7]/15 shadow-md' 
                                : 'border-transparent hover:border-[#e8d5b7]/30'
                            }
                        `}
                    >
                        <div className="w-12 h-12 mx-auto mb-3 bg-gradient-to-br from-[#0a0a0f] to-[#1e293b] rounded-2xl flex items-center justify-center text-[#f5f5f0] shadow-lg">
                            <Icon className="w-6 h-6" />
                        </div>
                        <h4 className="font-medium text-[#0a0a0f] text-sm mb-1">{config.name}</h4>
                        <p className="text-[10px] text-[#0a0a0f]/40 uppercase tracking-wider">{config.role}</p>
                        {isActive && (
                            <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#10b981]/10 rounded-full">
                                <div className="w-1.5 h-1.5 bg-[#10b981] rounded-full animate-pulse"></div>
                                <span className="text-[10px] text-[#10b981] font-medium">本周活跃</span>
                            </div>
                        )}
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
                className="glass-refined rounded-2xl p-6"
            >
                <div className="flex justify-between items-start mb-6">
                    <div>
                        <h4 className="text-lg font-serif text-[#0a0a0f]">{deviceConfigs[selectedDevice].name} 策略</h4>
                        <p className="text-sm text-[#0a0a0f]/50 mt-1">本周跨天协同规划</p>
                    </div>
                    <button className="px-3 py-1.5 text-xs border border-[#0a0a0f]/10 rounded-full hover:bg-[#0a0a0f]/5 transition-colors">
                        调整优先级
                    </button>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                    {deviceConfigs[selectedDevice].weeklyStrategies.map((strat, idx) => (
                        <div key={idx} className="flex items-start gap-4 p-4 bg-white/40 rounded-xl border border-white/60 hover:bg-white/60 transition-colors">
                            <div className="w-10 h-10 bg-[#e8d5b7]/20 rounded-full flex items-center justify-center text-[#0a0a0f]/70 text-sm font-serif flex-shrink-0">
                                {strat.day.charAt(0)}
                            </div>
                            <div className="flex-1">
                                <div className="flex justify-between items-start mb-1">
                                    <div>
                                        <span className="font-medium text-[#0a0a0f] text-sm">{strat.day} · {strat.time}</span>
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider ml-2 ${
                                            strat.priority === 'high' ? 'bg-[#0a0a0f]/10 text-[#0a0a0f]' :
                                            strat.priority === 'medium' ? 'bg-[#6366f1]/10 text-[#6366f1]' :
                                            'bg-[#0a0a0f]/5 text-[#0a0a0f]/50'
                                        }`}>{strat.method}</span>
                                    </div>
                                </div>
                                <p className="text-[#0a0a0f]/60 text-sm leading-relaxed">{strat.content}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </motion.div>
        </AnimatePresence>
      </div>

      {/* Context Aware Timeline */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
            <div>
                <h3 className="text-2xl font-serif font-light text-[#0a0a0f] mb-1">情境感知时间线</h3>
                <p className="text-sm text-[#0a0a0f]/50">流动的周日程，核心事件作为时间锚点</p>
            </div>
        </div>

        <div className="space-y-4">
            {days.map((day, idx) => (
                <div key={idx} className="glass-refined rounded-2xl overflow-hidden border border-white/60">
                    <div className="p-4 bg-white/20 flex items-center justify-between cursor-pointer hover:bg-white/40 transition-colors">
                        <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-full ${day.tasks.length > 0 ? 'bg-[#e8d5b7]/30' : 'bg-[#0a0a0f]/5'} flex items-center justify-center text-[#0a0a0f] font-serif`}>
                                {day.dayName.charAt(1)}
                            </div>
                            <div>
                                <h4 className="font-medium text-[#0a0a0f]">{day.dayName}</h4>
                                <p className="text-xs text-[#0a0a0f]/50">{day.tasks.length > 0 ? `${day.tasks.length} 个事件` : '暂无安排'}</p>
                            </div>
                        </div>
                    </div>
                    {day.tasks.length > 0 && (
                        <div className="border-t border-white/40">
                            {day.tasks.map((task) => (
                                <div 
                                    key={task.id}
                                    onClick={() => onTaskClick && onTaskClick(task)}
                                    className="p-4 flex items-start gap-4 hover:bg-white/30 transition-colors border-b border-white/20 last:border-0 cursor-pointer"
                                >
                                    <div className="text-xl">
                                        {task.title.includes('会议') ? '🤝' : 
                                         task.title.includes('出差') || task.title.includes('飞') ? '✈️' : 
                                         task.title.includes('休息') ? '🌿' : '📝'}
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex justify-between items-start">
                                            <h5 className="font-medium text-[#0a0a0f] text-sm">{task.title}</h5>
                                            <span className="text-xs text-[#0a0a0f]/40 font-mono">
                                                {format(new Date(task.reminder_time), "HH:mm")}
                                            </span>
                                        </div>
                                        <p className="text-xs text-[#0a0a0f]/50 mt-1 capitalize flex items-center gap-2">
                                            <span className={`w-1.5 h-1.5 rounded-full ${
                                                task.priority === 'high' ? 'bg-[#f87171]' : 
                                                task.priority === 'medium' ? 'bg-[#e8d5b7]' : 'bg-[#10b981]'
                                            }`}></span>
                                            {task.category || '一般事务'} · 已同步至设备
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ))}
        </div>
      </div>

      {/* Weekly Automations */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
                <h3 className="text-2xl font-serif font-light text-[#0a0a0f]">周自动执行清单</h3>
                <span className="px-2.5 py-0.5 bg-[#e8d5b7]/20 text-[#0a0a0f]/70 text-xs rounded-full border border-[#e8d5b7]/30">
                    {automations.length} 项待执行
                </span>
            </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
            {automations.map((auto, idx) => {
                const Icon = auto.icon;
                return (
                    <div key={idx} className="glass-refined rounded-2xl p-5 border border-white/60 hover-lift group">
                        <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-3">
                                <span className="p-2 bg-[#0a0a0f]/5 rounded-lg">
                                    <Icon className="w-5 h-5 text-[#0a0a0f]" />
                                </span>
                                <div>
                                    <h4 className="font-medium text-[#0a0a0f] text-sm mb-0.5">{auto.title}</h4>
                                    <div className="flex items-center gap-2">
                                        <div className={`w-1.5 h-1.5 rounded-full ${
                                            auto.status === 'active' ? 'bg-[#10b981] animate-pulse' :
                                            auto.status === 'ready' ? 'bg-[#6366f1]' :
                                            auto.status === 'monitoring' ? 'bg-amber-400 animate-pulse' :
                                            'bg-[#0a0a0f]/20'
                                        }`}></div>
                                        <span className="text-[10px] text-[#0a0a0f]/40 uppercase tracking-wider">{auto.status}</span>
                                    </div>
                                </div>
                            </div>
                            {auto.status === 'ready' && (
                                <button className="px-3 py-1.5 bg-[#0a0a0f] text-[#f5f5f0] text-xs rounded-full hover:bg-[#1e293b] transition-colors shadow-md">
                                    执行
                                </button>
                            )}
                        </div>
                        <p className="text-[#0a0a0f]/50 text-sm leading-relaxed">{auto.desc}</p>
                    </div>
                );
            })}
        </div>
      </div>

      {/* Commitments Overview */}
      <div className="glass-refined rounded-3xl p-8 border border-[#e8d5b7]/20 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#e8d5b7]/10 rounded-full blur-3xl -mr-32 -mt-32"></div>
        
        <h3 className="text-2xl font-serif font-light text-[#0a0a0f] mb-6 relative z-10">本周核心约定</h3>
        
        <div className="grid md:grid-cols-3 gap-6 relative z-10">
            <div className="glass-refined rounded-2xl p-6 border-t-4 border-[#6366f1] hover-lift">
                <h4 className="font-serif text-lg text-[#0a0a0f] mb-2">商务核心</h4>
                <p className="text-sm text-[#0a0a0f]/60 mb-4 leading-relaxed">深圳客户拜访 · 北京行业峰会</p>
                <div className="flex items-center justify-between">
                    <span className="text-2xl font-serif text-[#6366f1]">2 城 3 场</span>
                    <div className="w-8 h-8 rounded-full bg-[#6366f1]/10 flex items-center justify-center">
                        <div className="w-2 h-2 rounded-full bg-[#6366f1] animate-pulse"></div>
                    </div>
                </div>
            </div>
            <div className="glass-refined rounded-2xl p-6 border-t-4 border-[#e8d5b7] hover-lift">
                <h4 className="font-serif text-lg text-[#0a0a0f] mb-2">深度工作</h4>
                <p className="text-sm text-[#0a0a0f]/60 mb-4 leading-relaxed">周一至周五上午 · 专注研发</p>
                <div className="flex items-center justify-between">
                    <span className="text-2xl font-serif text-[#e8d5b7]">5 个时段</span>
                    <div className="w-8 h-8 rounded-full bg-[#e8d5b7]/10 flex items-center justify-center">
                        <div className="w-2 h-2 rounded-full bg-[#e8d5b7] animate-pulse"></div>
                    </div>
                </div>
            </div>
            <div className="glass-refined rounded-2xl p-6 border-t-4 border-[#10b981] hover-lift">
                <h4 className="font-serif text-lg text-[#0a0a0f] mb-2">身心平衡</h4>
                <p className="text-sm text-[#0a0a0f]/60 mb-4 leading-relaxed">周末家庭时光 · 数字排毒</p>
                <div className="flex items-center justify-between">
                    <span className="text-2xl font-serif text-[#10b981]">48 小时</span>
                    <div className="w-8 h-8 rounded-full bg-[#10b981]/10 flex items-center justify-center">
                        <div className="w-2 h-2 rounded-full bg-[#10b981] animate-pulse"></div>
                    </div>
                </div>
            </div>
        </div>

        <div className="mt-8 pt-6 border-t border-[#0a0a0f]/5 flex items-center justify-between text-sm text-[#0a0a0f]/50">
            <span>心栈将持续守护这些约定，在恰当的时刻给予你温柔的支持</span>
            <button className="flex items-center gap-2 hover:text-[#0a0a0f] transition-colors">
                <Briefcase className="w-4 h-4" />
                导出周计划
            </button>
        </div>
      </div>
    </div>
  );
}