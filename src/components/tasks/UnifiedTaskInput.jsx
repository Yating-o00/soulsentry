import React, { useState, useEffect, useRef, useCallback } from "react";
import { ListTodo, Leaf, Mic, MicOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { deepSemanticParse } from "@/components/utils/semanticParser";
import SemanticPreview from "./SemanticPreview";

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
  const [semanticAnalysis, setSemanticAnalysis] = useState(null);
  const [isAiAnalyzing, setIsAiAnalyzing] = useState(false);
  const aiTimerRef = useRef(null);

  const analyzeWithAI = useCallback(async (text) => {
    if (!text || text.trim().length < 3) {
      setSemanticAnalysis(null);
      return;
    }
    setIsAiAnalyzing(true);
    try {
      const result = await deepSemanticParse(text, { enableSmartComplete: true });
      setSemanticAnalysis(result);
    } catch (e) {
      console.error('Semantic analysis failed:', e);
      setSemanticAnalysis(null);
    } finally {
      setIsAiAnalyzing(false);
    }
  }, []);

  useEffect(() => {
    if (aiTimerRef.current) clearTimeout(aiTimerRef.current);
    if (!value || value.trim().length < 3) {
      setSemanticAnalysis(null);
      return;
    }
    aiTimerRef.current = setTimeout(() => analyzeWithAI(value), 1000);
    return () => { if (aiTimerRef.current) clearTimeout(aiTimerRef.current); };
  }, [value, analyzeWithAI]);

  const handleSuggestionAccept = (suggestion) => {
    if (suggestion.auto_fill) {
      const newValue = value + " " + suggestion.auto_fill;
      if (onChange) onChange(newValue);
      else setInternalValue(newValue);
    }
  };

  const handleSubmit = () => {
    if (!value.trim()) return;

    let category = 'personal';
    let priority = 'medium';
    let reminderTime = new Date().toISOString();
    let tags = [];
    let title = value;
    let description = "";

    // Use semantic analysis if available
    if (semanticAnalysis) {
      category = semanticAnalysis.category || category;
      priority = semanticAnalysis.priority || priority;
      title = semanticAnalysis.refined_title || value;
      description = semanticAnalysis.refined_description || "";
      tags = semanticAnalysis.tags || [];
      
      // Use resolved time from analysis
      const highConfTime = semanticAnalysis.time_entities?.find(t => t.resolved_datetime && t.time_confidence !== "low");
      if (highConfTime?.resolved_datetime) {
        const parsed = new Date(highConfTime.resolved_datetime);
        if (!isNaN(parsed.getTime())) reminderTime = parsed.toISOString();
      }

      // Add people and locations as tags
      semanticAnalysis.people?.forEach(p => { if (p.name) tags.push("@" + p.name); });
      semanticAnalysis.locations?.forEach(l => { if (l.name) tags.push("📍" + l.name); });
    }

    // Mode override
    if (mode === 'milestone') { category = 'work'; priority = 'high'; }
    else if (mode === 'life') { category = 'personal'; }

    onAddTask({
      title,
      description,
      category,
      priority,
      status: 'pending',
      reminder_time: reminderTime,
      tags: tags.length > 0 ? tags : undefined,
      _semantic: semanticAnalysis // pass full analysis for downstream use
    });
    
    handleClear();
    setSemanticAnalysis(null);
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
      
      {/* Deep Semantic Preview */}
      {(isAiAnalyzing || semanticAnalysis) && (
        <SemanticPreview 
          analysis={semanticAnalysis} 
          isLoading={isAiAnalyzing} 
          onSuggestionAccept={handleSuggestionAccept}
        />
      )}
    </div>
  );
}