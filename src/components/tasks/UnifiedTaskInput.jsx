import React, { useState, useEffect } from "react";
import { 
  PlusCircle, 
  Wand2, 
  Target, 
  Sunset, 
  Sunrise, 
  ShoppingBag, 
  Sparkles,
  ListTodo,
  Leaf
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function UnifiedTaskInput({ onAddTask, value: propValue, onChange }) {
  const [internalValue, setInternalValue] = useState("");
  
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
  const [mode, setMode] = useState("auto"); // 'auto', 'milestone', 'life'
  const [previewTags, setPreviewTags] = useState([]);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    if (value.length < 2) {
      setShowPreview(false);
      return;
    }

    // Simple analysis logic
    const tags = [];
    let detectedType = 'life';

    if (value.includes('周五') || value.includes('完成') || value.includes('提交') || value.includes('规划')) {
      detectedType = 'milestone';
      tags.push({ icon: Target, text: '里程碑', color: 'bg-blue-50 text-blue-700' });
    }
    
    if (value.includes('下班')) tags.push({ icon: Sunset, text: '下班触发', color: 'bg-green-50 text-green-700' });
    if (value.includes('明天')) tags.push({ icon: Sunrise, text: '明天', color: 'bg-amber-50 text-amber-700' });
    if (value.includes('买')) tags.push({ icon: ShoppingBag, text: '购买', color: 'bg-purple-50 text-purple-700' });
    
    if (tags.length === 0) {
      tags.push({ icon: Sparkles, text: '智能安排', color: 'bg-stone-50 text-stone-600' });
    }

    setPreviewTags(tags);
    setShowPreview(true);
  }, [value]);

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
      status: 'pending'
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
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
            <PlusCircle className="w-5 h-5" />
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
            <Wand2 className="w-4 h-4 text-stone-400 mt-0.5" />
            <div className="flex-1">
              <p className="text-xs text-stone-500 mb-2 font-medium">AI理解：</p>
              <div className="flex flex-wrap gap-2">
                {previewTags.map((tag, idx) => (
                  <span key={idx} className={cn("px-2.5 py-1 text-xs rounded-full flex items-center gap-1", tag.color)}>
                    <tag.icon className="w-3 h-3" />
                    {tag.text}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}