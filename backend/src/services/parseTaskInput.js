import { invokeKimiText } from "../lib/kimi.js";
import { resolveSpatiotemporalContext } from "./extractContext.js";

function pad(n) {
  return String(n).padStart(2, "0");
}

function toYmd(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toISODateTime(date, time) {
  // 返回带 +08:00 时区的 ISO 字符串
  const [h, m] = String(time || "00:00").split(":").map(Number);
  const d = new Date(date);
  d.setHours(h, m, 0, 0);
  const y = d.getFullYear();
  const mo = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  return `${y}-${mo}-${day}T${hh}:${mm}:00+08:00`;
}

function nowPlusMinutes(minutes) {
  const d = new Date();
  d.setMinutes(d.getMinutes() + minutes);
  return d;
}

// 常识时间映射：关键词 -> { hour, minute, durationMinutes, category, priority, eventType }
const COMMON_SENSE_RULES = [
  { keys: ["早餐", "吃早饭", "早点"], hour: 8, minute: 0, duration: 30, category: "health", priority: "low", eventType: "用餐" },
  { keys: ["午餐", "吃午饭", "中饭"], hour: 12, minute: 0, duration: 60, category: "health", priority: "low", eventType: "用餐" },
  { keys: ["晚餐", "吃晚饭", "晚饭"], hour: 18, minute: 30, duration: 60, category: "health", priority: "low", eventType: "用餐" },
  { keys: ["睡觉", "早睡", "睡前", "入睡"], hour: 22, minute: 30, duration: 0, category: "health", priority: "low", eventType: "休息" },
  { keys: ["起床", "早起", "睡醒"], hour: 7, minute: 0, duration: 0, category: "health", priority: "low", eventType: "起床" },
  { keys: ["吃药", "服药", "维生素", "胶囊", "滴眼液"], hour: 8, minute: 0, duration: 0, category: "health", priority: "medium", eventType: "用药" },
  { keys: ["锻炼", "健身", "跑步", "瑜伽", "运动"], hour: 7, minute: 30, duration: 60, category: "health", priority: "medium", eventType: "运动" },
  { keys: ["买菜", "超市", "菜市场"], hour: 18, minute: 0, duration: 60, category: "shopping", priority: "low", eventType: "购物" },
  { keys: ["快递", "取快递", "拿快递"], hour: 18, minute: 0, duration: 30, category: "personal", priority: "low", eventType: "生活" },
  { keys: ["开会", "会议", "zoom", "对齐", "评审"], hour: null, minute: null, duration: 30, category: "work", priority: "high", eventType: "会议" },
  { keys: ["面试", "考试", "答辩"], hour: null, minute: null, duration: 60, category: "work", priority: "urgent", eventType: "面试/考试" },
  { keys: ["就医", "医院", "看病", "复诊", "牙科", "拔牙"], hour: null, minute: null, duration: 60, category: "health", priority: "urgent", eventType: "就医" },
  { keys: ["航班", "飞机", "登机", "赶飞机"], hour: null, minute: null, duration: 120, category: "personal", priority: "urgent", eventType: "出行" },
  { keys: ["约会", "聚餐", "见面", "请客"], hour: 19, minute: 0, duration: 90, category: "family", priority: "medium", eventType: "社交" }
];

function matchCommonSense(text) {
  const t = String(text || "");
  for (const rule of COMMON_SENSE_RULES) {
    if (rule.keys.some((k) => t.includes(k))) {
      return rule;
    }
  }
  return null;
}

function applyCommonSenseTime(text, baseDate = new Date()) {
  const rule = matchCommonSense(text);
  if (!rule) return null;

  let d = new Date(baseDate);
  if (rule.hour != null && rule.minute != null) {
    d.setHours(rule.hour, rule.minute, 0, 0);
    // 如果常识时间已经过了，且用户没有明确说"明天/后天"，默认推到明天
    if (d < new Date() && !/(明天|后天|大后天|下周|下月)/.test(text)) {
      d.setDate(d.getDate() + 1);
    }
  } else {
    // 会议/面试/就医/航班等没有固定时间，默认当前时间 + 30 分钟
    d = nowPlusMinutes(30);
  }

  // 特殊修正：饭后吃药 -> 12:00 或 18:30
  if (rule.eventType === "用药") {
    if (/饭后/.test(text)) {
      const hour = new Date().getHours();
      d.setHours(hour < 14 ? 12 : 18, hour < 14 ? 30 : 30, 0, 0);
    } else if (/睡前/.test(text)) {
      d.setHours(22, 0, 0, 0);
      if (d < new Date()) d.setDate(d.getDate() + 1);
    }
  }

  // 锻炼：根据当前时间选早上或晚上
  if (rule.eventType === "运动") {
    const hour = new Date().getHours();
    if (hour >= 10 && hour < 16) {
      d.setHours(18, 30, 0, 0);
    } else if (hour >= 16) {
      d.setHours(18, 30, 0, 0);
      if (d < new Date()) d.setDate(d.getDate() + 1);
    } else {
      d.setHours(7, 30, 0, 0);
    }
  }

  return {
    date: toYmd(d),
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
    duration: rule.duration,
    category: rule.category,
    priority: rule.priority,
    eventType: rule.eventType,
    source: "common_sense"
  };
}

function applyDefaultTime() {
  const d = nowPlusMinutes(5);
  return {
    date: toYmd(d),
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
    duration: 5,
    category: "other",
    priority: "medium",
    eventType: "其他",
    source: "now"
  };
}

function mapEventTypeToCategory(eventType) {
  const map = {
    会议: "work",
    面试考试: "work",
    就医: "health",
    用药: "health",
    运动: "health",
    用餐: "health",
    休息: "health",
    起床: "health",
    购物: "shopping",
    生活: "personal",
    社交: "family",
    出行: "personal"
  };
  return map[eventType] || "other";
}

function mapEventTypeToPriority(eventType) {
  const map = {
    会议: "high",
    面试考试: "urgent",
    就医: "urgent",
    用药: "medium",
    运动: "medium",
    用餐: "low",
    休息: "low",
    起床: "low",
    购物: "low",
    生活: "low",
    社交: "medium",
    出行: "urgent"
  };
  return map[eventType] || "medium";
}

function computeEndDateTime(reminderISO, eventType) {
  const d = new Date(reminderISO);
  const durationMap = {
    会议: 30,
    面试考试: 60,
    就医: 60,
    用药: 0,
    运动: 60,
    用餐: 60,
    休息: 0,
    起床: 0,
    购物: 60,
    生活: 30,
    社交: 90,
    出行: 120,
    其他: 5
  };
  const minutes = durationMap[eventType] || 5;
  d.setMinutes(d.getMinutes() + minutes);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00+08:00`;
}



function normalizePriority(value) {
  const valid = ["urgent", "high", "medium", "low"];
  return valid.includes(value) ? value : "medium";
}

function normalizeCategory(value) {
  const valid = ["work", "personal", "health", "study", "family", "shopping", "finance", "other"];
  return valid.includes(value) ? value : "other";
}

// 本地显式时间解析：作为 Kimi 失败时的兜底，避免把"明天下午3点"也当成常识
function parseExplicitTimeLocal(text, baseDate = new Date()) {
  const t = String(text || "");
  const now = new Date(baseDate);
  const todayYmd = toYmd(now);

  // X 分钟后
  const minMatch = t.match(/(\d+)\s*分钟后?/);
  if (minMatch) {
    const d = new Date(now.getTime() + parseInt(minMatch[1], 10) * 60 * 1000);
    return { date: toYmd(d), time: `${pad(d.getHours())}:${pad(d.getMinutes())}`, source: "explicit" };
  }

  // X 小时后
  const hourMatch = t.match(/(\d+)\s*小时后?/);
  if (hourMatch) {
    const d = new Date(now.getTime() + parseInt(hourMatch[1], 10) * 60 * 60 * 1000);
    return { date: toYmd(d), time: `${pad(d.getHours())}:${pad(d.getMinutes())}`, source: "explicit" };
  }

  // 半小时后
  if (/半小时后?/.test(t)) {
    const d = new Date(now.getTime() + 30 * 60 * 1000);
    return { date: toYmd(d), time: `${pad(d.getHours())}:${pad(d.getMinutes())}`, source: "explicit" };
  }

  // X 天后 / 一周后 / 一星期后 / 七天后（可带时刻）
  const dayOffsetMatch = t.match(/(明天|后天|大后天|一周后|一星期后|一个星期后|七天后|(\d+)\s*天后?)\s*(?:上午|下午|晚上|今晚)?\s*(?:(\d{1,2})\s*[点:：]\s*(?:(\d{1,2})|半|一刻|三刻)?)?/);
  if (dayOffsetMatch) {
    let offset = 0;
    let minute = 0;
    if (dayOffsetMatch[1] === "明天") offset = 1;
    else if (dayOffsetMatch[1] === "后天") offset = 2;
    else if (dayOffsetMatch[1] === "大后天") offset = 3;
    else if (/一周后|一星期后|一个星期后|七天后/.test(dayOffsetMatch[1])) offset = 7;
    else if (dayOffsetMatch[2]) offset = parseInt(dayOffsetMatch[2], 10);

    let hour = dayOffsetMatch[3] ? parseInt(dayOffsetMatch[3], 10) : 9;
    const minuteRaw = dayOffsetMatch[4];
    if (minuteRaw) {
      if (/半/.test(minuteRaw)) minute = 30;
      else if (/一刻/.test(minuteRaw)) minute = 15;
      else if (/三刻/.test(minuteRaw)) minute = 45;
      else minute = parseInt(minuteRaw, 10) || 0;
    }
    if (/下午|晚上|今晚/.test(t) && hour < 12) hour += 12;
    if (/凌晨/.test(t) && hour === 12) hour = 0;

    const d = new Date(baseDate);
    d.setDate(d.getDate() + offset);
    d.setHours(hour, minute, 0, 0);
    if (offset === 0 && d <= now) d.setDate(d.getDate() + 1);
    return { date: toYmd(d), time: `${pad(d.getHours())}:${pad(d.getMinutes())}`, source: "explicit" };
  }
  // 本周/下周/下星期/下礼拜 X + 可选时刻
  const weekMatch = t.match(/(本|下)(?:周|星期|礼拜)([一二三四五六日天])\s*(?:上午|下午|晚上|今晚)?\s*(?:(\d{1,2})\s*[点:：]\s*(?:(\d{1,2})|半|一刻|三刻)?)?/);
  if (weekMatch) {
    const weekdayMap = { 日: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 天: 0 };
    const targetDow = weekdayMap[weekMatch[2]];
    const d = new Date(baseDate);
    const curDow = d.getDay();
    let diff = (targetDow - curDow + 7) % 7;
    if (weekMatch[1] === "下" || (diff === 0 && /下周|下星期|下礼拜/.test(t))) {
      diff = diff === 0 ? 7 : diff;
    }
    if (weekMatch[1] === "下") diff += 7;

    let hour = weekMatch[3] ? parseInt(weekMatch[3], 10) : 9;
    let minute = 0;
    const minuteRaw = weekMatch[4];
    if (minuteRaw) {
      if (/半/.test(minuteRaw)) minute = 30;
      else if (/一刻/.test(minuteRaw)) minute = 15;
      else if (/三刻/.test(minuteRaw)) minute = 45;
      else minute = parseInt(minuteRaw, 10) || 0;
    }
    if (/下午|晚上|今晚/.test(t) && hour < 12) hour += 12;
    if (/凌晨/.test(t) && hour === 12) hour = 0;

    d.setDate(d.getDate() + diff);
    d.setHours(hour, minute, 0, 0);
    return { date: toYmd(d), time: `${pad(d.getHours())}:${pad(d.getMinutes())}`, source: "explicit" };
  }

  // 周末：周六；下周末：下周六
  if (/这?周末/.test(t) || /下周末/.test(t)) {
    const d = new Date(baseDate);
    const curDow = d.getDay();
    let diff = (6 - curDow + 7) % 7;
    if (/下周末/.test(t)) diff += 7;
    d.setDate(d.getDate() + diff);
    d.setHours(9, 0, 0, 0);
    return { date: toYmd(d), time: `${pad(d.getHours())}:${pad(d.getMinutes())}`, source: "explicit" };
  }

  // 下个月/下月/X月X号/X号
  const monthMatch = t.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]/);
  if (monthMatch) {
    const d = new Date(baseDate);
    d.setMonth(parseInt(monthMatch[1], 10) - 1, parseInt(monthMatch[2], 10));
    d.setHours(9, 0, 0, 0);
    if (d <= now) d.setFullYear(d.getFullYear() + 1);
    return { date: toYmd(d), time: `${pad(d.getHours())}:${pad(d.getMinutes())}`, source: "explicit" };
  }
  const dayOnlyMatch = t.match(/(\d{1,2})\s*[日号]/);
  if (dayOnlyMatch) {
    const d = new Date(baseDate);
    d.setDate(parseInt(dayOnlyMatch[1], 10));
    d.setHours(9, 0, 0, 0);
    if (d <= now) d.setMonth(d.getMonth() + 1);
    return { date: toYmd(d), time: `${pad(d.getHours())}:${pad(d.getMinutes())}`, source: "explicit" };
  }

  // 今天下午/晚上 X 点
  const todayPmMatch = t.match(/(?:今天下午|今晚)(\d+)\s*[点:：]\s*(?:(\d{1,2})|半|一刻|三刻)?/);
  if (todayPmMatch) {
    const hour = parseInt(todayPmMatch[1], 10) + (parseInt(todayPmMatch[1], 10) < 12 ? 12 : 0);
    let minute = 0;
    const minuteRaw = todayPmMatch[2];
    if (minuteRaw) {
      if (/半/.test(minuteRaw)) minute = 30;
      else if (/一刻/.test(minuteRaw)) minute = 15;
      else if (/三刻/.test(minuteRaw)) minute = 45;
      else minute = parseInt(minuteRaw, 10) || 0;
    }
    const d = new Date(baseDate);
    d.setHours(hour, minute, 0, 0);
    if (d <= now) d.setDate(d.getDate() + 1);
    return { date: toYmd(d), time: `${pad(d.getHours())}:${pad(d.getMinutes())}`, source: "explicit" };
  }

  // 上午/下午/晚上 X 点（无明天前缀）
  const plainMatch = t.match(/(?:上午|下午|晚上)\s*(\d+)\s*[点:：]\s*(?:(\d{1,2})|半|一刻|三刻)?/);
  if (plainMatch) {
    let hour = parseInt(plainMatch[1], 10);
    let minute = 0;
    const minuteRaw = plainMatch[2];
    if (minuteRaw) {
      if (/半/.test(minuteRaw)) minute = 30;
      else if (/一刻/.test(minuteRaw)) minute = 15;
      else if (/三刻/.test(minuteRaw)) minute = 45;
      else minute = parseInt(minuteRaw, 10) || 0;
    }
    if (t.includes("下午") && hour < 12) hour += 12;
    if (t.includes("晚上") && hour < 12) hour += 12;
    const d = new Date(baseDate);
    d.setHours(hour, minute, 0, 0);
    if (d <= now) d.setDate(d.getDate() + 1);
    return { date: toYmd(d), time: `${pad(d.getHours())}:${pad(d.getMinutes())}`, source: "explicit" };
  }

  return null;
}

export async function parseTaskInput({ input, date, savedLocations = [], currentCoords = null, habitProfileText = "" }) {
  const now = new Date();
  const fallbackDate = date || toYmd(now);
  const text = String(input || "").trim();

  if (!text) {
    return null;
  }

  // 1. 先做一次本地时空上下文提取，作为 Kimi 的候选，也作为兜底
  const spatiotemporal = resolveSpatiotemporalContext({
    text,
    savedLocations,
    currentCoords,
    currentTime: now
  });

  const schema = {
    type: "object",
    properties: {
      title: { type: "string", description: "约定标题，简洁概括" },
      description: { type: "string", description: "约定描述，可为空" },
      reminder_time: { type: "string", description: "提醒时间 ISO 8601（含时区），如果用户没有明确说提醒时间则和 end_time 相同" },
      end_time: { type: "string", description: "截止时间 ISO 8601（含时区），如果用户没有明确说则比 reminder_time 晚 5 分钟" },
      location: { type: "string", description: "地点，如'公司'、'医院'、'家里'" },
      location_type: { type: "string", description: "地点类型：office/home/hospital/school/gym/shopping/restaurant/transit/other" },
      event_type: { type: "string", description: "事件类型：会议/用餐/就医/出行/生活/工作/学习/运动/社交/其他" },
      priority: { type: "string", enum: ["urgent", "high", "medium", "low"], description: "优先级" },
      category: { type: "string", enum: ["work", "personal", "health", "study", "family", "shopping", "finance", "other"], description: "分类" }
    },
    required: ["title", "reminder_time", "end_time", "priority", "category"]
  };

  const candidateLocation = spatiotemporal.location;
  const candidateLocationText = candidateLocation.name
    ? `地点候选：${candidateLocation.name}（类型：${candidateLocation.location_type || "unknown"}）`
    : "地点候选：未识别到地点";
  const candidateEventText = spatiotemporal.event_type
    ? `事件类型候选：${spatiotemporal.event_type}`
    : "事件类型候选：未识别";
  const habitText = habitProfileText
    ? `用户习惯参考（来自该用户历史完成数据，仅用于推断时段偏好，不得覆盖用户明确说出的时间）：\n${habitProfileText}\n`
    : "";

  let kimiResult = null;
  let kimiSucceeded = false;

  try {
    const currentTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    // Kimi 只给 5 秒，超时立即 fallback 到本地规则，避免前端等 25 秒
    kimiResult = await Promise.race([
      invokeKimiText({
        prompt: `用户输入：${text}
当前日期：${fallbackDate}
当前时间：${currentTime}
${candidateLocationText}
${candidateEventText}
${habitText}

请解析约定信息。注意：
1. 所有相对时间（"X分钟之后"、"明天下午3点"、"三天后"、"下周五晚上8点"）一律以上面给出的当前日期/时间为基准计算，不要自己假设其他基准。
2. 如果用户只说了提醒时间但没说明截止时间，end_time 默认比 reminder_time 晚 5 分钟。
3. 如果用户没有指明任何具体时间（例如"提醒我吃药"、"整理一下文件"），reminder_time 直接使用上面的当前时间作为创建时间，end_time = reminder_time + 5 分钟，禁止编造时间。
4. 时间必须使用 ISO 8601 格式并包含 +08:00 时区，例如 "2026-08-26T14:35:00+08:00"。
5. 从输入中提取地点（location）、地点类型（location_type）和事件类型（event_type）。
6. 如果用户没有明确说地点，请使用上面给出的"地点候选"；如果候选也没有，返回空字符串。
7. 直接返回 JSON 对象，不要输出 markdown、代码块或解释。`,
        systemPrompt: "你是 SoulSentry 的约定解析器。把中文自然语言输入转成可创建的约定字段。严格返回 JSON。",
        responseJsonSchema: schema,
        temperature: 0.2
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("TIMEOUT")), 5000))
    ]);
    kimiSucceeded = true;
  } catch (err) {
    console.error("[parseTaskInput] Kimi parse failed, fallback to local", err?.message || err);
  }

  // 提取标题：优先 Kimi，否则取输入前 120 字
  const title = (kimiResult?.title || text).slice(0, 120).trim();
  const description = (kimiResult?.description || "").trim();

  // 判断 Kimi 是否给了显式时间
  let explicitTime = null;
  if (kimiSucceeded && kimiResult?.reminder_time) {
    const d = new Date(kimiResult.reminder_time);
    if (!Number.isNaN(d.getTime())) {
      explicitTime = {
        date: toYmd(d),
        time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
        source: "explicit"
      };
    }
  }

  // 本地显式时间解析（同时用于校验 Kimi 的相对时间计算）
  const localExplicit = parseExplicitTimeLocal(text);

  // Kimi 时间与本地显式解析偏差 >2 小时，判定 Kimi 相对时间算错（时区/基准问题），采用本地结果
  if (explicitTime && localExplicit) {
    const kimiT = new Date(`${explicitTime.date}T${explicitTime.time}:00`);
    const localT = new Date(`${localExplicit.date}T${localExplicit.time}:00`);
    const diffMs = Math.abs(kimiT.getTime() - localT.getTime());
    if (diffMs > 2 * 60 * 60 * 1000) {
      console.warn(`[parseTaskInput] Kimi 时间与本地解析偏差 ${Math.round(diffMs / 3600000)}h，采用本地结果 ${localExplicit.date} ${localExplicit.time}`);
      explicitTime = localExplicit;
    }
  }

  // 常识规则：仅用于事件类型/分类/优先级推断，不再作为时间兜底（无明确时间以创建时间为基准）
  const commonSense = applyCommonSenseTime(text);

  // 最终选择时间：显式（Kimi 校验后）> 本地显式 > 创建时间+5分钟
  const chosen = explicitTime || localExplicit || applyDefaultTime();

  const reminderISO = toISODateTime(chosen.date, chosen.time);

  // 地点与事件：Kimi > 本地提取 > 常识/兜底
  const location = kimiResult?.location || spatiotemporal.location.name || "";
  const locationType = kimiResult?.location_type || spatiotemporal.location.location_type || "";
  const eventType = kimiResult?.event_type
    || spatiotemporal.event_type
    || commonSense?.eventType
    || "其他";

  const endISO = kimiResult?.end_time
    ? String(kimiResult.end_time)
    : computeEndDateTime(reminderISO, eventType);

  const category = normalizeCategory(kimiResult?.category || commonSense?.category || mapEventTypeToCategory(eventType));
  const priority = normalizePriority(kimiResult?.priority || commonSense?.priority || mapEventTypeToPriority(eventType));

  return {
    title,
    description,
    reminder_time: reminderISO,
    end_time: endISO,
    location,
    location_type: locationType,
    event_type: eventType,
    priority,
    category,
    time_source: chosen.source,
    spatiotemporal: {
      ...spatiotemporal.context_at_creation,
      time_source: chosen.source
    }
  };
}
