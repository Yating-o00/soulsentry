import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth, isSameDay, isToday, format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { StickyNote, Clock, Circle, ChevronDown, ChevronUp } from "lucide-react";
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
  const [expandedDate, setExpandedDate] = useState(null);
  
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
            const isExpanded = expandedDate === dateKey;

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
                      ${isExpanded ? "row-span-2" : ""}
                    `}
                    onClick={() => onDateClick(day)}
                  >
                    {/* Date header */}
                    <div className="flex items-center justify-between mb-2 pb-1 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <span
                          className={`
                            text-sm font-bold
                            ${isCurrentDay ? "text-white bg-blue-500 w-6 h-6 rounded-full flex items-center justify-center" : ""}
                            ${!isCurrentMonth ? "text-slate-400" : "text-slate-800"}
                          `}
                        >
                          {format(day, "d")}
                        </span>
                        <span className={`text-[10px] font-medium ${!isCurrentMonth ? "text-slate-300" : "text-slate-400"}`}>
                          {format(day, "EEE", { locale: zhCN })}
                        </span>
                      </div>
                      
                      {(dayTasks.length > 0 || dayNotes.length > 0) && (
                        <div className="flex items-center gap-1">
                          {dayTasks.length > 0 && (
                            <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-blue-50 border border-blue-100">
                              <Clock className="w-2.5 h-2.5 text-blue-600" />
                              <span className="text-[10px] font-semibold text-blue-700">{dayTasks.length}</span>
                            </div>
                          )}
                          {dayNotes.length > 0 && (
                            <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-purple-50 border border-purple-100">
                              <StickyNote className="w-2.5 h-2.5 text-purple-600" />
                              <span className="text-[10px] font-semibold text-purple-700">{dayNotes.length}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Tasks */}
                    <div className="space-y-1">
                      {(isExpanded ? dayTasks : dayTasks.slice(0, 3)).map((task, index) => (
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
                                group p-1.5 rounded-md text-xs cursor-pointer
                                transition-all flex items-start gap-1.5 border
                                ${snapshot.isDragging ? "shadow-lg scale-105 z-50 bg-white border-blue-300" : "bg-white border-slate-200 hover:border-blue-300 hover:shadow-sm"}
                              `}
                            >
                              <div className={`w-1 h-1 rounded-full flex-shrink-0 mt-1 ${PRIORITY_COLORS[task.priority]}`} />
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-slate-800 truncate leading-tight">
                                  {task.title}
                                </div>
                                {task.reminder_time && (
                                  <div className="flex items-center gap-1 mt-0.5 text-[10px] text-slate-500">
                                    <Clock className="w-2.5 h-2.5" />
                                    {format(new Date(task.reminder_time), "HH:mm")}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      
                      {dayTasks.length > 3 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedDate(isExpanded ? null : dateKey);
                          }}
                          className="w-full flex items-center justify-center gap-1 text-[10px] text-blue-600 hover:text-blue-700 font-medium py-1 rounded hover:bg-blue-50 transition-colors"
                        >
                          {isExpanded ? (
                            <>
                              <ChevronUp className="w-3 h-3" />
                              收起
                            </>
                          ) : (
                            <>
                              <ChevronDown className="w-3 h-3" />
                              +{dayTasks.length - 3} 更多
                            </>
                          )}
                        </button>
                      )}

                      {/* Notes indicator */}
                      {isExpanded && dayNotes.length > 0 && (
                        <AnimatePresence>
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="space-y-1 pt-2 border-t border-slate-100"
                          >
                            <div className="flex items-center gap-1 text-[10px] font-semibold text-purple-700 mb-1">
                              <StickyNote className="w-3 h-3" />
                              心签 ({dayNotes.length})
                            </div>
                            {dayNotes.slice(0, 2).map(note => (
                              <div 
                                key={note.id}
                                className="p-1.5 rounded text-[10px] bg-purple-50 border border-purple-100 text-purple-700 line-clamp-1"
                                dangerouslySetInnerHTML={{ __html: note.plain_text || note.content }}
                              />
                            ))}
                            {dayNotes.length > 2 && (
                              <div className="text-[10px] text-purple-600 text-center">
                                +{dayNotes.length - 2} 个心签
                              </div>
                            )}
                          </motion.div>
                        </AnimatePresence>
                      )}

                      {!isExpanded && dayNotes.length > 0 && (
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