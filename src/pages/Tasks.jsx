import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "../components/TranslationContext";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Search, Filter, Trash2, RotateCcw, AlertTriangle, Edit, LayoutList, BarChart3, KanbanSquare, Sparkles, Loader2, Archive, Star, CheckSquare, Share2, X } from "lucide-react";
import SwipeableItem, { SwipeActions } from "../components/mobile/SwipeableItem";
import GanttView from "../components/tasks/GanttView";
import KanbanView from "../components/tasks/KanbanView";
import AdvancedTaskFilters from "../components/tasks/AdvancedTaskFilters";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { motion, AnimatePresence } from "framer-motion";
import TaskCard from "../components/tasks/TaskCard";
import QuickAddTask from "../components/tasks/QuickAddTask";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSearchParams } from "react-router-dom";
import NotificationManager from "../components/notifications/NotificationManager";
import TaskDetailModal from "../components/tasks/TaskDetailModal";
import { toast } from "sonner";
import { logUserBehavior } from "@/components/utils/behaviorLogger";
import { useTaskOperations } from "../components/hooks/useTaskOperations";
import MultiTaskShareCard from "../components/tasks/MultiTaskShareCard";


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
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState(new Set());
  const [showMultiShare, setShowMultiShare] = useState(false);
  
  const {
    updateTask, 
    createTask,
    updateTaskAsync,
    createTaskAsync,
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

  const toggleSelection = (task) => {
    setSelectedTaskIds(prev => {
        const next = new Set(prev);
        if (next.has(task.id)) {
            next.delete(task.id);
        } else {
            next.add(task.id);
        }
        return next;
    });
  };

  const handleEnterSelectionMode = () => {
    setIsSelectionMode(true);
    setSelectedTaskIds(new Set());
  };

  const handleExitSelectionMode = () => {
    setIsSelectionMode(false);
    setSelectedTaskIds(new Set());
  };

  const getSelectedTasksObjects = () => {
    return allTasks.filter(t => selectedTaskIds.has(t.id));
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
    const titleStr = task.title && typeof task.title === 'string' ? task.title : '';
    const descStr = task.description && typeof task.description === 'string' ? task.description : '';
    const searchLower = searchQuery.toLowerCase();
    const matchesSearch = titleStr.toLowerCase().includes(searchLower) ||
        descStr.toLowerCase().includes(searchLower);

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
  const rootTasks = React.useMemo(() => {
    const roots = filteredTasks.filter((t) => !t.parent_task_id);
    // Sort: completed tasks at the bottom
    return roots.sort((a, b) => {
      const isCompletedA = a.status === 'completed';
      const isCompletedB = b.status === 'completed';
      
      if (isCompletedA && !isCompletedB) return 1;
      if (!isCompletedA && isCompletedB) return -1;
      
      // Secondary sort: reminder_time descending (keep original order)
      const timeA = new Date(a.reminder_time || 0).getTime();
      const timeB = new Date(b.reminder_time || 0).getTime();
      return timeB - timeA;
    });
  }, [filteredTasks]);
  const getSubtasks = (parentId) => {
    const subs = filteredTasks.filter((t) => t.parent_task_id === parentId);
    return subs.sort((a, b) => {
      const isCompletedA = a.status === 'completed';
      const isCompletedB = b.status === 'completed';
      
      if (isCompletedA && !isCompletedB) return 1;
      if (!isCompletedA && isCompletedB) return -1;
      
      const timeA = new Date(a.reminder_time || 0).getTime();
      const timeB = new Date(b.reminder_time || 0).getTime();
      return timeB - timeA;
    });
  };
  const getAllSubtasks = (parentId) => tasks.filter((t) => t.parent_task_id === parentId);

  const onCompleteTask = (task) => {
    // 触觉反馈（支持的设备）
    if (navigator.vibrate && task.status !== "completed") {
      navigator.vibrate(50);
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

  const handleUpdateTask = async (taskData) => {
    const { id, ...data } = taskData;
    try {
      await updateTaskAsync({ id: editingTask.id, data });
      setEditingTask(null);
      toast.success("约定已更新");
    } catch (e) {
      // Error handled in hook or just logged
    }
  };

  // Smart sort removed - handled by Soul Sentry agent conversation

  return (
    <div className="pb-20 md:pb-8">
      <NotificationManager />
      
      {/* Sticky Header - Mobile */}
      <div className="md:hidden sticky top-0 z-40 bg-gradient-to-br from-slate-50 to-white border-b border-slate-200 shadow-sm">
        <div className="p-3">
          <h1 className="text-xl font-bold bg-gradient-to-r from-[#384877] to-[#3b5aa2] bg-clip-text text-transparent">
            {t('allTasks')}
          </h1>
          <p className="text-xs text-slate-600">{rootTasks.length} 个约定</p>
        </div>

        {/* Sticky Tabs - Mobile */}
        <Tabs value={statusFilter} onValueChange={setStatusFilter} className="w-full px-3 pb-2">
          <TabsList className="grid w-full grid-cols-3 bg-white shadow-md rounded-xl p-1">
            <TabsTrigger value="all" className="rounded-lg text-xs px-2 py-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#384877] data-[state=active]:to-[#3b5aa2] data-[state=active]:text-white data-[state=active]:shadow-sm">
              {t('all')} ({tasks.length})
            </TabsTrigger>
            <TabsTrigger value="pending" className="rounded-lg text-xs px-2 py-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#06b6d4] data-[state=active]:to-[#0891b2] data-[state=active]:text-white data-[state=active]:shadow-sm">
              {t('pending')} ({tasks.filter((t) => t.status === "pending").length})
            </TabsTrigger>
            <TabsTrigger value="completed" className="rounded-lg text-xs px-2 py-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#10b981] data-[state=active]:to-[#059669] data-[state=active]:text-white data-[state=active]:shadow-sm">
              {t('completed')} ({tasks.filter((t) => t.status === "completed").length})
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="p-3 md:p-8 space-y-3 md:space-y-6 max-w-7xl mx-auto">
        {/* Desktop Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="hidden md:block mb-6">

          <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-[#384877] to-[#3b5aa2] bg-clip-text text-transparent mb-2">
            {t('allTasks')}
          </h1>
          <p className="text-base text-slate-600">{t('yourMomentsMatter')}</p>
        </motion.div>

        <div className="mb-4 md:mb-8">
          <QuickAddTask onAdd={(data) => createTaskAsync(data)} />
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
            
            <div className="flex items-center gap-2">
                 {!isSelectionMode ? (
                    <button
                        onClick={handleEnterSelectionMode}
                        className="p-2 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all flex items-center gap-1.5 text-xs font-medium"
                        title="多选分享"
                    >
                        <CheckSquare className="w-4 h-4" />
                        <span className="hidden sm:inline">选择</span>
                    </button>
                 ) : (
                    <button
                        onClick={handleExitSelectionMode}
                        className="p-2 rounded-lg bg-slate-200 text-slate-800 hover:bg-slate-300 transition-all flex items-center gap-1.5 text-xs font-medium"
                    >
                        <X className="w-4 h-4" />
                        取消
                    </button>
                 )}
            </div>
            
            <span className="text-xs text-slate-500 md:hidden">{rootTasks.length} 个约定</span>
          </div>
        </div>

        {/* Desktop Tabs */}
        <Tabs value={statusFilter} onValueChange={setStatusFilter} className="w-full hidden md:block">
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
              {/* Mobile: Swipeable wrapper */}
              <div className="md:hidden">
                <SwipeableItem
                  leftActions={[
                    {
                      icon: SwipeActions.complete.icon,
                      label: task.status === 'completed' ? '未完成' : '完成',
                      color: task.status === 'completed' ? 'text-slate-600' : 'text-green-600',
                      onAction: () => onCompleteTask(task)
                    }
                  ]}
                  rightActions={[
                    {
                      icon: SwipeActions.edit.icon,
                      label: '编辑',
                      color: 'text-purple-600',
                      onAction: () => setEditingTask(task)
                    },
                    {
                      icon: SwipeActions.delete.icon,
                      label: '删除',
                      color: 'text-red-600',
                      onAction: () => deleteTask(task.id)
                    }
                  ]}
                  threshold={80}
                >
                  <TaskCard
                    task={task}
                    subtasks={getAllSubtasks(task.id)}
                    hideSubtaskList={true}
                    onComplete={() => onCompleteTask(task)}
                    onDelete={() => deleteTask(task.id)}
                    onEdit={() => setEditingTask(task)}
                    onUpdate={(data) => updateTask({ id: task.id, data })}
                    onClick={() => isSelectionMode ? toggleSelection(task) : setSelectedTask(task)}
                    onSubtaskToggle={onSubtaskToggleWrapper}
                    onToggleSubtasks={() => toggleTaskExpansion(task.id)}
                    isExpanded={expandedTaskIds.has(task.id)}
                    selectable={isSelectionMode}
                    selected={selectedTaskIds.has(task.id)}
                    onSelect={() => toggleSelection(task)}
                  />
                </SwipeableItem>
              </div>

              {/* Desktop: Regular card */}
              <div className="hidden md:block">
                <TaskCard
                  task={task}
                  subtasks={getAllSubtasks(task.id)}
                  hideSubtaskList={true}
                  onComplete={() => onCompleteTask(task)}
                  onDelete={() => deleteTask(task.id)}
                  onEdit={() => setEditingTask(task)}
                  onUpdate={(data) => updateTask({ id: task.id, data })}
                  onClick={() => isSelectionMode ? toggleSelection(task) : setSelectedTask(task)}
                  onSubtaskToggle={onSubtaskToggleWrapper}
                  onToggleSubtasks={() => toggleTaskExpansion(task.id)}
                  isExpanded={expandedTaskIds.has(task.id)}
                  selectable={isSelectionMode}
                  selected={selectedTaskIds.has(task.id)}
                  onSelect={() => toggleSelection(task)}
                />
              </div>

              <AnimatePresence>
                {expandedTaskIds.has(task.id) && getSubtasks(task.id).map((subtask) =>
              <motion.div
                key={subtask.id}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="ml-4 md:ml-8 relative pl-3 md:pl-4 border-l-2 border-slate-200/50">

                    {/* Mobile: Swipeable subtask */}
                    <div className="md:hidden">
                      <SwipeableItem
                        leftActions={[
                          {
                            icon: SwipeActions.complete.icon,
                            label: subtask.status === 'completed' ? '未完成' : '完成',
                            color: subtask.status === 'completed' ? 'text-slate-600' : 'text-green-600',
                            onAction: () => onSubtaskToggleWrapper(subtask)
                          }
                        ]}
                        rightActions={[
                          {
                            icon: SwipeActions.delete.icon,
                            label: '删除',
                            color: 'text-red-600',
                            onAction: () => deleteTask(subtask.id)
                          }
                        ]}
                        threshold={80}
                      >
                        <TaskCard
                          task={subtask}
                          hideSubtaskList={true}
                          onComplete={() => onSubtaskToggleWrapper(subtask)}
                          onDelete={() => deleteTask(subtask.id)}
                          onEdit={() => setEditingTask(subtask)}
                          onClick={() => isSelectionMode ? toggleSelection(subtask) : setSelectedTask(subtask)}
                          onSubtaskToggle={onSubtaskToggleWrapper}
                          selectable={isSelectionMode}
                          selected={selectedTaskIds.has(subtask.id)}
                          onSelect={() => toggleSelection(subtask)}
                        />
                      </SwipeableItem>
                    </div>

                    {/* Desktop: Regular subtask */}
                    <div className="hidden md:block">
                      <TaskCard
                        task={subtask}
                        hideSubtaskList={true}
                        onComplete={() => onSubtaskToggleWrapper(subtask)}
                        onDelete={() => deleteTask(subtask.id)}
                        onEdit={() => setEditingTask(subtask)}
                        onClick={() => isSelectionMode ? toggleSelection(subtask) : setSelectedTask(subtask)}
                        onSubtaskToggle={onSubtaskToggleWrapper}
                        selectable={isSelectionMode}
                        selected={selectedTaskIds.has(subtask.id)}
                        onSelect={() => toggleSelection(subtask)}
                      />
                    </div>

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

        {isSelectionMode && selectedTaskIds.size > 0 && (
            <motion.div
                initial={{ y: 100, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 100, opacity: 0 }}
                className="fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-white rounded-full shadow-xl border border-slate-200 px-6 py-3 flex items-center gap-4 z-50"
            >
                <div className="text-sm font-medium text-slate-700">
                    已选择 {selectedTaskIds.size} 项
                </div>
                <div className="h-4 w-px bg-slate-200" />
                <button
                    onClick={() => setShowMultiShare(true)}
                    className="flex items-center gap-2 text-blue-600 font-medium hover:text-blue-700 transition-colors"
                >
                    <Share2 className="w-4 h-4" />
                    分享选中项
                </button>
            </motion.div>
        )}

        <MultiTaskShareCard
            tasks={getSelectedTasksObjects()}
            open={showMultiShare}
            onClose={() => setShowMultiShare(false)}
        />
      </div>
    </div>);

}