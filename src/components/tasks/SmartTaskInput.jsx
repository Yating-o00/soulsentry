import React, { useState, useRef, useEffect } from 'react';
import { 
  PlusCircle, Mic, Wand2, Bell, Repeat, 
  MapPin, Clock, Briefcase, ShoppingBag, Heart,
  X, Loader2, Sparkles, Navigation, Sunset, Moon, Sunrise, Home
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { base44 } from '@/api/base44Client';
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import _ from 'lodash';

export default function SmartTaskInput({ onTaskCreate }) {
  const [input, setInput] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [parsedData, setParsedData] = useState(null);
  const inputRef = useRef(null);
  const { toast } = useToast();

  // Debounced analysis to avoid too many API calls
  const debouncedAnalyze = useRef(
    _.debounce(async (text) => {
      if (text.length < 3) {
        setParsedData(null);
        return;
      }
      
      setIsAnalyzing(true);
      try {
        const response = await base44.integrations.Core.InvokeLLM({
          prompt: `Analyze the following task input and extract structured data. 
          Input: "${text}"
          
          Context: User is in China (Asia/Shanghai). Current time is ${new Date().toLocaleString()}.
          
          Return a JSON object with:
          - title: The main task content
          - description: Additional details if any
          - priority: "low", "medium", "high", or "urgent"
          - category: "work", "personal", "health", "study", "family", "shopping", "finance", "other" (default to personal if unclear)
          - trigger_type: "time", "location", or "auto"
          - trigger_label: Short label for the trigger (e.g., "下班前", "到家时")
          - trigger_icon: Suggest a Lucide icon name (e.g., "clock", "map-pin", "sunset")
          - smart_tags: Array of strings for UI tags (e.g., ["购买", "生活"])
          - suggestion: A friendly, short suggestion about this task (e.g., "Detecting you might pass by the supermarket")
          
          If the input implies a location (like "home", "office", "supermarket"), set trigger_type to "location".
          `,
          response_json_schema: {
            type: "object",
            properties: {
              title: { type: "string" },
              description: { type: "string" },
              priority: { type: "string" },
              category: { type: "string" },
              trigger_type: { type: "string" },
              trigger_label: { type: "string" },
              trigger_icon: { type: "string" },
              smart_tags: { type: "array", items: { type: "string" } },
              suggestion: { type: "string" }
            }
          }
        });
        
        setParsedData(response);
      } catch (error) {
        console.error("Analysis failed:", error);
      } finally {
        setIsAnalyzing(false);
      }
    }, 1000)
  ).current;

  useEffect(() => {
    debouncedAnalyze(input);
  }, [input]);

  const handleCreate = async () => {
    if (!input.trim()) return;
    
    // If we have parsed data, use it, otherwise use raw input
    const taskData = parsedData || {
      title: input,
      category: 'personal',
      priority: 'medium',
      smart_tags: []
    };

    try {
      if (onTaskCreate) {
        await onTaskCreate(taskData);
      }
      
      setInput('');
      setParsedData(null);
      toast({
        title: "约定已建立",
        description: "我会在合适的时机温柔地提醒你 💫",
        className: "bg-stone-800 text-white border-none"
      });
    } catch (error) {
      toast({
        title: "创建失败",
        description: "请稍后重试",
        variant: "destructive"
      });
    }
  };

  const handleQuickInput = (text) => {
    setInput(text);
    inputRef.current?.focus();
  };

  const getCategoryColor = (cat) => {
    switch(cat) {
      case 'work': return 'blue';
      case 'health': return 'rose';
      case 'love': return 'rose';
      default: return 'green';
    }
  };

  const TriggerIcon = ({ name, className }) => {
    const icons = {
      clock: Clock,
      'map-pin': MapPin,
      sunset: Sunset,
      moon: Moon,
      sunrise: Sunrise,
      home: Home,
      navigation: Navigation,
      sparkles: Sparkles,
      default: Sparkles
    };
    const Icon = icons[name] || icons.default;
    return <Icon className={className} />;
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white/70 backdrop-blur-xl border border-white/50 rounded-3xl p-6 shadow-lg mb-8"
    >
      <div className="mb-4">
        <h2 className="font-serif text-lg font-semibold text-stone-800 mb-1">新的约定</h2>
        <p className="text-sm text-stone-500">告诉我你想记住什么，我会理解时间、地点和情境</p>
      </div>

      <div className="relative mb-4">
        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400">
          <PlusCircle className="w-5 h-5" />
        </div>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          placeholder="试试说：下班前买一桶油回家、明天早上记得浇花..."
          className={cn(
            "w-full pl-12 pr-32 py-4 bg-white border border-stone-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-green-400/50 text-stone-700 placeholder-stone-400 text-base transition-all shadow-sm",
            isAnalyzing && "border-green-300"
          )}
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex gap-2">
          <button 
            onClick={() => setIsListening(!isListening)}
            className={cn(
              "p-2 hover:bg-stone-100 rounded-xl transition-colors text-stone-500 relative",
              isListening && "text-green-600 bg-green-50"
            )} 
          >
            <Mic className="w-5 h-5" />
            {isListening && (
              <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
              </span>
            )}
          </button>
          <button 
            onClick={handleCreate}
            disabled={!input.trim()}
            className="px-4 py-2 bg-stone-800 text-white rounded-xl hover:bg-stone-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            记住
          </button>
        </div>
      </div>

      <AnimatePresence>
        {isListening && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mb-4 p-4 bg-green-50 rounded-xl flex items-center gap-3">
              <div className="flex items-center gap-1 h-5">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div 
                    key={i}
                    className="w-1 bg-[#A8B5A0] rounded-full animate-[wave_1s_ease-in-out_infinite]"
                    style={{ 
                      height: [8, 16, 12, 20, 10][i-1],
                      animationDelay: `${i * 0.1}s`
                    }}
                  />
                ))}
              </div>
              <span className="text-sm text-green-700">正在聆听... (模拟功能)</span>
              <button onClick={() => setIsListening(false)} className="ml-auto text-green-600 hover:text-green-800">
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {(isAnalyzing || parsedData) && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="p-4 bg-gradient-to-r from-green-50/50 to-blue-50/30 rounded-xl border border-green-100"
          >
            {isAnalyzing ? (
              <div className="flex items-center gap-2 text-stone-500 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>AI 正在理解你的意图...</span>
              </div>
            ) : (
              parsedData && (
                <>
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                      <Wand2 className="w-4 h-4 text-green-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-stone-600 mb-1">我理解你的约定是：</p>
                      <p className="text-stone-800 font-medium">{parsedData.title}</p>
                      {parsedData.suggestion && (
                        <p className="text-xs text-stone-500 mt-1">{parsedData.suggestion}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 mb-3">
                    {parsedData.trigger_label && (
                      <span className="px-3 py-1.5 bg-white border border-stone-200 rounded-full text-xs flex items-center gap-1.5 shadow-sm text-stone-700">
                        <TriggerIcon name={parsedData.trigger_icon} className="w-3.5 h-3.5 text-stone-500" />
                        {parsedData.trigger_label}
                      </span>
                    )}
                    <span className={cn(
                      "px-3 py-1.5 border rounded-full text-xs flex items-center gap-1.5 shadow-sm capitalize",
                      `bg-${getCategoryColor(parsedData.category)}-50 border-${getCategoryColor(parsedData.category)}-200 text-${getCategoryColor(parsedData.category)}-700`
                    )}>
                      {parsedData.category === 'life' ? '生活' : 
                       parsedData.category === 'work' ? '工作' : 
                       parsedData.category === 'health' ? '健康' : '其他'}
                    </span>
                    {parsedData.smart_tags?.map((tag, i) => (
                      <span key={i} className="px-3 py-1.5 bg-white border border-stone-200 rounded-full text-xs text-stone-600 shadow-sm">
                        {tag}
                      </span>
                    ))}
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2 text-stone-600">
                      <Bell className="w-4 h-4 text-amber-500" />
                      <span>提醒方式：</span>
                      <select className="bg-white border border-stone-200 rounded-lg px-2 py-1 text-xs focus:outline-none">
                        <option>智能选择</option>
                        <option>准时提醒</option>
                        <option>提前15分钟</option>
                        <option>到达地点时</option>
                      </select>
                    </div>
                  </div>
                </>
              )
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-4 flex flex-wrap gap-2">
        <span className="text-xs text-stone-400 py-1">快捷：</span>
        {['下班前记得买...', '明天早上...', '到家后...', '每周日...', '到超市时提醒我...'].map((text) => (
          <button 
            key={text}
            onClick={() => handleQuickInput(text.replace('...', ''))}
            className="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 rounded-full text-xs text-stone-600 transition-colors"
          >
            {text}
          </button>
        ))}
      </div>
    </motion.div>
  );
}