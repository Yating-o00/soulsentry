import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO, isToday, startOfDay, endOfDay, isWithinInterval } from "date-fns";
import { motion } from "framer-motion";
import { Cpu } from "lucide-react";
import DeviceStrategyPanel from "./planner/DeviceStrategyPanel";
import ConnectedDevicesPanel from "@/components/devices/ConnectedDevicesPanel";
import { listMyDevices } from "@/lib/deviceRegistry";
import { resolveDeviceBrand } from "@/components/devices/DeviceBrandIcon";
import { rewriteStrategiesForDevice } from "./planner/deviceStrategyRewriter";

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

// ===== 设备优势画像 =====
// 每种设备根据自身物理/场景优势,只接它最擅长的活,避免所有设备都收到同样的提醒
//
// 手机 phone   → 随身/移动 → 出行、社交沟通、外勤、地点关联、突发提醒
// 电脑 pc      → 深度专注/创造 → 文档/写作/编码/会议/长任务/心签编辑
// 平板 tablet  → 阅读/手写/沉浸 → 长文心签、复盘、晨间/晚间安静时段
// 手表 watch   → 贴身/不打扰 → 仅紧急 + 关键时间锚点 + 极短摘要
// 音箱 speaker → 无屏/环境 → 整点语音播报、晨间汇报、家庭时段(早 7-9 / 晚 19-22)

// 按关键词识别任务"主场景",决定它属于哪类设备的优势区
function classifyTaskScene(s) {
  const txt = String(s.content || "").toLowerCase();
  // 驾驶/通勤 — 汽车优势(独立于普通移动)
  if (/开车|自驾|加油|充电|车|高速|停车|送车|提车|洗车|挪车|车检/.test(txt)) {
    return "driving";
  }
  // 会议/见面 — 眼镜(AR)+手机协同
  if (/会议|见面|拜访|客户|签约|谈判|面试|对接|演讲|路演|展会|峰会/.test(txt)) {
    return "meeting";
  }
  // 移动/外出/社交 — 手机优势
  if (/出门|出发|路上|地铁|打车|外出|约|电话|通话|短信|微信|回复|发消息|快递|取件|买|购物|超市|医院|银行|机场|高铁|约会|接送|接娃/.test(txt)) {
    return "mobile";
  }
  // 深度工作/创造 — 电脑优势
  if (/写|文档|报告|方案|ppt|表格|excel|代码|开发|编码|设计|画|剪辑|渲染|整理|分析|研究|review|代码评审|提交代码|debug|总结|复盘|邮件|email|回邮件/.test(txt)) {
    return "focus";
  }
  // 阅读/学习/思考 — 平板优势
  if (/读|阅读|看书|学习|背|复习|笔记|手写|批注|论文|文章|课程|视频课/.test(txt)) {
    return "reading";
  }
  // 家庭/生活/作息 — 音箱/家居优势
  if (/吃|做饭|喝水|吃药|睡|起床|早安|晚安|洗漱|运动|健身|拉伸|冥想|家务|窗帘|空调|灯|加湿器/.test(txt)) {
    return "ambient";
  }
  return "general";
}

// 从用户作息中读取关键时间点(HH:mm → 小时数),用于设备时段判断
function routineHours(routine) {
  const toH = (s) => {
    if (!s) return null;
    const h = parseInt(String(s).slice(0, 2), 10);
    return isNaN(h) ? null : h;
  };
  return {
    leaveHome: toH(routine?.leave_home),     // 通勤开始
    arriveOffice: toH(routine?.arrive_office), // 进入工作时段
    leaveOffice: toH(routine?.leave_office),   // 结束工作
    arriveHome: toH(routine?.arrive_home),     // 回家
    sleep: toH(routine?.sleep),                 // 入睡
    wakeUp: toH(routine?.wake_up),              // 起床
  };
}

// 时间段判定:用于音箱(家庭时段)、平板(安静时段)
function getHourFromTime(t) {
  const h = parseInt(String(t || "").slice(0, 2), 10);
  return isNaN(h) ? null : h;
}

// 按设备形态过滤策略 — 不同设备只承担它的优势工作
// routine: 用户作息(可选),用来把"工作时段/家庭时段"贴合本人节奏,而不是硬编码 9-19
function filterStrategiesForDevice(deviceType, taskStrategies, noteStrategies, routine) {
  const out = [];

  // 给每条任务打上场景标签,后面各设备按场景挑活
  const tagged = taskStrategies.map((s) => ({ ...s, _scene: classifyTaskScene(s) }));

  // 把用户作息转成小时阈值,缺省值兜底
  const r = routineHours(routine || {});
  const workStart = r.arriveOffice ?? 9;
  const workEnd = r.leaveOffice ?? 19;
  const homeMorningStart = r.wakeUp ?? 7;
  const homeMorningEnd = (r.leaveHome ?? 10);
  const homeEveningStart = r.arriveHome ?? 19;
  const homeEveningEnd = (r.sleep ?? 23);

  switch (deviceType) {
    case "phone": {
      // 手机优势:随身、随时震动、可定位、社交触达
      // → 收:移动/社交/外出类 + 所有 high/urgent(随身兜底,关键事不能漏)
      const picks = tagged.filter(
        (s) => s._scene === "mobile" || s._scene === "meeting" || s.priority === "high"
      );
      out.push(...picks.map((s) => ({
        ...s,
        method: s._scene === "mobile" ? "出行推送" : s._scene === "meeting" ? "会前提示" : "随身推送",
      })));
      break;
    }
    case "pc": {
      // 电脑优势:大屏、键盘、长会话、文档/代码/邮件入口
      // → 收:深度工作类 + 个人工作时段的中高优 + 所有心签编辑
      const picks = tagged.filter((s) => {
        if (s._scene === "focus") return true;
        const h = getHourFromTime(s.time);
        return h !== null && h >= workStart && h <= workEnd && s.priority !== "low";
      });
      out.push(...picks.map((s) => ({ ...s, method: "桌面通知" })));
      out.push(...noteStrategies.map((s) => ({ ...s, method: "心签编辑" })));
      break;
    }
    case "tablet": {
      // 平板优势:大屏阅读、手写、沉浸式、安静时段(早晨/夜间)
      // → 收:阅读/学习类 + 个人晨间/夜间时段的非紧急任务 + 长心签
      const picks = tagged.filter((s) => {
        if (s._scene === "reading") return true;
        if (s.priority === "high") return false; // 紧急的让手机处理
        const h = getHourFromTime(s.time);
        if (h === null) return false;
        const inMorning = h >= homeMorningStart && h < homeMorningEnd;
        const inEvening = h >= homeEveningStart && h <= homeEveningEnd;
        return inMorning || inEvening;
      });
      out.push(...picks.map((s) => ({ ...s, method: "沉浸阅读" })));
      // 长心签优先在平板上呈现(便于手写批注)
      out.push(
        ...noteStrategies
          .filter((n) => (n.content || "").length > 30)
          .slice(0, 4)
          .map((s) => ({ ...s, method: "心签批注" }))
      );
      break;
    }
    case "watch": {
      // 手表优势:贴身、抬腕可见、不打扰他人 — 极简哲学
      // → 只收紧急任务,内容截短到 14 字,只保留关键信息
      out.push(
        ...tagged
          .filter((s) => s.priority === "high")
          .slice(0, 5) // 一天最多 5 条,守住贴身设备的克制
          .map((s) => ({
            ...s,
            content:
              s.content && s.content.length > 14
                ? s.content.slice(0, 14) + "…"
                : s.content,
            method: "腕上震动",
          }))
      );
      break;
    }
    case "speaker": {
      // 音箱优势:无屏、语音、环境感知 — 家庭场景的"播报员"
      // → 只在家庭时段(早/晚 由作息决定)播报,且必须是整点任务或生活作息类
      const picks = tagged.filter((s) => {
        const h = getHourFromTime(s.time);
        const inHomeHour = h !== null && (
          (h >= homeMorningStart && h < homeMorningEnd) ||
          (h >= homeEveningStart && h <= homeEveningEnd)
        );
        const isAmbient = s._scene === "ambient";
        const isHourlyAnchor = /^\d{2}:00$/.test(String(s.time || ""));
        return isAmbient || (inHomeHour && isHourlyAnchor);
      });
      out.push(...picks.map((s) => ({ ...s, method: "语音播报" })));
      break;
    }
    case "glasses": {
      // 眼镜优势:AR 浮窗、解放双手、贴近视线
      // → 收:会议/见面前的预备提示(显示对方资料/上次见面回顾) + 高优紧急(浮窗一瞥)
      // 一天最多 6 条,避免视野持续打扰
      const picks = tagged.filter(
        (s) => s._scene === "meeting" || s.priority === "high"
      ).slice(0, 6);
      out.push(...picks.map((s) => ({
        ...s,
        method: s._scene === "meeting" ? "AR 资料浮窗" : "视线浮窗",
      })));
      break;
    }
    case "car": {
      // 汽车优势:车载语音、导航、驾驶安全场景
      // → 收:驾驶相关任务 + 通勤时段(出门→到办公室、下班→回家)的高优提示
      const picks = tagged.filter((s) => {
        if (s._scene === "driving") return true;
        if (s.priority !== "high") return false;
        const h = getHourFromTime(s.time);
        if (h === null) return false;
        const inMorningCommute = r.leaveHome !== null && r.arriveOffice !== null &&
          h >= r.leaveHome && h <= r.arriveOffice;
        const inEveningCommute = r.leaveOffice !== null && r.arriveHome !== null &&
          h >= r.leaveOffice && h <= r.arriveHome;
        return inMorningCommute || inEveningCommute;
      });
      out.push(...picks.map((s) => ({ ...s, method: "车载语音" })));
      break;
    }
    case "home": {
      // 家居优势:环境调节(灯光/温度/音乐)、整点播报、晨起/睡前流程
      // → 收:生活作息类 + 起床/睡前 锚点附近的中低优
      const picks = tagged.filter((s) => {
        if (s._scene === "ambient") return true;
        const h = getHourFromTime(s.time);
        if (h === null) return false;
        // 在起床/睡前的 ±1 小时窗口,且不是高紧急(高紧急让手机+手表去)
        if (s.priority === "high") return false;
        const nearWake = r.wakeUp !== null && Math.abs(h - r.wakeUp) <= 1;
        const nearSleep = r.sleep !== null && Math.abs(h - r.sleep) <= 1;
        return nearWake || nearSleep;
      });
      out.push(...picks.map((s) => ({ ...s, method: "家居场景联动" })));
      break;
    }
    default:
      // 未知设备:给一份精简版,只接中高优
      out.push(
        ...tagged
          .filter((s) => s.priority !== "low")
          .slice(0, 5)
          .map((s) => ({ ...s, method: "通用提醒" }))
      );
  }
  // 清理掉内部辅助字段
  return out.map(({ _scene, ...rest }) => rest);
}

// 归一化设备 type:把数据库里可能的脏值 (iphone/workstation/desktop/other/...) 映射到标准 8 类
function normalizeDeviceTypeKey(raw) {
  const k = String(raw || "").toLowerCase();
  if (k === "phone" || k === "mobile" || k === "iphone" || k === "android") return "phone";
  if (k === "pc" || k === "workstation" || k === "desktop" || k === "computer" || k === "laptop" || k === "mac" || k === "macos" || k === "windows") return "pc";
  if (k === "tablet" || k === "ipad") return "tablet";
  if (k === "watch" || k === "applewatch") return "watch";
  if (k === "speaker" || k === "homepod") return "speaker";
  if (k === "glasses" || k === "ar" || k === "xr" || k === "vr") return "glasses";
  if (k === "car" || k === "vehicle" || k === "auto") return "car";
  if (k === "home" || k === "smarthome" || k === "iot") return "home";
  return null;
}

function mergeDevicesWithReminders(baseDevices, taskStrategies, noteStrategies, realDevices, routine) {
  const map = new Map();
  for (const d of baseDevices || []) {
    // 若 baseDevices 未带 device_type,用 id 作为 type 兜底(plan_json 中 id 通常就是 phone/pc 等)
    const baseType = normalizeDeviceTypeKey(d.device_type || d.id) || d.device_type || d.id;
    map.set(baseType, { ...d, id: baseType, device_type: baseType, strategies: [...(d.strategies || [])] });
  }

  // 用真实已连接设备覆盖:优先信任 UA 实时判定的形态,再退回数据库 device_type
  const realByType = {};
  for (const rd of realDevices || []) {
    // resolveDeviceBrand 通过 UA + name 判定真实形态,绕开数据库脏数据
    let detected = null;
    try {
      detected = resolveDeviceBrand(rd).deviceType;
    } catch {}
    const key = normalizeDeviceTypeKey(detected) || normalizeDeviceTypeKey(rd.device_type);
    if (key && !realByType[key]) realByType[key] = rd;
  }
  const defaultNames = {
    phone: "手机",
    pc: "电脑",
    tablet: "平板",
    watch: "手表",
    speaker: "音箱",
    glasses: "眼镜",
    car: "汽车",
    home: "家居",
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

  // 按设备形态差异化分发策略 — 此处 key 已经归一化,可直接喂给 filterStrategiesForDevice
  for (const [key, dev] of map.entries()) {
    const extra = filterStrategiesForDevice(key, taskStrategies, noteStrategies, routine);
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

  // 用户作息(daily_routine)用于细化各设备时段判断,缺省时各设备退回硬编码窗口
  const { data: prefs } = useQuery({
    queryKey: ['user-preference-routine'],
    queryFn: async () => {
      const list = await base44.entities.UserPreference.list();
      return list?.[0] || null;
    },
    staleTime: 10 * 60 * 1000,
  });
  const routine = prefs?.daily_routine || null;

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
    () => mergeDevicesWithReminders(baseDevices, taskStrategies, noteStrategies, realDevices, routine),
    [baseDevices, taskStrategies, noteStrategies, realDevices, routine]
  );

  // Kimi 改写:为当前选中设备的 Top 策略生成更贴合该设备形态的文案
  // 失败/未命中时静默回退原文,不阻塞渲染
  const [rewriteMap, setRewriteMap] = React.useState({});  // { deviceType: [strategies...] }

  // 按 device_type 聚合策略,便于真实设备卡片显示策略数与时间轴
  const normalizeTypeKey = (raw) => normalizeDeviceTypeKey(raw) || (raw ? String(raw).toLowerCase() : "other");

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

  // 关键:用 UA 实时判定出的形态作为真相,绕开数据库里可能错误的 device_type
  // 否则数据库里一台被错标的"手机"会一直拿到 pc 的策略,看上去所有设备策略一样
  const effectiveSelectedType = effectiveSelected
    ? normalizeTypeKey(resolveDeviceBrand(effectiveSelected).deviceType || effectiveSelected.device_type)
    : null;

  const rawSelectedStrategies = effectiveSelectedType
    ? (strategiesByType[effectiveSelectedType] || [])
    : [];

  // 选中设备变化或原始策略变化时,触发 Kimi 改写(命中缓存则极快返回)
  // 注意:必须放在任何 early return 之前,以保证每次渲染 hooks 顺序一致
  React.useEffect(() => {
    if (!effectiveSelectedType || rawSelectedStrategies.length === 0) return;
    let cancelled = false;
    rewriteStrategiesForDevice(effectiveSelectedType, rawSelectedStrategies)
      .then((rewritten) => {
        if (!cancelled) setRewriteMap((m) => ({ ...m, [effectiveSelectedType]: rewritten }));
      })
      .catch(() => {});
    return () => { cancelled = true; };
    // 用策略内容指纹作为依赖,避免 array 引用变化导致重复调用
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveSelectedType, rawSelectedStrategies.map((s) => `${s.time}|${s.content}`).join("\n")]);

  const hasAnyStrategy = devices.some((d) => d.strategies && d.strategies.length > 0);
  const hasAnyRealDevice = (realDevices || []).length > 0;
  if (!hasAnyStrategy && !hasAnyRealDevice) return null;

  const selectedStrategies = rewriteMap[effectiveSelectedType] || rawSelectedStrategies;

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
            deviceType={effectiveSelectedType}
            deviceName={effectiveSelected.name}
            strategies={selectedStrategies}
          />
        )}
      </div>
    </motion.div>
  );
}