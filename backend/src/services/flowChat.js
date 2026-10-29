import { invokeKimiText } from "../lib/kimi.js";
import { chargeAICredits, usageCost } from "./aiCredits.js";
import { startStandaloneBrowserExecution } from "./autoAutomation.js";
import { respondToAgent } from "./browserAgent.js";
import { analyzeImage } from "./analyzeImage.js";
import { planCommitmentWithKimi, reexpandPlan, applyPlanAdjustments, requiredBudget, extractAdjustmentsFromText, resolvePlanAdjustments, rebuildPatternsFromChildren, buildFallbackPlan } from "./planCommitment.js";
import { buildPlanInsights, renderInsightsForPrompt } from "./planInsights.js";

// 心流对话：用户用聊天的方式告诉 SoulSentry 想记什么，
// AI 负责理解意图（立约定 / 记心签 / 存链接 / 网页办事 / 闲聊），
// 信息足够时输出 extracted 提案，由用户确认后客户端再落库。
// Kimi 不可用时走本地规则兜底，保证对话永远能继续。
// 「网页办事」走内嵌浏览器 Agent：goal 交给 Agent 即时执行，
// 过程与结果回落到对话里（执行单同时进守护记录）。

const CATEGORIES = ["work", "personal", "health", "study", "family", "shopping", "finance", "checkin", "other"];
const PRIORITIES = ["high", "medium", "low"];
const PRESSURE_WORDS = /必须|赶紧|马上做|再不|来不及了|惩罚|后果|你已经/;
const URL_RE = /https?:\/\/[^\s"'，。）)]+/i;

function chinaNow() {
  const cn = new Date(Date.now() + 8 * 3600 * 1000);
  return {
    date: cn.toISOString().slice(0, 10),
    dateTime: cn.toISOString().slice(0, 16).replace("T", " ")
  };
}

function trim(s, n) {
  const t = String(s || "").trim();
  return t.length > n ? t.slice(0, n) : t;
}

function sanitizeExtracted(raw) {
  if (!raw || typeof raw !== "object") return null;
  const type = raw.type;
  if (type === "task") {
    const title = trim(raw.title, 60);
    if (!title) return null;
    let dueAt = null;
    if (raw.due_at) {
      const d = new Date(raw.due_at);
      if (!isNaN(d.getTime())) dueAt = d.toISOString();
    }
    return {
      type: "task",
      title,
      description: trim(raw.description, 300) || null,
      category: CATEGORIES.includes(raw.category) ? raw.category : "personal",
      priority: PRIORITIES.includes(raw.priority) ? raw.priority : "medium",
      due_at: dueAt
    };
  }
  if (type === "heart") {
    const content = trim(raw.content, 500);
    if (!content) return null;
    const heartCategory = HEART_CATEGORIES.includes(raw.heart_category) ? raw.heart_category : null;
    return heartCategory ? { type: "heart", content, heart_category: heartCategory } : { type: "heart", content };
  }
  if (type === "link") {
    const text = trim(raw.text, 500);
    if (!text || !URL_RE.test(text)) return null;
    return { type: "link", text };
  }
  if (type === "plan") {
    // 智能约定规划：goal 必填；天数/时长可缺省（缺省时反问一个关键问题，由 prompt 约束）
    const req = raw.plan_request && typeof raw.plan_request === "object" ? raw.plan_request : {};
    const goal = trim(req.goal, 80);
    if (!goal) return null;
    const horizon = Number(req.horizon_days);
    const daily = Number(req.daily_minutes);
    return {
      type: "plan",
      plan_request: {
        goal,
        horizon_days: Number.isFinite(horizon) ? Math.min(30, Math.max(2, Math.round(horizon))) : null,
        daily_minutes: Number.isFinite(daily) ? Math.min(180, Math.max(15, Math.round(daily))) : null,
        preferences: trim(req.preferences, 200) || null
      }
    };
  }
  if (type === "collab") {
    // 协同约定：theme 必填；场景推断不出时 custom
    const title = trim(raw.title, 60);
    if (!title) return null;
    const scenario = ["couple", "friends", "colleagues", "custom"].includes(raw.scenario) ? raw.scenario : "custom";
    return { type: "collab", title, scenario, goal: trim(raw.goal, 120) || null };
  }
  return null;
}

// 本地兜底：Kimi 不可用时的规则理解

// 用户否定当前提案：收起提案，温柔引导 TA 说出要改什么
const REJECT_RE = /不对|不是这个?|错了|再聊聊|先不要|重来|重新说/;

// 类型变更（纠正分类）：心签↔约定。STRONG 信号足以独立成立，WEAK 需结合当前提案
const TO_TASK_STRONG = /(?:不对|错了|不是|不算|别当|不当)[，,、\s]*(?:这|那|它)?\s*是\s*(?:个|条)?\s*约定|(?:心签|心情|情绪|感悟)[^，。,.]{0,8}约定|(?:改成|变成|存成|当成|转为|换成|应该是|其实是|算是)\s*约定|(?:不是|不算|别当|不当)\s*(?:心签|心情|情绪|感悟)/;
const TO_TASK_WEAK = /(?:这|那|它)?\s*是\s*(?:个|条)?\s*约定/;
const TO_HEART_STRONG = /(?:不对|错了|不是|不算|别当|不当)[，,、\s]*(?:这|那|它)?\s*是\s*(?:个|条)?\s*(?:心签|心情|情绪|感悟)|约定[^，。,.]{0,8}(?:心签|心情|情绪|感悟)|(?:改成|变成|存成|当成|转为|换成|应该是|其实是|算是)\s*(?:心签|心情|情绪|感悟)|(?:不是|不算|别当|不当)\s*约定/;
const TO_HEART_WEAK = /(?:这|那|它)\s*是\s*(?:个|条)?\s*(?:心签|心情|情绪|感悟)/;

// 心签六类子类型（与 analyzeHeartSign 的 HEARTSIGN_TYPE_ZH 一致）
const HEART_CATEGORIES = ["emotion", "inspiration", "material", "memo", "share", "ledger"];
const HEART_CATEGORY_ZH = { emotion: "情绪", inspiration: "灵感", material: "资料", memo: "备忘", share: "分享", ledger: "账本" };
// 子类型纠正：「这是账本签」「改成灵感」「记成备忘」等
const HEART_SUB_SWITCH_RE = /(?:改成|变成|存成|当成|记成|记为|转为|换成|归为|归类为|应该是|其实是|算是|这是|那是|它是)\s*(?:一)?(账本|记账|备忘|灵感|情绪|心情|资料|知识|参考|分享)\s*签?/;
function detectHeartSubSwitch(text) {
  const m = String(text || "").match(HEART_SUB_SWITCH_RE);
  if (!m) return null;
  const w = m[1];
  if (/账本|记账/.test(w)) return "ledger";
  if (/备忘/.test(w)) return "memo";
  if (/灵感/.test(w)) return "inspiration";
  if (/情绪|心情/.test(w)) return "emotion";
  if (/资料|知识|参考/.test(w)) return "material";
  if (/分享/.test(w)) return "share";
  return null;
}

// 显式「立约定」指令：设为约定 / 立个约定 / 转成约定 等
const TASK_DIRECTIVE_RE = /(?:设为|立个?|定为|记为|存为|保存为|转成|变成)\s*约定/;
// 周期性提醒时刻：每天下午3点 / 每晚11点半 / 每天8:30
const DAILY_TIME_RE = /(?:每天|每日|每晚|每夜|天天)\s*(?:(上午|中午|下午|晚上|早上|清晨|凌晨)\s*)?(\d{1,2})(?:\s*[点:：]\s*(\d{1,2})?|\s*半)?/;
// 每周X（可选时刻，未给时刻时按惯例取 9:00）
const WEEKLY_DAY_RE = /每(?:个|一)?(?:周|星期|礼拜)([一二三四五六日天])(?![一二三四五六日天])/;
// 期限：一周内 / 3天内 / 两周内完成
const WITHIN_RE = /([一二两三四五六七八九十\d]+)\s*(?:个)?\s*(周|星期|礼拜|天|日|月)\s*(?:之?内|以?前|前)/;

const CN_NUM = { 一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
function parseCnAmount(raw) {
  const s = String(raw || "");
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  if (s === "十") return 10;
  let m = s.match(/^十([一二三四五六七八九])$/);
  if (m) return 10 + CN_NUM[m[1]];
  m = s.match(/^([一二两三四五六九])十([一二三四五六七八九])?$/);
  if (m) return CN_NUM[m[1]] * 10 + (m[2] ? CN_NUM[m[2]] : 0);
  return CN_NUM[s] ?? null;
}

// 「现在就去网页办事」识别（排除"以后再提醒"的约定类表述）
const LATER_REMIND_RE = /提醒我|记得|别忘了|以后再|到时(候)?再/;
const NOW_BROWSE_RE = /(?:帮我|给我|麻烦|请问|帮).{0,12}(?:查|搜|看|找|订|预约)|(?:查|搜)一下?(?:天气|资料|信息|价格|股价|机票|火车票|高铁|余票|快递|物流|酒店|路线|成绩|排名)|订(?:机票|火车票|高铁票|酒店|门票|外卖)|点外卖|天气怎么(?:样|的)|气温/;
const BROWSE_URL_INTENT_RE = /打开|帮我|查|搜|填|预约|订|报名|提交|看看|找|下载|登录/;

// 智能约定规划意图（兜底路径用：Kimi 不在线但用户想要一份计划）
const PLAN_INTENT_RE = /(?:帮我|给我|想|要|打算|准备|来)?\s*(?:智能)?(?:规划|安排|制定?)\s*(?:一个|一份|个|份)?[^。,.，]{0,24}(?:计划|方案|安排)|(?:一周|两周|三周|\d+\s*(?:天|周|个月|月))[^。,.，]{0,16}(?:计划|规划|安排|打卡|挑战|坚持)/;
function extractPlanGoal(text) {
  const cleaned = String(text || "")
    .replace(/^(?:帮我|给我|我想|我要|我想要|我想想|请|麻烦|想要|打算|准备|来)\s*/, "")
    .replace(/(?:帮我)?\s*(?:智能)?(?:规划|安排|制定?)/, "")
    .replace(/^(?:一个|一份|个|份)\s*/, "")
    .replace(/[。！!？?~～\s]+$/, "")
    .trim();
  return (cleaned || String(text || "").trim()).slice(0, 40);
}

function fallbackExtract(lastUserText, lastExtracted, recentUserTexts = []) {
  const t = String(lastUserText || "").trim();
  if (!t) return null;

  // —— 类型变更：用户纠正分类（"不对，这是约定"/"不是心签"/"改成心签"），优先于普通否定 ——
  if (lastExtracted?.type === "heart" && (TO_TASK_STRONG.test(t) || TO_TASK_WEAK.test(t))) {
    const content = String(lastExtracted.content || "").trim();
    const title = content.replace(/[。！!？?~～\s]+$/, "").slice(0, 60) || "新约定";
    return { type: "task", title, description: content || title, category: "personal", priority: "medium", due_at: null };
  }
  if (lastExtracted?.type === "task" && (TO_HEART_STRONG.test(t) || TO_HEART_WEAK.test(t))) {
    const content = String(lastExtracted.description || lastExtracted.title || "").trim();
    if (content) return { type: "heart", content: content.slice(0, 500) };
  }
  // 提案刚被收起（上一轮点了"不对，再聊聊"）：纠正信号仍允许从对话历史里捞回原内容改类型
  if (!lastExtracted && (TO_TASK_STRONG.test(t) || TO_TASK_WEAK.test(t))) {
    for (const prev of recentUserTexts) {
      const cand = String(prev || "").trim();
      if (!cand || cand === t) continue;
      if (REJECT_RE.test(cand) || TO_TASK_STRONG.test(cand) || TO_HEART_STRONG.test(cand)) continue;
      const title = cand.replace(/[。！!？?~～\s]+$/, "").slice(0, 60);
      return { type: "task", title, description: cand.slice(0, 300), category: "personal", priority: "medium", due_at: null };
    }
  }
  if (!lastExtracted && (TO_HEART_STRONG.test(t) || TO_HEART_WEAK.test(t))) {
    for (const prev of recentUserTexts) {
      const cand = String(prev || "").trim();
      if (!cand || cand === t) continue;
      if (REJECT_RE.test(cand) || TO_TASK_STRONG.test(cand) || TO_HEART_STRONG.test(cand)) continue;
      return { type: "heart", content: cand.slice(0, 500) };
    }
  }
  // —— 心签子类型纠正：「这是账本签」「改成灵感」→ 换分类，回应口吻跟着换 ——
  const subSwitch = detectHeartSubSwitch(t);
  if (subSwitch && lastExtracted?.type === "heart") {
    return { type: "heart", content: lastExtracted.content, heart_category: subSwitch };
  }
  if (subSwitch && !lastExtracted) {
    for (const prev of recentUserTexts) {
      const cand = String(prev || "").trim();
      if (!cand || cand === t) continue;
      if (REJECT_RE.test(cand) || TO_TASK_STRONG.test(cand) || TO_HEART_STRONG.test(cand)) continue;
      return { type: "heart", content: cand.slice(0, 500), heart_category: subSwitch };
    }
  }

  // 否定提案：返回 null 收起卡片，由 fallbackReply 引导用户说清要改什么
  if (REJECT_RE.test(t) && lastExtracted) return "__reject__";

  // —— 协同约定：「建立一个以XX为主题的协同约定」——
  // 优先于普通约定识别：多人共创场景，确认后生成协同卡片
  const COLLAB_RE = /(?:建立|创建|建|发起|新开?|开一个?)(?:一?个)?(?:以([^，。,.！!？?~～]{1,40}?)(?:为|作)?主题)?的?\s*(?:协同|共创)约定/;
  const collabMatch = t.match(COLLAB_RE) || (/(?:建立|创建|建|发起)/.test(t) && /(?:协同|共创)(?:约定|空间)/.test(t) ? [t, ""] : null);
  if (collabMatch) {
    let theme = (collabMatch[1] || "").trim();
    if (!theme) {
      // 没带「以X为主题」：剥掉指令词后剩余内容作主题；剥光则回退整句截断
      theme = t
        .replace(COLLAB_RE, "")
        .replace(/^(一个|个|的)/, "")
        .replace(/[，。,.；;！!？?\s]+$/g, "")
        .trim()
        .slice(0, 60);
    }
    if (!theme) theme = t.replace(/[。！!？?\s]+$/g, "").slice(0, 60);
    const scenario = /情侣|夫妻|恋人|男朋友|女朋友|老公|老婆|对象|我们俩/.test(t)
      ? "couple"
      : /同事|工作|团队|项目|客户|办公/.test(t)
        ? "colleagues"
        : /朋友|闺蜜|兄弟|室友|同学|家人|姐妹|一起/.test(t)
          ? "friends"
          : "custom";
    return { type: "collab", title: theme, scenario, goal: null };
  }

  const urlMatch = t.match(URL_RE);
  const notLater = !LATER_REMIND_RE.test(t);
  // 网址 + 办事意图 → 直接派浏览器小助手（不再只立约定等确认）
  if (urlMatch && notLater && BROWSE_URL_INTENT_RE.test(t)) return { agent_goal: t };
  // 口语办事诉求 → 直接派浏览器小助手
  if (notLater && t.length <= 120 && NOW_BROWSE_RE.test(t)) return { agent_goal: t };

  if (urlMatch) return { type: "link", text: t };

  // 简化版时间解析：只覆盖最常见的口语时间
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const toIso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
  let due = null;
  let titleSource = t;

  const minMatch = t.match(/(\d+)\s*分钟后/);
  const hourMatch = t.match(/(\d+)\s*小时后/);
  const tonightMatch = t.match(/(?:今天下午|今晚)\s*(\d{1,2})(?:点|:|：)?(?:30|半)?/);
  const tomorrowMatch = t.match(/明天(?:上午|中午|下午|晚上)?\s*(\d{1,2})(?:点|:|：)?(?:30|半)?/);
  if (minMatch) {
    const d = new Date(now.getTime() + parseInt(minMatch[1], 10) * 60000);
    due = toIso(d);
  } else if (/半小时后/.test(t)) {
    due = toIso(new Date(now.getTime() + 30 * 60000));
  } else if (hourMatch) {
    due = toIso(new Date(now.getTime() + parseInt(hourMatch[1], 10) * 3600000));
  } else if (tonightMatch) {
    const d = new Date();
    d.setHours(parseInt(tonightMatch[1], 10), /半|30/.test(t) ? 30 : 0, 0, 0);
    if (d <= now) d.setDate(d.getDate() + 1);
    due = toIso(d);
  } else if (tomorrowMatch) {
    let h = parseInt(tomorrowMatch[1], 10);
    if ((t.includes("下午") || t.includes("晚上")) && h < 12) h += 12;
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(h, /半|30/.test(t) ? 30 : 0, 0, 0);
    due = toIso(d);
  }

  if (due) {
    const cleaned = t
      .replace(/提醒我?/, "")
      .replace(/(明天|今天|今晚|下午|上午|晚上|中午)?\s*\d{1,2}\s*(点|:|：)?(半|30|分)?\s*(后)?/, "")
      .replace(/[，。,.!\s]+$/, "")
      .replace(/^(?:明天|今天|后天|今晚|明早|本周|下周)+/, "")
      .replace(/^(?:半小时后|\d+\s*(?:个)?小时[以之]?后|\d+\s*分钟[以之]?后)/, "")
      .trim();
    const title = cleaned ? cleaned.slice(0, 60) : t.slice(0, 60);
    return { type: "task", title, description: t.slice(0, 300), category: "personal", priority: "medium", due_at: due };
  }

  // —— 显式立约定 / 周期提醒 / 期限完成（如"设为约定，一周内完成，每天下午3点提醒"）——
  const hasTaskDirective = TASK_DIRECTIVE_RE.test(t);
  const dailyMatch = t.match(DAILY_TIME_RE);
  const weeklyDayMatch = t.match(WEEKLY_DAY_RE);
  const withinMatch = t.match(WITHIN_RE);
  if (hasTaskDirective || dailyMatch || withinMatch || (weeklyDayMatch && /提醒|叫我|唤/.test(t))) {
    const now0 = new Date();
    let remindAt = null;
    let endAt = null;

    if (dailyMatch) {
      let h = parseInt(dailyMatch[2], 10);
      const period = dailyMatch[1] || "";
      if ((period === "下午" || period === "晚上") && h < 12) h += 12;
      let mi = dailyMatch[3] ? parseInt(dailyMatch[3], 10) : 0;
      if (/半\s*$/.test(dailyMatch[0])) mi = 30;
      if (h >= 0 && h <= 23) {
        const d = new Date();
        d.setHours(h, mi >= 0 && mi <= 59 ? mi : 0, 0, 0);
        if (d <= now0) d.setDate(d.getDate() + 1);
        remindAt = d;
      }
    } else if (weeklyDayMatch && /提醒|叫我|唤/.test(t)) {
      const target = { 日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 }[weeklyDayMatch[1]];
      if (target !== undefined) {
        const d = new Date();
        d.setHours(9, 0, 0, 0);
        let delta = (target - d.getDay() + 7) % 7;
        if (delta === 0 && d <= now0) delta = 7;
        d.setDate(d.getDate() + delta);
        remindAt = d;
      }
    }

    if (withinMatch) {
      const n = parseCnAmount(withinMatch[1]);
      if (n) {
        const d = new Date();
        const unit = withinMatch[2];
        if (unit === "月") d.setMonth(d.getMonth() + n);
        else if (unit === "周" || unit === "星期" || unit === "礼拜") d.setDate(d.getDate() + n * 7);
        else d.setDate(d.getDate() + n);
        d.setHours(18, 0, 0, 0);
        endAt = d;
      }
    }

    // reminder_time 语义优先（客户端把 due_at 当提醒时间落库；
    // "每天/每周"的重复语义会由创建接口从原话里自动识别成 repeat_rule）
    const pick = remindAt && endAt ? (remindAt <= endAt ? remindAt : endAt) : (remindAt || endAt);
    const due0 = pick ? toIso(pick) : null;

    // title：剥掉指令词/时间描述后的剩余；纯指令句（内容只剩时间描述）取对话里上一条用户消息
    const stripped = t
      .replace(/(?:设为|立个?|定为|记为|存为|保存为|转成|变成)\s*约定/g, "")
      .replace(/提醒我?/g, "")
      .replace(/每天[^，。,.]{0,12}?(?:提醒|叫我|唤)/g, "")
      .replace(/每周[^，。,.]{0,12}?(?:提醒|叫我|唤)/g, "")
      .replace(/[一二两三四五六七八九十\d]+\s*(?:个)?\s*(?:周|星期|礼拜|天|日|月)\s*(?:之?内|以?前|前)[^，。,.]{0,8}/g, "")
      .replace(/[，。,.；;！!？?\s]+/g, " ")
      .trim();
    const isDirectiveOnly = hasTaskDirective && !t
      .replace(/(?:设为|立个?|定为|记为|存为|保存为|转成|变成)\s*约定/g, "")
      .replace(/提醒我?/g, "")
      .replace(/每天[^，。,.]{0,6}?\d{1,2}\s*[点:：]?\s*(?:\d{1,2}|半)?/g, "")
      .replace(/每周[^，。,.]{0,8}?\d{0,2}\s*[点:：]?\s*(?:\d{1,2}|半)?/g, "")
      .replace(/[一二两三四五六七八九十\d]+\s*(?:个)?\s*(?:周|星期|礼拜|天|日|月)\s*(?:之?内|以?前|前)[^，。,.]{0,8}/g, "")
      .replace(/[，。,.；;！!？?\s]+/g, "")
      .trim();
    let title = "";
    if (isDirectiveOnly) {
      for (const prev of recentUserTexts) {
        const cand = String(prev || "").trim();
        if (!cand || cand === t) continue;
        if (TASK_DIRECTIVE_RE.test(cand)) continue;
        title = cand.slice(0, 60);
        break;
      }
    }
    if (!title) title = stripped.slice(0, 60);
    if (!title) title = t.replace(/^(?:设为|立个?|定为|记为|存为|保存为|转成|变成)\s*约定[，,]?\s*/, "").slice(0, 60) || "新约定";
    return { type: "task", title, description: t.slice(0, 300), category: "personal", priority: "medium", due_at: due0 };
  }

  // —— 连续对话分次补信息：「在下午3点的时候提醒我」把时间补进上轮的约定提案 ——
  const REMIND_VERB_RE = /提醒我?|叫我|唤我|喊我/;
  const BARE_TIME_RE = /(?:在|于|到)?\s*(上午|中午|下午|晚上|早上|清晨|凌晨)?\s*(\d{1,2})\s*[点:：]\s*(\d{1,2})?\s*(?:的时候|左右|前后|过后)?/;
  const bareTimeMatch = REMIND_VERB_RE.test(t) ? t.match(BARE_TIME_RE) : null;
  if (bareTimeMatch) {
    let h = parseInt(bareTimeMatch[2], 10);
    const period = bareTimeMatch[1] || "";
    if ((period === "下午" || period === "晚上") && h < 12) h += 12;
    // 裸数字时刻 1-6 点按生活惯例指下午（"3点提醒我"很少指凌晨）
    if (!period && h >= 1 && h <= 6) h += 12;
    if (h >= 0 && h <= 23) {
      const mi = bareTimeMatch[3] ? parseInt(bareTimeMatch[3], 10) : 0;
      const d = new Date();
      d.setHours(h, mi >= 0 && mi <= 59 ? mi : 0, 0, 0);
      if (d <= new Date()) d.setDate(d.getDate() + 1);
      const rest = t.replace(bareTimeMatch[0], "").replace(REMIND_VERB_RE, "").replace(/[，。,.；;！!？?\s]+/g, " ").trim();
      // 这句只剩时刻（用户在给上一条提案补时间）：合并进上轮提案
      if (!rest && lastExtracted?.type === "task") {
        return { ...lastExtracted, due_at: toIso(d) };
      }
      const cleaned = rest.replace(/^在/, "").replace(/(?:的时候|左右|前后|过后)$/, "").slice(0, 60)
        || t.replace(REMIND_VERB_RE, "").replace(/^在/, "").replace(/(?:的时候|左右|前后|过后)$/, "").slice(0, 60)
        || "新约定";
      return { type: "task", title: cleaned, description: t.slice(0, 300), category: "personal", priority: "medium", due_at: toIso(d) };
    }
  }

  // —— 条件从句：「在我深度工作的时候提醒我」先收下约定，等用户补时间 ——
  const clauseMatch = t.match(/(?:当|在|等)?我?([^，。,.]{2,20}?)(?:的时候|之时|时|之后|以后|后)\s*提醒我/);
  if (clauseMatch && !BARE_TIME_RE.test(t)) {
    const title = clauseMatch[1].replace(/^(?:我|你|咱)/, "").trim().slice(0, 60) || t.slice(0, 60);
    return { type: "task", title, description: t.slice(0, 300), category: "personal", priority: "medium", due_at: null };
  }

  // 情绪/感悟 → 心签；其余也先收进记录，避免对话走进死胡同
  const isHeart = t.length <= 200
    && /[情绪心累烦焦虑难过开心感谢温暖幸福孤独迷茫害怕担心感动感慨突然觉]/.test(t);
  if (isHeart && lastExtracted?.type !== "heart") return { type: "heart", content: t.slice(0, 500) };

  return lastExtracted || null;
}

function fallbackReply(userText, extracted, lastExtracted) {
  const t = String(userText || "").trim();
  if (extracted === "__reject__") {
    return "好，先不急着定～你想改哪一部分？时间、内容，还是它其实不是约定，告诉我就好。";
  }
  if (!extracted) {
    return "我在听～你可以再说一点点：比如想什么时候做这件事，或者这只是当下的一点心情，我都会替你收好。";
  }
  // 分类被用户改掉了：回复跟着换，不再沿用原类型的话术
  if (extracted.type === "task" && lastExtracted?.type === "heart") {
    return `好，那就不当心签，改成约定了「${extracted.title}」。你看看下面的小卡片，没问题就点确认～`;
  }
  if (extracted.type === "heart" && lastExtracted?.type === "task") {
    return "好，那它不当约定催你，我把它收进心签里。点下面的确认就存好～";
  }
  if (extracted.type === "task" && (!lastExtracted || lastExtracted.title !== extracted.title)) {
    if (!extracted.due_at && /https?:\/\//.test(extracted.description || "")) {
      return `好，我记下了「${extracted.title}」。确认后我会派浏览器小助手替你打开网页一步步办好，进度在守护记录里随时看～`;
    }
    return extracted.due_at
      ? `好，我记下了「${extracted.title}」。时间我也算好了，你看一眼下面的小卡片，没问题就点确认～`
      : `好，我记下了「${extracted.title}」。大概想定在什么时候？告诉我，我把它排进去～`;
  }
  // 同一提案把时间补上了（用户分轮给信息：先立约定，后补时刻）
  if (extracted.type === "task" && lastExtracted?.type === "task" && !lastExtracted.due_at && extracted.due_at) {
    return "好，我把时间补上了，你看一眼下面的小卡片，没问题就点确认～";
  }
  if (extracted.type === "heart") {
    // 子类型被用户改掉了：回应口吻跟着换（账本损友式/灵感推落地/备忘极简…）
    if (extracted.heart_category && lastExtracted?.type === "heart" && extracted.heart_category !== lastExtracted.heart_category) {
      const SWITCH_COPY = {
        ledger: "行，这笔交给我记账～点确认，我把账理清，再附赠一句损友式点评。",
        inspiration: "这个念头值得留下！点确认存成灵感签，我再帮你推一把，想想它最能落在哪个瞬间。",
        memo: "收到，存成备忘。点确认就记好，不啰嗦～",
        material: "好，存成资料签。点确认，我再给你补点有用的上下文。",
        share: "谢谢你愿意分享～点确认存好，这条我用心收着。",
        emotion: "好，那这句按情绪签陪你。点下面的确认就存好～"
      };
      return SWITCH_COPY[extracted.heart_category] || SWITCH_COPY.emotion;
    }
    return "这句话我替你收进心签里了。点下面的确认就存好，以后随时可以翻出来看看～";
  }
  if (extracted.type === "link") {
    return "这个链接我帮你存进记录。点下面的确认就存好～";
  }
  if (extracted.type === "collab") {
    const SCENARIO_ZH = { couple: "情侣", friends: "朋友", colleagues: "同事", custom: "自定义" };
    return `好，我搭了一个「${extracted.title}」的协同约定骨架（${SCENARIO_ZH[extracted.scenario] || "自定义"}场景）。点下面的确认，我就把它生成卡片，之后可以点卡片进共创空间一起完善～`;
  }
  return "我在听，你继续说～";
}

// 已确认规划的延续调整：提案卡确认后 lastExtracted 清空，从库里最近的活跃智能规划（子约定带 plan_group）重建模板
async function loadActivePlanFromDb({ userId, prisma }) {
  try {
    const since = new Date(Date.now() - 60 * 86400000);
    const parents = await prisma.task.findMany({
      where: {
        userId,
        deletedAt: null,
        parentTaskId: null,
        createdAt: { gte: since },
        children: { some: { deletedAt: null, reminderTime: { not: null } } }
      },
      select: {
        id: true,
        title: true,
        createdAt: true,
        children: {
          where: { deletedAt: null, reminderTime: { not: null } },
          select: { title: true, description: true, reminderTime: true, endTime: true, status: true, metadata: true },
          take: 80
        }
      },
      orderBy: { createdAt: "desc" },
      take: 15
    });
    const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
    let best = null;
    for (const p of parents) {
      const planKids = p.children.filter((c) => {
        const meta = c.metadata && typeof c.metadata === "object" ? c.metadata : {};
        const extra = meta._extraFields && typeof meta._extraFields === "object" ? meta._extraFields : meta;
        return Boolean(extra.plan_group) || Boolean(extra.plan_kind);
      });
      if (planKids.length < 3) continue;
      const future = planKids.filter((c) =>
        new Date(new Date(c.reminderTime).getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10) >= today
      ).length;
      const score = future * 100 + planKids.length;
      if (!best || score > best.score) best = { parent: p, kids: planKids, score };
    }
    if (!best) return null;
    const patterns = rebuildPatternsFromChildren(best.kids);
    if (patterns.length === 0) return null;
    const cnDates = best.kids
      .map((c) => new Date(new Date(c.reminderTime).getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10))
      .sort();
    const horizonDays = Math.min(30, Math.max(2, Math.round(
      (new Date(`${cnDates[cnDates.length - 1]}T00:00:00+08:00`).getTime() - new Date(`${today}T00:00:00+08:00`).getTime()) / 86400000
    ) + 1));
    return {
      goal: String(best.parent.title || "智能规划").replace(/[（(]\d+\s*天[^）)]*[）)]/g, "").trim().slice(0, 60) || "智能规划",
      horizonDays,
      dailyMinutes: Math.max(30, requiredBudget(patterns)),
      patterns
    };
  } catch (e) {
    console.warn("[flowChat] 读取已确认规划失败:", e?.message || e);
    return null;
  }
}

// 语义是调整、但会话里没有待确认规划时：从库里活跃规划重建模板 → 应用调整 → 出新提案
async function tryDbPlanAdjustment({ userId, prisma, text }) {
  const t = String(text || "").trim();
  if (!t || t.length > 40) return null;
  if (PLAN_INTENT_RE.test(t)) return null; // 新规划请求不接管（如"规划个每天加阅读的计划"）
  const adj = extractAdjustmentsFromText(t);
  if (!adj?.length) return null;
  const active = await loadActivePlanFromDb({ userId, prisma });
  if (!active) return null;
  const patched = applyPlanAdjustments(active.patterns, adj);
  if (patched.applied.length === 0) return null;
  const budget = Math.max(active.dailyMinutes || 30, requiredBudget(patched.patterns));
  const re = reexpandPlan(patched.patterns, {
    goal: active.goal,
    horizonDays: active.horizonDays,
    dailyMinutes: budget,
    preferences: null,
    baseDailyMinutes: budget
  });
  if (!re) return null;
  return {
    extracted: {
      type: "plan",
      plan_request: { goal: active.goal, horizon_days: active.horizonDays, daily_minutes: active.dailyMinutes, preferences: null },
      plan: { parent: re.parent, children: re.children, patterns: patched.patterns, source: "ai" }
    },
    reply: `好的，已替你更新：${patched.applied.slice(0, 4).join("；")}${patched.missed.length > 0 ? `；没匹配到「${patched.missed.map((m2) => m2.target).join("、")}」` : ""}，看看新安排～`
  };
}

// ===== Kimi 对话 =====
const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    reply: { type: "string", description: "对用户说的话，1-3 句，温柔自然口语" },
    agent_goal: {
      type: ["string", "null"],
      description: "用户想让 Agent 现在就去网页上办的事（查实时信息/订票/网页查询办理等），原样保留诉求；不需要时为 null"
    },
    extracted: {
      type: ["object", "null"],
      description: "从对话中提取的待确认内容；信息不足或纯聊天时为 null",
      properties: {
        type: { type: "string", enum: ["task", "heart", "link", "plan", "collab"] },
        title: { type: "string" },
        description: { type: "string" },
        content: { type: "string" },
        text: { type: "string" },
        category: { type: "string", enum: CATEGORIES },
        heart_category: { type: "string", enum: ["emotion", "inspiration", "material", "memo", "share", "ledger"], description: "心签子类型（情绪/灵感/资料/备忘/分享/账本）；用户纠正心签分类时更新为目标类型，平时可省略" },
        priority: { type: "string", enum: PRIORITIES },
        due_at: { type: "string", description: "ISO8601 带 +08:00 时区，如 2026-09-24T15:00:00+08:00" },
        scenario: { type: "string", enum: ["couple", "friends", "colleagues", "custom"], description: "type=collab 时的场景：情侣/朋友/同事；推断不出为 custom" },
        goal: { type: "string", description: "type=collab 时的共同目标（一句话，可省略）" },
        plan_request: {
          type: ["object", "null"],
          description: "type=plan 时的规划请求：用户提出一类需要多天持续做的事，由系统排期后生成提案；不需要时为 null",
          properties: {
            goal: { type: "string", description: "一句话概括要规划的目标，如「一周英语学习」" },
            horizon_days: { type: ["number", "null"], description: "计划总天数；推断不出为 null" },
            daily_minutes: { type: ["number", "null"], description: "每天可投入分钟数；推断不出为 null" },
            preferences: { type: ["string", "null"], description: "用户对时段/节奏的偏好，如「早上」「下班后」" },
            adjustments: {
              type: ["array", "null"],
              description: "用户在调整已有规划时的定向修改（保持 goal/horizon/daily 不变，把修改写这里，可多条）：target=作用对象（周末/工作日/每天/周六/组名如「力量」），field=duration|start_time|content|note|add，value=新值（如「60分钟」「19:30」「新的内容描述」；field=add 时 value=新项名称如「瑜伽」）",
              items: {
                type: "object",
                properties: {
                  target: { type: "string", description: "周末|工作日|每天|全部|周一..周日|组名关键词" },
                  field: { type: "string", enum: ["duration", "start_time", "content", "note", "add"] },
                  value: { type: "string", description: "如「60分钟」「一小时」「19:30」「早上」「慢跑5公里」；field=add 时为新项名称如「瑜伽」" },
                  start_time: { type: ["string", "null"], description: "field=add 时新项的开始时刻，HH:MM 或「下午3点」这类口语" },
                  duration_minutes: { type: ["number", "null"], description: "field=add 时新项的分钟数，如 30" }
                },
                required: ["target", "field", "value"]
              }
            }
          }
        }
      }
    }
  },
  required: ["reply", "agent_goal", "extracted"]
};

function buildMessagesBlock(messages) {
  return messages
    .slice(-12)
    .map((m) => `${m.role === "user" ? "用户" : "SoulSentry"}：${trim(m.content, 500)}`)
    .join("\n");
}

async function chatWithKimi({ messages, lastExtracted, attachmentCtx = "" }) {
  const now = chinaNow();
  const extractedCtx = lastExtracted
    ? `（你上一轮提出的待确认提案如下，用户可能正在对它做修改：${JSON.stringify(lastExtracted)}）`
    : "";

  const prompt = `现在是中国时间 ${now.date} ${now.dateTime.slice(11)}。以下是用户与 SoulSentry 的对话${extractedCtx}：

${buildMessagesBlock(messages)}${attachmentCtx}

请按系统要求返回 JSON。`;

  const resultAndUsage = await invokeKimiText({
    prompt,
    systemPrompt: `你是 SoulSentry「心栈」，一个温柔、克制、值得信赖的陪伴式记录助手。用户通过和你聊天的方式，把心里想记的东西告诉你。

你的任务是从对话中理解用户想做什么，并在信息足够时给出待确认的结构化提案（extracted）：
- type=task（立约定）：用户想在未来某个时间做某件事。title 是从内容提炼的简短标题（≤12字），不要包含时间词（今天/明天/下午等，时间已由 due_at 单独表达）；description 必须保留用户说这件事的原话，方便日后回看。due_at 必须是带 +08:00 的 ISO8601 时间。category 从 ${CATEGORIES.join("/")} 中选，priority 从 high/medium/low 中选。用户明确说「打卡/签到」，或想长期重复坚持同一件事（如每天跑步、每日阅读、练琴打卡），category 用 checkin（打卡约定，每次做到点一下记一次）。
- type=task（网页办事）：用户想"打开某个网址做事"——如打开网页查询/搜索/填写/预约/订票/报名/提交，或描述里带 http 链接并让你去办。同样输出 type=task，description 必须原样保留完整网址和原话，due_at 可以为 null。回复时告诉用户：确认后心栈会派浏览器小助手替你打开网页一步步办理，遇到登录等需要你出面的环节会暂停问你，进度和结果在守护记录里随时可看。
- type=heart（记心签）：用户在表达情绪、心情、感悟、瞬间。content 保留用户原话。心签有六种分类（情绪/灵感/资料/备忘/分享/账本），用户纠正分类时（如"这是账本签""改成灵感"）extracted.heart_category 更新为目标类型，reply 口吻跟着换：账本签轻松吐槽、灵感签推一把落地、备忘签极简确认、资料签补上下文、情绪签温柔托举。
- type=plan（智能约定规划）：用户提出一类需要持续多天做的事，希望你能帮忙整体规划——如"帮我规划一周英语学习""21天减脂""备考复习计划""每天练琴坚持一个月"。只填 plan_request（goal 必填，一句话概括目标；能推断时填 horizon_days 天数、daily_minutes 每天分钟数、preferences 时段偏好），绝对不要自己把规划拆成 task 列表。缺关键信息（通常是天数或每天时长）时 plan_request 里留 null，reply 只问那一个最关键的问题。用户调整已有规划时分两种情况：整体变化（"改成早上"/"每天加到一小时"/"延长到三周"）更新 plan_request 对应字段；定向修改（"周末加到一小时""周六改到早上""把长跑换成游泳"）保持 goal/horizon/daily 不变，写进 plan_request.adjustments（target=周末/工作日/每天/组名，field=duration/start_time/content，value=新值），可多条，reply 用一句话复述你理解到的修改。用户想在规划里新增一项（如"周六下午3点加半小时瑜伽""每天加冥想"）时用 field="add"，value=新项名称（如"瑜伽"），并带上 start_time（如"15:00"）与 duration_minutes（如 30），target 为适用日。
- type=link（存链接）：用户发来网址仅仅想存起来看看（没有让你去网页上办事）。text 保留用户原话。
- 纯聊天或信息还不足：extracted 为 null。

agent_goal（网页办事，即时执行）：用户想让你"现在就去网上办一件事"——查实时信息（天气/股价/快递/余票）、打开网页搜索查询、订机票/火车票/酒店、网页填写/预约/比价等。把用户的原始诉求原样填进 agent_goal（含完整网址），extracted 保持 null（同一件事不要两边都放）。回复时告诉用户：浏览器小助手已经出发去办了，过程和结果会直接回到对话里，遇到需要你拍板的地方会 pause 下来问你。若这件事里另有"需要用户日后参与/值得记住"的部分（如出行安排、约定），再单独用 extracted 立约定。

重要：你所在的 SoulSentry 已经具备浏览器自动执行能力，不要再说"我没办法打开网页/搜索"，这类请求请填 agent_goal。

术语约定（必须严格遵守）：用户想记下的"要在未来做的事/提醒"一律称为「约定」。回复里绝对不要说「待办」「任务」「待办事项」「todo」「日程」「提醒事项」，统一说「约定」；「心签」「链接」的说法保持不变。举例：说"这个约定我记下了"，不要说"这个待办我记下了"。

对话原则：
1. 信息不足时不要硬猜：只问一个最关键的补充问题（通常是时间），语气像朋友，不像表单。
2. 信息足够时：extracted 给出完整提案，reply 里用一两句话温柔复述你要记下什么，提醒用户点确认即可生成，不要催促。
3. 用户修改提案时，更新 extracted；用户说"就这些/对了/确认"时保持 extracted 不变。
4. 用户否定当前提案（比如说"不对""我想改一下"）时：extracted 输出 null，先温柔地问清楚 TA 想改哪一部分（时间、内容，还是这其实不是约定/心签），不要立刻重复同一个提案。
5. 永远温柔从容：不评判、不催促、不制造焦虑；用户想闲聊就好好陪聊。
6. reply ≤80字，自然口语，像微信聊天，不要用列表和 markdown。
7. 严格返回 JSON，不要输出其他内容。`,
    responseJsonSchema: RESPONSE_SCHEMA,
    temperature: 0.7,
    maxTokens: 4000,
    withUsage: true
  });

  const { data: result, usage } = resultAndUsage;
  if (!result || typeof result !== "object" || typeof result.reply !== "string") {
    throw new Error("invalid chat response");
  }
  if (PRESSURE_WORDS.test(result.reply)) {
    throw new Error("reply failed tone check");
  }
  const agentGoal = trim(result.agent_goal, 200) || null;
  // 同一件事不要重复：agent_goal 已覆盖的请求，不再出同名约定提案
  const extracted = agentGoal && result.extracted?.type === "task"
    ? null
    : sanitizeExtracted(result.extracted);
  return {
    reply: trim(result.reply, 120),
    agentGoal,
    extracted,
    usage
  };
}

/**
 * 对话入口：messages 为完整对话历史（客户端持有），lastExtracted 为当前待确认提案。
 * agentExecutionId：对话中挂着浏览器小助手会话时，用户消息直接转发给 Agent。
 * 返回 { reply, extracted, agentGoal?, agent?, source }；任何情况下都给出可继续的对话。
 */
export async function runFlowChat({ messages, lastExtracted = null, userId = null, prisma = null, agentExecutionId = null, attachments = [] }) {
  // 附件上下文：图片走视觉识别（本地读文件转 base64，无需公网 URL），文件列名称类型
  let attachmentCtx = "";
  if (Array.isArray(attachments) && attachments.length) {
    const parts = [];
    for (const a of attachments.slice(0, 3)) {
      const name = String(a?.name || "附件").slice(0, 80);
      const type = String(a?.type || "");
      if (type.startsWith("image/") && a?.url) {
        try {
          const r = await analyzeImage({ fileUrl: a.url });
          const desc = [r?.extracted_text, r?.suggestion].filter(Boolean).join("；").slice(0, 600);
          parts.push(`图片「${name}」的内容：${desc || "（未能识别内容）"}`);
        } catch {
          parts.push(`图片「${name}」（内容未能识别）`);
        }
      } else {
        parts.push(`文件「${name}」（${type || "未知类型"}）`);
      }
    }
    if (parts.length) attachmentCtx = `\n\n用户随本条消息附上了：\n- ${parts.join("\n- ")}`;
  }

  const safeMessages = Array.isArray(messages)
    ? messages
        .filter((m) => m && typeof m.content === "string" && ["user", "assistant"].includes(m.role))
        .slice(-30)
        .map((m) => ({ role: m.role, content: m.content.slice(0, 500) }))
    : [];

  const lastUser = [...safeMessages].reverse().find((m) => m.role === "user");
  // Agent 转发用未截断的原始用户消息（长文案/详细补充说明不被 500 字截断）
  const lastUserRaw = Array.isArray(messages)
    ? [...messages].reverse().find((m) => m && m.role === "user" && typeof m.content === "string")
    : null;

  // —— 浏览器小助手会话进行中：用户消息直接转发给 Agent ——
  if (agentExecutionId && lastUser) {
    try {
      const owned = await prisma?.taskExecution?.findFirst({
        where: { id: agentExecutionId, userId, automationType: "browser_task" },
        select: { id: true, executionStatus: true }
      });
      if (!owned) {
        return { reply: "小助手刚才的会话已经收尾了，结果在守护记录里可以看～还想办点什么吗？", extracted: null, agent: null, source: "agent" };
      }
      if (owned.executionStatus === "failed" || owned.executionStatus === "completed") {
        return { reply: "小助手的会话已经收尾了，过程和结果在守护记录里可以看～想继续的话点「再试一次」，或者跟我说新的需求哦", extracted: null, agent: null, source: "agent" };
      }
      const resp = await respondToAgent(agentExecutionId, { text: (String(lastUserRaw?.content || lastUser?.content || "").slice(0, 1500) + attachmentCtx).slice(0, 2000) });
      if (!resp.ok) {
        return { reply: "小助手还在操作网页，等它问你或者出结果哦～", extracted: null, agent: { executionId: agentExecutionId, status: "running" }, source: "agent" };
      }
      return { reply: "收到，我转达给小助手了，它继续帮你办～", extracted: null, agent: { executionId: agentExecutionId, status: "running" }, source: "agent" };
    } catch (err) {
      console.warn("[flowChat] 转发小助手失败:", err?.message || err);
      return { reply: "小助手那边好像断线了，结果可以在守护记录里看，也可以稍后再让我帮你办～", extracted: null, agent: null, source: "agent" };
    }
  }

  // —— AI 点数预检：对话是用户主动触发的 AI 调用，余额不足时不消耗 AI、直接温柔提示充值 ——
  if (userId && prisma) {
    const creditUser = await prisma.user.findUnique({ where: { id: userId }, select: { aiCredits: true } });
    const balance = creditUser?.aiCredits ?? 0;
    if (balance < 1) {
      return {
        reply: "AI 点数用完啦。去「我的 → AI 点数」充一点，随时回来继续聊～",
        extracted: null,
        insufficientCredits: true,
        balance,
        source: "credits"
      };
    }
  }

  try {
    if (!safeMessages.length || !lastUser) throw new Error("empty messages");
    // 注入对话的提案上下文要瘦身：逐日 children 又长又干扰理解，模板(patterns)才是调整的核心上下文
    const dialogueLastExtracted = lastExtracted?.type === "plan" && lastExtracted?.plan
      ? {
          ...lastExtracted,
          plan: {
            parent: lastExtracted.plan.parent,
            patterns: lastExtracted.plan.patterns,
            source: lastExtracted.plan.source
          }
        }
      : lastExtracted;
    const out = await Promise.race([
      chatWithKimi({ messages: safeMessages, lastExtracted: dialogueLastExtracted, attachmentCtx }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("TIMEOUT")), 30000))
    ]);

    // —— 智能约定规划：调规划器（注入已有安排避障），把逐日执行计划填进提案 ——
    // plan 字段由服务端生成，不落模型之手；每次带最新 plan_request 重排，确认/改期都走这里
    if (out.extracted?.type === "plan" && out.extracted.plan_request && userId && prisma) {
      try {
        const req = out.extracted.plan_request;

        // —— 反问门控：关键参数缺失时不烧规划调用，先问清楚（多轮对话把需求明确，一次只问一个） ——
        const missingQuestion = !req.horizon_days
          ? "这个计划想坚持多少天？比如 7 天、14 天或 21 天～"
          : !req.daily_minutes
            ? "每天大概能投入多少分钟？我按这个强度来排～"
            : null;
        if (missingQuestion) {
          // 对话模型已被要求提问；兜底保证 reply 里确实有问题
          if (!out.reply.includes("？") && !out.reply.includes("?")) {
            out.reply = `${out.reply} ${missingQuestion}`;
          }
        } else {
        const horizon = req.horizon_days || 7;
        const dayMs = 86400000;
        const start = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
        const end = new Date(Date.now() + 8 * 3600 * 1000 + (horizon + 1) * dayMs).toISOString().slice(0, 10);
        const rangeStart = new Date(`${start}T00:00:00+08:00`);
        const rangeEnd = new Date(`${end}T00:00:00+08:00`);
        const busyTasks = await prisma.task.findMany({
          where: {
            userId,
            deletedAt: null,
            status: { notIn: ["DONE", "ARCHIVED"] },
            OR: [
              { reminderTime: { gte: rangeStart, lt: rangeEnd } },
              { dueAt: { gte: rangeStart, lt: rangeEnd } }
            ]
          },
          select: { title: true, reminderTime: true, endTime: true, dueAt: true },
          take: 50
        });
        const toCn = (d) => new Date(d.getTime() + 8 * 3600 * 1000).toISOString();
        const existing = busyTasks
          .map((t) => ({
            date: (t.reminderTime || t.dueAt) ? toCn(t.reminderTime || t.dueAt).slice(0, 10) : null,
            start: t.reminderTime ? toCn(t.reminderTime).slice(11, 16) : null,
            end: t.endTime ? toCn(t.endTime).slice(11, 16) : null,
            title: String(t.title || "").slice(0, 30)
          }))
          .filter((b) => b.date);
        // 个性化输入：历史活跃时段/完成率/既有打卡约定/窗口负载（只读，失败不影响规划）
        const insights = await buildPlanInsights({ userId, prisma, busyTasks: existing }).catch((e) => {
          console.warn("[flowChat] 规划画像构建失败:", e?.message || e);
          return null;
        });
        // 近期执行力偏低时自动降档起步（用户明确要的量不再加码）
        let dailyMinutes = req.daily_minutes || undefined;
        if (dailyMinutes && insights?.subtaskDoneRate30d !== null && insights?.subtaskDoneRate30d !== undefined
          && insights.subtaskDoneRate30d < 0.5) {
          dailyMinutes = Math.max(15, Math.round(dailyMinutes * 0.7));
        }

        // —— 快速路径 A：定向调整（「周末加到一小时」）→ 补丁模板 + 本地秒级重排，不调 AI ——
        const prev = lastExtracted && lastExtracted.type === "plan" ? lastExtracted : null;
        const prevReq = prev?.plan_request;
        const prevPatterns = Array.isArray(prev?.plan?.patterns) && prev.plan.patterns.length > 0 ? prev.plan.patterns : null;
        // goal 口径放宽：模型常把「两周的健身计划」改写回「健身计划」，严格相等会让定向调整整体失配
        const normGoal = (s) => String(s || "")
          .replace(/[（(][^）)]*[）)]/g, "") // 括号里的补充说明（如"含游泳"）不算主题变化
          .replace(/[\s「」"'，。,.！!？?：:；;、·]/g, "")
          .replace(/[的把了地呢吧哦啊呀]/g, "")
          .replace(/^(帮我|我要|我想|我想想|想要|麻烦|请)/, "");
        const prevGoalN = normGoal(prevReq?.goal);
        const goalN = normGoal(req.goal);
        const sameGoal = !!prevReq && !!prevGoalN && !!goalN
          && (prevGoalN === goalN || ((prevGoalN.includes(goalN) || goalN.includes(prevGoalN)) && Math.min(prevGoalN.length, goalN.length) >= 4));
        const lastUserText = [...safeMessages].reverse().find((m) => m.role === "user")?.content || "";
        const modelAdjustments = Array.isArray(req.adjustments) && req.adjustments.length > 0 ? req.adjustments : null;
        // 文本兜底始终计算：带范围词的调整语句优先按定向修改处理，防止模型误判成整体时长变更
        const textAdjustments = prevPatterns && sameGoal ? extractAdjustmentsFromText(lastUserText) : null;
        // 新增项优先用本地对原话的精确解析；模型给的新增项适用日与原话不吻合时直接丢弃
        const resolved = resolvePlanAdjustments({ modelAdjustments, textAdjustments, lastUserText });
        let adjustments = resolved.adjustments;
        let patched = adjustments && prevPatterns ? applyPlanAdjustments(prevPatterns, adjustments) : null;
        // 模型抽的调整没落地时，换本地语义兜底再试一次（「周末加强一小时」这类口语模型常漏抽）
        if ((!patched || patched.applied.length === 0) && textAdjustments && textAdjustments.length && adjustments !== textAdjustments) {
          const textPatched = applyPlanAdjustments(prevPatterns, textAdjustments);
          if (textPatched.applied.length > 0) { patched = textPatched; adjustments = textAdjustments; }
        }
        console.log(`[flowChat] 规划调整: sameGoal=${!!sameGoal} via=${resolved.via} applied=${patched ? patched.applied.length : 0} goal=${String(req.goal || "").slice(0, 20)}`);
        let planned = null;
        let adjustedPatterns = null;
        if (!planned && prevPatterns && sameGoal && patched && patched.applied.length > 0) {
          adjustedPatterns = patched.patterns;
          // 显式调大的时长不能被原每日预算压回：预算抬到模板实际所需
          const budget = Math.max(
            req.daily_minutes || prevReq.daily_minutes || 30,
            requiredBudget(adjustedPatterns)
          );
          planned = reexpandPlan(adjustedPatterns, {
            goal: req.goal,
            horizonDays: req.horizon_days || prevReq.horizon_days,
            dailyMinutes: budget,
            preferences: req.preferences || prevReq.preferences,
            insights,
            baseDailyMinutes: budget
          });
          if (planned) {
            out.extracted.plan = {
              parent: planned.parent,
              children: planned.children,
              patterns: adjustedPatterns,
              source: "ai"
            };
            const missedNote = patched.missed.length > 0
              ? `；没匹配到「${patched.missed.map((m2) => m2.target).join("、")}」对应的安排，可以再说具体点`
              : "";
            out.reply = `${out.reply}（已更新：${patched.applied.slice(0, 4).join("；")}${missedNote}）`;
          }
        }
        // 调整语句明确但哪儿都没匹配上：不弹空卡也不装没事，追问清楚
        if (!planned && prevPatterns && sameGoal && adjustments && (!patched || patched.applied.length === 0)) {
          out.extracted = null;
          out.reply = `${out.reply}（没太听懂要改哪一项安排，告诉我是「周末/工作日/每天」还是具体哪组内容？）`;
        }

        // —— 快速路径 B：整体参数变化（时段/天数/时长）→ 本地秒级重排 ——
        if (!planned && !adjustments?.length && prevPatterns && sameGoal) {
          planned = reexpandPlan(prevPatterns, {
            goal: req.goal,
            horizonDays: req.horizon_days || prevReq.horizon_days,
            dailyMinutes: req.daily_minutes || prevReq.daily_minutes,
            preferences: req.preferences || prevReq.preferences,
            insights,
            baseDailyMinutes: prevReq.daily_minutes
          });
          if (planned) {
            out.extracted.plan = {
              parent: planned.parent,
              children: planned.children,
              patterns: adjustedPatterns || prevPatterns,
              source: "ai"
            };
            // 重排结果和上一轮一模一样时不谎称"已重排"，引导用户说具体修改
            const prevKids = Array.isArray(prev?.plan?.children) ? prev.plan.children : null;
            const kidSig = (list) => list.map((c) => `${c.date}|${c.start_time}|${c.title}|${c.duration_minutes}`).join(";");
            const unchanged = !!prevKids && kidSig(planned.children) === kidSig(prevKids);
            const confirmish = /^(好|好的?|行|可以|确认|就这些|对|嗯|ok|没问题)[～~。!！.\s]*$/i.test(lastUserText.trim());
            out.reply = unchanged && !confirmish
              ? `${out.reply}（这轮没看出要改哪里：可以直接说具体修改，比如「周末加到一小时」「周六改到早上9点」「把跑步换成游泳」）`
              : `${out.reply}（已按你最新的要求重排好啦，看看这次的安排～）`;
          }
        }

        // —— 全量路径：日型模板规划（AI 约 8-15s） ——
        if (!planned) {
          planned = await planCommitmentWithKimi({
            goal: req.goal,
            horizonDays: req.horizon_days || undefined,
            dailyMinutes,
            preferences: req.preferences,
            existing,
            insights
          });
          out.extracted.plan = {
            parent: planned.parent,
            children: planned.children,
            patterns: planned.patterns || null,
            source: planned.source || "ai"
          };
          // 降级模板要让用户知情（区别于 throw 路径的提示，内部兜底只标 source）
          if (planned.source === "fallback") {
            out.reply = `${out.reply}（这次排期没连上 AI，先给了保守模板；跟我说「重新规划」出正式版～）`;
          }
          // 两次 AI 调用（对话+规划）的用量合并结算
          if (planned.usage && out.usage) {
            out.usage = {
              prompt_tokens: (out.usage.prompt_tokens || 0) + (planned.usage.prompt_tokens || 0),
              completion_tokens: (out.usage.completion_tokens || 0) + (planned.usage.completion_tokens || 0),
              total_tokens: (out.usage.total_tokens || 0) + (planned.usage.total_tokens || 0)
            };
          }
        }
        // 用了个性化排期就让用户感知到「这是为你调的」
        if (out.extracted?.plan?.source !== "fallback" && insights) {
          const activeWindows = Array.isArray(insights.activeWindows) ? insights.activeWindows : [];
          const note = renderInsightsForPrompt(insights)
            ? `（这次的安排参考了你的习惯${activeWindows.length ? `：你多在 ${activeWindows.join("、")} 行动` : ""}${insights.subtaskDoneRate30d !== null && insights.subtaskDoneRate30d !== undefined ? `，近期完成率 ${Math.round(insights.subtaskDoneRate30d * 100)}%` : ""}，不合适随时说，我重排）`
            : "";
          if (note) out.reply = `${out.reply}${note}`;
        }
        }
      } catch (planErr) {
        console.warn("[flowChat] 规划失败:", planErr?.message || planErr);
        out.reply = `${out.reply}（排期这一步没成功，跟我说「重新规划」再试一次？）`;
      }
      // 规划内容缺失（反问中/调整未识别/生成失败）时降级为纯对话，绝不弹空的「将要生成智能规划」卡片
      if (out.extracted?.type === "plan" && !out.extracted.plan) {
        out.extracted = null;
      }
    }

    // —— 本地兜底（不依赖对话模型的理解）：上轮有规划模板且本轮输入是定向调整语句时直接应用 ——
    // 对话模型偶尔把「周六改到早上9点」当闲聊；只要语义明确，本地接管，保证随机应变
    {
      const prevExt = lastExtracted && lastExtracted.type === "plan" ? lastExtracted : null;
      const prevPats = Array.isArray(prevExt?.plan?.patterns) && prevExt.plan.patterns.length > 0 ? prevExt.plan.patterns : null;
      const usablePlanThisTurn = out.extracted?.type === "plan" && !!out.extracted?.plan;
      const lastText = [...safeMessages].reverse().find((m) => m.role === "user")?.content || "";
      if (!usablePlanThisTurn && prevPats && prevExt?.plan_request) {
        const textAdj = extractAdjustmentsFromText(lastText);
        if (textAdj?.length) {
          const patched = applyPlanAdjustments(prevPats, textAdj);
          if (patched.applied.length > 0) {
            const budget = Math.max(prevExt.plan_request.daily_minutes || 30, requiredBudget(patched.patterns));
            const re = reexpandPlan(patched.patterns, {
              goal: prevExt.plan_request.goal,
              horizonDays: prevExt.plan_request.horizon_days || 7,
              dailyMinutes: budget,
              preferences: prevExt.plan_request.preferences,
              baseDailyMinutes: budget
            });
            if (re) {
              out.extracted = {
                type: "plan",
                plan_request: { ...prevExt.plan_request, adjustments: null },
                plan: { parent: re.parent, children: re.children, patterns: patched.patterns, source: "ai" }
              };
              const missedNote = patched.missed.length > 0
                ? `；没匹配到「${patched.missed.map((m2) => m2.target).join("、")}」`
                : "";
              out.reply = `好的，已替你更新：${patched.applied.slice(0, 4).join("；")}${missedNote}，看看新安排～`;
            }
          }
        }
      }
      // 提案卡已确认（lastExtracted 清空）或 goal 被改写失配时：从库里的活跃规划重建模板再应用
      if (!(out.extracted?.type === "plan" && out.extracted?.plan) && userId && prisma) {
        const dbAdj = await tryDbPlanAdjustment({ userId, prisma, text: lastText });
        if (dbAdj) {
          out.extracted = dbAdj.extracted;
          out.reply = dbAdj.reply;
        }
      }
    }

    // AI 调用成功：按真实 token 用量结算（1 点/1000 token，最少 1 点）；余额竞态只记警告不阻断
    if (userId && prisma && out.usage) {
      try {
        const { cost, billableTokens } = usageCost(out.usage);
        await chargeAICredits({
          userId,
          cost,
          feature: "flow_chat",
          description: `心流对话（${Math.round(billableTokens)} tokens）`
        });
      } catch (chargeErr) {
        if (chargeErr?.code === "INSUFFICIENT_CREDITS") {
          console.warn(`[flowChat] 结算时余额不足（余额 ${chargeErr.balance}），本次放行`);
        } else {
          console.error("[flowChat] 扣点失败:", chargeErr?.message || chargeErr);
        }
      }
    }

    // —— Kimi 判断需要即时网页办事：启动浏览器小助手 ——
    let agent = null;
    if (out.agentGoal && userId && prisma) {
      try {
        const started = await startStandaloneBrowserExecution({ goal: out.agentGoal, userId, prisma });
        if (started.status === "started") {
          agent = { executionId: started.executionId, status: "running" };
        } else {
          out.reply = `${out.reply}（小助手暂时没能出发：${started.reason}）`;
        }
      } catch (startErr) {
        console.warn("[flowChat] 启动小助手失败:", startErr?.message || startErr);
        out.reply = `${out.reply}（小助手暂时没能出发，稍后再试试？）`;
      }
    }
    return { reply: out.reply, extracted: out.extracted, agentGoal: out.agentGoal, agent, source: "ai" };
  } catch (err) {
    console.warn("[flowChat] Kimi chat failed, fallback:", err?.message || err);
    // "设为约定"这类指令常指代上文：把最近的用户消息倒序传给兜底，供标题提取
    const recentUserTexts = safeMessages
      .filter((m) => m.role === "user")
      .map((m) => m.content)
      .reverse();
    const raw = fallbackExtract(lastUser?.content, lastExtracted, recentUserTexts);

    // 兜底识别出"现在就去网页办事"：直接启动浏览器小助手
    if (raw && raw.agent_goal && userId && prisma) {
      try {
        const started = await startStandaloneBrowserExecution({ goal: raw.agent_goal, userId, prisma });
        if (started.status === "started") {
          return {
            reply: "好，我让浏览器小助手去帮你办这件事，过程和结果马上回到这里～",
            extracted: null,
            agentGoal: raw.agent_goal,
            agent: { executionId: started.executionId, status: "running" },
            source: "fallback"
          };
        }
        return {
          reply: `好，这件事我可以派小助手去网页上办，不过${started.reason}，先帮你记在这里？`,
          extracted: null,
          agentGoal: raw.agent_goal,
          agent: null,
          source: "fallback"
        };
      } catch (startErr) {
        console.warn("[flowChat] 兜底启动小助手失败:", startErr?.message || startErr);
        return {
          reply: "好，这件事我可以派小助手去网页上办，不过它刚才没出发成功，稍后再跟我说一次好吗？",
          extracted: null,
          agent: null,
          source: "fallback"
        };
      }
    }

    // Kimi 不在线但用户想要规划：兜底模板直接给一份保守计划，确认即可落库
    if (PLAN_INTENT_RE.test(lastUser?.content || "")) {
      const planned = buildFallbackPlan({ goal: extractPlanGoal(lastUser.content) });
      return {
        reply: `AI 暂时有点累，我先用保守模板帮你排了「${planned.parent.title}」：共 ${planned.children.length} 条子约定，今晚 19:30 起每天一条。点确认就生成；想要更贴合你的排期，晚点跟我说「重新规划」。`,
        extracted: {
          type: "plan",
          plan_request: { goal: planned.parent.title, horizon_days: 7, daily_minutes: 30, preferences: null },
          plan: { parent: planned.parent, children: planned.children, source: "fallback" }
        },
        source: "fallback"
      };
    }

    // 规划上下文中的定向调整：即使对话模型超时/没听懂，本地也直接接管，保证随机应变
    if (lastExtracted?.type === "plan" && Array.isArray(lastExtracted.plan?.patterns) && lastExtracted.plan.patterns.length > 0) {
      const textAdj = extractAdjustmentsFromText(lastUser?.content || "");
      if (textAdj?.length) {
        const patched = applyPlanAdjustments(lastExtracted.plan.patterns, textAdj);
        if (patched.applied.length > 0) {
          const budget = Math.max(lastExtracted.plan_request?.daily_minutes || 30, requiredBudget(patched.patterns));
          const re = reexpandPlan(patched.patterns, {
            goal: lastExtracted.plan_request?.goal || "智能规划",
            horizonDays: lastExtracted.plan_request?.horizon_days || 7,
            dailyMinutes: budget,
            preferences: lastExtracted.plan_request?.preferences,
            baseDailyMinutes: budget
          });
          if (re) {
            return {
              reply: `好的，已替你更新：${patched.applied.slice(0, 4).join("；")}${patched.missed.length > 0 ? `；没匹配到「${patched.missed.map((m2) => m2.target).join("、")}」` : ""}～`,
              extracted: {
                type: "plan",
                plan_request: { ...lastExtracted.plan_request, adjustments: null },
                plan: { parent: re.parent, children: re.children, patterns: patched.patterns, source: "ai" }
              },
              source: "fallback"
            };
          }
        }
      }
      // 正在调整规划但语义没匹配上：给上下文提示，而不是泛泛的"我在听"
      return {
        reply: "我在听～我们正在调整你的规划，可以直接说具体修改，比如「周末加到一小时」「把跑步换成游泳」「改到晚上八点半」；或者说「重新规划」让我整体重排一份。",
        extracted: null,
        source: "fallback"
      };
    }

    // Kimi 失败但语义是规划调整且规划已确认过：从库里活跃规划重建模板再应用
    if (userId && prisma) {
      const dbAdj = await tryDbPlanAdjustment({ userId, prisma, text: lastUser?.content || "" });
      if (dbAdj) {
        return { reply: dbAdj.reply, extracted: dbAdj.extracted, source: "fallback" };
      }
    }

    const extracted = raw && raw !== "__reject__" ? sanitizeExtracted(raw) : null;
    return {
      reply: fallbackReply(lastUser?.content, raw === "__reject__" ? "__reject__" : extracted, lastExtracted),
      extracted,
      source: "fallback"
    };
  }
}
