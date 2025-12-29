import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus, Grid3x3, List, Columns } from "lucide-react";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths, addWeeks, isSameMonth, isSameDay, isToday, startOfDay, parseISO } from "date-fns";
import { zhCN } from "date-fns/locale";
import CalendarDayView from "../components/calendar/CalendarDayView";
import CalendarWeekView from "../components/calendar/CalendarWeekView";
import CalendarMonthView from "../components/calendar/CalendarMonthView";
import QuickAddTask from "../components/tasks/QuickAddTask";
import TaskDetailModal from "../components/tasks/TaskDetailModal";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

const VIEW_MODES = [
  { value: "month", label: "月", icon: Grid3x3 },
  { value: "week", label: "周", icon: Columns },
  { value: "day", label: "日", icon: List },
];

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState("month");
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickAddDate, setQuickAddDate] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);
  const queryClient = useQueryClient();

  // Fetch tasks
  const { data: tasks = [], isLoading: loadingTasks } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => base44.entities.Task.list('-reminder_time'),
    initialData: []
  });

  // Fetch notes
  const { data: notes = [], isLoading: loadingNotes } = useQuery({
    queryKey: ['notes'],
    queryFn: () => base44.entities.Note.list('-created_date'),
    initialData: []
  });

  // Update task mutation
  const updateTaskMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Task.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast.success("约定已更新");
    },
  });

  // Create task mutation
  const createTaskMutation = useMutation({
    mutationFn: (data) => base44.entities.Task.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setShowQuickAdd(false);
      toast.success("约定已创建");
    },
  });

  // Filter tasks and notes by date range
  const calendarItems = useMemo(() => {
    const activeTasks = tasks.filter(t => !t.deleted_at);
    const activeNotes = notes.filter(n => !n.deleted_at);

    return {
      tasks: activeTasks,
      notes: activeNotes
    };
  }, [tasks, notes]);

  // Navigation handlers
  const handlePrevious = () => {
    if (viewMode === "month") {
      setCurrentDate(addMonths(currentDate, -1));
    } else if (viewMode === "week") {
      setCurrentDate(addWeeks(currentDate, -1));
    } else {
      setCurrentDate(addDays(currentDate, -1));
    }
  };

  const handleNext = () => {
    if (viewMode === "month") {
      setCurrentDate(addMonths(currentDate, 1));
    } else if (viewMode === "week") {
      setCurrentDate(addWeeks(currentDate, 1));
    } else {
      setCurrentDate(addDays(currentDate, 1));
    }
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  const handleDateClick = (date) => {
    setQuickAddDate(date);
    setShowQuickAdd(true);
  };

  const handleTaskDrop = (taskId, newDate) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const oldDate = new Date(task.reminder_time);
    const updatedDate = new Date(newDate);
    updatedDate.setHours(oldDate.getHours(), oldDate.getMinutes(), 0, 0);

    // Calculate end_time if exists
    let newEndTime = null;
    if (task.end_time) {
      const oldEndDate = new Date(task.end_time);
      const timeDiff = oldEndDate.getTime() - oldDate.getTime();
      newEndTime = new Date(updatedDate.getTime() + timeDiff);
    }

    updateTaskMutation.mutate({
      id: taskId,
      data: {
        reminder_time: updatedDate.toISOString(),
        ...(newEndTime && { end_time: newEndTime.toISOString() })
      }
    });
  };

  const getDateRangeLabel = () => {
    if (viewMode === "month") {
      return format(currentDate, "yyyy年M月", { locale: zhCN });
    } else if (viewMode === "week") {
      const weekStart = startOfWeek(currentDate, { locale: zhCN });
      const weekEnd = endOfWeek(currentDate, { locale: zhCN });
      return `${format(weekStart, "M月d日", { locale: zhCN })} - ${format(weekEnd, "M月d日", { locale: zhCN })}`;
    } else {
      return format(currentDate, "yyyy年M月d日 EEEE", { locale: zhCN });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f9fafb] via-[#f9fafb]/50 to-[#eef2f7]/30 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col md:flex-row md:items-center justify-between gap-4"
        >
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[#384877] to-[#3b5aa2] flex items-center justify-center shadow-lg shadow-[#384877]/20">
              <CalendarIcon className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-800">日历视图</h1>
              <p className="text-sm text-slate-600">一览你的约定与心签</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={handleToday}
              variant="outline"
              className="rounded-xl"
            >
              今天
            </Button>
            
            <div className="flex items-center gap-2 bg-white rounded-xl p-1 border border-slate-200">
              {VIEW_MODES.map((mode) => {
                const Icon = mode.icon;
                return (
                  <Button
                    key={mode.value}
                    onClick={() => setViewMode(mode.value)}
                    variant={viewMode === mode.value ? "default" : "ghost"}
                    size="sm"
                    className={`rounded-lg ${
                      viewMode === mode.value
                        ? "bg-gradient-to-r from-[#384877] to-[#3b5aa2] text-white"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <Icon className="w-4 h-4 mr-1.5" />
                    {mode.label}
                  </Button>
                );
              })}
            </div>
          </div>
        </motion.div>

        {/* Date Navigation */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="flex items-center justify-between bg-white rounded-2xl p-4 border border-slate-200 shadow-sm"
        >
          <Button
            onClick={handlePrevious}
            variant="ghost"
            size="icon"
            className="rounded-xl hover:bg-slate-100"
          >
            <ChevronLeft className="w-5 h-5" />
          </Button>

          <h2 className="text-xl font-semibold text-slate-800">
            {getDateRangeLabel()}
          </h2>

          <Button
            onClick={handleNext}
            variant="ghost"
            size="icon"
            className="rounded-xl hover:bg-slate-100"
          >
            <ChevronRight className="w-5 h-5" />
          </Button>
        </motion.div>

        {/* Calendar View */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-2xl border border-slate-200 shadow-lg overflow-hidden"
        >
          <AnimatePresence mode="wait">
            {viewMode === "month" && (
              <CalendarMonthView
                key="month"
                currentDate={currentDate}
                tasks={calendarItems.tasks}
                notes={calendarItems.notes}
                onDateClick={handleDateClick}
                onTaskDrop={handleTaskDrop}
                onTaskClick={setSelectedTask}
              />
            )}
            {viewMode === "week" && (
              <CalendarWeekView
                key="week"
                currentDate={currentDate}
                tasks={calendarItems.tasks}
                notes={calendarItems.notes}
                onDateClick={handleDateClick}
                onTaskDrop={handleTaskDrop}
                onTaskClick={setSelectedTask}
              />
            )}
            {viewMode === "day" && (
              <CalendarDayView
                key="day"
                currentDate={currentDate}
                tasks={calendarItems.tasks}
                notes={calendarItems.notes}
                onDateClick={handleDateClick}
                onTaskDrop={handleTaskDrop}
                onTaskClick={setSelectedTask}
              />
            )}
          </AnimatePresence>
        </motion.div>

        {/* Quick Add Dialog */}
        <Dialog open={showQuickAdd} onOpenChange={setShowQuickAdd}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                创建约定
                {quickAddDate && (
                  <span className="text-sm font-normal text-slate-500 ml-2">
                    {format(quickAddDate, "yyyy年M月d日", { locale: zhCN })}
                  </span>
                )}
              </DialogTitle>
            </DialogHeader>
            <QuickAddTask
              initialData={{
                reminder_time: quickAddDate || new Date(),
              }}
              onAdd={(taskData) => createTaskMutation.mutate(taskData)}
            />
          </DialogContent>
        </Dialog>

        {/* Task Detail Modal */}
        {selectedTask && (
          <TaskDetailModal
            task={selectedTask}
            open={!!selectedTask}
            onOpenChange={(open) => !open && setSelectedTask(null)}
          />
        )}
      </div>
    </div>
  );
}