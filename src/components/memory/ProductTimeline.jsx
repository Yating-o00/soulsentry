import React, { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import {
  CheckCircle2, Clock, StickyNote, ListTodo, Brain,
  AlertTriangle, Zap, ArrowRight, Check, RotateCcw
} from "lucide-react";
import moment from "moment";

const EVENT_CONFIG = {
  task_completed: { label: "完成约定", icon: CheckCircle2, color: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700" },
  task_created: { label: "创建约定", icon: ListTodo, color: "bg-[#384877]", badge: "bg-blue-50 text-blue-700" },
  task_overdue: { label: "逾期约定", icon: AlertTriangle, color: "bg-red-500", badge: "bg-red-50 text-red-700" },
  note_created: { label: "新建心签", icon: StickyNote, color: "bg-amber-500", badge: "bg-amber-50 text-amber-700" },
  execution: { label: "AI执行", icon: Zap, color: "bg-purple-500", badge: "bg-purple-50 text-purple-700" },
};

const CATEGORY_MAP = {
  work: "工作", personal: "个人", health: "健康", study: "学习",
  family: "家庭", shopping: "购物", finance: "理财", other: "其他"
};

function TimelineItem({ event, onCompleteTask, onReopenTask }) {
  const config = EVENT_CONFIG[event.type] || EVENT_CONFIG.task_created;
  const Icon = config.icon;

  return (
    <div className="relative flex gap-3 md:gap-4">
      <div className="flex flex-col items-center">
        <div className={`w-7 h-7 rounded-full ${config.color} flex items-center justify-center text-white shadow-sm z-10 flex-shrink-0`}>
          <Icon className="w-3.5 h-3.5" />
        </div>
        <div className="w-0.5 flex-1 bg-gradient-to-b from-slate-200 to-slate-100 mt-1" />
      </div>
      <motion.div
        initial={{ opacity: 0, x: -6 }}
        animate={{ opacity: 1, x: 0 }}
        className="flex-1 mb-3 pb-1"
      >
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow p-3">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] text-slate-400">
                {moment(event.date).format("M月D日 HH:mm")}
              </span>
              <Badge className={`${config.badge} text-[10px] font-medium border-0 px-1.5 py-0`}>
                {config.label}
              </Badge>
              {event.category && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">{event.category}</Badge>
              )}
            </div>
            {/* Quick task actions */}
            {event.type === "task_overdue" && onCompleteTask && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-[10px] text-emerald-600 hover:bg-emerald-50 gap-1"
                onClick={() => onCompleteTask(event.sourceTask)}
              >
                <Check className="w-3 h-3" /> 完成
              </Button>
            )}
            {event.type === "task_created" && event.sourceTask?.status === "pending" && onCompleteTask && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-[10px] text-emerald-600 hover:bg-emerald-50 gap-1"
                onClick={() => onCompleteTask(event.sourceTask)}
              >
                <Check className="w-3 h-3" /> 完成
              </Button>
            )}
            {event.type === "task_completed" && onReopenTask && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-[10px] text-slate-400 hover:bg-slate-50 gap-1"
                onClick={() => onReopenTask(event.sourceTask)}
              >
                <RotateCcw className="w-3 h-3" /> 恢复
              </Button>
            )}
          </div>
          <h4 className="text-sm font-semibold text-slate-800 leading-snug">{event.title}</h4>
          {event.description && (
            <p className="text-xs text-slate-500 mt-1 line-clamp-2">{event.description}</p>
          )}
          {event.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {event.tags.slice(0, 3).map((tag, i) => (
                <span key={i} className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{tag}</span>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

export default function ProductTimeline({ tasks, notes, executions, onCompleteTask, onReopenTask }) {
  const [limit, setLimit] = useState(30);
  const [typeFilter, setTypeFilter] = useState("all");

  const allEvents = useMemo(() => {
    const events = [];
    const now = new Date();

    tasks?.forEach(t => {
      if (t.deleted_at) return;
      // Completed
      if (t.status === "completed" && t.completed_at) {
        events.push({
          type: "task_completed", date: t.completed_at, title: t.title,
          description: t.description, category: CATEGORY_MAP[t.category] || t.category,
          priority: t.priority, tags: t.tags, sourceId: t.id, sourceTask: t,
        });
      }
      // Created (last 30 days)
      if (t.created_date && moment().diff(moment(t.created_date), "days") <= 30) {
        events.push({
          type: "task_created", date: t.created_date, title: t.title,
          description: t.description, category: CATEGORY_MAP[t.category] || t.category,
          priority: t.priority, tags: t.tags, sourceId: t.id, sourceTask: t,
        });
      }
      // Overdue
      if (t.status === "pending" && t.reminder_time && new Date(t.reminder_time) < now) {
        events.push({
          type: "task_overdue", date: t.reminder_time, title: `⚠ ${t.title}`,
          description: "逾期约定，可在此处直接完成", category: CATEGORY_MAP[t.category] || t.category,
          priority: t.priority, sourceId: t.id, sourceTask: t,
        });
      }
    });

    notes?.forEach(n => {
      if (n.deleted_at) return;
      if (moment().diff(moment(n.created_date), "days") <= 60) {
        const plain = n.plain_text || (n.content || "").replace(/<[^>]*>/g, "").slice(0, 100);
        events.push({
          type: "note_created", date: n.created_date,
          title: n.ai_analysis?.summary || plain.slice(0, 40) || "心签",
          description: plain.slice(0, 100), tags: n.tags, sourceId: n.id,
        });
      }
    });

    executions?.forEach(ex => {
      if (ex.execution_status === "completed" || ex.execution_status === "failed") {
        events.push({
          type: "execution", date: ex.completed_at || ex.created_date,
          title: ex.task_title, description: ex.ai_parsed_result?.summary,
          category: ex.category === "promise" ? "约定" : ex.category === "note" ? "心签" : "任务",
          sourceId: ex.id,
        });
      }
    });

    events.sort((a, b) => new Date(b.date) - new Date(a.date));
    return events;
  }, [tasks, notes, executions]);

  const filteredEvents = useMemo(() => {
    let list = allEvents;
    if (typeFilter !== "all") list = list.filter(e => e.type === typeFilter);
    return list.slice(0, limit);
  }, [allEvents, typeFilter, limit]);

  const FILTERS = [
    { value: "all", label: "全部" },
    { value: "task_completed", label: "完成" },
    { value: "task_created", label: "创建" },
    { value: "task_overdue", label: "逾期" },
    { value: "note_created", label: "心签" },
  ];

  const stats = useMemo(() => {
    const last7 = allEvents.filter(e => moment().diff(moment(e.date), "days") <= 7);
    return {
      total: allEvents.length,
      week: last7.length,
      completed: allEvents.filter(e => e.type === "task_completed").length,
      overdue: allEvents.filter(e => e.type === "task_overdue").length,
    };
  }, [allEvents]);

  return (
    <div className="space-y-3">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "总记录", value: stats.total, color: "text-[#384877]" },
          { label: "本周", value: stats.week, color: "text-blue-600" },
          { label: "已完成", value: stats.completed, color: "text-emerald-600" },
          { label: "逾期", value: stats.overdue, color: "text-red-500" },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl p-2.5 border border-slate-100 text-center">
            <div className={`text-lg font-bold ${s.color}`}>{s.value}</div>
            <div className="text-[10px] text-slate-400">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filter chips */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
        {FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => setTypeFilter(f.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              typeFilter === f.value ? "bg-[#384877] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Timeline */}
      <div className="pl-0.5">
        {filteredEvents.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <Brain className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm">暂无活动记录</p>
            <p className="text-xs mt-1">在约定、心签中操作后，数据自动汇聚至此</p>
          </div>
        ) : (
          <>
            {filteredEvents.map((event, idx) => (
              <TimelineItem
                key={`${event.type}-${event.sourceId}-${idx}`}
                event={event}
                onCompleteTask={onCompleteTask}
                onReopenTask={onReopenTask}
              />
            ))}
            {allEvents.length > limit && (
              <button
                onClick={() => setLimit(l => l + 30)}
                className="w-full py-2.5 text-sm text-[#384877] hover:bg-slate-50 rounded-xl transition-colors"
              >
                加载更多...
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}