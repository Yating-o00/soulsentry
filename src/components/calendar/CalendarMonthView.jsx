import React from "react";
import { motion } from "framer-motion";
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth, isSameDay, isToday, format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { StickyNote, Clock, Circle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

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
    
    const dayTasks = tasks.filter(task => {
      if (!task.reminder_time) return false;
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
      <div className="p-6">
        {/* Weekday headers */}
        <div className="grid grid-cols-7 gap-2 mb-4">
          {["日", "一", "二", "三", "四", "五", "六"].map((day, i) => (
            <div
              key={i}
              className="text-center text-sm font-semibold text-slate-600 py-2"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-2">
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
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className={`
                      min-h-[120px] p-2 rounded-xl border-2 transition-all cursor-pointer
                      ${isCurrentMonth ? "bg-white" : "bg-slate-50"}
                      ${isCurrentDay ? "border-blue-500 ring-2 ring-blue-500/20" : "border-slate-200"}
                      ${snapshot.isDraggingOver ? "border-blue-400 bg-blue-50" : "hover:border-slate-300"}
                    `}
                    onClick={() => onDateClick(day)}
                  >
                    {/* Date number */}
                    <div className="flex items-center justify-between mb-2">
                      <span
                        className={`
                          text-sm font-semibold
                          ${isCurrentDay ? "text-white bg-blue-500 w-6 h-6 rounded-full flex items-center justify-center" : ""}
                          ${!isCurrentMonth ? "text-slate-400" : "text-slate-700"}
                        `}
                      >
                        {format(day, "d")}
                      </span>
                      
                      {(dayTasks.length > 0 || dayNotes.length > 0) && (
                        <div className="flex items-center gap-1">
                          {dayTasks.length > 0 && (
                            <Badge variant="secondary" className="h-5 text-[10px] px-1.5 bg-blue-100 text-blue-700">
                              {dayTasks.length}
                            </Badge>
                          )}
                          {dayNotes.length > 0 && (
                            <Badge variant="secondary" className="h-5 text-[10px] px-1.5 bg-purple-100 text-purple-700">
                              {dayNotes.length}
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Tasks */}
                    <div className="space-y-1">
                      {dayTasks.slice(0, 3).map((task, index) => (
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
                                group p-1.5 rounded-lg text-xs cursor-pointer
                                transition-all flex items-center gap-1
                                ${snapshot.isDragging ? "shadow-lg scale-105 z-50 bg-white border border-blue-300" : "bg-slate-50 hover:bg-slate-100"}
                              `}
                            >
                              <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${PRIORITY_COLORS[task.priority]}`} />
                              <span className="truncate flex-1 font-medium text-slate-700">
                                {task.title}
                              </span>
                              {task.reminder_time && (
                                <Clock className="w-3 h-3 text-slate-400 flex-shrink-0" />
                              )}
                            </div>
                          )}
                        </Draggable>
                      ))}
                      
                      {dayTasks.length > 3 && (
                        <div className="text-[10px] text-slate-500 text-center py-1">
                          +{dayTasks.length - 3} 更多
                        </div>
                      )}

                      {/* Notes indicator */}
                      {dayNotes.length > 0 && (
                        <div className="flex items-center gap-1 p-1 rounded text-[10px] text-purple-600 bg-purple-50">
                          <StickyNote className="w-3 h-3" />
                          <span>{dayNotes.length} 心签</span>
                        </div>
                      )}
                    </div>

                    {provided.placeholder}
                  </motion.div>
                )}
              </Droppable>
            );
          })}
        </div>
      </div>
    </DragDropContext>
  );
}