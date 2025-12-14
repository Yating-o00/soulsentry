import React, { useState, useRef, useEffect } from "react";
import { format, addDays, startOfDay, differenceInDays, isSameDay, startOfWeek, endOfWeek, eachDayOfInterval, isWeekend } from "date-fns";
import { zhCN } from "date-fns/locale";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { 
  Tooltip, 
  TooltipContent, 
  TooltipProvider, 
  TooltipTrigger 
} from "@/components/ui/tooltip";
import { 
  ChevronRight, 
  ChevronDown, 
  Calendar as CalendarIcon, 
  ZoomIn, 
  ZoomOut
} from "lucide-react";

// Layout constants
const HEADER_HEIGHT = 56;
const TASK_HEIGHT = 44;
const SIDEBAR_WIDTH = 280;

export default function GanttView({ tasks, onUpdateTask, onTaskClick }) {
  const [viewScale, setViewScale] = useState("day"); // 'day', 'week'
  const [dayWidth, setDayWidth] = useState(60);
  const [expandedTasks, setExpandedTasks] = useState(new Set());
  const [dateRange, setDateRange] = useState({ start: addDays(new Date(), -3), end: addDays(new Date(), 14) });
  
  const headerRef = useRef(null);
  const bodyRef = useRef(null);

  // Initialize expanded tasks
  useEffect(() => {
    const initialExpanded = new Set();
    tasks.forEach(t => {
       if (tasks.some(sub => sub.parent_task_id === t.id)) {
           initialExpanded.add(t.id);
       }
    });
    setExpandedTasks(initialExpanded);
  }, [tasks.length]); 

  // Calculate timeline range dynamically
  useEffect(() => {
    if (tasks.length > 0) {
      const dates = tasks.flatMap(t => [
          new Date(t.reminder_time), 
          t.end_time ? new Date(t.end_time) : new Date(t.reminder_time)
      ]).filter(d => !isNaN(d));

      if (dates.length > 0) {
          const minDate = new Date(Math.min(...dates));
          const maxDate = new Date(Math.max(...dates));
          
          // Add buffer
          let start = addDays(minDate, -7);
          let end = addDays(maxDate, 14);
          
          // Adjust to start of week if week view
          if (viewScale === 'week') {
              start = startOfWeek(start, { weekStartsOn: 1 });
              end = endOfWeek(end, { weekStartsOn: 1 });
          }
          
          setDateRange({ start, end });
      }
    }
  }, [tasks.length, viewScale]);

  // Sync scrolling
  const handleBodyScroll = (e) => {
    if (headerRef.current) {
      headerRef.current.scrollLeft = e.target.scrollLeft;
    }
  };

  // Helper functions
  const rootTasks = tasks.filter(t => !t.parent_task_id);
  const getSubtasks = (parentId) => tasks.filter(t => t.parent_task_id === parentId);

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
    return diff * dayWidth;
  };

  const getWidth = (start, end) => {
    if (!end) return dayWidth; 
    let diff = differenceInDays(startOfDay(new Date(end)), startOfDay(new Date(start)));
    if (diff < 0) diff = 0;
    return (diff + 1) * dayWidth; 
  };

  const handleDragEnd = (task, info) => {
    const moveX = info.offset.x;
    const daysMoved = Math.round(moveX / dayWidth);
    
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

  // Generate timeline headers
  const days = eachDayOfInterval({
      start: startOfDay(dateRange.start),
      end: startOfDay(dateRange.end)
  });

  const scrollToToday = () => {
      if (bodyRef.current) {
          const todayPos = getPosition(new Date());
          bodyRef.current.scrollTo({ left: todayPos - 300, behavior: 'smooth' });
      }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-180px)] border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden select-none">
      {/* Toolbar */}
      <div className="h-14 border-b px-4 flex items-center justify-between bg-white z-20 shrink-0">
        <div className="flex items-center gap-2">
            <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                <CalendarIcon className="w-5 h-5 text-indigo-600" />
                时间规划
            </h3>
            <div className="h-4 w-px bg-slate-200 mx-2" />
            <Button 
                variant="outline" 
                size="sm" 
                onClick={scrollToToday}
                className="text-xs h-8"
            >
                回到今天
            </Button>
        </div>
        
        <div className="flex items-center gap-2">
             <div className="flex items-center border rounded-lg p-0.5 bg-slate-50">
                <button 
                    onClick={() => { setViewScale('day'); setDayWidth(60); }}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${viewScale === 'day' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    日视图
                </button>
                <button 
                    onClick={() => { setViewScale('week'); setDayWidth(30); }}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${viewScale === 'week' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    周视图
                </button>
             </div>
             
             <div className="flex items-center gap-1 border rounded-lg p-0.5 bg-slate-50 ml-2">
                <button onClick={() => setDayWidth(Math.max(20, dayWidth - 10))} className="p-1.5 hover:bg-white rounded-md text-slate-500"><ZoomOut className="w-4 h-4" /></button>
                <span className="text-[10px] w-8 text-center text-slate-400">{dayWidth}px</span>
                <button onClick={() => setDayWidth(Math.min(200, dayWidth + 10))} className="p-1.5 hover:bg-white rounded-md text-slate-500"><ZoomIn className="w-4 h-4" /></button>
             </div>
        </div>
      </div>

      {/* Main Content Area - Synchronized Scrolling */}
      <div className="flex-1 flex flex-col min-h-0 relative">
          
          {/* Fixed Header Row */}
          <div className="flex flex-shrink-0 border-b bg-slate-50/80 backdrop-blur-sm z-10">
              {/* Sidebar Header */}
              <div 
                  className="flex-shrink-0 border-r border-slate-200 flex items-center px-6 text-xs font-semibold text-slate-500 uppercase tracking-wider bg-slate-50"
                  style={{ width: SIDEBAR_WIDTH, height: HEADER_HEIGHT }}
              >
                  任务列表
              </div>
              
              {/* Timeline Header (Scrolls horizontally via ref sync) */}
              <div 
                  ref={headerRef}
                  className="flex-1 overflow-hidden flex"
              >
                  {days.map((day, i) => {
                      const isToday = isSameDay(day, new Date());
                      const isWeekendDay = isWeekend(day);
                      return (
                          <div 
                              key={i} 
                              className={`flex-shrink-0 flex flex-col items-center justify-center border-r border-slate-100 ${isToday ? 'bg-indigo-50/50' : isWeekendDay ? 'bg-slate-50/50' : ''}`}
                              style={{ width: dayWidth, height: HEADER_HEIGHT }}
                          >
                              <span className={`text-[10px] font-medium ${isToday ? 'text-indigo-600' : 'text-slate-400'}`}>
                                  {format(day, 'EEE', { locale: zhCN })}
                              </span>
                              <div className={`text-sm font-bold mt-0.5 w-7 h-7 flex items-center justify-center rounded-full ${isToday ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-700'}`}>
                                  {format(day, 'd')}
                              </div>
                          </div>
                      );
                  })}
              </div>
          </div>

          {/* Scrollable Body Row */}
          <div 
              ref={bodyRef}
              onScroll={handleBodyScroll}
              className="flex-1 overflow-auto flex"
          >
              <div className="flex flex-col min-w-full relative">
                  {/* Grid Lines Overlay */}
                  <div className="absolute inset-0 flex pointer-events-none z-0" style={{ left: SIDEBAR_WIDTH }}>
                      {days.map((day, i) => {
                          const isWeekendDay = isWeekend(day);
                          return (
                            <div 
                                key={i} 
                                className={`flex-shrink-0 border-r border-slate-100 h-full ${isWeekendDay ? 'bg-slate-50/30' : ''}`}
                                style={{ width: dayWidth }} 
                            />
                          );
                      })}
                  </div>

                  {/* Dependency Lines SVG Overlay */}
                  <svg className="absolute inset-0 pointer-events-none z-10" style={{ left: SIDEBAR_WIDTH, width: days.length * dayWidth, height: '100%' }}>
                        <defs>
                            <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                                <polygon points="0 0, 10 3.5, 0 7" fill="#cbd5e1" />
                            </marker>
                        </defs>
                        {visibleTasks.map(task => {
                            if (!task.dependencies || task.dependencies.length === 0) return null;
                            const taskIndex = visibleTasks.findIndex(t => t.id === task.id);
                            if (taskIndex === -1) return null;
                            
                            const taskY = taskIndex * TASK_HEIGHT + TASK_HEIGHT / 2;
                            const taskStartX = getPosition(task.reminder_time);
                            
                            return task.dependencies.map(depId => {
                                const depIndex = visibleTasks.findIndex(t => t.id === depId);
                                if (depIndex === -1) return null;
                                
                                const depTask = visibleTasks[depIndex];
                                const depY = depIndex * TASK_HEIGHT + TASK_HEIGHT / 2;
                                const depEndX = getPosition(depTask.end_time || depTask.reminder_time) + getWidth(depTask.reminder_time, depTask.end_time);
                                
                                // Draw curved path
                                const midX = (depEndX + taskStartX) / 2;
                                return (
                                    <path 
                                        key={`${task.id}-${depId}`}
                                        d={`M ${depEndX} ${depY} C ${midX} ${depY}, ${midX} ${taskY}, ${taskStartX} ${taskY}`}
                                        fill="none"
                                        stroke="#cbd5e1"
                                        strokeWidth="1.5"
                                        markerEnd="url(#arrowhead)"
                                    />
                                );
                            });
                        })}
                  </svg>

                  {/* Task Rows */}
                  <div className="flex flex-col relative z-0 pb-10">
                      {visibleTasks.map((task) => (
                          <div 
                              key={task.id} 
                              className="flex items-stretch hover:bg-slate-50/80 transition-colors group"
                              style={{ height: TASK_HEIGHT }}
                          >
                              {/* Sidebar Item (Sticky Left) */}
                              <div 
                                  className="sticky left-0 z-20 flex-shrink-0 border-r border-slate-200 bg-white group-hover:bg-slate-50 transition-colors flex items-center px-4"
                                  style={{ width: SIDEBAR_WIDTH }}
                              >
                                  <div 
                                      className="flex items-center gap-2 w-full cursor-pointer" 
                                      style={{ paddingLeft: `${task.level * 16}px` }}
                                      onClick={() => onTaskClick(task)}
                                  >
                                      {getSubtasks(task.id).length > 0 ? (
                                          <button 
                                              onClick={(e) => { e.stopPropagation(); toggleExpand(task.id); }}
                                              className="p-1 rounded-md hover:bg-slate-200 text-slate-500"
                                          >
                                              {expandedTasks.has(task.id) ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                          </button>
                                      ) : (
                                          <span className="w-5.5" /> /* Spacer */
                                      )}
                                      
                                      <span className={`text-sm truncate font-medium ${task.status === 'completed' ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                                          {task.title}
                                      </span>
                                  </div>
                              </div>

                              {/* Timeline Bar */}
                              <div className="relative flex-shrink-0" style={{ width: days.length * dayWidth }}>
                                   {/* The Task Bar */}
                                   <TooltipProvider>
                                      <Tooltip>
                                          <TooltipTrigger asChild>
                                              <motion.div
                                                  drag="x"
                                                  dragMomentum={false}
                                                  onDragEnd={(e, info) => handleDragEnd(task, info)}
                                                  className={`absolute top-1.5 h-[32px] rounded-lg shadow-sm border px-3 text-xs flex items-center cursor-grab active:cursor-grabbing truncate transition-all ${
                                                      task.status === 'completed' ? 'bg-slate-100 border-slate-200 text-slate-400' :
                                                      task.priority === 'urgent' ? 'bg-rose-100 border-rose-200 text-rose-700' :
                                                      task.priority === 'high' ? 'bg-orange-100 border-orange-200 text-orange-700' :
                                                      'bg-indigo-100 border-indigo-200 text-indigo-700'
                                                  }`}
                                                  style={{
                                                      left: getPosition(task.reminder_time),
                                                      width: Math.max(getWidth(task.reminder_time, task.end_time) - 10, 24),
                                                  }}
                                                  whileHover={{ scale: 1.02, zIndex: 10, height: 34, y: -1 }}
                                                  whileTap={{ scale: 0.98 }}
                                              >
                                                  {getSubtasks(task.id).length > 0 && (
                                                      <div className="absolute inset-x-0 bottom-0 h-1 bg-black/10 mx-2 rounded-full" />
                                                  )}
                                                  <span className="truncate font-medium">{task.title}</span>
                                              </motion.div>
                                          </TooltipTrigger>
                                          <TooltipContent side="top">
                                              <div className="text-xs space-y-1">
                                                  <p className="font-bold">{task.title}</p>
                                                  <div className="text-slate-500 flex flex-col">
                                                      <span>开始: {format(new Date(task.reminder_time), 'MM-dd HH:mm')}</span>
                                                      {task.end_time && <span>结束: {format(new Date(task.end_time), 'MM-dd HH:mm')}</span>}
                                                  </div>
                                              </div>
                                          </TooltipContent>
                                      </Tooltip>
                                   </TooltipProvider>
                              </div>
                          </div>
                      ))}
                      
                      {/* Empty state filler lines */}
                      {visibleTasks.length < 10 && Array.from({ length: 10 - visibleTasks.length }).map((_, i) => (
                           <div key={`filler-${i}`} className="flex items-stretch border-b border-slate-50" style={{ height: TASK_HEIGHT }}>
                               <div className="sticky left-0 z-20 flex-shrink-0 border-r border-slate-200 bg-white w-[280px]" />
                               <div className="flex-1" />
                           </div>
                      ))}
                  </div>
              </div>
          </div>
      </div>
    </div>
  );
}