import React, { useState } from "react";
import { Plus, Mic, Sparkles, ChevronLeft, Calendar as CalendarIcon, Clock, Tag, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import UnifiedTaskInput from "./UnifiedTaskInput";
import VoiceTaskInput from "./VoiceTaskInput";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";

const CATEGORIES = [
  { value: "work", label: "工作", icon: "💼" },
  { value: "personal", label: "个人", icon: "👤" },
  { value: "health", label: "健康", icon: "❤️" },
  { value: "study", label: "学习", icon: "📚" },
  { value: "family", label: "家庭", icon: "👨‍👩‍👧‍👦" },
  { value: "shopping", label: "购物", icon: "🛒" },
  { value: "finance", label: "财务", icon: "💰" },
  { value: "other", label: "其他", icon: "📌" },
];

export default function TaskCreationPanel({ onAddTask, onOpenManual, onVoiceTasks }) {
  const [activeTab, setActiveTab] = useState("smart");
  const [showVoice, setShowVoice] = useState(false);
  const [smartInputValue, setSmartInputValue] = useState("");
  
  // Manual form state
  const [manualTask, setManualTask] = useState({
    title: "",
    priority: "medium",
    category: "personal",
    reminder_time: new Date(),
    time: "09:00"
  });

  const handleSmartAddTask = (task) => {
    onAddTask(task);
  };

  const handleManualSubmit = () => {
    if (!manualTask.title.trim()) return;
    
    const reminderDate = new Date(manualTask.reminder_time);
    const [hours, minutes] = manualTask.time.split(':');
    reminderDate.setHours(parseInt(hours), parseInt(minutes));

    onAddTask({
      ...manualTask,
      reminder_time: reminderDate.toISOString(),
      status: 'pending'
    });

    // Reset form
    setManualTask({
      title: "",
      priority: "medium",
      category: "personal",
      reminder_time: new Date(),
      time: "09:00"
    });
  };

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden mb-10 transition-all duration-300 hover:shadow-md">
      {/* Tabs */}
      <div className="flex border-b border-slate-100">
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
      </div>

      <div className="p-6 bg-slate-50/10 min-h-[180px]">
        {activeTab === "quick" && !showVoice &&
          <div className="animate-in fade-in slide-in-from-left-2 duration-300 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Plus className="w-4 h-4 text-[#384877]" />
                <span className="text-xs font-medium text-slate-500">手动创建约定</span>
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setShowVoice(true)}
                className="text-[#384877] hover:bg-blue-50"
              >
                <Mic className="w-4 h-4 mr-1" /> 切换语音
              </Button>
            </div>

            <div className="space-y-4">
              <Input
                placeholder="输入约定标题..."
                value={manualTask.title}
                onChange={(e) => setManualTask({ ...manualTask, title: e.target.value })}
                className="text-lg font-medium border-0 border-b-2 border-slate-200 rounded-none px-0 focus-visible:ring-0 focus-visible:border-[#384877] bg-transparent"
              />

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal border-slate-200">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {manualTask.reminder_time ? format(manualTask.reminder_time, "M月d日", { locale: zhCN }) : "选择日期"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={manualTask.reminder_time}
                      onSelect={(date) => date && setManualTask({ ...manualTask, reminder_time: date })}
                      initialFocus
                      locale={zhCN}
                    />
                  </PopoverContent>
                </Popover>

                <Input
                  type="time"
                  value={manualTask.time}
                  onChange={(e) => setManualTask({ ...manualTask, time: e.target.value })}
                  className="border-slate-200"
                />

                <Select value={manualTask.category} onValueChange={(val) => setManualTask({ ...manualTask, category: val })}>
                  <SelectTrigger className="border-slate-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(cat => (
                      <SelectItem key={cat.value} value={cat.value}>
                        <span className="flex items-center gap-2">
                          <span>{cat.icon}</span>
                          <span>{cat.label}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={manualTask.priority} onValueChange={(val) => setManualTask({ ...manualTask, priority: val })}>
                  <SelectTrigger className="border-slate-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">低优先级</SelectItem>
                    <SelectItem value="medium">中优先级</SelectItem>
                    <SelectItem value="high">高优先级</SelectItem>
                    <SelectItem value="urgent">紧急</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex justify-end pt-2">
                <Button 
                  onClick={handleManualSubmit}
                  className="bg-[#384877] hover:bg-[#2c3a63] text-white px-8"
                  disabled={!manualTask.title.trim()}
                >
                  创建
                </Button>
              </div>
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