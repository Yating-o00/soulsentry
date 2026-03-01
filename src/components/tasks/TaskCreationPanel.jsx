import React, { useState, useEffect, useRef } from "react";
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
import { Calendar as CalendarIcon, Clock, Plus, Settings, Repeat, Mic, MicOff, Loader2, Wand2, Sparkles, Circle, Tag, Bell, Users, ListTodo, Trash2, BookTemplate, CheckSquare, X, GitMerge, ImagePlus, FileText, ScanText } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { motion, AnimatePresence } from "framer-motion";
import NotificationSettings from "../notifications/NotificationSettings";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import RecurrenceEditor from "./RecurrenceEditor";
import CustomTimePicker from "./CustomTimePicker";
import TaskAssignment from "./TaskAssignment";
import SmartReminderSuggestion from "./SmartReminderSuggestion";
import AITaskEnhancer from "./AITaskEnhancer";
import TaskDependencySelector from "./TaskDependencySelector";
import UnifiedTaskInput from "./UnifiedTaskInput";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { logUserBehavior } from "@/components/utils/behaviorLogger";
import AIText from "@/components/AIText";

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

export default function TaskCreationPanel({ onAddTask, initialData = null, onCancel }) {
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
  const [showOCRDialog, setShowOCRDialog] = useState(false);
  const [ocrFile, setOcrFile] = useState(null);
  const [ocrPreview, setOcrPreview] = useState(null);
  const [isOCRProcessing, setIsOCRProcessing] = useState(false);
  const ocrInputRef = React.useRef(null);
  const [isStartTimeOpen, setIsStartTimeOpen] = useState(false);
  const [suggestedTags, setSuggestedTags] = useState([]);
  const [isSuggestingTags, setIsSuggestingTags] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [openSubtaskTimeIdx, setOpenSubtaskTimeIdx] = useState(null);
  const [smartInputValue, setSmartInputValue] = useState("");
  
  const { data: templates } = useQuery({
    queryKey: ['task-templates'],
    queryFn: () => base44.entities.TaskTemplate.list(),
    enabled: isExpanded 
  });

  const addSubtask = () => {
    setTask(prev => ({
      ...prev,
      subtasks: [...(prev.subtasks || []), { 
        title: "", 
        is_completed: false,
        priority: prev.priority,
        category: prev.category,
        time: prev.time
      }]
    }));
  };

  const updateSubtask = (index, field, value) => {
    const newSubtasks = [...(task.subtasks || [])];
    newSubtasks[index][field] = value;
    setTask(prev => ({ ...prev, subtasks: newSubtasks }));
  };

  const removeSubtask = (index) => {
    const newSubtasks = (task.subtasks || []).filter((_, i) => i !== index);
    setTask(prev => ({ ...prev, subtasks: newSubtasks }));
  };

  const [task, setTask] = useState({
    id: initialData?.id || null,
    title: initialData?.title || "",
    description: initialData?.description || "",
    reminder_time: initialData?.reminder_time ? new Date(initialData.reminder_time) : new Date(),
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
    tags: initialData?.tags || []
  });

  useEffect(() => {
    if (!task.title || task.title.length < 2) return;
    
    const timer = setTimeout(async () => {
      setIsSuggestingTags(true);
      try {
        const now = new Date().toISOString();
        const res = await base44.integrations.Core.InvokeLLM({
          prompt: `分析约定标题和描述，智能推荐标签、优先级和截止日期。
Title: "${task.title}"
${task.description ? `Description: "${task.description}"` : ''}
Current Time: ${now}

Please provide:
1. Tags (3 short tags)
2. Priority (low/medium/high/urgent)
3. Deadline (if inferred)
4. Reasoning

Return JSON.`,
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
          if (res.tags) {
            const currentTags = task.tags || [];
            const newSuggestions = res.tags.filter(t => !currentTags.includes(t));
            setSuggestedTags(newSuggestions);
          }

          if (res.priority && res.priority !== task.priority) {
            toast.info(`💡 AI建议优先级: ${res.priority}`, { duration: 3000 });
          }
        }
      } catch (e) {
        console.error("AI Analysis failed:", e);
      } finally {
        setIsSuggestingTags(false);
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [task.title, task.description]);

  const addTag = (tag) => {
    const currentTags = task.tags || [];
    if (!currentTags.includes(tag)) {
        setTask(prev => ({ ...prev, tags: [...currentTags, tag] }));
        setSuggestedTags(prev => prev.filter(t => t !== tag));
    }
  };

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
      if (event.error === 'not-allowed') {
        toast.error("请允许麦克风权限");
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
      if (recognitionRef.current) recognitionRef.current.stop();
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

  const handleOCRFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setOcrFile(file);
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (ev) => setOcrPreview(ev.target.result);
      reader.readAsDataURL(file);
    } else {
      setOcrPreview(null);
    }
    setShowOCRDialog(true);
  };

  const handleOCRProcess = async () => {
    if (!ocrFile) return;
    setIsOCRProcessing(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file: ocrFile });
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `请识别图片或文档中的文字内容，提取其中的约定、任务、时间、地点等关键信息，并生成结构化任务数据。
当前时间: ${new Date().toISOString()}
请从文件内容中提取任务信息并返回JSON。如果有多个任务，返回最主要的一个。`,
        file_urls: [file_url],
        response_json_schema: {
          type: "object",
          properties: {
            title: { type: "string", description: "任务标题" },
            description: { type: "string", description: "详细描述" },
            reminder_time: { type: "string", description: "ISO格式时间，如无则返回明天9点" },
            priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
            category: { type: "string", enum: ["work", "personal", "health", "study", "family", "shopping", "finance", "other"] },
            extracted_text: { type: "string", description: "从文件中提取的原始文字" },
            subtasks: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
                  category: { type: "string", enum: ["work", "personal", "health", "study", "family", "shopping", "finance", "other"] },
                  time: { type: "string", description: "建议执行时间，格式 HH:mm" }
                },
                required: ["title"]
              }
            }
          },
          required: ["title"]
        }
      });

      if (result?.title) {
        const reminderDate = result.reminder_time ? new Date(result.reminder_time) : (() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0); return d; })();
        setTask(prev => ({
          ...prev,
          title: result.title,
          description: result.description || (result.extracted_text ? `原文:\n${result.extracted_text}` : ""),
          reminder_time: reminderDate,
          time: format(reminderDate, "HH:mm"),
          priority: result.priority || "medium",
          category: result.category || "personal",
          subtasks: [
            ...(prev.subtasks || []),
            ...(result.subtasks || []).map(st => ({
              ...st,
              priority: st.priority || result.priority || "medium",
              category: st.category || result.category || "personal",
              time: st.time || format(reminderDate, "HH:mm")
            }))
          ]
        }));
        setIsExpanded(true);
        setShowOCRDialog(false);
        setOcrFile(null);
        setOcrPreview(null);
        toast.success("✨ AI已识别并填充约定信息");
      } else {
        toast.error("未能识别到有效内容");
      }
    } catch (err) {
      console.error("OCR failed:", err);
      toast.error("识别失败，请重试");
    } finally {
      setIsOCRProcessing(false);
    }
  };

  const parseSmartInput = async (inputText) => {
    setIsProcessing(true);
    try {
      const response = await base44.integrations.Core.InvokeLLM({
        prompt: `Parse tasks from text: ${inputText}. Return JSON with tasks array.`,
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
                  category: { type: "string" }
                },
                required: ["title", "reminder_time"]
              }
            }
          }
        }
      });

      if (response.tasks && response.tasks.length > 0) {
        setShowVoiceDialog(false);
        setTranscript("");
        setIsProcessing(false);
        
        // Populate form with first task
        const first = response.tasks[0];
        setTask(prev => ({
            ...prev,
            title: first.title,
            description: first.description || "",
            reminder_time: new Date(first.reminder_time),
            time: format(new Date(first.reminder_time), "HH:mm"),
            priority: first.priority || "medium",
            category: first.category || "personal"
        }));
        setIsExpanded(true);
        toast.success("✨ 已识别并填充");
      } else {
        toast.error("未能识别");
        setShowVoiceDialog(false);
      }
    } catch (error) {
      console.error("Parse failed:", error);
      toast.error("解析失败");
      setShowVoiceDialog(false);
    }
    setIsProcessing(false);
  };

  // Handler for AI suggestions applied from AITaskEnhancer
  const handleAIApply = (aiSuggestions) => {
    // 1. 明确解构 aiSuggestions 中的 subtasks 和 tags，以及其他相关字段
    const {
      subtasks: newAiSubtasks,
      tags: newAiTags,
      reminder_time,
      end_time,
      description,
      category,
      priority,
      ai_analysis,
    } = aiSuggestions;

    // 2. 在 updates 对象中单独处理 reminder_time 和 end_time
    const updates = { description, category, priority };

    let parsedReminderTimeStr = null;
    if (reminder_time) {
      const dateObj = new Date(reminder_time);
      if (!isNaN(dateObj.getTime())) {
        updates.reminder_time = dateObj;
        parsedReminderTimeStr = format(dateObj, "HH:mm");
        updates.time = parsedReminderTimeStr;
      }
    }

    if (end_time) {
      const endDateObj = new Date(end_time);
      if (!isNaN(endDateObj.getTime())) {
        updates.end_time = endDateObj;
        updates.end_time_str = format(endDateObj, "HH:mm");
        updates.has_end_time = true;
      }
    }

    if (ai_analysis) {
      updates.ai_analysis = ai_analysis;
    }

    // 3. 在构建 aiSubtasks 数组时，使用正确解析后的时间字符串
    const aiSubtasks = (newAiSubtasks || [])
      .map(st => ({
        title: typeof st === 'string' ? st : (st.title || ""),
        is_completed: false,
        priority: (typeof st === 'object' && st.priority) || priority || "medium",
        category: (typeof st === 'object' && st.category) || category || "personal",
        time: (typeof st === 'object' && st.time) || parsedReminderTimeStr || "09:00"
      }))
      .filter(st => st.title.trim());

    // 4. 在 setTask 调用中，首先应用其他更新，然后显式地合并并设置 subtasks 和 tags 数组
    setTask(prev => {
      const existingValidSubtasks = (prev.subtasks || []).filter(st => st.title && st.title.trim());
      const mergedTags = Array.from(new Set([...(prev.tags || []), ...(newAiTags || [])]));

      return {
        ...prev,
        ...updates,
        subtasks: [...existingValidSubtasks, ...aiSubtasks],
        tags: mergedTags,
      };
    });
  };

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
      const [hours = '09', minutes = '00'] = task.time.split(':');
      reminderDateTime.setHours(parseInt(hours), parseInt(minutes), 0);
      
      if (task.has_end_time && task.end_time_str) {
         if (!endDateTime) endDateTime = new Date(reminderDateTime);
         const [eh, em] = task.end_time_str.split(':');
         endDateTime.setHours(parseInt(eh), parseInt(em), 0);
      }
    }

    const taskToSubmit = {
      ...task,
      reminder_time: reminderDateTime.toISOString(),
      end_time: endDateTime ? endDateTime.toISOString() : null,
      status: 'pending'
    };

    try {
      if (onAddTask) {
        await onAddTask(taskToSubmit);
      } else {
        // Create parent task first
        const { subtasks, ...parentTaskData } = taskToSubmit;
        const createdTask = await base44.entities.Task.create(parentTaskData);
        
        // Create subtasks if any
        if (subtasks && subtasks.length > 0) {
           await Promise.all(subtasks.filter(st => st.title.trim()).map(st => {
             let stReminderTime = createdTask.reminder_time;
             if (st.time) {
                const parentDate = new Date(createdTask.reminder_time);
                const [h, m] = st.time.split(':');
                parentDate.setHours(parseInt(h), parseInt(m), 0);
                stReminderTime = parentDate.toISOString();
             }

             return base44.entities.Task.create({
               title: st.title,
               parent_task_id: createdTask.id,
               status: 'pending',
               priority: st.priority || createdTask.priority,
               category: st.category || createdTask.category,
               reminder_time: stReminderTime
             });
           }));
        }
      }
      
      triggerHaptic('success');
      logUserBehavior("task_created", taskToSubmit);

      if (!initialData) {
        setTask({
            title: "",
            description: "",
            reminder_time: new Date(),
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
            subtasks: [],
            tags: []
        });
        setIsExpanded(false);
        setShowSettings(false);
        setShowRecurrence(false);
        setSmartInputValue("");
      }
    } catch (error) {
      console.error("Save failed:", error);
      toast.error("保存失败");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getRecurrenceLabel = () => {
    if (task.repeat_rule === "daily") return "每天";
    if (task.repeat_rule === "weekly") return "每周";
    if (task.repeat_rule === "monthly") return "每月";
    if (task.repeat_rule === "custom") return "自定义";
    return null;
  };

  const selectedCategory = CATEGORIES.find(c => c.value === task.category);
  const selectedPriority = PRIORITIES.find(p => p.value === task.priority);

  return (
    <>
      <Card className="overflow-hidden border-0 shadow-md bg-white/95 backdrop-blur-sm mb-8">
        <div className="p-4 md:p-6">
          {!isExpanded ? (
            <Tabs defaultValue="smart" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-4 md:mb-6 h-10 md:h-12 bg-slate-100/50 p-1 rounded-xl">
                <TabsTrigger value="smart" className="rounded-[10px] text-xs md:text-sm font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-[#384877]"><AIText>新的约定</AIText></TabsTrigger>
                <TabsTrigger value="quick" className="rounded-[10px] text-xs md:text-sm font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-[#384877]"><AIText>快速创建</AIText></TabsTrigger>
              </TabsList>

              <TabsContent value="smart" className="mt-0">
                <UnifiedTaskInput
                  value={smartInputValue}
                  onChange={setSmartInputValue}
                  onAddTask={onAddTask}
                />
                
                <div className="mt-6 flex flex-wrap gap-3 animate-in fade-in slide-in-from-bottom-2 duration-500 delay-100">
                  <span className="text-xs font-medium text-slate-400 py-1.5">试一试:</span>
                  <button onClick={() => setSmartInputValue("周五前完成周报")} className="px-3 py-1.5 bg-blue-50 text-blue-600 rounded-full text-xs font-medium hover:bg-blue-100 transition-colors border border-blue-100">📅 周五前完成周报</button>
                  <button onClick={() => setSmartInputValue("下班后去超市买牛奶")} className="px-3 py-1.5 bg-green-50 text-green-600 rounded-full text-xs font-medium hover:bg-green-100 transition-colors border border-green-100">🛒 下班后去超市买牛奶</button>
                  <button onClick={() => setSmartInputValue("明天上午10点开会")} className="px-3 py-1.5 bg-amber-50 text-amber-600 rounded-full text-xs font-medium hover:bg-amber-100 transition-colors border border-amber-100">⏰ 明天上午10点开会</button>
                </div>
              </TabsContent>

              <TabsContent value="quick" className="mt-0 space-y-3 md:space-y-4">
                <div className="flex flex-col md:flex-row gap-3 md:gap-4">
                  <button
                    onClick={() => setIsExpanded(true)}
                    className="flex-1 group relative rounded-2xl md:rounded-[20px] border-2 border-dashed border-slate-200 hover:border-blue-300 bg-white hover:bg-slate-50 transition-all flex items-center justify-center gap-3 px-4 py-5 md:py-6"
                  >
                    <div className="h-12 w-12 md:h-14 md:w-14 rounded-xl md:rounded-2xl bg-white border border-slate-100 flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform flex-shrink-0">
                      <Plus className="w-6 h-6 md:w-7 md:h-7 text-[#384877]" strokeWidth={2.5} />
                    </div>
                    <div className="text-left flex-1">
                      <div className="font-bold text-slate-800 text-base md:text-lg whitespace-nowrap"><AIText>手动创建</AIText></div>
                      <div className="text-xs md:text-sm text-slate-500 font-medium whitespace-nowrap"><AIText>点击输入详情</AIText></div>
                    </div>
                  </button>

                  <button
                    onClick={() => ocrInputRef.current?.click()}
                    className="flex-1 group relative rounded-2xl md:rounded-[20px] bg-[#384877] text-white hover:bg-[#2c3b63] transition-all flex items-center justify-center gap-3 shadow-xl shadow-blue-900/20 px-4 py-5 md:py-6"
                  >
                    <div className="relative flex-shrink-0">
                      <div className="h-12 w-12 md:h-14 md:w-14 rounded-xl md:rounded-2xl bg-white/10 flex items-center justify-center group-hover:scale-110 transition-transform backdrop-blur-sm border border-white/10">
                        <ScanText className="w-6 h-6 md:w-7 md:h-7 text-white" />
                      </div>
                    </div>
                    <div className="text-left flex-1">
                      <div className="font-bold text-base md:text-lg whitespace-nowrap">图文识别</div>
                      <div className="text-xs md:text-sm text-blue-100/80 font-medium whitespace-nowrap">上传图片/文档 AI解析</div>
                    </div>
                  </button>
                  <input
                    ref={ocrInputRef}
                    type="file"
                    accept="image/*,.pdf,.doc,.docx,.txt"
                    className="hidden"
                    onChange={handleOCRFileSelect}
                  />
                </div>
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
                {/* 标题输入 */}
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

                <AITaskEnhancer
                  taskTitle={task.title}
                  currentDescription={task.description}
                  availableTemplates={templates}
                  onApply={handleAIApply}
                />

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
                          <button type="button" onClick={() => setTask(prev => ({...prev, tags: prev.tags.filter(t => t !== tag)}))} className="hover:bg-blue-300 rounded-full p-0.5">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </Badge>
                      ))}
                      {suggestedTags.length > 0 && (
                        <>
                          <span className="text-xs text-slate-400 flex items-center gap-1"><Sparkles className="w-3 h-3" /> 推荐:</span>
                          {suggestedTags.map(tag => (
                            <Badge key={tag} variant="outline" className="cursor-pointer border-dashed border-blue-300 text-blue-600 hover:bg-blue-50 transition-colors" onClick={() => addTag(tag)}>+ {tag}</Badge>
                          ))}
                        </>
                      )}
                      {isSuggestingTags && <Loader2 className="w-3 h-3 animate-spin text-slate-300" />}
                    </motion.div>
                  )}
                </AnimatePresence>

                <Textarea
                  placeholder="添加详细描述（可选）"
                  value={task.description}
                  onChange={(e) => setTask({ ...task, description: e.target.value })}
                  className="border-slate-200 bg-slate-50/50 focus-visible:ring-2 focus-visible:ring-blue-500/20 focus-visible:border-blue-500 rounded-xl resize-none text-base md:text-sm min-h-[100px] md:min-h-0"
                  rows={2}
                />

                <div className="flex items-center">
                  <button
                    type="button"
                    onClick={addSubtask}
                    className="flex items-center gap-2 text-sm text-slate-500 hover:text-[#384877] transition-colors font-medium py-1 px-1 rounded-md hover:bg-slate-50"
                  >
                    <GitMerge className="w-4 h-4" />
                    <span>添加子约定</span>
                  </button>
                </div>

                <AnimatePresence>
                  {task.subtasks && task.subtasks.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="space-y-2 pl-2 border-l-2 border-slate-100 ml-2"
                    >
                      {task.subtasks.map((subtask, index) => (
                        <div key={index} className="p-3 bg-slate-50/50 rounded-xl border border-slate-100 space-y-2">
                           <div className="flex items-center gap-2">
                             <Input
                                value={subtask.title}
                                onChange={(e) => updateSubtask(index, 'title', e.target.value)}
                                placeholder={`子约定 ${index + 1}`}
                                className="bg-white border-slate-200 text-slate-700"
                             />
                             <Button type="button" variant="ghost" size="icon" onClick={() => removeSubtask(index)} className="text-slate-400 hover:text-red-500 shrink-0 h-9 w-9">
                                <X className="h-4 w-4" />
                             </Button>
                           </div>

                           <div className="flex items-center gap-2 text-sm">
                             <Select value={subtask.category} onValueChange={(val) => updateSubtask(index, 'category', val)}>
                                <SelectTrigger className="h-8 w-[100px] border-slate-200 bg-white text-xs px-2 text-slate-700">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {CATEGORIES.map(cat => <SelectItem key={cat.value} value={cat.value} className="text-xs text-slate-700">{cat.label}</SelectItem>)}
                                </SelectContent>
                             </Select>

                             <Select value={subtask.priority} onValueChange={(val) => updateSubtask(index, 'priority', val)}>
                                <SelectTrigger className="h-8 w-[80px] border-slate-200 bg-white text-xs px-2 text-slate-700">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {PRIORITIES.map(pri => <SelectItem key={pri.value} value={pri.value} className="text-xs text-slate-700">{pri.label}</SelectItem>)}
                                </SelectContent>
                             </Select>

                             <Input
                                type="time"
                                value={subtask.time || task.time}
                                onChange={(e) => updateSubtask(index, 'time', e.target.value)}
                                className="h-8 w-auto text-xs font-medium px-2 bg-white text-slate-700"
                             />
                           </div>
                        </div>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Quick Settings */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
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
                                     {task.reminder_time ? format(task.reminder_time, "M月d日", { locale: zhCN }) : "点击选择"}
                                </div>
                            </div>
                         </div>
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={task.reminder_time}
                        onSelect={(date) => date && setTask({ ...task, reminder_time: date })}
                        locale={zhCN}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>

                  {!task.is_all_day && (
                    <div className="group flex items-center gap-3 w-full p-3 rounded-xl border border-slate-200 bg-white hover:border-blue-300 transition-all">
                         <div className="h-10 w-10 rounded-lg bg-purple-50 flex items-center justify-center flex-shrink-0 group-hover:bg-purple-100 transition-colors">
                            <Clock className="h-5 w-5 text-purple-500 group-hover:scale-110 transition-transform" />
                        </div>
                        <div className="flex-1 min-w-0">
                             <div className="flex items-center justify-between mb-0.5">
                                 <p className="text-xs font-medium text-slate-500">提醒时间</p>
                             </div>
                             <Input 
                                type="time" 
                                value={task.time} 
                                onChange={e => setTask({...task, time: e.target.value})}
                                className="h-6 p-0 border-0 text-sm font-bold text-slate-700"
                             />
                        </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 md:gap-4">
                  <Select value={task.category} onValueChange={(val) => setTask({ ...task, category: val })}>
                    <SelectTrigger className="border-slate-200 bg-white hover:border-blue-300 rounded-xl h-auto py-3">
                      <div className="flex flex-col items-start gap-1 w-full">
                        <span className="text-xs font-medium text-slate-500">类别</span>
                        <div className="flex items-center gap-1.5">
                          <span>{selectedCategory?.icon}</span>
                          <span className="text-sm font-semibold">{selectedCategory?.label}</span>
                        </div>
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((cat) => (
                        <SelectItem key={cat.value} value={cat.value}>
                          {cat.icon} {cat.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={task.priority} onValueChange={(val) => setTask({ ...task, priority: val })}>
                    <SelectTrigger className="border-slate-200 bg-white hover:border-blue-300 rounded-xl h-auto py-3">
                      <div className="flex flex-col items-start gap-1 w-full">
                        <span className="text-xs font-medium text-slate-500">优先级</span>
                        <div className="flex items-center gap-1.5">
                          <span className={selectedPriority?.color}>{selectedPriority?.icon}</span>
                          <span className={`text-sm font-semibold ${selectedPriority?.color}`}>{selectedPriority?.label}</span>
                        </div>
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORITIES.map((pri) => (
                        <SelectItem key={pri.value} value={pri.value}>
                          {pri.icon} {pri.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Additional Buttons */}
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

                  <Button type="button" variant="outline" onClick={() => setShowAssignment(true)} className="border-blue-100 bg-blue-50/50 text-blue-700">
                    <Users className="h-4 w-4 mr-2" /> 分配
                  </Button>
                  
                  <Button type="button" variant="outline" onClick={() => setShowDependencies(true)} className="border-orange-100 bg-orange-50/50 text-orange-700">
                    <ListTodo className="h-4 w-4 mr-2" /> 依赖
                  </Button>
                </div>

                <Collapsible open={showSettings} onOpenChange={setShowSettings}>
                  <CollapsibleTrigger asChild>
                    <Button type="button" variant="outline" className="w-full">
                      <Settings className="w-4 h-4 mr-2" /> {showSettings ? "收起" : "展开"}高级设置
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-4">
                    <NotificationSettings taskDefaults={task} onUpdate={(s) => setTask({ ...task, ...s })} />
                  </CollapsibleContent>
                </Collapsible>

                <div className="flex items-center gap-3 pt-2">
                  <Button type="submit" className="flex-1 bg-[#384877] hover:bg-[#2c3b63] text-white rounded-xl h-12" disabled={isSubmitting}>
                    {isSubmitting ? <Loader2 className="animate-spin mr-2" /> : <Plus className="mr-2" />}
                    {initialData ? "保存修改" : "创建约定"}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => onCancel ? onCancel() : setIsExpanded(false)} className="rounded-xl h-12 px-6">
                    取消
                  </Button>
                </div>
              </motion.form>
            </AnimatePresence>
          )}
        </div>
      </Card>

      <Dialog open={showRecurrence} onOpenChange={setShowRecurrence}>
        <DialogContent><DialogTitle>重复规则</DialogTitle><RecurrenceEditor value={task.custom_recurrence} onChange={(r) => setTask({ ...task, custom_recurrence: r, repeat_rule: "custom" })} onClose={() => setShowRecurrence(false)} /></DialogContent>
      </Dialog>
      <Dialog open={showAssignment} onOpenChange={setShowAssignment}>
        <DialogContent><TaskAssignment selectedUsers={task.assigned_to} onUpdate={(s) => setTask({ ...task, ...s })} onClose={() => setShowAssignment(false)} /></DialogContent>
      </Dialog>
      <Dialog open={showDependencies} onOpenChange={setShowDependencies}>
        <DialogContent><TaskDependencySelector selectedDependencies={task.dependencies} onUpdate={(d) => setTask({ ...task, dependencies: d })} onClose={() => setShowDependencies(false)} /></DialogContent>
      </Dialog>
      
      <Dialog open={showVoiceDialog} onOpenChange={setShowVoiceDialog}>
        <DialogContent className="max-w-md">
           <DialogHeader><DialogTitle>AI 语音助手</DialogTitle></DialogHeader>
           <div className="flex flex-col items-center py-6 gap-6">
              <Button size="lg" onClick={stopRecording} disabled={isProcessing} className={`h-24 w-24 rounded-full ${isRecording ? 'bg-red-500 hover:bg-red-600' : 'bg-[#384877] hover:bg-[#2c3b63]'}`}>
                 {isProcessing ? <Loader2 className="h-10 w-10 animate-spin" /> : isRecording ? <MicOff className="h-10 w-10" /> : <Mic className="h-10 w-10" />}
              </Button>
              <div className="w-full bg-slate-50 p-4 rounded-xl min-h-[100px] text-center text-slate-600">
                  {transcript || (isRecording ? "正在听..." : "点击麦克风开始说话")}
              </div>
           </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showOCRDialog} onOpenChange={(open) => { setShowOCRDialog(open); if (!open) { setOcrFile(null); setOcrPreview(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><ScanText className="w-5 h-5 text-[#384877]" /> AI 图文识别</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            {ocrPreview ? (
              <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-50 max-h-60 flex items-center justify-center">
                <img src={ocrPreview} alt="预览" className="max-h-60 object-contain" />
              </div>
            ) : ocrFile ? (
              <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
                <FileText className="w-8 h-8 text-[#384877] flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-slate-700 truncate">{ocrFile.name}</p>
                  <p className="text-xs text-slate-400">{(ocrFile.size / 1024).toFixed(1)} KB</p>
                </div>
              </div>
            ) : null}

            <p className="text-sm text-slate-500 text-center">AI 将识别文件中的文字，自动提取约定信息并填充表单</p>

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => ocrInputRef.current?.click()}>
                <ImagePlus className="w-4 h-4 mr-2" /> 重新选择
              </Button>
              <Button
                className="flex-1 bg-[#384877] hover:bg-[#2c3b63]"
                onClick={handleOCRProcess}
                disabled={isOCRProcessing || !ocrFile}
              >
                {isOCRProcessing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> 识别中...</> : <><ScanText className="w-4 h-4 mr-2" /> 开始识别</>}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}