import { invokeKimiText } from "../lib/kimi.js";
import { renderInsightsForPrompt } from "./planInsights.js";

// 智能约定规划：把「一类要做的事」（如"一周的英语学习"）落成
// 母约定 + 每天具体执行/提醒时刻的子约定。
// 只产出未来时刻（今天从当前时间+30分钟起排），由 /api/chat 的 plan 意图调用。
// Kimi 失败或超时返回本地兜底计划，保证对话链路不中断。

const CATEGORIES = ["work", "personal", "health", "study", "family", "shopping", "finance", "checkin", "other"];
const PRIORITIES = ["high", "medium", "low"];

const DAY_MS = 86400000;
const MIN_SLOT_MS = 30 * 60000; // 今天第一条至少排在 now+30min，给创建/提醒链路留余量

function pad(n) {
  return String(n).padStart(2, "0");
}

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

// 模型偶尔不照 schema 返回：解包常见包装形态，尽量抢救出 parent/children
function unwrapPlan(raw) {
  if (!raw || typeof raw !== "object") return raw;
  if (raw.parent && Array.isArray(raw.children)) return raw;
  for (const key of ["plan", "result", "data", "schedule", "方案"]) {
    const inner = raw[key];
    if (inner && typeof inner === "object" && (inner.parent || Array.isArray(inner.children))) return inner;
  }
  if (Array.isArray(raw)) return { parent: {}, children: raw };
  const vals = Object.values(raw);
  if (vals.length > 0 && vals.every((v) => Array.isArray(v))) {
    return { parent: {}, children: vals.flat() };
  }
  return raw;
}

function normalizePlan(raw, ctx) {
  const { goal, horizonDays, dailyMinutes } = ctx;
  if (!raw || typeof raw !== "object") return null;
  raw = unwrapPlan(raw);

  const parentRaw = raw.parent && typeof raw.parent === "object" ? raw.parent : {};
  const parent = {
    title: String(parentRaw.title || goal || "智能规划").trim().slice(0, 60) || "智能规划",
    description: String(parentRaw.description || `「${goal}」的智能约定规划：共 ${horizonDays} 天，每天约 ${dailyMinutes} 分钟。`).slice(0, 300),
    category: CATEGORIES.includes(parentRaw.category) ? parentRaw.category : "personal",
    priority: PRIORITIES.includes(parentRaw.priority) ? parentRaw.priority : "medium"
  };

  const today = chinaToday();
  const horizonEnd = chinaToday(horizonDays - 1);
  const minStartMs = Date.now() + MIN_SLOT_MS;
  const perDay = new Map(); // date -> 累计分钟

  const children = [];
  for (const item of Array.isArray(raw.children) ? raw.children : []) {
    if (!item || typeof item !== "object") continue;
    const title = String(item.title || item.content || "").trim().slice(0, 60);
    const date = String(item.date || item.day || "").trim();
    const startTime = String(item.start_time || item.time || item.start || "").trim();
    if (!title || !DATE_RE.test(date) || date < today || date > horizonEnd) continue;
    if (!TIME_RE.test(startTime)) continue;

    let startMs = new Date(`${date}T${startTime}:00+08:00`).getTime();
    // 今天已过的时刻顺延到 now+30min（对齐 5 分钟），其它日期不动
    if (date === today && startMs < minStartMs) startMs = roundUp5(minStartMs);
    const duration = clampInt(item.duration_minutes ?? item.duration ?? item.minutes, 10, 240, Math.min(60, dailyMinutes));
    const dayUsed = perDay.get(date) || 0;
    // 单日总量超出预算：压缩本条时长，实在放不下就丢弃
    const room = dailyMinutes - dayUsed;
    if (room < 10) continue;
    const finalDuration = Math.min(duration, room);
    perDay.set(date, dayUsed + finalDuration);

    const startD = new Date(startMs + 8 * 3600 * 1000);
    const start = startD.toISOString().slice(11, 16);
    const end = new Date(startMs + finalDuration * 60000 + 8 * 3600 * 1000).toISOString().slice(11, 16);
    const kind = item.kind === "checkin" ? "checkin" : "task";
    const planGroup = String(item.plan_group || "").trim().replace(/\s+/g, "").slice(0, 12) || "每日安排";
    children.push({
      title,
      description: String(item.description || "").trim().slice(0, 300) || null,
      date,
      start_time: start,
      end_time: end,
      duration_minutes: finalDuration,
      note: String(item.note || "").trim().slice(0, 120) || null,
      kind,
      plan_group: planGroup
    });
    if (children.length >= horizonDays * 4) break;
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
    const start = new Date(startMs + 8 * 3600 * 1000).toISOString().slice(11, 16);
    const end = new Date(startMs + minutes * 60000 + 8 * 3600 * 1000).toISOString().slice(11, 16);
    children.push({
      title: `${g} · 第${i + 1}天`,
      description: `第 ${i + 1} 天 / 共 ${days} 天，建议 ${minutes} 分钟`.slice(0, 300),
      date,
      start_time: start,
      end_time: end,
      duration_minutes: minutes,
      note: null,
      kind: "task",
      plan_group: "每日安排"
    });
  }
  return { parent, children };
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
          description: { type: "string", description: "一两句话说明这个规划的目标与节奏" },
          category: { type: "string", enum: CATEGORIES },
          priority: { type: "string", enum: PRIORITIES }
        },
        required: ["title", "description", "category", "priority"]
      },
      children: {
        type: "array",
        description: `子约定清单：覆盖 ${today} 起共 ${ctx.horizonDays} 天，每天1-3条，总条数≤${ctx.horizonDays * 3}；复合计划须按内容分组（plan_group）并标注条目类型（kind）`,
        items: {
          type: "object",
          properties: {
            title: { type: "string", description: "≤20字，含当天内容要点，如「背单词 40 个」" },
            description: { type: "string", description: "这一条具体做什么" },
            date: { type: "string", description: `YYYY-MM-DD，范围 ${today} ~ ${chinaToday(ctx.horizonDays - 1)}` },
            start_time: { type: "string", description: "HH:MM，24小时制" },
            duration_minutes: { type: "number", description: `10-240，当天累计≤${ctx.dailyMinutes}分钟` },
            note: { type: "string", description: "可选，执行小提示" },
            kind: { type: "string", enum: ["checkin", "task"], description: "checkin=每日坚持、做完要打卡留痕的项（如跑步/练琴）；task=普通定时项（默认）" },
            plan_group: { type: "string", description: "内容分组名，≤8字，如「日常训练」「周末强化」「饮食配合」；同类项同组" }
          },
          required: ["title", "date", "start_time", "duration_minutes"]
        }
      }
    },
    required: ["parent", "children"]
  };

  const busyBlocks = Array.isArray(existing) ? existing.slice(0, 40) : [];
  const insightsText = renderInsightsForPrompt(insights);
  const prompt = `用户想规划一件事：「${ctx.goal}」
规划参数：共 ${ctx.horizonDays} 天（从 ${today} 算起），每天累计约 ${ctx.dailyMinutes} 分钟。
用户偏好：${String(preferences || "无额外偏好").slice(0, 200)}
${busyBlocks.length ? `用户已有安排（避开这些时段）：\n${JSON.stringify(busyBlocks)}` : "用户当前无已知占用。"}
${insightsText ? `用户个性化参考（来自其历史数据，仅作排期参考，用户明确偏好永远优先）：\n${insightsText}\n` : ""}
请生成母约定和逐日子约定。硬性要求：
1. 今天是中国时间 ${today} ${chinaNowTime()}，今天的条目必须晚于当前时间至少 30 分钟；其它日期避开 23:00-7:00。
2. 每天累计不超过 ${ctx.dailyMinutes} 分钟；条目之间留至少 10 分钟间隔；同一天最多 3 条。
3. 内容按天递进（由易到难/由概到细），每满 7 天至少留 1 天缓冲或复盘，不要把缓冲日排满。
4. 时刻尽量贴合生活习惯（学习类优先上午或晚间，健身类避开饭后立即）。
5. 计划包含多类内容时必须分组（plan_group）：如健身计划分「日常训练」「周末强化」「饮食配合」，备考计划分「每日刷题」「周末模考」「错题复盘」；同一组共用一个简洁组名（≤8字），不要逐条变化。每天要坚持做完并打卡留痕的项标 kind=checkin（如每日跑步/每日背单词）；一次性大项、准备工作、周末加练等用 task（默认）。饮食类条目排进餐点时刻；纯指导性文字（食谱/注意事项）写进该条 description 或 note，不要单独占条。
6. 每条 description 必须写清可执行动作与量化标准（如「慢跑 3 公里或 30 分钟，前后各 5 分钟拉伸」），拒绝空话；description 控制在 40 字内、note 控制在 20 字内，不要输出 JSON 之外的任何解释文字，以免超长被截断。优先把每日项排在用户历史活跃时段内，活跃时段与偏好冲突时以偏好为准。
7. 若用户近30天完成率低于 50%：首周总量减半起步、间隔日安排，给习惯养成留余地；若规划窗口内某天的已有占用接近或超过每天预算，当天减量或只排 1 条。若用户已有内容重合的打卡约定，排期避开其提醒时刻，并在相关条目的 note 里提示「可与《约定名》一起打卡」。
8. 严格返回 JSON。`;

  try {
      const { data, usage } = await Promise.race([
      invokeKimiText({
        prompt,
        systemPrompt: "你是 SoulSentry 的约定规划师。把用户的一类长期目标拆成母约定 + 每天具体时刻的子约定。只输出符合 schema 的 JSON，不要输出其他内容；不要做长篇推理思考，直接给出排期结果。",
        responseJsonSchema: schema,
        maxTokens: 8000,
        fetchTimeout: 60000,
        withUsage: true
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("PLAN_TIMEOUT")), 75000))
    ]);
    const plan = normalizePlan(data, ctx);
    if (plan) return { ...plan, usage };
  } catch (err) {
    console.warn("[planCommitment] Kimi 规划失败，使用兜底模板:", err?.message || err);
  }
  return { ...buildFallbackPlan({ ...ctx, insights, now }), source: "fallback" };
}
