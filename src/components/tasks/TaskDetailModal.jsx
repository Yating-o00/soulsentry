import React, { useState } from "react";
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
  StickyNote
} from "lucide-react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import TaskComments from "./TaskComments";

export default function TaskDetailModal({ task, open, onClose }) {
  const [uploading, setUploading] = useState(false);
  const [newSubtask, setNewSubtask] = useState("");
  const [newNote, setNewNote] = useState("");
  const queryClient = useQueryClient();

  const { data: subtasks = [] } = useQuery({
    queryKey: ['subtasks', task?.id],
    queryFn: () => base44.entities.Task.filter({ parent_task_id: task.id }),
    enabled: !!task?.id,
    initialData: [],
  });

  const updateTaskMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Task.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['subtasks'] });
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
    if (!newSubtask.trim()) return;

    await createSubtaskMutation.mutateAsync({
      title: newSubtask,
      parent_task_id: task.id,
      reminder_time: task.reminder_time,
      category: task.category,
      priority: task.priority,
      status: "pending",
    });
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

  const handleAddNote = async () => {
    if (!newNote.trim()) return;

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
  const [isAnalyzing, setIsAnalyzing] = useState(false);

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
              prompt: `Analyze this task status, risks, and dependencies based on the provided context and any attached media (images/videos).
              
              Context:
              ${context}
              
              Tasks:
              1. Visual Analysis (if media provided): Identify key information, blockers, or context from attached images/videos.
              2. Status Summary: Combine text and visual insights into a brief summary (2-3 sentences). Highlight any visual evidence of progress or issues.
              3. Potential Risks: E.g. stalled subtasks, visual defects, high priority but low progress.
              4. Key Dependencies: Prerequisites inferred from text or visuals.
              5. Actionable Suggestions.
              6. Suggest Priority: Based on deadline, risks, and status, suggest a priority (low/medium/high/urgent) and provide reasoning.
              
              Return ONLY JSON.`,
              file_urls: mediaAttachments.length > 0 ? mediaAttachments : undefined,
              response_json_schema: {
                  type: "object",
                  properties: {
                      status_summary: { type: "string" },
                      risks: { type: "array", items: { type: "string" } },
                      key_dependencies: { type: "array", items: { type: "string" } },
                      suggestions: { type: "array", items: { type: "string" } },
                      suggested_priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
                      priority_reasoning: { type: "string" }
                  },
                  required: ["status_summary", "risks", "suggested_priority"]
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
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <DialogTitle className="text-[20px] font-semibold tracking-tight text-[#222222]">
            {task.title}
          </DialogTitle>
          <div className="flex items-center gap-2">
             <Button 
                variant="outline" 
                size="sm" 
                onClick={handleAIAnalysis}
                disabled={isAnalyzing}
                className="h-8 text-xs bg-gradient-to-r from-indigo-50 to-purple-50 border-purple-200 text-purple-700 hover:from-indigo-100 hover:to-purple-100"
             >
                {isAnalyzing ? <span className="animate-spin mr-1">⏳</span> : <span className="mr-1">✨</span>}
                AI 状态分析
             </Button>
          </div>
        </DialogHeader>

        <div className="space-y-6">
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
                      {task.ai_analysis.risks?.length > 0 && (
                          <div className="bg-red-50/50 p-3 rounded-lg border border-red-100/50">
                              <span className="text-red-500 text-xs block mb-1 font-medium">⚠️ 潜在风险</span>
                              <ul className="list-disc list-inside space-y-1 text-slate-700 text-xs">
                                  {task.ai_analysis.risks.map((risk, i) => <li key={i}>{risk}</li>)}
                              </ul>
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
          {/* Progress */}
          {totalSubtasks > 0 && (
            <div className="space-y-2">
              <div className="flex justify-between text-[15px]">
                <span className="text-[#52525b]">完成进度</span>
                <span className="font-semibold text-[#5a647d]">
                  {completedSubtasks}/{totalSubtasks} 子任务
                </span>
              </div>
              <Progress value={task.progress || 0} className="h-2" />
            </div>
          )}

          {task.description && (
            <div className="bg-[#f9fafb] rounded-[12px] p-4 border border-[#e5e9ef]">
              <p className="text-[15px] text-[#222222] leading-relaxed">{task.description}</p>
            </div>
          )}

          <Tabs defaultValue="subtasks" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="subtasks">
                子任务 ({totalSubtasks})
              </TabsTrigger>
              <TabsTrigger value="attachments">
                附件 ({task.attachments?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="notes">
                笔记 ({task.notes?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="comments">
                评论
              </TabsTrigger>
            </TabsList>

            {/* Subtasks Tab */}
            <TabsContent value="subtasks" className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="添加子任务..."
                  value={newSubtask}
                  onChange={(e) => setNewSubtask(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAddSubtask()}
                  className="flex-1"
                />
                <Button
                  onClick={handleAddSubtask}
                  disabled={!newSubtask.trim()}
                  className="bg-[#5a647d] hover:bg-[#4a5670] rounded-[10px]"
                >
                  <Plus className="w-4 h-4" />
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
                      <Checkbox
                        checked={subtask.status === "completed"}
                        onCheckedChange={() => handleToggleSubtask(subtask)}
                        className="h-5 w-5"
                      />
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
                    <p>暂无子任务</p>
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
                disabled={!newNote.trim()}
                className="w-full bg-[#5a647d] hover:bg-[#4a5670] rounded-[10px]"
              >
                <Plus className="w-4 h-4 mr-2" />
                添加笔记
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
              <TaskComments taskId={task.id} />
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}