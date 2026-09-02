import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { DEFAULT_TIERS, TIER_ORDER } from "@/lib/trustLadder";

export const REASON_LABELS = {
  device_not_ready: "设备未就绪",
  time_conflict: "时间冲突",
  energy_low: "精力不足",
  external_blocker: "外部阻塞",
  forgot: "一时忘了",
  scope_changed: "范围变了",
  other: "其它",
};

export const RHYTHM_BUCKETS = [
  { label: "清晨", from: 5, to: 9 },
  { label: "上午", from: 9, to: 12 },
  { label: "午后", from: 12, to: 15 },
  { label: "下午", from: 15, to: 18 },
  { label: "傍晚", from: 18, to: 21 },
  { label: "夜里", from: 21, to: 29 },
];

const dayKey = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${x.getMonth() + 1}-${x.getDate()}`;
};

function computeStreak(days) {
  let streak = 0;
  const cursor = new Date();
  if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (days.has(dayKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

// 数据底座：连续如约、时间校准、能量节律、顺延原因、自动化信任度
export function useEvolutionStats() {
  return useQuery({
    queryKey: ["evolution-stats"],
    queryFn: async () => {
      const [completed, logs, policies] = await Promise.all([
        base44.entities.Task.filter({ status: "completed" }, "-completed_at", 200),
        base44.entities.TaskDeferralLog.list("-created_date", 200),
        base44.entities.TrustPolicy.list("-updated_date", 30),
      ]);

      const days = new Set();
      const rhythm = RHYTHM_BUCKETS.map((b) => ({ ...b, count: 0 }));
      const offsets = [];

      for (const t of completed) {
        if (!t.completed_at) continue;
        const done = new Date(t.completed_at);
        days.add(dayKey(done));
        const hour = done.getHours() < 5 ? done.getHours() + 24 : done.getHours();
        const bucket = rhythm.find((b) => hour >= b.from && hour < b.to);
        if (bucket) bucket.count += 1;
        if (t.reminder_time) {
          const diff = Math.round((done.getTime() - new Date(t.reminder_time).getTime()) / 60000);
          if (Math.abs(diff) <= 60 * 24 * 7) offsets.push(diff);
        }
      }

      const averageOffset = offsets.length
        ? Math.round(offsets.reduce((s, v) => s + v, 0) / offsets.length)
        : 0;

      const reasonCounts = {};
      for (const log of logs) {
        const key = log.reason_category || "other";
        reasonCounts[key] = (reasonCounts[key] || 0) + 1;
      }
      const reasons = Object.entries(reasonCounts)
        .map(([key, count]) => ({ key, label: REASON_LABELS[key] || key, count }))
        .sort((a, b) => b.count - a.count);

      const trustCounts = { confirm_first: 0, auto_draft: 0, full_auto: 0 };
      for (const type of Object.keys(DEFAULT_TIERS)) {
        const hit = policies.find((p) => p.automation_type === type);
        const tier = hit?.tier || DEFAULT_TIERS[type];
        if (trustCounts[tier] !== undefined) trustCounts[tier] += 1;
      }
      const totalTypes = Object.keys(DEFAULT_TIERS).length;
      const trustScore = Math.round(
        ((trustCounts.auto_draft * 0.6 + trustCounts.full_auto) / totalTypes) * 100
      );

      return {
        streak: computeStreak(days),
        completedTotal: completed.length,
        averageOffset,
        offsetSamples: offsets.length,
        rhythm,
        reasons,
        deferralTotal: logs.length,
        trustCounts,
        trustScore,
        tierOrder: TIER_ORDER,
      };
    },
    staleTime: 30 * 1000,
  });
}