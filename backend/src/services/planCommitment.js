import { invokeKimiText } from "../lib/kimi.js";

// 智能约定规划：把「一类要做的事」（如"两周的健身计划"）落成母约定 + 逐日子约定。
// 架构：AI 只生成 2-5 个「日型模板」（工作日/周末/饮食等），服务端本地展开为逐日计划——
// AI 输出量降为 1/10（约 8s），参数调整（时段/天数/时长）可本地秒级重排，多轮对话体验友好。
// 仍兼容模型直接返回逐日 children 的旧形态；Kimi 失败走本地兜底模板，对话链路不中断。

const CATEGORIES = ["work", "personal", "health", "study", "family", "shopping", "finance", "checkin", "other"];
const PRIORITIES = ["high", "medium", "low"];

const DAY_MS = 86400000;
const MIN_SLOT_MS = 30 * 60000; // 今天第一条至少排在 now+30min，给创建/提醒链路留余量

// 北京时区日期/时刻（用户语境全部按 +08:00）
function chinaToday(offsetDays = 0) {
  const d = new Date(Date.now() + 8 * 3600 * 1000 + offsetDays * DAY_MS);
  return d.toISOString().slice(0, 10);
}

function chinaNowTime() {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(11, 16);
}

function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

function roundUp5(ms) {
  return Math.ceil(ms / 300000) * 300000;
}

function hm(ms) {
  return new Date(ms + 8 * 3600 * 1000).toISOString().slice(11, 16);
}

// 模型偶尔不照 schema 返回：解包常见包装形态，尽量抢救出内容
function unwrapPlan(raw) {
  if (!raw || typeof raw !== "object") return raw;
  if (raw.parent && (Array.isArray(raw.children) || Array.isArray(raw.patterns))) return raw;
  for (const key of ["plan", "result", "data", "schedule", "方案"]) {
    const inner = raw[key];
    if (inner && typeof inner === "object" && (inner.parent || Array.isArray(inner.children) || Array.isArray(inner.patterns))) return inner;
  }
  if (Array.isArray(raw)) return { parent: {}, children: raw };
  const vals = Object.values(raw);
  if (vals.length > 0 && vals.every((v) => Array.isArray(v))) {
    return { parent: {}, children: vals.flat() };
  }
  return raw;
}

function normalizeParent(parentRaw, ctx) {
  return {
    title: String(parentRaw.title || parentRaw.name || ctx.goal || "智能规划").trim().slice(0, 60) || "智能规划",
    description: String(parentRaw.description || `「${ctx.goal}」的智能约定规划：共 ${ctx.horizonDays} 天，每天约 ${ctx.dailyMinutes} 分钟。`).slice(0, 300),
    category: CATEGORIES.includes(parentRaw.category) ? parentRaw.category : "personal",
    priority: PRIORITIES.includes(parentRaw.priority) ? parentRaw.priority : "medium"
  };
}

function titleOf(item, descText) {
  return String(item.title || item.content || item.task || item.activity || item.summary || item.name || "").trim().slice(0, 60)
    || (descText ? descText.slice(0, 16) : "");
}

// ── 日型模板 ─────────────────────────────────────────────
// applies_to 支持：daily/每天/每日、weekday/工作日、weekend/周末、mon..sun/周一..周日（可逗号或空格分隔）
const WEEKDAY_TOKEN_MAP = {
  mon: 1, monday: 1, 周一: 1, 星期一: 1, tue: 2, tuesday: 2, 周二: 2, 星期二: 2,
  wed: 3, wednesday: 3, 周三: 3, 星期三: 3, thu: 4, thur: 4, thursday: 4, 周四: 4, 星期四: 4,
  fri: 5, friday: 5, 周五: 5, 星期五: 5, sat: 6, saturday: 6, 周六: 6, 星期六: 6,
  sun: 0, sunday: 0, 周日: 0, 星期日: 0, 周天: 0
};

function appliesToMatcher(appliesTo) {
  const text = String(appliesTo || "daily").toLowerCase();
  const tokens = text.split(/[,，、\s/|]+/).filter(Boolean);
  const days = new Set();
  let daily = false;
  let weekday = false;
  let weekend = false;
  for (const t of tokens) {
    if (["daily", "每天", "每日", "天天", "all"].includes(t)) daily = true;
    else if (["weekday", "工作日", "平时"].includes(t)) weekday = true;
    else if (["weekend", "周末", "休息日"].includes(t)) weekend = true;
    else if (WEEKDAY_TOKEN_MAP[t] !== undefined) days.add(WEEKDAY_TOKEN_MAP[t]);
  }
  return (dayOfWeek) => {
    if (daily) return true;
    if (days.has(dayOfWeek)) return true;
    if (weekday && dayOfWeek >= 1 && dayOfWeek <= 5) return true;
    if (weekend && (dayOfWeek === 0 || dayOfWeek === 6)) return true;
    return days.size === 0 && !weekday && !weekend; // 完全没识别出时按每天
  };
}

// 「每周+10分钟」「每周递增5分钟」→ 10
function parseWeeklyProgression(text) {
  const m = /每\s*周[^0-9]{0,6}\+?\s*(\d{1,3})\s*分钟/.exec(String(text || ""));
  return m ? Number(m[1]) : 0;
}

function normalizePatterns(raw, ctx) {
  const list = Array.isArray(raw) ? raw : [];
  const patterns = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const descText = String(item.description || "").trim();
    const title = titleOf(item, descText);
    const startTime = String(item.start_time || item.time || item.start || "").trim();
    if (!title || !TIME_RE.test(startTime)) continue;
    patterns.push({
      plan_group: String(item.plan_group || item.group || "").trim().replace(/\s+/g, "").slice(0, 12) || "每日安排",
      kind: item.kind === "checkin" ? "checkin" : "task",
      applies_to: String(item.applies_to || item.days || item.day_type || "daily").trim().slice(0, 40),
      start_time: startTime,
      duration_minutes: clampInt(item.duration_minutes ?? item.duration ?? item.minutes, 10, 240, 30),
      title,
      description: descText.slice(0, 300) || null,
      note: String(item.note || "").trim().slice(0, 120) || null,
      weekly_progression: String(item.weekly_progression || item.progression || "").trim().slice(0, 60)
    });
    if (patterns.length >= 6) break;
  }
  return patterns;
}

// 日型模板 → 逐日子约定。预算/今日顺延/每周进阶都在本地完成。
export function expandPatterns(patterns, ctx) {
  const { horizonDays, dailyMinutes } = ctx;
  const today = chinaToday();
  const minStartMs = Date.now() + MIN_SLOT_MS;
  const matchers = patterns.map((p) => ({ p, match: appliesToMatcher(p.applies_to), step: parseWeeklyProgression(p.weekly_progression) }));
  const children = [];

  for (let i = 0; i < horizonDays; i += 1) {
    if (horizonDays > 6 && (i + 1) % 7 === 0) continue; // 每第 7 天留白缓冲/复盘
    const date = chinaToday(i);
    const dayOfWeek = new Date(`${date}T00:00:00+08:00`).getUTCDay();
    const weekIndex = Math.floor(i / 7);
    const dayItems = matchers
      .filter(({ match }) => match(dayOfWeek))
      .map(({ p, step }) => ({ p, step }))
      .sort((a, b) => a.p.start_time.localeCompare(b.p.start_time));

    let used = 0;
    let cursorMs = 0; // 同一天多条时保持先后次序与 10 分钟间隔（今天顺延后会用到）
    for (const { p, step } of dayItems) {
      if (children.filter((c) => c.date === date).length >= 3) break; // 同一天最多 3 条
      let startMs = new Date(`${date}T${p.start_time}:00+08:00`).getTime();
      if (date === today && startMs < minStartMs) startMs = roundUp5(minStartMs);
      if (startMs < cursorMs) startMs = cursorMs; // 今日顺延/偏好平移后避免条目标注重叠
      const room = dailyMinutes - used;
      if (room < 10) break;
      const duration = clampInt(p.duration_minutes + step * weekIndex, 10, Math.min(240, room), Math.min(60, room));
      const finalDuration = Math.min(duration, room);
      used += finalDuration;
      cursorMs = startMs + finalDuration * 60000 + 10 * 60000;
      children.push({
        title: p.title,
        description: p.description,
        date,
        start_time: hm(startMs),
        end_time: hm(startMs + finalDuration * 60000),
        duration_minutes: finalDuration,
        note: p.note,
        kind: p.kind,
        plan_group: p.plan_group
      });
    }
  }
  if (children.length === 0) return null;
  children.sort((a, b) => `${a.date}T${a.start_time}`.localeCompare(`${b.date}T${b.start_time}`));
  return { parent: null, children };
}

// 旧形态兼容：模型直接返回逐日 children（归一化逻辑与日型展开同口径）
function normalizePlan(raw, ctx) {
  if (!raw || typeof raw !== "object") return null;
  raw = unwrapPlan(raw);
  const parent = normalizeParent(raw.parent && typeof raw.parent === "object" ? raw.parent : {}, ctx);
  const today = chinaToday();
  const horizonEnd = chinaToday(ctx.horizonDays - 1);
  const minStartMs = Date.now() + MIN_SLOT_MS;
  const perDay = new Map();

  const children = [];
  for (const item of Array.isArray(raw.children) ? raw.children : []) {
    if (!item || typeof item !== "object") continue;
    const descText = String(item.description || "").trim();
    const title = titleOf(item, descText);
    const date = String(item.date || item.day || "").trim();
    const startTime = String(item.start_time || item.time || item.start || "").trim();
    if (!title || !DATE_RE.test(date) || date < today || date > horizonEnd) continue;
    if (!TIME_RE.test(startTime)) continue;

    let startMs = new Date(`${date}T${startTime}:00+08:00`).getTime();
    if (date === today && startMs < minStartMs) startMs = roundUp5(minStartMs);
    const duration = clampInt(item.duration_minutes ?? item.duration ?? item.minutes, 10, 240, Math.min(60, ctx.dailyMinutes));
    const dayUsed = perDay.get(date) || 0;
    const room = ctx.dailyMinutes - dayUsed;
    if (room < 10) continue;
    const finalDuration = Math.min(duration, room);
    perDay.set(date, dayUsed + finalDuration);

    const kind = item.kind === "checkin" ? "checkin" : "task";
    const planGroup = String(item.plan_group || "").trim().replace(/\s+/g, "").slice(0, 12) || "每日安排";
    children.push({
      title,
      description: descText.slice(0, 300) || null,
      date,
      start_time: hm(startMs),
      end_time: hm(startMs + finalDuration * 60000),
      duration_minutes: finalDuration,
      note: String(item.note || "").trim().slice(0, 120) || null,
      kind,
      plan_group: planGroup
    });
    if (children.length >= ctx.horizonDays * 4) break;
  }

  if (children.length === 0) return null;
  children.sort((a, b) => `${a.date}T${a.start_time}`.localeCompare(`${b.date}T${b.start_time}`));
  return { parent, children };
}

// 本地兜底：Kimi 不可用时按通用模板排期。时刻优先取用户历史活跃时段（逐日轮换），其次 19:30
function slotFromInsights(insights, i) {
  const windows = Array.isArray(insights?.activeWindows) ? insights.activeWindows : [];
  const m = windows.length ? /^(\d{1,2}):00/.exec(windows[i % windows.length]) : null;
  const hour = m ? Math.min(22, Math.max(7, Number(m[1]))) : 19;
  return `${String(hour).padStart(2, "0")}:30`;
}

export function buildFallbackPlan({ goal, horizonDays, dailyMinutes, insights = null, now = new Date() } = {}) {
  const g = String(goal || "新的计划").trim().slice(0, 40) || "新的计划";
  const days = clampInt(horizonDays, 2, 30, 7);
  const minutes = clampInt(dailyMinutes, 15, 180, 30);
  const parent = {
    title: `${g}（${days}天计划）`.slice(0, 60),
    description: `「${g}」的${days}天智能规划：每天约 ${minutes} 分钟，由兜底模板生成，可继续提偏好让我重排。`.slice(0, 300),
    category: "personal",
    priority: "medium"
  };
  const children = [];
  const minStartMs = roundUp5(now.getTime() + MIN_SLOT_MS);
  for (let i = 0; i < days; i += 1) {
    if (days > 6 && (i + 1) % 7 === 0) continue; // 每第 7 天留白缓冲
    const date = chinaToday(i);
    let startMs = new Date(`${date}T${slotFromInsights(insights, i)}:00+08:00`).getTime();
    if (i === 0 && startMs < minStartMs) startMs = minStartMs;
    children.push({
      title: `${g} · 第${i + 1}天`,
      description: `第 ${i + 1} 天 / 共 ${days} 天，建议 ${minutes} 分钟`.slice(0, 300),
      date,
      start_time: hm(startMs),
      end_time: hm(startMs + minutes * 60000),
      duration_minutes: minutes,
      note: null,
      kind: "task",
      plan_group: "每日安排"
    });
  }
  return { parent, children };
}

// 偏好 → 目标时刻（多轮对话里"改成早上"这类调整的本地秒级应用）
function targetHourFromPreferences(preferences, insights) {
  const text = String(preferences || "");
  const windows = Array.isArray(insights?.activeWindows) ? insights.activeWindows : [];
  const firstWindowHour = (() => { const m = /^(\d{1,2}):00/.exec(windows[0] || ""); return m ? Number(m[1]) : null; })();
  if (/早上|早晨|上午|早/.test(text)) {
    const morning = windows.find((w) => Number(/^(\d{1,2}):00/.exec(w)[1]) < 12);
    const m = morning ? /^(\d{1,2}):00/.exec(morning) : null;
    return m ? Number(m[1]) : 7;
  }
  if (/睡前|夜里|晚上|晚间|晚/.test(text)) return firstWindowHour !== null && firstWindowHour >= 18 ? firstWindowHour : 19;
  if (/下午|午后/.test(text)) return 15;
  if (/中午|午间/.test(text)) return 12;
  return null;
}

// 参数级调整（时段/天数/时长）本地重排：不调用 AI，秒级返回
export function reexpandPlan(patterns, { goal, horizonDays, dailyMinutes, preferences, insights = null, baseDailyMinutes } = {}) {
  if (!Array.isArray(patterns) || patterns.length === 0) return null;
  const ctx = {
    goal: String(goal || "智能规划").slice(0, 60),
    horizonDays: clampInt(horizonDays, 2, 30, 7),
    dailyMinutes: clampInt(dailyMinutes, 15, 180, 30)
  };
  const targetHour = targetHourFromPreferences(preferences, insights);
  const scale = baseDailyMinutes ? ctx.dailyMinutes / clampInt(baseDailyMinutes, 15, 180, ctx.dailyMinutes) : 1;
  const adjusted = patterns.map((p) => {
    const next = { ...p };
    if (targetHour !== null) {
      const [h, m] = String(p.start_time).split(":").map(Number);
      const shifted = Math.min(22, Math.max(7, targetHour + (h % 2))); // 保留原先后移的错落感
      next.start_time = `${String(shifted).padStart(2, "0")}:${String(m || 0).padStart(2, "0")}`;
    }
    if (scale !== 1) {
      next.duration_minutes = clampInt(Math.round(p.duration_minutes * scale), 10, 240, p.duration_minutes);
    }
    return next;
  });
  const expanded = expandPatterns(adjusted, ctx);
  if (!expanded) return null;
  return { parent: normalizeParent({}, ctx), children: expanded.children };
}

export async function planCommitmentWithKimi({ goal, horizonDays, dailyMinutes, preferences, existing = [], insights = null, now = new Date() } = {}) {
  const ctx = {
    goal: String(goal || "").trim().slice(0, 80),
    horizonDays: clampInt(horizonDays, 2, 30, 7),
    dailyMinutes: clampInt(dailyMinutes, 15, 180, 30)
  };
  if (!ctx.goal) {
    return { ...buildFallbackPlan({ goal: "新的计划", ...ctx, insights, now }), source: "fallback" };
  }

  const today = chinaToday();
  const schema = {
    type: "object",
    properties: {
      parent: {
        type: "object",
        properties: {
          title: { type: "string", description: "母约定标题，≤20字，不含天数" },
          description: { type: "string", description: "一句话说明目标与节奏，≤40字" },
          category: { type: "string", enum: CATEGORIES },
          priority: { type: "string", enum: PRIORITIES }
        },
        required: ["title", "description"]
      },
      patterns: {
        type: "array",
        description: "日型模板 2-5 条：把计划按内容归类（如工作日训练/周末强化/饮食配合），同类项共用一个模板，不要逐日展开",
        items: {
          type: "object",
          properties: {
            plan_group: { type: "string", description: "分组名，≤8字，如「日常训练」「周末强化」「饮食配合」" },
            kind: { type: "string", enum: ["checkin", "task"], description: "checkin=每日坚持做完要打卡的项；task=普通定时项（默认）" },
            applies_to: { type: "string", description: "适用日：daily / weekday / weekend / mon..sun / 周一..周日，可逗号组合" },
            start_time: { type: "string", description: "HH:MM，24小时制，避开 23:00-7:00，贴合用户活跃时段" },
            duration_minutes: { type: "number", description: "单次时长，10-240" },
            title: { type: "string", description: "≤16字，内容要点，如「慢跑+拉伸」" },
            description: { type: "string", description: "可执行动作+量化标准，≤30字，如「慢跑3公里，前后拉伸各5分钟」" },
            note: { type: "string", description: "可选，执行小提示，≤20字" },
            weekly_progression: { type: "string", description: "可选，每周进阶，如「每周+5分钟」或「第2周加速」" }
          },
          required: ["plan_group", "applies_to", "start_time", "duration_minutes", "title"]
        }
      }
    },
    required: ["parent", "patterns"]
  };

  const busyBlocks = Array.isArray(existing) ? existing.slice(0, 40) : [];
  // 个性化信号压成一行一条的短句：prompt 越长模型推理越深，实测短 prompt 5s 可出完整模板
  const bits = [];
  if (Array.isArray(insights?.activeWindows) && insights.activeWindows.length > 0) {
    bits.push(`活跃时段参考：${insights.activeWindows.join("、")}`);
  }
  if (insights?.subtaskDoneRate30d !== null && insights?.subtaskDoneRate30d !== undefined) {
    bits.push(`近30天完成率 ${Math.round(insights.subtaskDoneRate30d * 100)}%${insights.subtaskDoneRate30d < 0.5 ? "（偏低，首周请减量起步）" : ""}`);
  }
  if (Array.isArray(insights?.existingCheckins) && insights.existingCheckins.length > 0) {
    bits.push(`已有打卡约定：${insights.existingCheckins.map((c) => (c.hour !== null && c.hour !== undefined ? `${c.title}(${c.hour}点)` : c.title)).join("、")}（内容重合请避开其时刻）`);
  }
  if (busyBlocks.length > 0) {
    bits.push(`已有安排（避开这些时段）：${JSON.stringify(busyBlocks).slice(0, 300)}`);
  }
  const prompt = `用户想规划：「${ctx.goal}」，共 ${ctx.horizonDays} 天（自 ${today} 起），每天累计约 ${ctx.dailyMinutes} 分钟。偏好：${String(preferences || "无").slice(0, 100)}
${bits.join("\n")}
不要逐日展开，只输出「日型模板」patterns（2-5 条，如工作日训练/周末强化/饮食配合），每条含：plan_group（组名≤8字）、kind（每日坚持做完要打卡的项填 checkin，其余 task）、applies_to（weekday/weekend/daily/周一..周日，可逗号组合）、start_time（HH:MM，避开 23:00-7:00，今天的时刻须晚于 ${chinaNowTime()}）、duration_minutes、title（≤16字）、description（≤30字，含量化标准如「慢跑3公里」）、note（可选≤20字）、weekly_progression（可选，写「每周+N分钟」形式）。每满 7 天留 1 天缓冲不用排。直接输出 JSON。`;

  let lastErr = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const { data, usage } = await Promise.race([
        invokeKimiText({
          prompt,
          systemPrompt: "你是约定规划师。把长期目标拆成母约定 + 2-5 个日型模板。只输出 JSON，不要长篇思考。",
          responseJsonSchema: schema,
          model: "kimi-k2.7-code-highspeed",
          maxTokens: 8000,
          fetchTimeout: 60000,
          withUsage: true
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("PLAN_TIMEOUT")), 60000))
      ]);

      // 主路径：日型模板 → 本地展开
      if (data && typeof data === "object") {
        const unwrapped = unwrapPlan(data);
        const rawPatterns = Array.isArray(data.patterns) ? data.patterns
          : Array.isArray(unwrapped?.patterns) ? unwrapped.patterns : null;
        if (rawPatterns) {
          const parent = normalizeParent(unwrapped.parent && typeof unwrapped.parent === "object" ? unwrapped.parent : {}, ctx);
          const patterns = normalizePatterns(rawPatterns, ctx);
          const expanded = expandPatterns(patterns, ctx);
          if (expanded) return { parent, children: expanded.children, patterns, usage };
        }
        // 兼容路径：模型直接给了逐日 children
        const legacy = normalizePlan(data, ctx);
        if (legacy) return { ...legacy, patterns: null, usage };
      }
      lastErr = new Error("模型返回缺少可用模板");
    } catch (err) {
      lastErr = err;
      console.warn(`[planCommitment] 第 ${attempt} 次规划失败:`, err?.message || err);
    }
  }
  console.warn("[planCommitment] 规划失败，使用兜底模板:", lastErr?.message || lastErr);
  return { ...buildFallbackPlan({ ...ctx, insights, now }), source: "fallback", patterns: null };
}
