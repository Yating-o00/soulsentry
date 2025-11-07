
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

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => base44.entities.Task.list('-reminder_time'),
    initialData: [],
  });

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
        // 创建主任务，确保包含所有字段
        const mainTaskData = {
          title: taskData.title,
          description: taskData.description || "",
          reminder_time: taskData.reminder_time,
          priority: taskData.priority || "medium",
          category: taskData.category || "personal",
          status: "pending",
          // 保留其他通知设置字段（如果存在）
          notification_sound: taskData.notification_sound || "default",
          persistent_reminder: taskData.persistent_reminder || false,
          notification_interval: taskData.notification_interval || 15,
          advance_reminders: taskData.advance_reminders || [],
        };
        
        const createdMainTask = await createTaskMutation.mutateAsync(mainTaskData);
        createdCount++;
        
        // 如果有子任务，创建子任务
        if (taskData.subtasks && taskData.subtasks.length > 0) {
          for (const subtask of taskData.subtasks) {
            const subtaskData = {
              title: subtask.title,
              description: subtask.description || "",
              reminder_time: subtask.reminder_time,
              priority: subtask.priority || taskData.priority || "medium",
              category: taskData.category, // 子任务继承父任务的类别
              status: "pending",
              parent_task_id: createdMainTask.id, // 关联父任务
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
        `成功创建 ${createdCount} 个主任务${createdSubtasksCount > 0 ? `和 ${createdSubtasksCount} 个子任务` : ''}！`,
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
            <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
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
          <Card className="border-0 shadow-lg bg-gradient-to-br from-blue-500 to-blue-600 text-white">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium opacity-90 flex items-center gap-2">
                <Clock className="w-4 h-4" />
                今日待办
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold">{todayTasks.length}</div>
              <p className="text-sm opacity-80 mt-1">个任务等待完成</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="border-0 shadow-lg bg-gradient-to-br from-green-500 to-emerald-600 text-white">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium opacity-90 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                今日完成
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold">{completedToday}</div>
              <p className="text-sm opacity-80 mt-1">个任务已完成</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3 }}
        >
          <Card className="border-0 shadow-lg bg-gradient-to-br from-purple-500 to-purple-600 text-white">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium opacity-90 flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                待办总数
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold">{totalPending}</div>
              <p className="text-sm opacity-80 mt-1">个任务进行中</p>
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
            <Sparkles className="w-5 h-5 text-purple-500" />
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
            <CalendarIcon className="w-5 h-5 text-blue-500" />
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
          <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-br from-blue-100 to-purple-100 flex items-center justify-center">
            <CheckCircle2 className="w-12 h-12 text-purple-500" />
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
