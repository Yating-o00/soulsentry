import React, { useState, useEffect, useRef, useCallback } from "react";
import { 
  Wand2, 
  Target, 
  Sunset, 
  Sunrise, 
  ShoppingBag, 
  Sparkles,
  ListTodo,
  Leaf,
  Mic,
  MicOff
} from "lucide-react";
import { cn } from "@/lib/utils";
import { base44 } from "@/api/base44Client";
import { Loader2 } from "lucide-react";

export default function UnifiedTaskInput({ onAddTask, value: propValue, onChange }) {
  const [internalValue, setInternalValue] = useState("");
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef(null);
  
  const value = propValue !== undefined ? propValue : internalValue;
  
  const handleChange = (e) => {
    const newValue = e.target.value;
    if (onChange) {
      onChange(newValue);
    } else {
      setInternalValue(newValue);
    }
  };
  
  const handleClear = () => {
    if (onChange) {
      onChange("");
    } else {
      setInternalValue("");
    }
  };

  const handleVoiceInput = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'zh-CN';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognitionRef.current = recognition;

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      const newValue = value ? value + transcript : transcript;
      if (onChange) onChange(newValue);
      else setInternalValue(newValue);
    };
    recognition.start();
  };

  const [mode, setMode] = useState("auto"); // 'auto', 'milestone', 'life'
  const [previewTags, setPreviewTags] = useState([]);
  const [showPreview, setShowPreview] = useState(false);
  const [isAiAnalyzing, setIsAiAnalyzing] = useState(false);
  const aiTimerRef = useRef(null);

  const analyzeWithAI = useCallback(async (text) => {
    if (!text || text.trim().length < 4) {
      setShowPreview(false);
      setPreviewTags([]);
      return;
    }
    setIsAiAnalyzing(true);
    setShowPreview(true);
    try {
      const { data: resp } = await base44.functions.invoke('callAI', {
        prompt: `分析以下用户输入的任务意图，返回标签列表。
用户输入："${text}"
规则：
- 识别任务类型（里程碑/生活/工作/健康/学习/购物/社交）
- 识别时间信息（今天/明天/本周/具体日期）
- 识别优先级（紧急/高/中/低）
- 识别场景触发器（下班后/到家后/早上等）
返回2-4个最相关的标签。`,
        response_json_schema: {
          type: "object",
          properties: {
            tags: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  text: { type: "string" },
                  category: { type: "string", enum: ["milestone", "life", "work", "health", "study", "shopping", "social", "time", "priority", "trigger"] }
                },
                required: ["text", "category"]
              }
            }
          },
          required: ["tags"]
        }
      });
      const aiTags = (resp?.data?.tags || []).map(t => {
        const iconMap = { milestone: Target, time: Sunrise, priority: Sparkles, trigger: Sunset, shopping: ShoppingBag, life: Leaf, work: ListTodo, health: Sparkles, study: ListTodo, social: Sparkles };
        const colorMap = { milestone: 'bg-blue-50 text-blue-700', time: 'bg-amber-50 text-amber-700', priority: 'bg-red-50 text-red-700', trigger: 'bg-green-50 text-green-700', shopping: 'bg-purple-50 text-purple-700', life: 'bg-stone-50 text-stone-600', work: 'bg-indigo-50 text-indigo-700', health: 'bg-emerald-50 text-emerald-700', study: 'bg-amber-50 text-amber-700', social: 'bg-pink-50 text-pink-700' };
        return { icon: iconMap[t.category] || Sparkles, text: t.text, color: colorMap[t.category] || 'bg-stone-50 text-stone-600' };
      });
      setPreviewTags(aiTags.length > 0 ? aiTags : [{ icon: Sparkles, text: '智能安排', color: 'bg-stone-50 text-stone-600' }]);
    } catch (e) {
      console.error('AI analysis failed:', e);
      setPreviewTags([{ icon: Sparkles, text: '智能安排', color: 'bg-stone-50 text-stone-600' }]);
    } finally {
      setIsAiAnalyzing(false);
    }
  }, []);

  useEffect(() => {
    if (aiTimerRef.current) clearTimeout(aiTimerRef.current);
    if (!value || value.trim().length < 4) {
      setShowPreview(false);
      setPreviewTags([]);
      return;
    }
    aiTimerRef.current = setTimeout(() => analyzeWithAI(value), 800);
    return () => { if (aiTimerRef.current) clearTimeout(aiTimerRef.current); };
  }, [value, analyzeWithAI]);

  const handleSubmit = () => {
    if (!value.trim()) return;

    let category = 'personal';
    let priority = 'medium';

    if (mode === 'milestone') {
      category = 'work';
      priority = 'high';
    } else if (mode === 'life') {
      category = 'personal';
    } else {
       // Auto-detect based on preview tags logic
       if (value.includes('完成') || value.includes('提交') || value.includes('规划')) {
         category = 'work';
         priority = 'high';
       }
    }

    onAddTask({
      title: value,
      category,
      priority,
      status: 'pending',
      reminder_time: new Date().toISOString()
    });
    
    handleClear();
    setShowPreview(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  };

  return (
    <div className="bg-white rounded-3xl p-2 shadow-sm border border-slate-100 transition-all focus-within:ring-4 focus-within:ring-slate-100 focus-within:border-slate-200">
      <div className="flex items-center gap-2 p-2">
        <div className="flex-1 relative">
          <div className="absolute left-3 top-1/2 -translate-y-1/2">
            <button
              type="button"
              onClick={handleVoiceInput}
              className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200",
                isListening
                  ? "bg-red-100 text-red-500 animate-pulse shadow-sm shadow-red-200"
                  : "text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              )}
              title={isListening ? "点击停止" : "语音输入"}
            >
              {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
          </div>
          <input 
            type="text" 
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="告诉我你想记住什么，无论是重要目标还是生活小事..."
            className="w-full pl-12 pr-4 py-3.5 rounded-2xl text-slate-700 placeholder-slate-400 focus:outline-none bg-transparent"
          />
        </div>
        <div className="flex items-center gap-1 pr-2">
          <button 
            onClick={() => setMode('milestone')} 
            className={cn(
              "px-3 py-2 rounded-xl text-xs font-medium transition-colors border border-transparent flex items-center gap-1",
              mode === 'milestone' ? "bg-[#384877] text-white" : "text-slate-500 hover:bg-slate-50"
            )}
          >
            <ListTodo className="w-3.5 h-3.5" /> 严肃
          </button>
          <button 
            onClick={() => setMode('life')} 
            className={cn(
              "px-3 py-2 rounded-xl text-xs font-medium transition-colors border border-transparent flex items-center gap-1",
              mode === 'life' ? "bg-[#384877] text-white" : "text-slate-500 hover:bg-slate-50"
            )}
          >
            <Leaf className="w-3.5 h-3.5" /> 生活
          </button>
          <button 
            onClick={handleSubmit} 
            className="ml-2 px-5 py-2.5 bg-[#384877] text-white rounded-xl text-sm font-medium hover:bg-[#2c3a63] transition-colors shadow-lg shadow-blue-900/10"
          >
            记住
          </button>
        </div>
      </div>
      
      {/* Smart Analysis Preview */}
      {showPreview && (
        <div className="px-4 pb-4 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="mt-2 p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-start gap-3">
            {isAiAnalyzing ? (
              <Loader2 className="w-4 h-4 text-[#384877] mt-0.5 animate-spin" />
            ) : (
              <Wand2 className="w-4 h-4 text-stone-400 mt-0.5" />
            )}
            <div className="flex-1">
              <p className="text-xs text-stone-500 mb-2 font-medium flex items-center gap-1.5">
                {isAiAnalyzing ? 'Kimi 分析中…' : 'AI理解：'}
                <span className="text-[10px] text-slate-300 font-normal">powered by Kimi</span>
              </p>
              {!isAiAnalyzing && (
              <div className="flex flex-wrap gap-2">
                {previewTags.map((tag, idx) => {
                  const Icon = tag.icon;
                  return (
                    <span key={idx} className={cn("px-2.5 py-1 text-xs rounded-full flex items-center gap-1", tag.color)}>
                      <Icon className="w-3 h-3" />
                      {tag.text}
                    </span>
                  );
                })}
              </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}