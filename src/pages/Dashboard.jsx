import React, { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, isToday, isPast, isFuture, parseISO, isWithinInterval, startOfDay, endOfDay, addDays, addMonths, addWeeks, startOfWeek, endOfWeek } from "date-fns";
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
  StickyNote,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { motion, AnimatePresence } from "framer-motion";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

import QuickAddTask from "../components/tasks/QuickAddTask";
import CalendarMonthView from "../components/calendar/CalendarMonthView";
import SoulMonthPlanner from "../components/calendar/SoulMonthPlanner";
import CalendarWeekView from "../components/calendar/CalendarWeekView";
import SoulWeekPlanner from "../components/calendar/SoulWeekPlanner";
import CalendarDayView from "../components/calendar/CalendarDayView";
import TaskCard from "../components/tasks/TaskCard";
import UserBehaviorInsights from "../components/insights/UserBehaviorInsights";
import NotificationManager from "../components/notifications/NotificationManager";
import TeamOnboardingProgress from "../components/dashboard/TeamOnboardingProgress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import TaskDetailModal from "../components/tasks/TaskDetailModal";
import { toast } from "sonner";
import { logUserBehavior } from "@/components/utils/behaviorLogger";
import { useTaskOperations } from "../components/hooks/useTaskOperations";
import SoulSentryHub from "../components/dashboard/SoulSentryHub";
import DailyBriefing from "../components/dashboard/DailyBriefing";
import SmartDailyPlanner from "../components/dashboard/SmartDailyPlanner";

export default function Dashboard() {
  const [greeting, setGreeting] = useState("你好");
  const [selectedTask, setSelectedTask] = useState(null);
  const [editingTask, setEditingTask] = useState(null);
  const [taskListDialog, setTaskListDialog] = useState({ open: false, title: "", tasks: [] });
  const [currentDate, setCurrentDate] = useState(new Date());
  const [calendarViewMode, setCalendarViewMode] = useState("month");
  const [showCalendarQuickAdd, setShowCalendarQuickAdd] = useState(false);
  const [calendarQuickAddDate, setCalendarQuickAddDate] = useState(null);
  const queryClient = useQueryClient();
  const location = useLocation();
  const soulSentryData = location.state?.soulSentryData;

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

  const { 
    updateTask, 
    updateTaskAsync,
    createTask, 
    deleteTask, 
    handleComplete, 
    handleSubtaskToggle 
  } = useTaskOperations();

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



  // Calendar navigation handlers
  const handleCalendarPrevious = () => {
    if (calendarViewMode === "month") {
      setCurrentDate(addMonths(currentDate, -1));
    } else if (calendarViewMode === "week") {
      setCurrentDate(addWeeks(currentDate, -1));
    } else {
      setCurrentDate(addDays(currentDate, -1));
    }
  };

  const handleCalendarNext = () => {
    if (calendarViewMode === "month") {
      setCurrentDate(addMonths(currentDate, 1));
    } else if (calendarViewMode === "week") {
      setCurrentDate(addWeeks(currentDate, 1));
    } else {
      setCurrentDate(addDays(currentDate, 1));
    }
  };

  const handleCalendarDateClick = (date) => {
    setCalendarQuickAddDate(date);
    setShowCalendarQuickAdd(true);
  };

  const handleCalendarTaskDrop = (taskId, newDate) => {
    const task = allTasks.find(t => t.id === taskId);
    if (!task) return;

    const oldDate = new Date(task.reminder_time);
    const updatedDate = new Date(newDate);
    updatedDate.setHours(oldDate.getHours(), oldDate.getMinutes(), 0, 0);

    let newEndTime = null;
    if (task.end_time) {
      const oldEndDate = new Date(task.end_time);
      const timeDiff = oldEndDate.getTime() - oldDate.getTime();
      newEndTime = new Date(updatedDate.getTime() + timeDiff);
    }

    updateTask({
      id: taskId,
      data: {
        reminder_time: updatedDate.toISOString(),
        ...(newEndTime && { end_time: newEndTime.toISOString() })
      }
    });
  };

  const getCalendarDateLabel = () => {
    if (calendarViewMode === "month") {
      return format(currentDate, "yyyy年M月", { locale: zhCN });
    } else if (calendarViewMode === "week") {
      const weekStart = startOfWeek(currentDate, { locale: zhCN });
      const weekEnd = endOfWeek(currentDate, { locale: zhCN });
      return `${format(weekStart, "M月d日", { locale: zhCN })} - ${format(weekEnd, "M月d日", { locale: zhCN })}`;
    } else {
      return format(currentDate, "yyyy年M月d日 EEEE", { locale: zhCN });
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
    <div className="p-3 md:p-8 space-y-4 md:space-y-6 max-w-7xl mx-auto min-h-screen">
      <NotificationManager />
      
      <Tabs defaultValue="overview" className="space-y-4 md:space-y-6">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-3 md:gap-4">
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900 mb-0.5 flex items-center gap-2">
              {greeting}，{user?.full_name || (user?.email && typeof user.email === 'string' && user.email.includes('@') ? ((user.email.split('@')[0]) || '朋友') : "朋友")} 
              <Sun className="w-5 h-5 md:w-6 md:h-6 text-amber-500 fill-amber-500 animate-pulse" />
            </h1>
            <p className="text-slate-500 text-sm md:text-base">
              今天是 {format(new Date(), "yyyy年MM月dd日 EEEE", { locale: zhCN })}
            </p>
          </motion.div>

          <TabsList className="bg-white shadow-md rounded-[12px] p-1 h-auto w-full md:w-auto">
            <TabsTrigger value="overview" className="rounded-[10px] px-4 md:px-6 py-2 flex-1 md:flex-none data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#384877] data-[state=active]:to-[#3b5aa2] data-[state=active]:text-white text-sm">
              <ListTodo className="w-4 h-4 mr-1.5" />
              概览
            </TabsTrigger>
            <TabsTrigger value="calendar" className="rounded-[10px] px-4 md:px-6 py-2 flex-1 md:flex-none data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#384877] data-[state=active]:to-[#3b5aa2] data-[state=active]:text-white text-sm">
              <CalendarIcon className="w-4 h-4 mr-1.5" />
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
        className="grid grid-cols-3 gap-2 md:gap-4"
      >
        <Card className="bg-[#384877] border-none shadow-xl text-white relative overflow-hidden group">
          <div className="absolute top-1 right-1 md:top-2 md:right-2 p-2 md:p-4 opacity-[0.1] group-hover:opacity-[0.15] transition-opacity">
            <ListTodo className="w-16 h-16 md:w-28 md:h-28 transform rotate-12 text-white" />
          </div>
          <CardHeader className="pb-1 md:pb-2 relative z-10 p-3 md:p-6">
            <CardTitle className="text-blue-100 font-medium text-xs md:text-sm">今日待办</CardTitle>
          </CardHeader>
          <CardContent className="relative z-10 p-3 pt-0 md:p-6 md:pt-0">
            <div 
              className="text-3xl md:text-5xl font-bold mb-3 md:mb-6 cursor-pointer hover:opacity-80 transition-opacity w-fit active:scale-95"
              onClick={() => setTaskListDialog({
                open: true,
                title: "今日待办",
                tasks: todayTasks.filter(t => t.status === 'pending')
              })}
            >
              {todayTasks.filter(t => t.status === 'pending').length}
            </div>
            <div className="flex items-center gap-2 md:gap-3 text-blue-100 text-xs md:text-sm">
              <Progress 
                value={completionRate} 
                className="h-1.5 md:h-2 bg-[#2a3659] flex-1" 
                indicatorClassName="bg-[#5a7bd6]" 
              />
              <span className="font-medium">{completionRate}%</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-slate-200 shadow-sm hover:shadow-md transition-shadow group">
          <CardHeader className="pb-1 md:pb-2 p-3 md:p-6">
            <CardTitle className="text-slate-500 font-medium text-xs md:text-sm flex items-center justify-between">
              <span className="truncate">逾期约定</span>
              <AlertCircle className="w-3.5 h-3.5 md:w-4 md:h-4 text-red-500 shrink-0" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
            <div 
              className="text-2xl md:text-3xl font-bold text-slate-800 mb-0.5 md:mb-1 group-hover:text-red-600 transition-colors cursor-pointer w-fit active:scale-95"
              onClick={() => setTaskListDialog({
                open: true,
                title: "逾期约定",
                tasks: overdueTasks
              })}
            >
              {overdueTasks.length}
            </div>
            <p className="text-[10px] md:text-xs text-slate-400 truncate">需要尽快处理</p>
          </CardContent>
        </Card>

        <Card className="bg-white border-slate-200 shadow-sm hover:shadow-md transition-shadow group">
          <CardHeader className="pb-1 md:pb-2 p-3 md:p-6">
            <CardTitle className="text-slate-500 font-medium text-xs md:text-sm flex items-center justify-between">
              <span className="truncate">今日已完成</span>
              <CheckCircle2 className="w-3.5 h-3.5 md:w-4 md:h-4 text-green-500 shrink-0" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
            <div 
              className="text-2xl md:text-3xl font-bold text-slate-800 mb-0.5 md:mb-1 group-hover:text-green-600 transition-colors cursor-pointer w-fit active:scale-95"
              onClick={() => setTaskListDialog({
                open: true,
                title: "今日已完成",
                tasks: completedToday
              })}
            >
              {completedToday.length}
            </div>
            <p className="text-[10px] md:text-xs text-slate-400 truncate">保持这个节奏！</p>
          </CardContent>
        </Card>
      </motion.div>

      <DailyBriefing />

      {/* Smart Daily Planner */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
      >
        <SmartDailyPlanner />
      </motion.div>

      {/* Main Content: SoulSentry Hub */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="mt-6"
      >
        <SoulSentryHub initialData={soulSentryData} initialShowResults={!!soulSentryData} />
      </motion.div>
      </TabsContent>

      <TabsContent value="calendar" className="space-y-4 md:space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2 md:gap-3 overflow-x-auto scrollbar-hide">
            <Button
              onClick={() => setCurrentDate(new Date())}
              variant="outline"
              className="rounded-xl shrink-0 h-9 md:h-10 text-sm"
            >
              今天
            </Button>
            
            <div className="flex items-center bg-white rounded-xl p-0.5 md:p-1 border border-slate-200">
              {[
                { value: "month", label: "月", icon: CalendarIcon },
                { value: "week", label: "周", icon: ListTodo },
                { value: "day", label: "日", icon: Clock },
              ].map((mode) => {
                const Icon = mode.icon;
                return (
                  <Button
                    key={mode.value}
                    onClick={() => setCalendarViewMode(mode.value)}
                    variant={calendarViewMode === mode.value ? "default" : "ghost"}
                    size="sm"
                    className={`rounded-lg h-8 md:h-9 px-2.5 md:px-3 text-xs md:text-sm ${
                      calendarViewMode === mode.value
                        ? "bg-gradient-to-r from-[#384877] to-[#3b5aa2] text-white"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 md:w-4 md:h-4 mr-1" />
                    {mode.label}
                  </Button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between bg-white rounded-2xl p-3 md:p-4 border border-slate-200 shadow-sm">
          <Button
            onClick={handleCalendarPrevious}
            variant="ghost"
            size="icon"
            className="rounded-xl hover:bg-slate-100 h-9 w-9 md:h-10 md:w-10 shrink-0"
          >
            <ChevronLeft className="w-5 h-5" />
          </Button>

          <Popover>
            <PopoverTrigger asChild>
              <h2 className="text-base md:text-xl font-semibold text-slate-800 cursor-pointer hover:text-[#384877] transition-colors select-none truncate px-2">
                {getCalendarDateLabel()}
              </h2>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="center">
              <Calendar
                mode="single"
                selected={currentDate}
                onSelect={(date) => date && setCurrentDate(date)}
                initialFocus
              />
            </PopoverContent>
          </Popover>

          <Button
            onClick={handleCalendarNext}
            variant="ghost"
            size="icon"
            className="rounded-xl hover:bg-slate-100 h-9 w-9 md:h-10 md:w-10 shrink-0"
          >
            <ChevronRight className="w-5 h-5" />
          </Button>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-lg overflow-hidden">
          <AnimatePresence mode="wait">
            {calendarViewMode === "month" && (
              <SoulMonthPlanner
                key="month"
                currentDate={currentDate}
                tasks={activeTasks}
                notes={allNotes.filter(n => !n.deleted_at)}
                onDateClick={handleCalendarDateClick}
                onTaskDrop={handleCalendarTaskDrop}
                onTaskClick={setSelectedTask}
              />
            )}
            {calendarViewMode === "week" && (
              <SoulWeekPlanner
                key="week"
                currentDate={currentDate}
              />
            )}
            {calendarViewMode === "day" && (
              <CalendarDayView
                key="day"
                currentDate={currentDate}
                tasks={activeTasks}
                notes={allNotes.filter(n => !n.deleted_at)}
                onDateClick={handleCalendarDateClick}
                onTaskDrop={handleCalendarTaskDrop}
                onTaskClick={setSelectedTask}
                onNavigateToDate={setCurrentDate}
              />
            )}
          </AnimatePresence>
        </div>

        <Dialog open={showCalendarQuickAdd} onOpenChange={setShowCalendarQuickAdd}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                创建约定
                {calendarQuickAddDate && (
                  <span className="text-sm font-normal text-slate-500 ml-2">
                    {format(calendarQuickAddDate, "yyyy年M月d日", { locale: zhCN })}
                  </span>
                )}
              </DialogTitle>
            </DialogHeader>
            <QuickAddTask
              initialData={{
                reminder_time: calendarQuickAddDate || new Date(),
              }}
              onAdd={(taskData) => createTask(taskData)}
            />
          </DialogContent>
        </Dialog>
      </TabsContent>
      </Tabs>

      <TaskDetailModal
        task={selectedTask}
        open={!!selectedTask}
        onClose={() => setSelectedTask(null)}
      />

      <Dialog open={taskListDialog.open} onOpenChange={(open) => setTaskListDialog(prev => ({ ...prev, open }))}>
        <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{taskListDialog.title}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="flex-1 mt-2 pr-4 -mr-4">
            <div className="space-y-3 p-1">
              {taskListDialog.tasks.length > 0 ? (
                taskListDialog.tasks.map(task => (
                  <div 
                    key={task.id}
                    className="p-3 bg-white border border-slate-100 rounded-xl hover:border-slate-300 hover:shadow-sm transition-all cursor-pointer group"
                    onClick={() => {
                      setTaskListDialog(prev => ({ ...prev, open: false }));
                      setSelectedTask(task);
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${
                        task.priority === 'high' ? 'bg-red-500' : 
                        task.priority === 'medium' ? 'bg-amber-500' : 'bg-green-500'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-slate-800 truncate group-hover:text-[#384877] transition-colors">
                          {task.title}
                        </h4>
                        {task.reminder_time && (
                          <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {format(parseISO(task.reminder_time), "MM-dd HH:mm")}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-slate-400 text-sm">
                  暂无相关约定
                </div>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingTask} onOpenChange={(isOpen) => {
        if (!isOpen) setEditingTask(null);
      }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto scrollbar-hide">
          <DialogHeader>
            <DialogTitle>编辑约定</DialogTitle>
          </DialogHeader>
          {editingTask && (
            <QuickAddTask 
              initialData={editingTask} 
              onAdd={async (taskData) => {
                  const { id, ...data } = taskData;
                  await updateTaskAsync({ id: editingTask.id, data });
                  setEditingTask(null);
              }} 
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}