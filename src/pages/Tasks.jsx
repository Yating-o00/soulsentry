import React, { useState, useMemo, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "../components/TranslationContext";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Sparkles, ChevronDown, Check, CheckCircle2, Search, Filter, List, Kanban, BarChart, CheckSquare, X, Trash2, LayoutGrid, Zap, AlarmClock, Lightbulb, CalendarClock, Archive as ArchiveIcon, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useTaskOperations } from "../components/hooks/useTaskOperations";
import AdvancedTaskFilters from "../components/tasks/AdvancedTaskFilters";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import NotificationManager from "../components/notifications/NotificationManager";
import MilestoneCard from "../components/tasks/MilestoneCard";
import LifeTaskCard from "../components/tasks/LifeTaskCard";
import TaskCreationPanel from "../components/tasks/TaskCreationPanel";
import ContextReminder from "../components/tasks/ContextReminder";
import TaskDetailModal from "../components/tasks/TaskDetailModal";
import TaskShareCard from "../components/tasks/TaskShareCard";
import GlobalSearch from "../components/search/GlobalSearch";
import SmartGroupSection from "../components/tasks/SmartGroupSection";

const MILESTONE_CATEGORIES = ['work', 'study', 'finance', 'project'];

export default function Tasks() {
  const { t } = useTranslation();
  const [viewMode, setViewMode] = useState("overview"); // 'overview', 'milestone', 'life'
  const [layoutMode, setLayoutMode] = useState("list"); // 'list', 'kanban', 'gantt'
  const [showCompleted, setShowCompleted] = useState(false);
  const [expandedParents, setExpandedParents] = useState(new Set());
  const [selectedTask, setSelectedTask] = useState(null);
  const [selectedTab, setSelectedTab] = useState(null);
  const [editingTask, setEditingTask] = useState(null);
  const [sharingTask, setSharingTask] = useState(null);
  const [user, setUser] = useState(null);
  
  // Search & Selection State
  const [searchQuery, setSearchQuery] = useState("");
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState([]);
  const [filters, setFilters] = useState({ 
    category: 'all', 
    priority: 'all', 
    dateRange: undefined, 
    createdBy: 'all', 
    tags: [] 
  });

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

  // Auto-open task detail when navigated via ?taskId=xxx (e.g. from global search)
  const location = useLocation();
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const taskId = params.get('taskId');
    if (taskId && allTasks.length > 0) {
      const found = allTasks.find(t => t.id === taskId);
      if (found) setSelectedTask(found);
    }
  }, [location.search, allTasks]);

  // Listen for in-app open event (when user is already on Tasks page and clicks a search result)
  useEffect(() => {
    const handler = (e) => {
      const taskId = e.detail?.taskId;
      if (!taskId) return;
      const found = allTasks.find(t => t.id === taskId);
      if (found) {
        setSelectedTask(found);
        setSelectedTab(null);
      }
    };
    window.addEventListener('open-task-detail', handler);
    return () => window.removeEventListener('open-task-detail', handler);
  }, [allTasks]);

  const { data: allComments = [] } = useQuery({
    queryKey: ['all-comments'],
    queryFn: () => base44.entities.Comment.list(),
    initialData: []
  });

  const commentCountMap = useMemo(() => {
    const map = {};
    for (const c of allComments) {
      if (c.task_id) {
        map[c.task_id] = (map[c.task_id] || 0) + 1;
      }
    }
    return map;
  }, [allComments]);

  // Filter tasks
  const { milestoneTasks, lifeTasks, completedTasks, smartGroups, stats } = useMemo(() => {
    // Apply search filter
    const searchLower = searchQuery.toLowerCase();
    let filteredTasks = allTasks.filter(t => 
      !t.deleted_at && 
      (t.title?.toLowerCase().includes(searchLower) || t.description?.toLowerCase().includes(searchLower))
    );

    // Apply Advanced Filters
    if (filters.category && filters.category !== 'all') {
      filteredTasks = filteredTasks.filter(t => t.category === filters.category);
    }
    if (filters.priority && filters.priority !== 'all') {
      filteredTasks = filteredTasks.filter(t => t.priority === filters.priority);
    }
    if (filters.dateRange?.from) {
      const from = new Date(filters.dateRange.from);
      from.setHours(0, 0, 0, 0);
      const to = filters.dateRange.to ? new Date(filters.dateRange.to) : new Date(from);
      to.setHours(23, 59, 59, 999);
      
      filteredTasks = filteredTasks.filter(t => {
        if (!t.reminder_time) return false;
        const taskDate = new Date(t.reminder_time);
        return taskDate >= from && taskDate <= to;
      });
    }
    if (filters.createdBy && filters.createdBy !== 'all') {
      filteredTasks = filteredTasks.filter(t => t.created_by === filters.createdBy);
    }
    if (filters.tags && filters.tags.length > 0) {
      filteredTasks = filteredTasks.filter(t => 
        t.tags && filters.tags.every(tag => t.tags.includes(tag))
      );
    }

    const active = filteredTasks.filter((t) => t.status !== 'completed');
    const completed = filteredTasks.filter((t) => t.status === 'completed');

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

    // Smart 4-group classification: hard rules + AI scoring for "现在能做"
    const oneDayMs = 24 * 60 * 60 * 1000;
    const dueSoon = [];      // 即将截止: 已逾期 或 24h 内到期
    const fixedSchedule = []; // 固定安排: 重复任务 或 >24h 后的明确时间
    const candidates = [];    // 待评估候选 -> 现在能做 / 智能建议

    roots.forEach((task) => {
      const reminderTs = task.reminder_time ? new Date(task.reminder_time).getTime() : null;
      const diff = reminderTs !== null ? reminderTs - now.getTime() : null;
      const isRepeating = task.repeat_rule && task.repeat_rule !== 'none';

      if (reminderTs !== null && diff !== null && diff <= oneDayMs) {
        dueSoon.push(task);
      } else if (isRepeating || (reminderTs !== null && diff > oneDayMs)) {
        // 仍归入"固定安排",但同时也作为候选参与"现在能做"评估
        fixedSchedule.push(task);
        candidates.push(task);
      } else {
        candidates.push(task);
      }
    });

    // AI 评估打分: 重要 + 紧急 + 可简单完成 + 当前时间匹配
    const currentHour = now.getHours();
    const scoreTask = (task) => {
      let score = 0;
      // 1) 重要性 (优先级)
      const pri = task.priority || 'medium';
      score += pri === 'urgent' ? 40 : pri === 'high' ? 30 : pri === 'medium' ? 15 : 5;
      // AI 建议优先级加成
      const aiPri = task.ai_analysis?.suggested_priority;
      if (aiPri === 'urgent') score += 15;
      else if (aiPri === 'high') score += 10;
      // 2) 紧急度 (AI 风险等级)
      const risk = task.ai_analysis?.risk_level;
      if (risk === 'critical') score += 20;
      else if (risk === 'high') score += 12;
      else if (risk === 'medium') score += 6;
      // 3) 可简单完成 (耗时估算)
      const dur = task.estimated_duration;
      if (typeof dur === 'number') {
        if (dur <= 15) score += 20;
        else if (dur <= 30) score += 12;
        else if (dur <= 60) score += 5;
      } else {
        // 无估算时,短标题/描述视为轻量任务
        const len = (task.title || '').length + (task.description || '').length;
        if (len > 0 && len < 30) score += 8;
      }
      // 4) 当前时间匹配 (AI 推荐执行窗口 / 类别时段)
      const recStart = task.ai_analysis?.recommended_execution_start;
      const recEnd = task.ai_analysis?.recommended_execution_end;
      if (recStart) {
        const s = new Date(recStart).getTime();
        const e = recEnd ? new Date(recEnd).getTime() : s + 60 * 60 * 1000;
        if (now.getTime() >= s && now.getTime() <= e) score += 25;
        else if (Math.abs(now.getTime() - s) <= 2 * 60 * 60 * 1000) score += 10;
      } else {
        // 类别-时段启发式
        const cat = task.category;
        const isWorkHours = currentHour >= 9 && currentHour < 18;
        const isEvening = currentHour >= 18 && currentHour < 22;
        const isMorning = currentHour >= 6 && currentHour < 11;
        if ((cat === 'work' || cat === 'study') && isWorkHours) score += 10;
        if ((cat === 'family' || cat === 'shopping') && isEvening) score += 10;
        if (cat === 'health' && (isMorning || isEvening)) score += 10;
        if (cat === 'personal' || cat === 'other') score += 5;
      }
      return score;
    };

    const scored = candidates.map((t) => ({ task: t, score: scoreTask(t) }));
    scored.sort((a, b) => b.score - a.score);

    // 阈值降到 30 分,并保证至少有 Top 5 候选进入"现在能做"
    const NOW_THRESHOLD = 30;
    const MIN_NOW_COUNT = 5;
    const canDoNowSet = new Set();
    const smartSuggestion = [];
    scored.forEach(({ task, score }, idx) => {
      const hasAISuggestion = !!(
        task.ai_context_summary ||
        (task.ai_analysis && (
          (Array.isArray(task.ai_analysis.suggestions) && task.ai_analysis.suggestions.length > 0) ||
          task.ai_analysis.suggested_priority ||
          task.ai_analysis.recommended_execution_start
        ))
      );
      if (score >= NOW_THRESHOLD || idx < MIN_NOW_COUNT) {
        canDoNowSet.add(task.id);
      } else if (hasAISuggestion) {
        smartSuggestion.push(task);
      } else {
        canDoNowSet.add(task.id);
      }
    });
    const canDoNow = scored.filter(({ task }) => canDoNowSet.has(task.id)).map(({ task }) => task);

    // 去重: 已进入"现在能做"或"智能建议"的约定从"固定安排"中移除
    const smartSuggestionIds = new Set(smartSuggestion.map(t => t.id));
    const dedupedFixedSchedule = fixedSchedule.filter(t => !canDoNowSet.has(t.id) && !smartSuggestionIds.has(t.id));

    return {
      milestoneTasks: milestone,
      lifeTasks: life,
      completedTasks: completed,
      smartGroups: {
        canDoNow,
        dueSoon,
        smartSuggestion,
        fixedSchedule: dedupedFixedSchedule
      },
      stats: {
        pending: todayPendingCount,
        overdue: overdueCount,
        completedToday: completedTodayCount
      }
    };
  }, [allTasks, searchQuery, filters]);

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

  const toggleSelection = (taskId) => {
    setSelectedTaskIds(prev => 
      prev.includes(taskId) ? prev.filter(id => id !== taskId) : [...prev, taskId]
    );
  };

  const handleBulkDelete = async () => {
    if (selectedTaskIds.length === 0) return;
    // Simple confirm
    if (!window.confirm(`确定要删除选中的 ${selectedTaskIds.length} 个约定吗？`)) return;
    
    try {
        // Use parallel promises for faster deletion
        await Promise.all(selectedTaskIds.map(id => deleteTask(id)));
        setSelectedTaskIds([]);
        setIsSelectionMode(false);
    } catch (e) {
        console.error("Bulk delete failed", e);
    }
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
              onClick={() => setViewMode('overview')}
              className={cn(
                "px-6 py-2.5 rounded-full text-sm font-medium transition-all duration-300 flex items-center gap-2",
                viewMode === 'overview' ?
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

        {/* Toolbar: Search, View, Selection */}
        <div className="bg-white/80 backdrop-blur-md p-2 rounded-2xl shadow-sm border border-slate-200/60 mb-8 flex flex-col md:flex-row items-center justify-between gap-3 sticky top-4 z-20">
           {/* Search - local filter + press Enter to trigger global search */}
           <div className="relative w-full md:max-w-md group flex items-center">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-blue-500 transition-colors pointer-events-none" />
              <input 
                type="text" 
                placeholder="搜索约定..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && searchQuery.trim()) {
                    e.preventDefault();
                    setGlobalSearchOpen(true);
                  }
                }}
                className="w-full pl-9 pr-4 py-2 bg-transparent border-none rounded-xl text-sm focus:ring-0 transition-all placeholder:text-slate-400"
              />
           </div>

           {/* Controls */}
           <div className="flex items-center gap-2 w-full md:w-auto justify-end md:border-l md:border-slate-100 md:pl-3">
              {/* View Modes */}
              <div className="flex items-center bg-slate-100/50 p-1 rounded-xl mr-1">
                 <button 
                    onClick={() => setLayoutMode('list')}
                    className={cn(
                       "p-1.5 rounded-lg transition-all",
                       layoutMode === 'list' ? "bg-white shadow-sm text-blue-600" : "text-slate-400 hover:text-slate-600 hover:bg-slate-200/50"
                    )}
                    title="列表视图"
                 >
                    <List className="w-4 h-4" />
                 </button>
                 <button 
                    onClick={() => setLayoutMode('kanban')}
                    className={cn(
                       "p-1.5 rounded-lg transition-all",
                       layoutMode === 'kanban' ? "bg-white shadow-sm text-blue-600" : "text-slate-400 hover:text-slate-600 hover:bg-slate-200/50"
                    )}
                    title="看板视图"
                 >
                    <Kanban className="w-4 h-4" />
                 </button>
                 <button 
                    onClick={() => setLayoutMode('gantt')}
                    className={cn(
                       "p-1.5 rounded-lg transition-all",
                       layoutMode === 'gantt' ? "bg-white shadow-sm text-blue-600" : "text-slate-400 hover:text-slate-600 hover:bg-slate-200/50"
                    )}
                    title="甘特图"
                 >
                    <BarChart className="w-4 h-4" />
                 </button>
              </div>

              {/* Selection Toggle */}
              <button 
                 onClick={() => {
                    setIsSelectionMode(!isSelectionMode);
                    setSelectedTaskIds([]);
                 }}
                 className={cn(
                    "flex items-center justify-center w-9 h-9 rounded-xl transition-all border",
                    isSelectionMode 
                       ? "bg-blue-50 text-blue-600 border-blue-200" 
                       : "bg-transparent text-slate-500 border-transparent hover:bg-slate-50"
                 )}
                 title={isSelectionMode ? "取消选择" : "多选模式"}
              >
                 {isSelectionMode ? <X className="w-4 h-4" /> : <CheckSquare className="w-4 h-4" />}
              </button>

              {/* Filter Button */}
              <AdvancedTaskFilters 
                filters={filters} 
                onChange={setFilters} 
                onClear={() => setFilters({ category: 'all', priority: 'all', dateRange: undefined, createdBy: 'all', tags: [] })}
              >
                <button 
                  className={cn(
                    "flex items-center justify-center w-9 h-9 rounded-xl transition-all",
                    Object.values(filters).some(v => v !== 'all' && v !== undefined && (!Array.isArray(v) || v.length > 0))
                      ? "bg-blue-50 text-blue-600" 
                      : "text-slate-500 hover:bg-slate-50"
                  )} 
                  title="筛选"
                >
                   <Filter className="w-4 h-4" />
                </button>
              </AdvancedTaskFilters>
           </div>
        </div>

        {/* Content Area */}
        <div className="space-y-8">

          {/* Overview Mode: 4 Smart Groups */}
          {viewMode === 'overview' && (
            <div className="space-y-10">
              <SmartGroupSection
                title="现在能做"
                description="长期计划且当下可执行"
                icon={Zap}
                iconBg="bg-emerald-50"
                iconColor="text-emerald-600"
                tasks={smartGroups.canDoNow}
                emptyHint="暂无可立即执行的约定"
                getSubtasks={getSubtasks}
                commentCountMap={commentCountMap}
                isSelectionMode={isSelectionMode}
                selectedTaskIds={selectedTaskIds}
                onToggleSelection={toggleSelection}
                onToggleSubtask={handleToggleSubtask}
                onComplete={(task, status) => handleComplete(task, allTasks, status ? 'completed' : 'pending')}
                onEdit={(task) => { setSelectedTask(task); setSelectedTab(null); }}
                onShare={(task) => setSharingTask(task)}
                onViewTab={(task, tab) => { setSelectedTask(task); setSelectedTab(tab); }}
                onUpdateTask={(t, patch) => updateTaskAsync({ id: t.id, data: patch })}
              />

              <SmartGroupSection
                title="即将截止"
                description="24 小时内到期或已逾期"
                icon={AlarmClock}
                iconBg="bg-rose-50"
                iconColor="text-rose-600"
                tasks={smartGroups.dueSoon}
                emptyHint="暂无紧急到期的约定"
                getSubtasks={getSubtasks}
                commentCountMap={commentCountMap}
                isSelectionMode={isSelectionMode}
                selectedTaskIds={selectedTaskIds}
                onToggleSelection={toggleSelection}
                onToggleSubtask={handleToggleSubtask}
                onComplete={(task, status) => handleComplete(task, allTasks, status ? 'completed' : 'pending')}
                onEdit={(task) => { setSelectedTask(task); setSelectedTab(null); }}
                onShare={(task) => setSharingTask(task)}
                onViewTab={(task, tab) => { setSelectedTask(task); setSelectedTab(tab); }}
                onUpdateTask={(t, patch) => updateTaskAsync({ id: t.id, data: patch })}
              />

              <SmartGroupSection
                title="智能建议"
                description="哨兵 AI 已生成执行建议或上下文摘要"
                icon={Lightbulb}
                iconBg="bg-amber-50"
                iconColor="text-amber-600"
                tasks={smartGroups.smartSuggestion}
                emptyHint="暂无 AI 智能建议"
                getSubtasks={getSubtasks}
                commentCountMap={commentCountMap}
                isSelectionMode={isSelectionMode}
                selectedTaskIds={selectedTaskIds}
                onToggleSelection={toggleSelection}
                onToggleSubtask={handleToggleSubtask}
                onComplete={(task, status) => handleComplete(task, allTasks, status ? 'completed' : 'pending')}
                onEdit={(task) => { setSelectedTask(task); setSelectedTab(null); }}
                onShare={(task) => setSharingTask(task)}
                onViewTab={(task, tab) => { setSelectedTask(task); setSelectedTab(tab); }}
                onUpdateTask={(t, patch) => updateTaskAsync({ id: t.id, data: patch })}
              />

              <SmartGroupSection
                title="固定安排"
                description="有明确未来时间或周期重复的约定"
                icon={CalendarClock}
                iconBg="bg-blue-50"
                iconColor="text-blue-600"
                tasks={smartGroups.fixedSchedule}
                emptyHint="暂无固定时间安排"
                getSubtasks={getSubtasks}
                commentCountMap={commentCountMap}
                isSelectionMode={isSelectionMode}
                selectedTaskIds={selectedTaskIds}
                onToggleSelection={toggleSelection}
                onToggleSubtask={handleToggleSubtask}
                onComplete={(task, status) => handleComplete(task, allTasks, status ? 'completed' : 'pending')}
                onEdit={(task) => { setSelectedTask(task); setSelectedTab(null); }}
                onShare={(task) => setSharingTask(task)}
                onViewTab={(task, tab) => { setSelectedTask(task); setSelectedTab(tab); }}
                onUpdateTask={(t, patch) => updateTaskAsync({ id: t.id, data: patch })}
              />
            </div>
          )}

          {/* Milestone Section */}
          {viewMode === 'milestone' && milestoneTasks.length > 0 &&
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              {milestoneTasks.map((task) =>
            <MilestoneCard
              key={task.id}
              task={task}
              subtasks={getSubtasks(task.id)}
              commentCount={commentCountMap[task.id] || 0}
              isSelectionMode={isSelectionMode}
              isSelected={selectedTaskIds.includes(task.id)}
              onToggleSelection={() => toggleSelection(task.id)}
              onToggleSubtask={handleToggleSubtask}
              onUpdateStatus={handleUpdateStatus}
              onAddSubtask={() => {
                setSelectedTask(task);
                setSelectedTab(null);
              }}
              onUpdate={(task, data) => updateTaskAsync({ id: task.id, data })}
              onDelete={(task) => deleteTask(task.id)}
              onEdit={() => setEditingTask(task)}
              onShare={(task) => setSharingTask(task)}
              onView={() => { setSelectedTask(task); setSelectedTab(null); }}
              onViewTab={(tab) => { setSelectedTask(task); setSelectedTab(tab); }} />
            )}
            </div>
          }

          {/* Life Section */}
          {viewMode === 'life' && lifeTasks.length > 0 &&
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
                    subtasks={getSubtasks(task.id)}
                    commentCount={commentCountMap[task.id] || 0}
                    isSelectionMode={isSelectionMode}
                    isSelected={selectedTaskIds.includes(task.id)}
                    onToggleSelection={() => toggleSelection(task.id)}
                    onToggleSubtask={handleToggleSubtask}
                    onComplete={(task, status) => handleComplete(task, allTasks, status ? 'completed' : 'pending')}
                    onEdit={() => { setSelectedTask(task); setSelectedTab(null); }}
                    onShare={() => setSharingTask(task)}
                    onViewTab={(tab) => { setSelectedTask(task); setSelectedTab(tab); }}
                    onUpdateTask={(t, patch) => updateTaskAsync({ id: t.id, data: patch })}
                  />
                )}
              </div>
            </div>
          }

          {/* 已完成约定 - 点击展开 */}
          <div className="mt-8 pt-8 border-t border-stone-200">
            <button
              onClick={() => setShowCompleted(!showCompleted)}
              className="w-full flex items-center justify-between gap-3 p-4 rounded-2xl bg-white border border-slate-200 hover:border-[#c7d2fe] hover:bg-[#eef2ff]/40 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#384877] to-[#3b5aa2] flex items-center justify-center shadow-sm">
                  <ArchiveIcon className="w-5 h-5 text-white" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-semibold text-slate-800">已完成约定 ({completedTasks.length})</p>
                  <p className="text-xs text-slate-500 mt-0.5">点击查看父约定与子约定记录</p>
                </div>
              </div>
              <ChevronDown className={cn("w-5 h-5 text-slate-400 group-hover:text-[#384877] transition-transform", showCompleted && "rotate-180")} />
            </button>

            {showCompleted && completedTasks.length > 0 && (() => {
              // 按完成时间倒序（无 completed_at 排到最后）
              const byCompletedDesc = (a, b) => {
                const ta = a.completed_at ? new Date(a.completed_at).getTime() : 0;
                const tb = b.completed_at ? new Date(b.completed_at).getTime() : 0;
                return tb - ta;
              };

              const parents = completedTasks.filter(t => !t.parent_task_id).sort(byCompletedDesc);
              const subs = completedTasks.filter(t => t.parent_task_id);
              const taskById = new Map(allTasks.map(t => [t.id, t]));

              // 把已完成子约定按 parent_task_id 分组，并在组内按完成时间倒序
              const subsByParent = new Map();
              subs.forEach(s => {
                if (!subsByParent.has(s.parent_task_id)) subsByParent.set(s.parent_task_id, []);
                subsByParent.get(s.parent_task_id).push(s);
              });
              subsByParent.forEach(list => list.sort(byCompletedDesc));

              // 父级不在已完成列表中（但有已完成子约定）的孤儿子约定
              const orphanGroups = [];
              subsByParent.forEach((list, pid) => {
                const parentInCompleted = parents.some(p => p.id === pid);
                if (!parentInCompleted) {
                  orphanGroups.push({ parent: taskById.get(pid), subs: list });
                }
              });

              const toggleParent = (pid) => {
                setExpandedParents(prev => {
                  const next = new Set(prev);
                  if (next.has(pid)) next.delete(pid); else next.add(pid);
                  return next;
                });
              };

              const renderSubRow = (task) => (
                <div
                  key={task.id}
                  className="flex items-start gap-3 p-3 rounded-xl border bg-slate-50/60 border-slate-100"
                >
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md border font-medium flex-shrink-0 bg-slate-100 text-slate-500 border-slate-200">
                        子约定
                      </span>
                      <p className="text-sm text-slate-700 font-medium line-through decoration-slate-300 truncate">
                        {task.title}
                      </p>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {task.completed_at ? `完成于 ${new Date(task.completed_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : '已完成'}
                    </p>
                  </div>
                </div>
              );

              const renderParentRow = (parent, childCount, isExpanded) => {
                const hasChildren = childCount > 0;
                return (
                  <button
                    type="button"
                    onClick={() => hasChildren && toggleParent(parent.id)}
                    className={cn(
                      "w-full flex items-start gap-3 p-3 rounded-xl border bg-white border-slate-200 text-left transition-colors",
                      hasChildren ? "hover:border-[#c7d2fe] hover:bg-[#eef2ff]/30 cursor-pointer" : "cursor-default"
                    )}
                  >
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md border font-medium flex-shrink-0 bg-[#eef2ff] text-[#384877] border-[#c7d2fe]">
                          父约定
                        </span>
                        <p className="text-sm text-slate-700 font-medium line-through decoration-slate-300 truncate">
                          {parent.title}
                        </p>
                        {hasChildren && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-500 flex-shrink-0">
                            {childCount} 个子约定
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {parent.completed_at ? `完成于 ${new Date(parent.completed_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : '已完成'}
                      </p>
                    </div>
                    {hasChildren && (
                      <ChevronDown className={cn(
                        "w-4 h-4 text-slate-400 flex-shrink-0 mt-1 transition-transform",
                        isExpanded && "rotate-180"
                      )} />
                    )}
                  </button>
                );
              };

              return (
                <div className="mt-4 space-y-3 animate-in fade-in">
                  {parents.map(parent => {
                    const childList = subsByParent.get(parent.id) || [];
                    const isExpanded = expandedParents.has(parent.id);
                    return (
                      <div key={parent.id} className="space-y-2">
                        {renderParentRow(parent, childList.length, isExpanded)}
                        {isExpanded && childList.length > 0 && (
                          <div className="ml-6 pl-3 border-l-2 border-slate-200 space-y-2 animate-in fade-in slide-in-from-top-1">
                            {childList.map(s => renderSubRow(s))}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {orphanGroups.length > 0 && (
                    <div className="pt-2 space-y-3">
                      {orphanGroups.map(({ parent, subs: list }, idx) => (
                        <div key={parent?.id || `orphan-${idx}`} className="space-y-2">
                          <p className="text-xs text-slate-400 px-1">
                            属于：{parent?.title || "（父约定已删除）"}
                          </p>
                          <div className="ml-6 pl-3 border-l-2 border-slate-200 space-y-2">
                            {list.map(s => renderSubRow(s))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

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
        onClose={() => { setSelectedTask(null); setSelectedTab(null); }}
        initialTab={selectedTab} />

      {/* Edit Task Dialog */}
      <Dialog open={!!editingTask} onOpenChange={(open) => !open && setEditingTask(null)}>
        <DialogContent className="max-w-3xl p-0 max-h-[90vh] overflow-y-auto bg-transparent border-0 shadow-none scrollbar-hide">
          {editingTask && (
            <TaskCreationPanel 
              initialData={editingTask}
              onAddTask={async (data) => {
                await updateTaskAsync({ id: editingTask.id, data });
                setEditingTask(null);
              }}
              onCancel={() => setEditingTask(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Global Search */}
      <GlobalSearch open={globalSearchOpen} onOpenChange={setGlobalSearchOpen} initialQuery={searchQuery} />

      {/* Share Task Card */}
      {sharingTask && (
        <TaskShareCard 
          task={sharingTask} 
          open={!!sharingTask} 
          onClose={() => setSharingTask(null)} 
        />
      )}

      {/* Bulk Selection Action Bar */}
      <AnimatePresence>
        {isSelectionMode && selectedTaskIds.length > 0 && (
          <motion.div 
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-white rounded-2xl shadow-xl border border-slate-200 p-2 flex items-center gap-4 px-6"
          >
             <span className="text-sm font-medium text-slate-700">{selectedTaskIds.length} 个已选择</span>
             <div className="h-4 w-px bg-slate-200"></div>
             <button 
               onClick={handleBulkDelete}
               className="flex items-center gap-1.5 text-sm text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors"
             >
                <Trash2 className="w-4 h-4" />
                <span>删除</span>
             </button>
             {/* Add more bulk actions here if needed */}
          </motion.div>
        )}
      </AnimatePresence>
    </div>);

}