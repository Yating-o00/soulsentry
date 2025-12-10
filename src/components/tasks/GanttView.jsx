import React, { useState, useRef, useEffect } from "react";
import { format, addDays, startOfDay, differenceInDays, addHours, isSameDay } from "date-fns";
import { zhCN } from "date-fns/locale";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronRight, ChevronDown, Calendar as CalendarIcon, ArrowRight } from "lucide-react";

// Constants for layout
const DAY_WIDTH = 60; // Width of one day in pixels
const HEADER_HEIGHT = 50;
const TASK_HEIGHT = 40;
const TASK_GAP = 10;
const SIDEBAR_WIDTH = 250;

export default function GanttView({ tasks, onUpdateTask, onTaskClick }) {
  const [dateRange, setDateRange] = useState({ start: new Date(), end: addDays(new Date(), 30) });
  const [expandedTasks, setExpandedTasks] = useState(new Set());
  const scrollContainerRef = useRef(null);

  // Group tasks by parent
  const rootTasks = tasks.filter(t => !t.parent_task_id);
  const getSubtasks = (parentId) => tasks.filter(t => t.parent_task_id === parentId);

  // Flatten tasks for rendering (handling expansion)
  const getVisibleTasks = () => {
    let visible = [];
    const traverse = (taskList, level = 0) => {
      taskList.forEach(task => {
        visible.push({ ...task, level });
        if (expandedTasks.has(task.id)) {
          traverse(getSubtasks(task.id), level + 1);
        }
      });
    };
    traverse(rootTasks);
    return visible;
  };

  const visibleTasks = getVisibleTasks();

  // Determine timeline range based on tasks
  useEffect(() => {
    if (tasks.length > 0) {
      const dates = tasks.flatMap(t => [new Date(t.reminder_time), t.end_time ? new Date(t.end_time) : new Date(t.reminder_time)]);
      const minDate = new Date(Math.min(...dates));
      const maxDate = new Date(Math.max(...dates));
      setDateRange({
        start: addDays(minDate, -2), // Buffer
        end: addDays(maxDate, 5)
      });
    }
  }, [tasks.length]); // Simple dependency, could be optimized

  const toggleExpand = (taskId) => {
    setExpandedTasks(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const getPosition = (date) => {
    const diff = differenceInDays(startOfDay(new Date(date)), startOfDay(dateRange.start));
    return diff * DAY_WIDTH;
  };

  const getWidth = (start, end) => {
    if (!end) return DAY_WIDTH; // Default width for point tasks
    let diff = differenceInDays(startOfDay(new Date(end)), startOfDay(new Date(start)));
    if (diff === 0) diff = 1; // Minimum 1 day width visually
    return diff * DAY_WIDTH;
  };

  const handleDragEnd = (task, info) => {
    const moveX = info.offset.x;
    const daysMoved = Math.round(moveX / DAY_WIDTH);
    
    if (daysMoved !== 0) {
      const newStart = addDays(new Date(task.reminder_time), daysMoved);
      const newEnd = task.end_time ? addDays(new Date(task.end_time), daysMoved) : null;
      
      onUpdateTask({
        id: task.id,
        data: {
          reminder_time: newStart.toISOString(),
          end_time: newEnd ? newEnd.toISOString() : null
        }
      });
    }
  };

  // Generate calendar headers
  const days = [];
  let curr = startOfDay(dateRange.start);
  const end = startOfDay(dateRange.end);
  while (curr <= end) {
    days.push(new Date(curr));
    curr = addDays(curr, 1);
  }

  return (
    <div className="flex h-[calc(100vh-200px)] border rounded-xl overflow-hidden bg-white shadow-sm">
      {/* Sidebar - Task List */}
      <div className="w-[250px] flex-shrink-0 border-r bg-slate-50 flex flex-col z-10 shadow-lg">
        <div className="h-[50px] border-b flex items-center px-4 font-semibold text-slate-700 bg-white">
          任务名称
        </div>
        <div className="flex-1 overflow-y-hidden hover:overflow-y-auto scrollbar-hide">
          {visibleTasks.map((task, index) => (
            <div 
              key={task.id}
              className="flex items-center px-4 border-b hover:bg-white transition-colors cursor-pointer text-sm truncate"
              style={{ height: TASK_HEIGHT + TASK_GAP, paddingLeft: `${task.level * 20 + 16}px` }}
              onClick={() => onTaskClick(task)}
            >
              {getSubtasks(task.id).length > 0 && (
                <button 
                  onClick={(e) => { e.stopPropagation(); toggleExpand(task.id); }}
                  className="mr-1 p-0.5 hover:bg-slate-200 rounded"
                >
                  {expandedTasks.has(task.id) ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                </button>
              )}
              <span className={`truncate ${task.status === 'completed' ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                {task.title}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Timeline Area */}
      <div className="flex-1 overflow-auto relative bg-slate-50/50" ref={scrollContainerRef}>
        <div className="min-w-full" style={{ width: days.length * DAY_WIDTH }}>
          {/* Header */}
          <div className="sticky top-0 left-0 right-0 h-[50px] bg-white border-b flex z-10">
            {days.map((day, i) => (
              <div 
                key={i} 
                className={`flex-shrink-0 border-r flex flex-col items-center justify-center text-xs ${isSameDay(day, new Date()) ? 'bg-blue-50 text-blue-600 font-bold' : 'text-slate-500'}`}
                style={{ width: DAY_WIDTH }}
              >
                <span>{format(day, 'MM/dd')}</span>
                <span className="text-[10px] opacity-70">{format(day, 'EEE', { locale: zhCN })}</span>
              </div>
            ))}
          </div>

          {/* Grid & Bars */}
          <div className="relative">
            {/* Vertical Lines */}
            <div className="absolute inset-0 flex pointer-events-none">
              {days.map((_, i) => (
                <div key={i} className="border-r h-full border-slate-200/50" style={{ width: DAY_WIDTH }}></div>
              ))}
            </div>

            {/* Tasks */}
            {visibleTasks.map((task, index) => {
              const left = getPosition(task.reminder_time);
              const width = getWidth(task.reminder_time, task.end_time);
              const isGroup = getSubtasks(task.id).length > 0;
              
              return (
                <div 
                  key={task.id}
                  className="relative group"
                  style={{ height: TASK_HEIGHT + TASK_GAP }}
                >
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <motion.div
                          drag="x"
                          dragMomentum={false}
                          dragConstraints={scrollContainerRef} // Limit to container width conceptually? Or just free.
                          // Actually easier to not constrain strictly or constrain to large bounds
                          onDragEnd={(e, info) => handleDragEnd(task, info)}
                          className={`absolute top-2 rounded-md shadow-sm border flex items-center px-2 text-xs truncate cursor-grab active:cursor-grabbing ${
                            task.status === 'completed' ? 'bg-slate-200 border-slate-300 text-slate-500' :
                            task.priority === 'high' || task.priority === 'urgent' ? 'bg-red-100 border-red-200 text-red-700' :
                            'bg-blue-100 border-blue-200 text-blue-700'
                          }`}
                          style={{ 
                            left, 
                            width: Math.max(width - 4, 20), // Padding
                            height: TASK_HEIGHT - 4,
                            zIndex: 5
                          }}
                          whileHover={{ scale: 1.02, zIndex: 10 }}
                          whileTap={{ scale: 0.98 }}
                        >
                           {isGroup ? (
                             <div className="absolute inset-x-0 bottom-0 h-1 bg-black/10">
                               <div className="absolute left-0 bottom-0 w-2 h-2 bg-black/20 -ml-1 border-l border-b border-black/20 transform rotate-45" />
                               <div className="absolute right-0 bottom-0 w-2 h-2 bg-black/20 -mr-1 border-r border-b border-black/20 transform rotate-45" />
                             </div>
                           ) : null}
                           <span className="truncate w-full">{task.title}</span>
                           
                           {/* Resize handles could be added here later */}
                        </motion.div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <div className="text-xs">
                            <p className="font-bold">{task.title}</p>
                            <p>{format(new Date(task.reminder_time), 'yyyy-MM-dd HH:mm')}</p>
                            {task.end_time && <p> -> {format(new Date(task.end_time), 'yyyy-MM-dd HH:mm')}</p>}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  {/* Dependencies Lines (simplified visual) */}
                  {task.dependencies?.map(depId => {
                     // Find dependent task position if visible?
                     // Drawing complex SVG lines across rows is tricky in this structure without absolute overlay.
                     // For MVP, we skip drawing lines or draw simple arrows if in same view.
                     return null;
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}