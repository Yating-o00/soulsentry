import React, { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import {
  CheckCircle2, Clock, StickyNote, ListTodo, Brain,
  Zap, AlertTriangle, ArrowRight, Star, Heart, Users, Briefcase, BookOpen, ShoppingCart, Wallet, Home
} from "lucide-react";
import moment from "moment";

const EVENT_CONFIG = {
  task_completed: { label: "完成约定", icon: CheckCircle2, color: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700" },
  task_created: { label: "创建约定", icon: ListTodo, color: "bg-[#384877]", badge: "bg-blue-50 text-blue-700" },
  task_overdue: { label: "逾期约定", icon: AlertTriangle, color: "bg-red-500", badge: "bg-red-50 text-red-700" },
  note_created: { label: "新建心签", icon: StickyNote, color: "bg-amber-500", badge: "bg-amber-50 text-amber-700" },
  execution: { label: "AI执行", icon: Zap, color: "bg-purple-500", badge: "bg-purple-50 text-purple-700" },
};

const MEMORY_TYPE_CONFIG = {
  work: { label: "工作记忆", gradient: "bg-gradient-to-r from-purple-500 to-indigo-500" },
  personal: { label: "个人记忆", gradient: "bg-gradient-to-r from-blue-400 to-cyan-400" },
  health: { label: "健康记忆", gradient: "bg-gradient-to-r from-emerald-400 to-teal-400" },
  study: { label: "学习记忆", gradient: "bg-gradient-to-r from-indigo-400 to-violet-400" },
  family: { label: "家庭记忆", gradient: "bg-gradient-to-r from-pink-400 to-rose-400" },
  shopping: { label: "购物记忆", gradient: "bg-gradient-to-r from-orange-400 to-amber-400" },
  finance: { label: "理财记忆", gradient: "bg-gradient-to-r from-yellow-400 to-orange-400" },
  other: { label: "日常记忆", gradient: "bg-gradient-to-r from-slate-400 to-slate-500" },
};

const CATEGORY_MAP = {
  work: "工作", personal: "个人", health: "健康", study: "学习",
  family: "家庭", shopping: "购物", finance: "理财", other: "其他"
};

// Infer emotion from task context
function inferEmotion(event) {
  if (event.type === "task_completed") return { label: "积极", icon: Star, color: "text-yellow-500" };
  if (event.type === "task_overdue") return { label: "焦虑", icon: AlertTriangle, color: "text-red-400" };
  if (event.rawCategory === "family") return { label: "温暖", icon: Heart, color: "text-green-500" };
  if (event.rawCategory === "health") return { label: "关注", icon: Heart, color: "text-emerald-500" };
  return null;
}

function TimelineItem({ event, relationships }) {
  const config = EVENT_CONFIG[event.type] || EVENT_CONFIG.task_created;
  const Icon = config.icon;
  const memoryType = MEMORY_TYPE_CONFIG[event.rawCategory] || MEMORY_TYPE_CONFIG.other;
  const emotion = inferEmotion(event);

  // Match related people from relationships
  const combinedText = ((event.title || "") + " " + (event.description || "")).toLowerCase();
  const relatedPeople = (relationships || []).filter(r => {
    const name = (r.name || "").toLowerCase();
    const nick = (r.nickname || "").toLowerCase();
    return (name && combinedText.includes(name)) || (nick && combinedText.includes(nick));
  });

  // Build inline insight
  const insightParts = [];
  relatedPeople.forEach(r => {
    if (r.interaction_count > 1) {
      insightParts.push(`这是您第${r.interaction_count}次与${r.nickname || r.name}相关的事项`);
    }
    if (r.last_interaction_date) {
      const days = moment().diff(moment(r.last_interaction_date), "days");
      if (days > (r.contact_frequency_days || 30)) {
        insightParts.push(`已${days}天未联系${r.name}，建议尽快互动`);
      }
    }
    if (r.notes) insightParts.push(r.notes);
    const unreturned = (r.favors || []).filter(f => f.type === "received");
    if (unreturned.length > 0) {
      insightParts.push(`人情待回：${unreturned[0].description}`);
    }
  });
  const insightText = insightParts.length > 0 ? insightParts.join("。") + "。" : null;

  // People tags
  const peopleTags = relatedPeople.map(r => ({
    name: r.name,
    type: r.relationship_type === "client" ? "客户" :
          r.relationship_type === "colleague" ? "同事" :
          r.relationship_type === "friend" ? "朋友" :
          r.relationship_type === "family" ? "家人" :
          r.relationship_type === "boss" ? "上级" : "联系人",
    color: r.relationship_type === "client" ? "bg-purple-50 text-purple-700" :
           r.relationship_type === "colleague" ? "bg-blue-50 text-blue-700" :
           r.relationship_type === "friend" ? "bg-pink-50 text-pink-700" :
           r.relationship_type === "family" ? "bg-rose-50 text-rose-700" :
           r.relationship_type === "boss" ? "bg-slate-50 text-slate-700" : "bg-gray-50 text-gray-700",
  }));

  return (
    <div className="relative flex gap-3 md:gap-5">
      <div className="flex flex-col items-center">
        <div className={`w-8 h-8 rounded-full ${config.color} flex items-center justify-center text-white shadow-sm z-10 flex-shrink-0`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="w-0.5 flex-1 bg-gradient-to-b from-slate-200 to-slate-100 mt-1" />
      </div>
      <motion.div
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        className="flex-1 mb-4 pb-2"
      >
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow p-4 md:p-5">
          {/* Header: date + memory type badge + emotion */}
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-slate-400 font-medium">
                {moment(event.date).format("YYYY年M月D日")}
              </span>
              <span className={`${memoryType.gradient} px-2 py-0.5 rounded-full text-[10px] text-white font-medium`}>
                {memoryType.label}
              </span>
            </div>
            {emotion && (
              <div className={`flex items-center gap-1 ${emotion.color}`}>
                <emotion.icon className="w-3.5 h-3.5 fill-current" />
                <span className="text-xs">{emotion.label}</span>
              </div>
            )}
          </div>

          {/* Title */}
          <h4 className="text-sm font-bold text-slate-800 leading-snug mb-1.5">{event.title}</h4>
          
          {/* Description */}
          {event.description && (
            <p className="text-xs text-slate-500 mb-3 line-clamp-2 leading-relaxed">{event.description}</p>
          )}

          {/* People & Context Tags */}
          {(peopleTags.length > 0 || event.tags?.length > 0 || event.category) && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {peopleTags.map((p, i) => (
                <span key={i} className={`px-2.5 py-1 rounded-full text-xs font-medium ${p.color}`}>
                  {p.name}（{p.type}）
                </span>
              ))}
              {event.category && (
                <span className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium">
                  分类：{event.category}
                </span>
              )}
              {event.tags?.slice(0, 3).map((tag, i) => (
                <span key={i} className="px-2.5 py-1 bg-green-50 text-green-700 rounded-full text-xs font-medium">
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Inline Memory Insight */}
          {insightText && (
            <div className="p-3 bg-indigo-50 rounded-xl border border-indigo-100">
              <p className="text-xs text-indigo-800 leading-relaxed">
                <strong className="text-indigo-900">记忆洞察：</strong>{insightText}
              </p>
            </div>
          )}

          {/* Relationship / Favor Warning */}
          {relatedPeople.some(r => {
            const days = r.last_interaction_date ? moment().diff(moment(r.last_interaction_date), "days") : 0;
            return days > (r.contact_frequency_days || 30);
          }) && (
            <div className="mt-2 p-3 bg-amber-50 rounded-xl border border-amber-200">
              <div className="flex items-start gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-amber-700 leading-relaxed">
                  <strong className="text-amber-800">人情追踪：</strong>
                  {relatedPeople.filter(r => {
                    const days = r.last_interaction_date ? moment().diff(moment(r.last_interaction_date), "days") : 0;
                    return days > (r.contact_frequency_days || 30);
                  }).map(r => {
                    const days = moment().diff(moment(r.last_interaction_date), "days");
                    const favors = (r.favors || []).filter(f => f.type === "received");
                    let msg = `已${days}天未联系${r.name}，建议：1) 发送问候`;
                    if (favors.length > 0) msg += ` 2) 回请（上次${favors[0].description}）`;
                    return msg;
                  }).join("；")}
                </p>
              </div>
            </div>
          )}

          {/* Link */}
          {event.link && !insightText && (
            <Link to={event.link} className="inline-flex items-center gap-1 text-[11px] text-[#384877] mt-2 hover:underline font-medium">
              查看详情 <ArrowRight className="w-3 h-3" />
            </Link>
          )}
        </div>
      </motion.div>
    </div>
  );
}

export default function ProductTimeline({ tasks, notes, executions, relationships }) {
  const [limit, setLimit] = useState(30);
  const [typeFilter, setTypeFilter] = useState("all");

  const allEvents = useMemo(() => {
    const events = [];
    const now = new Date();

    tasks?.forEach(t => {
      if (t.deleted_at) return;
      if (t.status === "completed" && t.completed_at) {
        events.push({
          type: "task_completed", date: t.completed_at, title: t.title,
          description: t.description, category: CATEGORY_MAP[t.category] || t.category,
          rawCategory: t.category || "other",
          priority: t.priority, tags: t.tags, link: "/Tasks", sourceId: t.id,
        });
      }
      if (t.created_date && moment().diff(moment(t.created_date), "days") <= 30) {
        events.push({
          type: "task_created", date: t.created_date, title: t.title,
          description: t.description, category: CATEGORY_MAP[t.category] || t.category,
          rawCategory: t.category || "other",
          priority: t.priority, tags: t.tags, link: "/Tasks", sourceId: t.id,
        });
      }
      if (t.status === "pending" && t.reminder_time && new Date(t.reminder_time) < now) {
        events.push({
          type: "task_overdue", date: t.reminder_time, title: `⚠ ${t.title}`,
          description: "该约定已逾期，建议尽快处理",
          rawCategory: t.category || "other",
          category: CATEGORY_MAP[t.category] || t.category, priority: t.priority,
          link: "/Tasks", sourceId: t.id,
        });
      }
    });

    notes?.forEach(n => {
      if (n.deleted_at) return;
      if (moment().diff(moment(n.created_date), "days") <= 60) {
        const plainText = n.plain_text || (n.content || "").replace(/<[^>]*>/g, "").slice(0, 100);
        events.push({
          type: "note_created", date: n.created_date,
          title: n.ai_analysis?.summary || plainText.slice(0, 40) || "心签",
          description: plainText.slice(0, 120), tags: n.tags, link: "/Notes", sourceId: n.id,
          rawCategory: "personal",
        });
      }
    });

    executions?.forEach(ex => {
      if (ex.execution_status === "completed" || ex.execution_status === "failed") {
        events.push({
          type: "execution", date: ex.completed_at || ex.created_date,
          title: ex.task_title, description: ex.ai_parsed_result?.summary,
          category: ex.category === "promise" ? "约定" : ex.category === "note" ? "心签" : "任务",
          rawCategory: "work",
          link: "/Notifications", sourceId: ex.id,
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
    { value: "execution", label: "AI执行" },
  ];

  const stats = useMemo(() => {
    const last7 = allEvents.filter(e => moment().diff(moment(e.date), "days") <= 7);
    return {
      total: allEvents.length, week: last7.length,
      completed: allEvents.filter(e => e.type === "task_completed").length,
      notes: allEvents.filter(e => e.type === "note_created").length,
    };
  }, [allEvents]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "总活动", value: stats.total, color: "text-[#384877]" },
          { label: "本周", value: stats.week, color: "text-blue-600" },
          { label: "已完成", value: stats.completed, color: "text-emerald-600" },
          { label: "心签", value: stats.notes, color: "text-amber-600" },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl p-2.5 border border-slate-100 text-center">
            <div className={`text-lg font-bold ${s.color}`}>{s.value}</div>
            <div className="text-[10px] text-slate-400">{s.label}</div>
          </div>
        ))}
      </div>

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

      <div className="pl-1">
        {filteredEvents.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <Brain className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm">暂无活动记录</p>
            <p className="text-xs mt-1">在约定、心签中开始使用后，数据将自动汇聚</p>
          </div>
        ) : (
          <>
            {filteredEvents.map((event, idx) => (
              <TimelineItem
                key={`${event.type}-${event.sourceId}-${idx}`}
                event={event}
                relationships={relationships}
              />
            ))}
            {allEvents.length > limit && (
              <button onClick={() => setLimit(l => l + 30)} className="w-full py-3 text-sm text-[#384877] hover:bg-slate-50 rounded-xl transition-colors">
                加载更多...
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}