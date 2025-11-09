import React, { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { Calendar as CalendarIcon, Clock, Plus, Sparkles, Settings, Repeat, Mic, MicOff, Loader2, Wand2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import NotificationSettings from "../notifications/NotificationSettings";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import RecurrenceEditor from "./RecurrenceEditor";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

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
  const [showRecurrence, setShowRecurrence] = useState(false);
  const [showVoiceDialog, setShowVoiceDialog] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState("");
  const recognitionRef = useRef(null);
  const [browserSupported, setBrowserSupported] = useState(true);
  
  const [task, setTask] = useState({
    title: "",
    description: "",
    reminder_time: null,
    time: "09:00",
    priority: "medium",
    category: "personal",
    repeat_rule: "none",
    custom_recurrence: null,
    is_all_day: false,
    notification_sound: "default",
    persistent_reminder: false,
    notification_interval: 15,
    advance_reminders: [],
  });

  // 初始化语音识别
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setBrowserSupported(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'zh-CN';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript + ' ';
        } else {
          interimTranscript += transcript;
        }
      }

      setTranscript(prev => prev + finalTranscript || interimTranscript);
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      if (event.error === 'not-allowed') {
        toast.error("请允许麦克风权限");
      } else if (event.error !== 'no-speech') {
        toast.error("语音识别出错");
      }
      setIsRecording(false);
    };

    recognition.onend = () => {
      if (isRecording) {
        recognition.start();
      }
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [isRecording]);

  const startVoiceInput = () => {
    setTranscript("");
    setShowVoiceDialog(true);
    setTimeout(() => {
      setIsRecording(true);
      recognitionRef.current?.start();
      toast.success("开始录音");
    }, 300);
  };

  const stopRecording = () => {
    setIsRecording(false);
    recognitionRef.current?.stop();
    
    if (transcript.trim()) {
      parseVoiceInput();
    } else {
      toast.error("未检测到语音内容");
      setShowVoiceDialog(false);
    }
  };

  const parseVoiceInput = async () => {
    setIsProcessing(true);
    try {
      const response = await base44.integrations.Core.InvokeLLM({
        prompt: `从以下语音内容中提取任务信息，识别主任务和子任务。

语音内容：${transcript}

提取：标题、描述、时间、优先级、类别、子任务。
时间规则：具体时间转ISO格式，相对时间（明天/下周）计算日期，默认明天9点。
优先级：urgent/high/medium/low
类别：work/personal/health/study/family/shopping/finance/other

当前时间：${new Date().toISOString()}`,
        response_json_schema: {
          type: "object",
          properties: {
            tasks: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  description: { type: "string" },
                  reminder_time: { type: "string" },
                  priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
                  category: { type: "string", enum: ["work", "personal", "health", "study", "family", "shopping", "finance", "other"] },
                  subtasks: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string" },
                        description: { type: "string" },
                        reminder_time: { type: "string" },
                        priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
                        order: { type: "number" }
                      },
                      required: ["title", "reminder_time"]
                    }
                  }
                },
                required: ["title", "reminder_time"]
              }
            }
          },
          required: ["tasks"]
        }
      });

      if (response.tasks && response.tasks.length > 0) {
        setShowVoiceDialog(false);
        setTranscript("");
        setIsProcessing(false);
        
        // 如果有多个任务或子任务，批量创建
        if (response.tasks.length > 1 || response.tasks.some(t => t.subtasks?.length > 0)) {
          await handleBulkCreate(response.tasks);
        } else {
          // 单个简单任务，填充到表单
          const firstTask = response.tasks[0];
          setTask({
            title: firstTask.title,
            description: firstTask.description || "",
            reminder_time: new Date(firstTask.reminder_time),
            time: format(new Date(firstTask.reminder_time), "HH:mm"),
            priority: firstTask.priority || "medium",
            category: firstTask.category || "personal",
            repeat_rule: "none",
            custom_recurrence: null,
            is_all_day: false,
            notification_sound: "default",
            persistent_reminder: false,
            notification_interval: 15,
            advance_reminders: [],
          });
          setIsExpanded(true);
          toast.success("✨ 语音内容已填充到表单");
        }
      } else {
        toast.error("未能识别任务信息");
        setShowVoiceDialog(false);
        setTranscript("");
      }
    } catch (error) {
      console.error("Parse error:", error);
      toast.error("解析失败");
      setShowVoiceDialog(false);
    }
    setIsProcessing(false);
  };

  const handleBulkCreate = async (parsedTasks) => {
    let createdCount = 0;
    let createdSubtasksCount = 0;

    try {
      toast.loading("正在创建任务...", { id: 'bulk-create' });

      for (const taskData of parsedTasks) {
        const hasSubtasks = taskData.subtasks && taskData.subtasks.length > 0;
        
        const mainTaskData = {
          title: taskData.title,
          description: taskData.description || "",
          reminder_time: taskData.reminder_time,
          priority: taskData.priority || "medium",
          category: taskData.category || "personal",
          status: "pending",
          progress: 0,
          notification_sound: "default",
          persistent_reminder: false,
          notification_interval: 15,
          advance_reminders: [],
        };
        
        const createdMainTask = await onAdd(mainTaskData);
        createdCount++;
        
        if (hasSubtasks) {
          for (let i = 0; i < taskData.subtasks.length; i++) {
            const subtask = taskData.subtasks[i];
            const subtaskData = {
              title: `${subtask.order || i + 1}. ${subtask.title}`,
              description: subtask.description || "",
              reminder_time: subtask.reminder_time,
              priority: subtask.priority || taskData.priority || "medium",
              category: taskData.category,
              status: "pending",
              parent_task_id: createdMainTask?.id || createdMainTask,
              progress: 0,
              notification_sound: "default",
              persistent_reminder: false,
              advance_reminders: [],
            };
            
            await onAdd(subtaskData);
            createdSubtasksCount++;
          }
        }
      }
      
      toast.success(
        `✅ 创建 ${createdCount} 个任务${createdSubtasksCount > 0 ? `和 ${createdSubtasksCount} 个子任务` : ''}！`,
        { id: 'bulk-create' }
      );
    } catch (error) {
      console.error("Error creating tasks:", error);
      toast.error("创建任务时出错", { id: 'bulk-create' });
    }
  };

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
      custom_recurrence: null,
      is_all_day: false,
      notification_sound: "default",
      persistent_reminder: false,
      notification_interval: 15,
      advance_reminders: [],
    });
    setIsExpanded(false);
    setShowSettings(false);
    setShowRecurrence(false);
  };

  const getRecurrenceLabel = () => {
    if (task.repeat_rule === "custom" && task.custom_recurrence) {
      const rec = task.custom_recurrence;
      if (rec.frequency === "weekly" && rec.days_of_week?.length > 0) {
        const days = ["日", "一", "二", "三", "四", "五", "六"];
        return `每周${rec.days_of_week.map(d => days[d]).join("、")}`;
      }
      if (rec.frequency === "monthly" && rec.days_of_month?.length > 0) {
        return `每月${rec.days_of_month.join("、")}日`;
      }
      return "自定义重复";
    } else if (task.repeat_rule === "daily") {
      return "每天";
    } else if (task.repeat_rule === "weekly") {
      return "每周";
    } else if (task.repeat_rule === "monthly") {
      return "每月";
    }
    return null;
  };

  return (
    <>
      <Card className="overflow-hidden border-0 shadow-xl bg-white/80 backdrop-blur-sm">
        <div className="p-6">
          {!isExpanded ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-slate-700">快速创建</h3>
                {browserSupported && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={startVoiceInput}
                    className="h-8 w-8 hover:bg-purple-100 rounded-lg group"
                    title="语音输入"
                  >
                    <Mic className="w-4 h-4 text-purple-600 group-hover:scale-110 transition-transform" />
                  </Button>
                )}
              </div>
              
              <button
                onClick={() => setIsExpanded(true)}
                className="w-full flex items-center gap-3 p-4 rounded-2xl bg-gradient-to-r from-blue-500 to-purple-600 text-white hover:shadow-lg hover:shadow-purple-500/25 transition-all duration-300 group"
              >
                <div className="h-10 w-10 rounded-xl bg-white/20 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                  <Plus className="w-5 h-5" />
                </div>
                <span className="text-lg font-medium">新建任务</span>
                <Sparkles className="w-5 h-5 ml-auto group-hover:rotate-12 transition-transform duration-300" />
              </button>
            </div>
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
                    onValueChange={(value) => {
                      if (value === "custom") {
                        setTask({ ...task, repeat_rule: value });
                        setShowRecurrence(true);
                      } else {
                        setTask({ ...task, repeat_rule: value, custom_recurrence: null });
                      }
                    }}
                  >
                    <SelectTrigger className="border-0 bg-slate-50 rounded-xl">
                      <SelectValue placeholder="重复" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">不重复</SelectItem>
                      <SelectItem value="daily">每天</SelectItem>
                      <SelectItem value="weekly">每周</SelectItem>
                      <SelectItem value="monthly">每月</SelectItem>
                      <SelectItem value="custom">自定义...</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {getRecurrenceLabel() && task.repeat_rule !== "none" && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-2"
                  >
                    <Badge className="bg-purple-100 text-purple-700 border border-purple-300">
                      <Repeat className="w-3 h-3 mr-1" />
                      {getRecurrenceLabel()}
                    </Badge>
                    {(task.repeat_rule === "custom" || (task.repeat_rule !== "none" && !task.custom_recurrence)) && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowRecurrence(true)}
                        className="text-xs"
                      >
                        编辑
                      </Button>
                    )}
                  </motion.div>
                )}

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
                      setShowRecurrence(false);
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

      {/* 重复规则编辑器 */}
      <Dialog open={showRecurrence} onOpenChange={setShowRecurrence}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>自定义重复规则</DialogTitle>
          </DialogHeader>
          <RecurrenceEditor
            value={task.custom_recurrence}
            onChange={(recurrence) => {
              setTask({ ...task, custom_recurrence: recurrence, repeat_rule: "custom" });
            }}
            onClose={() => setShowRecurrence(false)}
          />
        </DialogContent>
      </Dialog>

      {/* 语音输入对话框 */}
      <Dialog open={showVoiceDialog} onOpenChange={setShowVoiceDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mic className="w-5 h-5 text-purple-600" />
              语音创建任务
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* 录音按钮 */}
            <div className="flex justify-center">
              <Button
                size="lg"
                onClick={stopRecording}
                disabled={isProcessing}
                className="relative h-32 w-32 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-red-500 hover:shadow-2xl hover:shadow-purple-500/50 transition-all duration-300"
              >
                <AnimatePresence mode="wait">
                  {isRecording && !isProcessing && (
                    <motion.div
                      key="recording"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      exit={{ scale: 0 }}
                      className="absolute inset-0 flex flex-col items-center justify-center gap-2"
                    >
                      <MicOff className="w-12 h-12 text-white" />
                      <span className="text-xs font-medium text-white">点击完成</span>
                    </motion.div>
                  )}
                  {isProcessing && (
                    <motion.div
                      key="processing"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      exit={{ scale: 0 }}
                      className="absolute inset-0 flex flex-col items-center justify-center gap-2"
                    >
                      <Loader2 className="w-12 h-12 text-white animate-spin" />
                      <span className="text-xs font-medium text-white">解析中</span>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* 脉动动画 */}
                {isRecording && !isProcessing && (
                  <>
                    <motion.div
                      className="absolute inset-0 rounded-full bg-purple-400"
                      animate={{
                        scale: [1, 1.4, 1],
                        opacity: [0.6, 0, 0.6],
                      }}
                      transition={{
                        duration: 2,
                        repeat: Infinity,
                        ease: "easeInOut",
                      }}
                    />
                    <motion.div
                      className="absolute inset-0 rounded-full bg-pink-400"
                      animate={{
                        scale: [1, 1.6, 1],
                        opacity: [0.4, 0, 0.4],
                      }}
                      transition={{
                        duration: 2,
                        repeat: Infinity,
                        ease: "easeInOut",
                        delay: 0.4,
                      }}
                    />
                    <motion.div
                      className="absolute inset-0 rounded-full bg-red-400"
                      animate={{
                        scale: [1, 1.8, 1],
                        opacity: [0.3, 0, 0.3],
                      }}
                      transition={{
                        duration: 2,
                        repeat: Infinity,
                        ease: "easeInOut",
                        delay: 0.8,
                      }}
                    />
                  </>
                )}
              </Button>
            </div>

            {/* 实时识别文本 */}
            <AnimatePresence>
              {transcript && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl p-4 border-2 border-purple-200"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <motion.div
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ duration: 1, repeat: Infinity }}
                      className="w-2 h-2 rounded-full bg-purple-600"
                    />
                    <span className="text-sm font-semibold text-purple-800">正在识别</span>
                  </div>
                  <p className="text-sm text-slate-700 leading-relaxed max-h-32 overflow-y-auto">
                    {transcript}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* 提示信息 */}
            <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl p-4 border border-blue-200">
              <div className="flex gap-3">
                <Wand2 className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-blue-800 mb-1">使用说明</p>
                  <ul className="text-xs text-blue-700 space-y-1">
                    <li>• 开始说话，AI 实时识别您的语音</li>
                    <li>• 支持自然语言："明天下午3点提醒我开会"</li>
                    <li>• 可以一次创建多个任务或子任务</li>
                    <li>• 完成后点击按钮自动解析和创建</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}