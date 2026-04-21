import React, { useState } from "react";
import { startOfWeek, endOfWeek, addDays, isSameDay, isToday, format, parseISO } from "date-fns";
import { zhCN } from "date-fns/locale";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { StickyNote, Plus } from "lucide-react";
import DayDetailDialog from "./DayDetailDialog";
import { cn } from "@/lib/utils";

const CATEGORY_STYLES = {
  work: "bg-blue-50 text-blue-700 border-blue-100 hover:bg-blue-100",
  personal: "bg-indigo-50 text-indigo-700 border-indigo-100 hover:bg-indigo-100",
  health: "bg-emerald-50 text-emerald-700 border-emerald-100 hover:bg-emerald-100",
  study: "bg-amber-50 text-amber-700 border-amber-100 hover:bg-amber-100",
  family: "bg-rose-50 text-rose-700 border-rose-100 hover:bg-rose-100",
  shopping: "bg-orange-50 text-orange-700 border-orange-100 hover:bg-orange-100",
  finance: "bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200",
  other: "bg-slate-50 text-slate-600 border-slate-100 hover:bg-slate-100",
};

const PRIORITY_INDICATORS = {
  urgent: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-blue-500",
  low: "bg-slate-300"
};

/**
 * 周视图任务网格 - 与月视图一致的设计语言
 * 单行 7 列，每列显示该天的任务（最多 4 条，多余显示"+N 更多"）
 */
export default function CalendarWeekGridView({
  currentDate,
  tasks = [],
  notes = [],
  onDateClick,
  onTaskDrop,
  onTaskClick,
}) {
  const [selectedDate, setSelectedDate] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [hoveredDate, setHoveredDate] = useState(null);

  const weekStart = startOfWeek(currentDate, { locale: zhCN });
  const days = [];
  for (let i = 0; i < 7; i++) days.push(addDays(weekStart, i));

  const getItemsForDate = (date) => {
    const dateStr = format(date, "yyyy-MM-dd");

    const dayTasks = tasks.filter((task) => {
      if (!task.reminder_time || task.parent_task_id || task.deleted_at) return false;
      const taskDate = format(new Date(task.reminder_time), "yyyy-MM-dd");

      if (task.end_time) {
        const endDate = format(new Date(task.end_time), "yyyy-MM-dd");
        return dateStr >= taskDate && dateStr <= endDate;
      }
      return taskDate === dateStr;
    });

    const dayNotes = notes.filter((note) => {
      const noteDate = format(new Date(note.created_date), "yyyy-MM-dd");
      return noteDate === dateStr;
    });

    dayTasks.sort((a, b) => {
      if (a.status === "completed" && b.status !== "completed") return 1;
      if (a.status !== "completed" && b.status === "completed") return -1;
      return 0;
    });

    return { tasks: dayTasks, notes: dayNotes };
  };

  const handleDragEnd = (result) => {
    if (!result.destination || !onTaskDrop) return;
    const taskId = result.draggableId;
    const destinationDate = new Date(result.destination.droppableId);
    onTaskDrop(taskId, destinationDate);
  };

  return (
    <div className="select-none bg-white rounded-3xl">
      <DragDropContext onDragEnd={handleDragEnd}>
        {/* Header */}
        <div className="grid grid-cols-7 border-b border-slate-100">
          {["周日", "周一", "周二", "周三", "周四", "周五", "周六"].map((day, i) => (
            <div key={i} className="py-4 text-center">
              <span
                className={cn(
                  "text-xs font-semibold tracking-wide uppercase",
                  i === 0 || i === 6 ? "text-rose-400" : "text-slate-400"
                )}
              >
                {day}
              </span>
            </div>
          ))}
        </div>

        {/* Grid - single row, taller cells since only 7 days */}
        <div className="grid grid-cols-7 auto-rows-[minmax(220px,auto)]">
          {days.map((day, dayIdx) => {
            const { tasks: dayTasks, notes: dayNotes } = getItemsForDate(day);
            const isCurrentDay = isToday(day);
            const dateKey = format(day, "yyyy-MM-dd");
            const isHovered = hoveredDate === dateKey;

            const visibleTasks = dayTasks.slice(0, 4);
            const hiddenCount = dayTasks.length - 4;

            return (
              <Droppable key={dateKey} droppableId={dateKey}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    onMouseEnter={() => setHoveredDate(dateKey)}
                    onMouseLeave={() => setHoveredDate(null)}
                    onClick={() => onDateClick && onDateClick(day)}
                    className={cn(
                      "relative border-r border-b border-slate-100 p-2 transition-colors duration-200 group min-h-[220px] flex flex-col cursor-pointer",
                      isCurrentDay && "bg-blue-50/10",
                      snapshot.isDraggingOver && "bg-blue-50 ring-2 ring-inset ring-blue-200",
                      (dayIdx + 1) % 7 === 0 && "border-r-0"
                    )}
                  >
                    {/* Date Number */}
                    <div className="flex justify-between items-start mb-2 px-1">
                      <span
                        className={cn(
                          "text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full transition-all relative",
                          isCurrentDay
                            ? "bg-blue-600 text-white shadow-md shadow-blue-200 scale-110"
                            : "text-slate-700",
                          isHovered && !isCurrentDay && "bg-slate-100 text-slate-900"
                        )}
                      >
                        {format(day, "d")}
                        {isCurrentDay && (
                          <span className="absolute -top-1 -right-1 flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                          </span>
                        )}
                      </span>

                      {dayNotes.length > 0 && (
                        <div className="flex -space-x-1">
                          {dayNotes.slice(0, 2).map((_, i) => (
                            <div key={i} className="w-2 h-2 rounded-full bg-amber-300 ring-2 ring-white" />
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Tasks List */}
                    <div className="flex-1 flex flex-col gap-1.5">
                      {visibleTasks.map((task, index) => (
                        <Draggable key={task.id} draggableId={task.id} index={index}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              onClick={(e) => {
                                e.stopPropagation();
                                onTaskClick && onTaskClick(task);
                              }}
                              className={cn(
                                "relative px-2 py-1.5 rounded-[6px] text-xs font-medium cursor-pointer transition-all border shadow-sm flex items-center gap-2 group/task",
                                CATEGORY_STYLES[task.category] || CATEGORY_STYLES.other,
                                task.status === "completed" &&
                                  "opacity-60 saturate-0 decoration-slate-400 bg-slate-50 border-slate-100",
                                snapshot.isDragging &&
                                  "shadow-xl rotate-2 scale-105 z-50 opacity-100 ring-2 ring-blue-500 border-transparent bg-white"
                              )}
                            >
                              <div
                                className={cn(
                                  "w-1.5 h-1.5 rounded-full flex-shrink-0",
                                  PRIORITY_INDICATORS[task.priority] || "bg-slate-300"
                                )}
                              />
                              <span
                                className={cn(
                                  "truncate flex-1",
                                  task.status === "completed" && "line-through"
                                )}
                              >
                                {task.title}
                              </span>
                              {task.reminder_time && !task.is_all_day && (
                                <span className="text-[10px] opacity-70 flex-shrink-0 font-normal">
                                  {format(parseISO(task.reminder_time), "HH:mm")}
                                </span>
                              )}
                            </div>
                          )}
                        </Draggable>
                      ))}

                      {(hiddenCount > 0 || (visibleTasks.length === 0 && dayNotes.length > 0)) && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedDate(day);
                            setDialogOpen(true);
                          }}
                          className="mt-auto text-[10px] font-medium text-slate-400 hover:text-blue-600 hover:bg-blue-50 py-1 px-2 rounded-md transition-colors text-left flex items-center gap-1"
                        >
                          {hiddenCount > 0 ? (
                            <>
                              <span className="font-bold">+{hiddenCount}</span> 更多
                            </>
                          ) : dayNotes.length > 0 ? (
                            <>
                              <StickyNote className="w-3 h-3" /> 查看笔记
                            </>
                          ) : null}
                        </button>
                      )}
                    </div>

                    {/* Hover Add Overlay */}
                    <div
                      className={cn(
                        "absolute inset-0 bg-slate-50/0 pointer-events-none transition-all flex items-center justify-center opacity-0",
                        isHovered && visibleTasks.length === 0 && dayNotes.length === 0 && "opacity-100"
                      )}
                    >
                      <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shadow-sm">
                        <Plus className="w-4 h-4" />
                      </div>
                    </div>

                    {provided.placeholder}
                  </div>
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
      </DragDropContext>
    </div>
  );
}