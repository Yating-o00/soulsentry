import React, { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, isToday, isPast, isFuture, parseISO, isWithinInterval, startOfDay, endOfDay, addDays, addMonths, addWeeks, startOfWeek, endOfWeek } from "date-fns";
import { zhCN } from "date-fns/locale";
import { 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Calendar as CalendarIcon, 
  TrendingUp,
  ListTodo,
  Edit,
  StickyNote,
  ChevronLeft,
  ChevronRight,
  User
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
import GoogleCalendarSync from "../components/calendar/GoogleCalendarSync";
import AutoExecutionPanel from "../components/automation/AutoExecutionPanel";
import DeviceCollaborationModule from "../components/dashboard/DeviceCollaborationModule";
import SpatioTemporalGuardModule from "../components/dashboard/SpatioTemporalGuardModule";
import { isDemoUser } from "@/hooks/useTrialGate";
import "./today-theme.css";
import { useRevealRoot } from "../components/dashboard/useReveal";
import { phaseOf } from "@/lib/todayPhase";
import TodayHero from "../components/today/TodayHero";
import TodaySection from "../components/today/TodaySection";
import TodayTimeline from "../components/today/TodayTimeline";
import MoodMirror from "../components/today/MoodMirror";
import RetroBars from "../components/today/RetroBars";

export default function Dashboard() {
  const [selectedTask, setSelectedTask] = useState(null);
  const [editingTask, setEditingTask] = useState(null);
  const [taskListDialog, setTaskListDialog] = useState({ open: false, title: "", tasks: [] });
  const [currentDate, setCurrentDate] = useState(new Date());
  const [calendarViewMode, setCalendarViewMode] = useState("month");
  const [showCalendarQuickAdd, setShowCalendarQuickAdd] = useState(false);
  const [calendarQuickAddDate, setCalendarQuickAddDate] = useState(null);
  const [phase, setPhase] = useState(() => phaseOf());
  const todayRef = useRevealRoot();
  const queryClient = useQueryClient();
  const location = useLocation();
  const soulSentryData = location.state?.soulSentryData;
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    const t = setInterval(() => setPhase(phaseOf()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Get current user
  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me(),
  });

  // Get all tasks
  const { data: tasksRaw = [], isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => base44.entities.Task.list('-reminder_time'),
    initialData: [],
  });
  const allTasks = Array.isArray(tasksRaw) ? tasksRaw : [];

  const { data: notesRaw = [] } = useQuery({
    queryKey: ['notes'],
    queryFn: () => base44.entities.Note.list('-created_date'),
    initialData: [],
  });
  const allNotes = Array.isArray(notesRaw) ? notesRaw : [];

  const { 
    updateTask, 
    updateTaskAsync,
    createTask, 
    deleteTask, 
    handleComplete, 
    handleSubtaskToggle 
  } = useTaskOperations();

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

  // Stats - 进度条 = 今天实际完成数 / (今天待办 + 今天已完成)
  // 与"今日已完成"卡片口径保持一致，避免被 processedTasks 强制 pending 污染
  const completionRate = React.useMemo(() => {
    const pendingToday = todayTasks.filter(t => t.status === 'pending').length;
    const doneToday = completedToday.length;
    const total = pendingToday + doneToday;
    return total > 0 ? Math.round((doneToday / total) * 100) : 0;
  }, [todayTasks, completedToday]);

  // —— 今日页 Hero / 时间线数据 ——
  const notesList = React.useMemo(
    () => (Array.isArray(allNotes) ? allNotes.filter(n => n && !n.deleted_at) : []),
    [allNotes]
  );

  const memory = React.useMemo(() => {
    const keptToday =
      activeTasks.filter(t => t.created_date && isToday(parseISO(t.created_date))).length +
      notesList.filter(n => n.created_date && isToday(parseISO(n.created_date))).length;
    return {
      kept: keptToday,
      watching: todayTasks.filter(t => t.status === 'pending').length,
      notes: notesList.length,
    };
  }, [activeTasks, notesList, todayTasks]);

  const whisper = React.useMemo(() => {
    const upcoming = todayTasks
      .filter(t => t.status === 'pending' && t.reminder_time)
      .sort((a, b) => new Date(a.reminder_time) - new Date(b.reminder_time));
    if (upcoming.length > 0) {
      return `今天记得：「${upcoming[0].title}」。除此之外，其余的都已被妥善记住，你只管从容去过。`;
    }
    if (completedToday.length > 0) {
      return '今天的约定都已兑现。夜晚回望时，你会感谢现在这个从容的自己。';
    }
    return '今天还是一张白纸。把心事说给下面的门听，我替你记住，并陪你慢慢读懂它。';
  }, [todayTasks, completedToday]);

  const nowLabel = format(new Date(), 'HH:mm');
  const timelineTasks = React.useMemo(
    () => [...todayTasks, ...completedToday],
    [todayTasks, completedToday]
  );



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

  return (
    <div className="p-3 md:p-8 space-y-4 md:space-y-6 max-w-7xl mx-auto min-h-screen">
      <NotificationManager />

      {isDemoUser(user) && (
        <div className="rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                <User className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-amber-900">当前为 Demo 体验模式</p>
                <p className="text-xs text-amber-700/80 mt-0.5">
                  数据仅保存在当前设备，退出后可能丢失。如需完整功能，请登录或注册账号。
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 pl-11 sm:pl-0">
              <button
                onClick={() => window.location.href = "/login"}
                className="px-4 py-2 text-xs font-medium rounded-xl bg-white border border-amber-200 text-amber-800 hover:bg-amber-50 transition-colors"
              >
                登录
              </button>
              <button
                onClick={() => window.location.href = "/login?mode=register"}
                className="px-4 py-2 text-xs font-medium rounded-xl bg-gradient-to-r from-[#384877] to-[#3b5aa2] text-white hover:shadow-md transition-shadow"
              >
                注册
              </button>
            </div>
          </div>
        </div>
      )}

      <Tabs defaultValue="overview" className="space-y-4 md:space-y-6">
        {/* Header Section：问候移入 Hero 天幕带，这里只留页签与同步入口 */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-3 md:gap-4">
          <div className="flex items-center gap-2 w-full md:w-auto md:ml-auto">
          <TabsList className="bg-white shadow-md rounded-[12px] p-1 h-auto flex-1 md:flex-none">
            <TabsTrigger value="overview" className="rounded-[10px] px-4 md:px-6 py-2 flex-1 md:flex-none data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#384877] data-[state=active]:to-[#3b5aa2] data-[state=active]:text-white text-sm">
              <ListTodo className="w-4 h-4 mr-1.5" />
              概览
            </TabsTrigger>
            <TabsTrigger value="calendar" className="rounded-[10px] px-4 md:px-6 py-2 flex-1 md:flex-none data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#384877] data-[state=active]:to-[#3b5aa2] data-[state=active]:text-white text-sm">
              <CalendarIcon className="w-4 h-4 mr-1.5" />
              日历
            </TabsTrigger>
          </TabsList>
          <GoogleCalendarSync tasks={activeTasks} />
          </div>
        </div>

        <TabsContent value="overview">
          <div ref={todayRef} className="today-page space-y-14" data-phase={phase}>
            <TodayHero
              phase={phase}
              dateLabel={format(new Date(), "yyyy年MM月dd日 EEEE", { locale: zhCN })}
              whisper={whisper}
              memory={memory}
              userName={user?.full_name || (user?.email && typeof user.email === 'string' && user.email.includes('@') ? ((user.email.split('@')[0]) || '朋友') : "朋友")}
            />

            {/* 01 内容输入 */}
            <TodaySection no="01" title="内容输入" sub="告诉我，任何事情" index={1}>
              <div className="module-shell">
                <SoulSentryHub initialData={soulSentryData} initialShowResults={!!soulSentryData} />
              </div>
            </TodaySection>

            {/* 02 今日印记（当日待完成） */}
            <TodaySection no="02" title="今日印记" sub="经过的每一刻，都值得被记住" index={2} bodyClassName="space-y-6">
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

              <TodayTimeline
                tasks={timelineTasks}
                nowLabel={nowLabel}
                onToggle={(t) => handleComplete(t, allTasks)}
              />

              {/* 智能日程规划（完整功能保留） */}
              <SmartDailyPlanner />
            </TodaySection>

            {/* 03 心境（心签 + 约定的数据分析） */}
            <TodaySection no="03" title="心境" sub="心栈眼中的你" index={3} bodyClassName="space-y-6">
              <MoodMirror notes={notesList} tasks={activeTasks} />
              <UserBehaviorInsights />
            </TodaySection>

            {/* 04 守护动态（时空感知守护） */}
            <TodaySection no="04" title="守护动态" sub="记忆会在对的时候，回来找你" index={4}>
              <div className="module-shell">
                <SpatioTemporalGuardModule />
              </div>
            </TodaySection>

            {/* 05 心栈为你编织（自动执行） */}
            <TodaySection no="05" title="心栈为你编织" sub="把零散的记录，织成理解" index={5}>
              <div className="module-shell">
                <AutoExecutionPanel />
              </div>
            </TodaySection>

            {/* 06 全设备协同 */}
            <TodaySection no="06" title="全设备协同" sub="你在哪里，记忆就在哪里" index={6}>
              <div className="module-shell">
                <DeviceCollaborationModule />
              </div>
            </TodaySection>

            {/* 07 AI 简报 + 回望与远见 */}
            <TodaySection no="07" title="回望与远见" sub="数据是你的年轮，简报是我的心意" index={7}>
              <div className="grid gap-4 lg:grid-cols-5">
                <div className="lg:col-span-2">
                  <RetroBars tasks={activeTasks} notes={notesList} />
                </div>
                <div className="lg:col-span-3">
                  <DailyBriefing />
                </div>
              </div>
              <div className="mt-12 pb-4 text-center">
                <p className="font-[var(--font-serif)] text-[17px] tracking-[0.1em] text-[var(--ink-2)]">
                  观照自己，觉察当下
                </p>
                <p className="mt-1.5 text-[11px] tracking-[0.2em] text-[var(--ink-4)]">心栈 SOULSENTRY</p>
              </div>
            </TodaySection>
          </div>
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
          <AnimatePresence>
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
                tasks={activeTasks}
                notes={allNotes.filter(n => !n.deleted_at)}
                onDateClick={handleCalendarDateClick}
                onTaskDrop={handleCalendarTaskDrop}
                onTaskClick={setSelectedTask}
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
        <DialogContent className="max-w-md max-h-[80vh] flex flex-col overflow-hidden">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>{taskListDialog.title}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto mt-2 pr-2 -mr-2 min-h-0">
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
          </div>
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