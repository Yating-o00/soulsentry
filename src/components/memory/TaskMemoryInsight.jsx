import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { motion, AnimatePresence } from "framer-motion";
import { Brain, Loader2, ChevronDown, ChevronUp, Sparkles, TrendingUp, AlertTriangle, Clock, Users, Heart, MapPin } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import moment from "moment";

// Build rich context from all real user data for a specific task
function buildTaskContext(task, allTasks, relationships, behaviors, completions) {
  const ctx = {};

  // Lv1: 记录层 — 时间偏好 & 日程模式
  const completedTasks = (allTasks || []).filter(t => t.status === "completed" && t.completed_at && !t.deleted_at);
  const hourCounts = {};
  const dayCounts = {};
  completedTasks.forEach(t => {
    const h = new Date(t.completed_at).getHours();
    const d = new Date(t.completed_at).getDay();
    hourCounts[h] = (hourCounts[h] || 0) + 1;
    dayCounts[d] = (dayCounts[d] || 0) + 1;
  });
  const peakHour = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0];
  const peakDay = Object.entries(dayCounts).sort((a, b) => b[1] - a[1])[0];
  const dayNames = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  ctx.peakHour = peakHour ? `${peakHour[0]}点` : null;
  ctx.peakDay = peakDay ? dayNames[parseInt(peakDay[0])] : null;

  // Same-category task history
  const sameCat = (allTasks || []).filter(t => t.category === task.category && !t.deleted_at);
  const sameCatCompleted = sameCat.filter(t => t.status === "completed");
  ctx.categoryTotal = sameCat.length;
  ctx.categoryCompleted = sameCatCompleted.length;
  ctx.categoryCompletionRate = sameCat.length > 0 ? Math.round((sameCatCompleted.length / sameCat.length) * 100) : 0;

  // Lv1: 时间估算校准
  const tasksWithDelay = completedTasks.filter(t => t.reminder_time && t.completed_at);
  const delays = tasksWithDelay.map(t => (new Date(t.completed_at) - new Date(t.reminder_time)) / (1000 * 60)).filter(d => Math.abs(d) < 1440 * 7);
  ctx.avgDelayMinutes = delays.length > 2 ? Math.round(delays.reduce((a, b) => a + b, 0) / delays.length) : null;

  // Lv1: 固定日程模式 — recurring tasks
  const recurringTasks = (allTasks || []).filter(t => t.repeat_rule && t.repeat_rule !== "none" && !t.deleted_at);
  ctx.recurringPatterns = recurringTasks.slice(0, 3).map(t => `${t.title}(${t.repeat_rule === "daily" ? "每天" : t.repeat_rule === "weekly" ? "每周" : "每月"})`);

  // Lv2: 关系层 — 关联人物
  const relatedPeople = [];
  const titleLower = (task.title || "").toLowerCase();
  const descLower = (task.description || "").toLowerCase();
  const combinedText = titleLower + " " + descLower;
  (relationships || []).forEach(r => {
    const name = (r.name || "").toLowerCase();
    const nick = (r.nickname || "").toLowerCase();
    if (name && combinedText.includes(name) || nick && combinedText.includes(nick)) {
      const daysSince = r.last_interaction_date ? moment().diff(moment(r.last_interaction_date), "days") : null;
      const overdue = daysSince !== null && r.contact_frequency_days && daysSince > r.contact_frequency_days;
      const unreturnedFavors = (r.favors || []).filter(f => f.type === "received");
      relatedPeople.push({
        name: r.name, type: r.relationship_type, closeness: r.closeness,
        interactionCount: r.interaction_count, daysSinceContact: daysSince,
        contactOverdue: overdue, notes: r.notes,
        preferred_time: r.preferred_contact_time,
        unreturnedFavors: unreturnedFavors.length,
        lastFavorDesc: unreturnedFavors[0]?.description || null,
      });
    }
  });
  ctx.relatedPeople = relatedPeople;

  // Lv2: 承诺追踪 — overdue tasks
  const overdueTasks = (allTasks || []).filter(t =>
    t.status === "pending" && !t.deleted_at && t.reminder_time && new Date(t.reminder_time) < new Date()
  );
  ctx.overdueCount = overdueTasks.length;

  // Lv3: 认知层 — 连续打卡
  let streak = 0;
  for (let i = 0; i < 30; i++) {
    const day = moment().subtract(i, "days").format("YYYY-MM-DD");
    if (completedTasks.some(t => moment(t.completed_at).format("YYYY-MM-DD") === day)) streak++;
    else break;
  }
  ctx.streak = streak;

  // Lv3: 行为模式预测 — low-energy periods
  const lowDays = Object.entries(dayCounts).sort((a, b) => a[1] - b[1]);
  ctx.lowEnergyDay = lowDays[0] ? dayNames[parseInt(lowDays[0][0])] : null;

  return ctx;
}

function buildPrompt(task, ctx) {
  let prompt = `你是一个智能记忆助手。请针对这个约定，从以下数据中提炼出一句最核心的提醒（不超过80字）。

## 约定
- 标题: ${task.title}
- 描述: ${task.description || "无"}
- 分类: ${task.category || "其他"}
- 优先级: ${task.priority || "中"}
- 状态: ${task.status}
- 提醒时间: ${task.reminder_time || "未设置"}

## 数据
- 高效时段: ${ctx.peakHour || "不明"}，高产日: ${ctx.peakDay || "不明"}
- 同类完成率: ${ctx.categoryCompletionRate}%（${ctx.categoryCompleted}/${ctx.categoryTotal}）
- 平均延迟: ${ctx.avgDelayMinutes !== null ? ctx.avgDelayMinutes + "分钟" : "不明"}
- 逾期约定数: ${ctx.overdueCount}`;

  if (ctx.relatedPeople.length > 0) {
    ctx.relatedPeople.forEach(p => {
      prompt += `\n- 关联人: ${p.name}(${p.type})，${p.daysSinceContact !== null ? p.daysSinceContact + "天未联系" : ""}`;
      if (p.contactOverdue) prompt += "，已超频";
      if (p.unreturnedFavors > 0) prompt += `，欠人情(${p.lastFavorDesc})`;
      if (p.preferred_time) prompt += `，偏好${p.preferred_time}`;
    });
  }

  prompt += `

## 规则
1. 只输出一句话，不超过80字，直接给出最刚需的提醒
2. 根据约定内容自动判断最相关的维度：
   - 如果涉及人→优先给出人情/关系提醒（如联系频率、人情欠还、最佳沟通时段）
   - 如果是时间敏感型→优先给出时间安排建议（如最佳执行时段、延迟校准）
   - 如果逾期严重→优先给出风险警示
3. 不要罗列多条，不要分点，就一句话，像朋友的善意提醒
4. 返回JSON格式：{"insight": "一句话提醒"}`;

  return prompt;
}

export default function TaskMemoryInsight({ task }) {
  const [expanded, setExpanded] = useState(false);
  const [insight, setInsight] = useState(null);
  const [loading, setLoading] = useState(false);

  // Fetch all context data
  const { data: allTasks = [] } = useQuery({
    queryKey: ["tasks-memory-ctx"],
    queryFn: () => base44.entities.Task.list("-created_date", 200),
    staleTime: 60000,
  });

  const { data: relationships = [] } = useQuery({
    queryKey: ["relationships-memory-ctx"],
    queryFn: () => base44.entities.Relationship.list("-created_date", 50),
    staleTime: 60000,
  });

  const { data: behaviors = [] } = useQuery({
    queryKey: ["behaviors-memory-ctx"],
    queryFn: () => base44.entities.UserBehavior.list("-created_date", 200),
    staleTime: 60000,
  });

  const { data: completions = [] } = useQuery({
    queryKey: ["completions-memory-ctx"],
    queryFn: () => base44.entities.TaskCompletion.list("-created_date", 100),
    staleTime: 60000,
  });

  const handleGenerate = async (e) => {
    e.stopPropagation();
    if (insight) {
      setExpanded(!expanded);
      return;
    }
    setLoading(true);
    setExpanded(true);

    const ctx = buildTaskContext(task, allTasks, relationships, behaviors, completions);
    const prompt = buildPrompt(task, ctx);

    const result = await base44.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: "object",
        properties: {
          insight: { type: "string", description: "一句话核心提醒，不超过80字" },
        }
      }
    });
    setInsight(result);
    setLoading(false);
  };

  return (
    <div className="mt-1.5" onClick={(e) => e.stopPropagation()}>
      {/* Collapsed: show inline insight if available, otherwise show trigger */}
      {!expanded && !insight && (
        <button
          onClick={handleGenerate}
          className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-[#384877] transition-colors py-0.5 rounded-md hover:bg-slate-50 no-min-size"
        >
          <Brain className="w-3 h-3" />
          <span>{loading ? "分析中..." : "记忆洞察"}</span>
        </button>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex items-center gap-1.5 mt-1 py-1">
          <Loader2 className="w-3 h-3 text-[#384877] animate-spin" />
          <span className="text-[11px] text-slate-400">分析中...</span>
        </div>
      )}

      {/* Insight result - always visible once generated */}
      {!loading && insight?.insight && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-1"
        >
          <div 
            className="flex items-start gap-2 px-3 py-2 bg-gradient-to-r from-amber-50 to-yellow-50/50 rounded-lg border border-amber-100/80 cursor-pointer group"
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
          >
            <Brain className="w-3.5 h-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
            <p className={`text-[11px] text-amber-800 leading-relaxed ${expanded ? "" : "line-clamp-1"}`}>
              {insight.insight}
            </p>
            {!expanded && (
              <ChevronDown className="w-3 h-3 text-amber-400 mt-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}