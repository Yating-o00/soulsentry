import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Search, Filter, Trash2, RotateCcw, AlertTriangle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import TaskCard from "../components/tasks/TaskCard";
import QuickAddTask from "../components/tasks/QuickAddTask";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import NotificationManager from "../components/notifications/NotificationManager";
import TaskDetailModal from "../components/tasks/TaskDetailModal";
import SmartTextParser from "../components/tasks/SmartTextParser";
import { toast } from "sonner";
import { logUserBehavior } from "@/components/utils/behaviorLogger";


export default function Tasks() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTask, setSelectedTask] = useState(null);
  const queryClient = useQueryClient();

  const { data: allTasks = [], isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => base44.entities.Task.list('-reminder_time'),
    initialData: [],
  });

  // 只显示主任务（没有 parent_task_id 的任务）
  const tasks = allTasks.filter(task => !task.parent_task_id && !task.deleted_at);
  const trashTasks = allTasks.filter(task => !task.parent_task_id && task.deleted_at);

  const createTaskMutation = useMutation({
    mutationFn: (taskData) => base44.entities.Task.create(taskData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Task.update(id, data),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      
      // Log behavior based on what changed
      if (variables.data.status === 'completed') {
          logUserBehavior("task_completed", { id: variables.id, ...variables.data });
      } else if (variables.data.status === 'snoozed') {
          logUserBehavior("task_snoozed", { id: variables.id, ...variables.data });
      } else {
          logUserBehavior("task_edited", { id: variables.id, ...variables.data });
      }
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: (id) => base44.entities.Task.update(id, { deleted_at: new Date().toISOString() }),
    onSuccess: (data, id) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast.success("任务已移至垃圾箱");
      logUserBehavior("task_deleted", { id });
    },
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

  const filteredTasks = tasks.filter(task => {
    const matchesStatus = statusFilter === "all" || task.status === statusFilter;
    const matchesCategory = categoryFilter === "all" || task.category === categoryFilter;
    const matchesSearch = task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         task.description?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesCategory && matchesSearch;
  });

  const handleComplete = (task) => {
    const newStatus = task.status === "completed" ? "pending" : "completed";
    updateTaskMutation.mutate({
      id: task.id,
      data: { status: newStatus }
    });
  };

  const handleSubtaskToggle = async (subtask) => {
    const newStatus = subtask.status === "completed" ? "pending" : "completed";
    
    // 更新子任务状态
    await updateTaskMutation.mutateAsync({
      id: subtask.id,
      data: { 
        status: newStatus,
        completed_at: newStatus === "completed" ? new Date().toISOString() : null
      }
    });

    // 重新计算父任务进度
    if (subtask.parent_task_id) {
      const parentTask = allTasks.find(t => t.id === subtask.parent_task_id);
      if (parentTask) {
        const siblings = allTasks.filter(t => t.parent_task_id === subtask.parent_task_id);
        const completed = siblings.filter(s => 
          s.id === subtask.id ? newStatus === "completed" : s.status === "completed"
        ).length;
        const progress = siblings.length > 0 ? Math.round((completed / siblings.length) * 100) : 0;

        await updateTaskMutation.mutateAsync({
          id: parentTask.id,
          data: { progress }
        });
      }
    }
  };

  const handleBulkCreate = async (parsedTasks) => {
    if (!parsedTasks || parsedTasks.length === 0) {
      toast.error("没有任务需要创建");
      return;
    }

    let createdCount = 0;
    let createdSubtasksCount = 0;

    try {
      toast.loading("正在创建任务...", { id: 'bulk-create' });

      for (const taskData of parsedTasks) {
        const hasSubtasks = taskData.subtasks && taskData.subtasks.length > 0;
        
        // 创建主任务，确保包含所有字段和初始进度
        const mainTaskData = {
          title: taskData.title,
          description: taskData.description || "",
          reminder_time: taskData.reminder_time,
          priority: taskData.priority || "medium",
          category: taskData.category || "personal",
          status: "pending",
          progress: 0, // 初始进度为0
          notification_sound: taskData.notification_sound || "default",
          persistent_reminder: taskData.persistent_reminder || false,
          notification_interval: taskData.notification_interval || 15,
          advance_reminders: taskData.advance_reminders || [],
          assigned_to: taskData.assigned_to || [],
        };
        
        const createdMainTask = await createTaskMutation.mutateAsync(mainTaskData);
        createdCount++;
        
        // 如果有子任务，创建子任务
        if (hasSubtasks) {
          for (let i = 0; i < taskData.subtasks.length; i++) {
            const subtask = taskData.subtasks[i];
            const subtaskData = {
              title: `${subtask.order || i + 1}. ${subtask.title}`, // 添加序号到标题
              description: subtask.description || "",
              reminder_time: subtask.reminder_time || taskData.reminder_time,
              priority: subtask.priority || taskData.priority || "medium",
              category: taskData.category, // 子任务继承父任务的类别
              status: "pending",
              parent_task_id: createdMainTask.id, // 关联父任务
              progress: 0, // 子任务也有progress字段
              notification_sound: taskData.notification_sound || "default",
              persistent_reminder: false, // 子任务默认不持续提醒
              advance_reminders: [],
              assigned_to: taskData.assigned_to || [],
            };
            
            await createTaskMutation.mutateAsync(subtaskData);
            createdSubtasksCount++;
          }
        }
      }
      
      toast.success(
        `✅ 成功创建 ${createdCount} 个主任务${createdSubtasksCount > 0 ? `和 ${createdSubtasksCount} 个子任务` : ''}！`,
        { id: 'bulk-create' }
      );
    } catch (error) {
      console.error("Error creating bulk tasks:", error);
      toast.error(
        `创建任务时出错。已成功创建 ${createdCount} 个主任务${createdSubtasksCount > 0 ? `和 ${createdSubtasksCount} 个子任务` : ''}。`,
        { id: 'bulk-create' }
      );
    }
  };

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      <NotificationManager />
      
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-[#384877] to-[#3b5aa2] bg-clip-text text-transparent mb-2">
          全部任务
        </h1>
        <p className="text-slate-600">管理您的所有任务和提醒</p>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <QuickAddTask onAdd={(data) => createTaskMutation.mutate(data)} />
        <SmartTextParser onTasksGenerated={handleBulkCreate} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="space-y-4"
      >
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="搜索任务..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 border-0 bg-white shadow-lg rounded-xl"
            />
          </div>

          <div className="flex gap-3">
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-32 border-0 bg-white shadow-lg rounded-xl">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="类别" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部类别</SelectItem>
                <SelectItem value="work">工作</SelectItem>
                <SelectItem value="personal">个人</SelectItem>
                <SelectItem value="health">健康</SelectItem>
                <SelectItem value="study">学习</SelectItem>
                <SelectItem value="family">家庭</SelectItem>
                <SelectItem value="shopping">购物</SelectItem>
                <SelectItem value="finance">财务</SelectItem>
                <SelectItem value="other">其他</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Tabs value={statusFilter} onValueChange={setStatusFilter} className="w-full">
          <TabsList className="grid w-full md:w-auto grid-cols-3 bg-white shadow-md rounded-[12px] p-1">
            <TabsTrigger value="all" className="rounded-[10px] data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#384877] data-[state=active]:to-[#3b5aa2] data-[state=active]:text-white data-[state=active]:shadow-sm">
              全部 ({tasks.length})
            </TabsTrigger>
            <TabsTrigger value="pending" className="rounded-[10px] data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#06b6d4] data-[state=active]:to-[#0891b2] data-[state=active]:text-white data-[state=active]:shadow-sm">
              进行中 ({tasks.filter(t => t.status === "pending").length})
            </TabsTrigger>
            <TabsTrigger value="completed" className="rounded-[10px] data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#10b981] data-[state=active]:to-[#059669] data-[state=active]:text-white data-[state=active]:shadow-sm">
              已完成 ({tasks.filter(t => t.status === "completed").length})
            </TabsTrigger>
          </TabsList>
        </Tabs>
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
              onComplete={() => handleComplete(task)}
              onDelete={() => softDeleteTaskMutation.mutate(task.id)}
              onEdit={() => {}}
              onClick={() => setSelectedTask(task)}
              onSubtaskToggle={handleSubtaskToggle}
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
              <Search className="w-12 h-12 text-slate-400" />
            </div>
            <h3 className="text-xl font-semibold text-slate-800 mb-2">未找到任务</h3>
            <p className="text-slate-600">试试调整筛选条件或创建新任务</p>
          </motion.div>
        )}
      </motion.div>

      <TaskDetailModal
        task={selectedTask}
        open={!!selectedTask}
        onClose={() => setSelectedTask(null)}
      />
    </div>
  );
}