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
  AlertCircle,
  Smartphone,
  Watch,
  Glasses,
  Car,
  Home,
  Laptop,
  Sparkles,
  Calendar as CalendarIcon,
  RefreshCcw,
  Zap,
  MoreHorizontal
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { base44 } from "@/api/base44Client";

// 模拟数据：全设备智能协同
const DEVICE_MATRIX = [
  { id: 'phone', name: '智能手机', icon: Smartphone, color: 'bg-[#384877]', status: '在线', activity: '主控终端' },
  { id: 'watch', name: '智能手表', icon: Watch, color: 'bg-[#384877]', status: '在线', activity: '健康监测' }, // Dark blue as per screenshot? Actually screenshot shows specific colors.
  // Let's match screenshot colors approximately
  // Phone: Blue-ish dark. Watch: Dark Blue. Glasses: Purple. Car: Green. Home: Orange. Workstation: Pink/Red.
  { id: 'glasses', name: '智能眼镜', icon: Glasses, color: 'bg-purple-600', status: '在线', activity: 'AR 助手' },
  { id: 'car', name: '电动汽车', icon: Car, color: 'bg-emerald-600', status: '在线', activity: '移动办公' },
  { id: 'home', name: '智能家居', icon: Home, color: 'bg-orange-500', status: '在线', activity: '环境控制' },
  { id: 'pc', name: '工作站', icon: Laptop, color: 'bg-rose-500', status: '在线', activity: '深度工作' },
];

const PROCESSING_STEPS = [
  { icon: '📅', text: '正在解析时间意图...' },
  { icon: '🤖', text: '调度设备协同策略...' },
  { icon: '✨', text: '生成周视图规划...' }
];

export default function SoulWeekPlanner({ currentDate: initialDate }) {
  const [stage, setStage] = useState('input'); // input, processing, results
  const [userInput, setUserInput] = useState('');
  const [currentWeekDate, setCurrentWeekDate] = useState(initialDate || new Date());
  const [user, setUser] = useState({ full_name: '用户' });
  const [processingStep, setProcessingStep] = useState(0);
  
  // Fetch user info
  useEffect(() => {
    base44.auth.me().then(u => {
        if (u) setUser(u);
    }).catch(() => {});
  }, []);

  const start = startOfWeek(currentWeekDate, { locale: zhCN, weekStartsOn: 1 });
  const end = endOfWeek(currentWeekDate, { locale: zhCN, weekStartsOn: 1 });

  const handleProcess = async () => {
    if (!userInput.trim()) return;
    
    setStage('processing');
    
    // Simulate steps
    for (let i = 0; i < PROCESSING_STEPS.length; i++) {
        setProcessingStep(i);
        await new Promise(r => setTimeout(r, 800));
    }
    
    setStage('results');
    toast.success("已为你安排本周计划");
  };

  const getTimeGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 6) return "凌晨好";
    if (hour < 12) return "上午好";
    if (hour < 14) return "中午好";
    if (hour < 18) return "下午好";
    return "晚上好";
  };

  return (
    <div className="min-h-screen bg-[#f8f9fa] p-4 md:p-8 font-sans text-slate-900 pb-32">
        <div className="max-w-6xl mx-auto space-y-10">
            
            {/* 1. Header & Stats Section (Matches Screenshot 2) */}
            <section className="animate-fade-up">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
                    <div>
                        <h1 className="text-3xl md:text-4xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                            {getTimeGreeting()}，{user.full_name || '设计师'} <span className="text-amber-400">☀</span>
                        </h1>
                        <p className="text-slate-500 mt-2 text-base font-medium">
                            今天是 {format(new Date(), 'yyyy年MM月dd日 EEEE', { locale: zhCN })}
                        </p>
                    </div>
                    
                    <div className="flex gap-3">
                        <Button className="bg-[#384877] hover:bg-[#2c3a63] text-white shadow-lg shadow-indigo-900/10 rounded-xl px-6">
                            <MoreHorizontal className="w-4 h-4 mr-2" /> 概览
                        </Button>
                        <Button variant="outline" className="bg-white border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl px-6">
                            <CalendarIcon className="w-4 h-4 mr-2" /> 日历
                        </Button>
                    </div>
                </div>

                {/* Stats Cards Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Blue Card - Today's Todo */}
                    <div className="stats-card-primary group cursor-pointer transition-transform hover:-translate-y-1">
                        <div className="absolute right-0 top-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -mr-10 -mt-10 transition-transform group-hover:scale-110"></div>
                        <div className="absolute right-4 top-4 opacity-20">
                            <Sparkles className="w-12 h-12" />
                        </div>
                        
                        <h3 className="text-indigo-100 text-sm font-medium mb-4">本周待办</h3>
                        <div className="text-5xl font-bold mb-6 tracking-tight">8</div>
                        
                        <div className="w-full bg-indigo-900/30 h-1.5 rounded-full overflow-hidden">
                            <div className="bg-white h-full w-[20%] rounded-full"></div>
                        </div>
                        <div className="flex justify-between text-xs text-indigo-200 mt-2">
                            <span>进度 20%</span>
                            <span>剩余 6 项</span>
                        </div>
                    </div>

                    {/* White Card - Overdue */}
                    <div className="stats-card-white group cursor-pointer hover:border-red-100 transition-all">
                        <div className="flex justify-between items-start mb-4">
                            <h3 className="text-slate-500 text-sm font-medium">逾期约定</h3>
                            <AlertCircle className="w-5 h-5 text-red-500" />
                        </div>
                        <div className="text-5xl font-bold text-slate-900 mb-2">15</div>
                        <p className="text-sm text-slate-400">需要尽快处理</p>
                    </div>

                    {/* White Card - Completed */}
                    <div className="stats-card-white group cursor-pointer hover:border-emerald-100 transition-all">
                        <div className="flex justify-between items-start mb-4">
                            <h3 className="text-slate-500 text-sm font-medium">本周已完成</h3>
                            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                        </div>
                        <div className="text-5xl font-bold text-slate-900 mb-2">3</div>
                        <p className="text-sm text-slate-400">保持这个节奏！</p>
                    </div>
                </div>
            </section>

            {/* 2. Intelligent Planning Section (Matches Screenshot 1 Header Style) */}
            <section className="space-y-6">
                <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                     <div>
                        <h2 className="text-2xl font-bold text-slate-900">已为你安排</h2>
                        <p className="text-slate-500 text-sm mt-1">
                            {userInput ? `基于输入: "${userInput.substring(0, 20)}..."` : "输入本周目标，智能生成全设备协同计划"}
                        </p>
                     </div>
                     <Button 
                        variant="ghost" 
                        onClick={() => {
                            setStage('input');
                            setUserInput('');
                        }}
                        className="text-slate-400 hover:text-slate-600"
                    >
                        新对话
                     </Button>
                </div>

                <AnimatePresence mode="wait">
                    {stage === 'input' && (
                        <motion.div 
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="bg-white rounded-3xl p-1 shadow-sm border border-slate-100"
                        >
                            <div className="relative">
                                <Textarea 
                                    value={userInput}
                                    onChange={(e) => setUserInput(e.target.value)}
                                    placeholder="告诉我本周的安排，例如：周一到周三在深圳出差，周五全天深度工作..."
                                    className="w-full bg-slate-50 border-none rounded-[20px] p-6 text-lg min-h-[120px] resize-none focus:ring-0 placeholder:text-slate-400"
                                />
                                <div className="absolute bottom-4 right-4 flex gap-2">
                                     <Button size="icon" variant="ghost" className="text-slate-400 hover:bg-white">
                                        <Mic className="w-5 h-5" />
                                     </Button>
                                     <Button size="icon" variant="ghost" className="text-slate-400 hover:bg-white">
                                        <ImageIcon className="w-5 h-5" />
                                     </Button>
                                     <Button 
                                        onClick={handleProcess}
                                        disabled={!userInput.trim()}
                                        className="bg-[#384877] hover:bg-[#2c3a63] text-white rounded-xl px-6 ml-2"
                                     >
                                        生成规划
                                     </Button>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {stage === 'processing' && (
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="bg-white rounded-3xl p-12 text-center border border-slate-100"
                        >
                            <div className="flex flex-col items-center gap-4">
                                <div className="w-12 h-12 bg-indigo-50 rounded-full flex items-center justify-center animate-spin">
                                    <RefreshCcw className="w-6 h-6 text-indigo-600" />
                                </div>
                                <p className="text-slate-600 font-medium">{PROCESSING_STEPS[processingStep].text}</p>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </section>

            {/* 3. Device Coordination (Matches Screenshot 1 Device Grid) */}
            {(stage === 'results' || stage === 'input') && (
                <section>
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-xl font-bold text-slate-900">全设备智能协同</h2>
                        <div className="bg-white border border-slate-200 rounded-full px-3 py-1 flex items-center gap-2 shadow-sm">
                            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                            <span className="text-xs text-slate-500 font-medium">云端同步正常</span>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
                        {DEVICE_MATRIX.map((device) => {
                            const Icon = device.icon;
                            return (
                                <motion.div 
                                    key={device.id}
                                    whileHover={{ y: -4 }}
                                    className="device-card group"
                                >
                                    <div className={cn(
                                        "w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-lg transition-transform group-hover:scale-110",
                                        device.color
                                    )}>
                                        <Icon className="w-7 h-7" />
                                    </div>
                                    <h3 className="font-bold text-slate-800 text-base">{device.name}</h3>
                                    <div className="badge-online">
                                        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                                        在线
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>
                </section>
            )}
            
        </div>
    </div>
  );
}