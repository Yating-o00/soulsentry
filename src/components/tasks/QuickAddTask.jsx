import React, { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useHapticFeedback } from "../mobile/TouchOptimizations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { OfflineStorage } from "../offline/OfflineManager";
import { Calendar as CalendarIcon, Clock, Plus, Settings, Repeat, Mic, MicOff, Loader2, Wand2, Sparkles, Circle, Tag, Bell, Users, ListTodo, Trash2, MessageSquare, BookTemplate } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { motion, AnimatePresence } from "framer-motion";
import NotificationSettings from "../notifications/NotificationSettings";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import RecurrenceEditor from "./RecurrenceEditor";
import CustomTimePicker from "./CustomTimePicker";
import TaskAssignment from "./TaskAssignment";
import SmartReminderSuggestion from "./SmartReminderSuggestion";
import AITaskEnhancer from "./AITaskEnhancer";
import SmartTextParser from "./SmartTextParser";
import TaskDependencySelector from "./TaskDependencySelector";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { logUserBehavior } from "@/components/utils/behaviorLogger";

const CATEGORIES = [
  { value: "work", label: "工作", icon: "💼", color: "bg-blue-50 text-blue-700 border-blue-200" },
  { value: "personal", label: "个人", icon: "👤", color: "bg-purple-50 text-purple-700 border-purple-200" },
  { value: "health", label: "健康", icon: "❤️", color: "bg-green-50 text-green-700 border-green-200" },
  { value: "study", label: "学习", icon: "📚", color: "bg-yellow-50 text-yellow-700 border-yellow-200" },
  { value: "family", label: "家庭", icon: "👨‍👩‍👧‍👦", color: "bg-pink-50 text-pink-700 border-pink-200" },
  { value: "shopping", label: "购物", icon: "🛒", color: "bg-orange-50 text-orange-700 border-orange-200" },
  { value: "finance", label: "财务", icon: "💰", color: "bg-[#fff1f2] text-[#d5495f] border-[#e0919e]" },
  { value: "other", label: "其他", icon: "📌", color: "bg-gray-50 text-gray-700 border-gray-200" },
];

const PRIORITIES = [
  { value: "low", label: "低", icon: "○", color: "text-slate-400" },
  { value: "medium", label: "中", icon: "◐", color: "text-blue-600" },
  { value: "high", label: "高", icon: "◉", color: "text-[#de6d7e]" },
  { value: "urgent", label: "紧急", icon: "⚠️", color: "text-[#d5495f]" },
];

export default function QuickAddTask({ onAdd, initialData = null }) {
  const queryClient = useQueryClient();
  const triggerHaptic = useHapticFeedback();
  const [isExpanded, setIsExpanded] = useState(!!initialData);
  const [showSettings, setShowSettings] = useState(false);
  const [showRecurrence, setShowRecurrence] = useState(false);
  const [showVoiceDialog, setShowVoiceDialog] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState("");
  const recognitionRef = useRef(null);
  const [browserSupported, setBrowserSupported] = useState(true);
  
  const [showAssignment, setShowAssignment] = useState(false);
  const [showSmartSuggestion, setShowSmartSuggestion] = useState(false);
  const [showDependencies, setShowDependencies] = useState(false);
  const [isStartTimeOpen, setIsStartTimeOpen] = useState(false);
  const [isEndTimeOpen, setIsEndTimeOpen] = useState(false);
  const [showAIEnhancer, setShowAIEnhancer] = useState(false);
  const [suggestedTags, setSuggestedTags] = useState([]);
  const [isSuggestingTags, setIsSuggestingTags] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [openSubtaskTimeIdx, setOpenSubtaskTimeIdx] = useState(null);
  
  const { data: templates } = useQuery({
    queryKey: ['task-templates'],
    queryFn: () => base44.entities.TaskTemplate.list(),
    enabled: isExpanded // only fetch when form is open
  });

  const [task, setTask] = useState({
    title: initialData?.title || "",
    description: initialData?.description || "",
    reminder_time: initialData?.reminder_time ? new Date(initialData.reminder_time) : null,
    time: initialData?.reminder_time ? format(new Date(initialData.reminder_time), "HH:mm") : "09:00",
    end_time: initialData?.end_time ? new Date(initialData.end_time) : null,
    end_time_str: initialData?.end_time ? format(new Date(initialData.end_time), "HH:mm") : "10:00",
    has_end_time: !!initialData?.end_time,
    priority: initialData?.priority || "medium",
    category: initialData?.category || "personal",
    repeat_rule: initialData?.repeat_rule || "none",
    custom_recurrence: initialData?.custom_recurrence || null,
    is_all_day: initialData?.is_all_day || false,
    notification_sound: initialData?.notification_sound || "default",
    persistent_reminder: initialData?.persistent_reminder || false,
    notification_interval: initialData?.notification_interval || 15,
    advance_reminders: initialData?.advance_reminders || [],
    notification_channels: initialData?.notification_channels || ["in_app", "browser"],
    email_reminder: initialData?.email_reminder || { enabled: false, advance_hours: [] },
    location_reminder: initialData?.location_reminder || { enabled: false },
    assigned_to: initialData?.assigned_to || [],
    is_shared: initialData?.is_shared || false,
    team_visibility: initialData?.team_visibility || "private",
    subtasks: initialData?.subtasks || [],
    dependencies: initialData?.dependencies || [],
    });

  // 智能标签、优先级和截止日期推荐 (Debounced)
  useEffect(() => {
    if (!task.title || task.title.length < 2) return;
    
    const timer = setTimeout(async () => {
      setIsSuggestingTags(true);
      try {
        const now = new Date().toISOString();
        const res = await base44.integrations.Core.InvokeLLM({
          prompt: `分析约定标题和描述，智能推荐标签、优先级和截止日期。

标题: "${task.title}"
${task.description ? `描述: "${task.description}"` : ''}
当前时间: ${now}

请提供:
1. 推荐标签 (3个简短标签)
2. 推荐优先级 (low/medium/high/urgent)
3. 截止日期和时间 (如果文本中提到，或根据约定性质推断合理的deadline)
4. 简短理由

返回JSON格式。`,
          response_json_schema: {
            type: "object",
            properties: {
              tags: { type: "array", items: { type: "string" } },
              priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
              suggested_deadline: { type: "string", format: "date-time" },
              reasoning: { type: "string" }
            }
          }
        });
        
        if (res) {
          // 更新标签建议
          if (res.tags) {
            const currentTags = task.tags || [];
            const newSuggestions = res.tags.filter(t => !currentTags.includes(t));
            setSuggestedTags(newSuggestions);
          }

          // 如果优先级与当前不同，显示建议
          if (res.priority && res.priority !== task.priority) {
            toast.info(
              <div className="text-sm">
                <p className="font-medium">💡 AI建议</p>
                <p>优先级: {res.priority} - {res.reasoning}</p>
              </div>,
              { duration: 4000 }
            );
          }

          // 如果检测到截止日期，提示用户
          if (res.suggested_deadline && !task.reminder_time) {
            const deadlineDate = new Date(res.suggested_deadline);
            toast.info(
              <div className="text-sm">
                <p className="font-medium">📅 检测到截止日期</p>
                <p>{format(deadlineDate, "MM月dd日 HH:mm", { locale: zhCN })}</p>
                <button
                  onClick={() => {
                    setTask(prev => ({
                      ...prev,
                      reminder_time: deadlineDate,
                      time: format(deadlineDate, "HH:mm"),
                      priority: res.priority || prev.priority
                    }));
                    toast.success("已自动设置提醒时间");
                  }}
                  className="mt-1 px-2 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600"
                >
                  应用建议
                </button>
              </div>,
              { duration: 6000 }
            );
          }
        }
      } catch (e) {
        console.error("AI智能分析失败:", e);
      } finally {
        setIsSuggestingTags(false);
      }
    }, 1500); // 1.5s debounce

    return () => clearTimeout(timer);
  }, [task.title, task.description]);

  const addTag = (tag) => {
    const currentTags = task.tags || [];
    if (!currentTags.includes(tag)) {
        setTask(prev => ({ ...prev, tags: [...currentTags, tag] }));
        setSuggestedTags(prev => prev.filter(t => t !== tag));
    }
  };

  // Update task if initialData changes
  useEffect(() => {
    if (initialData) {
      setTask(prev => ({
        ...prev,
        title: initialData.title || prev.title,
        description: initialData.description || prev.description,
        subtasks: initialData.subtasks || prev.subtasks || [],
        end_time: initialData.end_time ? new Date(initialData.end_time) : prev.end_time,
        end_time_str: initialData.end_time ? format(new Date(initialData.end_time), "HH:mm") : prev.end_time_str,
        has_end_time: !!initialData.end_time || prev.has_end_time,
        subtasks: initialData.subtasks || prev.subtasks || [],
      }));
      setIsExpanded(true);
    }
  }, [initialData]);

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
      toast.success("🎤 开始录音");
    }, 300);
  };

  const stopRecording = () => {
    setIsRecording(false);
    recognitionRef.current?.stop();
    
    if (transcript.trim()) {
      parseSmartInput(transcript);
    } else {
      toast.error("未检测到语音内容");
      setShowVoiceDialog(false);
    }
  };

  const parseSmartInput = async (inputText) => {
    setIsProcessing(true);
    try {
      const response = await base44.integrations.Core.InvokeLLM({
        prompt: `从以下自然语言内容中提取约定信息，识别主约定和子约定。

内容：${inputText}

提取：标题、描述、时间、优先级、类别、子约定。
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
        setShowSmartTextDialog(false);
        setTranscript("");
        setSmartText("");
        setIsProcessing(false);
        
        if (response.tasks.length > 1 || response.tasks.some(t => t.subtasks?.length > 0)) {
          await handleBulkCreateDirect(response.tasks);
        } else {
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
          toast.success("✨ 内容已智能填充到表单");
        }
      } else {
        toast.error("未能识别约定信息");
        setShowVoiceDialog(false);
        setShowSmartTextDialog(false);
      }
    } catch (error) {
      console.error("AI解析失败:", error);
      const errorMsg = error?.message || error?.toString() || "未知错误";
      toast.error(`解析失败: ${errorMsg}`);
      setShowVoiceDialog(false);
      setShowSmartTextDialog(false);
    }
    setIsProcessing(false);
  };

  const handleBulkCreateDirect = async (parsedTasks) => {
    let createdCount = 0;
    let createdSubtasksCount = 0;

    try {
      toast.loading("正在创建约定...", { id: 'bulk-create' });

      for (const taskData of parsedTasks) {
        const hasSubtasks = taskData.subtasks && taskData.subtasks.length > 0;
        
        const mainTaskData = {
          title: String(taskData.title || "未命名约定"),
          description: taskData.description || "",
          reminder_time: taskData.reminder_time,
          end_time: taskData.end_time,
          priority: taskData.priority || "medium",
          category: taskData.category || "personal",
          status: "pending",
          progress: 0,
          notification_sound: "default",
          persistent_reminder: false,
          notification_interval: 15,
          advance_reminders: [],
        };
        
        const createdMainTask = await base44.entities.Task.create(mainTaskData);
        logUserBehavior("task_created", createdMainTask, { source: "voice_bulk" });
        createdCount++;
        
        if (hasSubtasks) {
          for (let i = 0; i < taskData.subtasks.length; i++) {
            const subtask = taskData.subtasks[i];
            let subtaskTitle = "未命名子约定";
            if (subtask && subtask.title) {
                if (typeof subtask.title === 'object') {
                    subtaskTitle = subtask.title.title || subtask.title.text || subtask.title.content || "未命名子约定";
                } else {
                    subtaskTitle = String(subtask.title);
                }
            }

            const subtaskData = {
              title: `${subtask.order || i + 1}. ${subtaskTitle}`,
              description: subtask.description || "",
              reminder_time: subtask.reminder_time || taskData.reminder_time,
              end_time: subtask.end_time || taskData.end_time,
              priority: subtask.priority || taskData.priority || "medium",
              category: taskData.category,
              status: "pending",
              parent_task_id: createdMainTask.id,
              progress: 0,
              notification_sound: "default",
              persistent_reminder: false,
              advance_reminders: [],
            };
            
            await base44.entities.Task.create(subtaskData);
            createdSubtasksCount++;
          }
        }
      }
      
      toast.success(
        `✅ 创建 ${createdCount} 个约定${createdSubtasksCount > 0 ? `和 ${createdSubtasksCount} 个子约定` : ''}！`,
        { id: 'bulk-create' }
      );
      
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      
      if (onAdd && typeof onAdd === 'function' && !initialData) {
        // Optional: call onAdd if it expects a callback, though we handled creation internally
        // onAdd(createdMainTask); // complicated because we created multiple
      }
    } catch (error) {
      console.error("批量创建约定失败:", error);
      const errorMsg = error?.message || error?.toString() || "未知错误";
      toast.error(`创建约定时出错: ${errorMsg}`, { id: 'bulk-create' });
    }
  };

  // 键盘快捷键：Ctrl/Cmd + Enter 保存
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && isExpanded) {
        e.preventDefault();
        if (task.title.trim() && task.reminder_time) {
          handleSubmit(e);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isExpanded, task.title, task.reminder_time]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (isSubmitting) return;

    if (!task.title.trim() || !task.reminder_time) {
      triggerHaptic('error');
      return;
    }

    setIsSubmitting(true);
    triggerHaptic('light');

    const reminderDateTime = new Date(task.reminder_time);
    let endDateTime = task.end_time ? new Date(task.end_time) : null;

    if (!task.is_all_day) {
      const timeValue = task.time;
      const timeParts = (timeValue && typeof timeValue === 'string' && timeValue.includes(':')) ? timeValue.split(':') : ['09', '00'];
      const [hours = '09', minutes = '00'] = (timeParts && timeParts.length >= 2) ? timeParts : ['09', '00'];
      reminderDateTime.setHours(parseInt(hours) || 9, parseInt(minutes) || 0, 0);

      if (task.has_end_time || (task.end_time && task.end_time.getTime() !== task.reminder_time.getTime())) {
        // If end_time date is present (from range), use it. Otherwise default to reminder_time (same day).
        const baseEndDate = task.end_time || task.reminder_time;
        endDateTime = new Date(baseEndDate);
        
        // If has_end_time is true, use the specified end time. 
        // Otherwise (multi-day range without specific end time), default to same time as start or end of day? 
        // Using start time for consistency if not specified.
        const timeStr = task.has_end_time ? task.end_time_str : task.time;
        const endTimeParts = (timeStr && typeof timeStr === 'string' && timeStr.includes(':')) ? timeStr.split(':') : ['10', '00'];
        const [endHours = '10', endMinutes = '00'] = (endTimeParts && endTimeParts.length >= 2) ? endTimeParts : ['10', '00'];
        endDateTime.setHours(parseInt(endHours) || 10, parseInt(endMinutes) || 0, 0);
      } else {
        // Single day, no specific end time
        endDateTime = null;
      }
    } else {
        // All day task - keep dates as is (usually 00:00)
        // If we have an end date, ensure it's set
        if (endDateTime) {
            // Optional: set to end of day? Or just keep date part. 
            // Keeping date part (00:00) is standard for date-only comparison often.
        }
    }

    const taskToSubmit = {
      ...task,
      reminder_time: reminderDateTime.toISOString(),
      end_time: endDateTime ? endDateTime.toISOString() : null,
    };

    // 保存到离线存储
    try {
      triggerHaptic('success');
      if (navigator.onLine) {
        if (!initialData && task.subtasks && task.subtasks.length > 0) {
          await handleBulkCreateDirect([taskToSubmit]);
        } else {
          // Wrap onAdd in a promise if it isn't one, to ensure we wait for it
          await Promise.resolve(onAdd(taskToSubmit));
        }
      } else {
        // 离线模式：保存到本地
        await OfflineStorage.addToSyncQueue({
          type: initialData ? 'update_task' : 'create_task',
          id: initialData?.id,
          data: taskToSubmit
        });
        toast.success("📡 离线保存成功，将在上线时同步");
      }

      if (!initialData) {
        logUserBehavior("task_created", taskToSubmit);
      }

      if (!initialData) {
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
        notification_channels: ["in_app", "browser"],
        email_reminder: { enabled: false, advance_hours: [] },
        location_reminder: { enabled: false },
        assigned_to: [],
        is_shared: false,
        team_visibility: "private",
        subtasks: []
        });
        setIsExpanded(false);
        setShowSettings(false);
        setShowRecurrence(false);
      }
    } catch (error) {
      console.error("保存失败:", error);
      toast.error("保存失败");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getRecurrenceLabel = () => {
    if (task.repeat_rule === "custom" && task.custom_recurrence) {
      const rec = task.custom_recurrence;
      if (rec.frequency === "weekly" && rec.days_of_week?.length > 0) {
        const days = ["日", "一", "二", "三", "四", "五", "六"];
        return `每周${rec.days_of_week.map(d => days[d]).filter(Boolean).join("、")}`;
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

  const selectedCategory = CATEGORIES.find(c => c.value === task.category);
  const selectedPriority = PRIORITIES.find(p => p.value === task.priority);

  return (
    <>
      <Card className="overflow-hidden border-0 shadow-md bg-white/95 backdrop-blur-sm">
        <div className="p-4 md:p-6">
          {!isExpanded ? (
            <Tabs defaultValue="quick" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-4 md:mb-6 h-10 md:h-12 bg-slate-100/50 p-1 rounded-xl">
                <TabsTrigger value="quick" className="rounded-[10px] text-xs md:text-sm font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-[#384877]">快速创建</TabsTrigger>
                <TabsTrigger value="smart" className="rounded-[10px] text-xs md:text-sm font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-[#384877]">智能解析</TabsTrigger>
              </TabsList>

              <TabsContent value="quick" className="mt-0 space-y-3 md:space-y-4">
                <div className="flex items-center gap-2 mb-1 md:mb-2">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 md:w-4 md:h-4 text-blue-500" />
                    <span className="text-xs font-medium text-blue-600">AI 助手</span>
                  </div>
                  <span className="text-xs text-slate-400">·</span>
                  <span className="text-xs text-slate-500">智能创建约定</span>
                </div>

                <div className="flex flex-col md:flex-row gap-3 md:gap-4">
                  <button
                    onClick={() => setIsExpanded(true)}
                    className="flex-1 group relative rounded-2xl md:rounded-[20px] border-2 border-dashed border-slate-200 hover:border-blue-300 bg-white hover:bg-slate-50 transition-all flex items-center justify-center gap-3 px-4 py-5 md:py-6"
                  >
                    <div className="h-12 w-12 md:h-14 md:w-14 rounded-xl md:rounded-2xl bg-white border border-slate-100 flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform flex-shrink-0">
                      <Plus className="w-6 h-6 md:w-7 md:h-7 text-[#384877]" strokeWidth={2.5} />
                    </div>
                    <div className="text-left flex-1">
                      <div className="font-bold text-slate-800 text-base md:text-lg whitespace-nowrap">手动创建</div>
                      <div className="text-xs md:text-sm text-slate-500 font-medium whitespace-nowrap">点击输入详情</div>
                    </div>
                  </button>

                  {browserSupported && (
                    <button
                      onClick={startVoiceInput}
                      className="flex-1 group relative rounded-2xl md:rounded-[20px] bg-[#384877] text-white hover:bg-[#2c3b63] transition-all flex items-center justify-center gap-3 shadow-xl shadow-blue-900/20 px-4 py-5 md:py-6"
                    >
                      <div className="relative flex-shrink-0">
                        <div className="h-12 w-12 md:h-14 md:w-14 rounded-xl md:rounded-2xl bg-white/10 flex items-center justify-center group-hover:scale-110 transition-transform backdrop-blur-sm border border-white/10">
                          <Mic className="w-6 h-6 md:w-7 md:h-7 text-white" />
                        </div>
                        <motion.div
                          className="absolute inset-0 rounded-xl md:rounded-2xl bg-white/20"
                          animate={{ scale: [1, 1.3, 1], opacity: [0, 0.3, 0] }}
                          transition={{ duration: 2, repeat: Infinity }}
                        />
                      </div>
                      <div className="text-left flex-1">
                        <div className="font-bold text-base md:text-lg whitespace-nowrap">语音创建</div>
                        <div className="text-xs md:text-sm text-blue-100/80 font-medium whitespace-nowrap">AI 识别</div>
                      </div>
                    </button>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="smart" className="mt-0">
                <SmartTextParser 
                  onTasksGenerated={handleBulkCreateDirect} 
                  className="border-0 shadow-none bg-transparent" 
                />
              </TabsContent>
            </Tabs>
          ) : (
            <AnimatePresence>
              <motion.form
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                onSubmit={handleSubmit}
                className="space-y-5"
              >
                {/* 标题输入 - 超大字体 */}
                <div className="relative">
                  <Input
                    placeholder="输入约定标题..."
                    value={task.title}
                    onChange={(e) => setTask({ ...task, title: e.target.value })}
                    className="text-lg md:text-xl font-medium border-0 border-b-2 border-slate-200 focus-visible:border-blue-500 rounded-none bg-transparent px-0 focus-visible:ring-0 transition-colors h-12 md:h-auto"
                    autoFocus
                  />
                  <motion.div
                    className="absolute bottom-0 left-0 h-0.5 bg-blue-500"
                    initial={{ width: 0 }}
                    animate={{ width: task.title ? "100%" : "0%" }}
                    transition={{ duration: 0.3 }}
                  />
                </div>

                {/* AI智能增强 */}
                <AITaskEnhancer
                  taskTitle={task.title}
                  currentDescription={task.description}
                  availableTemplates={templates}
                  onApply={(aiSuggestions) => {
                    setTask({
                      ...task,
                      description: aiSuggestions.description,
                      category: aiSuggestions.category,
                      priority: aiSuggestions.priority,
                      tags: aiSuggestions.tags || [],
                      // Update reminder time if AI suggests a better one and user didn't manually lock it (conceptually)
                      // Here we just apply it as it's an "Enhancer" action
                      reminder_time: aiSuggestions.reminder_time ? new Date(aiSuggestions.reminder_time) : task.reminder_time,
                      time: aiSuggestions.reminder_time ? format(new Date(aiSuggestions.reminder_time), "HH:mm") : task.time,
                      
                      // Also set end time if suggested
                      end_time: aiSuggestions.end_time ? new Date(aiSuggestions.end_time) : task.end_time,
                      has_end_time: !!aiSuggestions.end_time || task.has_end_time,
                      end_time_str: aiSuggestions.end_time ? format(new Date(aiSuggestions.end_time), "HH:mm") : task.end_time_str,

                      subtasks: aiSuggestions.subtasks ? aiSuggestions.subtasks.map(st => ({
                          title: typeof st === 'object' ? (st.title || st.text || st.content || JSON.stringify(st)) : st,
                          description: "",
                          reminder_time: aiSuggestions.reminder_time || task.reminder_time || new Date().toISOString(),
                          priority: "medium"
                      })) : (task.subtasks || [])
                    });
                    
                    if (aiSuggestions.reminder_time) {
                        toast.success("已根据AI建议更新提醒时间");
                    }
                  }}
                />

                {/* 标签推荐区域 */}
                <AnimatePresence>
                  {(suggestedTags.length > 0 || (task.tags && task.tags.length > 0)) && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="flex flex-wrap gap-2 items-center"
                    >
                      {task.tags && task.tags.map(tag => (
                        <Badge key={tag} variant="secondary" className="bg-blue-100 text-blue-700 hover:bg-blue-200 gap-1 pl-2 pr-1">
                          #{tag}
                          <button 
                            type="button"
                            onClick={() => setTask(prev => ({...prev, tags: prev.tags.filter(t => t !== tag)}))}
                            className="hover:bg-blue-300 rounded-full p-0.5"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </Badge>
                      ))}
                      
                      {suggestedTags.length > 0 && (
                        <>
                          <span className="text-xs text-slate-400 flex items-center gap-1">
                            <Sparkles className="w-3 h-3" /> 推荐:
                          </span>
                          {suggestedTags.map(tag => (
                            <Badge 
                              key={tag} 
                              variant="outline" 
                              className="cursor-pointer border-dashed border-blue-300 text-blue-600 hover:bg-blue-50 transition-colors"
                              onClick={() => addTag(tag)}
                            >
                              + {tag}
                            </Badge>
                          ))}
                        </>
                      )}
                      {isSuggestingTags && <Loader2 className="w-3 h-3 animate-spin text-slate-300" />}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* 描述输入 */}
                <Textarea
                  placeholder="添加详细描述（可选）"
                  value={task.description}
                  onChange={(e) => setTask({ ...task, description: e.target.value })}
                  className="border-slate-200 bg-slate-50/50 focus-visible:ring-2 focus-visible:ring-blue-500/20 focus-visible:border-blue-500 rounded-xl resize-none text-base md:text-sm min-h-[100px] md:min-h-0"
                  rows={2}
                />

                {/* 子约定列表 */}
                {/*  */}
                  <div className="space-y-2">
                      {task.subtasks && task.subtasks.length > 0 && (
                          <div className="space-y-2 pl-2 border-l-2 border-slate-100">
                              {task.subtasks.map((st, idx) => (
                                  <div key={idx} className="flex items-center gap-2 text-sm">
                                      <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                                      <Input 
                                          value={st.title} 
                                          onChange={(e) => {
                                              const newSubtasks = [...task.subtasks];
                                              newSubtasks[idx].title = e.target.value;
                                              setTask({...task, subtasks: newSubtasks});
                                          }}
                                          className="h-8 border-none bg-transparent focus-visible:ring-0 p-0"
                                      />
                                      
                                      <Popover open={openSubtaskTimeIdx === idx} onOpenChange={(open) => setOpenSubtaskTimeIdx(open ? idx : null)}>
                                        <PopoverTrigger asChild>
                                            <button 
                                                type="button"
                                                className="h-6 px-1.5 rounded text-xs font-medium text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors flex items-center gap-1 bg-slate-50"
                                                title="调整时间"
                                            >
                                                <Clock className="w-3 h-3" />
                                                {st.reminder_time ? format(new Date(st.reminder_time), "HH:mm") : "时间"}
                                            </button>
                                        </PopoverTrigger>
                                        <PopoverContent className="p-0 w-auto" align="end">
                                            <CustomTimePicker 
                                                value={st.reminder_time ? format(new Date(st.reminder_time), "HH:mm") : (task.time || "09:00")}
                                                onChange={(newTime) => {
                                                    const newSubtasks = [...task.subtasks];
                                                    if (newTime && typeof newTime === 'string' && newTime.includes(':')) {
                                                        const parts = newTime.split(':');
                                                        const [h, m] = (parts && parts.length >= 2) ? parts : ['09', '00'];
                                                        // Use subtask's existing date or parent's reminder time date
                                                        const baseDate = st.reminder_time ? new Date(st.reminder_time) : (task.reminder_time ? new Date(task.reminder_time) : new Date());
                                                        baseDate.setHours(parseInt(h) || 0, parseInt(m) || 0);
                                                        newSubtasks[idx].reminder_time = baseDate.toISOString();
                                                        setTask({...task, subtasks: newSubtasks});
                                                    }
                                                }}
                                                onClose={() => setOpenSubtaskTimeIdx(null)}
                                            />
                                        </PopoverContent>
                                      </Popover>

                                      <Button size="icon" variant="ghost" className="h-6 w-6 text-slate-400 hover:text-red-500" onClick={() => {
                                          const newSubtasks = task.subtasks.filter((_, i) => i !== idx);
                                          setTask({...task, subtasks: newSubtasks});
                                      }}>
                                          <Trash2 className="w-3 h-3" />
                                      </Button>
                                  </div>
                              ))}
                          </div>
                      )}
                      <Button type="button" variant="ghost" size="sm" className="text-xs text-slate-500 hover:text-blue-600" onClick={() => {
                          setTask({
                              ...task, 
                              subtasks: [...(task.subtasks || []), { title: "", description: "", priority: "medium", reminder_time: task.reminder_time, end_time: task.end_time }]
                          });
                      }}>
                          <ListTodo className="w-3.5 h-3.5 mr-1.5" />
                          添加子约定
                      </Button>
                  </div>
                {/*  */}

                {/* 快速设置栏 - 卡片式布局 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                  {/* 日期选择 (关注区间) */}
                  <Popover>
                    <PopoverTrigger asChild>
                      <button type="button" className="group flex items-center justify-between gap-3 w-full p-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 hover:border-blue-300 transition-all text-left">
                         <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-100 transition-colors">
                                <CalendarIcon className="h-5 w-5 text-blue-500 group-hover:scale-110 transition-transform" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-slate-500 mb-0.5">约定日期</p>
                                <div className="text-sm font-bold text-slate-700 truncate">
                                     {task.reminder_time ? (
                                          <span>
                                            {format(task.reminder_time, "M月d日", { locale: zhCN })}
                                            {task.end_time && task.end_time.getTime() !== task.reminder_time.getTime() && (
                                              <span className="text-slate-400 font-normal ml-1">
                                                - {format(task.end_time, "M月d日", { locale: zhCN })}
                                              </span>
                                            )}
                                          </span>
                                        ) : (
                                          <span className="text-slate-400 font-normal">点击选择日期</span>
                                        )}
                                </div>
                            </div>
                         </div>
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="range"
                        selected={{
                          from: task.reminder_time,
                          to: task.end_time
                        }}
                        onSelect={(range) => {
                          if (range?.from) {
                            setTask({ 
                              ...task, 
                              reminder_time: range.from, 
                              end_time: range.to || null
                            });
                          } else {
                            setTask({ ...task, reminder_time: null, end_time: null });
                          }
                        }}
                        locale={zhCN}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>

                  {/* 提醒时间设置 */}
                  {!task.is_all_day && (
                    <div className="group flex items-center gap-3 w-full p-3 rounded-xl border border-slate-200 bg-white hover:border-blue-300 transition-all">
                         <div className="h-10 w-10 rounded-lg bg-purple-50 flex items-center justify-center flex-shrink-0 group-hover:bg-purple-100 transition-colors">
                            <Clock className="h-5 w-5 text-purple-500 group-hover:scale-110 transition-transform" />
                        </div>
                        <div className="flex-1 min-w-0">
                             <div className="flex items-center justify-between mb-0.5">
                                 <p className="text-xs font-medium text-slate-500">提醒时间</p>
                                 <button type="button" onClick={() => setTask({ ...task, has_end_time: !task.has_end_time })} className="text-[10px] text-blue-600 hover:underline">
                                     {task.has_end_time ? "改为单点" : "设为时间段"}
                                 </button>
                             </div>
                             <div className="flex items-center gap-1">
                                 <Popover open={isStartTimeOpen} onOpenChange={setIsStartTimeOpen}>
                                    <PopoverTrigger asChild>
                                        <button 
                                            type="button"
                                            className="p-0 border-0 h-auto text-sm font-bold text-slate-700 bg-transparent focus:ring-0 w-[50px] cursor-pointer text-left hover:text-blue-600 transition-colors"
                                        >
                                            {task.time}
                                        </button>
                                    </PopoverTrigger>
                                    <PopoverContent className="p-0 w-auto" align="start">
                                        <CustomTimePicker 
                                            value={task.time}
                                            onChange={(newTime) => {
                                              const updates = { time: newTime };
                                              if (task.reminder_time && newTime && typeof newTime === 'string' && newTime.includes(':')) {
                                                  const parts = newTime.split(':');
                                                  const [h, m] = (parts && parts.length >= 2) ? parts : ['09', '00'];
                                                   const newDate = new Date(task.reminder_time);
                                                   newDate.setHours(parseInt(h) || 9, parseInt(m) || 0);
                                                   updates.reminder_time = newDate;
                                               }
                                               setTask({ ...task, ...updates });
                                            }}
                                            onClose={() => setIsStartTimeOpen(false)}
                                        />
                                    </PopoverContent>
                                 </Popover>
                                 {task.has_end_time && (
                                     <>
                                         <span className="text-slate-300">-</span>
                                         <input
                                            type="time"
                                            value={task.end_time_str}
                                            onChange={(e) => {
                                              const newTime = e.target.value;
                                              const updates = { end_time_str: newTime };
                                              if (newTime && typeof newTime === 'string' && newTime.includes(':')) {
                                               const parts = newTime.split(':');
                                               const [h, m] = (parts && parts.length >= 2) ? parts : ['10', '00'];
                                                if (task.end_time) {
                                                  const newDate = new Date(task.end_time);
                                                  newDate.setHours(parseInt(h) || 10, parseInt(m) || 0);
                                                  updates.end_time = newDate;
                                                } else if (task.reminder_time) {
                                                  const newDate = new Date(task.reminder_time);
                                                  newDate.setHours(parseInt(h) || 10, parseInt(m) || 0);
                                                  updates.end_time = newDate;
                                                }
                                              }
                                              setTask({ ...task, ...updates });
                                            }}
                                            className="p-0 border-0 h-auto text-sm font-bold text-slate-700 bg-transparent focus:ring-0 w-[90px] cursor-pointer"
                                    onClick={(e) => e.target.focus()}
                                    onDoubleClick={(e) => e.target.blur()}
                                          />
                                     </>
                                 )}
                             </div>
                        </div>
                    </div>
                  )}
                </div>

                {/* 属性选择栏 (类别/优先级) */}
                <div className="grid grid-cols-2 gap-3 md:gap-4">
                  {/* 类别 */}
                  <Select
                    value={task.category}
                    onValueChange={(value) => setTask({ ...task, category: value })}
                  >
                    <SelectTrigger className="border-slate-200 bg-white hover:border-blue-300 rounded-xl h-auto py-3 transition-all">
                      <div className="flex flex-col items-start gap-1 w-full">
                        <div className="flex items-center gap-2 text-slate-500">
                          <Tag className="h-4 w-4" />
                          <span className="text-xs font-medium">类别</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-base">{selectedCategory?.icon}</span>
                          <span className="text-sm font-semibold text-slate-800">{selectedCategory?.label}</span>
                        </div>
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((cat) => (
                        <SelectItem key={cat.value} value={cat.value}>
                          <div className="flex items-center gap-2">
                            <span className="text-base">{cat.icon}</span>
                            <span>{cat.label}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* 优先级 */}
                  <Select
                    value={task.priority}
                    onValueChange={(value) => setTask({ ...task, priority: value })}
                  >
                    <SelectTrigger className="border-slate-200 bg-white hover:border-blue-300 rounded-xl h-auto py-3 transition-all">
                      <div className="flex flex-col items-start gap-1 w-full">
                        <div className="flex items-center gap-2 text-slate-500">
                          <Circle className="h-4 w-4" />
                          <span className="text-xs font-medium">优先级</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className={`text-base ${selectedPriority?.color}`}>{selectedPriority?.icon}</span>
                          <span className={`text-sm font-semibold ${selectedPriority?.color}`}>{selectedPriority?.label}</span>
                        </div>
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORITIES.map((pri) => (
                        <SelectItem key={pri.value} value={pri.value}>
                          <div className="flex items-center gap-2">
                            <span className={`${pri.color}`}>{pri.icon}</span>
                            <span>{pri.label}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* AI 智能推荐按钮 */}
                {task.title && task.category && task.priority && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                  >
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowSmartSuggestion(!showSmartSuggestion)}
                      className={`border ${
                        showSmartSuggestion 
                          ? 'border-[#06b6d4] bg-[#e0f2fe] text-[#0891b2] shadow-sm' 
                          : 'border-[#bae6fd] text-[#0284c7] hover:bg-[#f0f9ff] hover:border-[#7dd3fc]'
                      } rounded-[10px]`}
                    >
                      <Sparkles className="w-4 h-4 mr-2" />
                      <span className="font-medium">AI 智能推荐</span>
                    </Button>
                  </motion.div>
                )}

                {/* 智能提醒建议 */}
                <AnimatePresence>
                  {showSmartSuggestion && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="col-span-full"
                    >
                      <SmartReminderSuggestion
                        task={task}
                        onApply={(datetime) => {
                          const newDate = new Date(datetime);
                          setTask({
                            ...task,
                            reminder_time: newDate,
                            time: format(newDate, "HH:mm"),
                            optimal_reminder_time: datetime
                          });
                          setShowSmartSuggestion(false);
                        }}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* 重复设置和团队分配 */}
                <div className="flex items-center gap-2 flex-wrap">
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
                    <SelectTrigger className="w-auto border-slate-200 bg-white hover:border-blue-300 rounded-lg">
                      <div className="flex items-center gap-2">
                        <Repeat className="h-4 w-4 text-slate-500" />
                        <SelectValue placeholder="重复" />
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">不重复</SelectItem>
                      <SelectItem value="daily">每天</SelectItem>
                      <SelectItem value="weekly">每周</SelectItem>
                      <SelectItem value="monthly">每月</SelectItem>
                      <SelectItem value="custom">自定义...</SelectItem>
                    </SelectContent>
                  </Select>

                  {getRecurrenceLabel() && task.repeat_rule !== "none" && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                    >
                      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300">
                        <Repeat className="w-3 h-3 mr-1" />
                        {getRecurrenceLabel()}
                      </Badge>
                    </motion.div>
                  )}

                  {templates && templates.length > 0 && (
                      <Select onValueChange={(val) => {
                          const t = templates.find(t => t.id === val);
                          loadTemplate(t);
                      }}>
                          <SelectTrigger className="w-auto border-dashed border-purple-200 bg-purple-50/50 hover:bg-purple-50 text-purple-700 rounded-[10px] mr-2">
                              <div className="flex items-center gap-2">
                                  <BookTemplate className="h-4 w-4" />
                                  <span className="font-medium">模板</span>
                              </div>
                          </SelectTrigger>
                          <SelectContent>
                              {templates.map(t => (
                                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                              ))}
                          </SelectContent>
                      </Select>
                  )}

                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowAssignment(true)}
                    className="border border-blue-100 bg-blue-50/50 hover:bg-blue-50 hover:border-blue-300 rounded-[10px] group transition-all"
                  >
                    <Users className="h-4 w-4 mr-2 text-blue-600 group-hover:scale-110 transition-transform" />
                    <span className="text-blue-700 font-medium">团队分配</span>
                    {task.assigned_to && task.assigned_to.length > 0 && (
                      <Badge className="ml-2 bg-blue-600 text-white rounded-md">
                        {task.assigned_to.length}
                      </Badge>
                    )}
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowDependencies(true)}
                    className="border border-orange-100 bg-orange-50/50 hover:bg-orange-50 hover:border-orange-300 rounded-[10px] group transition-all"
                  >
                    <ListTodo className="h-4 w-4 mr-2 text-orange-600 group-hover:scale-110 transition-transform" />
                    <span className="text-orange-700 font-medium">依赖约定</span>
                    {task.dependencies && task.dependencies.length > 0 && (
                      <Badge className="ml-2 bg-orange-600 text-white rounded-md">
                        {task.dependencies.length}
                      </Badge>
                    )}
                  </Button>

                  {/* 模板选择 */}
                  {templates && templates.length > 0 && (
                      <Select onValueChange={(val) => {
                          const t = templates.find(t => t.id === val);
                          loadTemplate(t);
                      }}>
                          <SelectTrigger className="w-auto border-dashed border-purple-200 bg-purple-50/50 hover:bg-purple-50 text-purple-700 rounded-[10px]">
                              <div className="flex items-center gap-2">
                                  <BookTemplate className="h-4 w-4" />
                                  <span className="font-medium">从模板加载</span>
                              </div>
                          </SelectTrigger>
                          <SelectContent>
                              {templates.map(t => (
                                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                              ))}
                          </SelectContent>
                      </Select>
                  )}
                </div>

                {/* 高级设置 */}
                <Collapsible open={showSettings} onOpenChange={setShowSettings}>
                  <CollapsibleTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full border border-[#dce4ed] bg-white hover:bg-[#f9fafb] hover:border-[#c8d1e0] rounded-[12px] text-[#222222] transition-all"
                    >
                      <Settings className="w-4 h-4 mr-2" />
                      <span>{showSettings ? "收起" : "展开"}高级设置</span>
                      <Bell className="w-4 h-4 ml-auto text-slate-400" />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-4">
                    <NotificationSettings
                      taskDefaults={task}
                      onUpdate={(settings) => setTask({ ...task, ...settings })}
                    />
                  </CollapsibleContent>
                </Collapsible>

                {/* 操作按钮 */}
                <div className="flex items-center gap-2 md:gap-3 pt-2">
                  <Button
                    type="submit"
                    className="flex-1 bg-gradient-to-r from-[#384877] to-[#3b5aa2] hover:from-[#2c3b63] hover:to-[#2a4585] text-white rounded-xl h-11 md:h-12 text-sm md:text-base font-semibold shadow-lg shadow-[#384877]/25 hover:shadow-[#384877]/40 transition-all disabled:opacity-70 disabled:cursor-not-allowed"
                    disabled={!task.title.trim() || !task.reminder_time || isSubmitting}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 md:w-5 md:h-5 mr-1.5 md:mr-2 animate-spin" strokeWidth={2.5} />
                        {initialData ? "保存中..." : "创建中..."}
                      </>
                    ) : (
                      initialData ? (
                        <>
                          <Sparkles className="w-4 h-4 md:w-5 md:h-5 mr-1.5 md:mr-2" strokeWidth={2.5} />
                          保存修改
                        </>
                      ) : (
                        <>
                          <Plus className="w-4 h-4 md:w-5 md:h-5 mr-1.5 md:mr-2" strokeWidth={2.5} />
                          创建约定
                        </>
                      )
                    )}
                    {!isSubmitting && (
                      <kbd className="ml-auto hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-mono bg-white/10 rounded border border-white/20">
                        <span>⌘</span>↵
                      </kbd>
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setIsExpanded(false);
                      setShowSettings(false);
                      setShowRecurrence(false);
                    }}
                    className="rounded-xl md:rounded-[12px] h-11 md:h-12 px-4 md:px-6 border border-[#dce4ed] text-[#222222] hover:bg-[#f9fafb] font-medium text-sm md:text-base"
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

      {/* 团队分配 */}
      <Dialog open={showAssignment} onOpenChange={setShowAssignment}>
        <DialogContent>
          <TaskAssignment
            selectedUsers={task.assigned_to}
            onUpdate={(settings) => {
              setTask({ ...task, ...settings });
            }}
            onClose={() => setShowAssignment(false)}
          />
        </DialogContent>
      </Dialog>

      {/* 依赖选择 */}
      <Dialog open={showDependencies} onOpenChange={setShowDependencies}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ListTodo className="w-5 h-5 text-orange-600" />
              依赖约定
            </DialogTitle>
          </DialogHeader>
          <TaskDependencySelector
            selectedDependencies={task.dependencies}
            currentTaskId={initialData?.id}
            onUpdate={(deps) => {
              setTask({ ...task, dependencies: deps });
            }}
            onClose={() => setShowDependencies(false)}
          />
        </DialogContent>
      </Dialog>



      {/* 语音输入对话框 */}
      <Dialog open={showVoiceDialog} onOpenChange={setShowVoiceDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-800">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-blue-500" />
                <span>AI 语音助手</span>
              </div>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* 录音按钮区域 */}
            <div className="flex justify-center">
              <Button
                size="lg"
                onClick={stopRecording}
                disabled={isProcessing}
                className="relative h-32 w-32 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 border-4 border-blue-200 hover:border-blue-300 transition-all duration-300 shadow-2xl shadow-blue-500/30"
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
                      <span className="text-xs font-medium text-white">AI解析中</span>
                    </motion.div>
                  )}
                </AnimatePresence>

                {isRecording && !isProcessing && (
                  <>
                    <motion.div
                      className="absolute inset-0 rounded-full bg-blue-400"
                      animate={{
                        scale: [1, 1.3, 1],
                        opacity: [0.5, 0, 0.5],
                      }}
                      transition={{
                        duration: 2,
                        repeat: Infinity,
                        ease: "easeInOut",
                      }}
                    />
                    <motion.div
                      className="absolute inset-0 rounded-full bg-blue-300"
                      animate={{
                        scale: [1, 1.5, 1],
                        opacity: [0.3, 0, 0.3],
                      }}
                      transition={{
                        duration: 2,
                        repeat: Infinity,
                        ease: "easeInOut",
                        delay: 0.5,
                      }}
                    />
                  </>
                )}
              </Button>
            </div>

            {/* 识别文本区域 - 固定高度避免跳动 */}
            <div className="min-h-[140px]">
              <AnimatePresence mode="wait">
                {transcript ? (
                  <motion.div
                    key="transcript"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                    className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-4 border-2 border-blue-200"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <motion.div
                        animate={{ scale: [1, 1.2, 1] }}
                        transition={{ duration: 1, repeat: Infinity }}
                        className="w-2 h-2 rounded-full bg-blue-500"
                      />
                      <span className="text-sm font-semibold text-blue-700">实时识别</span>
                    </div>
                    <p className="text-base text-slate-700 leading-relaxed max-h-24 overflow-y-auto font-medium">
                      {transcript}
                    </p>
                  </motion.div>
                ) : (
                  <motion.div
                    key="placeholder"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                    className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl p-4 border-2 border-dashed border-slate-200"
                  >
                    <div className="flex items-center justify-center h-full min-h-[100px]">
                      <div className="text-center">
                        <motion.div
                          animate={{ scale: [1, 1.1, 1] }}
                          transition={{ duration: 2, repeat: Infinity }}
                          className="mb-2"
                        >
                          <Mic className="w-8 h-8 text-slate-300 mx-auto" />
                        </motion.div>
                        <p className="text-sm text-slate-400 font-medium">等待语音输入...</p>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* 使用提示 */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-200">
              <div className="flex gap-3">
                <Wand2 className="w-5 h-5 text-[#0891b2] flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-[15px] font-semibold text-[#222222] mb-2">💡 使用提示</p>
                  <ul className="text-[13px] text-[#52525b] space-y-1.5 leading-relaxed">
                    <li className="flex items-start gap-2">
                      <span className="text-[#06b6d4] mt-0.5">•</span>
                      <span>直接说出约定内容，AI 自动识别</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-[#06b6d4] mt-0.5">•</span>
                      <span>例如："明天下午3点提醒我开会"</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-[#06b6d4] mt-0.5">•</span>
                      <span>支持创建多个约定和子约定</span>
                    </li>
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