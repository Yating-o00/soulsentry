import React, { useMemo } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import {
  Clock, Brain, Zap, Target, BarChart3,
  AlertTriangle, Flame, ArrowRight, Lightbulb, Activity, TrendingUp, Sparkles, Users
} from "lucide-react";
import moment from "moment";

function InsightCard({ icon: IconComp, iconColor, title, value, desc, action }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm"
    >
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${iconColor || "bg-[#384877]/10 text-[#384877]"}`}>
          <IconComp className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-slate-800">{title}</h4>
          {value && <div className="text-lg font-bold text-slate-900 mt-0.5">{value}</div>}
          <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{desc}</p>
          {action && (
            <Link to={action.link} className="inline-flex items-center gap-1 text-xs text-[#384877] mt-2 hover:underline font-medium">
              {action.label} <ArrowRight className="w-3 h-3" />
            </Link>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export default function ProductInsights({ tasks, notes, behaviors, executions, relationships }) {
  const insights = useMemo(() => {
    const last30Tasks = (tasks || []).filter(t => !t.deleted_at && moment().diff(moment(t.created_date), "days") <= 30);
    const completedTasks = last30Tasks.filter(t => t.status === "completed");
    const pendingTasks = (tasks || []).filter(t => !t.deleted_at && t.status === "pending");
    const overdueTasks = pendingTasks.filter(t => t.reminder_time && new Date(t.reminder_time) < new Date());
    const last30Notes = (notes || []).filter(n => !n.deleted_at && moment().diff(moment(n.created_date), "days") <= 30);

    const completionRate = last30Tasks.length > 0
      ? Math.round((completedTasks.length / last30Tasks.length) * 100) : 0;

    const tasksWithTime = completedTasks.filter(t => t.reminder_time && t.completed_at);
    let avgDelay = 0;
    if (tasksWithTime.length > 3) {
      const delays = tasksWithTime.map(t => (new Date(t.completed_at) - new Date(t.reminder_time)) / (1000 * 60)).filter(d => d > 0 && d < 1440);
      avgDelay = delays.length > 0 ? Math.round(delays.reduce((a, b) => a + b, 0) / delays.length) : 0;
    }

    const dayCompletions = {};
    completedTasks.forEach(t => {
      if (!t.completed_at) return;
      const day = moment(t.completed_at).day();
      dayCompletions[day] = (dayCompletions[day] || 0) + 1;
    });
    const dayNames = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
    const sortedDays = Object.entries(dayCompletions).sort((a, b) => b[1] - a[1]);
    const peakDay = sortedDays[0] ? dayNames[parseInt(sortedDays[0][0])] : null;
    const lowDay = sortedDays.length > 1 ? dayNames[parseInt(sortedDays[sortedDays.length - 1][0])] : null;

    const catCount = {};
    last30Tasks.forEach(t => { catCount[t.category || "other"] = (catCount[t.category || "other"] || 0) + 1; });
    const topCategory = Object.entries(catCount).sort((a, b) => b[1] - a[1])[0];
    const catMap = { work: "工作", personal: "个人", health: "健康", study: "学习", family: "家庭", shopping: "购物", finance: "理财", other: "其他" };

    let streak = 0;
    for (let i = 0; i < 30; i++) {
      const day = moment().subtract(i, "days").format("YYYY-MM-DD");
      if (completedTasks.some(t => t.completed_at && moment(t.completed_at).format("YYYY-MM-DD") === day)) streak++;
      else break;
    }

    const recentExec = (executions || []).filter(ex => moment().diff(moment(ex.created_date), "days") <= 30);
    const execSuccess = recentExec.filter(ex => ex.execution_status === "completed").length;
    const execRate = recentExec.length > 0 ? Math.round((execSuccess / recentExec.length) * 100) : 0;

    const uniqueTags = new Set();
    last30Notes.forEach(n => n.tags?.forEach(t => uniqueTags.add(t)));

    return {
      completionRate, avgDelay, peakDay, lowDay,
      topCategory: topCategory ? catMap[topCategory[0]] || topCategory[0] : null,
      topCategoryCount: topCategory ? topCategory[1] : 0,
      streak, overdueCount: overdueTasks.length,
      noteCount: last30Notes.length, tagCount: uniqueTags.size,
      execRate, execTotal: recentExec.length, totalTasks: last30Tasks.length
    };
  }, [tasks, notes, behaviors, executions]);

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        <InsightCard icon={Target} iconColor="bg-emerald-100 text-emerald-600" title="30天执行效率" value={`${insights.completionRate}%`}
          desc={`近30天创建${insights.totalTasks}个约定，完成${Math.round(insights.totalTasks * insights.completionRate / 100)}个${insights.completionRate >= 70 ? "，表现出色" : "，建议适当减少任务量"}`}
          action={{ label: "查看约定", link: "/Tasks" }}
        />
        <InsightCard icon={Flame} iconColor="bg-orange-100 text-orange-600" title="连续打卡" value={insights.streak > 0 ? `${insights.streak}天` : "今日待开始"}
          desc={insights.streak >= 7 ? "连续一周高效执行，出色！" : insights.streak > 0 ? "保持每日完成至少一个约定" : "完成一个约定即可开始连续记录"}
        />
        <InsightCard icon={Clock} iconColor="bg-amber-100 text-amber-600" title="时间估算校准" value={insights.avgDelay > 0 ? `+${insights.avgDelay}分钟` : "准时"}
          desc={insights.avgDelay > 15 ? `约定平均延迟${insights.avgDelay}分钟完成，建议自动添加缓冲时间` : "你的时间把控很准确，继续保持"}
          action={insights.avgDelay > 15 ? { label: "优化规划", link: "/Dashboard" } : undefined}
        />
        <InsightCard icon={Activity} iconColor="bg-purple-100 text-purple-600" title="状态预测" value={insights.peakDay || "数据积累中"}
          desc={insights.peakDay ? `${insights.peakDay}是你的高产日${insights.lowDay ? `，${insights.lowDay}效率偏低` : ""}，可据此安排重要事项` : "继续使用，系统将学习你的能量节律"}
        />
        <InsightCard icon={BarChart3} iconColor="bg-blue-100 text-blue-600" title="重心分布" value={insights.topCategory || "均衡"}
          desc={insights.topCategory ? `${insights.topCategory}类占比最高(${insights.topCategoryCount}个)，注意平衡工作与生活` : "各类约定分布均衡"}
        />
        <InsightCard icon={Brain} iconColor="bg-indigo-100 text-indigo-600" title="知识沉淀" value={`${insights.noteCount}篇心签`}
          desc={`近30天记录${insights.noteCount}篇心签，覆盖${insights.tagCount}个主题领域`}
          action={{ label: "查看心签", link: "/Notes" }}
        />
        {insights.overdueCount > 0 && (
          <InsightCard icon={AlertTriangle} iconColor="bg-red-100 text-red-600" title="风险预警" value={`${insights.overdueCount}个逾期`}
            desc={`当前有${insights.overdueCount}个约定已逾期，建议优先处理或调整截止时间`}
            action={{ label: "处理逾期", link: "/Tasks" }}
          />
        )}
        {insights.execTotal > 0 && (
          <InsightCard icon={Zap} iconColor="bg-violet-100 text-violet-600" title="AI辅助效率" value={`${insights.execRate}%`}
            desc={`近30天AI辅助执行${insights.execTotal}次，成功率${insights.execRate}%`}
          />
        )}
        {(() => {
          const rels = relationships || [];
          const overdue = rels.filter(r => {
            if (!r.last_interaction_date) return false;
            const days = moment().diff(moment(r.last_interaction_date), "days");
            return days > (r.contact_frequency_days || 30);
          });
          if (rels.length > 0) {
            return (
              <InsightCard icon={Users} iconColor="bg-pink-100 text-pink-600" title="人际网络"
                value={`${rels.length}位联系人`}
                desc={overdue.length > 0
                  ? `${overdue.map(r => r.name).join("、")}已超过建议联系频率，建议尽快互动`
                  : `人际关系维护良好，所有联系人均在建议联系频率内`
                }
                action={overdue.length > 0 ? { label: "查看关系", link: "/Teams" } : undefined}
              />
            );
          }
          return null;
        })()}
      </div>

      <div className="bg-gradient-to-r from-[#384877]/5 via-white to-purple-50/30 rounded-2xl p-4 border border-slate-100">
        <div className="flex items-center gap-2 mb-2">
          <Lightbulb className="w-4 h-4 text-[#384877]" />
          <h4 className="text-sm font-semibold text-slate-800">认知模型摘要</h4>
        </div>
        <div className="space-y-1.5 text-sm text-slate-600">
          <p>• 执行效率 <span className="font-semibold text-[#384877]">{insights.completionRate}%</span>，连续打卡 <span className="font-semibold text-orange-600">{insights.streak}天</span></p>
          {insights.peakDay && <p>• 高产日：<span className="font-semibold text-purple-600">{insights.peakDay}</span>，建议安排重要会议和深度工作</p>}
          {insights.avgDelay > 0 && <p>• 时间校准：每项约定建议预留额外 <span className="font-semibold text-amber-600">{insights.avgDelay}分钟</span></p>}
          <p>• 近期沉淀 <span className="font-semibold text-indigo-600">{insights.noteCount}篇心签</span>，覆盖 <span className="font-semibold text-indigo-600">{insights.tagCount}个知识领域</span></p>
          {(relationships || []).length > 0 && (
            <p>• 人际网络 <span className="font-semibold text-pink-600">{(relationships || []).length}位联系人</span>，
              {(() => {
                const overdue = (relationships || []).filter(r => r.last_interaction_date && moment().diff(moment(r.last_interaction_date), "days") > (r.contact_frequency_days || 30));
                return overdue.length > 0
                  ? <span className="text-amber-600 font-semibold">{overdue.length}位待联系</span>
                  : <span className="text-emerald-600">维护状态良好</span>;
              })()}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}