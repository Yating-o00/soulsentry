import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { invokeKimiText } from "../lib/kimi.js";

/**
 * 搭子（Buddy）L1 底座：
 * - 主档案（人格 persona、身份识别 id_profile）全局共享，领域档案（buddy_profiles[id]）相互隔离——
 *   学习搭子不需要知道你几点赖床。统一存 UserPreference.metadata._extraFields，无需 schema 变更。
 * - 认领 = 项目制绑定：写领域档案 + 按服务端模板创建项目约定（防篡改）；
 * - 毕业：项目走完，关系归档（约定保留），搭子回到货架可再次认领。
 */

export const buddiesRouter = Router();

const BUDDY_IDS = new Set(["study", "travel", "reading", "morning"]);

const claimSchema = z.object({
  answers: z
    .record(z.string().max(200))
    .refine((obj) => Object.keys(obj).length <= 10, { message: "answers too many" })
    .optional()
    .default({}),
  plan_title: z.string().trim().max(60).optional(),
  plan_lines: z.array(z.string().trim().max(120)).max(8).optional(),
});

function getExtra(pref) {
  const m = pref?.metadata;
  return m && typeof m === "object" && m._extraFields && typeof m._extraFields === "object"
    ? m._extraFields
    : {};
}

async function readExtraFields(userId) {
  const pref = await prisma.userPreference.findUnique({ where: { userId } });
  return { pref, extra: getExtra(pref) };
}

async function writeExtraFields(userId, pref, patch) {
  const base = pref?.metadata && typeof pref.metadata === "object" ? { ...pref.metadata } : {};
  const prev = base._extraFields && typeof base._extraFields === "object" ? base._extraFields : {};
  const metadata = { ...base, _extraFields: { ...prev, ...patch } };
  if (pref) {
    return prisma.userPreference.update({ where: { id: pref.id }, data: { metadata } });
  }
  return prisma.userPreference.create({ data: { userId, metadata } });
}

// 项目约定模板（认领即立项目）：标题与形态由服务端定型
function buildProjectTaskData(buddyId, answers = {}) {
  const a = (k, d = "") => String(answers[k] || d).slice(0, 60);
  switch (buddyId) {
    case "study":
      return {
        title: `每日学习打卡 · ${a("goal", "学习目标")}`,
        description: `学习搭子日课：${a("goal", "学习目标")}（${a("when", "3 个月内")}），每天 ${a("mins", "1 小时")}。跟不上时搭子会主动把计划调轻。`,
        category: "checkin",
        extra: { repeat_rule: "daily", buddy_id: "study" },
      };
    case "reading":
      return {
        title: `每日阅读 ${a("mins", "20 分钟")} · 《${a("book", "人类简史")}》`,
        description: `读书搭子日课：每天 ${a("mins", "20 分钟")}，读完一本再接下一本。读完搭子会抛一个问题，等你来「讲书」。`,
        category: "checkin",
        extra: { repeat_rule: "daily", buddy_id: "reading" },
      };
    case "morning":
      return {
        title: `早起打卡 · 目标 ${a("target", "7:00")}`,
        description: `早起搭子 21 天渐进计划：从「${a("current", "现在")}」渐进到 ${a("target", "7:00")}，起床后第一件事：${a("why", "晨读 / 学习")}。`,
        category: "checkin",
        extra: { repeat_rule: "daily", buddy_id: "morning" },
      };
    case "travel":
      return {
        title: `${a("dest", "下一趟旅行")} · 行前清单核对`,
        description: `旅游搭子：${a("dest", "目的地")}（${a("when", "时间待定")}），风格「${a("style", "躺平度假")}」。行前清单：身份证/护照、充电宝、防晒、薄外套、常用药、舒服的鞋——出发前一晚逐项核对。`,
        category: "personal",
        extra: { buddy_id: "travel" },
      };
    default:
      return null;
  }
}

buddiesRouter.use(requireAuth);

// GET /api/buddies/mine —— 主档案（人格/身份识别）+ 我的搭子（各领域档案）
buddiesRouter.get("/mine", async (req, res) => {
  const { extra } = await readExtraFields(req.user.id);
  return res.json({
    persona: extra.persona || "gentle",
    id_profile: extra.id_profile || null,
    buddies: extra.buddy_profiles && typeof extra.buddy_profiles === "object" ? extra.buddy_profiles : {},
  });
});

// POST /api/buddies/persona —— 人格引擎：切换后全平台语气立即生效（Agent 对话/搭子 greeting 按此渲染）
buddiesRouter.post("/persona", async (req, res) => {
  const persona = String(req.body?.persona || "");
  if (!["gentle", "strict", "buddy"].includes(persona)) {
    return res.status(400).json({ error: "INVALID_INPUT", message: "未知的人格类型" });
  }
  const { pref } = await readExtraFields(req.user.id);
  await writeExtraFields(req.user.id, pref, { persona });
  return res.json({ persona });
});

// POST /api/buddies/profile —— 注册身份识别写入主档案（人格 + 四步答卷），全局共享
buddiesRouter.post("/profile", async (req, res) => {
  const body = req.body || {};
  const patch = {};
  if (body.persona !== undefined) {
    const persona = String(body.persona || "");
    if (!["gentle", "strict", "buddy"].includes(persona)) {
      return res.status(400).json({ error: "INVALID_INPUT", message: "未知的人格类型" });
    }
    patch.persona = persona;
  }
  if (body.id_profile !== undefined) {
    const p = body.id_profile && typeof body.id_profile === "object" ? body.id_profile : {};
    patch.id_profile = {
      age: String(p.age || "").slice(0, 10) || null,
      likes: Array.isArray(p.likes) ? p.likes.map((s) => String(s).slice(0, 20)).slice(0, 10) : [],
      wants: Array.isArray(p.wants) ? p.wants.map((s) => String(s).slice(0, 40)).slice(0, 6) : [],
      answered_at: new Date().toISOString(),
    };
  }
  if (Object.keys(patch).length === 0) {
    return res.status(400).json({ error: "INVALID_INPUT", message: "没有需要写入的档案字段" });
  }
  const { pref } = await readExtraFields(req.user.id);
  await writeExtraFields(req.user.id, pref, patch);
  return res.json({ ok: true, ...patch });
});

// POST /api/buddies/:id/claim —— 认领：写领域档案 + 创建项目约定（项目制绑定）
buddiesRouter.post("/:id/claim", async (req, res) => {
  const buddyId = req.params.id;
  if (!BUDDY_IDS.has(buddyId)) {
    return res.status(404).json({ error: "NOT_FOUND", message: "这颗搭子还没有来到货架" });
  }
  const parsed = claimSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: parsed.error.flatten() });
  }

  const { pref, extra } = await readExtraFields(req.user.id);
  const profiles = extra.buddy_profiles && typeof extra.buddy_profiles === "object" ? { ...extra.buddy_profiles } : {};
  const existing = profiles[buddyId];
  if (existing && existing.status === "active") {
    return res.status(409).json({ error: "ALREADY_CLAIMED", message: "这颗搭子已经在陪你啦" });
  }

  const taskData = buildProjectTaskData(buddyId, parsed.data.answers);
  const task = await prisma.task.create({
    data: {
      userId: req.user.id,
      title: taskData.title,
      description: taskData.description,
      category: taskData.category,
      priority: "medium",
      metadata: { _extraFields: taskData.extra },
    },
  });

  profiles[buddyId] = {
    status: "active",
    answers: parsed.data.answers,
    plan_title: parsed.data.plan_title || null,
    plan_lines: Array.isArray(parsed.data.plan_lines) ? parsed.data.plan_lines : [],
    project_task_id: task.id,
    claimed_at: new Date().toISOString(),
    graduated_at: null,
  };
  await writeExtraFields(req.user.id, pref, { buddy_profiles: profiles });

  return res.status(201).json({ profile: profiles[buddyId], task_id: task.id });
});

// POST /api/buddies/:id/graduate —— 毕业：关系归档，约定保留，搭子回货架
buddiesRouter.post("/:id/graduate", async (req, res) => {
  const buddyId = req.params.id;
  if (!BUDDY_IDS.has(buddyId)) {
    return res.status(404).json({ error: "NOT_FOUND", message: "这颗搭子还没有来到货架" });
  }
  const { pref, extra } = await readExtraFields(req.user.id);
  const profiles = extra.buddy_profiles && typeof extra.buddy_profiles === "object" ? { ...extra.buddy_profiles } : {};
  const profile = profiles[buddyId];
  if (!profile || profile.status !== "active") {
    return res.status(409).json({ error: "NOT_ACTIVE", message: "这段陪伴还没有开始，或已经毕业" });
  }
  profiles[buddyId] = { ...profile, status: "graduated", graduated_at: new Date().toISOString() };
  await writeExtraFields(req.user.id, pref, { buddy_profiles: profiles });
  return res.json({ profile: profiles[buddyId] });
});


/* ---------- 板块状态持久化：每个搭子空间的模块数据（清单勾选/阅读分钟/行程/习惯链…） ---------- */

export const BUDDY_NAMES = { study: "学习搭子", travel: "旅游搭子", reading: "读书搭子", morning: "早起搭子" };

function isPlainObject(v) {
  return v && typeof v === "object" && !Array.isArray(v);
}

// 深合并：普通对象递归合并，数组与原始值直接覆盖（数组整体替换，避免并发勾选互相吞掉）
function deepMergeState(base, patch) {
  if (!isPlainObject(base) || !isPlainObject(patch)) return patch;
  const out = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    out[k] = isPlainObject(v) && isPlainObject(out[k]) ? deepMergeState(out[k], v) : v;
  }
  return out;
}

async function getActiveProfile(userId, buddyId) {
  const { pref, extra } = await readExtraFields(userId);
  const profiles = extra.buddy_profiles && typeof extra.buddy_profiles === "object" ? extra.buddy_profiles : {};
  const profile = profiles[buddyId];
  if (!profile || profile.status !== "active") return { pref, profiles, profile: null, extra };
  return { pref, profiles, profile, extra };
}

// POST /api/buddies/:id/state —— 合并写入本搭子的板块状态（领域档案隔离：只动本搭子的 state）
buddiesRouter.post("/:id/state", async (req, res) => {
  const buddyId = req.params.id;
  if (!BUDDY_IDS.has(buddyId)) {
    return res.status(404).json({ error: "NOT_FOUND", message: "这颗搭子还没有来到货架" });
  }
  const patch = req.body?.patch;
  if (!isPlainObject(patch)) {
    return res.status(400).json({ error: "INVALID_INPUT", message: "patch 必须是对象" });
  }
  if (JSON.stringify(patch).length > 60000) {
    return res.status(413).json({ error: "TOO_LARGE", message: "板块状态过大，请联系心栈" });
  }
  const { pref, profiles, profile } = await getActiveProfile(req.user.id, buddyId);
  if (!profile) {
    return res.status(409).json({ error: "NOT_ACTIVE", message: "这段陪伴还没有开始，或已经毕业" });
  }
  const state = deepMergeState(isPlainObject(profile.state) ? profile.state : {}, patch);
  profiles[buddyId] = { ...profile, state };
  await writeExtraFields(req.user.id, pref, { buddy_profiles: profiles });
  return res.json({ state });
});

/* ---------- 搭子 Agent：领域技能（引导式解题 / 弹性行程 / 周报小结 / 讲书回应） ---------- */

const PERSONA_TONES = {
  gentle: "温柔陪伴型——轻声细语，永远先接住情绪，不催促、不评判。",
  strict: "严格督学型——目标导向，语气温和但直接，盯进度也盯质量；用户未完成时帮他找原因而不是一味安慰。",
  buddy: "战友互卷型——像并肩作战的朋友，轻松幽默，可以互相卷也互相扛，多用「我们」「一起」。",
};

const agentSchema = z.object({
  mode: z.enum(["solve_locate", "solve_hint", "solve_quiz", "itinerary", "inspiration", "weekly", "talk", "chat", "greeting"]),
  payload: z.record(z.any()).optional().default({}),
});

// 每颗搭子的领域专业知识（注入 system prompt：同一底座，不同专业方向）
const BUDDY_EXPERTISE = {
  study:
    "你是学习科学与备考专家：擅长拆目标、间隔重复、费曼学习法、错题归因、考前节奏管理。给建议必须具体到「下一步做什么」，不讲空泛道理。",
  travel:
    "你是资深旅行策划师：擅长弹性行程、目的地攻略、避坑提示、预算与体力管理。给具体可执行的建议（时间、地点、怎么订、注意什么），不说正确的废话。",
  reading:
    "你是阅读方法专家，也是共读者：擅长选书建议、阅读节奏、讲书式提问、笔记沉淀。聊书时有自己的观点，能和用户真正讨论内容。",
  morning:
    "你是睡眠与作息科学专家：擅长渐进式早起、睡眠卫生、习惯链设计、破功后的温柔修复。懂生理节律，给的建议科学且可执行。",
};

function buildAgentPrompt(buddyId, mode, payload, personaTone, answers) {
  const buddyName = BUDDY_NAMES[buddyId] || "搭子";
  const profileLine =
    answers && Object.keys(answers).length > 0
      ? `关于这位用户，${buddyName}记住的领域档案：${Object.values(answers).join("；")}。`
      : "";
  const base = `你是心栈 SoulSentry 里的「${buddyName}」，人格：${personaTone}${profileLine}说话用简体中文，语气像朋友，不要列表式说教。`;

  switch (mode) {
    case "solve_locate": {
      const problem = String(payload.problem || "").slice(0, 2000);
      return {
        systemPrompt: `${base}你擅长引导式教学：绝不直接给答案，而是定位考点、分层提示。`,
        prompt: `用户拍来一道卡住的题：\n「${problem}」\n\n请做考点定位，只输出 JSON：{"subject":"科目","point":"具体考点（10字内）","ask":"一句引导提问，问用户是完全没思路还是做到一半卡住了（30字内）"}`,
      };
    }
    case "solve_hint": {
      const problem = String(payload.problem || "").slice(0, 2000);
      const level = Math.min(4, Math.max(1, Number(payload.level) || 1));
      const prev = Array.isArray(payload.prev_hints) ? payload.prev_hints.map((s) => String(s).slice(0, 200)).slice(0, 4) : [];
      const LEVEL_NAMES = { 1: "指个方向", 2: "给个抓手", 3: "近乎点破", 4: "完整解答" };
      return {
        systemPrompt: `${base}你擅长引导式教学：分层提示，L1 最含蓄、L4 是完整解答。绝不允许越级泄露后面的提示。`,
        prompt: `题目：「${problem}」\n${prev.length ? `已给过的提示：${prev.join(" / ")}\n` : ""}请给出第 L${level} 层提示（${LEVEL_NAMES[level]}），只输出 JSON：{"level":${level},"name":"${LEVEL_NAMES[level]}","content":"提示内容（80字内${level === 4 ? "，这层给出完整解题步骤和答案" : "，只引导不给出答案"}）"}`,
      };
    }
    case "solve_quiz": {
      const problem = String(payload.problem || "").slice(0, 2000);
      return {
        systemPrompt: `${base}用户刚自己做出一道题，你出一道变式题检验是否真懂。`,
        prompt: `原题：「${problem}」\n\n出一道同考点的变式选择题（比原题略简单），只输出 JSON：{"question":"题目","options":["A","B","C","D"],"answer":0,"explain":"一句话解析（40字内）"}，answer 是正确选项下标 0-3。`,
      };
    }
    case "itinerary": {
      const dest = String(payload.dest || "目的地").slice(0, 30);
      const style = String(payload.style || "躺平度假").slice(0, 20);
      const days = Math.min(9, Math.max(2, Number(payload.days) || 5));
      const note = String(payload.note || "").slice(0, 300);
      return {
        systemPrompt: `${base}你是弹性行程规划师：按用户风格排行程，每天最多 2-3 件事，留白 20%，标注坑点（高原/温差/预约门槛/体力强度）。当用户给出动态调整要求（时间变化、天气、人员状态、费用预算等）时，必须针对性重排：累了砍强度、下雨改室内、超预算换免费/低价方案、有老人小孩降步行量。所有安排必须与目的地「${dest}」严格匹配，绝不出现其他城市的景点。`,
        prompt: `为「${dest}」规划 ${days} 天弹性行程，旅行风格「${style}」。${note ? `\n动态调整要求（必须逐条体现）：${note}\n` : ""}只输出 JSON：{"days":[{"day":"D1","title":"当天主题（10字内）","note":"2-3 件安排 + 1 条坑点提示（60字内）"}]}`,
      };
    }
    case "inspiration": {
      const dest = String(payload.dest || "").slice(0, 30);
      return {
        systemPrompt: `${base}你是资深旅行策划师：只推荐目的地本地或当日往返可达的真实体验，给实操提示（最佳时间/预约方式/避坑）。严禁推荐与目的地无关的任何地点。`,
        prompt: `用户的目的地是「${dest || "云南大理"}」。推荐 6 个当地灵感（体验/美食/景点各约 2 个，全部必须在「${dest || "云南大理"}」本地或当日往返可达），只输出 JSON：{"ideas":[{"kind":"体验","name":"名称（12字内）","desc":"一句话实操提示（40字内，含最佳时间/预约/避坑）"}]}`,
      };
    }
    case "weekly": {
      const stats = String(payload.stats || "").slice(0, 800);
      return {
        systemPrompt: `${base}你在写本周复盘。低谷时先接住情绪再谈改进，高光时具体指出哪做对了。`,
        prompt: `用户本周的真实数据：${stats}\n\n写一段心栈小结 + 下周弹性计划，只输出 JSON：{"summary":"小结（100字内，第二人称，有温度）","strongest":"本周最强项（10字内）","weakest":"需要关注的点（10字内）","next_week":["下周建议1（20字内）","下周建议2","下周建议3"]}`,
      };
    }
    case "talk": {
      const book = String(payload.book || "最近读的书").slice(0, 40);
      const text = String(payload.text || "").slice(0, 600);
      return {
        systemPrompt: `${base}你们正在共读《${book}》。用户刚「讲书」——用自己的话讲了理解。讲出来才算读懂。`,
        prompt: `用户说：「${text}」\n\n只输出 JSON：{"reply":"对他这段讲述的回应：先具体肯定一个点，再轻轻推进一步（60字内）","question":"下一个值得想想的问题（30字内）"}`,
      };
    }
    case "greeting": {
      const context = String(payload.context || "").slice(0, 600);
      return {
        systemPrompt: `${base}${BUDDY_EXPERTISE[buddyId] || ""}`,
        prompt: `用户此刻的真实状态：${context}\n\n以${buddyName}的身份写一句今日开场白（60字内）：结合ta当下的真实状态，给一句具体、有专业含量的提醒或鼓励。不许用「今天也要加油」之类的套话，每次都要不一样。只输出 JSON：{"text":"..."}`,
      };
    }
    case "chat": {
      const context = String(payload.context || "").slice(0, 800);
      const history = Array.isArray(payload.messages)
        ? payload.messages
            .slice(-10)
            .map((m) => `${m.role === "user" ? "用户" : buddyName}：${String(m.content || "").slice(0, 500)}`)
            .join("\n")
        : "";
      return {
        systemPrompt: `${base}${BUDDY_EXPERTISE[buddyId] || ""}用户此刻的上下文：${context || "（暂无）"}`,
        prompt: `以下是用户与${buddyName}的最近对话：\n${history}\n\n以${buddyName}的身份回复最后一条用户消息（120字内）：像朋友一样说话，给最实在的专业指导；涉及行动就给具体下一步，涉及情绪先接住再引导。只输出 JSON：{"reply":"..."}`,
      };
    }
    default:
      return null;
  }
}

// POST /api/buddies/:id/agent —— 领域技能调用（人格 + 领域档案注入，服务端定型提示词防跑偏）
buddiesRouter.post("/:id/agent", async (req, res) => {
  const buddyId = req.params.id;
  if (!BUDDY_IDS.has(buddyId)) {
    return res.status(404).json({ error: "NOT_FOUND", message: "这颗搭子还没有来到货架" });
  }
  const parsed = agentSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: parsed.error.flatten() });
  }
  const { profiles, profile, extra } = await getActiveProfile(req.user.id, buddyId);
  if (!profile) {
    return res.status(409).json({ error: "NOT_ACTIVE", message: "这段陪伴还没有开始，或已经毕业" });
  }
  const personaTone = PERSONA_TONES[extra.persona] || PERSONA_TONES.gentle;
  const built = buildAgentPrompt(buddyId, parsed.data.mode, parsed.data.payload, personaTone, profile.answers);
  if (!built) {
    return res.status(400).json({ error: "INVALID_INPUT", message: "未知的技能模式" });
  }
  try {
    const data = await invokeKimiText({
      prompt: built.prompt,
      systemPrompt: built.systemPrompt,
      responseJsonSchema: true,
      maxTokens: 1500,
      fetchTimeout: 45000,
    });
    return res.json({ data });
  } catch (error) {
    console.error(`[buddies/agent] ${buddyId}/${parsed.data.mode} failed:`, error?.message || error);
    return res.status(502).json({ error: "AGENT_FAILED", message: "搭子走神了，再试一次" });
  }
});
