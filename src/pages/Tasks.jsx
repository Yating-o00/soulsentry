import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "../components/TranslationContext";
import { Sparkles, ChevronDown, Check, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useTaskOperations } from "../components/hooks/useTaskOperations";
import NotificationManager from "../components/notifications/NotificationManager";
import MilestoneCard from "../components/tasks/MilestoneCard";
import LifeTaskCard from "../components/tasks/LifeTaskCard";
import UnifiedTaskInput from "../components/tasks/UnifiedTaskInput";
import ContextReminder from "../components/tasks/ContextReminder";
import TaskDetailModal from "../components/tasks/TaskDetailModal";

const MILESTONE_CATEGORIES = ['work', 'study', 'finance', 'project'];

export default function Tasks() {
  const { t } = useTranslation();
  const [viewMode, setViewMode] = useState("all"); // 'all', 'milestone', 'life'
  const [showCompleted, setShowCompleted] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [user, setUser] = useState(null);

  const {
    updateTaskAsync,
    createTaskAsync,
    handleComplete,
    handleSubtaskToggle
  } = useTaskOperations();

  React.useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  const { data: allTasks = [], isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => base44.entities.Task.list('-reminder_time'),
    initialData: []
  });

  // Filter tasks
  const { milestoneTasks, lifeTasks, completedTasks, stats } = useMemo(() => {
    const active = allTasks.filter(t => !t.deleted_at && t.status !== 'completed');
    const completed = allTasks.filter(t => !t.deleted_at && t.status === 'completed');

    const roots = active.filter(t => !t.parent_task_id);
    
    const milestone = [];
    const life = [];

    roots.forEach(task => {
      const isMilestone = MILESTONE_CATEGORIES.includes(task.category) || task.priority === 'urgent' || task.priority === 'high';
      if (isMilestone) {
        milestone.push(task);
      } else {
        life.push(task);
      }
    });

    // Stats Calculations
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const now = new Date();

    const todayPendingCount = active.length;
    
    const overdueCount = active.filter(t => {
      if (!t.reminder_time) return false;
      return new Date(t.reminder_time) < now;
    }).length;

    const completedTodayCount = completed.filter(t => {
      if (!t.completed_at) return false;
      const cDate = new Date(t.completed_at);
      cDate.setHours(0, 0, 0, 0);
      return cDate.getTime() === today.getTime();
    }).length;

    return {
      milestoneTasks: milestone,
      lifeTasks: life,
      completedTasks: completed,
      stats: {
        pending: todayPendingCount,
        overdue: overdueCount,
        completedToday: completedTodayCount
      }
    };
  }, [allTasks]);

  const getSubtasks = (parentId) => {
    return allTasks.filter(t => t.parent_task_id === parentId && !t.deleted_at);
  };

  const handleAddTask = async (taskData) => {
    await createTaskAsync(taskData);
  };

  const handleToggleSubtask = (subtask) => {
    handleSubtaskToggle(subtask, allTasks);
  };

  const handleUpdateStatus = (task, status) => {
    handleComplete(task, allTasks, status);
  };

  // Get current date info
  const today = new Date();
  const dateStr = today.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
  const weekday = today.toLocaleDateString('zh-CN', { weekday: 'long' });
  
  // Greeting based on hour
  const hour = today.getHours();
  let greeting = "你好";
  let greetingIcon = "☀️";
  if (hour < 6) { greeting = "凌晨好"; greetingIcon = "🌙"; }
  else if (hour < 11) { greeting = "早上好"; greetingIcon = "🌅"; }
  else if (hour < 14) { greeting = "中午好"; greetingIcon = "☀️"; }
  else if (hour < 18) { greeting = "下午好"; greetingIcon = "🌤️"; }
  else { greeting = "晚上好"; greetingIcon = "🌙"; }

  return (
    <div className="min-h-screen bg-[#f8f9fa] pb-24 font-sans text-slate-900">
      <NotificationManager />

      <main className="pt-8 px-6 max-w-7xl mx-auto">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
          <div>
            <h1 className="text-4xl font-bold text-slate-900 mb-2 flex items-center gap-3">
              {greeting}, {user ? user.full_name : '朋友'} <span className="text-3xl">{greetingIcon}</span>
            </h1>
            <p className="text-slate-500 text-lg">
              今天是 {dateStr} {weekday}
            </p>
          </div>

          <div className="bg-white p-1 rounded-full shadow-sm border border-slate-200 inline-flex">
            <button 
              onClick={() => setViewMode('all')} 
              className={cn(
                "px-6 py-2.5 rounded-full text-sm font-medium transition-all duration-300 flex items-center gap-2",
                viewMode === 'all' 
                  ? "bg-[#384877] text-white shadow-md" 
                  : "text-slate-600 hover:bg-slate-50"
              )}
            >
              <Sparkles className="w-4 h-4" />
              <span>概览</span>
            </button>
            <button 
              onClick={() => setViewMode('milestone')} 
              className={cn(
                "px-6 py-2.5 rounded-full text-sm font-medium transition-all duration-300 flex items-center gap-2",
                viewMode === 'milestone' 
                  ? "bg-[#384877] text-white shadow-md" 
                  : "text-slate-600 hover:bg-slate-50"
              )}
            >
              <span>里程碑</span>
            </button>
            <button 
              onClick={() => setViewMode('life')} 
              className={cn(
                "px-6 py-2.5 rounded-full text-sm font-medium transition-all duration-300 flex items-center gap-2",
                viewMode === 'life' 
                  ? "bg-[#384877] text-white shadow-md" 
                  : "text-slate-600 hover:bg-slate-50"
              )}
            >
              <span>生活</span>
            </button>
          </div>
        </div>

        {/* Stats Cards Section */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          {/* Card 1: Today's Pending - Dark Blue */}
          <div className="bg-[#384877] text-white rounded-3xl p-6 relative overflow-hidden shadow-lg shadow-blue-900/10 hover:shadow-xl transition-all duration-300 group cursor-default">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-3xl -mr-10 -mt-10"></div>
            <div className="absolute bottom-0 right-0 opacity-10 transform translate-x-4 translate-y-4">
               <div className="w-24 h-24 border-4 border-white rounded-xl rotate-12"></div>
               <div className="w-24 h-24 border-4 border-white rounded-xl -rotate-6 -mt-16 ml-8"></div>
            </div>
            
            <div className="relative z-10 h-full flex flex-col justify-between">
              <div className="flex justify-between items-start">
                <span className="text-white/80 font-medium">今日待办</span>
              </div>
              
              <div className="mt-4">
                <div className="text-6xl font-bold tracking-tight mb-2">{stats.pending}</div>
                
                {/* Progress Bar */}
                <div className="w-full bg-white/20 h-1.5 rounded-full mt-4 overflow-hidden">
                   <div 
                      className="h-full bg-white rounded-full" 
                      style={{ width: `${Math.min(100, (stats.completedToday / (stats.pending + stats.completedToday || 1)) * 100)}%` }}
                   ></div>
                </div>
                <div className="flex justify-end mt-1">
                   <span className="text-xs text-white/70">
                      {Math.round((stats.completedToday / (stats.pending + stats.completedToday || 1)) * 100)}%
                   </span>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Overdue - White */}
          <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm hover:shadow-md transition-all duration-300 group cursor-default">
             <div className="flex justify-between items-start mb-6">
                <span className="text-slate-500 font-medium">逾期约定</span>
                <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center">
                   <div className="w-4 h-4 text-red-500 border-2 border-current rounded-full flex items-center justify-center font-bold text-[10px]">!</div>
                </div>
             </div>
             <div className="mt-auto">
                <div className="text-5xl font-bold text-slate-800 mb-2">{stats.overdue}</div>
                <p className="text-slate-400 text-sm">需要尽快处理</p>
             </div>
          </div>

          {/* Card 3: Completed Today - White */}
          <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm hover:shadow-md transition-all duration-300 group cursor-default">
             <div className="flex justify-between items-start mb-6">
                <span className="text-slate-500 font-medium">今日已完成</span>
                <div className="w-8 h-8 rounded-full bg-green-50 flex items-center justify-center">
                   <CheckCircle2 className="w-5 h-5 text-green-500" />
                </div>
             </div>
             <div className="mt-auto">
                <div className="text-5xl font-bold text-slate-800 mb-2">{stats.completedToday}</div>
                <p className="text-slate-400 text-sm">保持这个节奏!</p>
             </div>
          </div>
        </section>

        {/* Unified Input */}
        <section className="mb-10">
          <UnifiedTaskInput onAddTask={handleAddTask} />
          
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={() => handleAddTask({title: '周五前完成周报', category: 'work', priority: 'high', status: 'pending'})} className="px-4 py-2 bg-white border border-slate-200 hover:border-[#384877] hover:text-[#384877] rounded-full text-xs text-slate-500 transition-all shadow-sm">周五前完成周报</button>
            <button onClick={() => handleAddTask({title: '下周三前提交设计稿', category: 'work', priority: 'high', status: 'pending'})} className="px-4 py-2 bg-white border border-slate-200 hover:border-[#384877] hover:text-[#384877] rounded-full text-xs text-slate-500 transition-all shadow-sm">下周三前提交设计稿</button>
            <button onClick={() => handleAddTask({title: '下班前记得买菜', category: 'personal', priority: 'medium', status: 'pending'})} className="px-4 py-2 bg-white border border-slate-200 hover:border-green-600 hover:text-green-600 rounded-full text-xs text-slate-500 transition-all shadow-sm">下班前记得买菜</button>
          </div>
        </section>

        {/* Filters & Content Area */}
        <div className="flex items-center justify-between mb-6">
           <h3 className="text-xl font-bold text-slate-800">
             {viewMode === 'all' && '全部约定'}
             {viewMode === 'milestone' && '里程碑'}
             {viewMode === 'life' && '生活提醒'}
           </h3>
           <button 
            onClick={() => setShowCompleted(!showCompleted)} 
            className="text-sm font-medium text-slate-500 hover:text-[#384877] flex items-center gap-1 transition-colors"
          >
            <span>显示已完成 ({completedTasks.length})</span>
            <ChevronDown className={cn("w-4 h-4 transition-transform", showCompleted && "rotate-180")} />
          </button>
        </div>

        {/* Content Area */}
        <div className="space-y-8">
          
          {/* Milestone Section */}
          {(viewMode === 'all' || viewMode === 'milestone') && milestoneTasks.length > 0 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              {milestoneTasks.map(task => (
                <MilestoneCard 
                  key={task.id}
                  task={task}
                  subtasks={getSubtasks(task.id)}
                  onToggleSubtask={handleToggleSubtask}
                  onUpdateStatus={handleUpdateStatus}
                  onAddSubtask={() => {
                    // Quick add subtask logic or open modal
                    setSelectedTask(task);
                  }}
                  onUpdate={(data) => updateTaskAsync({ id: task.id, data })}
                  onEdit={() => setSelectedTask(task)}
                />
              ))}
            </div>
          )}

          {/* Divider */}
          {viewMode === 'all' && milestoneTasks.length > 0 && lifeTasks.length > 0 && (
            <div className="h-px bg-gradient-to-r from-transparent via-[#E8E4E0] to-transparent my-8"></div>
          )}

          {/* Life Section */}
          {(viewMode === 'all' || viewMode === 'life') && lifeTasks.length > 0 && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 delay-75">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center">
                    <Sparkles className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <h3 className="font-serif text-lg font-semibold text-stone-800">生活提醒</h3>
                    <p className="text-sm text-stone-500">已智能协调至最佳时机，不干扰深度工作</p>
                  </div>
                </div>
                <span className="text-xs text-stone-400">{lifeTasks.length} 个活跃提醒</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {lifeTasks.map(task => (
                  <LifeTaskCard 
                    key={task.id}
                    task={task}
                    onComplete={(task, status) => handleComplete(task, allTasks, status ? 'completed' : 'pending')}
                    onEdit={() => setSelectedTask(task)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Completed Section */}
          {showCompleted && completedTasks.length > 0 && (
            <div className="mt-8 pt-8 border-t border-stone-200 animate-in fade-in">
              <h4 className="text-sm font-medium text-stone-500 mb-4 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                已完成约定
              </h4>
              <div className="space-y-3 opacity-60">
                {completedTasks.map(task => (
                  <div key={task.id} className="flex items-center gap-4 p-4 bg-stone-50 rounded-2xl border border-stone-100">
                    <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                      <Check className="w-5 h-5 text-green-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-stone-700 font-medium line-through decoration-stone-300">{task.title}</p>
                      <p className="text-xs text-stone-400 mt-0.5">
                         {task.category === 'work' ? '里程碑' : '生活提醒'} · {task.completed_at ? new Date(task.completed_at).toLocaleDateString() : '已完成'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </main>

      {/* Floating Context Reminder */}
      <ContextReminder 
        onDismiss={() => {}} 
        onSnooze={() => {}} 
      />

      {/* Detail Modal */}
      <TaskDetailModal
        task={selectedTask}
        open={!!selectedTask}
        onClose={() => setSelectedTask(null)} 
      />
    </div>
  );
}