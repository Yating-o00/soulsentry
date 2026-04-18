import React from "react";
import { Sunrise, Sun, Sunset, Moon } from "lucide-react";

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

function getTimeLabel(hour) {
  if (hour >= 5 && hour < 9) return "early_morning";
  if (hour >= 9 && hour < 12) return "morning";
  if (hour >= 12 && hour < 14) return "noon";
  if (hour >= 14 && hour < 18) return "afternoon";
  if (hour >= 18 && hour < 22) return "evening";
  return "night";
}

export default function TimeHeatmap({ tasks, behaviors }) {
  // Build heatmap data from tasks and behaviors
  const grid = {};
  let maxVal = 0;

  // Process tasks
  tasks?.forEach(t => {
    if (!t.reminder_time && !t.completed_at) return;
    const date = new Date(t.completed_at || t.reminder_time);
    const day = (date.getDay() + 6) % 7; // Mon=0
    const hour = date.getHours();
    const key = `${day}-${hour}`;
    grid[key] = (grid[key] || 0) + 1;
    if (grid[key] > maxVal) maxVal = grid[key];
  });

  // Process behavior logs
  behaviors?.forEach(b => {
    if (b.day_of_week === undefined || b.hour_of_day === undefined) return;
    const day = (b.day_of_week + 6) % 7;
    const hour = b.hour_of_day;
    const key = `${day}-${hour}`;
    grid[key] = (grid[key] || 0) + 1;
    if (grid[key] > maxVal) maxVal = grid[key];
  });

  // Calculate peak hours
  const hourTotals = {};
  Object.entries(grid).forEach(([key, val]) => {
    const hour = parseInt(key.split("-")[1]);
    hourTotals[hour] = (hourTotals[hour] || 0) + val;
  });
  const peakHour = Object.entries(hourTotals).sort((a, b) => b[1] - a[1])[0];
  const peakLabel = peakHour ? getTimeLabel(parseInt(peakHour[0])) : null;

  const typeLabels = {
    early_morning: { label: "晨型人", icon: Sunrise, desc: "你在清晨5-9点最活跃" },
    morning: { label: "上午高效", icon: Sun, desc: "上午9-12点是你的黄金时段" },
    noon: { label: "午间活跃", icon: Sun, desc: "你习惯在中午处理事务" },
    afternoon: { label: "下午专注", icon: Sunset, desc: "下午2-6点是你的专注时段" },
    evening: { label: "夜间活跃", icon: Moon, desc: "你在晚间6-10点更高效" },
    night: { label: "夜猫子", icon: Moon, desc: "你偏好深夜工作" },
  };

  const peakInfo = peakLabel ? typeLabels[peakLabel] : null;
  const PeakIcon = peakInfo?.icon || Sun;

  // Show only key hours: 6-23
  const displayHours = HOURS.filter(h => h >= 6 && h <= 23);

  return (
    <div className="space-y-4">
      {/* Peak insight */}
      {peakInfo && (
        <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-[#384877]/5 to-transparent rounded-xl border border-[#384877]/10">
          <div className="w-10 h-10 rounded-xl bg-[#384877]/10 flex items-center justify-center">
            <PeakIcon className="w-5 h-5 text-[#384877]" />
          </div>
          <div>
            <div className="font-semibold text-sm text-slate-800">{peakInfo.label}</div>
            <div className="text-xs text-slate-500">{peakInfo.desc}</div>
          </div>
        </div>
      )}

      {/* Heatmap grid */}
      <div className="overflow-x-auto">
        <div className="min-w-[500px]">
          {/* Hour labels */}
          <div className="flex items-center gap-0.5 mb-1 pl-10">
            {displayHours.map(h => (
              <div key={h} className="flex-1 text-center text-[10px] text-slate-400">
                {h % 3 === 0 ? `${h}:00` : ""}
              </div>
            ))}
          </div>

          {/* Rows */}
          {DAYS.map((day, dayIdx) => (
            <div key={day} className="flex items-center gap-0.5 mb-0.5">
              <div className="w-10 text-xs text-slate-500 text-right pr-2 flex-shrink-0">{day}</div>
              {displayHours.map(hour => {
                const val = grid[`${dayIdx}-${hour}`] || 0;
                return (
                  <div
                    key={hour}
                    className={`flex-1 aspect-square rounded-sm ${getHeatColor(val, maxVal)} transition-colors`}
                    title={`${day} ${hour}:00 - ${val}次活动`}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-end gap-1 text-xs text-slate-400">
        <span>少</span>
        <div className="w-3 h-3 rounded-sm bg-slate-50 border border-slate-100" />
        <div className="w-3 h-3 rounded-sm bg-[#384877]/15" />
        <div className="w-3 h-3 rounded-sm bg-[#384877]/40" />
        <div className="w-3 h-3 rounded-sm bg-[#384877]/70" />
        <div className="w-3 h-3 rounded-sm bg-[#384877]" />
        <span>多</span>
      </div>
    </div>
  );
}