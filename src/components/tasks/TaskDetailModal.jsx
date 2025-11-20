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

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            {task.title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Progress */}
          {totalSubtasks > 0 && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">完成进度</span>
                <span className="font-semibold text-purple-600">
                  {completedSubtasks}/{totalSubtasks} 子任务
                </span>
              </div>
              <Progress value={task.progress || 0} className="h-2" />
            </div>
          )}

          {task.description && (
            <div className="bg-slate-50 rounded-xl p-4">
              <p className="text-slate-700">{task.description}</p>
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
                  className="bg-gradient-to-r from-blue-500 to-purple-600"
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
                      className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-all ${
                        subtask.status === "completed"
                          ? "bg-green-50 border-green-200"
                          : "bg-white border-slate-200 hover:border-purple-300"
                      }`}
                    >
                      <Checkbox
                        checked={subtask.status === "completed"}
                        onCheckedChange={() => handleToggleSubtask(subtask)}
                        className="h-5 w-5"
                      />
                      <span
                        className={`flex-1 ${
                          subtask.status === "completed"
                            ? "line-through text-slate-400"
                            : "text-slate-800"
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
                className="w-full bg-gradient-to-r from-blue-500 to-purple-600"
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