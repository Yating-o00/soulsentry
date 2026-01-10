import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "../components/TranslationContext";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Search, Filter, Trash2, RotateCcw, AlertTriangle, Edit, LayoutList, BarChart3, KanbanSquare, Sparkles, Loader2 } from "lucide-react";
import GanttView from "../components/tasks/GanttView";
import KanbanView from "../components/tasks/KanbanView";
import AdvancedTaskFilters from "../components/tasks/AdvancedTaskFilters";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { motion, AnimatePresence } from "framer-motion";
import TaskCard from "../components/tasks/TaskCard";
import QuickAddTask from "../components/tasks/QuickAddTask";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue } from
"@/components/ui/select";
import { useSearchParams } from "react-router-dom";
import NotificationManager from "../components/notifications/NotificationManager";
import TaskDetailModal from "../components/tasks/TaskDetailModal";
import { toast } from "sonner";
import { logUserBehavior } from "@/components/utils/behaviorLogger";
import { useTaskOperations } from "../components/hooks/useTaskOperations";


export default function Tasks() {
  const { t } = useTranslation();
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [advancedFilters, setAdvancedFilters] = useState({ category: 'all', createdBy: 'all', tags: [], dateRange: undefined });
  
  const [selectedTask, setSelectedTask] = useState(null);
  const [editingTask, setEditingTask] = useState(null);
  const [expandedTaskIds, setExpandedTaskIds] = useState(new Set());
  const [viewMode, setViewMode] = useState("list"); // 'list' | 'gantt' | 'kanban'
  const [isPrioritizing, setIsPrioritizing] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  
  const {
    updateTask, 
    createTask, 
    deleteTask, 
    handleComplete, 
    handleSubtaskToggle 
  } = useTaskOperations();

  const queryClient = useQueryClient();

  const toggleTaskExpansion = (taskId) => {
    setExpandedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  const { data: allTasks = [], isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => base44.entities.Task.list('-reminder_time'),
    initialData: []
  });

  // Handle URL param for opening specific task
  React.useEffect(() => {
    const taskId = searchParams.get("taskId");
    if (taskId && allTasks.length > 0) {
      const task = allTasks.find(t => t.id === taskId);
      if (task) {
        setSelectedTask(task);
        // Optional: clear param after opening
        // setSearchParams({});
      } else {
        // If not in list (maybe deleted or filtered out by server limit?), try fetch individually
        base44.entities.Task.filter({ id: taskId }).then(res => {
          if (res && res.length > 0) {
            setSelectedTask(res[0]);
          }
        });
      }
    }
  }, [searchParams, allTasks]);

  // Include ALL non-deleted tasks for processing
  const tasks = allTasks.filter((task) => !task.deleted_at);
  const trashTasks = allTasks.filter((task) => task.deleted_at);

  // Mutations replaced by useTaskOperations hook
  // createTaskMutation, updateTaskMutation, deleteTaskMutation removed

  const restoreTaskMutation = useMutation({
    mutationFn: (id) => base44.entities.Task.update(id, { deleted_at: null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast.success("约定已恢复");
    }
  });

  const permanentDeleteTaskMutation = useMutation({
    mutationFn: (id) => base44.entities.Task.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast.success("约定已永久删除");
    }
  });

  const filteredTasks = React.useMemo(() => tasks.filter((task) => {
    const matchesStatus = statusFilter === "all" || task.status === statusFilter;
    const matchesSearch = task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        task.description?.toLowerCase().includes(searchQuery.toLowerCase());

    // Advanced Filters
    let matchesAdvanced = true;
    if (advancedFilters.category && advancedFilters.category !== 'all' && task.category !== advancedFilters.category) matchesAdvanced = false;
    if (advancedFilters.createdBy !== 'all' && task.created_by !== advancedFilters.createdBy) matchesAdvanced = false;
    if (advancedFilters.tags && advancedFilters.tags.length > 0) {
        if (!task.tags || !advancedFilters.tags.every(tag => task.tags.includes(tag))) matchesAdvanced = false;
    }
    if (advancedFilters.dateRange && advancedFilters.dateRange.from) {
        const taskDate = new Date(task.reminder_time);
        const from = advancedFilters.dateRange.from;
        const to = advancedFilters.dateRange.to || from;
        if (taskDate < from || taskDate > to) matchesAdvanced = false;
    }

    return matchesStatus && matchesSearch && matchesAdvanced;
  }), [tasks, statusFilter, searchQuery, advancedFilters]);

  // Group tasks logic
  // Only show top-level tasks in the list
  const rootTasks = React.useMemo(() => filteredTasks.filter((t) => !t.parent_task_id), [filteredTasks]);
  const getSubtasks = (parentId) => filteredTasks.filter((t) => t.parent_task_id === parentId);
  const getAllSubtasks = (parentId) => tasks.filter((t) => t.parent_task_id === parentId);

  const onCompleteTask = (task) => {
    // 触觉反馈（支持的设备）
    if (navigator.vibrate && task.status !== "completed") {
      navigator.vibrate(50);
    }
    
    // 完成庆祝效果
    if (task.status !== "completed") {
      import('canvas-confetti').then((confetti) => {
        confetti.default({
          particleCount: 40,
          spread: 50,
          origin: { y: 0.6 },
          colors: ['#10b981', '#34d399', '#6ee7b7']
        });
      });
    }
    
    handleComplete(task, allTasks);
  };
  
  const onSubtaskToggleWrapper = (subtask) => {
    // 触觉反馈
    if (navigator.vibrate && subtask.status !== "completed") {
      navigator.vibrate(30);
    }
    handleSubtaskToggle(subtask, allTasks);
  };

  const handleUpdateTask = (taskData) => {
    const { id, ...data } = taskData;
    updateTask({ id: editingTask.id, data }, {
      onSuccess: () => {
        setEditingTask(null);
        toast.success("约定已更新");
      }
    });
  };

  // Smart sort removed - handled by Soul Sentry agent conversation

  return (
    <div className="p-3 md:p-8 space-y-4 md:space-y-6 max-w-7xl mx-auto pb-20 md:pb-8">
      <NotificationManager />
      
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}>

        <h1 className="text-2xl md:text-4xl font-bold bg-gradient-to-r from-[#384877] to-[#3b5aa2] bg-clip-text text-transparent mb-1 md:mb-2">
          {t('allTasks')}
        </h1>
        <p className="text-sm md:text-base text-slate-600">{t('yourMomentsMatter')}</p>
      </motion.div>

      <div className="mb-4 md:mb-8">
        <QuickAddTask onAdd={(data) => createTask(data)} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="space-y-3">

        <div className="flex flex-col gap-2 bg-white p-2 md:p-3 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder={t('searchTasks')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 md:h-10 border-0 bg-slate-50 hover:bg-slate-100 focus:bg-white transition-colors rounded-xl text-sm" />
            </div>

            <AdvancedTaskFilters 
              filters={advancedFilters} 
              onChange={setAdvancedFilters} 
              onClear={() => setAdvancedFilters({ category: 'all', createdBy: 'all', tags: [], dateRange: undefined })} 
            />
          </div>

          <div className="flex items-center justify-between md:justify-start gap-2">
            <div className="bg-slate-100 p-1 rounded-xl flex gap-1">
              <button
                onClick={() => setViewMode("list")}
                className={`p-2 rounded-lg transition-all ${viewMode === 'list' ? 'bg-white text-[#384877] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                title="列表视图">
                <LayoutList className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode("gantt")}
                className={`p-2 rounded-lg transition-all hidden sm:block ${viewMode === 'gantt' ? 'bg-white text-[#384877] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                title="甘特图视图">
                <BarChart3 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode("kanban")}
                className={`p-2 rounded-lg transition-all ${viewMode === 'kanban' ? 'bg-white text-[#384877] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                title="看板视图">
                <KanbanSquare className="w-4 h-4" />
              </button>
            </div>
            <span className="text-xs text-slate-500 md:hidden">{rootTasks.length} 个约定</span>
          </div>
        </div>

        <Tabs value={statusFilter} onValueChange={setStatusFilter} className="w-full">
          <TabsList className="grid w-full grid-cols-3 bg-white shadow-md rounded-[12px] p-1">
            <TabsTrigger value="all" className="rounded-[10px] text-xs md:text-sm px-2 py-1.5 md:py-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#384877] data-[state=active]:to-[#3b5aa2] data-[state=active]:text-white data-[state=active]:shadow-sm">
              {t('all')} <span className="ml-0.5">({tasks.length})</span>
            </TabsTrigger>
            <TabsTrigger value="pending" className="rounded-[10px] text-xs md:text-sm px-2 py-1.5 md:py-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#06b6d4] data-[state=active]:to-[#0891b2] data-[state=active]:text-white data-[state=active]:shadow-sm">
              {t('pending')} <span className="ml-0.5">({tasks.filter((t) => t.status === "pending").length})</span>
            </TabsTrigger>
            <TabsTrigger value="completed" className="rounded-[10px] text-xs md:text-sm px-2 py-1.5 md:py-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#10b981] data-[state=active]:to-[#059669] data-[state=active]:text-white data-[state=active]:shadow-sm">
              {t('completed')} <span className="ml-0.5">({tasks.filter((t) => t.status === "completed").length})</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="space-y-3">

        {viewMode === 'gantt' &&
        <GanttView
          tasks={filteredTasks}
          onUpdateTask={({ id, data }) => updateTask({ id, data })}
          onTaskClick={(task) => setSelectedTask(task)} />
        }

        {viewMode === 'kanban' &&
        <KanbanView
            tasks={filteredTasks}
            onUpdateTask={({ id, data }) => updateTask({ id, data })}
            onTaskClick={(task) => setSelectedTask(task)}
            onComplete={onCompleteTask}
            onDelete={(id) => deleteTask(id)}
            onEdit={setEditingTask}
        />
        }

        {viewMode === 'list' &&
        <AnimatePresence mode="popLayout">
          {rootTasks.map((task) =>
          <React.Fragment key={task.id}>
              <TaskCard
              task={task}
              subtasks={getAllSubtasks(task.id)}
              hideSubtaskList={true}
              onComplete={() => onCompleteTask(task)}
              onDelete={() => deleteTask(task.id)}
              onEdit={() => setEditingTask(task)}
              onUpdate={(data) => updateTask({ id: task.id, data })}
              onClick={() => setSelectedTask(task)}
              onSubtaskToggle={onSubtaskToggleWrapper}
              onToggleSubtasks={() => toggleTaskExpansion(task.id)}
              isExpanded={expandedTaskIds.has(task.id)} />

              <AnimatePresence>
                {expandedTaskIds.has(task.id) && getSubtasks(task.id).map((subtask) =>
              <motion.div
                key={subtask.id}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="ml-4 md:ml-8 relative pl-3 md:pl-4 border-l-2 border-slate-200/50">

                    <TaskCard
                  task={subtask}
                  hideSubtaskList={true}
                  onComplete={() => onSubtaskToggleWrapper(subtask)}
                  onDelete={() => deleteTask(subtask.id)}
                  onEdit={() => setEditingTask(subtask)}
                  onClick={() => setSelectedTask(subtask)}
                  onSubtaskToggle={onSubtaskToggleWrapper} />

                  </motion.div>
              )}
              </AnimatePresence>
            </React.Fragment>
          )}
        </AnimatePresence>
        }

        {filteredTasks.length === 0 &&
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-16">

            <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center">
              <Search className="w-12 h-12 text-slate-400" />
            </div>
            <h3 className="text-xl font-semibold text-slate-800 mb-2">{t('noTasksFound')}</h3>
            <p className="text-slate-600">{t('adjustFilters')}</p>
          </motion.div>
        }
      </motion.div>

      <TaskDetailModal
        task={selectedTask}
        open={!!selectedTask}
        onClose={() => setSelectedTask(null)} />


      <Dialog open={!!editingTask} onOpenChange={(open) => !open && setEditingTask(null)}>
        <DialogContent className="max-w-[95vw] md:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base md:text-lg">编辑约定</DialogTitle>
          </DialogHeader>
          {editingTask &&
          <QuickAddTask
            initialData={editingTask}
            onAdd={handleUpdateTask} />

          }
        </DialogContent>
      </Dialog>
    </div>);

}