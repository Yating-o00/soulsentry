import React from "react";
import { motion } from "framer-motion";
import { 
  Clock, TrendingUp, Brain, Zap, AlertTriangle, 
  Calendar, BarChart3, Target
} from "lucide-react";
import moment from "moment";

function InsightCard({ icon: Icon, iconColor, title, value, desc, bgColor }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`${bgColor || "bg-white"} rounded-2xl p-4 border border-slate-100 shadow-sm`}
    >
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconColor || "bg-[#384877]/10 text-[#384877]"}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <h4 className="text-sm font-semibold text-slate-800">{title}</h4>
          {value && <div className="text-lg font-bold text-slate-900 mt-0.5">{value}</div>}
          <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
        </div>
      </div>
    </motion.div>
  );
}

export default function CognitionInsights({ tasks, memories, behaviors }) {
  // Time estimation calibration
  const completedTasks = tasks?.filter(t => t.status === "completed" && t.reminder_time && t.completed_at) || [];
  let avgDelay = 0;
  if (completedTasks.length > 3) {
    const delays = completedTasks.map(t => {
      const planned = new Date(t.reminder_time);
      const actual = new Date(t.completed_at);
      return (actual - planned) / (1000 * 60); // minutes
    }).filter(d => d > 0 && d < 1440);
    avgDelay = delays.length > 0 ? Math.round(delays.reduce((a, b) => a + b, 0) / delays.length) : 0;
  }

  // Energy pattern by day of week
  const dayCompletions = {};
  completedTasks.forEach(t => {
    const day = moment(t.completed_at).day();
    dayCompletions[day] = (dayCompletions[day] || 0) + 1;
  });
  const lowestDay = Object.entries(dayCompletions).sort((a, b) => a[1] - b[1])[0];
  const dayNames = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  const lowEnergyDay = lowestDay ? dayNames[parseInt(lowestDay[0])] : null;

  // Knowledge accumulation from memories
  const recentMemories = memories?.filter(m => {
    const diff = moment().diff(moment(m.event_date), "days");
    return diff <= 30;
  }) || [];
  const uniquePeople = new Set();
  recentMemories.forEach(m => m.people?.forEach(p => uniquePeople.add(p.name)));

  // Completion rate
  const totalRecent = tasks?.filter(t => {
    const diff = moment().diff(moment(t.created_date), "days");
    return diff <= 30;
  }) || [];
  const completedRecent = totalRecent.filter(t => t.status === "completed");
  const completionRate = totalRecent.length > 0
    ? Math.round((completedRecent.length / totalRecent.length) * 100)
    : 0;

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        <InsightCard
          icon={Clock}
          iconColor="bg-amber-100 text-amber-600"
          title="时间估算校准"
          value={avgDelay > 0 ? `+${avgDelay}分钟` : "准时"}
          desc={avgDelay > 0
            ? `你的任务平均比计划多花${avgDelay}分钟，系统已自动添加缓冲`
            : "你的时间估算很准确，继续保持"
          }
        />

        <InsightCard
          icon={Zap}
          iconColor="bg-purple-100 text-purple-600"
          title="状态预测"
          value={lowEnergyDay || "数据积累中"}
          desc={lowEnergyDay
            ? `${lowEnergyDay}通常能量较低，不推荐安排重要会议`
            : "继续使用，系统将学习你的能量节律"
          }
        />

        <InsightCard
          icon={Brain}
          iconColor="bg-blue-100 text-blue-600"
          title="知识沉淀"
          value={`${recentMemories.length} 条记忆`}
          desc={`近30天记录了${recentMemories.length}条记忆，涉及${uniquePeople.size}位联系人`}
        />

        <InsightCard
          icon={Target}
          iconColor="bg-emerald-100 text-emerald-600"
          title="执行效率"
          value={`${completionRate}%`}
          desc={`近30天任务完成率${completionRate}%，${completionRate >= 70 ? "表现优秀" : "建议合理安排任务量"}`}
        />
      </div>

      {/* Pattern summary */}
      <div className="bg-gradient-to-r from-[#384877]/5 via-white to-purple-50/30 rounded-2xl p-4 border border-slate-100">
        <div className="flex items-center gap-2 mb-2">
          <BarChart3 className="w-4 h-4 text-[#384877]" />
          <h4 className="text-sm font-semibold text-slate-800">认知模型摘要</h4>
        </div>
        <div className="space-y-1.5 text-sm text-slate-600">
          <p>• 本月共积累 <span className="font-semibold text-[#384877]">{recentMemories.length}</span> 条长期记忆</p>
          <p>• 社交网络涉及 <span className="font-semibold text-[#384877]">{uniquePeople.size}</span> 位核心联系人</p>
          {avgDelay > 0 && <p>• 时间校准建议：每项任务预留额外 <span className="font-semibold text-amber-600">{avgDelay}分钟</span></p>}
          {lowEnergyDay && <p>• 低能量日检测：<span className="font-semibold text-purple-600">{lowEnergyDay}下午</span> 效率偏低</p>}
        </div>
      </div>
    </div>
  );
}