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
  let prompt = `你是一个智能记忆助手，能从用户的真实行为数据中提炼深度洞察。请基于以下约定和用户的真实历史数据，给出精准、具体、可执行的记忆洞察建议。

## 当前约定
- 标题: ${task.title}
- 描述: ${task.description || "无"}
- 分类: ${task.category || "其他"}
- 优先级: ${task.priority || "中"}
- 状态: ${task.status}
- 创建时间: ${task.created_date}
- 提醒时间: ${task.reminder_time || "未设置"}
- 完成时间: ${task.completed_at || "未完成"}
- 标签: ${(task.tags || []).join(", ") || "无"}
- 重复规则: ${task.repeat_rule || "无"}

## 用户真实行为数据

### Lv1 记录层（基础记忆）
- 高效时段: ${ctx.peakHour ? `${ctx.peakHour}附近` : "数据积累中"}
- 高产日: ${ctx.peakDay || "数据积累中"}
- 同类约定(${task.category}): 共${ctx.categoryTotal}个，完成${ctx.categoryCompleted}个，完成率${ctx.categoryCompletionRate}%
- 时间估算偏差: ${ctx.avgDelayMinutes !== null ? (ctx.avgDelayMinutes > 0 ? `平均延迟${ctx.avgDelayMinutes}分钟` : `提前${Math.abs(ctx.avgDelayMinutes)}分钟`) : "数据不足"}
- 固定日程: ${ctx.recurringPatterns.length > 0 ? ctx.recurringPatterns.join("、") : "暂无"}`;

  if (ctx.relatedPeople.length > 0) {
    prompt += `\n\n### Lv2 关系层（关联记忆）`;
    ctx.relatedPeople.forEach(p => {
      prompt += `\n- ${p.name}(${p.type}): 亲密度${p.closeness}/10, 互动${p.interactionCount}次`;
      if (p.daysSinceContact !== null) prompt += `, ${p.daysSinceContact}天未联系`;
      if (p.contactOverdue) prompt += `(已超过建议联系频率!)`;
      if (p.unreturnedFavors > 0) prompt += `, 有${p.unreturnedFavors}笔人情未还(${p.lastFavorDesc})`;
      if (p.notes) prompt += `, 备注: ${p.notes}`;
    });
  }

  prompt += `\n\n### Lv3 认知层（预测记忆）
- 当前逾期约定: ${ctx.overdueCount}个
- 连续打卡: ${ctx.streak}天
- 低能量日: ${ctx.lowEnergyDay || "未识别"}

## 要求
1. 时间模式洞察：基于用户真实高效时段和偏差数据，给出具体的时间安排建议
2. 执行建议：结合同类任务完成率和当前状态，给出可执行的行动建议
3. 关系/人情洞察：如果约定涉及关联人物，给出人际互动建议（如联系频率、人情往来提醒）
4. 风险提示：基于逾期数量、时间偏差等数据给出预警

请用简洁自然的中文，每条洞察不超过2句话。返回JSON格式。`;

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
          time_pattern: { type: "string", description: "时间模式洞察" },
          suggestion: { type: "string", description: "执行建议" },
          relationship_insight: { type: "string", description: "关系/人情洞察，无则空字符串" },
          risk: { type: "string", description: "风险提示，无则空字符串" },
        }
      }
    });
    setInsight(result);
    setLoading(false);
  };

  return (
    <div className="mt-2" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={handleGenerate}
        className="flex items-center gap-1.5 text-[11px] text-[#384877] font-medium hover:text-[#2c3a63] transition-colors px-2 py-1 rounded-lg hover:bg-[#384877]/5"
      >
        <Brain className="w-3.5 h-3.5" />
        {loading ? "深度分析中..." : insight ? "记忆洞察" : "AI 记忆洞察"}
        {insight && (expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            {loading ? (
              <div className="flex items-center gap-2 mt-2 p-3 bg-[#384877]/5 rounded-xl">
                <Loader2 className="w-4 h-4 text-[#384877] animate-spin" />
                <span className="text-xs text-[#384877]">正在整合约定、关系、行为数据...</span>
              </div>
            ) : insight ? (
              <div className="mt-2 space-y-1.5">
                {/* 时间模式 */}
                {insight.time_pattern && (
                  <div className="p-2.5 bg-indigo-50 rounded-xl border border-indigo-100">
                    <div className="flex items-start gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-indigo-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <span className="text-[11px] font-semibold text-indigo-800">时间模式：</span>
                        <span className="text-[11px] text-indigo-700 leading-relaxed">{insight.time_pattern}</span>
                      </div>
                    </div>
                  </div>
                )}
                {/* 执行建议 */}
                {insight.suggestion && (
                  <div className="p-2.5 bg-purple-50/60 rounded-xl border border-purple-100">
                    <div className="flex items-start gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-purple-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <span className="text-[11px] font-semibold text-purple-800">执行建议：</span>
                        <span className="text-[11px] text-purple-700 leading-relaxed">{insight.suggestion}</span>
                      </div>
                    </div>
                  </div>
                )}
                {/* 关系洞察 */}
                {insight.relationship_insight && (
                  <div className="p-2.5 bg-amber-50 rounded-xl border border-amber-200">
                    <div className="flex items-start gap-1.5">
                      <Users className="w-3.5 h-3.5 text-amber-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <span className="text-[11px] font-semibold text-amber-800">人情追踪：</span>
                        <span className="text-[11px] text-amber-700 leading-relaxed">{insight.relationship_insight}</span>
                      </div>
                    </div>
                  </div>
                )}
                {/* 风险提示 */}
                {insight.risk && (
                  <div className="p-2.5 bg-red-50 rounded-xl border border-red-100">
                    <div className="flex items-start gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-red-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <span className="text-[11px] font-semibold text-red-700">风险预警：</span>
                        <span className="text-[11px] text-red-600 leading-relaxed">{insight.risk}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}