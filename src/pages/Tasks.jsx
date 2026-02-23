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

  const {
    updateTaskAsync,
    createTaskAsync,
    handleComplete,
    handleSubtaskToggle
  } = useTaskOperations();

  const { data: allTasks = [], isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => base44.entities.Task.list('-reminder_time'),
    initialData: []
  });

  // Filter tasks
  const { milestoneTasks, lifeTasks, completedTasks } = useMemo(() => {
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

    return {
      milestoneTasks: milestone,
      lifeTasks: life,
      completedTasks: completed
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

  return (
    <div className="min-h-screen bg-[#faf9f7] pb-24 font-sans text-[#2C3E50]">
      {/* Inject Fonts */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;600;700&family=Inter:wght@300;400;500;600&display=swap');
        .font-serif { font-family: 'Noto Serif SC', serif; }
        .font-sans { font-family: 'Inter', sans-serif; }
      `}</style>

      <NotificationManager />

      {/* Header / Nav */}
      <header className="sticky top-0 z-40 bg-white/70 backdrop-blur-xl border-b border-stone-200/50">
        <div className="max-w-5xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-stone-700 to-stone-900 flex items-center justify-center text-white font-serif font-bold text-lg shadow-sm">
              心
            </div>
            <div>
              <h1 className="font-serif text-xl font-semibold text-stone-800 tracking-tight">心栈 SoulSentry</h1>
              <p className="text-xs text-stone-500 tracking-wide">你背后坚定且温柔的支持者</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-3 text-sm">
              <span className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-full text-xs font-medium">
                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
                {milestoneTasks.length} 个里程碑
              </span>
              <span className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-700 rounded-full text-xs font-medium">
                <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                {lifeTasks.length} 个生活
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="pt-8 px-6 max-w-5xl mx-auto">
        
        {/* AI Assistant Section */}
        <section className="mb-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="bg-white/70 backdrop-blur-xl border border-white/50 rounded-[24px] p-6 relative overflow-hidden shadow-sm">
            <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-blue-100/20 via-green-100/10 to-transparent rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none"></div>
            
            <div className="flex items-start gap-4 relative z-10">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#E8D5C4] to-[#D4C5B9] shadow-[0_4px_20px_rgba(232,213,196,0.4)] flex items-center justify-center flex-shrink-0 animate-pulse">
                <Sparkles className="w-7 h-7 text-stone-700" />
              </div>
              
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-medium text-stone-500">智能统筹助手</span>
                  <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full flex items-center gap-1">
                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
                    运行中
                  </span>
                </div>
                <p className="text-lg text-stone-800 leading-relaxed">
                  本周有<span className="text-blue-600 font-medium mx-1">{milestoneTasks.length}个严肃约定</span>和<span className="text-green-600 font-medium mx-1">{lifeTasks.length}个生活提醒</span>。
                  <span className="hidden md:inline">"产品V1.0规划"进展至75%，生活约定已智能协调至碎片时段，不干扰深度工作。</span>
                </p>
                
                {/* Coordination Bar */}
                <div className="mt-4 flex items-center gap-3">
                  <div className="flex-1 h-2 bg-stone-100 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-blue-400 via-green-400 to-amber-300 rounded-full w-[82%]"></div>
                  </div>
                  <span className="text-xs text-stone-500 font-medium">本周和谐度 82%</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Unified Input */}
        <section className="mb-10 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-100">
          <UnifiedTaskInput onAddTask={handleAddTask} />
          
          {/* Quick Templates - Static for demo, could be dynamic */}
          <div className="mt-3 flex flex-wrap gap-2 px-2">
            <span className="text-xs text-stone-400 py-1">快捷：</span>
            <button onClick={() => handleAddTask({title: '周五前完成周报', category: 'work', priority: 'high', status: 'pending'})} className="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 rounded-full text-xs text-stone-600 transition-colors">周五前完成...</button>
            <button onClick={() => handleAddTask({title: '下周三前提交设计稿', category: 'work', priority: 'high', status: 'pending'})} className="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 rounded-full text-xs text-stone-600 transition-colors">下周三前提交...</button>
            <button onClick={() => handleAddTask({title: '下班前记得买菜', category: 'personal', priority: 'medium', status: 'pending'})} className="px-3 py-1.5 bg-green-50 hover:bg-green-100 rounded-full text-xs text-green-700 transition-colors">下班前记得买...</button>
          </div>
        </section>

        {/* View Switcher */}
        <div className="flex items-center justify-between mb-6">
          <div className="bg-stone-100/50 rounded-full p-1 flex gap-1">
            <button 
              onClick={() => setViewMode('all')} 
              className={cn("px-5 py-2 rounded-full text-sm font-medium transition-all", viewMode === 'all' ? "bg-white shadow-sm text-stone-800" : "text-stone-600 hover:bg-stone-200/50")}
            >
              全部
            </button>
            <button 
              onClick={() => setViewMode('milestone')} 
              className={cn("px-5 py-2 rounded-full text-sm font-medium transition-all", viewMode === 'milestone' ? "bg-white shadow-sm text-stone-800" : "text-stone-600 hover:bg-stone-200/50")}
            >
              严肃约定
            </button>
            <button 
              onClick={() => setViewMode('life')} 
              className={cn("px-5 py-2 rounded-full text-sm font-medium transition-all", viewMode === 'life' ? "bg-white shadow-sm text-stone-800" : "text-stone-600 hover:bg-stone-200/50")}
            >
              生活提醒
            </button>
          </div>
          
          <button 
            onClick={() => setShowCompleted(!showCompleted)} 
            className="text-xs text-stone-500 hover:text-stone-700 flex items-center gap-1 transition-colors"
          >
            <span>已完成 {completedTasks.length}</span>
            <ChevronDown className={cn("w-3 h-3 transition-transform", showCompleted && "rotate-180")} />
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