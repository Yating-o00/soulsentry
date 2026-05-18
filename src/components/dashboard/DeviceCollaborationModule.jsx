import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO, isToday, startOfDay, endOfDay, isWithinInterval } from "date-fns";
import { motion } from "framer-motion";
import { Cpu } from "lucide-react";
import DeviceStrategyMap from "./planner/DeviceStrategyMap";

/**
 * 全设备智能协同 — 独立模块
 * 提醒来源：
 *  1) 当日 DailyPlan.devices 策略（智能日程规划生成）
 *  2) 当日需要提醒的 Task 约定（注入手机设备）
 *  3) 当日活动的 Note 心签（注入工作站设备）
 * 无任何提醒时不渲染。
 */

function timeFromISO(iso) {
  try {
    return format(parseISO(iso), "HH:mm");
  } catch {
    return "";
  }
}

function priorityFromTask(t) {
  if (t.priority === "urgent" || t.priority === "high") return "high";
  if (t.priority === "low") return "low";
  return "medium";
}

function isTaskTodayActive(t) {
  if (!t || t.deleted_at || t.status === "completed" || t.status === "cancelled") return false;
  if (!t.reminder_time) return false;
  const start = parseISO(t.reminder_time);
  const end = t.end_time ? parseISO(t.end_time) : start;
  return isWithinInterval(new Date(), { start: startOfDay(start), end: endOfDay(end) });
}

function mergeDevicesWithReminders(baseDevices, taskStrategies, noteStrategies) {
  const map = new Map();
  for (const d of baseDevices || []) {
    map.set(d.id, { ...d, strategies: [...(d.strategies || [])] });
  }
  if (taskStrategies.length > 0) {
    const phone = map.get("phone") || { id: "phone", name: "手机", strategies: [] };
    phone.strategies = [...(phone.strategies || []), ...taskStrategies];
    map.set("phone", phone);
  }
  if (noteStrategies.length > 0) {
    const pc = map.get("pc") || { id: "pc", name: "工作站", strategies: [] };
    pc.strategies = [...(pc.strategies || []), ...noteStrategies];
    map.set("pc", pc);
  }
  // dedupe by (time + normalized content) and sort by time per device
  const normKey = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, "");
  for (const d of map.values()) {
    const seen = new Set();
    d.strategies = (d.strategies || []).filter((s) => {
      const key = `${normKey(s.time)}|${normKey(s.content)}`;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    d.strategies.sort((a, b) => String(a.time || "").localeCompare(String(b.time || "")));
  }
  return Array.from(map.values());
}

export default function DeviceCollaborationModule() {
  const todayStr = format(new Date(), "yyyy-MM-dd");

  const { data: planQueryData } = useQuery({
    queryKey: ['dailyPlan', todayStr],
    queryFn: () => base44.entities.DailyPlan.filter({ plan_date: todayStr }),
    staleTime: 2 * 60 * 1000,
  });

  const { data: allTasks = [] } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => base44.entities.Task.list('-reminder_time'),
    initialData: [],
    staleTime: 2 * 60 * 1000,
  });

  const { data: allNotes = [] } = useQuery({
    queryKey: ['notes'],
    queryFn: () => base44.entities.Note.list('-created_date', 100),
    initialData: [],
    staleTime: 2 * 60 * 1000,
  });

  const dayPlan = planQueryData?.[0] || null;
  const baseDevices = dayPlan?.plan_json?.devices || [];

  // 当日需要提醒的 Task → 手机策略
  const taskStrategies = React.useMemo(() => {
    return (allTasks || [])
      .filter(isTaskTodayActive)
      .map((t) => ({
        time: timeFromISO(t.reminder_time),
        content: t.title,
        method: "推送提醒",
        priority: priorityFromTask(t),
        source: "task",
      }));
  }, [allTasks]);

  // 当日活动的 Note 心签 → 工作站策略
  const noteStrategies = React.useMemo(() => {
    return (allNotes || [])
      .filter((n) => {
        if (!n || n.deleted_at) return false;
        const ref = n.last_active_at || n.updated_date || n.created_date;
        if (!ref) return false;
        try { return isToday(parseISO(ref)); } catch { return false; }
      })
      .slice(0, 8)
      .map((n) => {
        const ref = n.last_active_at || n.updated_date || n.created_date;
        const text = n.plain_text || (n.content || "").replace(/<[^>]+>/g, "").trim();
        return {
          time: timeFromISO(ref),
          content: text ? (text.length > 60 ? text.slice(0, 60) + "…" : text) : "心签更新",
          method: "心签速记",
          priority: n.is_pinned ? "high" : "low",
          source: "note",
        };
      });
  }, [allNotes]);

  const devices = React.useMemo(
    () => mergeDevicesWithReminders(baseDevices, taskStrategies, noteStrategies),
    [baseDevices, taskStrategies, noteStrategies]
  );

  const hasAny = devices.some((d) => d.strategies && d.strategies.length > 0);
  if (!hasAny) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25 }}
      className="bg-white rounded-[28px] border border-slate-100/80 shadow-[0_8px_28px_rgba(140,147,201,0.12)] overflow-hidden"
    >
      <div className="px-5 md:px-6 pt-5 pb-4 border-b border-slate-100/60">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#384877] to-[#5b6dae] flex items-center justify-center shadow-lg shadow-[#384877]/25 shrink-0">
            <Cpu className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-slate-900 text-[15px] leading-tight">全设备智能协同</h3>
            <p className="text-xs text-slate-400 mt-0.5">AI 自动调度多端设备分发策略</p>
          </div>
        </div>
      </div>
      <div className="px-5 md:px-6 py-5">
        <DeviceStrategyMap devices={devices} />
      </div>
    </motion.div>
  );
}