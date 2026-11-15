import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

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
