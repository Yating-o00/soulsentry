import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { prisma } from "../lib/prisma.js";
import { invokeKimiText, invokeKimiWebSearch } from "../lib/kimi.js";
import { env } from "../config/env.js";
import { analyzeIntentWithKimi } from "../services/analyzeIntent.js";
import { parseTaskInput } from "../services/parseTaskInput.js";
import { buildHeartSignFallback, detectVault, detectCrisis } from "../services/heartSignFallback.js";
import { executeAutomation } from "../services/executeAutomation.js";
import { sendTestPush } from "../services/reminderSender.js";
import { getCreditPack } from "../config/creditPacks.js";
import { createWechatNativeOrder, generateOutTradeNo, getWechatMerchantConfig, queryWechatOrder as wechatQueryOrder } from "../lib/wechatPay.js";
import { markWechatOrderPaid } from "../services/wechatOrders.js";
import { savePptHtml } from "../lib/renderPpt.js";

export const functionsRouter = Router();

functionsRouter.use(requireAuth);

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getPreferenceExtraFields(preferences) {
  if (preferences?.metadata && isPlainObject(preferences.metadata)) {
    const extraFields = preferences.metadata._extraFields;
    if (isPlainObject(extraFields)) {
      return extraFields;
    }
  }
  return {};
}

function haversineMeters(a, b) {
  if (!a || !b) return Infinity;
  const R = 6371000;
  const toRad = (v) => (v * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const x = Math.sin(dLat / 2) ** 2
    + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(x));
}

function getTaskExtraFields(task) {
  if (isPlainObject(task?.metadata?._extraFields)) {
    return task.metadata._extraFields;
  }
  return {};
}

function getTaskLocationReminder(task) {
  const extraFields = getTaskExtraFields(task);
  const reminder = extraFields.location_reminder;
  return isPlainObject(reminder) ? reminder : null;
}

// ===== 约定列表智能分析辅助函数 =====
function sameLocalDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function addLocalDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function formatHm(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function buildTaskTimeLabel(task, now = new Date()) {
  const end = task.end_time || task.due_at || task.reminder_time;
  if (!end) return "未安排时间";
  const d = new Date(end);
  if (isNaN(d.getTime())) return String(end);

  const done = task.status === "completed" || task.status === "done" || task.status === "archived";
  const diffMs = d.getTime() - now.getTime();
  const diffH = diffMs / (1000 * 60 * 60);

  if (!done && diffMs < 0) {
    const days = Math.max(1, Math.ceil(-diffMs / (1000 * 60 * 60 * 24)));
    return `已逾期 ${days} 天`;
  }

  if (sameLocalDay(d, now)) return `今天 ${formatHm(d)}`;
  if (sameLocalDay(d, addLocalDays(now, 1))) return `明天 ${formatHm(d)}`;
  if (sameLocalDay(d, addLocalDays(now, 2))) return `后天 ${formatHm(d)}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${formatHm(d)}`;
}

function getTaskRecurringLabel(task) {
  const tags = Array.isArray(task.tags) ? task.tags : [];
  const meta = isPlainObject(task.metadata) ? task.metadata : {};
  const extra = isPlainObject(meta._extraFields) ? meta._extraFields : {};
  if (extra.recurring || meta.recurring) return String(extra.recurring || meta.recurring);
  const map = { "每天": "每天", "每周": "每周", "每月": "每月" };
  for (const k of Object.keys(map)) {
    if (tags.includes(k) || task.title?.includes(k)) return map[k];
  }
  if (/每天|每晚|每周|每月/.test(task.title || "")) {
    const m = (task.title || "").match(/每[天周月晚]/);
    if (m) return m[0];
  }
  return null;
}

function getTaskLocation(task) {
  const reminder = getTaskLocationReminder(task);
  if (reminder?.location_name) return reminder.location_name;
  const meta = isPlainObject(task.metadata) ? task.metadata : {};
  const extra = isPlainObject(meta._extraFields) ? meta._extraFields : {};
  if (extra.location_name || meta.location_name) return String(extra.location_name || meta.location_name);
  if (task.location) return String(task.location);
  return null;
}

function buildAutoExec(task, executions) {
  const done = task.status === "completed" || task.status === "done" || task.status === "archived";
  if (done) return undefined;
  const list = (executions || []).filter(
    (e) => e.task_id === task.id && e.automation_type && e.automation_type !== "none"
  );
  if (list.length === 0) return undefined;
  list.sort((a, b) => new Date(b.created_date || 0) - new Date(a.created_date || 0));
  const exec = list[0];
  const status = String(exec.execution_status || "").toLowerCase();
  const kindLabelMap = {
    email: "邮件草稿",
    research: "联网调研",
    slides: "演示稿",
    ledger: "整理账本",
    file: "文件整理",
    calendar: "日程同步",
    none: "自动执行"
  };
  const kind = exec.automation_type || "none";
  const label = kindLabelMap[kind] || "自动执行";

  let trust = exec.requires_approval ? 78 : 92;
  let trustLevel = exec.requires_approval ? "确认后执行" : "自动执行";
  let state = "ready";
  if (status === "running" || status === "in_progress") {
    state = "running";
  } else if (status === "error" || status === "failed" || exec.error_message) {
    trust = 45;
    trustLevel = "人工接管";
    state = "manual";
  }

  const plan = isPlainObject(exec.automation_plan) ? exec.automation_plan : {};
  const result = isPlainObject(exec.automation_result) ? exec.automation_result : {};
  const previewTitle = `${label} · ${state === "ready" ? "已备好，待你验收" : state === "running" ? "AI 生成中" : "信任度不足，已转人工"}`;
  const previewBody = [];
  if (Array.isArray(plan.previewBody) && plan.previewBody.length > 0) {
    previewBody.push(...plan.previewBody);
  } else if (Array.isArray(result.previewBody) && result.previewBody.length > 0) {
    previewBody.push(...result.previewBody);
  } else if (Array.isArray(plan.steps) && plan.steps.length > 0) {
    previewBody.push(...plan.steps.map((s) => (typeof s === "string" ? s : s.text || "")).filter(Boolean));
  } else if (result.summary) {
    previewBody.push(String(result.summary));
  } else {
    previewBody.push("心栈已根据约定内容生成执行方案，验收后即可自动完成。");
  }

  return {
    kind,
    label,
    state,
    trust,
    trustLevel,
    previewTitle,
    previewBody,
    executionId: exec.id
  };
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error("TIMEOUT")), ms);
    })
  ]);
}

function buildRuleAiNote(task, subtasks, autoExec) {
  const subs = Array.isArray(subtasks) ? subtasks : [];
  const doneCount = subs.filter((s) => s.status === "completed" || s.status === "done").length;
  const overdue = task.timeLabel?.includes("逾期");
  const location = getTaskLocation(task);

  if (autoExec && autoExec.state === "ready") {
    return "机器可完成的部分已预执行，你只需验收。";
  }
  if (autoExec && autoExec.state === "running") {
    return `${autoExec.label}正在生成中，完成后会提醒你验收。`;
  }
  if (autoExec && autoExec.state === "manual") {
    return "这条自动执行之前出过问题，心栈建议你来接管。";
  }
  if (subs.length > 0) {
    if (doneCount === subs.length) {
      return "子约定都已完成，可以一键完成这个约定了。";
    }
    return `已完成 ${doneCount}/${subs.length} 步，下一步：${subs.find((s) => s.status !== "completed" && s.status !== "done")?.title || "继续推进"}。`;
  }
  if (overdue) {
    const days = task.timeLabel?.match(/(\d+)/)?.[1] || "几";
    return `已等你 ${days} 天了。现在捞回它，比重新启动要容易得多。`;
  }
  if (location) {
    return `到达 ${location} 附近时可以顺手处理这个约定。`;
  }
  if (task.priority === "urgent" || task.priority === "high") {
    const hour = new Date().getHours();
    if (hour >= 9 && hour < 12) return "上午是你的高产时段，这种高优先级约定通常推进得最快。";
    return "这个约定优先级较高，建议先安排一个完整的时间段。";
  }

  // 基于标题关键词的个性化兜底（在 Kimi 不可用时仍保持差异感）
  const t = String(task.title || "");
  const lower = t.toLowerCase();
  if (/看书|阅读|读书|翻书/.test(t)) return "把书放在手边，翻开读一页，惯性会带你继续。";
  if (/加油|汽油|油箱|油站/.test(t)) return "顺路时油量最低，顺手加满，明天会轻松很多。";
  if (/飞|航班|机场|登机|行李|收拾/.test(t)) return "提前 2 小时到机场，行李可以昨晚就开始收拾。";
  if (/删|清理|整理|扔掉|丢掉/.test(t)) return "清理掉不再需要的，清单和心情都会轻一点。";
  if (/药|吃药|服药|维生素|胶囊/.test(t)) return "把药和一杯水放在显眼处，吃完再忙别的。";
  if (/锻炼|跑步|健身|运动|瑜伽/.test(t)) return "换上鞋出门就是最难的一步，接下来身体自己会动。";
  if (/早餐|午饭|午餐|晚饭|晚餐|吃饭|吃点/.test(t)) return "按时吃饭不是奖励，是今天继续运转的燃料。";
  if (/开会|会议|zoom|对齐|评审/.test(t)) return "提前 5 分钟到场，把要点在脑海里过一遍。";
  if (/邮件|email|发信/.test(t)) return "先写主题和第一句，后面的内容会自然流出来。";
  if (/报告|方案|文档|ppt|演示/.test(t)) return "先列 3 个要点，比一次性写完整版更容易启动。";
  if (/电话|打电话|爸妈|父母|家人/.test(t)) return "电话接通后先说一声'想你了'，比说什么都重要。";
  if (/写|写作|码字|文章/.test(t)) return "先写 50 字烂开头，改比写容易。";
  if (/买|采购|超市|菜|水果/.test(t)) return "列一个小清单，一次买齐，少跑一趟。";
  if (/还|还款|账单|交费|缴费/.test(t)) return "顺手还掉，避免月底一起算账的压力。";
  if (/睡|睡觉|早睡|休息|放松/.test(t)) return "今晚把屏幕放远 20 厘米，睡眠会自己来。";
  if (/提醒|记得|别忘了|别忘记/.test(t)) return "把它放在视觉中心，完成后再把它移开。";

  // 按分类给出有区分度的兜底
  const category = task.category || "other";
  if (category === "health") return "照顾好自己，是今天最重要的小事之一。";
  if (category === "work") return "把它放进高产时段，推进会比想象中快。";
  if (category === "study") return "每天一小步，也是在给长期目标蓄力。";
  if (category === "family") return "和重要的人有关的约定，顺水推一件就好。";
  if (category === "finance") return "顺手处理，清单和心情都会轻一点。";
  if (category === "shopping") return "顺手处理，清单和心情都会轻一点。";
  return "把它放进今天的河流，顺水推一件就好。";
}

async function buildAiNote(task, subtasks, autoExec) {
  const done = task.status === "completed" || task.status === "done" || task.status === "archived";

  // 已完成的约定不需要 AI 分析；自动执行/子约定进度仍用规则文案更稳定
  if (done) return undefined;
  if (autoExec && autoExec.state) return buildRuleAiNote(task, subtasks, autoExec);
  const subs = Array.isArray(subtasks) ? subtasks : [];
  if (subs.length > 0) return buildRuleAiNote(task, subtasks, autoExec);
  if (!task.title) return undefined;

  const schema = {
    type: "object",
    properties: {
      aiNote: { type: "string", description: "1-2句个性化建议，自然亲切、具体有针对性" }
    },
    required: ["aiNote"]
  };

  const categoryLabel = {
    work: "工作", personal: "个人", health: "健康", study: "学习",
    family: "家庭", shopping: "购物", finance: "财务", other: "其他"
  }[task.category] || task.category || "其他";

  const priorityLabel = { urgent: "紧急", high: "高", medium: "中", low: "低" }[task.priority] || task.priority || "中";

  const prompt = `用户有这样一个约定：
标题：${task.title}
描述：${task.description || "无"}
分类：${categoryLabel}
优先级：${priorityLabel}
时间：${task.timeLabel || "未安排"}
地点：${getTaskLocation(task) || "未指定"}
状态：${task.timeLabel?.includes("逾期") ? "已逾期" : task.timeLabel?.includes("今天") || task.timeLabel?.includes("即将") ? "今天/即将到期" : "进行中"}

请基于以上信息，生成一句 1-2 行的个性化建议。要求：
1. 内容具体、有温度，不要泛泛而谈。
2. 如果是健康/用药/锻炼类，给出温暖的执行提示。
3. 如果是工作/学习类，给出推进建议或最佳时段提示。
4. 如果有地点，结合地点给出建议。
5. 如果已逾期或即将到期，给出轻量安抚和最小下一步。
6. 直接返回 JSON 对象 {"aiNote": "..."}，不要 markdown 或解释。`;

  try {
    console.log(`[buildAiNote] task=${task.id} title="${task.title}" calling Kimi`);
    const result = await withTimeout(
      invokeKimiText({
        prompt,
        systemPrompt: "你是 SoulSentry 的心栈伙伴，擅长把任务信息转化成一句温暖、具体、可执行的建议。必须直接返回 JSON 对象。",
        responseJsonSchema: schema,
        temperature: 0.6
      }),
      15000
    );
    const note = result?.aiNote?.trim();
    console.log(`[buildAiNote] task=${task.id} note="${note?.slice(0, 80) || "(empty)"}"`);
    return note || buildRuleAiNote(task, subtasks, autoExec);
  } catch (err) {
    console.error(`[buildAiNote] task=${task.id} Kimi failed:`, err?.message || err);
    return buildRuleAiNote(task, subtasks, autoExec);
  }
}

async function analyzeTask(task, executions, subtasks) {
  const now = new Date();
  const timeLabel = buildTaskTimeLabel(task, now);
  const recurring = getTaskRecurringLabel(task);
  const location = getTaskLocation(task);
  const autoExec = buildAutoExec(task, executions);
  const aiNote = await buildAiNote(task, subtasks, autoExec);
  const subPromises = (subtasks || []).map((s) => ({
    id: s.id,
    title: s.title,
    done: s.status === "completed" || s.status === "done"
  }));

  const end = task.end_time || task.due_at;
  const overdue = end && new Date(end).getTime() < now.getTime() && !["completed", "done", "archived"].includes(task.status);
  const within24h = end && !overdue && new Date(end).getTime() - now.getTime() <= 24 * 60 * 60 * 1000;

  let group = "suggested";
  if (recurring) {
    group = "fixed";
  } else if (overdue || within24h) {
    group = "due";
  } else if (autoExec || location || (task.priority === "urgent" || task.priority === "high")) {
    group = "now";
  }

  const priorityLabelMap = { urgent: "紧急", high: "高", medium: "中", low: "低" };

  return {
    group,
    timeLabel,
    overdue,
    recurring,
    location,
    aiNote,
    autoExec,
    subPromises,
    priorityLabel: priorityLabelMap[task.priority] || task.priority || "中"
  };
}

const FORGETTING_CURVE = [
  { days: 1, retention: 44 },
  { days: 2, retention: 28 },
  { days: 3, retention: 22 },
  { days: 7, retention: 15 },
  { days: 14, retention: 10 },
  { days: 30, retention: 5 }
];

function getForgetRate(days) {
  if (days < 1) return 0;
  const hit = FORGETTING_CURVE.find((c) => days <= c.days);
  const retention = hit ? hit.retention : 3;
  return Math.min(95, 100 - retention);
}

function daysBetween(from, to = new Date()) {
  if (!from) return 0;
  return Math.floor((new Date(to) - new Date(from)) / (1000 * 60 * 60 * 24));
}

const CATEGORY_LABEL = {
  work: "工作", personal: "个人", health: "健康", study: "学习",
  family: "家庭", shopping: "购物", finance: "财务", other: "其他"
};

function startOfLocalDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfLocalDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function buildDailyBriefingTitle(displayName) {
  const now = new Date();
  const hour = now.getHours();
  const period = hour < 12 ? "早安" : hour < 18 ? "午后" : "晚间";
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${displayName || "旅行者"}的${period}心栈·${month}月${day}日`;
}

async function generateDailyBriefingForUser(user) {
  const now = new Date();
  const todayStart = startOfLocalDay(now);
  const todayEnd = endOfLocalDay(now);

  const tasks = await prisma.task.findMany({
    where: { userId: user.id, deletedAt: null },
    orderBy: [{ updatedAt: "desc" }],
    take: 300
  });

  const activeTasks = tasks.filter((t) => t.status !== "DONE" && t.status !== "ARCHIVED");
  const urgentTasks = activeTasks.filter((t) => t.priority === "urgent" || t.priority === "high");
  const overdueTasks = activeTasks.filter((t) => t.endTime && new Date(t.endTime) < now);
  const todayDueTasks = activeTasks.filter((t) => {
    const candidate = t.dueAt || t.endTime || t.reminderTime;
    if (!candidate) return false;
    const dt = new Date(candidate);
    return dt >= todayStart && dt <= todayEnd;
  });

  const recentCompleted = tasks
    .filter((t) => t.status === "DONE")
    .sort((a, b) => new Date(b.completedAt || b.updatedAt) - new Date(a.completedAt || a.updatedAt))
    .slice(0, 5);

  const topTitles = urgentTasks.slice(0, 3).map((t) => `「${t.title}」`).join("、");
  const shortTerm = (() => {
    if (activeTasks.length === 0) return "今天没有待办任务，适合把精力留给恢复与长期目标。";
    if (urgentTasks.length > 0) return `优先推进 ${topTitles}。把需要快速反馈的事项先收口，再处理常规任务。`;
    if (todayDueTasks.length > 0) return `今天有 ${todayDueTasks.length} 项需要关注的到期/提醒任务，建议先完成最容易推进的一项来启动节奏。`;
    if (overdueTasks.length > 0) return `有 ${overdueTasks.length} 项任务已超过预期时间，挑选其中影响最大的先做一次“降阻/改期”处理。`;
    return `你当前有 ${activeTasks.length} 项活跃任务，建议用一个 25 分钟专注块推进最关键的一项。`;
  })();

  const longTerm = (() => {
    if (recentCompleted.length > 0) {
      const names = recentCompleted.slice(0, 2).map((t) => `「${t.title}」`).join("、");
      return `你最近完成了 ${names}。保持这个节奏，把“重要但不紧急”的事项也安排进日程里。`;
    }
    return "给未来留一点空间：把本周最重要的目标写下来，并为它预留一个稳定的固定时段。";
  })();

  const mindful = urgentTasks.length > 0
    ? "先做最重要的一件事，其他事会自动变轻。"
    : "慢一点也没关系，重要的是方向正确。";

  return {
    title: buildDailyBriefingTitle(user.displayName),
    short_term_narrative: shortTerm,
    long_term_narrative: longTerm,
    mindful_tip: mindful,
    task_stats: {
      active: activeTasks.length,
      urgent: urgentTasks.length,
      overdue: overdueTasks.length,
      today_due: todayDueTasks.length,
      recent_completed: recentCompleted.length
    }
  };
}

function getGeofencePreset(locationType) {
  const presets = {
    home: { radius: 180, quiet_minutes: 45 },
    office: { radius: 220, quiet_minutes: 30 },
    gym: { radius: 120, quiet_minutes: 60 },
    school: { radius: 180, quiet_minutes: 45 },
    shopping: { radius: 150, quiet_minutes: 30 },
    hospital: { radius: 220, quiet_minutes: 90 },
    restaurant: { radius: 120, quiet_minutes: 20 },
    other: { radius: 200, quiet_minutes: 30 }
  };
  return presets[String(locationType || "other")] || presets.other;
}

function decodeXmlEntities(value = "") {
  return String(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripHtml(value = "") {
  return decodeXmlEntities(String(value).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function pickXmlValue(block, tagName) {
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`, "i");
  const matched = String(block || "").match(regex);
  return matched ? decodeXmlEntities(matched[1]).trim() : "";
}

function pickXmlLink(block) {
  const attributeMatch = String(block || "").match(/<link\b[^>]*href=["']([^"']+)["'][^>]*\/?>/i);
  if (attributeMatch?.[1]) {
    return decodeXmlEntities(attributeMatch[1]).trim();
  }
  return stripHtml(pickXmlValue(block, "link"));
}

function parseRssItems(xmlText = "") {
  const blocks = String(xmlText).match(/<(item|entry)\b[\s\S]*?<\/(item|entry)>/gi) || [];
  return blocks.map((block) => {
    const title = stripHtml(pickXmlValue(block, "title"));
    const link = pickXmlLink(block);
    const description = stripHtml(
      pickXmlValue(block, "description")
      || pickXmlValue(block, "summary")
      || pickXmlValue(block, "content")
      || pickXmlValue(block, "content:encoded")
    );
    const pubDate = stripHtml(
      pickXmlValue(block, "pubDate")
      || pickXmlValue(block, "published")
      || pickXmlValue(block, "updated")
    );
    return {
      title,
      link,
      summary: description.slice(0, 280),
      published_at: pubDate || null
    };
  }).filter((item) => item.title && item.link);
}

function buildExternalVisionCards(feed, items = []) {
  return items.slice(0, 3).map((item, index) => ({
    id: `${feed.id}:${index}:${item.link}`,
    type: feed.feedType === "rss" ? "subscription" : "expansion",
    title: item.title,
    summary: item.summary || `${feed.name} 的最新更新`,
    source: feed.name,
    url: item.link,
    relevance: feed.description || "",
    published_at: item.published_at || null
  }));
}

const YMD_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function toYmd(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  const y = String(d.getFullYear());
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseYmd(value) {
  if (typeof value !== "string" || !YMD_PATTERN.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function addDaysYmd(value, offset) {
  const base = parseYmd(value) || new Date();
  base.setDate(base.getDate() + offset);
  return toYmd(base);
}

function normalizeDateString(value, fallback) {
  const direct = typeof value === "string" ? value.trim() : "";
  if (direct && YMD_PATTERN.test(direct)) return direct;
  const fb = typeof fallback === "string" ? fallback.trim() : "";
  if (fb && YMD_PATTERN.test(fb)) return fb;
  return toYmd(new Date());
}

function parseJsonLoose(value) {
  if (!value) return value;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return value;
  const text = value.trim();
  if (!text) return value;
  if (!(text.startsWith("{") || text.startsWith("["))) return value;
  try {
    return JSON.parse(text);
  } catch (_error) {
    return value;
  }
}

function getWeekDates(startDate) {
  const start = parseYmd(startDate) || new Date();
  const dates = [];
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    dates.push(toYmd(d));
  }
  return dates;
}

function normalizeWeekEvent(event, weekDates) {
  if (!isPlainObject(event)) return null;
  const title = typeof event.title === "string" ? event.title.trim() : "";
  if (!title) return null;

  const dayIndex = Number.isFinite(Number(event.day_index)) ? Number(event.day_index) : null;
  const dateCandidate = typeof event.date === "string" ? event.date.trim() : "";
  const date = YMD_PATTERN.test(dateCandidate)
    ? dateCandidate
    : dayIndex !== null && weekDates[dayIndex]
      ? weekDates[dayIndex]
      : weekDates[0];

  const timeText = typeof event.time === "string" && event.time.trim() ? event.time.trim() : "09:00";
  const typeText = typeof event.type === "string" && event.type.trim() ? event.type.trim() : "other";
  const iconText = typeof event.icon === "string" && event.icon.trim() ? event.icon.trim().slice(0, 8) : "📅";

  return {
    date,
    day_index: dayIndex !== null ? Math.max(0, Math.min(6, dayIndex)) : undefined,
    title: title.slice(0, 160),
    time: timeText.slice(0, 10),
    type: typeText.slice(0, 40),
    icon: iconText,
    description: typeof event.description === "string" ? event.description.slice(0, 500) : ""
  };
}

function normalizeWeekPlan(raw, startDate, existingPlan) {
  const data = parseJsonLoose(raw);
  const base = isPlainObject(data) ? data : {};
  const weekDates = getWeekDates(startDate);

  const events = Array.isArray(base.events)
    ? base.events.map((item) => normalizeWeekEvent(item, weekDates)).filter(Boolean)
    : [];

  const automations = Array.isArray(base.automations)
    ? base.automations
        .map((item) => (isPlainObject(item) ? item : null))
        .filter(Boolean)
        .map((item) => ({
          title: typeof item.title === "string" ? item.title.slice(0, 160) : "自动执行",
          description: typeof item.description === "string" ? item.description.slice(0, 500) : "",
          icon: typeof item.icon === "string" ? item.icon.slice(0, 8) : "⚙️",
          status: typeof item.status === "string" ? item.status : "pending"
        }))
    : [];

  const rawStrategies = isPlainObject(base.device_strategies) ? base.device_strategies : {};
  const device_strategies = {
    phone: rawStrategies.phone ?? rawStrategies.mobile ?? rawStrategies.smartphone ?? "",
    watch: rawStrategies.watch ?? "",
    pc: rawStrategies.pc ?? rawStrategies.desktop ?? "",
    car: rawStrategies.car ?? "",
    home: rawStrategies.home ?? "",
    glasses: rawStrategies.glasses ?? ""
  };

  const statsRaw = isPlainObject(base.stats) ? base.stats : {};
  const focusHours = Number(statsRaw.focus_hours);
  const meetings = Number(statsRaw.meetings);
  const travelDays = Number(statsRaw.travel_days);

  return {
    ...base,
    plan_start_date: normalizeDateString(base.plan_start_date, startDate),
    theme: typeof base.theme === "string" ? base.theme.slice(0, 120) : (existingPlan?.theme || ""),
    summary: typeof base.summary === "string" ? base.summary.slice(0, 1600) : (existingPlan?.summary || ""),
    events,
    automations,
    device_strategies,
    stats: {
      focus_hours: Number.isFinite(focusHours) ? focusHours : 0,
      meetings: Number.isFinite(meetings) ? meetings : 0,
      travel_days: Number.isFinite(travelDays) ? travelDays : 0
    }
  };
}

function buildWeekFallbackPlan(input, startDate, existingPlan) {
  const weekDates = getWeekDates(startDate);
  return {
    is_demo: true,
    plan_start_date: startDate,
    theme: existingPlan?.theme || "演示周计划",
    summary: "AI 服务暂时不可用，已生成演示规划（不影响保存与后续编辑）。",
    events: [
      {
        date: weekDates[0],
        day_index: 0,
        title: "梳理本周三件最重要的事",
        time: "09:30",
        type: "focus",
        icon: "🎯",
        description: String(input || "").slice(0, 200)
      }
    ],
    automations: [
      { title: "每日晨间提醒", description: "09:00 触发今日三件事复盘", icon: "⏰", status: "pending" }
    ],
    device_strategies: {
      phone: "提醒安排：根据日程自动推送关键任务与出行提醒。",
      watch: "用短震动提示到点事项，避免打断深度工作。",
      pc: "工作时段集中显示待办与会议摘要，减少切屏。",
      car: "",
      home: "",
      glasses: ""
    },
    stats: { focus_hours: 6, meetings: 2, travel_days: 0 }
  };
}

async function generateWeekPlan(payload) {
  const startDate = normalizeDateString(payload.startDate, payload.currentDate);

  const schema = {
    type: "object",
    properties: {
      plan_start_date: { type: "string" },
      theme: { type: "string" },
      summary: { type: "string" },
      events: {
        type: "array",
        items: {
          type: "object",
          properties: {
            date: { type: "string" },
            day_index: { type: "number" },
            title: { type: "string" },
            time: { type: "string" },
            type: { type: "string" },
            icon: { type: "string" },
            description: { type: "string" }
          },
          required: ["date", "title", "time", "type", "icon"]
        }
      },
      device_strategies: { type: "object" },
      automations: { type: "array" },
      stats: { type: "object" }
    },
    required: ["plan_start_date", "theme", "summary", "events", "device_strategies"]
  };

  try {
    const data = await invokeKimiText({
      systemPrompt: [
        "你是一名中文周计划规划助手。",
        `当前查看周起始日期（周一）是：${startDate}。`,
        "输出必须是 JSON，不要输出解释。",
        "请返回完整周计划，而不是片段。",
        "events 中每条都要包含：date(YYYY-MM-DD)、day_index(0-6)、title、time(HH:MM)、type、icon。",
        "device_strategies 至少包含 phone/watch/pc 三项。",
        "automations 仅保留 1-4 条最有价值的自动化动作。"
      ].join("\n"),
      prompt: String(payload.input || "").trim(),
      responseJsonSchema: schema,
      model: payload.model,
      temperature: payload.temperature
    });

    return normalizeWeekPlan(data, startDate, payload.existingPlan);
  } catch (_error) {
    return buildWeekFallbackPlan(payload.input, startDate, payload.existingPlan);
  }
}

function normalizeMonthPlan(raw, monthStartDate, existingPlan) {
  const data = parseJsonLoose(raw);
  const base = isPlainObject(data) ? data : {};

  const strategies = isPlainObject(base.strategies) ? base.strategies : {};
  const key_milestones = Array.isArray(base.key_milestones)
    ? base.key_milestones
        .map((m) => (isPlainObject(m) ? m : null))
        .filter(Boolean)
        .map((m) => ({
          title: typeof m.title === "string" ? m.title.slice(0, 200) : "里程碑",
          type: typeof m.type === "string" ? m.type : "milestone",
          deadline: normalizeDateString(m.deadline, monthStartDate)
        }))
    : [];

  const weeks_breakdown = Array.isArray(base.weeks_breakdown)
    ? base.weeks_breakdown
        .map((w) => (isPlainObject(w) ? w : null))
        .filter(Boolean)
        .map((w, idx) => ({
          week_label: typeof w.week_label === "string" ? w.week_label.slice(0, 40) : `第 ${idx + 1} 周`,
          focus: typeof w.focus === "string" ? w.focus.slice(0, 120) : "",
          key_events: Array.isArray(w.key_events)
            ? w.key_events.filter((e) => typeof e === "string" && e.trim()).map((e) => e.slice(0, 80)).slice(0, 8)
            : []
        }))
    : [];

  const statsRaw = isPlainObject(base.stats) ? base.stats : {};
  const focusHours = Number(statsRaw.focus_hours);
  const milestonesCount = Number(statsRaw.milestones_count);

  return {
    ...base,
    plan_start_date: normalizeDateString(base.plan_start_date, monthStartDate),
    theme: typeof base.theme === "string" ? base.theme.slice(0, 120) : (existingPlan?.theme || ""),
    summary: typeof base.summary === "string" ? base.summary.slice(0, 2000) : (existingPlan?.summary || ""),
    strategies,
    key_milestones,
    weeks_breakdown,
    stats: {
      focus_hours: Number.isFinite(focusHours) ? focusHours : 0,
      milestones_count: Number.isFinite(milestonesCount) ? milestonesCount : key_milestones.length
    }
  };
}

function buildMonthFallbackPlan(input, monthStartDate, existingPlan) {
  return {
    is_demo: true,
    plan_start_date: monthStartDate,
    theme: existingPlan?.theme || "演示月计划",
    summary: "AI 服务暂时不可用，已生成演示规划（不影响保存与后续编辑）。",
    strategies: {
      focus: "先完成最关键的一项交付，其余保持低摩擦推进。",
      rhythm: "每周保留 2 个深度专注块，周末做一次复盘。"
    },
    key_milestones: [
      { title: "确认本月目标与范围", type: "milestone", deadline: addDaysYmd(monthStartDate, 2) }
    ],
    weeks_breakdown: [
      { week_label: "第 1 周", focus: "打底与拆解", key_events: ["明确目标", "列出关键交付"] },
      { week_label: "第 2 周", focus: "集中推进", key_events: ["深度工作块", "阶段验收"] },
      { week_label: "第 3 周", focus: "收口与修正", key_events: ["补齐短板", "预演输出"] },
      { week_label: "第 4 周", focus: "发布与复盘", key_events: ["交付", "复盘"] }
    ],
    stats: { focus_hours: 32, milestones_count: 1 },
    original_input: String(input || "").slice(0, 800)
  };
}

async function generateMonthPlan(payload) {
  const startDate = normalizeDateString(payload.startDate, payload.currentDate);

  const schema = {
    type: "object",
    properties: {
      plan_start_date: { type: "string" },
      theme: { type: "string" },
      summary: { type: "string" },
      strategies: { type: "object" },
      key_milestones: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            type: { type: "string" },
            deadline: { type: "string" }
          },
          required: ["title", "type", "deadline"]
        }
      },
      weeks_breakdown: {
        type: "array",
        items: {
          type: "object",
          properties: {
            week_label: { type: "string" },
            focus: { type: "string" },
            key_events: { type: "array", items: { type: "string" } }
          },
          required: ["week_label", "focus"]
        }
      },
      stats: { type: "object" }
    },
    required: ["plan_start_date", "theme", "summary", "weeks_breakdown"]
  };

  try {
    const data = await invokeKimiText({
      systemPrompt: [
        "你是一名中文月度目标拆解与节奏规划助手。",
        `当前规划月份起始日期（YYYY-MM-DD）是：${startDate}。`,
        "输出必须是 JSON，不要输出解释。",
        "weeks_breakdown 需要给出 4-6 周的节奏，每周包含 week_label、focus、key_events(0-6条)。",
        "key_milestones 给出 1-6 个关键里程碑，包含 title/type/deadline(YYYY-MM-DD)。",
        "stats 至少包含 focus_hours、milestones_count。",
      ].join("\n"),
      prompt: String(payload.input || "").trim(),
      responseJsonSchema: schema,
      model: payload.model,
      temperature: payload.temperature
    });

    return normalizeMonthPlan(data, startDate, payload.existingPlan);
  } catch (_error) {
    return buildMonthFallbackPlan(payload.input, startDate, payload.existingPlan);
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
      try {
        const data = await analyzeIntentWithKimi({
          input: payload.input,
          date: payload.date,
          existingPlan: payload.existingPlan
        });
        return res.json(data);
      } catch (error) {
        const message = error?.message || String(error);
        if (message.includes("KIMI_API_KEY") || message.includes("MOONSHOT_API_KEY") || message.includes("未配置")) {
          return res.json({
            steps: [{ key: "fallback", text: "AI 服务未配置，已使用基础兜底分析", icon: "🛡️" }],
            resolved_date: payload.date || toYmd(new Date()),
            timeline: [
              { time: "09:00", date: payload.date || toYmd(new Date()), title: "开始处理", description: String(payload.input || "").slice(0, 40) }
            ],
            devices: {
              phone: { name: "手机", strategies: [] },
              watch: { name: "手表", strategies: [] },
              glasses: { name: "眼镜", strategies: [] },
              car: { name: "汽车", strategies: [] },
              home: { name: "家居", strategies: [] },
              pc: { name: "工作站", strategies: [] }
            },
            automations: [],
            parsed: { times: [], intents: [String(payload.input || "").slice(0, 60)], locations: [] }
          });
        }
        throw error;
      }
    }

    if (name === "parseVoiceTask" || name === "parseTaskInput") {
      if (!payload.input || !String(payload.input).trim()) {
        return res.status(400).json({ error: "INVALID_INPUT", message: "缺少输入内容" });
      }

      try {
        const data = await parseTaskInput({
          input: String(payload.input).trim(),
          date: payload.date || toYmd(new Date())
        });
        return res.json(data);
      } catch (error) {
        const message = error?.message || String(error);
        if (message.includes("KIMI_API_KEY") || message.includes("MOONSHOT_API_KEY") || message.includes("未配置")) {
          return res.status(503).json({ error: "AI_SERVICE_NOT_CONFIGURED", message: "AI 服务尚未配置" });
        }
        return res.status(502).json({ error: "AI_SERVICE_ERROR", message: `AI 解析失败：${message}` });
      }
    }

    if (name === "callAI") {
      try {
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
      } catch (error) {
        const message = error?.message || String(error);
        if (message.includes("KIMI_API_KEY") || message.includes("MOONSHOT_API_KEY") || message.includes("未配置")) {
          return res.status(503).json({
            error: "AI_SERVICE_NOT_CONFIGURED",
            message: "AI 服务尚未配置（缺少 KIMI_API_KEY / MOONSHOT_API_KEY），请联系管理员配置后重试。"
          });
        }
        return res.status(502).json({
          error: "AI_SERVICE_ERROR",
          message: `AI 服务调用失败：${message}`
        });
      }
    }

    if (name === "kimiMemoryInsight") {
      const schema = {
        type: "object",
        properties: {
          insight: { type: "string", description: "1-2句话的记忆洞察，自然亲切、具体有针对性" }
        },
        required: ["insight"]
      };

      const data = await invokeKimiText({
        prompt: payload.prompt,
        systemPrompt: "你是一个中文记忆洞察助手。请基于用户提供的约定内容和行为数据，生成一条自然、有针对性的简短洞察。必须直接返回 JSON 对象，不要输出 markdown、代码块或任何解释文字。",
        responseJsonSchema: schema,
        temperature: 0.5
      });

      return res.json(data);
    }

    if (name === "getVapidPublicKey") {
      return res.json({
        publicKey: env.VAPID_PUBLIC_KEY || null
      });
    }

    if (name === "sendTestPush") {
      const result = await sendTestPush(req.user.id);
      if (!result.ok) {
        return res.status(400).json({ error: result.error, message: result.error });
      }
      return res.json({ ok: true });
    }

    if (name === "generateDailyBriefing") {
      return res.json(await generateDailyBriefingForUser(req.user));
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

    if (name === "savePushSubscription") {
      const existingPreferences = await prisma.userPreference.findUnique({
        where: { userId: req.user.id }
      });

      const previousExtraFields = getPreferenceExtraFields(existingPreferences);
      const nextExtraFields = {
        ...previousExtraFields,
        push_subscription: payload.subscription || null,
        push_user_agent: payload.user_agent || previousExtraFields.push_user_agent || null,
        push_enabled: Boolean(payload.subscription)
      };

      const nextMetadata = {
        ...(isPlainObject(existingPreferences?.metadata) ? existingPreferences.metadata : {}),
        _extraFields: nextExtraFields
      };

      const preference = await prisma.userPreference.upsert({
        where: { userId: req.user.id },
        update: {
          pushNotifications: payload.subscription ? true : false,
          metadata: nextMetadata
        },
        create: {
          userId: req.user.id,
          locale: "zh-CN",
          timezone: "Asia/Shanghai",
          pushNotifications: payload.subscription ? true : false,
          metadata: nextMetadata
        }
      });

      return res.json({
        ok: true,
        subscribed: Boolean(payload.subscription),
        preference_id: preference.id
      });
    }

    if (name === "suggestGeofenceParams") {
      const preset = getGeofencePreset(payload.location_type);
      return res.json({
        radius: payload.radius || preset.radius,
        quiet_minutes: payload.quiet_minutes || preset.quiet_minutes,
        latitude: typeof payload.latitude === "number" ? payload.latitude : undefined,
        longitude: typeof payload.longitude === "number" ? payload.longitude : undefined,
        resolved_address: payload.address || payload.name || "",
        source: "standalone-heuristic"
      });
    }

    if (name === "geofenceTrigger") {
      const tasks = await prisma.task.findMany({
        where: {
          userId: req.user.id,
          deletedAt: null
        }
      });

      const reminders = tasks
        .map((task) => {
          const locationReminder = getTaskLocationReminder(task);
          if (!locationReminder?.enabled) return null;
          if (typeof locationReminder.latitude !== "number" || typeof locationReminder.longitude !== "number") return null;

          const distance = haversineMeters(
            { latitude: payload.latitude, longitude: payload.longitude },
            { latitude: locationReminder.latitude, longitude: locationReminder.longitude }
          );

          const radius = Number(locationReminder.radius || 200);
          if (distance > radius) return null;

          return {
            task_id: task.id,
            title: task.title,
            distance: Math.round(distance),
            location_name: locationReminder.location_name || "目标地点",
            trigger_on: locationReminder.trigger_on || "enter"
          };
        })
        .filter(Boolean);

      return res.json({ reminders });
    }

    if (name === "nearbyTaskMatcher") {
      const tasks = await prisma.task.findMany({
        where: {
          userId: req.user.id,
          deletedAt: null
        }
      });

      const matches = tasks
        .map((task) => {
          const locationReminder = getTaskLocationReminder(task);
          if (!locationReminder?.enabled) return null;
          if (typeof locationReminder.latitude !== "number" || typeof locationReminder.longitude !== "number") return null;

          const distance = haversineMeters(
            { latitude: payload.latitude, longitude: payload.longitude },
            { latitude: locationReminder.latitude, longitude: locationReminder.longitude }
          );

          const radius = Number(locationReminder.radius || 200);
          if (distance > Math.max(radius, 400)) return null;

          return {
            task_id: task.id,
            title: task.title,
            distance: Math.round(distance),
            location_name: locationReminder.location_name || "附近地点",
            priority: task.priority
          };
        })
        .filter(Boolean)
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 5);

      return res.json({
        matched: matches.length > 0,
        matches,
        card: matches[0] || null
      });
    }

    if (name === "sentinelGeofenceTrigger") {
      const locations = await prisma.savedLocation.findMany({
        where: {
          userId: req.user.id,
          isActive: true
        }
      });

      const tasks = await prisma.task.findMany({
        where: {
          userId: req.user.id,
          deletedAt: null
        }
      });

      const results = [];

      for (const location of locations) {
        const distance = haversineMeters(
          { latitude: payload.latitude, longitude: payload.longitude },
          { latitude: location.latitude, longitude: location.longitude }
        );

        if (distance > location.radius) continue;

        const linkedTask = tasks.find((task) => {
          const locationReminder = getTaskLocationReminder(task);
          return locationReminder?.enabled && locationReminder.location_name === location.name;
        });

        if (!linkedTask) continue;

        results.push({
          event: "enter",
          level: "standard",
          location_name: location.name,
          task_id: linkedTask.id,
          task_title: linkedTask.title,
          context_summary: `${linkedTask.title} 已进入 ${location.name} 附近可提醒范围`,
          distance: Math.round(distance)
        });
      }

      return res.json({ results });
    }

    if (name === "getSentinelGuard") {
      const coords = (typeof payload.latitude === "number" && typeof payload.longitude === "number")
        ? { latitude: payload.latitude, longitude: payload.longitude }
        : null;

      // ========== 1) 地理感知 ==========
      const locations = await prisma.savedLocation.findMany({
        where: { userId: req.user.id, isActive: true }
      });

      let geoContext = null;
      const now = new Date();
      const todayStart = startOfLocalDay(now);
      const todayEnd = endOfLocalDay(now);

      let hitLocation = null;
      let hitDistance = null;
      let hitEvent = "enter";

      if (coords && locations.length > 0) {
        for (const loc of locations) {
          const dist = haversineMeters(coords, { latitude: loc.latitude, longitude: loc.longitude });
          if (dist <= (loc.radius || 200) + 100) {
            if (!hitLocation || dist < hitDistance) {
              hitLocation = loc;
              hitDistance = dist;
              hitEvent = "enter";
            }
          }
        }
      }

      // 降级：使用最近进入/离开的地点
      if (!hitLocation && locations.length > 0) {
        const recent = locations
          .filter((l) => l.lastEnteredAt || l.lastExitedAt)
          .sort((a, b) => {
            const ta = new Date(a.lastEnteredAt || a.lastExitedAt || 0).getTime();
            const tb = new Date(b.lastEnteredAt || b.lastExitedAt || 0).getTime();
            return tb - ta;
          })[0];
        if (recent) {
          const enterT = recent.lastEnteredAt ? new Date(recent.lastEnteredAt).getTime() : 0;
          const exitT = recent.lastExitedAt ? new Date(recent.lastExitedAt).getTime() : 0;
          hitLocation = recent;
          hitEvent = enterT >= exitT ? "enter" : "exit";
          const lastTime = Math.max(enterT, exitT);
          if (now.getTime() - lastTime < 2 * 60 * 60 * 1000) {
            hitDistance = recent.radius || 200;
          } else {
            hitLocation = null;
          }
        }
      }

      if (hitLocation) {
        const allActive = await prisma.task.findMany({
          where: {
            userId: req.user.id,
            deletedAt: null,
            status: { in: ["TODO", "IN_PROGRESS"] }
          },
          orderBy: { priority: "desc" },
          take: 30
        });

        const CATEGORY_MAP = {
          office: ["work"], home: ["personal", "family", "health"],
          gym: ["health"], school: ["study"], shopping: ["shopping"],
          hospital: ["health"], restaurant: ["personal"]
        };
        const related = CATEGORY_MAP[hitLocation.locationType] || [];

        const parentIdsGeo = [...new Set(allActive.map((t) => t.parentTaskId).filter(Boolean))];
        const aliveParentsGeo = parentIdsGeo.length > 0
          ? await prisma.task.findMany({ where: { id: { in: parentIdsGeo } } })
          : [];
        const aliveParentIdSetGeo = new Set(
          aliveParentsGeo
            .filter((p) => !p.deletedAt && p.status !== "DONE" && p.status !== "ARCHIVED")
            .map((p) => p.id)
        );
        const isParentClosedGeo = (t) => t.parentTaskId && !aliveParentIdSetGeo.has(t.parentTaskId);

        const relevantTasks = allActive
          .filter((t) => !isParentClosedGeo(t))
          .map((t) => {
            let score = 0;
            if (t.reminderTime) {
              const rt = new Date(t.reminderTime);
              if (rt >= todayStart && rt <= todayEnd) score += 40;
              if (rt < now) score += 25;
            }
            if (related.includes(t.category)) score += 20;
            if (t.priority === "urgent") score += 30;
            else if (t.priority === "high") score += 20;
            const lr = getTaskLocationReminder(t);
            if (lr?.enabled && typeof lr.latitude === "number") {
              const d = haversineMeters(
                { latitude: hitLocation.latitude, longitude: hitLocation.longitude },
                { latitude: lr.latitude, longitude: lr.longitude }
              );
              if (d < (hitLocation.radius || 300) + 500) score += 35;
            }
            return { task: t, score };
          })
          .filter((x) => x.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 3)
          .map((x) => ({
            id: x.task.id,
            title: x.task.title,
            time: x.task.reminderTime,
            priority: x.task.priority,
            overdue: x.task.reminderTime ? new Date(x.task.reminderTime) < now : false
          }));

        if (relevantTasks.length > 0) {
          geoContext = {
            location_id: hitLocation.id,
            location_name: hitLocation.name,
            location_type: hitLocation.locationType,
            icon: hitLocation.icon || "📍",
            event: hitEvent,
            distance: Math.round(hitDistance || hitLocation.radius || 200),
            tasks: relevantTasks
          };
        }
      }

      // ========== 2) 遗忘拯救 ==========
      const allTasks = await prisma.task.findMany({
        where: {
          userId: req.user.id,
          deletedAt: null,
          status: { in: ["TODO", "IN_PROGRESS"] }
        },
        orderBy: { createdAt: "desc" },
        take: 80
      });

      const parentIds = [...new Set(allTasks.map((t) => t.parentTaskId).filter(Boolean))];
      const aliveParents = parentIds.length > 0
        ? await prisma.task.findMany({ where: { id: { in: parentIds } } })
        : [];
      const aliveParentIdSet = new Set(
        aliveParents
          .filter((p) => !p.deletedAt && p.status !== "DONE" && p.status !== "ARCHIVED")
          .map((p) => p.id)
      );
      const isParentClosed = (t) => t.parentTaskId && !aliveParentIdSet.has(t.parentTaskId);

      const silentTasks = allTasks
        .filter((t) => !isParentClosed(t))
        .map((t) => {
          const refDate = t.reminderTime || t.createdAt;
          const days = daysBetween(refDate);
          return { task: t, days, forgetRate: getForgetRate(days) };
        })
        .filter((x) => x.days >= 3 && x.forgetRate >= 60)
        .sort((a, b) => b.forgetRate - a.forgetRate)
        .slice(0, 3);

      const notes = await prisma.note.findMany({
        where: { userId: req.user.id, deletedAt: null },
        orderBy: { updatedAt: "desc" },
        take: 30
      });
      const silentNotes = notes
        .map((n) => {
          const refDate = n.updatedAt || n.createdAt;
          return { note: n, days: daysBetween(refDate) };
        })
        .filter((x) => x.days >= 14)
        .sort((a, b) => b.days - a.days)
        .slice(0, 2);

      const forgettingRescue = silentTasks.length > 0 ? {
        primary: {
          id: silentTasks[0].task.id,
          title: silentTasks[0].task.title,
          days: silentTasks[0].days,
          forget_rate: silentTasks[0].forgetRate,
          context: silentTasks[0].task.description
            || `${silentTasks[0].days}天前创建，至今未处理`,
          overdue_days: silentTasks[0].task.reminderTime
            ? Math.max(0, daysBetween(silentTasks[0].task.reminderTime))
            : 0
        },
        others: silentTasks.slice(1).map((x) => ({
          id: x.task.id, title: x.task.title, days: x.days, forget_rate: x.forgetRate
        })),
        silent_notes: silentNotes.map((x) => ({
          id: x.note.id,
          title: (x.note.plainText || x.note.content || "").slice(0, 30) || "未命名心签",
          days: x.days
        }))
      } : null;

      return res.json({
        success: true,
        geo_context: geoContext,
        forgetting_rescue: forgettingRescue,
        generated_at: new Date().toISOString()
      });
    }

    if (name === "getAssociationRecommendations") {
      const coords = (typeof payload.latitude === "number" && typeof payload.longitude === "number")
        ? { latitude: payload.latitude, longitude: payload.longitude }
        : null;

      const completedTasks = await prisma.task.findMany({
        where: {
          userId: req.user.id,
          deletedAt: null,
          status: "DONE"
        },
        orderBy: { completedAt: "desc" },
        take: 180
      });

      const completed = completedTasks.filter((t) => t.completedAt);

      // ========== 1) 序贯规则挖掘 ==========
      const asc = [...completed].sort(
        (a, b) => new Date(a.completedAt) - new Date(b.completedAt)
      );

      const WINDOW_MS = 24 * 60 * 60 * 1000;
      const pairCount = new Map();
      const aCount = new Map();

      for (let i = 0; i < asc.length; i++) {
        const a = asc[i];
        if (!a.category) continue;
        aCount.set(a.category, (aCount.get(a.category) || 0) + 1);
        const aT = new Date(a.completedAt).getTime();

        const seenBForThisA = new Set();
        for (let j = i + 1; j < asc.length; j++) {
          const b = asc[j];
          const bT = new Date(b.completedAt).getTime();
          if (bT - aT > WINDOW_MS) break;
          if (!b.category || b.category === a.category) continue;
          if (seenBForThisA.has(b.category)) continue;
          seenBForThisA.add(b.category);
          const key = `${a.category}|${b.category}`;
          pairCount.set(key, (pairCount.get(key) || 0) + 1);
        }
      }

      const allRules = [];
      for (const [key, support] of pairCount.entries()) {
        const [a, b] = key.split("|");
        const base = aCount.get(a) || 1;
        const confidence = support / base;
        if (support >= 2 && confidence >= 0.3) {
          allRules.push({
            from: a, to: b, support, confidence,
            from_label: CATEGORY_LABEL[a] || a,
            to_label: CATEGORY_LABEL[b] || b
          });
        }
      }
      allRules.sort((x, y) => (y.confidence - x.confidence) || (y.support - x.support));

      let sequentialRecommendation = null;
      const lastDone = asc[asc.length - 1];
      if (lastDone?.category) {
        const candidateRules = allRules
          .filter((r) => r.from === lastDone.category)
          .slice(0, 2);

        if (candidateRules.length > 0) {
          const pending = await prisma.task.findMany({
            where: {
              userId: req.user.id,
              deletedAt: null,
              status: { in: ["TODO", "IN_PROGRESS"] }
            },
            orderBy: { priority: "desc" },
            take: 40
          });

          const suggestions = candidateRules.map((rule) => {
            const matches = pending
              .filter((t) => t.category === rule.to)
              .slice(0, 2)
              .map((t) => ({ id: t.id, title: t.title, priority: t.priority }));
            return {
              from_label: rule.from_label,
              to_label: rule.to_label,
              confidence: Math.round(rule.confidence * 100),
              support: rule.support,
              tasks: matches
            };
          }).filter((s) => s.tasks.length > 0);

          if (suggestions.length > 0) {
            sequentialRecommendation = {
              trigger_task: {
                id: lastDone.id,
                title: lastDone.title,
                category_label: CATEGORY_LABEL[lastDone.category] || lastDone.category,
                completed_at: lastDone.completedAt
              },
              suggestions
            };
          }
        }
      }

      // ========== 2) 地点情境推荐 ==========
      let locationPattern = null;

      if (coords) {
        const locations = await prisma.savedLocation.findMany({
          where: { userId: req.user.id, isActive: true }
        });

        let nearLocation = null;
        let nearDist = null;
        for (const loc of locations) {
          if (typeof loc.latitude !== "number" || typeof loc.longitude !== "number") continue;
          const d = haversineMeters(coords, { latitude: loc.latitude, longitude: loc.longitude });
          const threshold = (loc.radius || 200) + 200;
          if (d <= threshold && (!nearLocation || d < nearDist)) {
            nearLocation = loc;
            nearDist = d;
          }
        }

        if (nearLocation) {
          const histTasks = completed.filter((t) => {
            const lr = getTaskLocationReminder(t);
            if (!lr?.enabled) return false;
            if (typeof lr.latitude !== "number" || typeof lr.longitude !== "number") return false;
            const d = haversineMeters(
              { latitude: nearLocation.latitude, longitude: nearLocation.longitude },
              { latitude: lr.latitude, longitude: lr.longitude }
            );
            return d <= (nearLocation.radius || 300) + 300;
          });

          const CATEGORY_MAP = {
            office: "work", home: "personal", gym: "health",
            school: "study", shopping: "shopping",
            hospital: "health", restaurant: "personal"
          };
          const fallbackCat = CATEGORY_MAP[nearLocation.locationType];
          const sample = histTasks.length > 0
            ? histTasks
            : (fallbackCat ? completed.filter((t) => t.category === fallbackCat) : []);

          if (sample.length >= 2) {
            const catCount = new Map();
            const titleFreq = new Map();
            for (const t of sample) {
              if (t.category) catCount.set(t.category, (catCount.get(t.category) || 0) + 1);
              if (t.title) titleFreq.set(t.title, (titleFreq.get(t.title) || 0) + 1);
            }
            const topCategories = [...catCount.entries()]
              .sort((a, b) => b[1] - a[1])
              .slice(0, 2)
              .map(([cat, cnt]) => ({
                category: cat,
                label: CATEGORY_LABEL[cat] || cat,
                count: cnt
              }));
            const topTitles = [...titleFreq.entries()]
              .sort((a, b) => b[1] - a[1])
              .slice(0, 3)
              .map(([title, cnt]) => ({ title, count: cnt }));

            const pending = await prisma.task.findMany({
              where: {
                userId: req.user.id,
                deletedAt: null,
                status: { in: ["TODO", "IN_PROGRESS"] }
              },
              orderBy: { priority: "desc" },
              take: 30
            });

            const topCatSet = new Set(topCategories.map((c) => c.category));
            const suggestedTasks = pending
              .filter((t) => topCatSet.has(t.category))
              .slice(0, 3)
              .map((t) => ({
                id: t.id,
                title: t.title,
                category_label: CATEGORY_LABEL[t.category] || t.category,
                priority: t.priority
              }));

            locationPattern = {
              location_id: nearLocation.id,
              location_name: nearLocation.name,
              icon: nearLocation.icon || "📍",
              distance: Math.round(nearDist),
              history_sample_size: sample.length,
              top_categories: topCategories,
              top_titles: topTitles,
              suggested_tasks: suggestedTasks
            };
          }
        }
      }

      return res.json({
        success: true,
        sequential_recommendation: sequentialRecommendation,
        location_pattern: locationPattern,
        rules_count: allRules.length,
        generated_at: new Date().toISOString()
      });
    }

    if (name === "fetchExternalFeeds") {
      const feed = await prisma.externalFeed.findFirst({
        where: {
          id: payload.feed_id,
          userId: req.user.id
        }
      });

      if (!feed) {
        return res.status(404).json({
          error: "NOT_FOUND",
          message: "外部信息源不存在"
        });
      }

      if (!feed.url) {
        return res.status(400).json({
          error: "INVALID_FEED",
          message: "该信息源缺少 URL"
        });
      }

      const response = await fetch(feed.url, {
        headers: {
          "User-Agent": "Mozilla/5.0 SoulSentry/1.0"
        },
        signal: AbortSignal.timeout(10000)
      });
      if (!response.ok) {
        return res.status(502).json({
          error: "FETCH_FAILED",
          message: `拉取失败：${response.status}`
        });
      }

      const xmlText = await response.text();
      const items = parseRssItems(xmlText);
      const now = new Date();

      let archived = 0;
      if (feed.autoArchiveToHeartsign) {
        for (const item of items.slice(0, 10)) {
          const duplicate = await prisma.note.findFirst({
            where: {
              userId: req.user.id,
              sourceType: "external_feed",
              plainText: `${item.title} ${item.summary}`.slice(0, 1000)
            }
          });

          if (duplicate) continue;

          await prisma.note.create({
            data: {
              userId: req.user.id,
              title: item.title.slice(0, 200),
              content: `**${item.title}**\n\n${item.summary}\n\n来源：${feed.name}\n链接：${item.link}`,
              plainText: `${item.title} ${item.summary}`.slice(0, 1000),
              sourceType: "external_feed",
              aiStatus: "pending",
              tags: ["外部信息", feed.name]
            }
          });
          archived += 1;
        }
      }

      await prisma.externalFeed.update({
        where: { id: feed.id },
        data: {
          lastFetchedAt: now,
          lastItemCount: items.length,
          metadata: {
            ...(isPlainObject(feed.metadata) ? feed.metadata : {}),
            latest_items: items.slice(0, 10)
          }
        }
      });

      return res.json({
        fetched: items.length,
        archived,
        feed_id: feed.id
      });
    }

    if (name === "getExternalVision") {
      const feeds = await prisma.externalFeed.findMany({
        where: {
          userId: req.user.id,
          isActive: true
        },
        orderBy: [
          { lastFetchedAt: "desc" },
          { createdAt: "desc" }
        ],
        take: 6
      });

      const cards = [];

      for (const feed of feeds) {
        const latestItems = Array.isArray(feed.metadata?.latest_items) ? feed.metadata.latest_items : [];

        if (latestItems.length > 0) {
          cards.push(...buildExternalVisionCards(feed, latestItems));
          continue;
        }

        cards.push({
          id: feed.id,
          type: feed.feedType === "rss" ? "subscription" : "expansion",
          title: feed.name,
          summary: feed.description || "已接入外部信息源，等待首次拉取内容。",
          source: feed.name,
          url: feed.url || "",
          relevance: "可在“外部信息接入”中手动拉取最新内容"
        });
      }

      return res.json({
        cards: cards.slice(0, 12)
      });
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
          code_url: existing.codeUrl,
          order_no: existing.orderNo
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

      return res.json({ code_url: codeUrl, order_no: outTradeNo });
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
        return res.json({ paid: true, order_no: order.orderNo });
      }

      const cfg = await getWechatMerchantConfig();
      if (!cfg) {
        return res.json({ paid: false, order_no: order.orderNo });
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
          return res.json({ paid: true, order_no: order.orderNo });
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

      return res.json({ paid: false, order_no: order.orderNo });
    }

    if (name === "executeAutomation") {
      const result = await executeAutomation({
        executionId: payload.execution_id,
        phase: payload.phase,
        userId: req.user.id,
        prisma
      });
      return res.json(result);
    }

    if (name === "renderPpt") {
      const pptData = payload.data || payload;
      if (!pptData || !Array.isArray(pptData.slides) || pptData.slides.length === 0) {
        return res.status(400).json({ error: "INVALID_INPUT", message: "缺少有效的 slides 数据" });
      }
      const { fileName, fileUrl } = savePptHtml({
        data: pptData,
        fileBaseName: payload.file_base_name || pptData.title
      });
      return res.json({ file_url: fileUrl, file_name: fileName });
    }

    if (name === "analyzeHeartSign") {
      const noteId = payload.note_id;
      const noteData = payload.note_data || {};
      if (!noteId) {
        return res.status(400).json({ error: "INVALID_INPUT", message: "缺少 note_id" });
      }

      let note = await prisma.note.findFirst({
        where: { id: noteId, userId: req.user.id }
      });
      if (!note && (noteData.plain_text || noteData.content)) {
        note = { id: noteId, ...noteData, userId: req.user.id };
      }
      if (!note) {
        return res.status(404).json({ error: "NOT_FOUND", message: "心签不存在" });
      }

      const existingAi = note.metadata?.ai_analysis;
      if (note.aiStatus === "completed" && existingAi?.analyzed_at) {
        return res.json({ ok: true, skipped: true, ai_analysis: existingAi });
      }
      if (note.aiStatus === "processing") {
        return res.json({ ok: true, skipped: true, message: "已有分析任务在进行中" });
      }

      const materialText = String(note.plainText || note.content || "")
        .replace(/<[^>]+>/g, " ")
        .slice(0, 8000);

      // 危机兜底：不进入 AI 管道，直接写死安全话术
      if (detectCrisis(materialText)) {
        const crisis = buildHeartSignFallback({ content: note.content, plainText: note.plainText });
        const currentMetadata = isPlainObject(note.metadata) ? note.metadata : {};
        await prisma.note.update({
          where: { id: noteId },
          data: {
            aiStatus: "completed",
            sourceType: "emotion",
            metadata: { ...currentMetadata, ai_analysis: crisis, is_crisis: true }
          }
        });
        return res.json({ ok: true, ai_analysis: crisis, is_crisis: true });
      }

      // 保险柜兜底：敏感信息不进入 AI 管道，标记为 vault
      if (detectVault(materialText)) {
        const vaultFallback = buildHeartSignFallback({ content: note.content, plainText: note.plainText });
        const currentMetadata = isPlainObject(note.metadata) ? note.metadata : {};
        await prisma.note.update({
          where: { id: noteId },
          data: {
            aiStatus: "completed",
            sourceType: "vault",
            metadata: { ...currentMetadata, ai_analysis: vaultFallback, is_vault: true }
          }
        });
        return res.json({ ok: true, ai_analysis: vaultFallback, is_vault: true, vault_label: vaultFallback.vault_label });
      }

      // 原子性地把 aiStatus 从非 processing 改为 processing，防止并发重复分析
      const claimed = await prisma.note.updateMany({
        where: {
          id: noteId,
          userId: req.user.id,
          OR: [
            { aiStatus: null },
            { aiStatus: { not: "processing" } }
          ]
        },
        data: { aiStatus: "processing" }
      });
      if (claimed.count === 0) {
        return res.json({ ok: true, skipped: true, message: "已有分析任务在进行中" });
      }

      const density = note.metadata?.response_density || "light";

      const schema = {
        type: "object",
        properties: {
          title: { type: "string", description: "8-20 字的简短标语，提炼心情或核心状态，用作笔记标题；若输入≤50字可返回空字符串" },
          summary: { type: "string", description: "1-2 句话精炼摘要" },
          key_points: { type: "array", items: { type: "string" }, description: "3-5 个核心要点" },
          tags: { type: "array", items: { type: "string" }, description: "3-6 个智能标签，不含 #" },
          category: { type: "string", description: "分类：情绪/灵感/资料/备忘/分享" },
          is_emotional: { type: "boolean", description: "是否值得温柔回应" },
          response_persona: { type: "string", description: "回应身份：comforter/mentor/clerk/friend/poet" },
          response_title: { type: "string", description: "回应标题" },
          emotional_response: { type: "string", description: "简短回应，情绪签80字内、资料签60字内、备忘签20字内、灵感签50字内、分享签40字内" },
          response_tag: { type: "string", description: "回应标签：感性回应/理性补充/收录" }
        },
        required: ["title", "summary", "tags", "category"]
      };

      const systemPrompt = `你是用户的"另一个自己"，更温柔、更克制、更懂用户。
把每条心签分成五类之一：情绪/灵感/资料/备忘/分享。
回应规则：
1. 先接住再托举。情绪签先镜像感受，再给一句轻托举；资料签给摘要+下一步；备忘签只确认"已收好"；灵感签轻推落地；分享签鼓励传播。
2. 简短。情绪≤80字，资料≤60字，备忘≤20字，灵感≤50字，分享≤40字。
3. 浓度：当前为"${density}"，mute 时只输出"已收好。"，light 时一句，full 时最多两句。
4. 危机词：若用户表达自杀/自伤意图，只返回固定话"谢谢你愿意说出来。你现在可能很难受，可以拨打心理援助热线 400-161-9995。我一直都在。"
5. 必须返回 response_tag：情绪/灵感/分享返回"感性回应"，资料返回"理性补充"，备忘返回"收录"。
6. 若用户输入≤50字，title 返回空字符串。
严格按 JSON schema 返回：\n${JSON.stringify(schema)}`;

      try {
        // Kimi 只给 5 秒；超时或失败立即走本地规则兜底
        const kimiPromise = invokeKimiText({
          prompt: `请分析以下心签内容（当前回应浓度：${density}）：\n\n${materialText}`,
          systemPrompt,
          responseJsonSchema: schema,
          temperature: 0.9
        });
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("TIMEOUT")), 5000)
        );

        let parsed;
        let usedFallback = false;
        try {
          parsed = await Promise.race([kimiPromise, timeoutPromise]);
        } catch (kimiErr) {
          console.error("[analyzeHeartSign] Kimi failed or timeout, use local fallback", kimiErr?.message || kimiErr);
          parsed = buildHeartSignFallback({ content: note.content, plainText: note.plainText, density });
          usedFallback = true;
        }

        const ai_analysis = {
          summary: parsed.summary || "",
          key_points: parsed.key_points || [],
          category: parsed.category || "其他",
          is_emotional: !!parsed.is_emotional,
          response_persona: parsed.is_emotional ? (parsed.response_persona || "friend") : "",
          response_title: parsed.is_emotional ? (parsed.response_title || "") : "",
          emotional_response: parsed.is_emotional ? (parsed.emotional_response || "") : "",
          response_tag: parsed.response_tag || (parsed.is_emotional ? "感性回应" : "收录"),
          analyzed_at: new Date().toISOString(),
          source: usedFallback ? "local_fallback" : "kimi",
          note_type: parsed.note_type || null
        };

        const mergedTags = Array.from(new Set([...(note.tags || []), ...(parsed.tags || [])])).slice(0, 12);
        const plainTextLen = String(note.plainText || note.content || "").trim().length;
        const title = plainTextLen <= 50
          ? ""
          : (parsed.title ? parsed.title.slice(0, 60) : (parsed.summary ? parsed.summary.slice(0, 60) : (note.title || "心签")));
        const sourceType = parsed.category && ["情绪", "灵感", "资料", "备忘", "分享"].includes(parsed.category)
          ? { 情绪: "emotion", 灵感: "inspiration", 资料: "material", 备忘: "memo", 分享: "share" }[parsed.category]
          : (parsed.note_type || note.sourceType);

        const currentMetadata = isPlainObject(note.metadata) ? note.metadata : {};
        const updatedNote = await prisma.note.update({
          where: { id: noteId },
          data: {
            title,
            tags: mergedTags,
            sourceType,
            aiStatus: "completed",
            metadata: {
              ...currentMetadata,
              ai_analysis
            }
          }
        });

        return res.json({
          ok: true,
          ai_analysis,
          tags: mergedTags,
          title: updatedNote.title,
          source_type: updatedNote.sourceType,
          used_fallback: usedFallback
        });
      } catch (error) {
        console.error("[analyzeHeartSign] unexpected error", error);
        await prisma.note.update({
          where: { id: noteId },
          data: { aiStatus: "failed" }
        });
        throw error;
      }
    }

    if (name === "followupHeartSign") {
      const { note_id: followNoteId, text, round = 1, density = "light" } = payload;
      if (!followNoteId || !text) {
        return res.status(400).json({ error: "INVALID_INPUT", message: "缺少 note_id 或 text" });
      }

      const followNote = await prisma.note.findFirst({
        where: { id: followNoteId, userId: req.user.id }
      });
      if (!followNote) {
        return res.status(404).json({ error: "NOT_FOUND", message: "心签不存在" });
      }

      // 保存用户继续消息
      await prisma.noteComment.create({
        data: {
          noteId: followNoteId,
          userId: req.user.id,
          content: String(text).slice(0, 4000)
        }
      });

      const noteType = followNote.sourceType || "emotion";
      const categoryMap = {
        emotion: "情绪",
        inspiration: "灵感",
        material: "资料",
        memo: "备忘",
        share: "分享"
      };
      const category = categoryMap[noteType] || "情绪";

      let replyText = "";
      let closing = false;
      let tag = "感性回应";

      if (category === "情绪") {
        if (Number(round) >= 3) {
          replyText = "今天的对话先说到这里，好吗？谢谢你愿意说这么多。我会一直在这儿，明天如果想继续，随时回来。";
          closing = true;
          tag = "感性回应";
        } else if (density === "mute") {
          replyText = "已收好。";
          tag = "收录";
        } else {
          const emotionalFollowups = {
            full: [
              "嗯，我在听。继续说，我跟着你。",
              "这些感受都值得被认真放着。那时候，你最希望发生什么？",
              "如果给现在的感受起一个名字，它叫什么？"
            ],
            light: [
              "嗯，我在听。你慢慢说。",
              "这些感受都值得被认真放着。",
              "如果愿意，可以再具体说说那个瞬间。"
            ]
          };
          const pool = emotionalFollowups[density] || emotionalFollowups.light;
          replyText = pool[Math.floor(Math.random() * pool.length)];
          tag = "感性回应";
        }
      } else if (category === "资料") {
        if (density === "mute") {
          replyText = "已收好。";
          tag = "收录";
        } else {
          replyText = density === "full"
            ? "往深想一步：这条内容和你正在做的事，连接点在哪里？要沉淀进知识库或转成约定，随时告诉我。"
            : "往深想一步：这条内容和你正在做的事，连接点在哪里？";
          tag = "理性补充";
        }
      } else if (category === "灵感") {
        if (density === "mute") {
          replyText = "已收好。";
          tag = "收录";
        } else {
          replyText = density === "full"
            ? "这个念头我收好了。它最想解决的是哪一个瞬间？想落地的话，我可以帮你转成约定。"
            : "这个念头我收好了。想落地的话，我可以帮你转成约定。";
          tag = "感性回应";
        }
      } else if (category === "备忘") {
        replyText = "嗯，这条也一并记在这张签里了。";
        tag = "收录";
      } else if (category === "分享") {
        replyText = density === "mute" ? "已收好。" : "好，分享的内容我都放进签卡里了。";
        tag = density === "mute" ? "收录" : "感性回应";
      } else {
        replyText = "我记下了。";
        tag = "感性回应";
      }

      const now = new Date().toISOString();
      const currentMeta = isPlainObject(followNote.metadata) ? followNote.metadata : {};
      const conversation = Array.isArray(currentMeta.conversation) ? currentMeta.conversation : [];
      const nextConversation = [...conversation, { role: "user", text, ts: now }, { role: "other", text: replyText, tag, ts: now }];

      await prisma.note.update({
        where: { id: followNoteId },
        data: {
          metadata: { ...currentMeta, conversation: nextConversation }
        }
      });

      return res.json({ ok: true, text: replyText, tag, closing, conversation: nextConversation });
    }

    if (name === "analyzeTasks") {
      const tasks = Array.isArray(payload.tasks) ? payload.tasks : [];
      const executions = Array.isArray(payload.executions) ? payload.executions : [];
      const subtaskMap = isPlainObject(payload.subtasks) ? payload.subtasks : {};
      console.log(`[analyzeTasks] received tasks=${tasks.length} executions=${executions.length}`);
      const result = {};

      // 限制并发，避免大量任务同时调用 Kimi 导致超时/限流
      const poolLimit = 2;
      const executing = [];
      const promises = [];

      for (const task of tasks) {
        if (!task?.id) continue;
        const promise = analyzeTask(task, executions, subtaskMap[task.id] || []).then(
          (analysis) => { result[task.id] = analysis; },
          (err) => {
            console.error(`[analyzeTasks] analyzeTask failed for task ${task.id}:`, err?.message || err);
            result[task.id] = {};
          }
        );
        promises.push(promise);
        if (tasks.length > poolLimit) {
          const wrapped = promise.then(() => {
            const idx = executing.indexOf(wrapped);
            if (idx !== -1) executing.splice(idx, 1);
          });
          executing.push(wrapped);
          if (executing.length >= poolLimit) {
            await Promise.race(executing);
          }
        }
      }
      await Promise.all(promises);
      return res.json(result);
    }

    if (name === "createStripeCheckout") {
      return res.status(501).json({
        error: "FUNCTION_NOT_IMPLEMENTED",
        message: "独立后端已预留 createStripeCheckout，但尚未完成迁移",
        input: payload
      });
    }

    return res.status(404).json({
      error: "FUNCTION_NOT_FOUND",
      message: `未找到函数 ${name}`
    });
  } catch (error) {
    if (error.code === "INSUFFICIENT_CREDITS") {
      return res.status(402).json({
        code: "INSUFFICIENT_CREDITS",
        required: error.required,
        balance: error.balance
      });
    }

    return res.status(error.status || 500).json({
      error: "FUNCTION_EXECUTION_FAILED",
      message: error.message || "函数执行失败"
    });
  }
});
