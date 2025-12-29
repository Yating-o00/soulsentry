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
          <div className="grid grid-cols-8 border-b border-slate-200 sticky top-0 bg-white z-10">
            <div className="p-4 text-sm font-semibold text-slate-600 border-r border-slate-200">
              时间
            </div>
            {days.map((day) => {
              const isCurrentDay = isToday(day);
              return (
                <div
                  key={format(day, "yyyy-MM-dd")}
                  className={`p-4 text-center border-r border-slate-200 ${
                    isCurrentDay ? "bg-blue-50" : ""
                  }`}
                >
                  <div className="text-xs text-slate-500">
                    {format(day, "EEE", { locale: zhCN })}
                  </div>
                  <div
                    className={`text-xl font-bold ${
                      isCurrentDay
                        ? "text-white bg-blue-500 w-8 h-8 rounded-full flex items-center justify-center mx-auto mt-1"
                        : "text-slate-800"
                    }`}
                  >
                    {format(day, "d")}
                  </div>
                  
                  {/* Notes count */}
                  {getNotesForDate(day).length > 0 && (
                    <Badge variant="secondary" className="mt-2 h-5 text-[10px] bg-purple-100 text-purple-700">
                      <StickyNote className="w-3 h-3 mr-1" />
                      {getNotesForDate(day).length}
                    </Badge>
                  )}
                </div>
              );
            })}
          </div>

          {/* Time grid */}
          <div className="max-h-[600px] overflow-y-auto">
            {HOURS.map((hour) => (
              <div key={hour} className="grid grid-cols-8 border-b border-slate-100">
                <div className="p-2 text-xs text-slate-500 border-r border-slate-200 font-medium">
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
                                      p-1.5 rounded text-xs cursor-pointer
                                      transition-all
                                      ${snapshot.isDragging ? "shadow-lg scale-105 z-50 bg-white border border-blue-300" : "bg-blue-50 hover:bg-blue-100 border border-blue-200"}
                                    `}
                                  >
                                    <div className="flex items-center gap-1">
                                      <div className={`w-1.5 h-1.5 rounded-full ${PRIORITY_COLORS[task.priority]}`} />
                                      <span className="font-medium text-slate-700 truncate flex-1">
                                        {task.title}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-1 mt-1 text-[10px] text-slate-500">
                                      <Clock className="w-3 h-3" />
                                      {format(new Date(task.reminder_time), "HH:mm")}
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