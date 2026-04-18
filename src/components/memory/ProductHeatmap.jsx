import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { Sunrise, Sun, Sunset, Moon, ArrowRight } from "lucide-react";

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const DAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

function getHeatColor(value, max) {
  if (!value || max === 0) return "bg-slate-50";
  const ratio = value / max;
  if (ratio > 0.75) return "bg-[#384877]";
  if (ratio > 0.5) return "bg-[#384877]/70";
  if (ratio > 0.25) return "bg-[#384877]/40";
  return "bg-[#384877]/15";
}

export default function ProductHeatmap({ tasks, notes, behaviors }) {
  const { grid, maxVal, peakInfo, daySummary } = useMemo(() => {
    const g = {};
    let max = 0;

    const addPoint = (dateStr) => {
      if (!dateStr) return;
      const date = new Date(dateStr);
      if (isNaN(date)) return;
      const day = (date.getDay() + 6) % 7;
      const hour = date.getHours();
      const key = `${day}-${hour}`;
      g[key] = (g[key] || 0) + 1;
      if (g[key] > max) max = g[key];
    };

    tasks?.forEach(t => {
      if (t.deleted_at) return;
      addPoint(t.completed_at);
      addPoint(t.reminder_time);
      addPoint(t.created_date);
    });

    notes?.forEach(n => {
      if (n.deleted_at) return;
      addPoint(n.created_date);
    });

    behaviors?.forEach(b => {
      if (b.day_of_week === undefined || b.hour_of_day === undefined) return;
      const day = (b.day_of_week + 6) % 7;
      const key = `${day}-${b.hour_of_day}`;
      g[key] = (g[key] || 0) + 1;
      if (g[key] > max) max = g[key];
    });

    // Peak analysis
    const hourTotals = {};
    Object.entries(g).forEach(([key, val]) => {
      const hour = parseInt(key.split("-")[1]);
      hourTotals[hour] = (hourTotals[hour] || 0) + val;
    });
    const peakHour = Object.entries(hourTotals).sort((a, b) => b[1] - a[1])[0];
    const ph = peakHour ? parseInt(peakHour[0]) : null;

    const typeLabels = {
      early_morning: { label: "晨型人", icon: Sunrise, desc: "清晨5-9点最活跃，建议将重要约定安排在此时段" },
      morning: { label: "上午高效", icon: Sun, desc: "9-12点是黄金时段，适合安排深度工作" },
      noon: { label: "午间活跃", icon: Sun, desc: "习惯中午处理事务，注意适当休息" },
      afternoon: { label: "下午专注", icon: Sunset, desc: "2-6点专注时段，可安排复杂任务" },
      evening: { label: "夜间活跃", icon: Moon, desc: "晚间6-10点更高效，注意平衡作息" },
      night: { label: "夜猫子", icon: Moon, desc: "深夜工作偏好明显，建议关注睡眠" },
    };

    let peakLabel = null;
    if (ph !== null) {
      if (ph >= 5 && ph < 9) peakLabel = "early_morning";
      else if (ph >= 9 && ph < 12) peakLabel = "morning";
      else if (ph >= 12 && ph < 14) peakLabel = "noon";
      else if (ph >= 14 && ph < 18) peakLabel = "afternoon";
      else if (ph >= 18 && ph < 22) peakLabel = "evening";
      else peakLabel = "night";
    }

    const dayTotals = {};
    Object.entries(g).forEach(([key, val]) => {
      const day = parseInt(key.split("-")[0]);
      dayTotals[day] = (dayTotals[day] || 0) + val;
    });
    const sortedDays = Object.entries(dayTotals).sort((a, b) => b[1] - a[1]);

    return {
      grid: g, maxVal: max,
      peakInfo: peakLabel ? typeLabels[peakLabel] : null,
      daySummary: { peak: sortedDays[0], low: sortedDays[sortedDays.length - 1] }
    };
  }, [tasks, notes, behaviors]);

  const PeakIcon = peakInfo?.icon || Sun;
  const displayHours = HOURS.filter(h => h >= 6 && h <= 23);

  return (
    <div className="space-y-4">
      {peakInfo && (
        <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-[#384877]/5 to-transparent rounded-xl border border-[#384877]/10">
          <div className="w-10 h-10 rounded-xl bg-[#384877]/10 flex items-center justify-center">
            <PeakIcon className="w-5 h-5 text-[#384877]" />
          </div>
          <div className="flex-1">
            <div className="font-semibold text-sm text-slate-800">{peakInfo.label}</div>
            <div className="text-xs text-slate-500">{peakInfo.desc}</div>
          </div>
          <Link to="/Dashboard" className="text-xs text-[#384877] hover:underline flex items-center gap-0.5 shrink-0">
            去规划 <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      )}

      {daySummary.peak && (
        <div className="flex gap-2">
          <div className="flex-1 bg-emerald-50 rounded-xl p-2.5 border border-emerald-100">
            <div className="text-[10px] text-emerald-600 font-medium">最活跃</div>
            <div className="text-sm font-bold text-emerald-700">{DAYS[parseInt(daySummary.peak[0])]}</div>
          </div>
          {daySummary.low && daySummary.low[0] !== daySummary.peak[0] && (
            <div className="flex-1 bg-amber-50 rounded-xl p-2.5 border border-amber-100">
              <div className="text-[10px] text-amber-600 font-medium">最空闲</div>
              <div className="text-sm font-bold text-amber-700">{DAYS[parseInt(daySummary.low[0])]}</div>
            </div>
          )}
        </div>
      )}

      <div className="bg-white rounded-2xl p-4 border border-slate-100">
        <div className="overflow-x-auto">
          <div className="min-w-[480px]">
            <div className="flex items-center gap-0.5 mb-1 pl-10">
              {displayHours.map(h => (
                <div key={h} className="flex-1 text-center text-[10px] text-slate-400">
                  {h % 3 === 0 ? `${h}:00` : ""}
                </div>
              ))}
            </div>
            {DAYS.map((day, dayIdx) => (
              <div key={day} className="flex items-center gap-0.5 mb-0.5">
                <div className="w-10 text-xs text-slate-500 text-right pr-2 flex-shrink-0">{day}</div>
                {displayHours.map(hour => (
                  <div
                    key={hour}
                    className={`flex-1 aspect-square rounded-sm ${getHeatColor(grid[`${dayIdx}-${hour}`] || 0, maxVal)} transition-colors`}
                    title={`${day} ${hour}:00 - ${grid[`${dayIdx}-${hour}`] || 0}次活动`}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between mt-3">
          <span className="text-[10px] text-slate-400">综合约定·心签·行为数据</span>
          <div className="flex items-center gap-1 text-xs text-slate-400">
            <span>少</span>
            <div className="w-3 h-3 rounded-sm bg-slate-50 border border-slate-100" />
            <div className="w-3 h-3 rounded-sm bg-[#384877]/15" />
            <div className="w-3 h-3 rounded-sm bg-[#384877]/40" />
            <div className="w-3 h-3 rounded-sm bg-[#384877]/70" />
            <div className="w-3 h-3 rounded-sm bg-[#384877]" />
            <span>多</span>
          </div>
        </div>
      </div>
    </div>
  );
}