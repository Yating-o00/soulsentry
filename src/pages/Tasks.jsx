import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "../components/TranslationContext";
import { Sparkles, ChevronDown, Check, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useTaskOperations } from "../components/hooks/useTaskOperations";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import NotificationManager from "../components/notifications/NotificationManager";
import MilestoneCard from "../components/tasks/MilestoneCard";
import LifeTaskCard from "../components/tasks/LifeTaskCard";
import TaskCreationPanel from "../components/tasks/TaskCreationPanel";
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
    deleteTask,
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
    const active = allTasks.filter((t) => !t.deleted_at && t.status !== 'completed');
    const completed = allTasks.filter((t) => !t.deleted_at && t.status === 'completed');

    const roots = active.filter((t) => !t.parent_task_id);

    const milestone = [];
    const life = [];

    roots.forEach((task) => {
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

    const overdueCount = active.filter((t) => {
      if (!t.reminder_time) return false;
      return new Date(t.reminder_time) < now;
    }).length;

    const completedTodayCount = completed.filter((t) => {
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
    return allTasks.filter((t) => t.parent_task_id === parentId && !t.deleted_at);
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
  if (hour < 6) {greeting = "凌晨好";greetingIcon = "🌙";} else
  if (hour < 11) {greeting = "早上好";greetingIcon = "🌅";} else
  if (hour < 14) {greeting = "中午好";greetingIcon = "☀️";} else
  if (hour < 18) {greeting = "下午好";greetingIcon = "🌤️";} else
  {greeting = "晚上好";greetingIcon = "🌙";}

  return (
    <div className="min-h-screen bg-[#f8f9fa] pb-24 font-sans text-slate-900">
      <NotificationManager />

      <main className="pt-8 px-6 max-w-7xl mx-auto">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
          <div>
            <h1 className="text-4xl font-bold text-slate-900 mb-2 flex items-center gap-3">约定

            </h1>
            <p className="text-slate-500 text-lg">
              你的点滴都是最重要的事
            </p>
          </div>

          <div className="bg-white p-1 rounded-full shadow-sm border border-slate-200 inline-flex">
            <button
              onClick={() => setViewMode('all')}
              className={cn(
                "px-6 py-2.5 rounded-full text-sm font-medium transition-all duration-300 flex items-center gap-2",
                viewMode === 'all' ?
                "bg-[#384877] text-white shadow-md" :
                "text-slate-600 hover:bg-slate-50"
              )}>

              <Sparkles className="w-4 h-4" />
              <span>概览</span>
            </button>
            <button
              onClick={() => setViewMode('milestone')}
              className={cn(
                "px-6 py-2.5 rounded-full text-sm font-medium transition-all duration-300 flex items-center gap-2",
                viewMode === 'milestone' ?
                "bg-[#384877] text-white shadow-md" :
                "text-slate-600 hover:bg-slate-50"
              )}>

              <span>里程碑</span>
            </button>
            <button
              onClick={() => setViewMode('life')}
              className={cn(
                "px-6 py-2.5 rounded-full text-sm font-medium transition-all duration-300 flex items-center gap-2",
                viewMode === 'life' ?
                "bg-[#384877] text-white shadow-md" :
                "text-slate-600 hover:bg-slate-50"
              )}>

              <span>生活</span>
            </button>
          </div>
        </div>

        {/* Task Creation Panel */}
        <section className="mb-10">
          <TaskCreationPanel
            onAddTask={handleAddTask}
            onOpenManual={() => setSelectedTask({ status: 'pending', priority: 'medium' })}
            onVoiceTasks={async (tasks) => {
              for (const task of tasks) {
                await handleAddTask(task);
              }
            }} />

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
            className="text-sm font-medium text-slate-500 hover:text-[#384877] flex items-center gap-1 transition-colors">

            <span>显示已完成 ({completedTasks.length})</span>
            <ChevronDown className={cn("w-4 h-4 transition-transform", showCompleted && "rotate-180")} />
          </button>
        </div>

        {/* Content Area */}
        <div className="space-y-8">
          
          {/* Milestone Section */}
          {(viewMode === 'all' || viewMode === 'milestone') && milestoneTasks.length > 0 &&
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              {milestoneTasks.map((task) =>
            <MilestoneCard
              key={task.id}
              task={task}
              subtasks={getSubtasks(task.id)}
              onToggleSubtask={handleToggleSubtask}
              onUpdateStatus={handleUpdateStatus}
              onAddSubtask={() => {
                setSelectedTask(task);
              }}
              onUpdate={(task, data) => updateTaskAsync({ id: task.id, data })}
              onDelete={(task) => deleteTask(task.id)}
              onEdit={() => setSelectedTask(task)} />
            )}
            </div>
          }

          {/* Divider */}
          {viewMode === 'all' && milestoneTasks.length > 0 && lifeTasks.length > 0 &&
          <div className="h-px bg-gradient-to-r from-transparent via-[#E8E4E0] to-transparent my-8"></div>
          }

          {/* Life Section */}
          {(viewMode === 'all' || viewMode === 'life') && lifeTasks.length > 0 &&
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

              <div className="flex flex-col gap-4">
                {lifeTasks.map((task) =>
                  <LifeTaskCard
                    key={task.id}
                    task={task}
                    onComplete={(task, status) => handleComplete(task, allTasks, status ? 'completed' : 'pending')}
                    onEdit={() => setSelectedTask(task)} 
                  />
                )}
              </div>
            </div>
          }

          {/* Completed Section */}
          {showCompleted && completedTasks.length > 0 &&
          <div className="mt-8 pt-8 border-t border-stone-200 animate-in fade-in">
              <h4 className="text-sm font-medium text-stone-500 mb-4 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                已完成约定
              </h4>
              <div className="space-y-3 opacity-60">
                {completedTasks.map((task) =>
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
              )}
              </div>
            </div>
          }

        </div>
      </main>

      {/* Floating Context Reminder */}
      <ContextReminder
        onDismiss={() => {}}
        onSnooze={() => {}} />


      {/* Detail Modal */}
      <TaskDetailModal
        task={selectedTask}
        open={!!selectedTask}
        onClose={() => setSelectedTask(null)} />

    </div>);

}