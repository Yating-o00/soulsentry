import React, { useState, useRef, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { base44 } from "@/api/base44Client";
import { Mic, MicOff, Image as ImageIcon, Send, Sparkles, Smartphone, Watch, Glasses, Car, Home, Laptop, Check, Brain, MapPin, Zap, ChevronRight, Calendar as CalendarIcon, Database } from "lucide-react";
import { toast } from "sonner";
import "./SoulSentryHub.css";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { isToday, parseISO, format, isValid } from "date-fns";

export default function SoulSentryHub({ initialData, initialShowResults = false }) {
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [showResults, setShowResults] = useState(initialShowResults);
  const [parsingSteps, setParsingSteps] = useState([]);
  const [activeDevice, setActiveDevice] = useState("phone");
  
  // Default mock data structure
  const defaultData = {
    devices: {
      phone: { name: '智能手机', icon: Smartphone, strategies: [] },
      watch: { name: '智能手表', icon: Watch, strategies: [] },
      glasses: { name: '智能眼镜', icon: Glasses, strategies: [] },
      car: { name: '电动汽车', icon: Car, strategies: [] },
      home: { name: '智能家居', icon: Home, strategies: [] },
      pc: { name: '工作站', icon: Laptop, strategies: [] }
    },
    timeline: [],
    automations: []
  };

  const [data, setData] = useState(defaultData);

  // Fetch today's tasks from database
  const { data: dbTasks = [] } = useQuery({
    queryKey: ['tasks', 'today'],
    queryFn: async () => {
      const allTasks = await base44.entities.Task.list('-reminder_time');
      return allTasks.filter(t => t.reminder_time && isToday(parseISO(t.reminder_time)) && t.status !== 'completed');
    }
  });

  // Merge AI timeline with DB tasks
  const mergedTimeline = useMemo(() => {
    const aiItems = data.timeline || [];
    
    const dbItems = dbTasks.map(task => {
        let timeStr = "全天";
        if (task.reminder_time) {
            const date = parseISO(task.reminder_time);
            if (isValid(date)) {
                timeStr = format(date, 'HH:mm');
            }
        }

        return {
            time: timeStr,
            title: task.title,
            desc: task.description || "来自待办清单",
            icon: "📅", 
            highlight: task.priority === 'high' || task.priority === 'urgent',
            isDbTask: true,
            id: task.id
        };
    });

    // Combine and sort by time
    const combined = [...aiItems, ...dbItems].sort((a, b) => {
        if (a.time === "全天") return -1;
        if (b.time === "全天") return 1;
        return a.time.localeCompare(b.time);
    });

    return combined;
  }, [data.timeline, dbTasks]);

  // Merge Devices with DB tasks
  const mergedDevices = useMemo(() => {
    // Manually clone to preserve React components (icons)
    const devices = {};
    const sourceDevices = data.devices || defaultData.devices;
    
    Object.keys(sourceDevices).forEach(key => {
        devices[key] = { 
            ...sourceDevices[key],
            // Ensure icon is present (fallback to default if missing in data)
            icon: sourceDevices[key].icon || defaultData.devices[key]?.icon,
            strategies: [...(sourceDevices[key].strategies || [])]
        };
    });
    
    dbTasks.forEach(task => {
        // Simple heuristic for device assignment
        const text = (task.title + task.description).toLowerCase();
        let targetDevice = 'phone'; // Default
        
        if (/mail|email|ppt|doc|report|code|meeting|zoom|teams/.test(text)) targetDevice = 'pc';
        else if (/drive|car|traffic|go to|commute/.test(text)) targetDevice = 'car';
        else if (/run|walk|exercise|gym|heart|sleep/.test(text)) targetDevice = 'watch';
        else if (/home|clean|cook|laundry|living|bedroom/.test(text)) targetDevice = 'home';
        else if (/glass|ar|vr|vision/.test(text)) targetDevice = 'glasses';

        if (devices[targetDevice]) {
            let timeStr = "待定";
            if (task.reminder_time) {
                const date = parseISO(task.reminder_time);
                if (isValid(date)) timeStr = format(date, 'HH:mm');
            }

            devices[targetDevice].strategies.push({
                time: timeStr,
                method: "待办事项",
                content: task.title,
                priority: task.priority || 'medium',
                isDbTask: true,
                id: task.id
            });
            
            // Sort strategies by time
            devices[targetDevice].strategies.sort((a, b) => {
                 if (a.time === "待定") return 1;
                 if (b.time === "待定") return -1;
                 return a.time.localeCompare(b.time);
            });
        }
    });
    
    return devices;
  }, [data.devices, dbTasks]);

  useEffect(() => {
    if (initialData) {
      const mergedDevices = { ...defaultData.devices };
      
      if (initialData.devices) {
         // Create a lowercase map for case-insensitive matching
         const initialDevicesLower = {};
         Object.keys(initialData.devices).forEach(k => {
             initialDevicesLower[k.toLowerCase()] = initialData.devices[k];
         });

         Object.keys(mergedDevices).forEach(key => {
            const matchedData = initialDevicesLower[key.toLowerCase()];
            if (matchedData) {
               mergedDevices[key] = { 
                   ...mergedDevices[key], 
                   strategies: matchedData.strategies || [],
                   // Explicitly preserve icon and name
                   icon: mergedDevices[key]?.icon, 
                   name: mergedDevices[key]?.name 
               };
            }
         });
      }
      
      setData({
          devices: mergedDevices,
          timeline: initialData.timeline || [],
          automations: initialData.automations || []
      });
      setShowResults(true);
    }
  }, [initialData]);

  const autoResize = (e) => {
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
  };

  const handleQuickFill = (text) => {
    setInput(text);
  };

  const processIntent = async () => {
    if (!input.trim()) return;
    
    setIsProcessing(true);
    setParsingSteps([]);
    setShowResults(false);

    const steps = [
        { icon: Brain, text: '提取时间实体...', delay: 800 },
        { icon: Sparkles, text: '识别意图与优先级...', delay: 600 },
        { icon: MapPin, text: '空间计算与交通分析...', delay: 600 },
        { icon: Zap, text: '生成设备协同策略...', delay: 800 }
    ];

    let currentStep = 0;
    const stepInterval = setInterval(() => {
        if (currentStep < steps.length) {
            setParsingSteps(prev => [...prev, steps[currentStep]]);
            currentStep++;
        } else {
            clearInterval(stepInterval);
        }
    }, 800);

    try {
        const now = new Date();
        const existingTasksStr = dbTasks.map(t => `- ${t.title} (${t.reminder_time ? format(parseISO(t.reminder_time), 'HH:mm') : 'Anytime'})`).join('\n');

        const response = await base44.integrations.Core.InvokeLLM({
            prompt: `
            User Input: "${input}"
            Current Time: ${now.toLocaleString()}
            
            Existing User Tasks for Today:
            ${existingTasksStr}
            
            Task: Analyze the user's input and generate a structured "SoulSentry" plan for device coordination, timeline, and automation.
            Integrate the existing tasks into the plan where relevant (especially for device strategies and automations). 
            Be careful not to duplicate timeline events for existing tasks unless you are adding significant new context.
            
            IMPORTANT: All generated text (titles, descriptions, strategies, content, methods) MUST BE IN SIMPLIFIED CHINESE (简体中文).
            
            Return JSON in this EXACT structure:
            {
                "devices": {
                    "phone": { "strategies": [{"time": "string", "method": "string", "content": "string", "priority": "high|medium|low"}] },
                    "watch": { "strategies": [...] },
                    "glasses": { "strategies": [...] },
                    "car": { "strategies": [...] },
                    "home": { "strategies": [...] },
                    "pc": { "strategies": [...] }
                },
                "timeline": [
                    {"time": "HH:MM", "title": "string", "desc": "string", "icon": "string (emoji)", "highlight": boolean}
                ],
                "automations": [
                    {"title": "string", "desc": "string", "status": "active|ready|monitoring|pending", "icon": "string (emoji)"}
                ]
            }
            
            Generate realistic strategies for each device based on the input context. If a device isn't relevant, provide a neutral strategy or leave empty (but better to provide something smart).
            For automations, identify tasks that can be automated (booking, navigation, reminders, file prep).
            Ensure all content is friendly, concise, and in Simplified Chinese.
            `,
            response_json_schema: {
                type: "object",
                properties: {
                    devices: { type: "object" },
                    timeline: { type: "array", items: { type: "object" } },
                    automations: { type: "array", items: { type: "object" } }
                }
            }
        });

        // Create a fresh copy of devices ensuring icons are preserved
        // Note: We use a functional update to ensure we're basing this on the CURRENT data, 
        // which might already have DB tasks merged if the user didn't refresh
        // But for a new "processIntent" we want to start fresh from default + DB + new AI
        // Actually, we want to respect the defaultData structure but populate it with new strategies.
        
        const newDevicesState = {};
        Object.keys(defaultData.devices).forEach(k => {
            newDevicesState[k] = { ...defaultData.devices[k], strategies: [] };
        });

        if (response.devices) {
            Object.keys(response.devices).forEach(responseKey => {
                const targetKey = Object.keys(newDevicesState).find(k => k.toLowerCase() === responseKey.toLowerCase());
                if (targetKey) {
                    newDevicesState[targetKey].strategies = response.devices[responseKey].strategies || [];
                }
            });
        }

        setData({
            devices: newDevicesState,
            timeline: response.timeline || [],
            automations: response.automations || []
        });

        setTimeout(() => {
            clearInterval(stepInterval);
            setIsProcessing(false);
            setShowResults(true);
            toast.success("已为你生成情境触点与自动任务");
        }, 3500);

    } catch (error) {
        console.error(error);
        toast.error("分析失败，请重试");
        setIsProcessing(false);
        clearInterval(stepInterval);
    }
  };

  const DeviceCard = ({ id, device, active, onClick }) => {
    if (!device) return null;
    const Icon = device.icon || Smartphone;
    return (
        <div 
            onClick={() => onClick(id)}
            className={`
                relative rounded-xl p-4 text-center cursor-pointer transition-all duration-300 border
                ${active 
                    ? 'bg-[#384877] text-white border-[#384877] shadow-lg shadow-[#384877]/20 scale-105' 
                    : 'bg-white text-slate-600 border-slate-200 hover:border-[#384877]/30 hover:shadow-md'
                }
            `}
        >
            <div className={`
                w-10 h-10 mx-auto mb-3 rounded-lg flex items-center justify-center shadow-sm transition-colors
                ${active ? 'bg-white/10 text-white' : 'bg-slate-50 text-slate-600'}
            `}>
                <Icon className="w-5 h-5" />
            </div>
            <h4 className={`font-bold text-sm mb-1 ${active ? 'text-white' : 'text-slate-800'}`}>{device.name}</h4>
            <div className={`mt-2 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full ${active ? 'bg-white/10' : 'bg-green-50'}`}>
                <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${active ? 'bg-green-400' : 'bg-green-500'}`}></div>
                <span className={`text-[10px] font-medium ${active ? 'text-green-100' : 'text-green-600'}`}>在线</span>
            </div>
        </div>
    );
  };

  return (
    <div className="soul-sentry-root w-full mx-auto relative overflow-hidden bg-white rounded-3xl min-h-[800px] border border-slate-100 shadow-sm">
        {/* Background Effects */}
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#384877]/5 rounded-full blur-[100px] animate-breathe pointer-events-none" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-[#3b5aa2]/5 rounded-full blur-[100px] animate-breathe pointer-events-none" style={{ animationDelay: '3s' }} />

        <div className="relative z-10 p-6 md:p-12 flex flex-col items-center">
            
            {/* Input Section */}
            <motion.div 
                className={`w-full max-w-3xl transition-all duration-700 ${showResults ? 'opacity-0 h-0 overflow-hidden' : 'opacity-100'}`}
                animate={{ opacity: showResults ? 0 : 1, height: showResults ? 0 : 'auto' }}
            >
                <div className="text-center mb-10 space-y-4">
                    <h1 className="text-4xl md:text-5xl font-bold text-[#384877] tracking-tight">
                        告诉我，<br />
                        <span className="text-[#3b5aa2]">任何事情</span>
                    </h1>
                    <p className="text-slate-500">
                        像与朋友倾诉般自然。我会倾听、理解，<br />在所有设备上为你悄然安排妥当。
                    </p>
                </div>

                <div className="w-full relative group rounded-3xl transition-all duration-500">
                    <div className="absolute -inset-1 bg-gradient-to-r from-[#384877]/10 to-[#3b5aa2]/10 rounded-3xl blur opacity-30 group-hover:opacity-50 transition duration-1000" />
                    <div className="relative bg-white rounded-3xl p-2 border border-slate-200 shadow-sm">
                        <div className="bg-slate-50/50 rounded-2xl flex flex-col">
                            <textarea
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onInput={autoResize}
                                placeholder="明天下午三点和林总在望京SOHO见面，帮我提前准备好项目资料..."
                                className="w-full bg-transparent border-none outline-none text-lg text-slate-800 placeholder-slate-400 resize-none px-6 py-5 leading-relaxed scrollbar-hide min-h-[100px]"
                                disabled={isProcessing}
                            />
                            <div className="flex items-center justify-between px-4 pb-4">
                                <div className="flex gap-2">
                                    <button className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-[#384877] transition-colors">
                                        <Mic className="w-5 h-5" />
                                    </button>
                                    <button className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-[#384877] transition-colors">
                                        <ImageIcon className="w-5 h-5" />
                                    </button>
                                </div>
                                <button 
                                    onClick={processIntent}
                                    disabled={isProcessing || !input.trim()}
                                    className="px-6 py-2 rounded-full text-sm font-medium flex items-center gap-2 shadow-md disabled:opacity-50 bg-[#384877] text-white hover:bg-[#3b5aa2] transition-colors"
                                >
                                    {isProcessing ? '分析中...' : '发送'}
                                    {!isProcessing && <Send className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap justify-center gap-3 mt-8">
                    {['今晚8点给妈妈打电话', '下周二完成Q4报告', '明早7点飞深圳'].map(text => (
                        <button 
                            key={text}
                            onClick={() => handleQuickFill(text)}
                            className="px-4 py-2 bg-white rounded-full text-sm text-slate-600 hover:text-[#384877] border border-slate-200 hover:border-[#384877]/30 transition-all shadow-sm"
                        >
                            {text}
                        </button>
                    ))}
                </div>
            </motion.div>

            {/* Processing State */}
            <AnimatePresence>
                {isProcessing && (
                    <motion.div 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="w-full max-w-xl mt-8"
                    >
                        <div className="bg-white rounded-2xl p-6 border-l-4 border-[#384877] shadow-sm">
                            <div className="flex items-center gap-3 mb-6 text-slate-600">
                                <div className="flex gap-1.5">
                                    <div className="w-2 h-2 bg-[#384877] rounded-full animate-pulse" />
                                    <div className="w-2 h-2 bg-[#384877] rounded-full animate-pulse delay-75" />
                                    <div className="w-2 h-2 bg-[#384877] rounded-full animate-pulse delay-150" />
                                </div>
                                <span className="text-sm font-medium">心栈正在理解语境...</span>
                            </div>
                            <div className="space-y-4">
                                {parsingSteps.map((step, idx) => (
                                    step ? (
                                    <motion.div 
                                        key={idx}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        className="flex items-center gap-3 text-slate-600"
                                    >
                                        {step.icon && <step.icon className="w-5 h-5 text-[#384877]" />}
                                        <span className="text-sm flex-1">{step.text}</span>
                                        <Check className="w-4 h-4 text-[#10b981]" />
                                    </motion.div>
                                    ) : null
                                ))}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Results Section */}
            {showResults && (
                <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="w-full space-y-12 pb-20"
                >
                    {/* Header with Reset */}
                    <div className="flex justify-between items-end border-b border-slate-200 pb-4">
                        <div>
                            <h2 className="text-2xl font-bold text-[#384877]">已为你安排</h2>
                            <p className="text-sm text-slate-500">基于输入: "{input}"</p>
                        </div>
                        <button 
                            onClick={() => { setShowResults(false); setInput(""); }}
                            className="text-sm text-slate-500 hover:text-[#384877] hover:underline"
                        >
                            新对话
                        </button>
                    </div>

                    {/* Device Matrix */}
                    <section className="animate-fade-up">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-xl font-bold text-slate-800">全设备智能协同</h3>
                            <span className="px-3 py-1 bg-white rounded-full text-xs text-slate-500 border border-slate-200 shadow-sm">
                                <span className="w-1.5 h-1.5 bg-[#10b981] rounded-full inline-block mr-1.5 animate-pulse" />
                                云端同步正常
                            </span>
                        </div>
                        
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
                            {Object.entries(mergedDevices).map(([key, device]) => (
                                <DeviceCard 
                                    key={key} 
                                    id={key} 
                                    device={device} 
                                    active={activeDevice === key}
                                    onClick={setActiveDevice}
                                />
                            ))}
                        </div>

                        {/* Device Detail Panel */}
                        <AnimatePresence mode="wait">
                            <motion.div 
                                key={activeDevice}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm"
                            >
                                <div className="flex justify-between items-start mb-6">
                                    <div>
                                        <h4 className="text-lg font-bold text-slate-800">{mergedDevices[activeDevice].name} 策略</h4>
                                        <p className="text-sm text-slate-500 mt-1">基于场景的智能分发</p>
                                    </div>
                                </div>
                                <div className="grid gap-3">
                                    {mergedDevices[activeDevice].strategies && mergedDevices[activeDevice].strategies.length > 0 ? (
                                        mergedDevices[activeDevice].strategies.map((strat, idx) => (
                                            <div key={idx} className={`flex items-start gap-4 p-4 rounded-xl border transition-colors ${
                                                strat.isDbTask ? 'bg-amber-50 border-amber-100 hover:bg-amber-100/50' : 'bg-slate-50 border-slate-100 hover:bg-slate-100'
                                            }`}>
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                                                    strat.isDbTask ? 'bg-amber-100 text-amber-700' : 'bg-[#384877]/10 text-[#384877]'
                                                }`}>
                                                    {strat.isDbTask ? <Database className="w-4 h-4" /> : idx + 1}
                                                </div>
                                                <div className="flex-1">
                                                    <div className="flex justify-between items-start mb-1">
                                                        <span className="font-medium text-slate-700 text-sm">{strat.time}</span>
                                                        <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider ${
                                                            strat.isDbTask ? 'bg-amber-100 text-amber-700 border border-amber-200' :
                                                            strat.priority === 'high' ? 'bg-red-50 text-red-600 border border-red-100' : 
                                                            'bg-blue-50 text-[#384877] border border-blue-100'
                                                        }`}>
                                                            {strat.method}
                                                        </span>
                                                    </div>
                                                    <p className="text-slate-500 text-sm leading-relaxed">{strat.content}</p>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="text-center py-8 text-slate-400 text-sm">该设备暂无特定策略</div>
                                    )}
                                </div>
                            </motion.div>
                        </AnimatePresence>
                    </section>

                    {/* Timeline */}
                    <section className="animate-fade-up" style={{ animationDelay: '0.2s' }}>
                        <h3 className="text-xl font-bold text-slate-800 mb-6">情境感知时间线</h3>
                        <div className="bg-white rounded-3xl p-8 relative border border-slate-100 shadow-sm">
                            {mergedTimeline.length === 0 ? (
                                <div className="text-center text-slate-400 py-8">暂无日程安排</div>
                            ) : (
                                mergedTimeline.map((event, idx) => (
                                    <div key={idx} className="timeline-item relative pl-12 pb-8 last:pb-0 group cursor-pointer">
                                        <div className="timeline-line bg-slate-100"></div>
                                        <div className={`absolute left-0 top-0 w-12 h-12 rounded-full ${
                                            event.isDbTask ? 'bg-amber-50 border-amber-100' : 
                                            event.highlight ? 'bg-[#384877]/10 border-[#384877]/20' : 'bg-slate-50 border-slate-100'
                                        } flex items-center justify-center text-2xl border shadow-sm z-10 group-hover:scale-110 transition-transform`}>
                                            {event.icon}
                                        </div>
                                        <div className="pt-2">
                                            <div className="flex items-center gap-3 mb-1 flex-wrap">
                                                <span className="font-mono text-slate-400 text-sm">{event.time}</span>
                                                <h4 className={`font-bold text-lg ${
                                                    event.isDbTask ? 'text-slate-800' : 
                                                    event.highlight ? 'text-[#384877]' : 'text-slate-700'
                                                }`}>{event.title}</h4>
                                                
                                                {event.isDbTask && (
                                                    <span className="flex items-center gap-1 px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[10px] rounded-md font-medium border border-amber-200">
                                                        <Database className="w-3 h-3" />
                                                        <span>已有日程</span>
                                                    </span>
                                                )}
                                                
                                                {!event.isDbTask && event.highlight && (
                                                    <span className="px-2 py-0.5 bg-[#384877]/10 text-[#384877] text-[10px] rounded-full font-medium">重点</span>
                                                )}
                                            </div>
                                            <p className="text-slate-500 text-sm leading-relaxed max-w-md">{event.desc}</p>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </section>

                    {/* Automations */}
                    <section className="animate-fade-up" style={{ animationDelay: '0.3s' }}>
                        <div className="flex items-center gap-3 mb-6">
                            <h3 className="text-xl font-bold text-slate-800">自动执行清单</h3>
                            <span className="px-2.5 py-0.5 bg-slate-100 text-slate-600 text-xs rounded-full border border-slate-200">
                                {data.automations.length} 项待执行
                            </span>
                        </div>
                        <div className="grid md:grid-cols-2 gap-4">
                            {data.automations.map((task, idx) => (
                                <div key={idx} className="bg-white rounded-2xl p-5 border border-slate-100 hover:border-[#384877]/30 hover:shadow-md transition-all group">
                                    <div className="flex items-start justify-between mb-3">
                                        <div className="flex items-center gap-3">
                                            <span className="text-2xl">{task.icon}</span>
                                            <div>
                                                <h4 className="font-medium text-slate-800 text-sm mb-0.5">{task.title}</h4>
                                                <div className="flex items-center gap-2">
                                                    <div className={`w-1.5 h-1.5 rounded-full ${
                                                        task.status === 'active' ? 'bg-[#10b981] animate-pulse' :
                                                        task.status === 'ready' ? 'bg-[#384877]' : 'bg-amber-400'
                                                    }`} />
                                                    <span className="text-[10px] text-slate-400 uppercase tracking-wider">{task.status}</span>
                                                </div>
                                            </div>
                                        </div>
                                        {task.status === 'ready' && (
                                            <button 
                                                onClick={() => toast.success(`${task.title} 已开始执行`)}
                                                className="px-3 py-1.5 bg-[#384877] text-white text-xs rounded-full hover:bg-[#3b5aa2] transition-colors shadow-sm"
                                            >
                                                执行
                                            </button>
                                        )}
                                    </div>
                                    <p className="text-slate-500 text-sm leading-relaxed">{task.desc}</p>
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