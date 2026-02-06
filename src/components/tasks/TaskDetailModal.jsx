import React, { useState, useEffect as ReactUseEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Plus, 
  X, 
  Upload, 
  FileText, 
  Image as ImageIcon,
  Download,
  Trash2,
  CheckCircle2,
  Circle,
  StickyNote,
  History, 
  Clock, 
  Repeat, 
  Volume2, 
  Bell,
  Sparkles,
  Loader2,
  Languages
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import RecurrenceEditor from "./RecurrenceEditor";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import TaskComments from "./TaskComments";
import AITaskEnhancer from "./AITaskEnhancer";
import TaskDependencySelector from "./TaskDependencySelector";
import { Link as LinkIcon, BrainCircuit } from "lucide-react";
import ReminderStrategyEditor from "./ReminderStrategyEditor";
import ReactMarkdown from "react-markdown";
import { useTaskTranslation } from "@/components/hooks/useTaskTranslation";

export default function TaskDetailModal({ task: initialTaskData, open, onClose }) {
  const [uploading, setUploading] = useState(false);
  const [newSubtask, setNewSubtask] = useState("");
  const [newNote, setNewNote] = useState("");
  const [isAddingSubtask, setIsAddingSubtask] = useState(false);
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [showRecurrenceEditor, setShowRecurrenceEditor] = useState(false);
  const [isGeneratingSubtasks, setIsGeneratingSubtasks] = useState(false);
  const [showRegeneratePrompt, setShowRegeneratePrompt] = useState(false);
  const [originalContent, setOriginalContent] = useState({ title: "", description: "" });
  const { translateTask, isTranslating } = useTaskTranslation();
  const queryClient = useQueryClient();

  // Fetch completion history
  const { data: completionHistory = [] } = useQuery({
    queryKey: ['task-completions', initialTaskData?.id],
    queryFn: () => base44.entities.TaskCompletion.filter({ task_id: initialTaskData.id }, "-completed_at"),
    enabled: !!initialTaskData?.id && open,
  });

  // Fetch latest task data to ensure UI updates (e.g. after AI analysis)
  const { data: task = initialTaskData } = useQuery({
    queryKey: ['task', initialTaskData?.id],
    queryFn: async () => {
        const res = await base44.entities.Task.filter({ id: initialTaskData.id });
        return res[0];
    },
    enabled: !!initialTaskData?.id && open,
    initialData: initialTaskData,
  });

  // Track original content to detect changes
  React.useEffect(() => {
    if (task && open) {
      setOriginalContent({ 
        title: task.title, 
        description: task.description || "" 
      });
    }
  }, [task?.id, open]);

  const { data: subtasks = [] } = useQuery({
    queryKey: ['subtasks', task?.id],
    queryFn: () => base44.entities.Task.filter({ parent_task_id: task.id }),
    enabled: !!task?.id,
    initialData: [],
  });

  const updateTaskMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Task.update(id, data),
    onSuccess: (updatedTask, { data }) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['subtasks'] });
      queryClient.invalidateQueries({ queryKey: ['task', task?.id] });
      
      // Check if title or description changed and we have subtasks
      if ((data.title || data.description) && subtasks.length > 0) {
        const titleChanged = data.title && data.title !== originalContent.title;
        const descChanged = data.description !== undefined && data.description !== originalContent.description;
        
        if (titleChanged || descChanged) {
          setShowRegeneratePrompt(true);
          setTimeout(() => setShowRegeneratePrompt(false), 8000);
        }
      }
    },
  });

  const createSubtaskMutation = useMutation({
    mutationFn: (data) => base44.entities.Task.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subtasks'] });
      setNewSubtask("");
    },
  });

  const deleteSubtaskMutation = useMutation({
    mutationFn: (id) => base44.entities.Task.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subtasks'] });
    },
  });

  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const handleAutoGenerateSubtasks = async () => {
    if (!task.title && !task.description) {
      toast.error("请先填写约定内容");
      return;
    }

    setIsGeneratingSubtasks(true);
    try {
      const res = await base44.integrations.Core.InvokeLLM({
        prompt: `根据以下约定信息，生成3-5个合理的子约定步骤。

约定标题：${task.title}
约定描述：${task.description || "无"}
类别：${task.category}
优先级：${task.priority}

请生成具体、可执行的子约定，每个子约定应该是完成主约定的一个关键步骤。
返回JSON数组，每个子约定包含 title 和 priority。`,
        response_json_schema: {
          type: "object",
          properties: {
            subtasks: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  priority: { type: "string", enum: ["low", "medium", "high", "urgent"] }
                },
                required: ["title", "priority"]
              }
            }
          },
          required: ["subtasks"]
        }
      });

      if (res && res.subtasks && res.subtasks.length > 0) {
        for (const st of res.subtasks) {
          await createSubtaskMutation.mutateAsync({
            title: st.title,
            description: "",
            priority: st.priority,
            category: task.category,
            status: "pending",
            parent_task_id: task.id,
            reminder_time: task.reminder_time,
            end_time: task.end_time
          });
        }
        toast.success(`已生成 ${res.subtasks.length} 个子约定`);
      }
    } catch (error) {
      console.error("AI生成子约定失败:", error);
      toast.error("生成失败，请重试");
    } finally {
      setIsGeneratingSubtasks(false);
    }
  };

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    setUploading(true);
    try {
      const uploadPromises = files.map(async (file) => {
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        return {
          file_url,
          file_name: file.name,
          file_size: file.size,
          file_type: file.type,
          uploaded_at: new Date().toISOString(),
        };
      });

      const newAttachments = await Promise.all(uploadPromises);
      const currentAttachments = task.attachments || [];

      await updateTaskMutation.mutateAsync({
        id: task.id,
        data: {
          attachments: [...currentAttachments, ...newAttachments]
        }
      });

      toast.success("文件上传成功");
    } catch (error) {
      toast.error("文件上传失败");
    }
    setUploading(false);
  };

  const handleRemoveAttachment = async (index) => {
    const updatedAttachments = task.attachments.filter((_, i) => i !== index);
    await updateTaskMutation.mutateAsync({
      id: task.id,
      data: { attachments: updatedAttachments }
    });
  };

  const handleAddSubtask = async () => {
    if (!newSubtask.trim() || isAddingSubtask) return;

    setIsAddingSubtask(true);
    try {
      await createSubtaskMutation.mutateAsync({
        title: newSubtask,
        parent_task_id: task.id,
        reminder_time: task.reminder_time,
        end_time: task.end_time,
        category: task.category,
        priority: task.priority,
        status: "pending",
      });
    } finally {
      setIsAddingSubtask(false);
    }
  };

  const handleToggleSubtask = async (subtask) => {
    const newStatus = subtask.status === "completed" ? "pending" : "completed";
    await updateTaskMutation.mutateAsync({
      id: subtask.id,
      data: { 
        status: newStatus,
        completed_at: newStatus === "completed" ? new Date().toISOString() : null
      }
    });

    // Update parent task progress
    const total = subtasks.length;
    const completed = subtasks.filter(s => 
      s.id === subtask.id ? newStatus === "completed" : s.status === "completed"
    ).length;
    const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

    await updateTaskMutation.mutateAsync({
      id: task.id,
      data: { progress }
    });
  };

  const handleEnhanceApply = async (enhancements) => {
    // Update task fields
    await updateTaskMutation.mutateAsync({
      id: task.id,
      data: {
        description: enhancements.description,
        category: enhancements.category,
        priority: enhancements.priority,
        tags: enhancements.tags
      }
    });

    // Create subtasks
    if (enhancements.subtasks && enhancements.subtasks.length > 0) {
      for (const st of enhancements.subtasks) {
        await createSubtaskMutation.mutateAsync({
          title: String(st || "新子约定"),
          parent_task_id: task.id,
          reminder_time: task.reminder_time,
          end_time: task.end_time,
          category: enhancements.category,
          priority: enhancements.priority,
          status: "pending",
        });
      }
    }
    
    toast.success("AI 优化已应用");
  };

  const handleAddNote = async () => {
    if (!newNote.trim() || isAddingNote) return;

    setIsAddingNote(true);
    try {
      const currentNotes = task.notes || [];
      const newNoteObj = {
        content: newNote,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      await updateTaskMutation.mutateAsync({
        id: task.id,
        data: {
          notes: [...currentNotes, newNoteObj]
        }
      });

      setNewNote("");
    } finally {
      setIsAddingNote(false);
    }
  };

    const handleUpdateDependencies = async (newDependencyIds) => {
      // Check if we need to update status
      // If we add a dependency that is NOT completed, task might become blocked
      // We'll let the backend or a separate logic handle status, but here we update the list
      // Or we can simple check here:

      // For now, just update the list. The parent component or logic should handle status updates if we want automation.
      // But user asked for "automatically mark". 
      // We can check the status of the added dependencies here.

      let newStatus = task.status;

      if (newDependencyIds.length > 0) {
           const allTasks = await base44.entities.Task.list(); // Ideally fetch only needed, but list is ok for now
           const blockingTasks = allTasks.filter(t => newDependencyIds.includes(t.id) && t.status !== 'completed');

           if (blockingTasks.length > 0 && task.status !== 'completed') {
               newStatus = 'blocked';
           } else if (blockingTasks.length === 0 && task.status === 'blocked') {
               newStatus = 'pending'; // Unblock if no blocking tasks
           }
      } else if (task.status === 'blocked') {
          newStatus = 'pending';
      }

      await updateTaskMutation.mutateAsync({
          id: task.id,
          data: { 
              dependencies: newDependencyIds,
              status: newStatus
          }
      });

      if (newStatus === 'blocked') {
          toast("约定已标记为阻塞状态 (等待前置约定完成)", { icon: "🚫" });
      }
    };

    const handleDeleteNote = async (index) => {
    const updatedNotes = task.notes.filter((_, i) => i !== index);
    await updateTaskMutation.mutateAsync({
      id: task.id,
      data: { notes: updatedNotes }
    });
  };

  if (!task) return null;

  const completedSubtasks = subtasks.filter(s => s.status === "completed").length;
  const totalSubtasks = subtasks.length;

  const handleTranslate = () => {
    translateTask(task, subtasks);
  };

  const handleAIAnalysis = async () => {
      setIsAnalyzing(true);
      try {
          // Prepare context
          const subtaskStatus = subtasks.map(s => `- ${s.title}: ${s.status}`).join('\n');
          
          // Filter media attachments for multimodal analysis
          const mediaAttachments = (task.attachments || [])
            .filter(att => att.file_type?.startsWith('image/') || att.file_type?.startsWith('video/'))
            .map(att => att.file_url);

          const context = `
            Task: ${task.title}
            Description: ${task.description || "None"}
            Priority: ${task.priority}
            Status: ${task.status}
            Progress: ${task.progress}%
            Subtasks:
            ${subtaskStatus}
          `;

          const res = await base44.integrations.Core.InvokeLLM({
              prompt: `基于提供的上下文和附件（图片/视频），分析此约定的状态、风险和依赖关系。
              
              Context:
              ${context}
              
              Tasks:
              1. 视觉分析（如果有媒体附件）：从附件中识别关键信息、阻碍因素或上下文。
              2. 状态摘要：结合文本和视觉见解生成简短摘要（2-3句）。强调任何进度的视觉证据或问题。
              3. 潜在风险：例如停滞的子约定、视觉缺陷、高优先级但进度低等。
              4. 关键依赖：从文本或视觉推断的先决条件。
              5. 可行的建议。
              6. 建议优先级：基于截止日期、风险和状态，建议优先级（low/medium/high/urgent）并提供理由。
              7. 风险评估：评估约定风险等级（low/medium/high/critical）。
              8. 时间建议：基于约定性质，建议最佳执行时间段（start/end）及理由。
              
              STRICT REQUIREMENT: All generated text content MUST be in SIMPLIFIED CHINESE (简体中文). Do NOT use English for descriptions, summaries, reasons, or suggestions. Even if the input is English, the output MUST be Chinese.
              
              Return ONLY JSON. Time format: ISO 8601.`,
              file_urls: mediaAttachments.length > 0 ? mediaAttachments : undefined,
              response_json_schema: {
                  type: "object",
                  properties: {
                      status_summary: { type: "string" },
                      risks: { type: "array", items: { type: "string" } },
                      risk_level: { type: "string", enum: ["low", "medium", "high", "critical"] },
                      key_dependencies: { type: "array", items: { type: "string" } },
                      suggestions: { type: "array", items: { type: "string" } },
                      suggested_priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
                      priority_reasoning: { type: "string" },
                      recommended_execution_start: { type: "string", format: "date-time" },
                      recommended_execution_end: { type: "string", format: "date-time" },
                      time_reasoning: { type: "string" }
                  },
                  required: ["status_summary", "risks", "suggested_priority", "risk_level"]
              }
          });

          if (res) {
              await updateTaskMutation.mutateAsync({
                  id: task.id,
                  data: { ai_analysis: res }
              });
              toast.success("AI 分析完成");
          }
      } catch (e) {
          console.error(e);
          toast.error("AI 分析失败");
      } finally {
          setIsAnalyzing(false);
      }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) onClose();
    }}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="flex flex-row items-center justify-between space-y-0 p-6 border-b shrink-0 bg-white z-10">
          <DialogTitle className="text-[20px] font-semibold tracking-tight text-[#222222] line-clamp-1 pr-8">
            {task.title}
          </DialogTitle>
          <div className="flex items-center gap-2 absolute right-12 top-6">
             <Button 
                variant="outline" 
                size="sm" 
                onClick={handleTranslate}
                disabled={isTranslating}
                className="h-8 text-xs bg-gradient-to-r from-blue-50 to-cyan-50 border-blue-200 text-blue-700 hover:from-blue-100 hover:to-cyan-100"
             >
                {isTranslating ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Languages className="w-3.5 h-3.5 mr-1" />}
                翻译
             </Button>
             <Button 
                variant="outline" 
                size="sm" 
                onClick={handleAIAnalysis}
                disabled={isAnalyzing}
                className="h-8 text-xs bg-gradient-to-r from-indigo-50 to-purple-50 border-purple-200 text-purple-700 hover:from-indigo-100 hover:to-purple-100"
             >
                {isAnalyzing ? <span className="animate-spin mr-1">⏳</span> : <span className="mr-1">✨</span>}
                AI 分析
             </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <AITaskEnhancer 
            taskTitle={task.title} 
            currentDescription={task.description} 
            onApply={handleEnhanceApply} 
          />


          {/* Progress */}
          {totalSubtasks > 0 && (
            <div className="space-y-2">
              <div className="flex justify-between text-[15px]">
                <span className="text-[#52525b]">完成进度</span>
                <span className="font-semibold text-[#5a647d]">
                  {completedSubtasks}/{totalSubtasks} 子约定
                </span>
              </div>
              <Progress value={task.progress || 0} className="h-2" />
            </div>
          )}

          {task.description && (
            <div className="bg-[#f9fafb] rounded-[12px] p-4 border border-[#e5e9ef]">
              <ReactMarkdown 
                className="prose prose-sm max-w-none text-[15px] text-[#222222] leading-relaxed
                  prose-headings:text-slate-900 prose-headings:font-semibold prose-headings:mb-2 prose-headings:mt-3 first:prose-headings:mt-0
                  prose-p:my-2 prose-p:leading-relaxed first:prose-p:mt-0 last:prose-p:mb-0
                  prose-ul:my-2 prose-ul:list-disc prose-ul:pl-5 prose-ul:space-y-1
                  prose-ol:my-2 prose-ol:list-decimal prose-ol:pl-5 prose-ol:space-y-1
                  prose-li:text-[#222222] prose-li:leading-relaxed
                  prose-strong:text-slate-900 prose-strong:font-semibold
                  prose-em:text-slate-700 prose-em:italic
                  prose-code:bg-slate-200 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:text-slate-800 prose-code:font-mono
                  prose-pre:bg-slate-800 prose-pre:text-slate-100 prose-pre:p-3 prose-pre:rounded-lg prose-pre:overflow-x-auto
                  prose-blockquote:border-l-4 prose-blockquote:border-[#384877] prose-blockquote:pl-4 prose-blockquote:italic prose-blockquote:text-slate-600
                  prose-hr:border-slate-200 prose-hr:my-4
                  prose-a:text-[#384877] prose-a:underline prose-a:font-medium hover:prose-a:text-[#2c3659]"
              >
                {task.description}
              </ReactMarkdown>
            </div>
          )}

          <Tabs defaultValue="subtasks" className="w-full">
            <TabsList className="flex w-full overflow-x-auto justify-start gap-2 p-1 bg-slate-100/80 rounded-xl h-auto scrollbar-hide">
              <TabsTrigger value="subtasks" className="flex-shrink-0 px-3 py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg transition-all">
                子约定 ({totalSubtasks})
              </TabsTrigger>
              <TabsTrigger value="dependencies" className="flex-shrink-0 px-3 py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg transition-all">
                依赖 ({task.dependencies?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="attachments" className="flex-shrink-0 px-3 py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg transition-all">
                附件 ({task.attachments?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="notes" className="flex-shrink-0 px-3 py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg transition-all">
                笔记 ({task.notes?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="comments" className="flex-shrink-0 px-3 py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg transition-all">
                评论
              </TabsTrigger>
              <TabsTrigger value="reminders" className="flex-shrink-0 px-3 py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg transition-all flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-blue-500" />
                提醒
              </TabsTrigger>
              <TabsTrigger value="history" className="flex-shrink-0 px-3 py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg transition-all flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-slate-500" />
                历史
              </TabsTrigger>
            </TabsList>

              {/* Reminders Tab */}
              <TabsContent value="reminders" className="space-y-4">
                  <div className="grid md:grid-cols-2 gap-4">
                      {/* Sound & Persistence */}
                      <div className="space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                          <h4 className="font-semibold text-slate-900 flex items-center gap-2">
                              <Bell className="w-4 h-4 text-slate-500" />
                              基础设置
                          </h4>
                          
                          <div className="space-y-3">
                              <div className="space-y-1">
                                  <Label className="text-xs text-slate-500">提醒音效</Label>
                                  <Select 
                                      value={task.notification_sound || "default"} 
                                      onValueChange={(val) => updateTaskMutation.mutate({ id: task.id, data: { notification_sound: val } })}
                                  >
                                      <SelectTrigger className="bg-white">
                                          <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                          <SelectItem value="default">默认</SelectItem>
                                          <SelectItem value="gentle">轻柔</SelectItem>
                                          <SelectItem value="urgent">紧急</SelectItem>
                                          <SelectItem value="chime">铃声</SelectItem>
                                          <SelectItem value="bells">钟声</SelectItem>
                                          <SelectItem value="none">静音</SelectItem>
                                      </SelectContent>
                                  </Select>
                              </div>

                              <div className="flex items-center justify-between pt-2">
                                  <div className="space-y-0.5">
                                      <Label className="text-sm">持续提醒</Label>
                                      <p className="text-[10px] text-slate-500">过期后持续响铃直到完成</p>
                                  </div>
                                  <Switch 
                                      checked={task.persistent_reminder || false}
                                      onCheckedChange={(checked) => updateTaskMutation.mutate({ id: task.id, data: { persistent_reminder: checked } })}
                                  />
                              </div>

                              {task.persistent_reminder && (
                                  <div className="space-y-1">
                                      <Label className="text-xs text-slate-500">提醒间隔 (分钟)</Label>
                                      <Input 
                                          type="number" 
                                          min="1"
                                          value={task.notification_interval || 15}
                                          onChange={(e) => updateTaskMutation.mutate({ id: task.id, data: { notification_interval: parseInt(e.target.value) || 15 } })}
                                          className="bg-white"
                                      />
                                  </div>
                              )}
                          </div>
                      </div>

                      {/* Recurrence & Advance */}
                      <div className="space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                           <h4 className="font-semibold text-slate-900 flex items-center gap-2">
                              <Clock className="w-4 h-4 text-slate-500" />
                              时间规则
                          </h4>

                          {/* Recurrence */}
                          <div className="bg-white p-3 rounded-lg border border-slate-200">
                              <div className="flex justify-between items-center mb-2">
                                  <span className="text-sm font-medium text-slate-700 flex items-center gap-2">
                                      <Repeat className="w-3.5 h-3.5 text-blue-500" />
                                      重复规则
                                  </span>
                                  <Button 
                                      variant="ghost" 
                                      size="sm" 
                                      onClick={() => setShowRecurrenceEditor(true)}
                                      className="h-6 text-xs text-blue-600 hover:text-blue-700"
                                  >
                                      编辑
                                  </Button>
                              </div>
                              <p className="text-xs text-slate-500">
                                  {task.repeat_rule === 'none' ? '不重复' : 
                                   task.repeat_rule === 'custom' ? '自定义重复' : 
                                   {daily: '每天', weekly: '每周', monthly: '每月'}[task.repeat_rule]}
                              </p>
                          </div>

                          {/* Advance Reminders */}
                          <div className="space-y-2">
                              <Label className="text-xs text-slate-500">提前提醒 (分钟)</Label>
                              <div className="flex flex-wrap gap-2">
                                  {(task.advance_reminders || []).map((min, idx) => (
                                      <Badge key={idx} variant="secondary" className="bg-white border border-slate-200 text-slate-600 gap-1 hover:bg-red-50 hover:text-red-600 hover:border-red-200 cursor-pointer group" onClick={() => {
                                          const newMins = task.advance_reminders.filter(m => m !== min);
                                          updateTaskMutation.mutate({ id: task.id, data: { advance_reminders: newMins } });
                                      }}>
                                          {min < 60 ? `${min}m` : `${min/60}h`}
                                          <X className="w-3 h-3 opacity-0 group-hover:opacity-100" />
                                      </Badge>
                                  ))}
                                  <Popover>
                                      <PopoverTrigger asChild>
                                          <Button variant="outline" size="sm" className="h-6 text-xs px-2 border-dashed bg-white">
                                              <Plus className="w-3 h-3 mr-1" /> 添加
                                          </Button>
                                      </PopoverTrigger>
                                      <PopoverContent className="w-40 p-2">
                                          <div className="grid grid-cols-2 gap-2">
                                              {[15, 30, 60, 120].map(m => (
                                                  <Button 
                                                      key={m} 
                                                      variant="ghost" 
                                                      size="sm" 
                                                      className="text-xs justify-start"
                                                      onClick={() => {
                                                          const current = task.advance_reminders || [];
                                                          if (!current.includes(m)) {
                                                              updateTaskMutation.mutate({ id: task.id, data: { advance_reminders: [...current, m].sort((a,b) => a-b) } });
                                                          }
                                                      }}
                                                  >
                                                      {m < 60 ? `${m}分钟` : `${m/60}小时`}
                                                  </Button>
                                              ))}
                                          </div>
                                      </PopoverContent>
                                  </Popover>
                              </div>
                          </div>
                      </div>
                  </div>
              </TabsContent>

              {/* AI Strategy Tab */}
              <TabsContent value="strategy" className="space-y-4">
                  <ReminderStrategyEditor 
                      task={task} 
                      onUpdate={(updates) => updateTaskMutation.mutate({
                          id: task.id,
                          data: updates
                      })}
                  />
              </TabsContent>

              {/* Dependencies Tab */}
              <TabsContent value="dependencies" className="space-y-4">
                <TaskDependencySelector 
                    currentTask={task}
                    selectedDependencyIds={task.dependencies || []}
                    onUpdate={handleUpdateDependencies}
                />
              </TabsContent>

              {/* Subtasks Tab */}
            <TabsContent value="subtasks" className="space-y-4">
              <AnimatePresence>
                {showRegeneratePrompt && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                  >
                    <Alert className="bg-gradient-to-r from-purple-50 to-indigo-50 border-purple-200">
                      <Sparkles className="h-4 w-4 text-purple-600" />
                      <AlertDescription className="flex items-center justify-between gap-2">
                        <span className="text-sm text-slate-700">
                          检测到约定内容已更改，是否需要重新生成子约定？
                        </span>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setShowRegeneratePrompt(false)}
                            className="h-7 text-xs"
                          >
                            忽略
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => {
                              setShowRegeneratePrompt(false);
                              handleAutoGenerateSubtasks();
                            }}
                            className="h-7 text-xs bg-purple-600 hover:bg-purple-700"
                          >
                            重新生成
                          </Button>
                        </div>
                      </AlertDescription>
                    </Alert>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-700">子约定管理</h3>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleAutoGenerateSubtasks}
                  disabled={isGeneratingSubtasks}
                  className="border-purple-200 bg-purple-50 hover:bg-purple-100 text-purple-700 h-8"
                >
                  {isGeneratingSubtasks ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      生成中...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                      AI 生成子约定
                    </>
                  )}
                </Button>
              </div>

              <div className="flex gap-2">
                <Input
                  placeholder="添加子约定..."
                  value={newSubtask}
                  onChange={(e) => setNewSubtask(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAddSubtask()}
                  className="flex-1"
                />
                <Button
                  onClick={handleAddSubtask}
                  disabled={!newSubtask.trim() || isAddingSubtask}
                  className="bg-[#5a647d] hover:bg-[#4a5670] rounded-[10px]"
                >
                  {isAddingSubtask ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                </Button>
              </div>

              <div className="space-y-2">
                <AnimatePresence mode="popLayout">
                  {subtasks.map((subtask) => (
                    <motion.div
                      key={subtask.id}
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -100 }}
                      className={`flex items-center gap-3 p-3 rounded-[10px] border transition-all ${
                        subtask.status === "completed"
                          ? "bg-[#ecfdf5] border-[#86efac]"
                          : "bg-white border-[#e5e9ef] hover:border-[#c8d1e0]"
                      }`}
                    >
                      <div onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={subtask.status === "completed"}
                          onCheckedChange={() => handleToggleSubtask(subtask)}
                          onClick={(e) => e.stopPropagation()}
                          className="h-5 w-5"
                        />
                      </div>
                      <span
                        className={`flex-1 text-[15px] ${
                          subtask.status === "completed"
                            ? "line-through text-[#a1a1aa]"
                            : "text-[#222222]"
                        }`}
                      >
                        {subtask.title}
                      </span>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => deleteSubtaskMutation.mutate(subtask.id)}
                        className="h-8 w-8 hover:bg-red-100 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </motion.div>
                  ))}
                </AnimatePresence>

                {subtasks.length === 0 && (
                  <div className="text-center py-8 text-slate-400">
                    <Circle className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>暂无子约定</p>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Attachments Tab */}
            <TabsContent value="attachments" className="space-y-4">
              <div>
                <input
                  type="file"
                  multiple
                  onChange={handleFileUpload}
                  className="hidden"
                  id="file-upload"
                />
                <label htmlFor="file-upload">
                  <Button
                    asChild
                    variant="outline"
                    className="w-full border-2 border-dashed hover:border-purple-400 hover:bg-purple-50"
                    disabled={uploading}
                  >
                    <div className="cursor-pointer">
                      <Upload className="w-4 h-4 mr-2" />
                      {uploading ? "上传中..." : "上传文件"}
                    </div>
                  </Button>
                </label>
              </div>

              <div className="space-y-2">
                <AnimatePresence mode="popLayout">
                  {task.attachments?.map((attachment, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -100 }}
                      className="flex items-center gap-3 p-3 bg-white rounded-lg border-2 border-slate-200 hover:border-purple-300 transition-all"
                    >
                      {attachment.file_type?.startsWith('image/') ? (
                        <ImageIcon className="w-8 h-8 text-blue-500" />
                      ) : (
                        <FileText className="w-8 h-8 text-slate-500" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-800 truncate">
                          {attachment.file_name}
                        </p>
                        <p className="text-xs text-slate-500">
                          {(attachment.file_size / 1024).toFixed(2)} KB • 
                          {format(new Date(attachment.uploaded_at), " yyyy-MM-dd", { locale: zhCN })}
                        </p>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        asChild
                        className="h-8 w-8"
                      >
                        <a href={attachment.file_url} target="_blank" rel="noopener noreferrer">
                          <Download className="h-4 w-4" />
                        </a>
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleRemoveAttachment(index)}
                        className="h-8 w-8 hover:bg-red-100 hover:text-red-600"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </motion.div>
                  ))}
                </AnimatePresence>

                {(!task.attachments || task.attachments.length === 0) && (
                  <div className="text-center py-8 text-slate-400">
                    <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>暂无附件</p>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Notes Tab */}
            <TabsContent value="notes" className="space-y-4">
              <div className="flex gap-2">
                <Textarea
                  placeholder="添加笔记..."
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  className="flex-1 min-h-[80px]"
                />
              </div>
              <Button
                onClick={handleAddNote}
                disabled={!newNote.trim() || isAddingNote}
                className="w-full bg-[#5a647d] hover:bg-[#4a5670] rounded-[10px]"
              >
                {isAddingNote ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4 mr-2" />
                )}
                {isAddingNote ? "添加中..." : "添加笔记"}
              </Button>

              <div className="space-y-3">
                <AnimatePresence mode="popLayout">
                  {task.notes?.map((note, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -100 }}
                      className="bg-amber-50 border-2 border-amber-200 rounded-lg p-4 relative group"
                    >
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleDeleteNote(index)}
                        className="absolute top-2 right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-100 hover:text-red-600"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                      <div className="flex items-start gap-2 mb-2">
                        <StickyNote className="w-4 h-4 text-amber-600 flex-shrink-0 mt-1" />
                        <p className="text-sm text-slate-600 pr-8">
                          {format(new Date(note.created_at), "yyyy-MM-dd HH:mm", { locale: zhCN })}
                        </p>
                      </div>
                      <p className="text-slate-800 whitespace-pre-wrap">{note.content}</p>
                    </motion.div>
                  ))}
                </AnimatePresence>

                {(!task.notes || task.notes.length === 0) && (
                  <div className="text-center py-8 text-slate-400">
                    <StickyNote className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>暂无笔记</p>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Comments Tab */}
            <TabsContent value="comments" className="space-y-4">
              <TaskComments task={task} />
            </TabsContent>

            {/* History Tab */}
            <TabsContent value="history" className="space-y-4">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                     <h3 className="text-sm font-semibold text-slate-900">完成记录</h3>
                     <Badge variant="outline" className="bg-slate-50 text-slate-500 border-slate-200">
                        共 {completionHistory.length} 次
                     </Badge>
                  </div>
                  
                  {completionHistory.length === 0 ? (
                     <div className="text-center py-12 text-slate-400 bg-slate-50 rounded-xl border-2 border-dashed border-slate-100">
                        <History className="w-10 h-10 mx-auto mb-2 opacity-30" />
                        <p className="text-sm">暂无完成记录</p>
                     </div>
                  ) : (
                    <div className="relative border-l-2 border-slate-100 ml-3 space-y-6 pl-6 py-2">
                      {completionHistory.map((record, idx) => (
                        <div key={record.id} className="relative group">
                           <div className="absolute -left-[31px] top-0 w-4 h-4 rounded-full bg-green-500 border-2 border-white shadow-sm flex items-center justify-center ring-2 ring-transparent group-hover:ring-green-100 transition-all">
                              <CheckCircle2 className="w-2.5 h-2.5 text-white" />
                           </div>
                           <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 hover:border-green-200 hover:bg-green-50/30 transition-all">
                              <div className="flex justify-between items-start">
                                 <div>
                                    <p className="font-semibold text-slate-800 text-sm flex items-center gap-2">
                                        约定完成
                                        {idx === 0 && <Badge className="h-5 text-[10px] bg-green-500 hover:bg-green-600">最新</Badge>}
                                    </p>
                                    <p className="text-xs text-slate-500 mt-1 font-medium font-mono">
                                       {format(new Date(record.completed_at), "yyyy-MM-dd HH:mm:ss", { locale: zhCN })}
                                    </p>
                                 </div>
                                 <Badge variant="outline" className="bg-white text-green-600 border-green-200 text-xs shadow-sm">
                                    {record.status === 'completed' ? '已完成' : record.status}
                                 </Badge>
                              </div>
                              {record.note && (
                                <div className="mt-3 text-xs text-slate-600 bg-white p-2.5 rounded-lg border border-slate-100 italic">
                                   "{record.note}"
                                </div>
                              )}
                           </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
            </TabsContent>
          </Tabs>

          {/* AI Analysis Result */}
          {task.ai_analysis && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="bg-gradient-to-br from-slate-50 to-white border border-indigo-100 rounded-xl p-4 shadow-sm"
              >
                  <h4 className="text-sm font-semibold text-indigo-900 mb-3 flex items-center gap-2">
                      <div className="p-1 bg-indigo-100 rounded-md">
                        <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600" />
                      </div>
                      智能分析报告
                  </h4>
                  <div className="grid md:grid-cols-2 gap-4 text-sm">
                      {task.ai_analysis.suggested_priority && (
                          <div className="col-span-2 flex items-center justify-between bg-gradient-to-r from-indigo-50 to-purple-50 p-3 rounded-lg border border-indigo-100">
                              <div className="flex items-center gap-3">
                                  <Badge variant="outline" className="bg-white border-indigo-200 text-indigo-700">
                                      AI 建议: {
                                          {low: "低优先级", medium: "中优先级", high: "高优先级", urgent: "紧急"}[task.ai_analysis.suggested_priority] || task.ai_analysis.suggested_priority
                                      }
                                  </Badge>
                                  <span className="text-xs text-indigo-600">{task.ai_analysis.priority_reasoning}</span>
                              </div>
                              {task.ai_analysis.suggested_priority !== task.priority && (
                                  <Button 
                                      size="sm" 
                                      variant="ghost"
                                      onClick={() => updateTaskMutation.mutate({
                                          id: task.id,
                                          data: { priority: task.ai_analysis.suggested_priority }
                                      })}
                                      className="h-7 text-xs bg-white/80 hover:bg-white text-indigo-600 border border-indigo-200"
                                  >
                                      应用建议
                                  </Button>
                              )}
                          </div>
                      )}
                      <div className="col-span-2 bg-white/60 p-3 rounded-lg border border-indigo-50/50">
                          <span className="text-slate-500 text-xs block mb-1">状态摘要</span>
                          <p className="text-slate-700 leading-relaxed">{task.ai_analysis.status_summary}</p>
                      </div>
                      
                      {/* Risk Section */}
                      <div className={`p-3 rounded-lg border ${
                          ['high', 'critical'].includes(task.ai_analysis.risk_level) ? 'bg-red-50 border-red-100' : 'bg-amber-50 border-amber-100'
                      }`}>
                          <div className="flex items-center justify-between mb-1">
                              <span className={`text-xs font-medium ${['high', 'critical'].includes(task.ai_analysis.risk_level) ? 'text-red-600' : 'text-amber-600'}`}>
                                  ⚠️ 风险评估: {task.ai_analysis.risk_level?.toUpperCase() || 'N/A'}
                              </span>
                          </div>
                          {task.ai_analysis.risks?.length > 0 ? (
                              <ul className="list-disc list-inside space-y-1 text-slate-700 text-xs">
                                  {task.ai_analysis.risks.map((risk, i) => <li key={i}>{risk}</li>)}
                              </ul>
                          ) : <span className="text-xs text-slate-500">无显著风险</span>}
                      </div>

                      {/* Time Suggestion Section */}
                      {(task.ai_analysis.recommended_execution_start || task.ai_analysis.time_reasoning) && (
                          <div className="bg-blue-50/50 p-3 rounded-lg border border-blue-100/50">
                              <span className="text-blue-600 text-xs block mb-1 font-medium">⏰ 最佳执行时间建议</span>
                              {task.ai_analysis.recommended_execution_start && (
                                  <div className="text-xs font-semibold text-slate-700 mb-1">
                                      {format(new Date(task.ai_analysis.recommended_execution_start), "MM月dd日 HH:mm")}
                                      {task.ai_analysis.recommended_execution_end && ` - ${format(new Date(task.ai_analysis.recommended_execution_end), "HH:mm")}`}
                                  </div>
                              )}
                              <p className="text-xs text-slate-600 italic">{task.ai_analysis.time_reasoning}</p>
                          </div>
                      )}

                      {task.ai_analysis.key_dependencies?.length > 0 && (
                          <div className="bg-amber-50/50 p-3 rounded-lg border border-amber-100/50">
                              <span className="text-amber-600 text-xs block mb-1 font-medium">🔗 关键依赖</span>
                              <ul className="list-disc list-inside space-y-1 text-slate-700 text-xs">
                                  {task.ai_analysis.key_dependencies.map((dep, i) => <li key={i}>{dep}</li>)}
                              </ul>
                          </div>
                      )}
                      {task.ai_analysis.suggestions?.length > 0 && (
                           <div className="col-span-2 bg-blue-50/50 p-3 rounded-lg border border-blue-100/50">
                              <span className="text-blue-600 text-xs block mb-1 font-medium">💡 改进建议</span>
                              <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                  {task.ai_analysis.suggestions.map((sug, i) => (
                                      <li key={i} className="flex items-start gap-2 text-slate-700 text-xs">
                                          <span className="text-blue-400 mt-0.5">•</span>
                                          {sug}
                                      </li>
                                  ))}
                              </ul>
                          </div>
                      )}
                  </div>
              </motion.div>
          )}

        </div>
      </DialogContent>

      {showRecurrenceEditor && (
        <Dialog open={showRecurrenceEditor} onOpenChange={setShowRecurrenceEditor}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>编辑重复规则</DialogTitle>
                </DialogHeader>
                <RecurrenceEditor 
                    value={task.custom_recurrence || { frequency: task.repeat_rule === 'none' ? 'weekly' : task.repeat_rule, interval: 1 }}
                    onChange={(recurrence) => {
                        updateTaskMutation.mutate({ 
                            id: task.id, 
                            data: { 
                                repeat_rule: 'custom',
                                custom_recurrence: recurrence 
                            } 
                        });
                        setShowRecurrenceEditor(false);
                    }}
                    onClose={() => setShowRecurrenceEditor(false)}
                />
            </DialogContent>
        </Dialog>
      )}
    </Dialog>
  );
}