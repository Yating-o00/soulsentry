import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth, isSameDay, isToday, format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { StickyNote, Clock, Circle, ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import DayDetailDialog from "./DayDetailDialog";

const PRIORITY_COLORS = {
  urgent: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-blue-500",
  low: "bg-slate-400"
};

export default function CalendarMonthView({ 
  currentDate, 
  tasks, 
  notes, 
  onDateClick, 
  onTaskDrop,
  onTaskClick 
}) {
  const [selectedDate, setSelectedDate] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calendarStart = startOfWeek(monthStart, { locale: zhCN });
  const calendarEnd = endOfWeek(monthEnd, { locale: zhCN });

  // Generate calendar days
  const days = [];
  let day = calendarStart;
  while (day <= calendarEnd) {
    days.push(day);
    day = addDays(day, 1);
  }

  // Group tasks and notes by date
  const getItemsForDate = (date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    
    // Filter to only show parent tasks (tasks without parent_task_id)
    const dayTasks = tasks.filter(task => {
      if (!task.reminder_time || task.parent_task_id) return false;
      const taskDate = format(new Date(task.reminder_time), "yyyy-MM-dd");
      
      // Check if task spans multiple days
      if (task.end_time) {
        const endDate = format(new Date(task.end_time), "yyyy-MM-dd");
        return dateStr >= taskDate && dateStr <= endDate;
      }
      
      return taskDate === dateStr;
    });

    const dayNotes = notes.filter(note => {
      const noteDate = format(new Date(note.created_date), "yyyy-MM-dd");
      return noteDate === dateStr;
    });

    return { tasks: dayTasks, notes: dayNotes };
  };

  const handleDragEnd = (result) => {
    if (!result.destination) return;
    
    const taskId = result.draggableId;
    const destinationDate = new Date(result.destination.droppableId);
    
    onTaskDrop(taskId, destinationDate);
  };

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="px-8 py-6">
        {/* Weekday headers */}
        <div className="grid grid-cols-7 gap-3 mb-6">
          {["日", "一", "二", "三", "四", "五", "六"].map((day, i) => (
            <div
              key={i}
              className="text-center text-xs font-medium tracking-wider text-slate-500 uppercase py-3"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-3">
          {days.map((day) => {
            const { tasks: dayTasks, notes: dayNotes } = getItemsForDate(day);
            const isCurrentMonth = isSameMonth(day, currentDate);
            const isCurrentDay = isToday(day);
            const dateKey = format(day, "yyyy-MM-dd");

            return (
              <Droppable key={dateKey} droppableId={dateKey}>
                {(provided, snapshot) => (
                  <motion.div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className={`
                      min-h-[130px] p-3 rounded-2xl transition-all duration-300 cursor-pointer
                      ${isCurrentMonth ? "bg-white/60 backdrop-blur-sm" : "bg-slate-50/40"}
                      ${isCurrentDay 
                        ? "ring-2 ring-[#384877] shadow-lg shadow-[#384877]/10" 
                        : "border border-slate-200/50 hover:border-slate-300/80 hover:shadow-md"
                      }
                      ${snapshot.isDraggingOver ? "ring-2 ring-blue-400 bg-blue-50/50 scale-[1.02]" : ""}
                    `}
                    onClick={() => onDateClick(day)}
                  >
                    {/* Date header */}
                    <div className="flex items-start justify-between mb-3 pb-2 border-b border-slate-100/50">
                      <div className="flex flex-col gap-0.5">
                        <span
                          className={`
                            text-2xl font-bold tracking-tight transition-all
                            ${isCurrentDay 
                              ? "text-white bg-gradient-to-br from-[#384877] to-[#3b5aa2] w-10 h-10 rounded-2xl flex items-center justify-center shadow-lg shadow-[#384877]/20" 
                              : ""
                            }
                            ${!isCurrentMonth ? "text-slate-300" : isCurrentDay ? "" : "text-slate-800"}
                          `}
                        >
                          {format(day, "d")}
                        </span>
                      </div>
                      
                      {(dayTasks.length > 0 || dayNotes.length > 0) && (
                        <div className="flex flex-col gap-1">
                          {dayTasks.length > 0 && (
                            <div className={`
                              flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold
                              ${isCurrentDay 
                                ? "bg-white/20 backdrop-blur-sm text-white" 
                                : "bg-gradient-to-r from-blue-50 to-blue-100/50 text-blue-700"
                              }
                            `}>
                              <Clock className={`w-3 h-3 ${isCurrentDay ? "text-white" : "text-blue-600"}`} />
                              {dayTasks.length}
                            </div>
                          )}
                          {dayNotes.length > 0 && (
                            <div className={`
                              flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold
                              ${isCurrentDay 
                                ? "bg-white/20 backdrop-blur-sm text-white" 
                                : "bg-gradient-to-r from-purple-50 to-purple-100/50 text-purple-700"
                              }
                            `}>
                              <StickyNote className={`w-3 h-3 ${isCurrentDay ? "text-white" : "text-purple-600"}`} />
                              {dayNotes.length}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Tasks */}
                    <div className="space-y-2">
                      {dayTasks.slice(0, 2).map((task, index) => (
                        <Draggable
                          key={task.id}
                          draggableId={task.id}
                          index={index}
                        >
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              onClick={(e) => {
                                e.stopPropagation();
                                onTaskClick(task);
                              }}
                              className={`
                                group p-2.5 rounded-xl text-xs cursor-pointer
                                transition-all duration-200 flex items-center gap-2.5
                                ${snapshot.isDragging 
                                  ? "shadow-2xl scale-105 z-50 bg-white border-2 border-[#384877] rotate-2" 
                                  : "bg-gradient-to-br from-white to-slate-50/30 border border-slate-200/60 hover:border-[#384877]/40 hover:shadow-md hover:from-white hover:to-white"
                                }
                              `}
                            >
                              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${PRIORITY_COLORS[task.priority]} shadow-sm`} />
                              <div className="flex-1 min-w-0">
                                <div className="font-semibold text-slate-800 truncate leading-tight mb-0.5">
                                  {task.title}
                                </div>
                                {task.reminder_time && (
                                  <div className="flex items-center gap-1 text-[10px] text-slate-500 font-medium">
                                    <Clock className="w-2.5 h-2.5" />
                                    {format(new Date(task.reminder_time), "HH:mm")}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      
                      {(dayTasks.length > 2 || (dayTasks.length === 0 && dayNotes.length > 0)) && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedDate(day);
                            setDialogOpen(true);
                          }}
                          className="w-full flex items-center justify-center gap-1.5 text-[10px] text-slate-600 hover:text-[#384877] font-medium py-2 rounded-lg hover:bg-slate-50/80 transition-all duration-200 border border-dashed border-slate-200 hover:border-[#384877]/30"
                        >
                          <ChevronDown className="w-3 h-3" />
                          <span>
                            {dayTasks.length > 2 && `+${dayTasks.length - 2}`}
                            {dayTasks.length > 2 && dayNotes.length > 0 && " · "}
                            {dayNotes.length > 0 && `${dayNotes.length} 心签`}
                            {dayTasks.length <= 2 && dayNotes.length === 0 && "查看详情"}
                          </span>
                        </button>
                      )}
                    </div>

                    {provided.placeholder}
                  </motion.div>
                )}
              </Droppable>
            );
          })}
        </div>

        <DayDetailDialog 
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          date={selectedDate}
          tasks={selectedDate ? getItemsForDate(selectedDate).tasks : []}
          notes={selectedDate ? getItemsForDate(selectedDate).notes : []}
          onTaskClick={onTaskClick}
        />
      </div>
    </DragDropContext>
  );
}