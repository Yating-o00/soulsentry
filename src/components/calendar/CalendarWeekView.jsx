import React from "react";
import { motion } from "framer-motion";
import { startOfWeek, endOfWeek, addDays, format, isSameDay, isToday } from "date-fns";
import { zhCN } from "date-fns/locale";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { StickyNote, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";

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
  onTaskClick 
}) {
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
    
    const dayTasks = tasks.filter(task => {
      if (!task.reminder_time) return false;
      const taskDate = new Date(task.reminder_time);
      const taskDateStr = format(taskDate, "yyyy-MM-dd");
      const taskHour = taskDate.getHours();
      
      return taskDateStr === dateStr && taskHour === hour;
    });

    return dayTasks;
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
      <div className="overflow-x-auto">
        <div className="min-w-[800px]">
          {/* Header with dates */}
          <div className="grid grid-cols-8 border-b-2 border-slate-200 sticky top-0 bg-white z-10 shadow-sm">
            <div className="p-3 text-sm font-bold text-slate-700 border-r border-slate-200">
              时间
            </div>
            {days.map((day) => {
              const isCurrentDay = isToday(day);
              const dayTasks = tasks.filter(t => t.reminder_time && format(new Date(t.reminder_time), "yyyy-MM-dd") === format(day, "yyyy-MM-dd"));
              const dayNotes = getNotesForDate(day);
              
              return (
                <div
                  key={format(day, "yyyy-MM-dd")}
                  className={`p-3 text-center border-r border-slate-200 ${
                    isCurrentDay ? "bg-blue-50 border-b-2 border-blue-500" : ""
                  }`}
                >
                  <div className="text-[11px] font-medium text-slate-500 mb-1">
                    {format(day, "EEE", { locale: zhCN })}
                  </div>
                  <div
                    className={`text-xl font-bold mb-2 ${
                      isCurrentDay
                        ? "text-white bg-blue-500 w-8 h-8 rounded-full flex items-center justify-center mx-auto"
                        : "text-slate-800"
                    }`}
                  >
                    {format(day, "d")}
                  </div>
                  
                  {/* Task & Notes count */}
                  <div className="flex items-center justify-center gap-1">
                    {dayTasks.length > 0 && (
                      <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-blue-50 border border-blue-200">
                        <Clock className="w-2.5 h-2.5 text-blue-600" />
                        <span className="text-[10px] font-bold text-blue-700">{dayTasks.length}</span>
                      </div>
                    )}
                    {dayNotes.length > 0 && (
                      <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-purple-50 border border-purple-200">
                        <StickyNote className="w-2.5 h-2.5 text-purple-600" />
                        <span className="text-[10px] font-bold text-purple-700">{dayNotes.length}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Time grid */}
          <div className="max-h-[600px] overflow-y-auto">
            {HOURS.map((hour) => (
              <div key={hour} className="grid grid-cols-8 border-b border-slate-100">
                <div className="p-2 text-xs font-semibold text-slate-600 border-r border-slate-200 bg-slate-50/50">
                  {hour.toString().padStart(2, '0')}:00
                </div>
                {days.map((day) => {
                  const dateKey = format(day, "yyyy-MM-dd");
                  const dropId = `${dateKey}_${hour}`;
                  const hourTasks = getItemsForDateTime(day, hour);

                  return (
                    <Droppable key={dropId} droppableId={dropId}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className={`
                            p-1 min-h-[60px] border-r border-slate-200 cursor-pointer
                            ${snapshot.isDraggingOver ? "bg-blue-50" : "hover:bg-slate-50"}
                          `}
                          onClick={() => {
                            const clickDate = new Date(day);
                            clickDate.setHours(hour, 0, 0, 0);
                            onDateClick(clickDate);
                          }}
                        >
                          <div className="space-y-1">
                            {hourTasks.map((task, index) => (
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
                                     p-2 rounded-md text-xs cursor-pointer border
                                     transition-all
                                     ${snapshot.isDragging ? "shadow-lg scale-105 z-50 bg-white border-blue-400" : "bg-white border-slate-200 hover:border-blue-300 hover:shadow-sm"}
                                   `}
                                  >
                                   <div className="flex items-start gap-1.5">
                                     <div className={`w-1 h-1 rounded-full mt-1 flex-shrink-0 ${PRIORITY_COLORS[task.priority]}`} />
                                     <div className="flex-1 min-w-0">
                                       <div className="font-semibold text-slate-800 truncate leading-tight">
                                         {task.title}
                                       </div>
                                       <div className="flex items-center gap-1 mt-1 text-[10px] text-slate-500">
                                         <Clock className="w-2.5 h-2.5" />
                                         <span className="font-medium">{format(new Date(task.reminder_time), "HH:mm")}</span>
                                         {task.end_time && (
                                           <>
                                             <span>-</span>
                                             <span className="font-medium">{format(new Date(task.end_time), "HH:mm")}</span>
                                           </>
                                         )}
                                       </div>
                                     </div>
                                   </div>
                                  </div>
                                )}
                              </Draggable>
                            ))}
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