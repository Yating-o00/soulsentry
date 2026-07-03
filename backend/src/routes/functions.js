import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { invokeKimiText, invokeKimiWebSearch } from "../lib/kimi.js";
import { prisma } from "../lib/prisma.js";
import { analyzeIntentWithKimi } from "../services/analyzeIntent.js";
import { getCreditPack } from "../config/creditPacks.js";
import { createWechatNativeOrder, generateOutTradeNo, getWechatMerchantConfig, queryWechatOrder as wechatQueryOrder } from "../lib/wechatPay.js";
import { markWechatOrderPaid } from "../services/wechatOrders.js";
import { buildPreferenceMetadata, getVapidPublicKey as getConfiguredVapidPublicKey } from "../lib/webPush.js";

export const functionsRouter = Router();

functionsRouter.use(requireAuth);

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function normalizeDateString(value, fallbackDate) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  if (value) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
    }
  }

  return fallbackDate;
}

function getWeekDates(startDate) {
  const base = new Date(`${startDate}T00:00:00+08:00`);
  return Array.from({ length: 7 }, (_, index) => {
    const current = new Date(base);
    current.setDate(base.getDate() + index);
    return `${current.getFullYear()}-${pad2(current.getMonth() + 1)}-${pad2(current.getDate())}`;
  });
}

function addDaysToDateString(dateString, days) {
  const base = new Date(`${dateString}T00:00:00+08:00`);
  base.setDate(base.getDate() + days);
  return `${base.getFullYear()}-${pad2(base.getMonth() + 1)}-${pad2(base.getDate())}`;
}

function getWeekStartDate(dateLike) {
  const date = new Date(`${normalizeDateString(dateLike, new Date().toISOString().slice(0, 10))}T00:00:00+08:00`);
  const day = date.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diffToMonday);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function inferWeekOffset(text, fallbackOffset = 0) {
  const source = String(text || "");
  if (/(下周|下星期|下礼拜)/.test(source)) return 1;
  if (/(本周|这周|这星期|本星期|这礼拜|本礼拜)/.test(source)) return 0;
  if (/(上周|上星期|上礼拜)/.test(source)) return -1;
  return fallbackOffset;
}

function resolvePlanningWeekStart(startDate, currentDate, input) {
  const baseWeekStart = getWeekStartDate(startDate || currentDate || new Date().toISOString().slice(0, 10));
  const offset = inferWeekOffset(input, 0);
  return addDaysToDateString(baseWeekStart, offset * 7);
}

function mergePlanningInputs(existingInput, nextInput) {
  return [clipText(existingInput, 400, ""), clipText(nextInput, 400, "")]
    .filter(Boolean)
    .join("\n");
}

function getMonthWeekStarts(startDate) {
  const base = new Date(`${startDate}T00:00:00+08:00`);
  const starts = [];
  for (let week = 0; week < 5; week += 1) {
    const current = new Date(base);
    current.setDate(base.getDate() + (week * 7));
    starts.push(`${current.getFullYear()}-${pad2(current.getMonth() + 1)}-${pad2(current.getDate())}`);
  }
  return starts;
}

function clipText(value, maxLength, fallback = "") {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return fallback;
  return text.slice(0, maxLength);
}

function uniqueItems(items) {
  return Array.from(new Set(items.filter(Boolean)));
}

function isGenericText(value, genericTexts = []) {
  const text = clipText(value, 200, "");
  if (!text) return true;
  return genericTexts.includes(text);
}

function classifyMonthMilestoneType(text) {
  if (/发布|上线|交付/.test(text)) return "launch";
  if (/测试|复盘|检查|修复|回顾/.test(text)) return "review";
  if (/目标|规划|优先级/.test(text)) return "goal";
  return "milestone";
}

function normalizeWeekEvent(event, weekDates) {
  if (!isPlainObject(event) || !event.title) return null;

  const normalizedDate = normalizeDateString(
    event.date,
    typeof event.day_index === "number" ? weekDates[Math.max(0, Math.min(6, event.day_index))] : weekDates[0]
  );
  const matchedIndex = weekDates.indexOf(normalizedDate);
  const fallbackIndex = typeof event.day_index === "number" ? Math.max(0, Math.min(6, event.day_index)) : 0;
  const derivedIndex = matchedIndex >= 0
    ? matchedIndex
    : Math.round((new Date(`${normalizedDate}T00:00:00+08:00`).getTime() - new Date(`${weekDates[0]}T00:00:00+08:00`).getTime()) / 86400000);
  const dayIndex = Math.max(0, Math.min(6, Number.isFinite(derivedIndex) ? derivedIndex : fallbackIndex));

  return {
    date: normalizedDate,
    day_index: dayIndex >= 0 ? dayIndex : 0,
    title: String(event.title).slice(0, 120),
    time: typeof event.time === "string" && /^\d{2}:\d{2}$/.test(event.time) ? event.time : "09:00",
    end_time: typeof event.end_time === "string" && /^\d{2}:\d{2}$/.test(event.end_time) ? event.end_time : undefined,
    is_all_day: Boolean(event.is_all_day),
    type: ["work", "meeting", "travel", "focus", "rest", "other"].includes(event.type) ? event.type : "other",
    icon: typeof event.icon === "string" && event.icon.trim() ? event.icon.trim().slice(0, 4) : "📅",
    description: typeof event.description === "string" ? event.description.slice(0, 240) : undefined
  };
}

function buildWeekHintEvents(input, weekDates) {
  const keywords = String(input || "");
  const events = [];

  if (/出差|飞|机场|高铁|酒店/.test(keywords)) {
    events.push({ date: weekDates[1], day_index: 1, title: "差旅与行程确认", time: "09:00", type: "travel", icon: "✈️" });
  }
  if (/会议|汇报|沟通|对接|拜访/.test(keywords)) {
    events.push({ date: weekDates[2], day_index: 2, title: "关键会议与沟通", time: "14:00", type: "meeting", icon: "👥" });
  }
  if (/跑步|健身|锻炼|体检|休息|作息/.test(keywords)) {
    events.push({ date: weekDates[4], day_index: 4, title: "健康与恢复安排", time: "18:30", type: "rest", icon: "💪" });
  }
  if (/发布|上线|研发|开发|复盘|学习|阅读|备考/.test(keywords) || events.length === 0) {
    events.unshift({ date: weekDates[0], day_index: 0, title: "深度专注推进核心事项", time: "09:30", type: "focus", icon: "🎯" });
    events.push({ date: weekDates[3], day_index: 3, title: "中段检查与调整", time: "16:00", type: "work", icon: "🧭" });
  }

  return events;
}

function parseWeekdayIndex(text) {
  const matched = String(text || "").match(/(?:(?:本|这|下|上)周|(?:本|这|下|上)(?:星期|礼拜))?(?:周|星期|礼拜)([一二三四五六日天])/);
  if (!matched) return null;
  const map = { 一: 0, 二: 1, 三: 2, 四: 3, 五: 4, 六: 5, 日: 6, 天: 6 };
  return map[matched[1]] ?? null;
}

function parseClauseTime(clause, fallbackType = "other") {
  const text = String(clause || "");
  const colonMatch = text.match(/(\d{1,2})[:：](\d{2})/);
  if (colonMatch) {
    const hour = Math.max(0, Math.min(23, Number(colonMatch[1])));
    const minute = Math.max(0, Math.min(59, Number(colonMatch[2])));
    return `${pad2(hour)}:${pad2(minute)}`;
  }

  const pointMatch = text.match(/(凌晨|早上|上午|中午|下午|晚上|傍晚)?\s*(\d{1,2})\s*点(?:(半)|(\d{1,2})分?)?/);
  if (pointMatch) {
    const period = pointMatch[1] || "";
    let hour = Number(pointMatch[2]);
    const minute = pointMatch[3] ? 30 : (pointMatch[4] ? Number(pointMatch[4]) : 0);

    if (["下午", "晚上", "傍晚"].includes(period) && hour < 12) hour += 12;
    if (period === "中午" && hour < 11) hour += 12;
    if (period === "凌晨" && hour === 12) hour = 0;

    return `${pad2(Math.max(0, Math.min(23, hour)))}:${pad2(Math.max(0, Math.min(59, minute)))}`;
  }

  if (fallbackType === "meeting") return "14:00";
  if (fallbackType === "travel") return "09:00";
  if (fallbackType === "rest") return "18:30";
  if (fallbackType === "focus") return "09:30";
  return "09:00";
}

function inferWeekEventMeta(text) {
  const source = String(text || "");
  if (/投资人|客户|会议|汇报|拜访|对接|沟通|路演|会面/.test(source)) {
    return { type: "meeting", icon: "👥" };
  }
  if (/出差|飞|机场|高铁|酒店|返程|回京|行程|差旅/.test(source)) {
    return { type: "travel", icon: "✈️" };
  }
  if (/跑步|健身|锻炼|体检|休息|作息|恢复/.test(source)) {
    return { type: "rest", icon: "💪" };
  }
  if (/开发|研发|编程|编码|测试|复盘|学习|阅读|备考|方案|分析/.test(source)) {
    return { type: "focus", icon: "🎯" };
  }
  return { type: "work", icon: "📅" };
}

function cleanupWeekClauseTitle(clause) {
  return clipText(
    String(clause || "")
      .replace(/(?:下周)?(?:周|星期|礼拜)[一二三四五六日天]/g, "")
      .replace(/(凌晨|早上|上午|中午|下午|晚上|傍晚)?\s*\d{1,2}(?::|：)?(?:\d{2})?\s*点?(?:半|\d{1,2}分?)?/g, "")
      .replace(/^[，,。\s;；:：\-、]*(安排|计划|需要|要|有|准备|去|进行|参加)/, "")
      .replace(/(的安排|安排|事项|行程)$/g, "")
      .replace(/^[，,。\s;；:：\-、]+|[，,。\s;；:：\-、]+$/g, ""),
    120,
    ""
  );
}

function extractExplicitWeekEvents(input, startDate) {
  const text = String(input || "");
  if (!text) return [];

  const planningWeekOffset = inferWeekOffset(text, 0);
  const sentenceSegments = text
    .split(/[。；;\n]/)
    .map((item) => item.trim())
    .filter(Boolean);

  const results = [];
  sentenceSegments.forEach((segment) => {
    const clauses = segment.split(/，|,/).map((item) => item.trim()).filter(Boolean);
    let inheritedDayIndex = null;
    let inheritedWeekOffset = planningWeekOffset;

    clauses.forEach((clause) => {
      const explicitDayIndex = parseWeekdayIndex(clause);
      if (explicitDayIndex != null) inheritedDayIndex = explicitDayIndex;
      const dayIndex = explicitDayIndex != null ? explicitDayIndex : inheritedDayIndex;
      if (dayIndex == null) return;

      const explicitWeekOffset = inferWeekOffset(clause, inheritedWeekOffset);
      inheritedWeekOffset = explicitWeekOffset;
      const clauseWeekStart = addDaysToDateString(startDate, explicitWeekOffset * 7);
      const clauseWeekDates = getWeekDates(clauseWeekStart);
      const meta = inferWeekEventMeta(clause);
      const title = cleanupWeekClauseTitle(clause);

      results.push({
        date: clauseWeekDates[dayIndex],
        day_index: dayIndex,
        title: title || (meta.type === "meeting" ? "关键会面安排" : "重点事项安排"),
        time: parseClauseTime(clause, meta.type),
        type: meta.type,
        icon: meta.icon,
        description: clipText(clause, 240, undefined)
      });
    });
  });

  return results;
}

function deriveWeekTheme(input, events) {
  const text = String(input || "");
  const types = new Set(events.map((item) => item.type));
  if (/发布|上线/.test(text)) return "交付冲刺周";
  if (types.has("travel")) return "差旅协同周";
  if (types.has("meeting")) return "协同推进周";
  if (/学习|备考|训练/.test(text)) return "成长进阶周";
  return "专注推进周";
}

function deriveWeekSummary(input, events) {
  const text = clipText(input, 80, "");
  const eventTitles = uniqueItems(events.map((item) => clipText(item.title, 20, ""))).slice(0, 3);
  if (eventTitles.length > 0) {
    return clipText(`本周围绕${eventTitles.join("、")}展开，兼顾重点推进、协同沟通与节奏调整。`, 300, "本周围绕核心目标推进，兼顾专注、协作与恢复。");
  }
  if (text) {
    return clipText(`本周将围绕“${text}”推进，安排专注推进、关键协同与恢复窗口。`, 300, "本周围绕核心目标推进，兼顾专注、协作与恢复。");
  }
  return "本周围绕核心目标推进，兼顾专注、协作与恢复。";
}

function toWeekdayLabel(dateString) {
  try {
    const d = new Date(`${dateString}T00:00:00+08:00`);
    const map = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
    return map[d.getDay()] || "";
  } catch {
    return "";
  }
}

function subtractMinutesFromHHmm(timeStr, minutes) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(timeStr || "").trim());
  if (!m) return "";
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return "";
  const total = hh * 60 + mm - minutes;
  const normalized = (total + 24 * 60) % (24 * 60);
  return `${pad2(Math.floor(normalized / 60))}:${pad2(normalized % 60)}`;
}

function buildWeekDeviceStrategies(input, events, existingStrategies = {}) {
  const text = String(input || "");
  const types = new Set(events.map((item) => item.type));
  const meetings = events.filter((item) => item.type === "meeting");
  const travels = events.filter((item) => item.type === "travel");
  const focuses = events.filter((item) => item.type === "focus" || item.type === "work");
  const meetingPreview = meetings.slice(0, 2).map((e) => `${toWeekdayLabel(e.date)}${e.time ? ` ${e.time}` : ""} ${clipText(e.title, 24, "")}`).filter(Boolean);
  const travelPreview = travels.slice(0, 2).map((e) => `${toWeekdayLabel(e.date)}${e.time ? ` ${e.time}` : ""} ${clipText(e.title, 24, "")}`).filter(Boolean);
  const focusPreview = focuses.slice(0, 2).map((e) => `${toWeekdayLabel(e.date)}${e.time ? ` ${e.time}` : ""} ${clipText(e.title, 24, "")}`).filter(Boolean);
  const derived = {
    phone: meetingPreview.length > 0
      ? `重点会面：${meetingPreview.join("；")}；会前 30 分钟提醒准备材料，会后提醒整理纪要。`
      : (travelPreview.length > 0
        ? `关键行程：${travelPreview.join("；")}；出发前 60 分钟提醒确认交通与地址。`
        : `关键事项：${focusPreview.join("；") || "本周重点推进"}；移动场景承接即时沟通与变更。`),
    watch: meetingPreview.length > 0
      ? `关键时间锚点：${meetingPreview[0]}；仅在临近会面与重要节点时震动提示。`
      : (travelPreview.length > 0
        ? `行程锚点：${travelPreview[0]}；通勤/出发前轻量提醒。`
        : "关键节点前轻量震动提示，避免频繁打扰。"),
    pc: focusPreview.length > 0
      ? `深度推进：${focusPreview.join("；")}；集中处理文档/材料/复盘输出，减少多任务切换。`
      : (/开发|研发|测试|发布|上线/.test(text) || types.has("focus")
        ? "把核心开发、测试或交付事项放入深度工作块，减少多任务切换。"
        : "深度工作块优先处理核心任务，减少切换。")
  };

  const existing = isPlainObject(existingStrategies) ? existingStrategies : {};
  const isGenericStrategyText = (value) => {
    const s = clipText(value, 300, "");
    if (!s) return true;
    if (/Enable:\s*true|Notification:\s*\d{1,2}:\d{2}|Type:\s*\w+/i.test(s)) return true;
    if (s === "工作时段开启专注模式，集中处理即时沟通。") return true;
    if (s === "在会议切换、喝水起身和关键提醒场景提供轻量提示。") return true;
    if (s === "把核心开发、测试或交付事项放入深度工作块，减少多任务切换。") return true;
    return false;
  };
  const merged = { ...derived };
  Object.entries(existing).forEach(([key, value]) => {
    if (!isGenericStrategyText(value)) merged[key] = value;
  });
  return merged;
}

function isGenericAutomation(item) {
  const title = clipText(item?.title, 100, "");
  const description = clipText(item?.description, 240, "");
  return !title
    || title === "自动化提醒"
    || description === "根据周计划自动提醒与整理重点事项。";
}

function buildWeekAutomations(input, events, sourceAutomations = [], weekStartDate) {
  const text = String(input || "");
  const suggestions = [];
  const pushAutomation = (item) => {
    if (!item?.title) return;
    suggestions.push({
      title: clipText(item.title, 100, "自动化提醒"),
      description: clipText(item.description, 240, "根据周计划自动提醒与整理重点事项。"),
      icon: typeof item.icon === "string" && item.icon.trim() ? item.icon.trim().slice(0, 4) : "⚙️",
      status: item.status === "active" ? "active" : "pending",
      date: typeof item.date === "string" ? item.date : undefined,
      time: typeof item.time === "string" ? item.time : undefined
    });
  };

  const normalizedSource = Array.isArray(sourceAutomations) ? sourceAutomations : [];
  const meaningfulSource = normalizedSource.filter((item) => !isGenericAutomation(item));
  meaningfulSource.forEach(pushAutomation);

  const eventTypes = new Set(events.map((item) => item.type));
  const eventText = events.map((item) => `${item?.title || ""} ${item?.description || ""}`).join(" ");
  const hasMeeting = eventTypes.has("meeting") || /投资人|客户|会议|汇报|拜访|对接|沟通|路演|会面|面谈|签约|谈判/.test(eventText) || /投资人|客户|会议|汇报|拜访|对接|沟通|路演|会面|面谈|签约|谈判/.test(text);
  const hasTravel = eventTypes.has("travel") || /出差|机场|高铁|酒店|航班|登机|返程|行程|差旅|打车|导航|到达/.test(eventText) || /出差|机场|高铁|酒店|航班|登机|返程|行程|差旅|打车|导航|到达/.test(text);
  const hasRest = eventTypes.has("rest") || /健身|跑步|拉伸|冥想|恢复|休息|睡眠|喝水|起身/.test(eventText) || /健身|跑步|拉伸|冥想|恢复|休息|睡眠|喝水|起身/.test(text);
  const hasFocus = eventTypes.has("focus") || /开发|测试|复盘|材料|方案|总结|纪要|写作|文档|报告|PPT|表格|邮件|对账/.test(eventText) || /开发|测试|复盘|材料|方案|总结|纪要|写作|文档|报告|PPT|表格|邮件|对账/.test(text);
  const firstMeeting = events.find((item) => item.type === "meeting" && item.date);
  const firstTravel = events.find((item) => item.type === "travel" && item.date);
  const firstFocus = events.find((item) => (item.type === "focus" || item.type === "work") && item.date);

  if (hasMeeting) {
    const meetingTitles = uniqueItems(events.filter((item) => item.type === "meeting").map((item) => clipText(item.title, 20, ""))).slice(0, 2);
    const triggerTime = firstMeeting?.time ? subtractMinutesFromHHmm(firstMeeting.time, 30) : "";
    pushAutomation({
      title: firstMeeting?.title ? `会前提醒：${clipText(firstMeeting.title, 40, "")}` : "会议前提醒",
      description: `在会前 30 分钟提醒准备${meetingTitles.join("、") || "关键会面"}所需材料，会后提醒整理纪要并同步关键结论。`,
      icon: "👥",
      status: "active",
      date: firstMeeting?.date,
      time: triggerTime || firstMeeting?.time
    });
  }

  if (hasTravel) {
    const triggerTime = firstTravel?.time ? subtractMinutesFromHHmm(firstTravel.time, 60) : "";
    pushAutomation({
      title: firstTravel?.title ? `行程检查：${clipText(firstTravel.title, 40, "")}` : "行程出发检查",
      description: "出发前提醒确认交通、证件、地址与到达时间；如有变更优先同步给相关人员。",
      icon: "✈️",
      status: "active",
      date: firstTravel?.date,
      time: triggerTime || firstTravel?.time
    });
  }

  if (hasFocus) {
    const fallbackFocusDate = typeof weekStartDate === "string" ? weekStartDate : (firstFocus?.date || undefined);
    pushAutomation({
      title: "深度工作块",
      description: `为${clipText(firstFocus?.title, 30, "重点输出/材料整理")}预留专注时段，自动减少消息打扰。`,
      icon: "🎯",
      status: "active",
      date: fallbackFocusDate,
      time: firstFocus?.time || "09:30"
    });
  }

  if (hasRest) {
    pushAutomation({
      title: "节奏恢复提醒",
      description: "在高强度安排之间加入喝水、起身与恢复提醒，避免连续透支。",
      icon: "💪",
      status: "pending"
    });
  }

  if (suggestions.length === 0) {
    pushAutomation({
      title: "本周节奏提醒",
      description: "根据本周计划自动提醒关键节点，并在每天结束前整理次日重点。",
      icon: "⚙️",
      status: "active"
    });
  }

  return uniqueItems(suggestions.map((item) => JSON.stringify(item))).map((item) => JSON.parse(item)).slice(0, 4);
}

function isPlaceholderMilestoneTitle(title, index) {
  const text = clipText(title, 120, "");
  if (!text) return true;
  return new RegExp(`^里程碑\\s*${index + 1}$`).test(text) || /^里程碑\s*\d+$/.test(text);
}

function buildMilestonesFromWeeks(weeks, startDate) {
  const weekStarts = getMonthWeekStarts(startDate);
  return weeks.slice(0, 5).map((week, index) => {
    const focus = clipText(week?.focus, 120, "");
    const firstEvent = Array.isArray(week?.key_events) ? clipText(week.key_events[0], 120, "") : "";
    const title = clipText(focus || firstEvent || `${clipText(week?.week_label, 20, `第${index + 1}周`)}重点推进`, 120);
    const combined = `${focus} ${firstEvent}`.trim();
    return {
      title,
      deadline: normalizeDateString(week?.deadline, weekStarts[Math.min(index, weekStarts.length - 1)] || startDate),
      type: classifyMonthMilestoneType(combined || title)
    };
  });
}

function deriveMonthTheme(input, weeks, milestones) {
  const text = String(input || "");
  const focusText = weeks.map((item) => item.focus).join(" ");
  const milestoneText = milestones.map((item) => item.title).join(" ");
  const combined = `${text} ${focusText} ${milestoneText}`;
  if (/发布|上线|交付/.test(combined)) return "上线推进月";
  if (/测试|修复|质量/.test(combined)) return "质量攻坚月";
  if (/学习|备考|训练|读书/.test(combined)) return "成长提升月";
  if (/出差|拜访|客户|沟通/.test(combined)) return "协同推进月";
  const firstFocus = clipText(weeks[0]?.focus, 10, "");
  return firstFocus ? clipText(`${firstFocus}推进月`, 80, "目标推进月") : "目标推进月";
}

function deriveMonthSummary(input, weeks, milestones) {
  const focuses = uniqueItems(weeks.map((item) => clipText(item.focus, 20, ""))).slice(0, 3);
  const milestoneTitles = uniqueItems(milestones.map((item) => clipText(item.title, 18, ""))).slice(0, 3);
  const inputText = clipText(input, 40, "");
  if (focuses.length > 0) {
    return clipText(`本月将围绕${focuses.join("、")}展开推进，并以${milestoneTitles.join("、") || "关键节点达成"}作为阶段性检验。`, 400, "本月以关键目标拆解、节奏推进和阶段复盘为主。");
  }
  if (inputText) {
    return clipText(`本月围绕“${inputText}”持续推进，按周拆解节奏并在关键节点完成复盘与收口。`, 400, "本月以关键目标拆解、节奏推进和阶段复盘为主。");
  }
  return "本月以关键目标拆解、节奏推进和阶段复盘为主。";
}

function normalizeWeekPlan(rawPlan, startDate, existingPlan) {
  const weekDates = getWeekDates(startDate);
  const base = isPlainObject(rawPlan) ? rawPlan : {};
  const existing = isPlainObject(existingPlan) ? existingPlan : {};
  const explicitEvents = extractExplicitWeekEvents(base.planning_input || existing.planning_input || "", startDate);
  const hintEvents = buildWeekHintEvents(base.planning_input || existing.planning_input || "", weekDates);
  const primaryEventsSource = Array.isArray(base.events) && base.events.length > 0
    ? base.events
    : (Array.isArray(existing.events) ? existing.events : []);
  const normalizedEvents = uniqueItems([
    ...explicitEvents.map((item) => normalizeWeekEvent(item, weekDates)).filter(Boolean),
    ...primaryEventsSource.map((item) => normalizeWeekEvent(item, weekDates)).filter(Boolean),
    ...((primaryEventsSource.length < 3 || primaryEventsSource.every((item) => !item?.description))
      ? hintEvents.map((item) => normalizeWeekEvent(item, weekDates)).filter(Boolean)
      : [])
  ].map((item) => JSON.stringify(item))).map((item) => JSON.parse(item));
  const automationsSource = Array.isArray(base.automations) && base.automations.length > 0
    ? base.automations
    : (Array.isArray(existing.automations) ? existing.automations : []);
  const genericWeekSummary = "本周围绕核心目标推进，兼顾专注、协作与恢复。";
  const genericWeekTheme = "本周聚焦";

  return {
    plan_start_date: normalizeDateString(base.plan_start_date, startDate),
    summary: clipText(
      isGenericText(base.summary, [genericWeekSummary]) ? deriveWeekSummary(base.planning_input || existing.planning_input, normalizedEvents) : base.summary,
      300,
      clipText(existing.summary, 300, deriveWeekSummary(base.planning_input || existing.planning_input, normalizedEvents))
    ),
    theme: clipText(
      isGenericText(base.theme, [genericWeekTheme]) ? deriveWeekTheme(base.planning_input || existing.planning_input, normalizedEvents) : base.theme,
      80,
      clipText(existing.theme, 80, deriveWeekTheme(base.planning_input || existing.planning_input, normalizedEvents))
    ),
    events: normalizedEvents,
    device_strategies: buildWeekDeviceStrategies(
      base.planning_input || existing.planning_input,
      normalizedEvents,
      isPlainObject(base.device_strategies)
        ? base.device_strategies
        : (isPlainObject(existing.device_strategies) ? existing.device_strategies : {})
    ),
    automations: buildWeekAutomations(base.planning_input || existing.planning_input, normalizedEvents, automationsSource, startDate),
    stats: {
      focus_hours: Number(base?.stats?.focus_hours ?? existing?.stats?.focus_hours ?? 12),
      meetings: Number(base?.stats?.meetings ?? existing?.stats?.meetings ?? 2),
      travel_days: Number(base?.stats?.travel_days ?? existing?.stats?.travel_days ?? 0)
    }
  };
}

function buildWeekFallbackPlan(input, startDate, existingPlan) {
  const weekDates = getWeekDates(startDate);
  const keywords = String(input || "");
  const events = buildWeekHintEvents(input, weekDates);

  return normalizeWeekPlan({
    plan_start_date: startDate,
    summary: `已根据输入生成基础周计划：${String(input || "").slice(0, 40) || "围绕本周重点推进核心安排"}。`,
    theme: /出差|会议/.test(keywords) ? "协同推进周" : "专注推进周",
    events,
    planning_input: input,
    automations: [
      { title: "每日重点回顾", description: "每天晚上回顾当日推进情况并整理明日重点。", icon: "✨", status: "active" }
    ],
    stats: {
      focus_hours: events.filter((item) => item.type === "focus" || item.type === "work").length * 3,
      meetings: events.filter((item) => item.type === "meeting").length,
      travel_days: events.filter((item) => item.type === "travel").length
    }
  }, startDate, existingPlan);
}

function normalizeMonthlyPlan(rawPlan, startDate, existingPlan) {
  const base = isPlainObject(rawPlan) ? rawPlan : {};
  const existing = isPlainObject(existingPlan) ? existingPlan : {};
  const milestonesSource = Array.isArray(base.key_milestones) && base.key_milestones.length > 0
    ? base.key_milestones
    : (Array.isArray(existing.key_milestones) ? existing.key_milestones : []);
  const weeksSource = Array.isArray(base.weeks_breakdown) && base.weeks_breakdown.length > 0
    ? base.weeks_breakdown
    : (Array.isArray(existing.weeks_breakdown) ? existing.weeks_breakdown : []);
  const normalizedWeeks = weeksSource.map((item, index) => ({
    week_label: clipText(item?.week_label, 40, `第${index + 1}周`),
    focus: clipText(item?.focus, 120, "推进当周重点"),
    key_events: Array.isArray(item?.key_events) ? item.key_events.slice(0, 6).map((entry) => clipText(entry, 120, "")).filter(Boolean) : []
  }));
  const rawMilestones = milestonesSource.map((item, index) => ({
    title: clipText(item?.title, 120, `里程碑 ${index + 1}`),
    deadline: normalizeDateString(item?.deadline, startDate),
    type: clipText(item?.type, 40, "milestone")
  }));
  const derivedMilestones = buildMilestonesFromWeeks(normalizedWeeks, startDate);
  const normalizedMilestones = (rawMilestones.length > 0 ? rawMilestones : derivedMilestones).map((item, index) => {
    if (!isPlaceholderMilestoneTitle(item.title, index)) return item;
    return derivedMilestones[index] || item;
  });
  const genericMonthSummary = "本月以关键目标拆解、节奏推进和阶段复盘为主。";
  const genericMonthTheme = "月度蓝图";

  return {
    plan_start_date: normalizeDateString(base.plan_start_date, startDate),
    summary: clipText(
      isGenericText(base.summary, [genericMonthSummary]) ? deriveMonthSummary(base.planning_input || existing.planning_input, normalizedWeeks, normalizedMilestones) : base.summary,
      400,
      clipText(existing.summary, 400, deriveMonthSummary(base.planning_input || existing.planning_input, normalizedWeeks, normalizedMilestones))
    ),
    theme: clipText(
      isGenericText(base.theme, [genericMonthTheme]) ? deriveMonthTheme(base.planning_input || existing.planning_input, normalizedWeeks, normalizedMilestones) : base.theme,
      80,
      clipText(existing.theme, 80, deriveMonthTheme(base.planning_input || existing.planning_input, normalizedWeeks, normalizedMilestones))
    ),
    key_milestones: normalizedMilestones,
    weeks_breakdown: normalizedWeeks,
    strategies: isPlainObject(base.strategies)
      ? base.strategies
      : (isPlainObject(existing.strategies) ? existing.strategies : {
        focus: "前中后段分别对应启动、推进、收口。",
        balance: "每周保留恢复和复盘窗口，避免全月透支。"
      }),
    stats: {
      focus_hours: Number(base?.stats?.focus_hours ?? existing?.stats?.focus_hours ?? 36),
      milestones_count: Number(base?.stats?.milestones_count ?? existing?.stats?.milestones_count ?? normalizedMilestones.length ?? 3)
    }
  };
}

function buildMonthFallbackPlan(input, startDate, existingPlan) {
  const weekStarts = getMonthWeekStarts(startDate);
  const keywords = String(input || "");
  const milestones = [
    { title: "明确月度目标与优先级", deadline: weekStarts[0], type: "goal" },
    { title: "完成核心事项中段检查", deadline: weekStarts[2], type: "review" },
    { title: "月底总结与复盘", deadline: weekStarts[3], type: "review" }
  ];

  if (/上线|发布|交付/.test(keywords)) {
    milestones.unshift({ title: "完成发布前准备", deadline: weekStarts[1], type: "launch" });
  }
  if (/考试|学习|读书|训练/.test(keywords)) {
    milestones.push({ title: "完成本月阶段学习成果", deadline: weekStarts[3], type: "milestone" });
  }

  return normalizeMonthlyPlan({
    plan_start_date: startDate,
    summary: `已根据输入生成基础月度蓝图：${String(input || "").slice(0, 50) || "聚焦本月核心目标与节奏安排"}。`,
    theme: /提升|学习|习惯/.test(keywords) ? "成长提升月" : "目标推进月",
    key_milestones: milestones,
    planning_input: input,
    weeks_breakdown: [
      { week_label: "第 1 周", focus: "明确目标与拆解动作", key_events: ["梳理优先级", "建立执行节奏"] },
      { week_label: "第 2 周", focus: "集中推进核心事项", key_events: ["安排深度工作块", "同步关键协作"] },
      { week_label: "第 3 周", focus: "检查进度与修正路径", key_events: ["做一次中期复盘", "补齐风险项"] },
      { week_label: "第 4 周", focus: "收口交付与总结复盘", key_events: ["完成交付", "整理复盘"] }
    ],
    strategies: {
      focus: "把月目标拆到每周，避免一次性压到月底。",
      balance: "在高强度推进之外预留恢复与缓冲空间。"
    },
    stats: {
      focus_hours: 40,
      milestones_count: milestones.length
    }
  }, startDate, existingPlan);
}

async function generateWeekPlan(payload) {
  const requestedDate = normalizeDateString(payload.startDate, normalizeDateString(payload.currentDate, new Date().toISOString().slice(0, 10)));
  const appendMode = Boolean(payload.appendMode);
  const nextInput = payload.appendInput || payload.input || "";
  const combinedPlanningInput = appendMode
    ? mergePlanningInputs(payload.existingInput || payload.existingPlan?.planning_input, nextInput)
    : nextInput;
  const startDate = appendMode
    ? getWeekStartDate(requestedDate)
    : resolvePlanningWeekStart(requestedDate, payload.currentDate, combinedPlanningInput);

  try {
    const data = await invokeKimiText({
      systemPrompt: [
        "你是一名中文周计划规划助手。",
        `当前查看周起始日期（周一）是：${startDate}。`,
        "输出必须是 JSON，不要输出解释。",
        appendMode ? "当前任务是把新增内容准确合并进现有周计划，并返回合并后的完整周计划。" : "请返回完整周计划，而不是片段。",
        "summary 和 theme 必须结合用户输入具体填写，不要写“本周聚焦”这类泛化占位词。",
        "events 中每条都要包含：date(YYYY-MM-DD)、day_index(0-6)、title、time(HH:MM)、type、icon。",
        "events 至少返回 3-6 条，并尽量覆盖不同日期；不要只给笼统的 1-2 条事件。",
        "如果用户明确提到周几、时间、对象（如“周四见投资人”“周二下午3点拜访客户”），这些事件必须原样体现在 events 中，不能遗漏。",
        "如果用户提到地点、对象、事件目的，请优先写入对应事件标题或 description，不要丢失关键信息。",
        appendMode ? "现有计划里未被新增内容修改的事件请保留；若新增内容与现有事件冲突，请返回更新后的最终安排。" : "请结合输入生成适合该周的完整安排。",
        "device_strategies 至少包含 phone/watch/pc 三项。",
        "automations 仅保留 1-4 条最有价值的自动化动作，必须结合本周真实事件，避免泛化占位文案。",
        "如果用户提到差旅、会议、发布、健身、学习等场景，请把这些信息体现在 events 和 summary 中。"
      ].join("\n"),
      prompt: [
        appendMode ? `新增内容：${nextInput}` : `用户输入：${combinedPlanningInput}`,
        payload.existingPlan ? `现有周计划（请基于它合并更新）：${JSON.stringify(payload.existingPlan)}` : "",
        appendMode && (payload.existingInput || payload.existingPlan?.planning_input) ? `现有周计划原始输入：${payload.existingInput || payload.existingPlan?.planning_input}` : "",
        `今天日期：${payload.currentDate || startDate}`
      ].filter(Boolean).join("\n\n"),
      responseJsonSchema: {
        type: "object",
        properties: {
          plan_start_date: { type: "string" },
          summary: { type: "string" },
          theme: { type: "string" },
          events: { type: "array" },
          device_strategies: { type: "object" },
          automations: { type: "array" },
          stats: { type: "object" }
        },
        required: ["summary", "events"]
      },
      temperature: 0.2,
      maxTokens: 1800
    });

    return {
      ...normalizeWeekPlan({ ...data, planning_input: combinedPlanningInput }, startDate, payload.existingPlan),
      generation_mode: "ai"
    };
  } catch (error) {
    console.error("[generateWeekPlan] AI generation failed, using fallback:", error);
    return {
      ...buildWeekFallbackPlan(combinedPlanningInput, startDate, payload.existingPlan),
      generation_mode: "fallback",
      generation_error: error?.message || "AI 生成失败，已切换为基础模板"
    };
  }
}

async function generateMonthPlan(payload) {
  const startDate = normalizeDateString(payload.startDate, new Date().toISOString().slice(0, 10));

  try {
    const data = await invokeKimiText({
      systemPrompt: [
        "你是一名中文月度规划助手。",
        `当前查看月份起始日期是：${startDate}。`,
        "输出必须是 JSON，不要输出解释。",
        "请返回完整月度蓝图。",
        "summary 和 theme 必须结合用户目标具体填写，不要写“月度蓝图”这类泛化占位词。",
        "key_milestones 返回 3-6 个关键里程碑，每项都必须包含清晰中文标题、deadline、type，禁止使用“里程碑1/2/3”这种占位名。",
        "weeks_breakdown 返回 4-5 周拆解，每周包含 week_label、focus、key_events。",
        "weeks_breakdown 的 focus 要体现当周最关键推进方向，key_events 要写具体动作，不要写泛泛的空话。",
        "如果用户提到开发、测试、发布、运动、学习、复盘等场景，请把这些内容体现在里程碑和周度拆解中。"
      ].join("\n"),
      prompt: [
        `用户输入：${payload.input || ""}`,
        Array.isArray(payload.behaviors) && payload.behaviors.length > 0
          ? `近期待观察到的行为样本：${JSON.stringify(payload.behaviors.slice(0, 20))}`
          : "",
        payload.existingPlan ? `现有月计划（如需追加，请返回合并后的完整版本）：${JSON.stringify(payload.existingPlan)}` : ""
      ].filter(Boolean).join("\n\n"),
      responseJsonSchema: {
        type: "object",
        properties: {
          plan_start_date: { type: "string" },
          summary: { type: "string" },
          theme: { type: "string" },
          key_milestones: { type: "array" },
          weeks_breakdown: { type: "array" },
          strategies: { type: "object" },
          stats: { type: "object" }
        },
        required: ["summary", "key_milestones", "weeks_breakdown"]
      },
      temperature: 0.2,
      maxTokens: 2200
    });

    return {
      ...normalizeMonthlyPlan({ ...data, planning_input: payload.input }, startDate, payload.existingPlan),
      generation_mode: "ai"
    };
  } catch (error) {
    console.error("[generateMonthPlan] AI generation failed, using fallback:", error);
    return {
      ...buildMonthFallbackPlan(payload.input, startDate, payload.existingPlan),
      generation_mode: "fallback",
      generation_error: error?.message || "AI 生成失败，已切换为基础模板"
    };
  }
}

functionsRouter.post("/:name", async (req, res) => {
  const { name } = req.params;
  const payload = req.body || {};

  try {
    if (name === "invokeKimi") {
      if (Array.isArray(payload.file_urls) && payload.file_urls.length > 0) {
        return res.status(501).json({
          error: "FILE_INPUT_NOT_IMPLEMENTED",
          message: "独立后端当前仅支持纯文本 Kimi 调用，文件上传与附件抽取尚未迁移"
        });
      }

      const data = await invokeKimiText({
        prompt: payload.prompt,
        systemPrompt: payload.system_prompt,
        responseJsonSchema: payload.response_json_schema,
        model: payload.model,
        temperature: payload.temperature
      });

      return res.json(data);
    }

    if (name === "kimiWebBrowse") {
      const data = await invokeKimiWebSearch({
        query: payload.query,
        language: payload.language
      });

      return res.json(data);
    }

    if (name === "analyzeIntent") {
      const data = await analyzeIntentWithKimi({
        input: payload.input,
        date: payload.date,
        existingPlan: payload.existingPlan
      });

      return res.json(data);
    }

    if (name === "callAI") {
      const data = await invokeKimiText({
        prompt: payload.prompt,
        systemPrompt: payload.system_prompt,
        responseJsonSchema: payload.response_json_schema,
        model: payload.model,
        temperature: payload.temperature
      });

      return res.json({
        data,
        balance: req.user.aiCredits
      });
    }

    if (name === "generateWeekPlan") {
      if (!payload.input || !String(payload.input).trim()) {
        return res.status(400).json({ error: "INVALID_INPUT", message: "缺少周计划输入内容" });
      }

      return res.json(await generateWeekPlan(payload));
    }

    if (name === "generateMonthPlan") {
      if (!payload.input || !String(payload.input).trim()) {
        return res.status(400).json({ error: "INVALID_INPUT", message: "缺少月计划输入内容" });
      }

      return res.json(await generateMonthPlan(payload));
    }

    if (name === "createWechatOrder") {
      const pack = getCreditPack(payload.packId);
      if (!pack) {
        return res.status(400).json({ error: "INVALID_PACK", message: "无效的点数包" });
      }

      const cfg = await getWechatMerchantConfig();
      if (!cfg) {
        return res.status(501).json({ error: "WECHAT_NOT_CONFIGURED", message: "微信支付未配置" });
      }

      const reuseAfterMs = 10 * 60 * 1000;
      const reuseSince = new Date(Date.now() - reuseAfterMs);
      const existing = await prisma.wechatOrder.findFirst({
        where: {
          userId: req.user.id,
          packId: pack.id,
          status: "PENDING",
          createdAt: { gt: reuseSince }
        },
        orderBy: { createdAt: "desc" }
      });

      if (existing?.codeUrl) {
        return res.json({
          data: {
            code_url: existing.codeUrl,
            order_no: existing.orderNo
          }
        });
      }

      const outTradeNo = generateOutTradeNo("wx");
      const description = `SoulSentry · ${pack.name} · ${pack.credits}点`;
      const attach = JSON.stringify({ user_id: req.user.id, pack_id: pack.id, credits: pack.credits });

      const result = await createWechatNativeOrder(
        {
          description,
          outTradeNo,
          totalFen: pack.priceFen,
          attach
        },
        cfg
      );

      const codeUrl = result?.code_url;
      if (!codeUrl) {
        return res.status(502).json({ error: "WECHAT_CREATE_ORDER_FAILED", message: "微信下单失败" });
      }

      await prisma.wechatOrder.create({
        data: {
          userId: req.user.id,
          orderNo: outTradeNo,
          packId: pack.id,
          credits: pack.credits,
          amountFen: pack.priceFen,
          description,
          codeUrl,
          status: "PENDING"
        }
      });

      return res.json({ data: { code_url: codeUrl, order_no: outTradeNo } });
    }

    if (name === "queryWechatOrder") {
      const orderNo = String(payload.order_no || "").trim();
      if (!orderNo) {
        return res.status(400).json({ error: "INVALID_INPUT", message: "缺少订单号" });
      }

      const order = await prisma.wechatOrder.findFirst({
        where: { orderNo, userId: req.user.id }
      });

      if (!order) {
        return res.status(404).json({ error: "NOT_FOUND", message: "订单不存在" });
      }

      if (order.status === "PAID") {
        return res.json({ data: { paid: true, order_no: order.orderNo } });
      }

      const cfg = await getWechatMerchantConfig();
      if (!cfg) {
        return res.json({ data: { paid: false, order_no: order.orderNo } });
      }

      try {
        const remote = await wechatQueryOrder(order.orderNo, cfg);
        const tradeState = remote?.trade_state;
        const transactionId = remote?.transaction_id || null;
        const successTime = remote?.success_time || null;

        if (tradeState === "SUCCESS") {
          await markWechatOrderPaid({
            orderNo: order.orderNo,
            transactionId,
            paidAt: successTime ? new Date(successTime) : null
          });
          return res.json({ data: { paid: true, order_no: order.orderNo } });
        }

        if (tradeState && tradeState !== order.status) {
          await prisma.wechatOrder.update({
            where: { id: order.id },
            data: { status: String(tradeState).slice(0, 40) }
          });
        }
      } catch (_error) {
        void _error;
      }

      return res.json({ data: { paid: false, order_no: order.orderNo } });
    }

    if (name === "getVapidPublicKey") {
      return res.json({
        data: {
          publicKey: getConfiguredVapidPublicKey()
        }
      });
    }

    if (name === "savePushSubscription") {
      const existingPreference = await prisma.userPreference.findUnique({
        where: { userId: req.user.id }
      });

      const nextSubscription = payload.subscription || null;
      const nextMetadata = buildPreferenceMetadata(existingPreference?.metadata, {
        push_subscription: nextSubscription,
        push_user_agent: payload.user_agent ? String(payload.user_agent).slice(0, 500) : null,
        push_enabled: Boolean(nextSubscription)
      });

      const preference = await prisma.userPreference.upsert({
        where: { userId: req.user.id },
        update: {
          pushNotifications: Boolean(nextSubscription),
          metadata: nextMetadata
        },
        create: {
          userId: req.user.id,
          pushNotifications: Boolean(nextSubscription),
          locale: "zh-CN",
          timezone: "Asia/Shanghai",
          metadata: nextMetadata
        }
      });

      return res.json({
        data: {
          ok: true,
          subscribed: Boolean(nextSubscription),
          preference_id: preference.id
        }
      });
    }

    if (["executeAutomation", "createStripeCheckout"].includes(name)) {
      return res.status(501).json({
        error: "FUNCTION_NOT_IMPLEMENTED",
        message: `独立后端已预留 ${name}，但尚未完成迁移`,
        input: payload
      });
    }

    return res.status(404).json({
      error: "FUNCTION_NOT_FOUND",
      message: `未找到函数 ${name}`
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: "FUNCTION_EXECUTION_FAILED",
      message: error.message || "函数执行失败"
    });
  }
});
