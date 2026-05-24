import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO, isToday, startOfDay, endOfDay, isWithinInterval } from "date-fns";
import { motion } from "framer-motion";
import { Cpu } from "lucide-react";
import DeviceStrategyPanel from "./planner/DeviceStrategyPanel";
import ConnectedDevicesPanel from "@/components/devices/ConnectedDevicesPanel";
import { listMyDevices } from "@/lib/deviceRegistry";

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

// NLP：识别 title 里没有具体时间点的模糊表达，返回语义时间标签
function detectFuzzyTimeLabel(title) {
  if (!title) return null;
  const s = String(title);
  // 已含具体时间点（08:00 / 8点 / 上午9点 / 晚上8点半）→ 不是模糊
  if (/\d{1,2}\s*[:：]\s*\d{2}/.test(s)) return null;
  if (/[上下中]午\s*\d{1,2}\s*[点时]/.test(s)) return null;
  if (/(早上|晚上|中午|凌晨|傍晚)\s*\d{1,2}\s*[点时]/.test(s)) return null;
  if (/\d{1,2}\s*[点时]/.test(s)) return null;
  // 纯日期+无时间点 → 用日期词作为语义标签
  if (/今晚|今夜/.test(s)) return "今晚";
  if (/今早|今天早上|今天上午/.test(s)) return "今早";
  if (/今天下午|今下午/.test(s)) return "今天下午";
  if (/今天|今日/.test(s)) return "今日";
  if (/明早|明天早上|明天上午/.test(s)) return "明早";
  if (/明晚|明天晚上/.test(s)) return "明晚";
  if (/明天|明日/.test(s)) return "明日";
  if (/后天/.test(s)) return "后天";
  if (/这周末|本周末|周末/.test(s)) return "周末";
  if (/下周/.test(s)) return "下周";
  if (/这周|本周/.test(s)) return "本周";
  return null;
}

// 决定一条 task 在协同卡片里显示的时间字段
function resolveTaskTimeField(t) {
  const fuzzy = detectFuzzyTimeLabel(t.title);
  // 如果 title 是模糊表达，且系统标记为 time_is_suggested（AI 猜的时间，非用户给的）→ 用语义标签
  if (fuzzy && t.time_is_suggested) return fuzzy;
  // 否则按 reminder_time 显示具体时间点
  return timeFromISO(t.reminder_time);
}

// 同时间合并内容 + 同内容合并时间（取最早），保持时间排序
function consolidateStrategies(strategies) {
  const norm = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, "");
  const priorityWeight = { high: 3, medium: 2, low: 1 };
  const pickPriority = (a, b) =>
    (priorityWeight[a] || 0) >= (priorityWeight[b] || 0) ? a : b;

  // Step 1: 同内容合并 — 只保留最早时间
  const byContent = new Map();
  for (const s of strategies) {
    const k = norm(s.content);
    if (!k) continue;
    const prev = byContent.get(k);
    if (!prev) {
      byContent.set(k, { ...s });
    } else {
      // 取最早时间
      const earlier = String(s.time || "") < String(prev.time || "") ? s.time : prev.time;
      byContent.set(k, {
        ...prev,
        time: earlier,
        priority: pickPriority(prev.priority, s.priority),
      });
    }
  }
  const dedupedByContent = Array.from(byContent.values());

  // Step 2: 同时间合并内容 — 内容用 " · " 拼接
  const byTime = new Map();
  for (const s of dedupedByContent) {
    const k = norm(s.time);
    if (!k) {
      // 没时间字段的单独放
      byTime.set(`__notime_${byTime.size}__`, s);
      continue;
    }
    const prev = byTime.get(k);
    if (!prev) {
      byTime.set(k, { ...s });
    } else {
      const merged = `${prev.content} · ${s.content}`;
      byTime.set(k, {
        ...prev,
        content: merged,
        priority: pickPriority(prev.priority, s.priority),
        method: prev.method === s.method ? prev.method : "多端提醒",
      });
    }
  }

  return Array.from(byTime.values()).sort((a, b) =>
    String(a.time || "").localeCompare(String(b.time || ""))
  );
}

// 按设备形态过滤策略 — 不同设备承担不同协同职责
function filterStrategiesForDevice(deviceType, taskStrategies, noteStrategies) {
  const out = [];
  switch (deviceType) {
    case "phone":
      // 手机:全量推送提醒 — 这是用户主要随身设备
      out.push(...taskStrategies.map((s) => ({ ...s, method: "推送提醒" })));
      break;
    case "pc":
      // 电脑/工作站:深度工作场景 — 桌面通知 + 心签更新 + 工作时段任务(9:00-19:00)
      out.push(
        ...taskStrategies
          .filter((s) => {
            const h = parseInt(String(s.time || "").slice(0, 2), 10);
            // 模糊时间(无数字)也保留;具体时间只保留工作时段
            return isNaN(h) || (h >= 9 && h <= 19);
          })
          .map((s) => ({ ...s, method: "桌面通知" }))
      );
      out.push(...noteStrategies.map((s) => ({ ...s, method: "心签速记" })));
      break;
    case "tablet":
      // 平板:阅读/会议场景 — 中高优先级任务 + 心签
      out.push(
        ...taskStrategies
          .filter((s) => s.priority !== "low")
          .map((s) => ({ ...s, method: "横屏提醒" }))
      );
      out.push(...noteStrategies.slice(0, 4).map((s) => ({ ...s, method: "阅读卡片" })));
      break;
    case "watch":
      // 手表:极简 — 仅 high 紧急任务,内容截短
      out.push(
        ...taskStrategies
          .filter((s) => s.priority === "high")
          .map((s) => ({
            ...s,
            content: s.content && s.content.length > 14 ? s.content.slice(0, 14) + "…" : s.content,
            method: "腕上震动",
          }))
      );
      break;
    case "speaker":
      // 音箱:语音播报 — 仅整点/带具体时间点的任务
      out.push(
        ...taskStrategies
          .filter((s) => /^\d{2}:\d{2}$/.test(String(s.time || "")))
          .map((s) => ({ ...s, method: "语音播报" }))
      );
      break;
    default:
      // 其它/未知设备:给一份精简版任务
      out.push(...taskStrategies.slice(0, 5).map((s) => ({ ...s, method: "通用提醒" })));
  }
  return out;
}

function mergeDevicesWithReminders(baseDevices, taskStrategies, noteStrategies, realDevices) {
  const map = new Map();
  for (const d of baseDevices || []) {
    // 若 baseDevices 未带 device_type,用 id 作为 type 兜底(plan_json 中 id 通常就是 phone/pc 等)
    map.set(d.id, { ...d, device_type: d.device_type || d.id, strategies: [...(d.strategies || [])] });
  }

  // 用真实已连接设备覆盖:支持所有设备形态(手机/电脑/平板/手表/音箱)
  const supportedTypes = ["phone", "pc", "tablet", "watch", "speaker"];
  const realByType = {};
  for (const rd of realDevices || []) {
    const key = supportedTypes.includes(rd.device_type) ? rd.device_type : null;
    if (key && !realByType[key]) realByType[key] = rd;
  }
  const defaultNames = {
    phone: "手机",
    pc: "电脑",
    tablet: "平板",
    watch: "手表",
    speaker: "音箱",
  };
  for (const key of Object.keys(realByType)) {
    const rd = realByType[key];
    const prev = map.get(key) || { id: key, device_type: key, strategies: [] };
    map.set(key, {
      ...prev,
      id: key,
      device_type: key,
      name: rd.name || prev.name || defaultNames[key] || "设备",
      online: !!rd.is_online,
      isReal: true,
    });
  }

  // 按设备形态差异化分发策略
  for (const [key, dev] of map.entries()) {
    const typeKey = dev.device_type || key;
    const extra = filterStrategiesForDevice(typeKey, taskStrategies, noteStrategies);
    if (extra.length > 0) {
      dev.strategies = [...(dev.strategies || []), ...extra];
      map.set(key, dev);
    }
  }
  for (const d of map.values()) {
    d.strategies = consolidateStrategies(d.strategies || []);
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

  const { data: realDevices = [] } = useQuery({
    queryKey: ['my-devices'],
    queryFn: () => listMyDevices(),
    initialData: [],
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
  });

  const dayPlan = planQueryData?.[0] || null;
  const baseDevices = dayPlan?.plan_json?.devices || [];

  // 当日需要提醒的 Task → 手机策略（NLP 识别模糊时间）
  const taskStrategies = React.useMemo(() => {
    return (allTasks || [])
      .filter(isTaskTodayActive)
      .map((t) => ({
        time: resolveTaskTimeField(t),
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
    () => mergeDevicesWithReminders(baseDevices, taskStrategies, noteStrategies, realDevices),
    [baseDevices, taskStrategies, noteStrategies, realDevices]
  );

  // 按 device_type 聚合策略,便于真实设备卡片显示策略数与时间轴
  // 归一化 key：把 baseDevices 中可能出现的 'workstation' / 'desktop' 统一映射到 'pc'
  const normalizeTypeKey = (raw) => {
    const k = String(raw || "").toLowerCase();
    if (k === "phone" || k === "mobile" || k === "iphone") return "phone";
    if (k === "pc" || k === "workstation" || k === "desktop" || k === "computer" || k === "laptop") return "pc";
    if (k === "tablet" || k === "ipad") return "tablet";
    if (k === "watch") return "watch";
    return k || "other";
  };

  const strategiesByType = React.useMemo(() => {
    const map = {};
    for (const d of devices) {
      if (!d.strategies || d.strategies.length === 0) continue;
      const key = normalizeTypeKey(d.device_type || d.id);
      map[key] = [...(map[key] || []), ...d.strategies];
    }
    return map;
  }, [devices]);

  const [selectedDevice, setSelectedDevice] = React.useState(null);
  // 默认选当前设备
  const effectiveSelected = selectedDevice
    || (realDevices || []).find((d) => d.is_current)
    || (realDevices || [])[0]
    || null;

  const hasAnyStrategy = devices.some((d) => d.strategies && d.strategies.length > 0);
  const hasAnyRealDevice = (realDevices || []).length > 0;
  if (!hasAnyStrategy && !hasAnyRealDevice) return null;

  const selectedStrategies = effectiveSelected
    ? (strategiesByType[normalizeTypeKey(effectiveSelected.device_type)] || [])
    : [];

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
            <p className="text-xs text-slate-400 mt-0.5">点击下方设备查看分配到该终端的策略</p>
          </div>
        </div>
      </div>
      <div className="px-5 md:px-6 py-5 space-y-5">
        <ConnectedDevicesPanel
          selectedDeviceId={effectiveSelected?.id}
          onSelectDevice={setSelectedDevice}
          strategiesByType={strategiesByType}
        />
        {effectiveSelected && (
          <DeviceStrategyPanel
            deviceType={effectiveSelected.device_type}
            deviceName={effectiveSelected.name}
            strategies={selectedStrategies}
          />
        )}
      </div>
    </motion.div>
  );
}