import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Calendar as BigCalendar } from "@/components/ui/calendar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTaskOperations } from "../hooks/useTaskOperations";
import { 
  format, 
  isSameDay, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval,
  addWeeks,
  subWeeks,
  isSameMonth,
  startOfDay,
  endOfDay,
  isWithinInterval
} from "date-fns";
import { zhCN } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
import { Clock, CheckCircle2, ChevronLeft, ChevronRight, Plus, Calendar as CalendarIcon, StickyNote, Filter, Tag } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import TaskCard from "../tasks/TaskCard";
import NoteCard from "../notes/NoteCard";
import TaskDetailModal from "../tasks/TaskDetailModal";
import QuickAddTask from "../tasks/QuickAddTask";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

export default function CalendarView() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedTask, setSelectedTask] = useState(null);
  const [viewMode, setViewMode] = useState("month"); // "month" or "week"
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickAddDate, setQuickAddDate] = useState(null);
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  
  const queryClient = useQueryClient();

  const { data: allTasks = [] } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => base44.entities.Task.list('-reminder_time'),
    initialData: [],
  });

  const { data: allNotes = [] } = useQuery({
    queryKey: ['notes'],
    queryFn: () => base44.entities.Note.list('-created_date'),
    initialData: [],
  });

  const tasks = useMemo(() => {
    return allTasks.filter(task => {
      if (task.parent_task_id || task.deleted_at) return false;
      if (filterCategory !== "all" && task.category !== filterCategory) return false;
      if (filterStatus !== "all") {
         if (filterStatus === "completed" && task.status !== "completed") return false;
         if (filterStatus === "pending" && task.status !== "pending") return false;
      }
      return true;
    });
  }, [allTasks, filterCategory, filterStatus]);

  const notes = useMemo(() => allNotes.filter(note => !note.deleted_at), [allNotes]);

  const { 
    updateTask, 
    createTask, 
    deleteTask, 
    handleComplete, 
    handleSubtaskToggle 
  } = useTaskOperations();

  const handleCreateTask = (data) => {
      createTask(data, {
          onSuccess: () => setShowQuickAdd(false)
      });
  };

  const updateNoteMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Note.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] });
    },
  });

  const deleteNoteMutation = useMutation({
    mutationFn: (id) => base44.entities.Note.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] });
      toast.success("心签已删除");
    },
  });

  // Merge Tasks and Notes into events
  const eventsByDate = useMemo(() => {
    const map = {};
    
    tasks.forEach(task => {
      if (!task.reminder_time) return;
      
      const startDate = new Date(task.reminder_time);
      const endDate = task.end_time ? new Date(task.end_time) : startDate;
      
      // Handle potential invalid dates or end before start
      const validEndDate = (isValidDate(endDate) && endDate >= startDate) ? endDate : startDate;
      
      try {
        // Get all days in the range
        const days = eachDayOfInterval({ start: startDate, end: validEndDate });
        
        days.forEach(day => {
          const dateKey = format(day, 'yyyy-MM-dd');
          if (!map[dateKey]) map[dateKey] = [];
          // Use original start date for sorting consistency across days
          map[dateKey].push({ type: 'task', data: task, date: startDate });
        });
      } catch (err) {
        // Fallback if interval calculation fails
        const dateKey = format(startDate, 'yyyy-MM-dd');
        if (!map[dateKey]) map[dateKey] = [];
        map[dateKey].push({ type: 'task', data: task, date: startDate });
      }
    });

    function isValidDate(d) {
      return d instanceof Date && !isNaN(d);
    }

    notes.forEach(note => {
      const dateKey = format(new Date(note.created_date), 'yyyy-MM-dd');
      if (!map[dateKey]) map[dateKey] = [];
      map[dateKey].push({ type: 'note', data: note, date: new Date(note.created_date) });
    });

    // Sort events by time/date within each day
    Object.keys(map).forEach(key => {
      map[key].sort((a, b) => a.date - b.date);
    });

    return map;
  }, [tasks, notes]);

  const eventsOnSelectedDate = useMemo(() => eventsByDate[format(selectedDate, 'yyyy-MM-dd')] || [], [eventsByDate, selectedDate]);
  const tasksOnSelectedDate = useMemo(() => eventsOnSelectedDate.filter(e => e.type === 'task').map(e => e.data), [eventsOnSelectedDate]);
  const notesOnSelectedDate = useMemo(() => eventsOnSelectedDate.filter(e => e.type === 'note').map(e => e.data), [eventsOnSelectedDate]);

  const onCompleteTask = (task) => handleComplete(task, allTasks);
  const onSubtaskToggleWrapper = (subtask) => handleSubtaskToggle(subtask, allTasks);

  const getSubtasks = (taskId) => allTasks.filter(t => t.parent_task_id === taskId);

  const handleDateClick = (date) => {
    setSelectedDate(date);
    setQuickAddDate(date);
    setShowQuickAdd(true);
  };

  const handleNavigate = (direction) => {
    if (viewMode === "week") {
      setCurrentDate(prev => direction === "next" ? addWeeks(prev, 1) : subWeeks(prev, 1));
    } else {
      setCurrentDate(prev => {
        const newDate = new Date(prev);
        newDate.setMonth(prev.getMonth() + (direction === "next" ? 1 : -1));
        return newDate;
      });
    }
  };

  const handleToday = () => {
    const today = new Date();
    setCurrentDate(today);
    setSelectedDate(today);
  };

  // 周视图日期范围
  const weekDays = viewMode === "week" 
    ? eachDayOfInterval({
        start: startOfWeek(currentDate, { locale: zhCN }),
        end: endOfWeek(currentDate, { locale: zhCN })
      })
    : [];

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row md:items-center justify-between gap-4"
      >
        <div className="flex flex-wrap items-center gap-3 ml-auto">
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-[100px] h-9 bg-white shadow-sm border-slate-200 rounded-[10px]">
              <div className="flex items-center gap-2">
                <Tag className="w-3.5 h-3.5 text-slate-500" />
                <SelectValue placeholder="分类" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部分类</SelectItem>
              <SelectItem value="work">工作</SelectItem>
              <SelectItem value="personal">个人</SelectItem>
              <SelectItem value="health">健康</SelectItem>
              <SelectItem value="study">学习</SelectItem>
              <SelectItem value="family">家庭</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[100px] h-9 bg-white shadow-sm border-slate-200 rounded-[10px]">
              <div className="flex items-center gap-2">
                <Filter className="w-3.5 h-3.5 text-slate-500" />
                <SelectValue placeholder="状态" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="pending">进行中</SelectItem>
              <SelectItem value="completed">已完成</SelectItem>
            </SelectContent>
          </Select>

          <Tabs value={viewMode} onValueChange={setViewMode}>
              <TabsList className="bg-white shadow-md rounded-[12px] h-9 p-1">
                <TabsTrigger value="month" className="rounded-[8px] text-xs px-3 py-1 data-[state=active]:bg-[#5a647d] data-[state=active]:text-white">月</TabsTrigger>
                <TabsTrigger value="week" className="rounded-[8px] text-xs px-3 py-1 data-[state=active]:bg-[#5a647d] data-[state=active]:text-white">周</TabsTrigger>
              </TabsList>
            </Tabs>
          <Button onClick={handleToday} variant="outline" size="sm" className="shadow-sm h-9">
            今天
          </Button>
        </div>
      </motion.div>

      {/* 导航栏 */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex items-center justify-between bg-white rounded-xl shadow-lg p-4"
      >
        <Button
          variant="ghost"
          size="icon"
          onClick={() => handleNavigate("prev")}
          className="hover:bg-blue-50"
        >
          <ChevronLeft className="w-5 h-5" />
        </Button>

        <h2 className="text-xl font-bold text-slate-800">
          {viewMode === "week" 
            ? `${format(startOfWeek(currentDate, { locale: zhCN }), "M月d日", { locale: zhCN })} - ${format(endOfWeek(currentDate, { locale: zhCN }), "M月d日", { locale: zhCN })}`
            : format(currentDate, "yyyy年 M月", { locale: zhCN })
          }
        </h2>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => handleNavigate("next")}
          className="hover:bg-blue-50"
        >
          <ChevronRight className="w-5 h-5" />
        </Button>
      </motion.div>

      <div className="grid lg:grid-cols-3 gap-6">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
          className="lg:col-span-2"
        >
          {viewMode === "month" ? (
            <Card className="p-6 border-0 shadow-xl bg-white">
              <BigCalendar
                mode="single"
                selected={selectedDate}
                onSelect={setSelectedDate}
                month={currentDate}
                onMonthChange={setCurrentDate}
                locale={zhCN}
                className="rounded-xl"
                modifiers={{
                  hasEvent: (date) => {
                    const dateKey = format(date, 'yyyy-MM-dd');
                    return eventsByDate[dateKey] && eventsByDate[dateKey].length > 0;
                  }
                }}
                modifiersStyles={{
                  hasEvent: {
                    fontWeight: 'bold',
                    position: 'relative',
                  }
                }}
                components={{
                  DayContent: ({ date }) => {
                    const dateKey = format(date, 'yyyy-MM-dd');
                    const dayEvents = eventsByDate[dateKey] || [];
                    const hasEvents = dayEvents.length > 0;
                    const isSelected = isSameDay(date, selectedDate);
                    
                    return (
                      <button
                        onClick={() => handleDateClick(date)}
                        className={`relative w-full h-full flex flex-col items-center justify-center p-2 rounded-lg transition-all hover:bg-blue-50 ${
                          isSelected ? 'bg-blue-100 ring-2 ring-blue-500' : ''
                        }`}
                      >
                        <span className={!isSameMonth(date, currentDate) ? 'text-slate-300' : ''}>
                          {format(date, 'd')}
                        </span>
                        {hasEvents && (
                          <div className="absolute bottom-1 flex gap-0.5">
                            {dayEvents.slice(0, 3).map((event, idx) => (
                              <div 
                                key={idx}
                                className={`w-1.5 h-1.5 rounded-full ${
                                  event.type === 'task' 
                                    ? (event.data.status === 'completed' ? 'bg-green-500' : 'bg-purple-500')
                                    : 'bg-yellow-400'
                                }`}
                              />
                            ))}
                            {dayEvents.length > 3 && (
                              <div className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                            )}
                          </div>
                        )}
                      </button>
                    );
                  }
                }}
              />
            </Card>
          ) : (
            <Card className="border-0 shadow-xl bg-white overflow-hidden">
              <div className="grid grid-cols-7">
                {["日", "一", "二", "三", "四", "五", "六"].map((day, idx) => (
                  <div
                    key={idx}
                    className="p-3 text-center font-semibold text-slate-600 bg-slate-50 border-b"
                  >
                    {day}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 divide-x">
                {weekDays.map((day) => {
                  const dateKey = format(day, 'yyyy-MM-dd');
                  const dayEvents = eventsByDate[dateKey] || [];
                  const isSelected = isSameDay(day, selectedDate);
                  const isToday = isSameDay(day, new Date());

                  return (
                    <button
                      key={dateKey}
                      onClick={() => handleDateClick(day)}
                      className={`min-h-[120px] p-2 hover:bg-blue-50 transition-all ${
                        isSelected ? 'bg-blue-100' : ''
                      }`}
                    >
                      <div className={`text-sm font-semibold mb-2 ${
                        isToday ? 'text-blue-600' : 'text-slate-700'
                      }`}>
                        {format(day, 'd')}
                        {isToday && (
                          <span className="ml-1 text-xs bg-blue-500 text-white px-1.5 py-0.5 rounded">
                            今
                          </span>
                        )}
                      </div>
                      <div className="space-y-1">
                        {dayEvents.slice(0, 3).map((event, idx) => {
                          if (event.type === 'task') {
                            const task = event.data;
                            return (
                              <div
                                key={`task-${task.id}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedTask(task);
                                }}
                                className={`text-xs p-1.5 rounded truncate text-left ${
                                  task.status === 'completed'
                                    ? 'bg-green-100 text-green-700 line-through'
                                    : task.priority === 'urgent'
                                    ? 'bg-red-100 text-red-700'
                                    : task.priority === 'high'
                                    ? 'bg-orange-100 text-orange-700'
                                    : 'bg-purple-100 text-purple-700'
                                }`}
                              >
                                {task.title}
                              </div>
                            );
                          } else {
                            const note = event.data;
                            return (
                              <div
                                key={`note-${note.id}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  // Note details handled elsewhere or add note detail modal support
                                }}
                                className="text-xs p-1.5 rounded truncate text-left bg-yellow-50 text-yellow-700 border border-yellow-100"
                              >
                                <StickyNote className="w-3 h-3 inline mr-1" />
                                {note.ai_analysis?.summary || "心签"}
                              </div>
                            );
                          }
                        })}
                        {dayEvents.length > 3 && (
                          <div className="text-xs text-slate-500 text-center">
                            +{dayEvents.length - 3} 更多
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </Card>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          className="space-y-4"
        >
          <Card className="p-6 border-0 shadow-xl bg-gradient-to-br from-[#5a647d] to-[#1e3a5f] text-white">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold">
                {format(selectedDate, "M月d日 EEEE", { locale: zhCN })}
              </h3>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => handleDateClick(selectedDate)}
                className="text-white hover:bg-white/20"
              >
                <Plus className="w-5 h-5" />
              </Button>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5" />
                <span className="text-2xl font-bold">
                  {tasksOnSelectedDate.filter(t => t.status === "pending").length}
                </span>
                <span className="text-sm opacity-90">待办</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5" />
                <span className="text-2xl font-bold">
                  {tasksOnSelectedDate.filter(t => t.status === "completed").length}
                </span>
                <span className="text-sm opacity-90">完成</span>
              </div>
              <div className="flex items-center gap-2">
                <StickyNote className="w-5 h-5" />
                <span className="text-2xl font-bold">
                  {notesOnSelectedDate.length}
                </span>
                <span className="text-sm opacity-90">心签</span>
              </div>
            </div>
          </Card>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-800">当日日程</h3>
              <Badge variant="outline" className="bg-purple-50 text-purple-700">
                {eventsOnSelectedDate.length} 个事项
              </Badge>
            </div>
            <div className="max-h-[600px] overflow-y-auto space-y-3">
              <AnimatePresence mode="popLayout">
                {eventsOnSelectedDate.length > 0 ? (
                  eventsOnSelectedDate.map((event, idx) => {
                    if (event.type === 'task') {
                      const task = event.data;
                      return (
                        <TaskCard
                          key={`task-${task.id}`}
                          task={task}
                          subtasks={getSubtasks(task.id)}
                          onComplete={() => onCompleteTask(task)}
                          onDelete={() => deleteTask(task.id)}
                          onEdit={() => setSelectedTask(task)}
                          onClick={() => setSelectedTask(task)}
                          onSubtaskToggle={onSubtaskToggleWrapper}
                        />
                      );
                    } else {
                      const note = event.data;
                      return (
                        <NoteCard
                          key={`note-${note.id}`}
                          note={note}
                          onDelete={(n) => deleteNoteMutation.mutate(n.id)}
                          onEdit={() => {}} // Simple view for now
                          onPin={(n) => updateNoteMutation.mutate({ id: n.id, data: { is_pinned: !n.is_pinned } })}
                        />
                      );
                    }
                  })
                ) : (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <Card className="p-8 border-0 shadow-lg bg-white text-center">
                      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center">
                        <CalendarIcon className="w-8 h-8 text-slate-400" />
                      </div>
                      <p className="text-slate-600 mb-3">这一天还没有安排</p>
                      <Button
                        onClick={() => handleDateClick(selectedDate)}
                        variant="outline"
                        size="sm"
                        className="border-purple-300 text-purple-600 hover:bg-purple-50"
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        添加约定
                      </Button>
                    </Card>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>
      </div>

      {/* 快速添加约定对话框 */}
      <Dialog open={showQuickAdd} onOpenChange={setShowQuickAdd}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarIcon className="w-5 h-5 text-blue-600" />
              为 {quickAddDate && format(quickAddDate, "M月d日", { locale: zhCN })} 添加约定
            </DialogTitle>
          </DialogHeader>
          <QuickAddTask
            initialData={quickAddDate ? { reminder_time: quickAddDate } : null}
            onAdd={(taskData) => {
              let finalReminderTime = taskData.reminder_time;
              
              if (quickAddDate && taskData.reminder_time) {
                 const selected = new Date(quickAddDate);
                 const setTime = new Date(taskData.reminder_time);
                 selected.setHours(setTime.getHours(), setTime.getMinutes());
                 finalReminderTime = selected.toISOString();
              }

              handleCreateTask({
                ...taskData,
                reminder_time: finalReminderTime
              });
            }}
          />
        </DialogContent>
      </Dialog>

      <TaskDetailModal
        task={selectedTask}
        open={!!selectedTask}
        onClose={() => setSelectedTask(null)}
      />
    </div>
  );
}