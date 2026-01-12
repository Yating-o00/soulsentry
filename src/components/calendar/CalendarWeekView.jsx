import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { startOfWeek, endOfWeek, addDays, format, isSameDay, isToday } from "date-fns";
import { zhCN } from "date-fns/locale";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { StickyNote, Clock, ChevronDown, ChevronRight, Plus, GripVertical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const PRIORITY_COLORS = {
  urgent: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-blue-500",
  low: "bg-slate-400"
};

const HOURS = Array.from({ length: 24 }, (_, i) => i);

export default function CalendarWeekView({ 
  currentDate, 
  tasks, 
  notes, 
  onDateClick, 
  onTaskDrop,
  onTaskClick,
  onCreateSubtask
}) {
  const [expandedTasks, setExpandedTasks] = useState(new Set());
  const weekStart = startOfWeek(currentDate, { locale: zhCN });
  const weekEnd = endOfWeek(currentDate, { locale: zhCN });

  const days = [];
  let day = weekStart;
  while (day <= weekEnd) {
    days.push(day);
    day = addDays(day, 1);
  }

  const getItemsForDateTime = (date, hour) => {
    const dateStr = format(date, "yyyy-MM-dd");
    
    // Only return parent tasks
    const parentTasks = tasks.filter(task => {
      if (!task.reminder_time || task.parent_task_id) return false;
      const taskDate = new Date(task.reminder_time);
      const taskDateStr = format(taskDate, "yyyy-MM-dd");
      const taskHour = taskDate.getHours();
      
      return taskDateStr === dateStr && taskHour === hour;
    });

    return parentTasks;
  };

  const getSubtasks = (parentId) => {
    return tasks.filter(task => task.parent_task_id === parentId);
  };

  const toggleTaskExpand = (taskId) => {
    setExpandedTasks(prev => {
      const newSet = new Set(prev);
      if (newSet.has(taskId)) {
        newSet.delete(taskId);
      } else {
        newSet.add(taskId);
      }
      return newSet;
    });
  };

  const getNotesForDate = (date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    return notes.filter(note => {
      const noteDate = format(new Date(note.created_date), "yyyy-MM-dd");
      return noteDate === dateStr;
    });
  };

  const handleDragEnd = (result) => {
    if (!result.destination) return;
    
    const taskId = result.draggableId;
    const [dateStr, hourStr] = result.destination.droppableId.split("_");
    const destinationDate = new Date(dateStr);
    destinationDate.setHours(parseInt(hourStr), 0, 0, 0);
    
    onTaskDrop(taskId, destinationDate);
  };

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="overflow-x-auto px-6 py-4">
        <div className="min-w-[900px]">
          {/* Header with dates */}
          <div className="grid grid-cols-8 border-b border-slate-200/50 sticky top-0 bg-gradient-to-b from-white to-slate-50/30 backdrop-blur-sm z-10 shadow-sm rounded-t-2xl overflow-hidden">
            <div className="p-4 text-xs font-semibold tracking-wider text-slate-500 uppercase border-r border-slate-200/50 bg-slate-50/50">
              时间
            </div>
            {days.map((day) => {
              const isCurrentDay = isToday(day);
              const parentTasks = tasks.filter(t => t.reminder_time && !t.parent_task_id && format(new Date(t.reminder_time), "yyyy-MM-dd") === format(day, "yyyy-MM-dd"));
              const dayNotes = getNotesForDate(day);
              
              return (
                <div
                  key={format(day, "yyyy-MM-dd")}
                  className={`p-4 text-center border-r border-slate-200/50 transition-all ${
                    isCurrentDay 
                      ? "bg-gradient-to-br from-[#384877] to-[#3b5aa2] text-white" 
                      : "hover:bg-slate-50/50"
                  }`}
                >
                  <div className={`text-[10px] font-medium uppercase tracking-wide mb-2 ${
                    isCurrentDay ? "text-white/80" : "text-slate-500"
                  }`}>
                    {format(day, "EEE", { locale: zhCN })}
                  </div>
                  <div
                    className={`text-2xl font-bold mb-3 ${
                      isCurrentDay
                        ? "text-white"
                        : "text-slate-800"
                    }`}
                  >
                    {format(day, "d")}
                  </div>
                  
                  {/* Task & Notes count */}
                  <div className="flex items-center justify-center gap-1.5">
                    {parentTasks.length > 0 && (
                      <div className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold ${
                        isCurrentDay 
                          ? "bg-white/20 backdrop-blur-sm text-white" 
                          : "bg-gradient-to-r from-blue-50 to-blue-100/50 text-blue-700"
                      }`}>
                        <Clock className={`w-3 h-3 ${isCurrentDay ? "text-white" : "text-blue-600"}`} />
                        {parentTasks.length}
                      </div>
                    )}
                    {dayNotes.length > 0 && (
                      <div className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold ${
                        isCurrentDay 
                          ? "bg-white/20 backdrop-blur-sm text-white" 
                          : "bg-gradient-to-r from-purple-50 to-purple-100/50 text-purple-700"
                      }`}>
                        <StickyNote className={`w-3 h-3 ${isCurrentDay ? "text-white" : "text-purple-600"}`} />
                        {dayNotes.length}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Time grid */}
          <div className="max-h-[600px] overflow-y-auto bg-white/40 backdrop-blur-sm rounded-b-2xl border border-slate-200/50 border-t-0">
            {HOURS.map((hour) => (
              <div key={hour} className="grid grid-cols-8 border-b border-slate-100/50 last:border-b-0">
                <div className="p-3 text-xs font-semibold text-slate-600 border-r border-slate-200/50 bg-gradient-to-r from-slate-50/80 to-transparent">
                  {hour.toString().padStart(2, '0')}:00
                </div>
                {days.map((day) => {
                  const dateKey = format(day, "yyyy-MM-dd");
                  const dropId = `${dateKey}_${hour}`;
                  const hourTasks = getItemsForDateTime(day, hour);

                  return (
                    <Droppable key={dropId} droppableId={dropId} type="TASK">
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className={`
                            p-2 min-h-[90px] border-r border-slate-200/50 cursor-pointer group relative
                            transition-all duration-200
                            ${snapshot.isDraggingOver 
                              ? "bg-blue-50/50 ring-2 ring-[#384877]/30 scale-[1.01]" 
                              : "hover:bg-slate-50/50"
                            }
                          `}
                          onDoubleClick={() => {
                            const clickDate = new Date(day);
                            clickDate.setHours(hour, 0, 0, 0);
                            onDateClick(clickDate);
                          }}
                        >
                          {hourTasks.length === 0 && (
                            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-all duration-200 flex items-center justify-center">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const clickDate = new Date(day);
                                  clickDate.setHours(hour, 0, 0, 0);
                                  onDateClick(clickDate);
                                }}
                                className="text-xs text-slate-500 hover:text-[#384877] bg-white/80 hover:bg-white px-3 py-2 rounded-xl border border-slate-200/60 hover:border-[#384877]/40 flex items-center gap-1.5 transition-all shadow-sm hover:shadow-md backdrop-blur-sm"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span className="font-medium">添加</span>
                              </button>
                            </div>
                          )}
                          <div className="space-y-1">
                            {hourTasks.map((task, index) => {
                              const subtasks = getSubtasks(task.id);
                              const isExpanded = expandedTasks.has(task.id);
                              
                              return (
                                <div key={task.id} className="space-y-1">
                                  <Draggable
                                    draggableId={task.id}
                                    index={index}
                                  >
                                    {(provided, snapshot) => (
                                      <div
                                       ref={provided.innerRef}
                                       {...provided.draggableProps}
                                       className={`
                                         p-2.5 rounded-xl text-xs border group/card
                                         transition-all duration-200
                                         ${snapshot.isDragging 
                                           ? "shadow-2xl scale-105 z-[100] bg-white border-2 border-[#384877] rotate-2" 
                                           : "bg-gradient-to-br from-white to-slate-50/30 border-slate-200/60 hover:border-[#384877]/40 hover:shadow-md hover:from-white hover:to-white"
                                         }
                                       `}
                                      >
                                      <div className="flex items-start gap-2">
                                        <div 
                                          {...provided.dragHandleProps}
                                          className="flex-shrink-0 cursor-grab active:cursor-grabbing text-slate-400 hover:text-[#384877] mt-0.5 transition-colors"
                                        >
                                          <GripVertical className="w-3.5 h-3.5" />
                                        </div>
                                        {subtasks.length > 0 && (
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              toggleTaskExpand(task.id);
                                            }}
                                            className="flex-shrink-0 mt-0.5 hover:bg-slate-100 rounded p-0.5 transition-colors"
                                          >
                                            {isExpanded ? (
                                              <ChevronDown className="w-3.5 h-3.5 text-slate-600" />
                                            ) : (
                                              <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
                                            )}
                                          </button>
                                        )}
                                        <div className={`w-2 h-2 rounded-full mt-1 flex-shrink-0 shadow-sm ${PRIORITY_COLORS[task.priority]}`} />
                                         <div 
                                           className="flex-1 min-w-0 cursor-pointer"
                                           onClick={(e) => {
                                             e.stopPropagation();
                                             onTaskClick(task);
                                           }}
                                         >
                                           <div className="flex items-center gap-1.5 mb-0.5">
                                             <div className="font-semibold text-slate-800 truncate leading-tight">
                                               {task.title}
                                             </div>
                                             {subtasks.length > 0 && (
                                               <Badge variant="secondary" className="text-[9px] h-4 px-1.5 bg-blue-50 text-blue-700 font-semibold">
                                                 {subtasks.length}
                                               </Badge>
                                             )}
                                           </div>
                                           <div className="flex items-center gap-1 text-[10px] text-slate-500 font-medium">
                                             <Clock className="w-2.5 h-2.5" />
                                             {format(new Date(task.reminder_time), "HH:mm")}
                                             {task.end_time && (
                                               <>
                                                 <span>-</span>
                                                 {format(new Date(task.end_time), "HH:mm")}
                                               </>
                                             )}
                                           </div>
                                         </div>
                                       </div>
                                      </div>
                                    )}
                                  </Draggable>
                                  
                                  {/* Subtasks */}
                                  <AnimatePresence>
                                    {isExpanded && subtasks.length > 0 && (
                                      <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: "auto" }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className="ml-5 space-y-1"
                                      >
                                        {subtasks.map((subtask) => (
                                          <div
                                            key={subtask.id}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              onTaskClick(subtask);
                                            }}
                                            className="p-2 rounded-lg text-xs cursor-pointer border bg-blue-50/50 border-blue-100 hover:border-blue-300 hover:bg-blue-50 transition-all"
                                          >
                                            <div className="flex items-start gap-2">
                                              <div className={`w-1.5 h-1.5 rounded-full mt-1 flex-shrink-0 ${PRIORITY_COLORS[subtask.priority]}`} />
                                              <div className="flex-1 min-w-0">
                                                <div className="font-semibold text-slate-700 truncate leading-tight mb-0.5">
                                                  {subtask.title}
                                                </div>
                                                {subtask.reminder_time && (
                                                  <div className="flex items-center gap-1 text-[9px] text-slate-500 font-medium">
                                                    <Clock className="w-2.5 h-2.5" />
                                                    {format(new Date(subtask.reminder_time), "HH:mm")}
                                                    {subtask.end_time && (
                                                      <>
                                                        <span>-</span>
                                                        {format(new Date(subtask.end_time), "HH:mm")}
                                                      </>
                                                    )}
                                                  </div>
                                                )}
                                              </div>
                                            </div>
                                          </div>
                                        ))}
                                        {onCreateSubtask && (
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              onCreateSubtask(task);
                                            }}
                                            className="w-full p-1.5 rounded-md text-[10px] cursor-pointer border border-dashed border-blue-200 hover:border-blue-400 hover:bg-blue-50 text-blue-600 flex items-center justify-center gap-1"
                                          >
                                            <Plus className="w-3 h-3" />
                                            添加子约定
                                          </button>
                                        )}
                                      </motion.div>
                                    )}
                                  </AnimatePresence>
                                </div>
                              );
                            })}
                          </div>
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </DragDropContext>
  );
}