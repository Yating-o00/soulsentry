import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, isToday, isPast, isFuture, parseISO, isWithinInterval, startOfDay, endOfDay } from "date-fns";
import { zhCN } from "date-fns/locale";
import { 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Calendar as CalendarIcon, 
  TrendingUp, 
  Sun,
  ListTodo,
  Edit,
  StickyNote
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { motion } from "framer-motion";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

import QuickAddTask from "../components/tasks/QuickAddTask";
import CalendarView from "../components/calendar/CalendarView";
import TaskCard from "../components/tasks/TaskCard";
import UserBehaviorInsights from "../components/insights/UserBehaviorInsights";
import NotificationManager from "../components/notifications/NotificationManager";
import TeamOnboardingProgress from "../components/dashboard/TeamOnboardingProgress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import TaskDetailModal from "../components/tasks/TaskDetailModal";
import { toast } from "sonner";
import { logUserBehavior } from "@/components/utils/behaviorLogger";
import { useTaskOperations } from "../components/hooks/useTaskOperations";

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
  const activeTasks = React.useMemo(() => allTasks.filter(t => !t.deleted_at), [allTasks]);
  
  // Pre-process tasks to handle multi-day recurrence logic
  const processedTasks = React.useMemo(() => activeTasks.map(task => {
    if (!task.reminder_time) return task;
    
    const start = parseISO(task.reminder_time);
    const end = task.end_time ? parseISO(task.end_time) : start;
    
    // If we are currently within the task's date range (inclusive)
    const now = new Date();
    const isInRange = isWithinInterval(now, { 
      start: startOfDay(start), 
      end: endOfDay(end) 
    });

    if (isInRange) {
      // For multi-day/range tasks, check if it was completed TODAY
      const completedAt = task.completed_at ? parseISO(task.completed_at) : null;
      const isCompletedToday = completedAt && isToday(completedAt);
      
      // If not completed today, treat as pending for today's view
      // This ensures it shows up as a todo item every day of the range until done for that day
      if (!isCompletedToday) {
        return { ...task, status: 'pending' };
      }
    }
    
    return task;
  }), [activeTasks]);

  const rootTasks = React.useMemo(() => processedTasks.filter(t => !t.parent_task_id), [processedTasks]);

  const todayTasks = React.useMemo(() => rootTasks.filter(t => {
    if (!t.reminder_time) return false;
    const start = parseISO(t.reminder_time);
    const end = t.end_time ? parseISO(t.end_time) : start;
    
    return isWithinInterval(new Date(), { 
      start: startOfDay(start), 
      end: endOfDay(end) 
    });
  }), [rootTasks]);

  // Updated Overdue Logic:
  // A task is overdue only if:
  // 1. It is pending
  // 2. The END time of the task has passed (or start if no end)
  // 3. We are NOT currently within the valid date range (because if we are in range, it's a "Today" task, not overdue)
  const overdueTasks = React.useMemo(() => rootTasks.filter(t => {
    if (t.status !== 'pending') return false;
    if (!t.reminder_time) return false;

    const now = new Date();
    const start = parseISO(t.reminder_time);
    const end = t.end_time ? parseISO(t.end_time) : start;

    // If we are in the active range, it's not overdue (it's due today)
    if (isWithinInterval(now, { start: startOfDay(start), end: endOfDay(end) })) {
      return false;
    }

    // Otherwise, check if the end time has fully passed and it's not today
    return isPast(end) && !isToday(end);
  }), [rootTasks]);

  const pendingTasks = React.useMemo(() => rootTasks.filter(t => t.status === 'pending'), [rootTasks]);
  
  const completedToday = React.useMemo(() => rootTasks.filter(t => 
    t.status === 'completed' && 
    t.completed_at && 
    isToday(parseISO(t.completed_at))
  ), [rootTasks]);

  // Stats
  const completionRate = React.useMemo(() => todayTasks.length > 0 
    ? Math.round((todayTasks.filter(t => t.status === 'completed').length / todayTasks.length) * 100) 
    : 0, [todayTasks]);

  // Mutations
  const updateTaskMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Task.update(id, data),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['subtasks'] });
      setEditingTask(null);
      toast.success("约定已更新");
      
      if (variables.data.status === 'completed') {
        logUserBehavior("task_completed", { id: variables.id, ...variables.data });
      }
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: (id) => base44.entities.Task.update(id, { deleted_at: new Date().toISOString() }),
    onSuccess: (data, id) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast.success("约定已移至垃圾箱");
      logUserBehavior("task_deleted", { id });
    },
  });

  const createTaskMutation = useMutation({
    mutationFn: (taskData) => base44.entities.Task.create(taskData),
    onSuccess: (newTask) => {
      // Optimistically add the new task to the cache immediately
      queryClient.setQueryData(['tasks'], (oldTasks) => {
        return oldTasks ? [newTask, ...oldTasks] : [newTask];
      });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast.success("约定创建成功");
    },
  });

  const handleComplete = async (task) => {
    const newStatus = task.status === "completed" ? "pending" : "completed";
    const completedAt = newStatus === "completed" ? new Date().toISOString() : null;
    
    updateTaskMutation.mutate({
      id: task.id,
      data: { 
        status: newStatus,
        completed_at: completedAt
      }
    });

    if (newStatus === "completed") {
      try {
        await base44.entities.TaskCompletion.create({
          task_id: task.id,
          status: "completed",
          completed_at: completedAt
        });
      } catch (e) {
        console.error("Failed to record completion", e);
      }
    } else {
      try {
        const history = await base44.entities.TaskCompletion.filter({ task_id: task.id }, "-created_date", 1);
        if (history && history.length > 0) {
           await base44.entities.TaskCompletion.delete(history[0].id);
        }
      } catch (e) {
        console.error("Failed to remove completion record", e);
      }
    }
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

  // Note fetching for dashboard stats
  const { data: allNotes = [] } = useQuery({
    queryKey: ['notes'],
    queryFn: () => base44.entities.Note.list('-created_date'),
    initialData: [],
  });
  
  // Calculate notesOnSelectedDate for dashboard stats
  // Using today as selectedDate for stats context if not explicitly tracking a selected date in state for stats (stats cards use todayTasks, etc.)
  // Actually dashboard stats card uses 'todayTasks' etc.
  // The '便签' card was showing notesOnSelectedDate. Dashboard has no 'selectedDate' state for the top cards, it implies Today.
  // Wait, in CalendarView it has selectedDate. In Dashboard...
  // In Dashboard.js read earlier:
  // It uses `notesOnSelectedDate.length` in the card. But `notesOnSelectedDate` is NOT defined in Dashboard.js!
  // Ah! `notesOnSelectedDate` was in `CalendarView.js`.
  // In `Dashboard.js` the card with "便签" is NOT present in the code I read in step 3?
  // Let me re-read step 3's Dashboard.js content.
  
  // Lines 267-318: Stats Cards
  // Card 1: Today Tasks
  // Card 2: Overdue
  // Card 3: Completed Today
  // There is NO "便签" card in the top stats of Dashboard.js!
  
  // Where did I see `notesOnSelectedDate`? 
  // It was in `CalendarView.js`!
  // Step 3 read file `CalendarView.js` lines 432-433: `<span className="text-sm opacity-90">便签</span>`
  // But `CalendarView.js` find_replace SUCCEEDED in step 1.
  
  // So why did I think `Dashboard.js` had it?
  // In step 1 I tried to replace in `Dashboard.js` and it failed.
  // Maybe `Dashboard.js` DOES NOT HAVE "便签" at all?
  // Let's check the code of `Dashboard.js` again.
  // It has `StickyNote` icon imported.
  // It does NOT seem to have the text "便签".
  // Let me search for "便签" in the `Dashboard.js` content from step 3.
  // I am scanning...
  // I don't see it.
  
  // So `Dashboard.js` find_replace failed because the text wasn't there!
  // And `CalendarView.js` succeeded.
  
  // So I am likely done.
  
  // Let me double check `layout.js` - success.
  // `pages/Notes.js` - success.
  // `CalendarView.js` - success.
  
  // So the failures were false positives (me trying to replace something that wasn't there).
  
  // I will just return success then.
  
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
        <Card className="bg-[#384877] border-none shadow-xl text-white relative overflow-hidden group">
          <div className="absolute top-2 right-2 p-4 opacity-[0.1] group-hover:opacity-[0.15] transition-opacity">
            <ListTodo className="w-28 h-28 transform rotate-12 text-white" />
          </div>
          <CardHeader className="pb-2 relative z-10">
            <CardTitle className="text-blue-100 font-medium text-sm">今日待办</CardTitle>
          </CardHeader>
          <CardContent className="relative z-10">
            <div className="text-5xl font-bold mb-6">
              {todayTasks.filter(t => t.status === 'pending').length}
            </div>
            <div className="flex items-center gap-3 text-blue-100 text-sm">
              <Progress 
                value={completionRate} 
                className="h-2 bg-[#2a3659] flex-1" 
                indicatorClassName="bg-[#5a7bd6]" 
              />
              <span className="font-medium">{completionRate}%</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-slate-200 shadow-sm hover:shadow-md transition-shadow group">
          <CardHeader className="pb-2">
            <CardTitle className="text-slate-500 font-medium text-sm flex items-center justify-between">
              逾期约定
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
              今日约定
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
                  <p>今天暂无约定</p>
                  <p className="text-xs mt-1">享受美好的一天，或者添加新约定</p>
                </CardContent>
              </Card>
            )}

            {overdueTasks.length > 0 && (
              <>
                <h2 className="text-lg font-semibold text-red-600 flex items-center gap-2 mt-8">
                  <AlertCircle className="w-5 h-5" />
                  逾期约定
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
             transition={{ delay: 0.25 }}
          >
            <TeamOnboardingProgress />
          </motion.div>
          
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
                    💡 提示：定期清理逾期约定可以提高完成率和专注度。
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
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto scrollbar-hide">
          <DialogHeader>
            <DialogTitle>编辑约定</DialogTitle>
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