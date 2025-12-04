import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Search, Trash2, ArrowLeft, RotateCcw, AlertTriangle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import TaskCard from "../components/tasks/TaskCard";
import NotificationManager from "../components/notifications/NotificationManager";
import TaskDetailModal from "../components/tasks/TaskDetailModal";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export default function Trash() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTask, setSelectedTask] = useState(null);
  const queryClient = useQueryClient();

  const { data: allTasks = [], isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => base44.entities.Task.list('-reminder_time'),
    initialData: [],
  });

  // 只显示已删除的任务
  const trashTasks = allTasks.filter(task => !task.parent_task_id && task.deleted_at);

  const filteredTasks = trashTasks.filter(task => {
    const matchesSearch = task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         task.description?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  const restoreTaskMutation = useMutation({
    mutationFn: (id) => base44.entities.Task.update(id, { deleted_at: null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast.success("任务已恢复");
    },
  });

  const permanentDeleteTaskMutation = useMutation({
    mutationFn: (id) => base44.entities.Task.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast.success("任务已永久删除");
    },
  });

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      <NotificationManager />
      
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center gap-3 mb-2">
          <div className="h-10 w-10 rounded-xl bg-[#fff1f2] flex items-center justify-center border border-[#e0919e]">
            <Trash2 className="w-6 h-6 text-[#d5495f]" />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-[#d5495f]">
            回收站
          </h1>
        </div>
        <p className="text-slate-600">管理已删除的任务，您可以恢复它们或永久删除</p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="space-y-4"
      >
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="搜索已删除的任务..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 border-0 bg-white shadow-lg rounded-xl"
          />
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="space-y-3"
      >
        <AnimatePresence mode="popLayout">
          {filteredTasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              isTrash={true}
              onRestore={() => restoreTaskMutation.mutate(task.id)}
              onDeleteForever={() => {
                if (window.confirm('确定要永久删除这个任务吗？此操作无法撤销。')) {
                  permanentDeleteTaskMutation.mutate(task.id);
                }
              }}
              onClick={() => {}}
              onDelete={() => {}} // Placeholder
            />
          ))}
        </AnimatePresence>

        {filteredTasks.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-16"
          >
            <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center">
              <Trash2 className="w-12 h-12 text-slate-400" />
            </div>
            <h3 className="text-xl font-semibold text-slate-800 mb-2">回收站为空</h3>
            <p className="text-slate-600">没有已删除的任务</p>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}