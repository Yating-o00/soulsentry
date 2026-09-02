import { invokeKimiText } from "../lib/kimi.js";

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
  const d = nowPlusMinutes(60);
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

  // 明天/后天/大后天 + 上午/下午/晚上 + X 点
  const dayOffsetMatch = t.match(/(明天|后天|大后天)(?:上午|下午|晚上)?\s*(\d+)(?:点|：|:)?(?:30|半)?/);
  if (dayOffsetMatch) {
    const offset = { 明天: 1, 后天: 2, 大后天: 3 }[dayOffsetMatch[1]] || 1;
    let hour = parseInt(dayOffsetMatch[2], 10);
    const minute = /半/.test(t) ? 30 : 0;
    if (t.includes("下午") && hour < 12) hour += 12;
    if (t.includes("晚上") && hour < 12) hour += 12;
    const d = new Date(baseDate);
    d.setDate(d.getDate() + offset);
    d.setHours(hour, minute, 0, 0);
    return { date: toYmd(d), time: `${pad(d.getHours())}:${pad(d.getMinutes())}`, source: "explicit" };
  }

  // 今天下午/晚上 X 点
  const todayPmMatch = t.match(/(?:今天下午|今晚)(\d+)(?:点|：|:)?(?:30|半)?/);
  if (todayPmMatch) {
    const hour = parseInt(todayPmMatch[1], 10) + (parseInt(todayPmMatch[1], 10) < 12 ? 12 : 0);
    const minute = /半/.test(t) ? 30 : 0;
    const d = new Date(baseDate);
    d.setHours(hour, minute, 0, 0);
    if (d <= now) d.setDate(d.getDate() + 1);
    return { date: toYmd(d), time: `${pad(d.getHours())}:${pad(d.getMinutes())}`, source: "explicit" };
  }

  // 上午/下午/晚上 X 点（无明天前缀）
  const plainMatch = t.match(/(?:上午|下午|晚上)\s*(\d+)(?:点|：|:)?(?:30|半)?/);
  if (plainMatch) {
    let hour = parseInt(plainMatch[1], 10);
    const minute = /半/.test(t) ? 30 : 0;
    if (t.includes("下午") && hour < 12) hour += 12;
    if (t.includes("晚上") && hour < 12) hour += 12;
    const d = new Date(baseDate);
    d.setHours(hour, minute, 0, 0);
    if (d <= now) d.setDate(d.getDate() + 1);
    return { date: toYmd(d), time: `${pad(d.getHours())}:${pad(d.getMinutes())}`, source: "explicit" };
  }

  return null;
}

export async function parseTaskInput({ input, date }) {
  const now = new Date();
  const fallbackDate = date || toYmd(now);
  const text = String(input || "").trim();

  if (!text) {
    return null;
  }

  const schema = {
    type: "object",
    properties: {
      title: { type: "string", description: "约定标题，简洁概括" },
      description: { type: "string", description: "约定描述，可为空" },
      reminder_time: { type: "string", description: "提醒时间 ISO 8601（含时区），如果用户没有明确说提醒时间则和 end_time 相同" },
      end_time: { type: "string", description: "截止时间 ISO 8601（含时区），如果用户没有明确说则比 reminder_time 晚 5 分钟" },
      location: { type: "string", description: "地点，如'公司'、'医院'、'家里'" },
      event_type: { type: "string", description: "事件类型：会议/用餐/就医/出行/生活/工作/学习/运动/社交/其他" },
      priority: { type: "string", enum: ["urgent", "high", "medium", "low"], description: "优先级" },
      category: { type: "string", enum: ["work", "personal", "health", "study", "family", "shopping", "finance", "other"], description: "分类" }
    },
    required: ["title", "reminder_time", "end_time", "priority", "category"]
  };

  let kimiResult = null;
  let kimiSucceeded = false;

  try {
    const currentTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    kimiResult = await invokeKimiText({
      prompt: `用户输入：${text}
当前日期：${fallbackDate}
当前时间：${currentTime}

请解析约定信息。注意：
1. 如果用户说"X分钟之后"、"明天下午3点"等，请准确计算 reminder_time。
2. 如果用户只说了提醒时间但没说明截止时间，end_time 默认比 reminder_time 晚 5 分钟。
3. 时间必须使用 ISO 8601 格式并包含 +08:00 时区，例如 "2026-08-26T14:35:00+08:00"。
4. 从输入中提取地点（location）和事件类型（event_type）。
5. 直接返回 JSON 对象，不要输出 markdown、代码块或解释。`,
      systemPrompt: "你是 SoulSentry 的约定解析器。把中文自然语言输入转成可创建的约定字段。严格返回 JSON。",
      responseJsonSchema: schema,
      temperature: 0.2
    });
    kimiSucceeded = true;
  } catch (err) {
    console.error("[parseTaskInput] Kimi parse failed, fallback to local", err);
  }

  // 提取标题：优先 Kimi，否则取输入前 60 字
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

  // 本地显式时间兜底（Kimi 失败时）
  const localExplicit = !explicitTime ? parseExplicitTimeLocal(text) : null;

  // 常识时间兜底
  const commonSense = applyCommonSenseTime(text);

  // 最终选择时间：Kimi 显式 > 本地显式 > 常识 > 当前时间+60分钟
  const chosen = explicitTime || localExplicit || commonSense || applyDefaultTime();

  const reminderISO = toISODateTime(chosen.date, chosen.time);
  const eventType = kimiResult?.event_type || commonSense?.eventType || "其他";
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
    location: kimiResult?.location || "",
    event_type: eventType,
    priority,
    category,
    time_source: chosen.source
  };
}
