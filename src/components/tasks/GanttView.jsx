import React, { useState, useRef, useEffect, useMemo } from "react";
import { format, addDays, startOfDay, differenceInDays, isSameDay } from "date-fns";
import { zhCN } from "date-fns/locale";
import { motion } from "framer-motion";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronRight, ChevronDown } from "lucide-react";

// Constants for layout
const DAY_WIDTH = 50; 
const HEADER_HEIGHT = 50;
const TASK_HEIGHT = 40;
const TASK_GAP = 8;
const SIDEBAR_WIDTH = 250;

export default function GanttView({ tasks, onUpdateTask, onTaskClick }) {
  const [dateRange, setDateRange] = useState({ start: addDays(new Date(), -2), end: addDays(new Date(), 14) });
  const [expandedTasks, setExpandedTasks] = useState(new Set());
  const scrollContainerRef = useRef(null);

  // Flatten tasks logic
  const rootTasks = useMemo(() => tasks.filter(t => !t.parent_task_id), [tasks]);
  
  const getSubtasks = (parentId) => tasks.filter(t => t.parent_task_id === parentId);

  const visibleTasks = useMemo(() => {
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
  }, [tasks, expandedTasks, rootTasks]);

  // Adjust date range dynamically
  useEffect(() => {
    if (tasks.length > 0) {
      const dates = tasks.flatMap(t => [
        t.reminder_time ? new Date(t.reminder_time) : new Date(),
        t.end_time ? new Date(t.end_time) : (t.reminder_time ? new Date(t.reminder_time) : new Date())
      ]);
      const minDate = new Date(Math.min(...dates));
      const maxDate = new Date(Math.max(...dates));
      
      // Add buffer
      setDateRange({
        start: addDays(minDate, -5),
        end: addDays(maxDate, 10)
      });
    }
  }, [tasks.length]);

  const toggleExpand = (taskId) => {
    setExpandedTasks(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const getPosition = (date) => {
    const d = date ? new Date(date) : new Date();
    const diff = differenceInDays(startOfDay(d), startOfDay(dateRange.start));
    return diff * DAY_WIDTH;
  };

  const getWidth = (start, end) => {
    const s = start ? new Date(start) : new Date();
    const e = end ? new Date(end) : s;
    let diff = differenceInDays(startOfDay(e), startOfDay(s));
    if (diff < 1) diff = 1; 
    return diff * DAY_WIDTH;
  };

  const handleDragEnd = (task, info) => {
    const moveX = info.offset.x;
    const daysMoved = Math.round(moveX / DAY_WIDTH);
    
    if (daysMoved !== 0) {
      const currentStart = task.reminder_time ? new Date(task.reminder_time) : new Date();
      const currentEnd = task.end_time ? new Date(task.end_time) : null;
      
      const newStart = addDays(currentStart, daysMoved);
      const newEnd = currentEnd ? addDays(currentEnd, daysMoved) : null;
      
      onUpdateTask({
        id: task.id,
        data: {
          reminder_time: newStart.toISOString(),
          end_time: newEnd ? newEnd.toISOString() : null
        }
      });
    }
  };

  // Generate timeline headers
  const days = [];
  let curr = startOfDay(dateRange.start);
  const end = startOfDay(dateRange.end);
  while (curr <= end) {
    days.push(new Date(curr));
    curr = addDays(curr, 1);
  }

  // Calculate coordinates for dependency lines
  const getTaskCoordinates = (taskId) => {
    const index = visibleTasks.findIndex(t => t.id === taskId);
    if (index === -1) return null;
    const task = visibleTasks[index];
    
    const x = getPosition(task.reminder_time);
    const width = getWidth(task.reminder_time, task.end_time);
    const y = index * (TASK_HEIGHT + TASK_GAP) + TASK_HEIGHT / 2;
    
    return { x, y, width, rightX: x + width };
  };

  return (
    <div className="flex flex-col h-[600px] border rounded-xl bg-white shadow-sm overflow-hidden">
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-[200px] md:w-[250px] flex-shrink-0 border-r bg-slate-50 flex flex-col z-20 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
          <div className="h-[50px] border-b flex items-center px-4 font-semibold text-slate-700 bg-white flex-shrink-0">
            任务列表
          </div>
          <div className="flex-1 overflow-y-hidden hover:overflow-y-auto scrollbar-hide">
            <div style={{ height: visibleTasks.length * (TASK_HEIGHT + TASK_GAP) + 20 }}>
              {visibleTasks.map((task) => (
                <div 
                  key={task.id}
                  className="flex items-center px-4 hover:bg-white transition-colors cursor-pointer text-sm truncate border-b border-dashed border-slate-100"
                  style={{ height: TASK_HEIGHT + TASK_GAP, paddingLeft: `${task.level * 16 + 16}px` }}
                  onClick={() => onTaskClick(task)}
                >
                  {getSubtasks(task.id).length > 0 ? (
                    <button 
                      onClick={(e) => { e.stopPropagation(); toggleExpand(task.id); }}
                      className="mr-1.5 p-0.5 hover:bg-slate-200 rounded text-slate-500"
                    >
                      {expandedTasks.has(task.id) ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    </button>
                  ) : <span className="w-4 mr-1.5" />}
                  <span className={`truncate ${task.status === 'completed' ? 'line-through text-slate-400' : 'text-slate-700 font-medium'}`}>
                    {task.title}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Timeline */}
        <div className="flex-1 overflow-auto relative bg-slate-50/30" ref={scrollContainerRef}>
          <div style={{ width: days.length * DAY_WIDTH, minHeight: '100%' }}>
            {/* Header */}
            <div className="sticky top-0 left-0 right-0 h-[50px] bg-white border-b flex z-10 shadow-sm">
              {days.map((day, i) => (
                <div 
                  key={i} 
                  className={`flex-shrink-0 border-r flex flex-col items-center justify-center text-xs ${isSameDay(day, new Date()) ? 'bg-blue-50 text-blue-600 font-bold' : 'text-slate-500'}`}
                  style={{ width: DAY_WIDTH }}
                >
                  <span>{format(day, 'dd')}</span>
                  <span className="text-[10px] scale-90">{format(day, 'EEE', { locale: zhCN })}</span>
                </div>
              ))}
            </div>

            <div className="relative" style={{ height: visibleTasks.length * (TASK_HEIGHT + TASK_GAP) + 20 }}>
              {/* Grid Lines */}
              <div className="absolute inset-0 flex pointer-events-none">
                {days.map((_, i) => (
                  <div key={i} className="border-r h-full border-slate-200/40" style={{ width: DAY_WIDTH }}></div>
                ))}
              </div>

              {/* Dependency Lines (SVG) */}
              <svg className="absolute inset-0 pointer-events-none w-full h-full z-0">
                 {visibleTasks.map(task => 
                   (task.dependencies || []).map(depId => {
                     const startCoords = getTaskCoordinates(depId);
                     const endCoords = getTaskCoordinates(task.id);
                     
                     if (!startCoords || !endCoords) return null;

                     // Simple curve path
                     const path = `M ${startCoords.rightX} ${startCoords.y} 
                                   C ${startCoords.rightX + 15} ${startCoords.y}, 
                                     ${endCoords.x - 15} ${endCoords.y}, 
                                     ${endCoords.x} ${endCoords.y}`;

                     return (
                       <g key={`${depId}-${task.id}`}>
                         <path d={path} fill="none" stroke="#cbd5e1" strokeWidth="1.5" markerEnd="url(#arrowhead)" />
                       </g>
                     );
                   })
                 )}
                 <defs>
                   <marker id="arrowhead" markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
                     <polygon points="0 0, 6 2, 0 4" fill="#94a3b8" />
                   </marker>
                 </defs>
              </svg>

              {/* Task Bars */}
              {visibleTasks.map((task, index) => {
                const left = getPosition(task.reminder_time);
                const width = getWidth(task.reminder_time, task.end_time);
                const isGroup = getSubtasks(task.id).length > 0;
                
                return (
                  <div 
                    key={task.id}
                    className="absolute w-full"
                    style={{ top: index * (TASK_HEIGHT + TASK_GAP), height: TASK_HEIGHT + TASK_GAP }}
                  >
                    <TooltipProvider>
                      <Tooltip delayDuration={0}>
                        <TooltipTrigger asChild>
                          <motion.div
                            drag="x"
                            dragMomentum={false}
                            dragConstraints={scrollContainerRef}
                            onDragEnd={(e, info) => handleDragEnd(task, info)}
                            className={`absolute top-1 rounded-[6px] shadow-sm border flex items-center px-2 text-xs truncate cursor-grab active:cursor-grabbing group transition-colors ${
                              task.status === 'completed' ? 'bg-slate-100 border-slate-200 text-slate-400' :
                              task.priority === 'urgent' ? 'bg-rose-100 border-rose-200 text-rose-700 hover:bg-rose-200' :
                              task.priority === 'high' ? 'bg-orange-100 border-orange-200 text-orange-700 hover:bg-orange-200' :
                              isGroup ? 'bg-slate-800 border-slate-700 text-slate-100' :
                              'bg-blue-100 border-blue-200 text-blue-700 hover:bg-blue-200'
                            }`}
                            style={{ 
                              left, 
                              width: Math.max(width - 4, 30),
                              height: TASK_HEIGHT - 8,
                              zIndex: 10
                            }}
                            whileHover={{ scale: 1.02, zIndex: 20 }}
                            whileTap={{ scale: 0.98 }}
                          >
                             {isGroup && (
                               <div className="absolute inset-x-0 -bottom-1 h-2 flex justify-between px-1">
                                  <div className="w-0 h-0 border-l-[4px] border-r-[4px] border-t-[4px] border-l-transparent border-r-transparent border-t-slate-700"></div>
                                  <div className="w-0 h-0 border-l-[4px] border-r-[4px] border-t-[4px] border-l-transparent border-r-transparent border-t-slate-700"></div>
                               </div>
                             )}
                             <span className="truncate font-medium relative z-10">{task.title}</span>
                          </motion.div>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="bg-slate-900 text-white border-0 text-xs p-2">
                          <p className="font-bold">{task.title}</p>
                          <p className="opacity-80">
                            {format(new Date(task.reminder_time), 'MM-dd HH:mm')}
                            {task.end_time && ` -> ${format(new Date(task.end_time), 'MM-dd HH:mm')}`}
                          </p>
                          {task.dependencies?.length > 0 && (
                            <p className="text-orange-300 mt-1">依赖: {task.dependencies.length} 项</p>
                          )}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}