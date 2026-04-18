import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import {
  ListTodo, StickyNote, Bell, Zap, CheckCircle2,
  Clock, AlertTriangle, ChevronDown, ChevronUp,
  Calendar, ArrowRight, Tag
} from "lucide-react";
import moment from "moment";

const SOURCE_CONFIG = {
  task: { label: "约定", icon: ListTodo, color: "bg-blue-500", badgeColor: "bg-blue-50 text-blue-600" },
  task_completed: { label: "完成", icon: CheckCircle2, color: "bg-emerald-500", badgeColor: "bg-emerald-50 text-emerald-600" },
  task_overdue: { label: "逾期", icon: AlertTriangle, color: "bg-red-500", badgeColor: "bg-red-50 text-red-600" },
  note: { label: "心签", icon: StickyNote, color: "bg-purple-500", badgeColor: "bg-purple-50 text-purple-600" },
  notification: { label: "通知", icon: Bell, color: "bg-amber-500", badgeColor: "bg-amber-50 text-amber-600" },
  execution: { label: "执行", icon: Zap, color: "bg-indigo-500", badgeColor: "bg-indigo-50 text-indigo-600" },
};

const PRIORITY_LABELS = { urgent: "紧急", high: "高", medium: "中", low: "低" };
const PRIORITY_COLORS = { urgent: "text-red-600 bg-red-50", high: "text-orange-600 bg-orange-50", medium: "text-blue-600 bg-blue-50", low: "text-slate-500 bg-slate-50" };

function ActivityItem({ item, isLast }) {
  const [expanded, setExpanded] = useState(false);
  const config = SOURCE_CONFIG[item.type] || SOURCE_CONFIG.task;
  const Icon = config.icon;

  return (
    <div className="relative flex gap-3 md:gap-4">
      <div className="flex flex-col items-center">
        <div className={`w-8 h-8 rounded-full ${config.color} ring-4 ring-white shadow-sm z-10 flex-shrink-0 flex items-center justify-center`}>
          <Icon className="w-4 h-4 text-white" />
        </div>
        {!isLast && <div className="w-0.5 flex-1 bg-gradient-to-b from-slate-200 to-slate-100 mt-1" />}
      </div>

      <motion.div
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        className="flex-1 mb-4 min-w-0"
      >
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow p-3 md:p-4">
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className="flex items-center gap-1.5 flex-wrap min-w-0">
              <span className="text-xs text-slate-400">
                {moment(item.date).format("M/D HH:mm")}
              </span>
              <Badge className={`${config.badgeColor} text-[10px] font-medium border-0 px-1.5 py-0`}>
                {config.label}
              </Badge>
              {item.priority && (
                <Badge className={`${PRIORITY_COLORS[item.priority] || ""} text-[10px] border-0 px-1.5 py-0`}>
                  {PRIORITY_LABELS[item.priority]}
                </Badge>
              )}
            </div>
            {item.category && (
              <span className="text-[10px] text-slate-400 whitespace-nowrap">{item.category}</span>
            )}
          </div>

          <h4 className="text-sm font-semibold text-slate-800 leading-snug truncate">{item.title}</h4>
          
          {item.description && (
            <p className="text-xs text-slate-500 mt-1 line-clamp-2">{item.description}</p>
          )}

          {/* Tags */}
          {item.tags?.length > 0 && (
            <div className="flex gap-1 mt-2 flex-wrap">
              {item.tags.slice(0, 4).map((t, i) => (
                <span key={i} className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
                  {t}
                </span>
              ))}
            </div>
          )}

          {/* Link to source */}
          {item.linkTo && (
            <Link
              to={item.linkTo}
              className="inline-flex items-center gap-1 text-[11px] text-[#384877] font-medium mt-2 hover:underline"
            >
              查看详情 <ArrowRight className="w-3 h-3" />
            </Link>
          )}
        </div>
      </motion.div>
    </div>
  );
}

export default function ProductActivityFeed({ tasks, notes, executions, notifications }) {
  const [typeFilter, setTypeFilter] = useState("all");
  const [showCount, setShowCount] = useState(30);

  // Merge all product data into a unified timeline
  const allActivities = useMemo(() => {
    const items = [];

    // Tasks
    tasks?.forEach(t => {
      if (t.deleted_at) return;
      const isCompleted = t.status === "completed";
      const isOverdue = !isCompleted && t.reminder_time && new Date(t.reminder_time) < new Date();
      
      items.push({
        id: `task-${t.id}`,
        type: isCompleted ? "task_completed" : isOverdue ? "task_overdue" : "task",
        title: t.title,
        description: t.description,
        date: isCompleted ? (t.completed_at || t.updated_date) : (t.reminder_time || t.created_date),
        priority: t.priority,
        category: { work: "工作", personal: "个人", health: "健康", study: "学习", family: "家庭", shopping: "购物", finance: "理财" }[t.category] || t.category,
        tags: t.tags,
        linkTo: "/Tasks",
      });
    });

    // Notes
    notes?.forEach(n => {
      if (n.deleted_at) return;
      items.push({
        id: `note-${n.id}`,
        type: "note",
        title: n.ai_analysis?.summary || n.plain_text?.slice(0, 60) || "心签",
        description: n.plain_text?.slice(0, 100),
        date: n.created_date,
        tags: n.tags,
        linkTo: `/Notes?noteId=${n.id}`,
      });
    });

    // Executions
    executions?.forEach(e => {
      items.push({
        id: `exec-${e.id}`,
        type: "execution",
        title: e.task_title || "AI 执行",
        description: e.original_input?.slice(0, 100),
        date: e.created_date,
        category: { promise: "约定", task: "任务", note: "心签" }[e.category] || e.category,
        linkTo: "/Notifications",
      });
    });

    // Notifications
    notifications?.forEach(n => {
      items.push({
        id: `notif-${n.id}`,
        type: "notification",
        title: n.title,
        description: n.content?.slice(0, 100),
        date: n.created_date,
        linkTo: "/Notifications",
      });
    });

    return items.sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [tasks, notes, executions, notifications]);

  const filtered = useMemo(() => {
    if (typeFilter === "all") return allActivities;
    return allActivities.filter(a => a.type === typeFilter || a.type.startsWith(typeFilter));
  }, [allActivities, typeFilter]);

  const displayed = filtered.slice(0, showCount);

  const FILTERS = [
    { value: "all", label: "全部" },
    { value: "task", label: "约定" },
    { value: "note", label: "心签" },
    { value: "execution", label: "执行" },
    { value: "notification", label: "通知" },
  ];

  // Stats
  const stats = useMemo(() => {
    const last7 = allActivities.filter(a => moment().diff(moment(a.date), "days") <= 7);
    const taskCount = last7.filter(a => a.type.startsWith("task")).length;
    const noteCount = last7.filter(a => a.type === "note").length;
    const execCount = last7.filter(a => a.type === "execution").length;
    return { total: last7.length, taskCount, noteCount, execCount };
  }, [allActivities]);

  return (
    <div className="space-y-4">
      {/* Weekly stats */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "7日活动", value: stats.total, color: "text-[#384877]" },
          { label: "约定", value: stats.taskCount, color: "text-blue-600" },
          { label: "心签", value: stats.noteCount, color: "text-purple-600" },
          { label: "AI执行", value: stats.execCount, color: "text-indigo-600" },
        ].map((s, i) => (
          <div key={i} className="bg-white rounded-xl p-2.5 border border-slate-100 text-center">
            <div className={`text-lg font-bold ${s.color}`}>{s.value}</div>
            <div className="text-[10px] text-slate-400">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
        {FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => setTypeFilter(f.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              typeFilter === f.value
                ? "bg-[#384877] text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Timeline */}
      <div className="pl-1">
        {displayed.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <Clock className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm">暂无活动记录</p>
            <p className="text-xs mt-1">在约定、心签中添加内容后，这里会自动汇聚</p>
          </div>
        ) : (
          <>
            {displayed.map((item, idx) => (
              <ActivityItem key={item.id} item={item} isLast={idx === displayed.length - 1} />
            ))}
            {filtered.length > showCount && (
              <button
                onClick={() => setShowCount(c => c + 30)}
                className="w-full text-center py-3 text-xs text-[#384877] font-medium hover:bg-slate-50 rounded-xl transition-colors"
              >
                加载更多 ({filtered.length - showCount} 条)
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}