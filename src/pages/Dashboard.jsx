import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, isToday, isPast, isFuture, parseISO } from "date-fns";
import { zhCN } from "date-fns/locale";
import { 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Calendar as CalendarIcon, 
  TrendingUp, 
  Sun,
  ListTodo,
  Edit
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { motion } from "framer-motion";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

import QuickAddTask from "../components/tasks/QuickAddTask";
import CalendarView from "../components/calendar/CalendarView";
import TaskCard from "../components/tasks/TaskCard";
import UserBehaviorInsights from "../components/insights/UserBehaviorInsights";
import NotificationManager from "../components/notifications/NotificationManager";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import TaskDetailModal from "../components/tasks/TaskDetailModal";
import { toast } from "sonner";
import { logUserBehavior } from "@/components/utils/behaviorLogger";

export default function Dashboard() {
  const [greeting, setGreeting] = useState("你好");
  const [selectedTask, setSelectedTask] = useState(null);
  const [editingTask, setEditingTask] = useState(null);
  const queryClient = useQueryClient();

  // Get current user
  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me(),
  });

  // Get all tasks
  const { data: allTasks = [], isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => base44.entities.Task.list('-reminder_time'),
    initialData: [],
  });

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 6) setGreeting("凌晨好");
    else if (hour < 9) setGreeting("早上好");
    else if (hour < 12) setGreeting("上午好");
    else if (hour < 14) setGreeting("中午好");
    else if (hour < 18) setGreeting("下午好");
    else setGreeting("晚上好");
  }, []);

  // Filter tasks (exclude subtasks from main view)
  const activeTasks = allTasks.filter(t => !t.deleted_at);
  const rootTasks = activeTasks.filter(t => !t.parent_task_id);
  const todayTasks = rootTasks.filter(t => {
    if (!t.reminder_time) return false;
    const today = new Date();
    const start = parseISO(t.reminder_time);
    const end = t.end_time ? parseISO(t.end_time) : start;
    
    // Check if today is within the task's date range (inclusive)
    // Using string comparison for date part to avoid timezone issues or simple interval check
    const todayStr = format(today, 'yyyy-MM-dd');
    const startStr = format(start, 'yyyy-MM-dd');
    const endStr = format(end, 'yyyy-MM-dd');

    return todayStr >= startStr && todayStr <= endStr;
  });
  const overdueTasks = rootTasks.filter(t => 
    t.status === 'pending' && 
    t.reminder_time && 
    isPast(parseISO(t.reminder_time)) && 
    !isToday(parseISO(t.reminder_time))
  );
  const pendingTasks = rootTasks.filter(t => t.status === 'pending');
  const completedToday = rootTasks.filter(t => 
    t.status === 'completed' && 
    t.completed_at && 
    isToday(parseISO(t.completed_at))
  );

  // Stats
  const completionRate = todayTasks.length > 0 
    ? Math.round((todayTasks.filter(t => t.status === 'completed').length / todayTasks.length) * 100) 
    : 0;

  // Mutations
  const updateTaskMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Task.update(id, data),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setEditingTask(null);
      
      if (variables.data.status === 'completed') {
        logUserBehavior("task_completed", { id: variables.id, ...variables.data });
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

  const createTaskMutation = useMutation({
    mutationFn: (taskData) => base44.entities.Task.create(taskData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast.success("任务创建成功");
    },
  });

  const handleComplete = (task) => {
    const newStatus = task.status === "completed" ? "pending" : "completed";
    updateTaskMutation.mutate({
      id: task.id,
      data: { 
        status: newStatus,
        completed_at: newStatus === "completed" ? new Date().toISOString() : null
      }
    });
  };

  const handleSubtaskToggle = async (subtask) => {
    const newStatus = subtask.status === "completed" ? "pending" : "completed";
    
    // Update subtask
    await updateTaskMutation.mutateAsync({
      id: subtask.id,
      data: { 
        status: newStatus,
        completed_at: newStatus === "completed" ? new Date().toISOString() : null
      }
    });

    // Update parent progress
    if (subtask.parent_task_id) {
      const siblings = allTasks.filter(t => t.parent_task_id === subtask.parent_task_id);
      const completed = siblings.filter(s => 
        s.id === subtask.id ? newStatus === "completed" : s.status === "completed"
      ).length;
      const progress = siblings.length > 0 ? Math.round((completed / siblings.length) * 100) : 0;

      await updateTaskMutation.mutateAsync({
        id: subtask.parent_task_id,
        data: { progress }
      });
    }
  };

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto min-h-screen">
      <NotificationManager />
      
      <Tabs defaultValue="overview" className="space-y-6">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <h1 className="text-3xl font-bold text-slate-900 mb-1 flex items-center gap-2">
              {greeting}，{user?.full_name || user?.email?.split('@')[0] || "朋友"} 
              <Sun className="w-6 h-6 text-amber-500 fill-amber-500 animate-pulse" />
            </h1>
            <p className="text-slate-500">
              今天是 {format(new Date(), "yyyy年MM月dd日 EEEE", { locale: zhCN })}
            </p>
          </motion.div>

          <TabsList className="bg-white shadow-md rounded-[12px] p-1 h-auto">
            <TabsTrigger value="overview" className="rounded-[10px] px-6 py-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#384877] data-[state=active]:to-[#3b5aa2] data-[state=active]:text-white">
              <ListTodo className="w-4 h-4 mr-2" />
              概览
            </TabsTrigger>
            <TabsTrigger value="calendar" className="rounded-[10px] px-6 py-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#384877] data-[state=active]:to-[#3b5aa2] data-[state=active]:text-white">
              <CalendarIcon className="w-4 h-4 mr-2" />
              日历
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="space-y-6">
          {/* Stats Cards */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-1 md:grid-cols-3 gap-4"
      >
        <Card className="bg-gradient-to-br from-blue-500 to-blue-600 border-none shadow-lg text-white relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <ListTodo className="w-24 h-24 transform rotate-12" />
          </div>
          <CardHeader className="pb-2">
            <CardTitle className="text-blue-100 font-medium text-sm">今日待办</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold mb-1">{todayTasks.length}</div>
            <div className="flex items-center gap-2 text-blue-100 text-sm">
              <Progress value={completionRate} className="h-1.5 bg-blue-400/30 flex-1" indicatorClassName="bg-white" />
              <span>{completionRate}%</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-slate-200 shadow-sm hover:shadow-md transition-shadow group">
          <CardHeader className="pb-2">
            <CardTitle className="text-slate-500 font-medium text-sm flex items-center justify-between">
              逾期任务
              <AlertCircle className="w-4 h-4 text-red-500" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-slate-800 mb-1 group-hover:text-red-600 transition-colors">
              {overdueTasks.length}
            </div>
            <p className="text-xs text-slate-400">需要尽快处理</p>
          </CardContent>
        </Card>

        <Card className="bg-white border-slate-200 shadow-sm hover:shadow-md transition-shadow group">
          <CardHeader className="pb-2">
            <CardTitle className="text-slate-500 font-medium text-sm flex items-center justify-between">
              今日已完成
              <CheckCircle2 className="w-4 h-4 text-green-500" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-slate-800 mb-1 group-hover:text-green-600 transition-colors">
              {completedToday.length}
            </div>
            <p className="text-xs text-slate-400">保持这个节奏！</p>
          </CardContent>
        </Card>
      </motion.div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Quick Add & Tasks */}
        <div className="lg:col-span-2 space-y-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
          >
            <QuickAddTask onAdd={(data) => createTaskMutation.mutate(data)} />
          </motion.div>

          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-500" />
              今日任务
            </h2>
            
            {todayTasks.length > 0 ? (
              <div className="space-y-3">
                {todayTasks.map(task => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onComplete={() => handleComplete(task)}
                    onDelete={() => deleteTaskMutation.mutate(task.id)}
                    onEdit={() => setEditingTask(task)}
                    onClick={() => setSelectedTask(task)}
                    onSubtaskToggle={handleSubtaskToggle}
                  />
                ))}
              </div>
            ) : (
              <Card className="bg-slate-50 border-dashed border-2 border-slate-200">
                <CardContent className="flex flex-col items-center justify-center py-10 text-slate-400">
                  <div className="bg-white p-4 rounded-full mb-3 shadow-sm">
                    <CalendarIcon className="w-8 h-8 text-slate-300" />
                  </div>
                  <p>今天暂无任务</p>
                  <p className="text-xs mt-1">享受美好的一天，或者添加新任务</p>
                </CardContent>
              </Card>
            )}

            {overdueTasks.length > 0 && (
              <>
                <h2 className="text-lg font-semibold text-red-600 flex items-center gap-2 mt-8">
                  <AlertCircle className="w-5 h-5" />
                  逾期任务
                </h2>
                <div className="space-y-3">
                  {overdueTasks.map(task => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      onComplete={() => handleComplete(task)}
                      onDelete={() => deleteTaskMutation.mutate(task.id)}
                      onEdit={() => setEditingTask(task)}
                      onClick={() => setSelectedTask(task)}
                      onSubtaskToggle={handleSubtaskToggle}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right Column: Insights & Summary */}
        <div className="space-y-6">
          <motion.div
             initial={{ opacity: 0, x: 20 }}
             animate={{ opacity: 1, x: 0 }}
             transition={{ delay: 0.3 }}
          >
            <UserBehaviorInsights />
          </motion.div>

          <Card className="border-slate-200 shadow-sm bg-gradient-to-br from-indigo-50 to-white">
            <CardHeader>
              <CardTitle className="text-indigo-900 flex items-center gap-2 text-base">
                <TrendingUp className="w-4 h-4" />
                近期概况
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-600">待办总数</span>
                  <span className="font-semibold text-slate-900">{pendingTasks.length}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-600">本周完成</span>
                  <span className="font-semibold text-green-600">
                    {activeTasks.filter(t => t.status === 'completed' && !t.parent_task_id).length}
                  </span>
                </div>
                <div className="pt-2 border-t border-indigo-100">
                  <p className="text-xs text-indigo-400 leading-relaxed">
                    💡 提示：定期清理逾期任务可以提高完成率和专注度。
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      </TabsContent>

      <TabsContent value="calendar">
        <CalendarView />
      </TabsContent>
      </Tabs>

      <TaskDetailModal
        task={selectedTask}
        open={!!selectedTask}
        onClose={() => setSelectedTask(null)}
      />

      <Dialog open={!!editingTask} onOpenChange={(open) => !open && setEditingTask(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>编辑任务</DialogTitle>
          </DialogHeader>
          {editingTask && (
            <QuickAddTask 
              initialData={editingTask} 
              onAdd={(taskData) => {
                  const { id, ...data } = taskData;
                  updateTaskMutation.mutate({ id: editingTask.id, data });
              }} 
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}