import React, { useState } from "react";
import { Plus, Mic, Sparkles, ChevronLeft, PenLine } from "lucide-react";
import { cn } from "@/lib/utils";
import UnifiedTaskInput from "./UnifiedTaskInput";
import VoiceTaskInput from "./VoiceTaskInput";

export default function TaskCreationPanel({ onAddTask, onOpenManual, onVoiceTasks }) {
  const [activeTab, setActiveTab] = useState("smart"); // 'quick', 'smart'
  const [showVoice, setShowVoice] = useState(false);
  const [smartInputValue, setSmartInputValue] = useState("");

  const handleSmartAddTask = (task) => {
    onAddTask(task);
    // Input clearing is handled by UnifiedTaskInput calling onChange("")
  };

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden mb-10 transition-all duration-300 hover:shadow-md">
      {/* Tabs */}
      <div className="flex border-b border-slate-100">
        <button
          onClick={() => {setActiveTab("quick");setShowVoice(false);}}
          className={cn(
            "flex-1 py-4 text-sm font-medium transition-all duration-300 relative",
            activeTab === "quick" ?
            "text-slate-900 bg-slate-50/50" :
            "text-slate-500 hover:text-slate-700 hover:bg-slate-50/30"
          )}>

          快速创建
          {activeTab === "quick" &&
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#384877] mx-auto w-12 rounded-full" />
          }
        </button>
        <button
          onClick={() => {setActiveTab("smart");setShowVoice(false);}}
          className={cn(
            "flex-1 py-4 text-sm font-medium transition-all duration-300 relative",
            activeTab === "smart" ?
            "text-slate-900 bg-slate-50/50" :
            "text-slate-500 hover:text-slate-700 hover:bg-slate-50/30"
          )}>

          智能解析
          {activeTab === "smart" &&
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#384877] mx-auto w-12 rounded-full" />
          }
        </button>
      </div>

      <div className="p-6 bg-slate-50/10 min-h-[180px]">
        {activeTab === "quick" && !showVoice &&
        <div className="animate-in fade-in slide-in-from-left-2 duration-300">
             <div className="flex items-center gap-2 mb-6">
               <Sparkles className="w-4 h-4 text-[#384877]" />
               <span className="text-xs font-medium text-slate-500">AI 助手 · 智能创建约定</span>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Manual Create Card */}
                <button
              onClick={onOpenManual}
              className="group bg-white border-2 border-dashed border-slate-200 rounded-2xl p-6 flex items-center gap-4 hover:border-[#384877]/30 hover:bg-white hover:shadow-lg hover:shadow-blue-900/5 transition-all duration-300 text-left h-28">

                   <div className="w-12 h-12 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center group-hover:scale-110 transition-transform group-active:scale-95">
                      <Plus className="w-6 h-6 text-slate-400 group-hover:text-[#384877]" />
                   </div>
                   <div>
                      <h3 className="font-bold text-slate-800 text-lg">手动创建</h3>
                      <p className="text-xs text-slate-400 mt-1">点击输入详情</p>
                   </div>
                </button>

                {/* Voice Create Card */}
                <button
              onClick={() => setShowVoice(true)}
              className="group bg-[#384877] rounded-2xl p-6 flex items-center gap-4 hover:bg-[#2c3a63] transition-all duration-300 text-left shadow-lg shadow-blue-900/20 h-28">

                   <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center group-hover:scale-110 transition-transform backdrop-blur-sm group-active:scale-95">
                      <Mic className="w-6 h-6 text-white" />
                   </div>
                   <div>
                      <h3 className="font-bold text-white text-lg">语音创建</h3>
                      <p className="text-xs text-white/60 mt-1">AI 识别</p>
                   </div>
                </button>
             </div>
          </div>
        }

        {activeTab === "quick" && showVoice &&
        <div className="animate-in fade-in zoom-in-95 duration-300">
              <div className="flex items-center justify-between mb-4">
                 <button
              onClick={() => setShowVoice(false)}
              className="text-sm text-slate-500 hover:text-slate-800 flex items-center gap-1 transition-colors">

                   <ChevronLeft className="w-4 h-4" /> 返回
                 </button>
                 <span className="text-xs font-medium text-slate-400">语音模式</span>
              </div>
              <VoiceTaskInput onTasksGenerated={onVoiceTasks} />
           </div>
        }

        {activeTab === "smart" &&
        <div className="animate-in fade-in slide-in-from-right-2 duration-300">
            <div className="flex items-center gap-2 mb-4">
               
               
             </div>
            <UnifiedTaskInput
            onAddTask={handleSmartAddTask}
            value={smartInputValue}
            onChange={setSmartInputValue} />

            
            <div className="mt-6 flex flex-wrap gap-3 animate-in fade-in slide-in-from-bottom-2 duration-500 delay-100">
              <span className="text-xs font-medium text-slate-400 py-1.5">试一试:</span>
              <button
              onClick={() => setSmartInputValue("周五前完成周报")}
              className="px-3 py-1.5 bg-blue-50 text-blue-600 rounded-full text-xs font-medium hover:bg-blue-100 transition-colors border border-blue-100">

                📅 周五前完成周报
              </button>
              <button
              onClick={() => setSmartInputValue("下班后去超市买牛奶")}
              className="px-3 py-1.5 bg-green-50 text-green-600 rounded-full text-xs font-medium hover:bg-green-100 transition-colors border border-green-100">

                🛒 下班后去超市买牛奶
              </button>
              <button
              onClick={() => setSmartInputValue("明天上午10点开会")}
              className="px-3 py-1.5 bg-amber-50 text-amber-600 rounded-full text-xs font-medium hover:bg-amber-100 transition-colors border border-amber-100">

                ⏰ 明天上午10点开会
              </button>
               <button
              onClick={() => setSmartInputValue("每周一提醒我健身")}
              className="px-3 py-1.5 bg-purple-50 text-purple-600 rounded-full text-xs font-medium hover:bg-purple-100 transition-colors border border-purple-100">

                💪 每周一提醒我健身
              </button>
            </div>
          </div>
        }
      </div>
    </div>);

}