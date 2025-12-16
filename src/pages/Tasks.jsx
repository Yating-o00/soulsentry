import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import SmartTextParser from "../components/tasks/SmartTextParser";
import { toast } from "sonner";
import { logUserBehavior } from "@/components/utils/behaviorLogger";
import { useTaskOperations } from "../components/hooks/useTaskOperations";


export default function Tasks() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [advancedFilters, setAdvancedFilters] = useState({ createdBy: 'all', tags: [], dateRange: undefined });
  
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
    const matchesCategory = categoryFilter === "all" || task.category === categoryFilter;
    const matchesSearch = task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        task.description?.toLowerCase().includes(searchQuery.toLowerCase());

    // Advanced Filters
    let matchesAdvanced = true;
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

    return matchesStatus && matchesCategory && matchesSearch && matchesAdvanced;
  }), [tasks, statusFilter, categoryFilter, searchQuery, advancedFilters]);

  // Group tasks logic
  // Only show top-level tasks in the list
  const rootTasks = React.useMemo(() => filteredTasks.filter((t) => !t.parent_task_id), [filteredTasks]);
  const getSubtasks = (parentId) => filteredTasks.filter((t) => t.parent_task_id === parentId);
  const getAllSubtasks = (parentId) => tasks.filter((t) => t.parent_task_id === parentId);

  const onCompleteTask = (task) => handleComplete(task, allTasks);
  const onSubtaskToggleWrapper = (subtask) => handleSubtaskToggle(subtask, allTasks);

  const handleUpdateTask = (taskData) => {
    const { id, ...data } = taskData;
    updateTask({ id: editingTask.id, data });
  };

  // Smart sort removed - handled by Soul Sentry agent conversation

  const handleBulkCreate = async (parsedTasks) => {
    if (!parsedTasks || parsedTasks.length === 0) {
      toast.error("没有约定需要创建");
      return;
    }

    let createdCount = 0;
    let createdSubtasksCount = 0;

    try {
      toast.loading("正在创建约定...", { id: 'bulk-create' });

      for (const taskData of parsedTasks) {
        const hasSubtasks = taskData.subtasks && taskData.subtasks.length > 0;

        // 创建主约定，确保包含所有字段和初始进度
        const mainTaskData = {
          title: taskData.title,
          description: taskData.description || "",
          reminder_time: taskData.reminder_time,
          priority: taskData.priority || "medium",
          category: taskData.category || "personal",
          status: "pending",
          progress: 0, // 初始进度为0
          notification_sound: taskData.notification_sound || "default",
          persistent_reminder: taskData.persistent_reminder || false,
          notification_interval: taskData.notification_interval || 15,
          advance_reminders: taskData.advance_reminders || [],
          assigned_to: taskData.assigned_to || []
        };

        const createdMainTask = await base44.entities.Task.create(mainTaskData);
        createdCount++;

        // 如果有子约定，创建子约定
        if (hasSubtasks) {
          for (let i = 0; i < taskData.subtasks.length; i++) {
            const subtask = taskData.subtasks[i];
            const subtaskData = {
              title: `${subtask.order || i + 1}. ${typeof subtask.title === 'object' ? subtask.title.title || subtask.title.text || "未命名子约定" : subtask.title}`, // 添加序号到标题
              description: subtask.description || "",
              reminder_time: subtask.reminder_time || taskData.reminder_time,
              priority: subtask.priority || taskData.priority || "medium",
              category: taskData.category, // 子约定继承父约定的类别
              status: "pending",
              parent_task_id: createdMainTask.id, // 关联父约定
              progress: 0, // 子约定也有progress字段
              notification_sound: taskData.notification_sound || "default",
              persistent_reminder: false, // 子约定默认不持续提醒
              advance_reminders: [],
              assigned_to: taskData.assigned_to || []
            };

            await base44.entities.Task.create(subtaskData);
            createdSubtasksCount++;
          }
        }
        
        // Manual invalidate as we used direct SDK calls for bulk operation
        queryClient.invalidateQueries({ queryKey: ['tasks'] });
      }

      toast.success(
        `✅ 成功创建 ${createdCount} 个主约定${createdSubtasksCount > 0 ? `和 ${createdSubtasksCount} 个子约定` : ''}！`,
        { id: 'bulk-create' }
      );
    } catch (error) {
      console.error("Error creating bulk tasks:", error);
      toast.error(
        `创建约定时出错。已成功创建 ${createdCount} 个主约定${createdSubtasksCount > 0 ? `和 ${createdSubtasksCount} 个子约定` : ''}。`,
        { id: 'bulk-create' }
      );
    }
  };

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      <NotificationManager />
      
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}>

        <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-[#384877] to-[#3b5aa2] bg-clip-text text-transparent mb-2">
          全部约定
        </h1>
        <p className="text-slate-600">你的点滴都是最重要的事</p>
      </motion.div>

      <div className="mb-8">
        <Tabs defaultValue="quick" className="w-full">
          <TabsList className="grid w-full grid-cols-2 lg:w-[400px] bg-slate-100 p-1 rounded-xl mb-4">
            <TabsTrigger
              value="quick"
              className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-[#384877] data-[state=active]:shadow-sm transition-all font-medium py-2">

              快速创建
            </TabsTrigger>
            <TabsTrigger
              value="smart"
              className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-[#d5495f] data-[state=active]:shadow-sm transition-all font-medium py-2">

              智能文本解析
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="quick" className="mt-0 focus-visible:ring-0">
            <QuickAddTask onAdd={(data) => createTask(data)} />
          </TabsContent>
          
          <TabsContent value="smart" className="mt-0 focus-visible:ring-0">
            <SmartTextParser onTasksGenerated={handleBulkCreate} />
          </TabsContent>
        </Tabs>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="space-y-4">

        <div className="flex flex-col md:flex-row items-center gap-3 bg-white p-2 rounded-2xl shadow-sm border border-slate-100">
          <div className="relative flex-1 w-full md:w-auto">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="搜索约定..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-10 border-0 bg-slate-50 hover:bg-slate-100 focus:bg-white transition-colors rounded-xl text-sm" />

          </div>

          <div className="flex items-center gap-2 w-full md:w-auto justify-between md:justify-end overflow-x-auto">
            <div className="bg-slate-100 p-1 rounded-xl flex gap-1 flex-shrink-0">
              <button
                onClick={() => setViewMode("list")}
                className={`p-2 rounded-lg transition-all ${viewMode === 'list' ? 'bg-white text-[#384877] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                title="列表视图">
                <LayoutList className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode("gantt")}
                className={`p-2 rounded-lg transition-all ${viewMode === 'gantt' ? 'bg-white text-[#384877] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
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

            <div className="h-6 w-px bg-slate-200 mx-1 hidden md:block"></div>

            <AdvancedTaskFilters 
                filters={advancedFilters} 
                onChange={setAdvancedFilters} 
                onClear={() => setAdvancedFilters({ createdBy: 'all', tags: [], dateRange: undefined })} 
            />



            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-32 border-0 bg-white shadow-lg rounded-xl">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="类别" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部类别</SelectItem>
                <SelectItem value="work">工作</SelectItem>
                <SelectItem value="personal">个人</SelectItem>
                <SelectItem value="health">健康</SelectItem>
                <SelectItem value="study">学习</SelectItem>
                <SelectItem value="family">家庭</SelectItem>
                <SelectItem value="shopping">购物</SelectItem>
                <SelectItem value="finance">财务</SelectItem>
                <SelectItem value="other">其他</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Tabs value={statusFilter} onValueChange={setStatusFilter} className="w-full">
          <TabsList className="grid w-full md:w-auto grid-cols-3 bg-white shadow-md rounded-[12px] p-1">
            <TabsTrigger value="all" className="rounded-[10px] data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#384877] data-[state=active]:to-[#3b5aa2] data-[state=active]:text-white data-[state=active]:shadow-sm">
              全部 ({tasks.length})
            </TabsTrigger>
            <TabsTrigger value="pending" className="rounded-[10px] data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#06b6d4] data-[state=active]:to-[#0891b2] data-[state=active]:text-white data-[state=active]:shadow-sm">
              进行中 ({tasks.filter((t) => t.status === "pending").length})
            </TabsTrigger>
            <TabsTrigger value="completed" className="rounded-[10px] data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#10b981] data-[state=active]:to-[#059669] data-[state=active]:text-white data-[state=active]:shadow-sm">
              已完成 ({tasks.filter((t) => t.status === "completed").length})
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
                className="ml-8 relative pl-4 border-l-2 border-slate-200/50">

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
            <h3 className="text-xl font-semibold text-slate-800 mb-2">未找到约定</h3>
            <p className="text-slate-600">试试调整筛选条件或创建新约定</p>
          </motion.div>
        }
      </motion.div>

      <TaskDetailModal
        task={selectedTask}
        open={!!selectedTask}
        onClose={() => setSelectedTask(null)} />


      <Dialog open={!!editingTask} onOpenChange={(open) => !open && setEditingTask(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>编辑约定</DialogTitle>
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