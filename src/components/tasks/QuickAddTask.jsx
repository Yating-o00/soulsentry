import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { Calendar as CalendarIcon, Clock, Plus, Sparkles, Settings } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import NotificationSettings from "../notifications/NotificationSettings";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

const CATEGORIES = [
  { value: "work", label: "工作", color: "bg-blue-500" },
  { value: "personal", label: "个人", color: "bg-purple-500" },
  { value: "health", label: "健康", color: "bg-green-500" },
  { value: "study", label: "学习", color: "bg-yellow-500" },
  { value: "family", label: "家庭", color: "bg-pink-500" },
  { value: "shopping", label: "购物", color: "bg-orange-500" },
  { value: "finance", label: "财务", color: "bg-red-500" },
  { value: "other", label: "其他", color: "bg-gray-500" },
];

const PRIORITIES = [
  { value: "low", label: "低", color: "text-slate-500" },
  { value: "medium", label: "中", color: "text-blue-500" },
  { value: "high", label: "高", color: "text-orange-500" },
  { value: "urgent", label: "紧急", color: "text-red-500" },
];

export default function QuickAddTask({ onAdd }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [task, setTask] = useState({
    title: "",
    description: "",
    reminder_time: null,
    time: "09:00",
    priority: "medium",
    category: "personal",
    repeat_rule: "none",
    is_all_day: false,
    notification_sound: "default",
    persistent_reminder: false,
    notification_interval: 15,
    advance_reminders: [],
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!task.title.trim() || !task.reminder_time) return;

    const reminderDateTime = new Date(task.reminder_time);
    if (!task.is_all_day) {
      const [hours, minutes] = task.time.split(':');
      reminderDateTime.setHours(parseInt(hours), parseInt(minutes), 0);
    }

    onAdd({
      ...task,
      reminder_time: reminderDateTime.toISOString(),
    });

    setTask({
      title: "",
      description: "",
      reminder_time: null,
      time: "09:00",
      priority: "medium",
      category: "personal",
      repeat_rule: "none",
      is_all_day: false,
      notification_sound: "default",
      persistent_reminder: false,
      notification_interval: 15,
      advance_reminders: [],
    });
    setIsExpanded(false);
    setShowSettings(false);
  };

  return (
    <Card className="overflow-hidden border-0 shadow-xl bg-white/80 backdrop-blur-sm">
      <div className="p-6">
        {!isExpanded ? (
          <button
            onClick={() => setIsExpanded(true)}
            className="w-full flex items-center gap-3 p-4 rounded-2xl bg-gradient-to-r from-blue-500 to-purple-600 text-white hover:shadow-lg hover:shadow-purple-500/25 transition-all duration-300 group"
          >
            <div className="h-10 w-10 rounded-xl bg-white/20 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
              <Plus className="w-5 h-5" />
            </div>
            <span className="text-lg font-medium">快速创建任务</span>
            <Sparkles className="w-5 h-5 ml-auto group-hover:rotate-12 transition-transform duration-300" />
          </button>
        ) : (
          <AnimatePresence>
            <motion.form
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              onSubmit={handleSubmit}
              className="space-y-4"
            >
              <Input
                placeholder="任务标题（例如：下午3点开会）"
                value={task.title}
                onChange={(e) => setTask({ ...task, title: e.target.value })}
                className="text-lg border-0 bg-slate-50 focus-visible:ring-2 focus-visible:ring-purple-500 rounded-xl"
                autoFocus
              />

              <Textarea
                placeholder="添加描述..."
                value={task.description}
                onChange={(e) => setTask({ ...task, description: e.target.value })}
                className="border-0 bg-slate-50 focus-visible:ring-2 focus-visible:ring-purple-500 rounded-xl resize-none"
                rows={3}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="justify-start text-left font-normal border-0 bg-slate-50 hover:bg-slate-100 rounded-xl"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4 text-purple-500" />
                      {task.reminder_time ? (
                        format(task.reminder_time, "PPP", { locale: zhCN })
                      ) : (
                        <span className="text-slate-500">选择日期</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={task.reminder_time}
                      onSelect={(date) => setTask({ ...task, reminder_time: date })}
                      locale={zhCN}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>

                {!task.is_all_day && (
                  <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 rounded-xl">
                    <Clock className="h-4 w-4 text-purple-500" />
                    <Input
                      type="time"
                      value={task.time}
                      onChange={(e) => setTask({ ...task, time: e.target.value })}
                      className="border-0 bg-transparent focus-visible:ring-0 p-0"
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Select
                  value={task.category}
                  onValueChange={(value) => setTask({ ...task, category: value })}
                >
                  <SelectTrigger className="border-0 bg-slate-50 rounded-xl">
                    <SelectValue placeholder="选择类别" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((cat) => (
                      <SelectItem key={cat.value} value={cat.value}>
                        <div className="flex items-center gap-2">
                          <div className={`w-3 h-3 rounded-full ${cat.color}`} />
                          {cat.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={task.priority}
                  onValueChange={(value) => setTask({ ...task, priority: value })}
                >
                  <SelectTrigger className="border-0 bg-slate-50 rounded-xl">
                    <SelectValue placeholder="优先级" />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((pri) => (
                      <SelectItem key={pri.value} value={pri.value}>
                        <span className={pri.color}>{pri.label}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={task.repeat_rule}
                  onValueChange={(value) => setTask({ ...task, repeat_rule: value })}
                >
                  <SelectTrigger className="border-0 bg-slate-50 rounded-xl">
                    <SelectValue placeholder="重复" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">不重复</SelectItem>
                    <SelectItem value="daily">每天</SelectItem>
                    <SelectItem value="weekly">每周</SelectItem>
                    <SelectItem value="monthly">每月</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Collapsible open={showSettings} onOpenChange={setShowSettings}>
                <CollapsibleTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full border-0 bg-slate-50 hover:bg-slate-100 rounded-xl"
                  >
                    <Settings className="w-4 h-4 mr-2" />
                    {showSettings ? "收起" : "展开"}通知设置
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-4">
                  <NotificationSettings
                    taskDefaults={task}
                    onUpdate={(settings) => setTask({ ...task, ...settings })}
                  />
                </CollapsibleContent>
              </Collapsible>

              <div className="flex items-center gap-3 pt-2">
                <Button
                  type="submit"
                  className="flex-1 bg-gradient-to-r from-blue-500 to-purple-600 hover:shadow-lg hover:shadow-purple-500/25 transition-all duration-300 rounded-xl"
                  disabled={!task.title.trim() || !task.reminder_time}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  创建任务
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsExpanded(false);
                    setShowSettings(false);
                  }}
                  className="rounded-xl"
                >
                  取消
                </Button>
              </div>
            </motion.form>
          </AnimatePresence>
        )}
      </div>
    </Card>
  );
}