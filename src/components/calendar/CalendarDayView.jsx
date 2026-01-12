import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { format, isToday } from "date-fns";
import { zhCN } from "date-fns/locale";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { StickyNote, Clock, Plus, ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const PRIORITY_COLORS = {
  urgent: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-blue-500",
  low: "bg-slate-400"
};

const HOURS = Array.from({ length: 24 }, (_, i) => i);

export default function CalendarDayView({ 
  currentDate, 
  tasks, 
  notes, 
  onDateClick, 
  onTaskDrop,
  onTaskClick,
  onCreateSubtask
}) {
  const [expandedTasks, setExpandedTasks] = useState(new Set());

  const getItemsForHour = (hour) => {
    const dateStr = format(currentDate, "yyyy-MM-dd");
    
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

  const getDayNotes = () => {
    const dateStr = format(currentDate, "yyyy-MM-dd");
    return notes.filter(note => {
      const noteDate = format(new Date(note.created_date), "yyyy-MM-dd");
      return noteDate === dateStr;
    });
  };

  const handleDragEnd = (result) => {
    if (!result.destination) return;
    
    const taskId = result.draggableId;
    const hourStr = result.destination.droppableId.replace("hour_", "");
    const destinationDate = new Date(currentDate);
    destinationDate.setHours(parseInt(hourStr), 0, 0, 0);
    
    onTaskDrop(taskId, destinationDate);
  };

  const dayNotes = getDayNotes();
  const isCurrentDay = isToday(currentDate);

  return (
    <div className="p-6">
      {/* Day header */}
      <div className="mb-6 pb-6 border-b border-slate-200/50">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold text-slate-800 mb-1">
              {format(currentDate, "M月d日", { locale: zhCN })}
            </h2>
            <div className="flex items-center gap-2">
              <p className="text-sm text-slate-500 font-medium">
                {format(currentDate, "EEEE", { locale: zhCN })}
              </p>
              {isCurrentDay && (
                <Badge className="bg-gradient-to-r from-[#384877] to-[#3b5aa2] text-white px-3 py-1 shadow-sm">
                  今天
                </Badge>
              )}
            </div>
          </div>

          {dayNotes.length > 0 && (
            <div className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-purple-50 to-purple-100/50 rounded-xl border border-purple-200/50">
              <StickyNote className="w-4 h-4 text-purple-600" />
              <span className="text-sm font-semibold text-purple-700">
                {dayNotes.length} 个心签
              </span>
            </div>
          )}
        </div>

        {/* Notes preview */}
        {dayNotes.length > 0 && (
          <div className="mt-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {dayNotes.slice(0, 3).map(note => (
              <div key={note.id} className="p-4 rounded-2xl bg-gradient-to-br from-purple-50 to-purple-100/30 border border-purple-200/50 hover:shadow-md transition-all">
                <div 
                  className="text-xs text-slate-700 line-clamp-2 mb-2 leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: note.content }}
                />
                {note.tags && note.tags.length > 0 && (
                  <div className="flex gap-1.5 flex-wrap">
                    {note.tags.slice(0, 2).map(tag => (
                      <Badge key={tag} variant="secondary" className="text-[10px] h-5 px-2 bg-purple-100/80 text-purple-700 font-medium">
                        #{tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Timeline */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="space-y-3 max-h-[600px] overflow-y-auto bg-white/40 backdrop-blur-sm rounded-2xl border border-slate-200/50 p-4">
          {HOURS.map((hour) => {
            const hourTasks = getItemsForHour(hour);
            const dropId = `hour_${hour}`;

            return (
              <div key={hour} className="flex gap-5">
                {/* Time label */}
                <div className="w-24 flex-shrink-0 text-right pt-1">
                  <span className="text-sm font-semibold text-slate-700 bg-gradient-to-r from-slate-50/80 to-transparent px-3 py-1.5 rounded-lg">
                    {hour.toString().padStart(2, '0')}:00
                  </span>
                </div>

                {/* Tasks container */}
                <Droppable droppableId={dropId}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`
                        flex-1 min-h-[90px] p-4 rounded-2xl border transition-all duration-200 cursor-pointer
                        ${snapshot.isDraggingOver 
                          ? "border-[#384877]/40 bg-blue-50/50 ring-2 ring-[#384877]/30 scale-[1.01]" 
                          : "border-slate-200/60 border-dashed hover:border-slate-300 hover:bg-slate-50/50"
                        }
                      `}
                      onClick={() => {
                        const clickDate = new Date(currentDate);
                        clickDate.setHours(hour, 0, 0, 0);
                        onDateClick(clickDate);
                      }}
                    >
                      {hourTasks.length === 0 ? (
                        <div className="flex items-center justify-center h-full text-sm text-slate-500 font-medium">
                          <Plus className="w-4 h-4 mr-2" />
                          点击添加约定
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {hourTasks.map((task, index) => {
                            const subtasks = getSubtasks(task.id);
                            const isExpanded = expandedTasks.has(task.id);
                            
                            return (
                              <div key={task.id} className="space-y-2">
                                <Draggable
                                  draggableId={task.id}
                                  index={index}
                                >
                                  {(provided, snapshot) => (
                                    <motion.div
                                      ref={provided.innerRef}
                                      {...provided.draggableProps}
                                      {...provided.dragHandleProps}
                                      initial={{ opacity: 0, x: -10 }}
                                      animate={{ opacity: 1, x: 0 }}
                                      className={`
                                        p-4 rounded-xl cursor-pointer
                                        transition-all duration-200
                                        ${snapshot.isDragging 
                                          ? "shadow-2xl scale-105 z-50 bg-white border-2 border-[#384877] rotate-2" 
                                          : "bg-gradient-to-br from-white to-slate-50/30 border border-slate-200/60 hover:border-[#384877]/40 hover:shadow-md hover:from-white hover:to-white"
                                        }
                                      `}
                                    >
                                      <div className="flex items-start gap-3">
                                        {subtasks.length > 0 && (
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              toggleTaskExpand(task.id);
                                            }}
                                            className="flex-shrink-0 mt-1 hover:bg-slate-100 rounded p-1 transition-colors"
                                          >
                                            {isExpanded ? (
                                              <ChevronDown className="w-4 h-4 text-slate-600" />
                                            ) : (
                                              <ChevronRight className="w-4 h-4 text-slate-600" />
                                            )}
                                          </button>
                                        )}
                                        <div className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 shadow-sm ${PRIORITY_COLORS[task.priority]}`} />
                                        <div 
                                          className="flex-1 min-w-0"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            onTaskClick(task);
                                          }}
                                        >
                                          <div className="flex items-center gap-2 mb-1.5">
                                            <h4 className="font-semibold text-slate-800 text-sm">
                                              {task.title}
                                            </h4>
                                            {subtasks.length > 0 && (
                                              <Badge variant="secondary" className="text-xs h-5 px-2 bg-blue-50 text-blue-700 font-semibold">
                                                {subtasks.length} 个子约定
                                              </Badge>
                                            )}
                                          </div>
                                          {task.description && (
                                            <p className="text-xs text-slate-600 line-clamp-2 mb-2 leading-relaxed">
                                              {task.description}
                                            </p>
                                          )}
                                          <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                                            <Clock className="w-3 h-3" />
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
                                    </motion.div>
                                  )}
                                </Draggable>
                                
                                {/* Subtasks */}
                                <AnimatePresence>
                                  {isExpanded && subtasks.length > 0 && (
                                    <motion.div
                                      initial={{ opacity: 0, height: 0 }}
                                      animate={{ opacity: 1, height: "auto" }}
                                      exit={{ opacity: 0, height: 0 }}
                                      className="ml-12 space-y-2"
                                    >
                                      {subtasks.map((subtask) => (
                                        <motion.div
                                          key={subtask.id}
                                          initial={{ opacity: 0, x: -10 }}
                                          animate={{ opacity: 1, x: 0 }}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            onTaskClick(subtask);
                                          }}
                                          className="p-3 rounded-xl bg-blue-50/50 border border-blue-100 hover:border-blue-300 hover:bg-blue-50 cursor-pointer transition-all"
                                        >
                                          <div className="flex items-start gap-2.5">
                                            <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${PRIORITY_COLORS[subtask.priority]}`} />
                                            <div className="flex-1 min-w-0">
                                              <h5 className="font-semibold text-slate-700 mb-1 text-sm">
                                                {subtask.title}
                                              </h5>
                                              {subtask.description && (
                                                <p className="text-xs text-slate-600 line-clamp-1 mb-1.5 leading-relaxed">
                                                  {subtask.description}
                                                </p>
                                              )}
                                              {subtask.reminder_time && (
                                                <div className="flex items-center gap-1 text-xs text-slate-500 font-medium">
                                                  <Clock className="w-3 h-3" />
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
                                        </motion.div>
                                      ))}
                                      {onCreateSubtask && (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            onCreateSubtask(task);
                                          }}
                                          className="w-full p-3 rounded-lg text-sm cursor-pointer border-2 border-dashed border-blue-200 hover:border-blue-400 hover:bg-blue-50 text-blue-600 flex items-center justify-center gap-2"
                                        >
                                          <Plus className="w-4 h-4" />
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
                      )}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            );
          })}
        </div>
      </DragDropContext>
    </div>
  );
}