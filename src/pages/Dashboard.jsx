import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { 
  Sun, 
  Moon, 
  CheckCircle2, 
  Clock, 
  TrendingUp,
  Sparkles,
  ArrowRight,
  Calendar as CalendarIcon
} from "lucide-react";
import { format, isToday, isTomorrow, startOfDay, endOfDay } from "date-fns";
import { zhCN } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
import TaskCard from "../components/tasks/TaskCard";
import QuickAddTask from "../components/tasks/QuickAddTask";
import NotificationManager from "../components/notifications/NotificationManager";
import TaskDetailModal from "../components/tasks/TaskDetailModal";
import SmartTextParser from "../components/tasks/SmartTextParser"; // Added import
import { toast } from "sonner"; // Added import for toast notifications


export default function Dashboard() {
  const [greeting, setGreeting] = useState("");
  const [selectedTask, setSelectedTask] = useState(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting("早上好");
    else if (hour < 18) setGreeting("下午好");
    else setGreeting("晚上好");
  }, []);

  const { data: allTasks = [], isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => base44.entities.Task.list('-reminder_time'),
    initialData: [],
  });

  // 只显示主任务（没有 parent_task_id 的任务）
  const tasks = allTasks.filter(task => !task.parent_task_id);

  const createTaskMutation = useMutation({
    mutationFn: (taskData) => base44.entities.Task.create(taskData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Task.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: (id) => base44.entities.Task.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const todayTasks = tasks.filter(task => {
    const taskDate = new Date(task.reminder_time);
    return isToday(taskDate) && task.status !== "completed" && task.status !== "cancelled";
  });

  const upcomingTasks = tasks.filter(task => {
    const taskDate = new Date(task.reminder_time);
    return taskDate > endOfDay(new Date()) && task.status !== "completed" && task.status !== "cancelled";
  }).slice(0, 5);

  const completedToday = tasks.filter(task => {
    return task.status === "completed" && 
           isToday(new Date(task.updated_date));
  }).length;

  const totalPending = tasks.filter(t => t.status === "pending").length;

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
          // 保留其他通知设置字段（如果存在）
          notification_sound: taskData.notification_sound || "default",
          persistent_reminder: taskData.persistent_reminder || false,
          notification_interval: taskData.notification_interval || 15,
          advance_reminders: taskData.advance_reminders || [],
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
              reminder_time: subtask.reminder_time,
              priority: subtask.priority || taskData.priority || "medium",
              category: taskData.category, // 子任务继承父任务的类别
              status: "pending",
              parent_task_id: createdMainTask.id, // 关联父任务
              progress: 0, // 子任务也有progress字段
              // 子任务继承父任务的通知设置
              notification_sound: taskData.notification_sound || "default",
              persistent_reminder: false, // 子任务默认不持续提醒
              advance_reminders: [],
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
        className="flex items-center justify-between"
      >
        <div>
          <div className="flex items-center gap-3 mb-2">
            {new Date().getHours() < 18 ? (
              <Sun className="w-8 h-8 text-orange-500" />
            ) : (
              <Moon className="w-8 h-8 text-indigo-500" />
            )}
            <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-[#5a647d] to-[#1e3a5f] bg-clip-text text-transparent">
              {greeting}
            </h1>
          </div>
          <p className="text-slate-600">
            {format(new Date(), "yyyy年M月d日 EEEE", { locale: zhCN })}
          </p>
        </div>
        <Link to={createPageUrl("Tasks")}>
          <Button variant="outline" className="gap-2 rounded-xl">
            查看全部
            <ArrowRight className="w-4 h-4" />
          </Button>
        </Link>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="border-0 shadow-md bg-gradient-to-br from-[#f1f5f9] to-[#e2e8f0] rounded-[16px]">
            <CardHeader className="pb-3">
              <CardTitle className="text-[15px] font-semibold flex items-center gap-2">
                <Clock className="w-5 h-5 text-[#5a647d]" />
                <span className="text-[#5a647d]">今日待办</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold mb-1 text-[#334155]">{todayTasks.length}</div>
              <p className="text-[15px] text-[#5a647d]">个任务等待完成</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="border-0 shadow-md bg-gradient-to-br from-[#d1fae5] to-[#a7f3d0] rounded-[16px]">
            <CardHeader className="pb-3">
              <CardTitle className="text-[15px] font-semibold flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-[#059669]" />
                <span className="text-[#059669]">今日完成</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold mb-1 text-[#065f46]">{completedToday}</div>
              <p className="text-[15px] text-[#059669]">个任务已完成</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3 }}
        >
          <Card className="border-0 shadow-md bg-gradient-to-br from-[#e0f2fe] to-[#bae6fd] rounded-[16px]">
            <CardHeader className="pb-3">
              <CardTitle className="text-[15px] font-semibold flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-[#0891b2]" />
                <span className="text-[#0891b2]">待办总数</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold mb-1 text-[#0c4a6e]">{totalPending}</div>
              <p className="text-[15px] text-[#0891b2]">个任务进行中</p>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <QuickAddTask onAdd={(data) => createTaskMutation.mutate(data)} />
        <SmartTextParser onTasksGenerated={handleBulkCreate} />
      </div>

      {todayTasks.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-5 h-5 text-[#5a647d]" />
            <h2 className="text-2xl font-bold text-slate-800">今日聚焦</h2>
          </div>
          <div className="space-y-3">
            <AnimatePresence mode="popLayout">
              {todayTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onComplete={() => handleComplete(task)}
                  onDelete={() => deleteTaskMutation.mutate(task.id)}
                  onEdit={() => {}}
                  onClick={() => setSelectedTask(task)}
                  onSubtaskToggle={handleSubtaskToggle}
                />
              ))}
            </AnimatePresence>
          </div>
        </motion.div>
      )}

      {upcomingTasks.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <div className="flex items-center gap-2 mb-4">
            <CalendarIcon className="w-5 h-5 text-[#5a647d]" />
            <h2 className="text-2xl font-bold text-slate-800">即将到来</h2>
          </div>
          <div className="space-y-3">
            <AnimatePresence mode="popLayout">
              {upcomingTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onComplete={() => handleComplete(task)}
                  onDelete={() => deleteTaskMutation.mutate(task.id)}
                  onEdit={() => {}}
                  onClick={() => setSelectedTask(task)}
                  onSubtaskToggle={handleSubtaskToggle}
                />
              ))}
            </AnimatePresence>
          </div>
        </motion.div>
      )}

      {todayTasks.length === 0 && upcomingTasks.length === 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-16"
        >
          <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-br from-[#f9fafb] to-[#e5e9ef] flex items-center justify-center">
            <CheckCircle2 className="w-12 h-12 text-[#5a647d]" />
          </div>
          <h3 className="text-2xl font-bold text-slate-800 mb-2">太棒了！</h3>
          <p className="text-slate-600">暂时没有待办任务，享受轻松时光吧</p>
        </motion.div>
      )}

      <TaskDetailModal
        task={selectedTask}
        open={!!selectedTask}
        onClose={() => setSelectedTask(null)}
      />
    </div>
  );
}