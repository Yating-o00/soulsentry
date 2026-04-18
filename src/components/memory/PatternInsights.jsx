import React, { useMemo } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import {
  Clock, TrendingUp, Brain, Zap, Target, BarChart3,
  AlertTriangle, CheckCircle2, Flame, ArrowRight,
  Calendar, StickyNote, ListTodo
} from "lucide-react";
import moment from "moment";

function InsightCard({ icon: Icon, iconColor, title, value, desc, action }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm"
    >
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${iconColor || "bg-[#384877]/10 text-[#384877]"}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-xs font-semibold text-slate-700">{title}</h4>
          {value && <div className="text-lg font-bold text-slate-900 mt-0.5">{value}</div>}
          <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{desc}</p>
          {action && (
            <Link to={action.to} className="inline-flex items-center gap-1 text-[11px] text-[#384877] font-medium mt-2 hover:underline">
              {action.label} <ArrowRight className="w-3 h-3" />
            </Link>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export default function PatternInsights({ tasks, notes, executions, behaviors }) {
  const now = moment();

  // Completed tasks analysis
  const completedTasks = useMemo(() => tasks?.filter(t => t.status === "completed" && t.completed_at) || [], [tasks]);
  const recentTasks = useMemo(() => tasks?.filter(t => !t.deleted_at && moment().diff(moment(t.created_date), "days") <= 30) || [], [tasks]);
  const recentCompleted = recentTasks.filter(t => t.status === "completed");
  const completionRate = recentTasks.length > 0 ? Math.round((recentCompleted.length / recentTasks.length) * 100) : 0;

  // Time estimation accuracy
  const avgDelay = useMemo(() => {
    const withTimes = completedTasks.filter(t => t.reminder_time && t.completed_at);
    if (withTimes.length < 3) return null;
    const delays = withTimes.map(t => {
      const planned = new Date(t.reminder_time);
      const actual = new Date(t.completed_at);
      return (actual - planned) / (1000 * 60);
    }).filter(d => d > 0 && d < 1440);
    return delays.length > 0 ? Math.round(delays.reduce((a, b) => a + b, 0) / delays.length) : 0;
  }, [completedTasks]);

  // Peak productivity day
  const peakDay = useMemo(() => {
    const dayMap = {};
    completedTasks.forEach(t => {
      const day = moment(t.completed_at).day();
      dayMap[day] = (dayMap[day] || 0) + 1;
    });
    const sorted = Object.entries(dayMap).sort((a, b) => b[1] - a[1]);
    return sorted[0] ? ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][parseInt(sorted[0][0])] : null;
  }, [completedTasks]);

  // Low energy day
  const lowDay = useMemo(() => {
    const dayMap = {};
    completedTasks.forEach(t => {
      const day = moment(t.completed_at).day();
      dayMap[day] = (dayMap[day] || 0) + 1;
    });
    const sorted = Object.entries(dayMap).sort((a, b) => a[1] - b[1]);
    return sorted[0] ? ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][parseInt(sorted[0][0])] : null;
  }, [completedTasks]);

  // Category distribution
  const categoryBreakdown = useMemo(() => {
    const map = {};
    recentTasks.forEach(t => {
      const cat = { work: "工作", personal: "个人", health: "健康", study: "学习", family: "家庭", shopping: "购物", finance: "理财" }[t.category] || "其他";
      map[cat] = (map[cat] || 0) + 1;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 3);
  }, [recentTasks]);

  // Notes productivity
  const recentNotes = useMemo(() => notes?.filter(n => !n.deleted_at && moment().diff(moment(n.created_date), "days") <= 30) || [], [notes]);
  const notesWithTags = recentNotes.filter(n => n.tags?.length > 0);

  // Streak - consecutive days with completed tasks
  const streak = useMemo(() => {
    const daySet = new Set();
    completedTasks.forEach(t => {
      daySet.add(moment(t.completed_at).format("YYYY-MM-DD"));
    });
    let count = 0;
    let day = moment();
    while (daySet.has(day.format("YYYY-MM-DD"))) {
      count++;
      day = day.subtract(1, "day");
    }
    return count;
  }, [completedTasks]);

  // Overdue tasks
  const overdueTasks = useMemo(() => {
    return tasks?.filter(t => !t.deleted_at && t.status === "pending" && t.reminder_time && new Date(t.reminder_time) < new Date()) || [];
  }, [tasks]);

  // AI execution success rate
  const execSuccess = useMemo(() => {
    if (!executions?.length) return null;
    const completed = executions.filter(e => e.execution_status === "completed").length;
    return Math.round((completed / executions.length) * 100);
  }, [executions]);

  return (
    <div className="space-y-3">
      {/* Top metrics row */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-[#384877] rounded-xl p-3 text-white text-center">
          <div className="text-2xl font-bold">{completionRate}%</div>
          <div className="text-[10px] text-blue-200">30日完成率</div>
        </div>
        <div className="bg-white rounded-xl p-3 border border-slate-100 text-center">
          <div className="text-2xl font-bold text-amber-500">{streak}</div>
          <div className="text-[10px] text-slate-400">连续天数</div>
        </div>
        <div className="bg-white rounded-xl p-3 border border-slate-100 text-center">
          <div className="text-2xl font-bold text-red-500">{overdueTasks.length}</div>
          <div className="text-[10px] text-slate-400">待处理逾期</div>
        </div>
      </div>

      {/* Insight cards */}
      <div className="grid gap-2.5 md:grid-cols-2">
        {avgDelay !== null && (
          <InsightCard
            icon={Clock}
            iconColor="bg-amber-100 text-amber-600"
            title="时间估算校准"
            value={avgDelay > 0 ? `+${avgDelay}分钟` : "准时"}
            desc={avgDelay > 0
              ? `约定平均比计划多花${avgDelay}分钟，建议在智能规划中预留缓冲`
              : "时间估算精准，继续保持"
            }
            action={{ to: "/Dashboard", label: "打开智能规划" }}
          />
        )}

        {peakDay && (
          <InsightCard
            icon={Flame}
            iconColor="bg-orange-100 text-orange-600"
            title="高效日"
            value={peakDay}
            desc={`${peakDay}是你完成约定最多的日子，适合安排重要事务`}
            action={{ to: "/Tasks", label: "查看约定" }}
          />
        )}

        {lowDay && lowDay !== peakDay && (
          <InsightCard
            icon={AlertTriangle}
            iconColor="bg-purple-100 text-purple-600"
            title="低能量日"
            value={lowDay}
            desc={`${lowDay}通常产出偏低，不建议安排关键会议或截止日期`}
            action={{ to: "/Dashboard", label: "调整规划" }}
          />
        )}

        <InsightCard
          icon={Target}
          iconColor="bg-emerald-100 text-emerald-600"
          title="执行效率"
          value={`${recentCompleted.length}/${recentTasks.length}`}
          desc={`近30天共${recentTasks.length}个约定，已完成${recentCompleted.length}个${completionRate >= 70 ? "，表现优秀" : "，建议合理调整任务量"}`}
        />

        <InsightCard
          icon={StickyNote}
          iconColor="bg-purple-100 text-purple-600"
          title="知识沉淀"
          value={`${recentNotes.length} 条心签`}
          desc={`近30天记录${recentNotes.length}条心签，${notesWithTags.length}条已归类标签`}
          action={{ to: "/Notes", label: "查看心签" }}
        />

        {execSuccess !== null && (
          <InsightCard
            icon={Zap}
            iconColor="bg-indigo-100 text-indigo-600"
            title="AI执行成功率"
            value={`${execSuccess}%`}
            desc={`AI 智能执行引擎成功率${execSuccess}%，共处理${executions.length}个任务`}
            action={{ to: "/Notifications", label: "查看执行记录" }}
          />
        )}
      </div>

      {/* Category breakdown */}
      {categoryBreakdown.length > 0 && (
        <div className="bg-gradient-to-r from-[#384877]/5 via-white to-purple-50/30 rounded-xl p-4 border border-slate-100">
          <div className="flex items-center gap-2 mb-2.5">
            <BarChart3 className="w-4 h-4 text-[#384877]" />
            <h4 className="text-xs font-semibold text-slate-800">约定分布 · 近30天</h4>
          </div>
          <div className="space-y-2">
            {categoryBreakdown.map(([cat, count]) => (
              <div key={cat} className="flex items-center gap-2">
                <span className="text-xs text-slate-600 w-12">{cat}</span>
                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#384877] rounded-full transition-all"
                    style={{ width: `${(count / recentTasks.length) * 100}%` }}
                  />
                </div>
                <span className="text-xs text-slate-500 w-8 text-right">{count}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-2 border-t border-slate-100">
            <Link
              to="/Tasks"
              className="inline-flex items-center gap-1 text-[11px] text-[#384877] font-medium hover:underline"
            >
              查看全部约定 <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}