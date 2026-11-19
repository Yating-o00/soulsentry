import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { invokeKimiText, FAST_TEXT_MODELS } from "../lib/kimi.js";
import { readAttachmentText } from "../services/readAttachment.js";

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
        description: `旅游搭子：${a("dest", "目的地")}（${a("when", "时间待定")}），风格「${a("style", "躺平度假")}」。行前清单已逐项列为子约定，出发前一晚逐项核对。`,
        category: "personal",
        extra: { buddy_id: "travel" },
        // 清单直接落成子约定，而不是只写在描述里——用户才能在约定列表逐项勾选、不怕遗忘
        subtasks: [
          "身份证 / 护照",
          "充电宝 + 数据线",
          "防晒霜 SPF50+",
          "薄外套（早晚温差大）",
          "常用药（感冒 / 肠胃 / 创可贴）",
          "舒服的徒步鞋",
        ],
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

  // 认领时把固定清单逐项落成子约定（旅游搭子的行前清单）。
  // 失败不阻断认领：搭子空间打开清单时会按标题去重自动补齐。
  if (Array.isArray(taskData.subtasks) && taskData.subtasks.length > 0) {
    try {
      await Promise.all(
        taskData.subtasks.map((title) =>
          prisma.task.create({
            data: {
              userId: req.user.id,
              title,
              description: "行前清单 · 来自旅游搭子",
              category: "personal",
              priority: "medium",
              parentTaskId: task.id,
              metadata: {
                _extraFields: { buddy_id: buddyId, buddy_list_source: "travel_checklist" },
              },
            },
          })
        )
      );
    } catch (error) {
      console.warn("[buddies/claim] 清单子约定创建失败:", error?.message || error);
    }
  }

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
  const note = await createBuddySediment(req.user.id, buddyId, profile, "毕业沉淀").catch((error) => {
    console.warn("[buddies/graduate] 沉淀失败:", error?.message || error);
    return null;
  });
  profiles[buddyId] = {
    ...profile,
    status: "graduated",
    graduated_at: new Date().toISOString(),
    sediment_note_id: note?.id || null,
  };
  await writeExtraFields(req.user.id, pref, { buddy_profiles: profiles });
  return res.json({ profile: profiles[buddyId], note_id: note?.id || null });
});

// POST /api/buddies/:id/stop —— 取消陪伴：先把这段关系沉淀成一条按主题命名的心签，
// 再让搭子回货架；约定、心签、子约定全部保留，下次可以重新认领接着用。
buddiesRouter.post("/:id/stop", async (req, res) => {
  const buddyId = req.params.id;
  if (!BUDDY_IDS.has(buddyId)) {
    return res.status(404).json({ error: "NOT_FOUND", message: "这颗搭子还没有来到货架" });
  }
  const { pref, extra } = await readExtraFields(req.user.id);
  const profiles = extra.buddy_profiles && typeof extra.buddy_profiles === "object" ? { ...extra.buddy_profiles } : {};
  const profile = profiles[buddyId];
  if (!profile || profile.status !== "active") {
    return res.status(409).json({ error: "NOT_ACTIVE", message: "这段陪伴还没有开始，或已经收起" });
  }
  const note = await createBuddySediment(req.user.id, buddyId, profile, "取消陪伴沉淀").catch((error) => {
    console.warn("[buddies/stop] 沉淀失败:", error?.message || error);
    return null;
  });
  profiles[buddyId] = {
    ...profile,
    status: "graduated",
    graduated_at: new Date().toISOString(),
    stopped_at: new Date().toISOString(),
    sediment_note_id: note?.id || null,
  };
  await writeExtraFields(req.user.id, pref, { buddy_profiles: profiles });
  return res.json({ profile: profiles[buddyId], note_id: note?.id || null });
});


/* ---------- 板块状态持久化：每个搭子空间的模块数据（清单勾选/阅读分钟/行程/习惯链…） ---------- */

export const BUDDY_NAMES = { study: "学习搭子", travel: "旅游搭子", reading: "读书搭子", morning: "早起搭子" };

/**
 * 结束一段陪伴时，把这段关系的真实内容按主题沉淀成一条心签：
 * 项目约定进度、子约定完成情况、打卡次数、最近沉淀、下次接着做的事。
 * 约定/心签本身不删除；下次重新认领还能接着用。
 */
async function createBuddySediment(userId, buddyId, profile, scene) {
  const buddyName = BUDDY_NAMES[buddyId] || "搭子";
  const planTitle = profile?.plan_title ? String(profile.plan_title) : "";
  let projectTask = null;
  let childStats = null;
  let checkinTotal = 0;

  try {
    if (profile?.project_task_id) {
      projectTask = await prisma.task.findUnique({
        where: { id: profile.project_task_id },
        select: { id: true, title: true, status: true, category: true, progress: true },
      });
      if (projectTask) {
        const children = await prisma.task.findMany({
          where: { parentTaskId: projectTask.id, deletedAt: null },
          orderBy: { createdAt: "asc" },
          select: { title: true, status: true },
        });
        childStats = {
          total: children.length,
          done: children.filter((c) => c.status === "DONE").length,
          open: children
            .filter((c) => c.status !== "DONE" && c.status !== "ARCHIVED")
            .map((c) => c.title)
            .slice(0, 6),
        };
        if (projectTask.category === "checkin") {
          checkinTotal = await prisma.checkin.count({ where: { taskId: projectTask.id } });
        }
      }
    }
  } catch (error) {
    console.warn("[buddies/sediment] 项目统计失败:", error?.message || error);
  }

  let relatedNotes = [];
  try {
    const notes = await prisma.note.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { title: true, plainText: true, content: true, sourceType: true, metadata: true },
    });
    relatedNotes = notes
      .filter(
        (n) =>
          n.metadata?._extraFields?.source_buddy === buddyId ||
          (buddyId === "study" && n.sourceType === "buddy_solve") ||
          (buddyId === "reading" && n.sourceType === "buddy_reading")
      )
      .slice(0, 5);
  } catch (error) {
    console.warn("[buddies/sediment] 心签统计失败:", error?.message || error);
  }

  const days = profile?.claimed_at
    ? Math.max(1, Math.ceil((Date.now() - new Date(profile.claimed_at).getTime()) / 86400000))
    : null;
  const topic = planTitle || projectTask?.title || buddyName;
  const lines = [];
  lines.push(`这段${buddyName}的陪伴${days ? `持续了 ${days} 天` : ""}。`);
  if (projectTask) {
    lines.push(
      `项目约定「${projectTask.title}」当前${projectTask.status === "DONE" ? "已完成" : "仍在进行中"}${childStats?.total ? `，子约定 ${childStats.done}/${childStats.total} 条完成` : ""}。`
    );
  }
  if (checkinTotal > 0) lines.push(`累计打卡 ${checkinTotal} 次。`);
  if (Array.isArray(profile?.plan_lines) && profile.plan_lines.length > 0) {
    lines.push(`原来的陪伴计划：${profile.plan_lines.slice(0, 6).join("；")}`);
  }
  if (childStats?.open?.length > 0) {
    lines.push(`下次接着做：${childStats.open.map((t) => `「${t}」`).join("、")}。`);
  }
  if (relatedNotes.length > 0) {
    lines.push(
      `这段陪伴沉淀过 ${relatedNotes.length} 条心签：${relatedNotes
        .map((n) => `「${String(n.title || n.plainText || n.content || "").replace(/<[^>]+>/g, "").slice(0, 20)}」`)
        .join("、")}。`
    );
  }
  lines.push("约定和心签都保留着，随时可以重新认领这颗搭子，接着往下走。");

  const plainText = lines.join("\n");
  const escapeHtml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const content = lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("");
  const tags = ["搭子沉淀", buddyName, String(topic).slice(0, 20)].filter(Boolean);

  return prisma.note.create({
    data: {
      userId,
      title: `「${String(topic).slice(0, 40)}」陪伴小结`,
      content,
      plainText,
      // 用现有的「备忘」签类型承载陪伴小结；来源徽标由 metadata._extraFields 提供，
      // 这样心签的五类筛选、颜色与小程序口径都不用改
      sourceType: "memo",
      tags,
      metadata: {
        _extraFields: {
          source_buddy: buddyId,
          source_buddy_name: buddyName,
          source_scene: scene,
          source_task_title: projectTask?.title || null,
        },
      },
    },
  });
}

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

// 搭子对话里的「成立小组 / 拉伙伴一起做」意图：本地快速识别并给出可确认的协同小组提案，
// 不把这类明确诉求交给慢模型自由发挥，避免超时后落到通用兜底话术。
const GROUP_TOPICS = ["考公", "考研", "英语", "数学", "四六级", "雅思", "托福", "法考", "教资", "CPA", "高考", "中考", "编程", "健身", "减脂", "读书", "早起"];

function detectBuddyGroupIntent(text) {
  const t = String(text || "").trim();
  if (!t) return null;
  const wantsGroup =
    /(成立|创建|新建|组建|单独成立|开一个|建一个|拉一个|组一个)/.test(t) &&
    /(小组|群|搭子|队伍|协同)/.test(t) &&
    /(想|希望|要|准备|帮我|给我|打算|计划|一个)/.test(t);
  const wantsPartners =
    /(小组|群|搭子|队伍)/.test(t) &&
    /(伙伴|朋友|同学|同事)/.test(t) &&
    /(参与|加入|一起|更多)/.test(t);
  if (!wantsGroup && !wantsPartners) return null;

  let subject = GROUP_TOPICS.find((k) => t.includes(k)) || "";
  if (!subject) {
    const match = t.match(/(?:专门用来做|专门做|用来做|一起做|做)(.{2,20}?)(?:的)?(?:搭子|小组|群|队伍)/);
    subject = match
      ? match[1].replace(/^(学习|备考|一起|专门|用来|做)/, "").replace(/的$/, "").trim()
      : "";
  }
  subject = subject.slice(0, 12);
  const title = subject ? `${subject}搭子小组` : "新的协同小组";
  const goal = subject
    ? `找更多${subject}的伙伴一起推进、互相监督、共享资料`
    : "找更多伙伴一起推进这件事";
  return {
    reply: `这个想法适合做成一个独立的协同小组。我建议叫「${title}」，目标是「${goal}」。确认后我就创建，你再邀请伙伴加入。`,
    proposal: { type: "create_collab", title, goal, scenario: "friends" },
  };
}

function buildAgentPrompt(buddyId, mode, payload, personaTone, answers) {
  const buddyName = BUDDY_NAMES[buddyId] || "搭子";
  const profileLine =
    answers && Object.keys(answers).length > 0
      ? `关于这位用户，${buddyName}记住的领域档案：${Object.values(answers).join("；")}。`
      : "";
  const base = `你是心栈 SoulSentry 里的「${buddyName}」，人格：${personaTone}${profileLine}说话用简体中文，语气像朋友，不要列表式说教。`;

  switch (mode) {
    case "solve_locate": {
      const typed = String(payload.problem || "").trim().slice(0, 2000);
      const attachmentText = String(payload.attachment_text || "").trim().slice(0, 6000);
      const problem = [typed, attachmentText ? `题目图片/附件识别内容：\n${attachmentText}` : ""].filter(Boolean).join("\n\n");
      return {
        systemPrompt: `${base}你擅长引导式教学：绝不直接给答案，而是定位考点、分层提示。`,
        prompt: `用户发来一道卡住的题：\n「${problem || "（用户只发了图片，但识别失败）"}」\n\n请做考点定位，只输出 JSON：{"subject":"科目","point":"具体考点（10字内）","ask":"一句引导提问，问用户是完全没思路还是做到一半卡住了（30字内）"}`,
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
        systemPrompt: `${base}${BUDDY_EXPERTISE[buddyId] || ""}开场白必须落在真实进度上，给出一个具体可执行的提醒，不说套话。`,
        prompt: `用户此刻的真实状态：${context}\n\n以${buddyName}的身份写一句今日开场白（60字内）：结合ta当下的真实状态，给一句具体、有专业含量的提醒或鼓励。不许用「今天也要加油」之类的套话，每次都要不一样。只输出 JSON：{"text":"..."}`,
      };
    }
    case "chat": {
      const context = String(payload.context || "").slice(0, 800);
      const attachmentText = String(payload.attachment_text || "").trim().slice(0, 6000);
      const history = Array.isArray(payload.messages)
        ? payload.messages
            .slice(-10)
            .map((m) => `${m.role === "user" ? "用户" : buddyName}：${String(m.content || "").slice(0, 500)}`)
            .join("\n")
        : "";
      return {
        systemPrompt: `${base}${BUDDY_EXPERTISE[buddyId] || ""}用户此刻的真实上下文：${context || "（暂无）"}。回答前先判断用户处在「目标设定 / 执行卡点 / 复盘调整」哪一阶段；给一个专业框架 + 一个今天就能做的最小动作，拒绝空泛的正确话。如果用户想成立小组、拉伙伴一起做某件事（如「成立一个专门考公的学习小组」），不要只给建议：在 proposal 里给出可确认的协同小组提案（type=create_collab，title=小组名，goal=一句话目标，scenario=friends），reply 里说明确认后会创建；普通问题 proposal 为 null。用户可能随消息发来图片或文件，附件会以识别后的文本提供给你，必须结合附件内容回答。`,
        prompt: `以下是用户与${buddyName}的最近对话：\n${history}\n${attachmentText ? `\n用户这条消息附带的图片/文件内容（已识别）：\n${attachmentText}\n` : ""}\n以${buddyName}的身份回复最后一条用户消息（120字内）：先结合上下文里的真实进度指出一个具体事实，再给最实在的专业指导和下一步；涉及情绪先接住再引导。只输出 JSON：{"reply":"...","proposal":null}；需要创建小组时输出 {"reply":"...","proposal":{"type":"create_collab","title":"...","goal":"...","scenario":"friends"}}。`,
      };
    }
    default:
      return null;
  }
}

/**
 * 搭子对话的真实进度上下文：项目约定 + 未完成子约定 + 近 7 天打卡 + 本搭子沉淀的心签。
 * 让「专业指导」落在用户真实进度上，而不是泛泛而谈。
 */
async function loadBuddyLiveContext(userId, buddyId, profile) {
  const lines = [];
  try {
    if (profile?.project_task_id) {
      const projectTask = await prisma.task.findUnique({
        where: { id: profile.project_task_id },
        select: { id: true, title: true, status: true, progress: true, category: true },
      });
      if (projectTask) {
        lines.push(
          `项目约定「${projectTask.title}」：${projectTask.status === "DONE" ? "已完成" : `进行中，进度 ${projectTask.progress || 0}%`}`
        );
        const children = await prisma.task.findMany({
          where: { parentTaskId: projectTask.id, deletedAt: null },
          orderBy: { createdAt: "asc" },
          take: 20,
          select: { title: true, status: true },
        });
        const open = children.filter((c) => c.status !== "DONE" && c.status !== "ARCHIVED");
        if (open.length > 0) {
          lines.push(
            `未完成子约定：${open.slice(0, 6).map((c) => `「${c.title}」`).join("、")}${open.length > 6 ? ` 等 ${open.length} 条` : ""}`
          );
        }
        if (projectTask.category === "checkin") {
          const since = new Date(Date.now() - 7 * 86400000);
          const [total, week] = await Promise.all([
            prisma.checkin.count({ where: { taskId: projectTask.id } }),
            prisma.checkin.count({ where: { taskId: projectTask.id, createdAt: { gte: since } } }),
          ]);
          lines.push(`打卡：累计 ${total} 次，近 7 天 ${week} 次`);
        }
      }
    }

    const notes = await prisma.note.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { title: true, plainText: true, content: true, sourceType: true, metadata: true },
    });
    const related = notes
      .filter(
        (n) =>
          n.metadata?._extraFields?.source_buddy === buddyId ||
          (buddyId === "study" && n.sourceType === "buddy_solve") ||
          (buddyId === "reading" && n.sourceType === "buddy_reading")
      )
      .slice(0, 3);
    if (related.length > 0) {
      lines.push(
        `最近沉淀：${related
          .map((n) => {
            const text = String(n.title || n.plainText || n.content || "").replace(/<[^>]+>/g, "").slice(0, 30);
            return `「${text}」`;
          })
          .join("、")}`
      );
    }
  } catch (error) {
    console.warn("[buddies/agent] live context failed:", error?.message || error);
  }
  return lines.join("；").slice(0, 1200);
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
  let payload = parsed.data.payload || {};
  const lastUserText = Array.isArray(payload.messages)
    ? [...payload.messages].reverse().find((m) => m?.role === "user" && typeof m.content === "string")?.content || ""
    : "";
  const isInteractive = ["chat", "greeting", "talk"].includes(parsed.data.mode);

  // 搭子对话/解题支持图片与文件：先提取图片 OCR / 文件文本，再交给领域提示词
  const attachments = Array.isArray(payload.attachments) ? payload.attachments.slice(0, 3) : [];
  const hasAttachments = attachments.some((att) => att?.url || att?.file_url);
  if (hasAttachments && (parsed.data.mode === "chat" || parsed.data.mode === "solve_locate")) {
    const parts = [];
    for (const att of attachments) {
      const text = await readAttachmentText({
        url: att.url || att.file_url,
        name: att.name || att.file_name,
        type: att.type || att.file_type,
      });
      if (text) parts.push(text);
    }
    const attachmentText = parts.join("\n\n").slice(0, 6000);
    if (attachmentText) payload = { ...payload, attachment_text: attachmentText };
  }

  // 成立小组 / 拉伙伴一起做：本地秒回一个可确认的协同小组提案，不走慢模型
  if (parsed.data.mode === "chat") {
    const groupIntent = detectBuddyGroupIntent(lastUserText);
    if (groupIntent) return res.json({ data: groupIntent });
  }

  // 复杂问题（小组/规划/备考/长文本/带附件）用旗舰模型换专业度；短闲聊继续走快速模型
  const isComplex =
    hasAttachments ||
    lastUserText.length > 60 ||
    /(小组|协同|计划|规划|方案|目标|考公|考研|英语|数学|复习|安排|成立|创建)/.test(lastUserText);
  const useFast = isInteractive && !isComplex;

  if (isInteractive) {
    const liveContext = await loadBuddyLiveContext(req.user.id, buddyId, profile);
    if (liveContext) {
      payload = { ...payload, context: [payload.context, liveContext].filter(Boolean).join("；") };
    }
  }
  const built = buildAgentPrompt(buddyId, parsed.data.mode, payload, personaTone, profile.answers);
  if (!built) {
    return res.status(400).json({ error: "INVALID_INPUT", message: "未知的技能模式" });
  }
  try {
    const data = await Promise.race([
      invokeKimiText({
        prompt: built.prompt,
        systemPrompt: built.systemPrompt,
        responseJsonSchema: true,
        models: useFast ? FAST_TEXT_MODELS : undefined,
        maxTokens: useFast ? 700 : 1200,
        fetchTimeout: useFast ? 15000 : 45000,
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("AGENT_TIMEOUT")), useFast ? 28000 : 60000)
      ),
    ]);
    if (parsed.data.mode === "solve_locate" && payload.attachment_text) {
      return res.json({ data: { ...(data && typeof data === "object" ? data : {}), problem_text: payload.attachment_text } });
    }
    return res.json({ data });
  } catch (error) {
    console.error(`[buddies/agent] ${buddyId}/${parsed.data.mode} failed:`, error?.message || error);
    if (isInteractive) {
      // 兜底也要接住用户刚才说的话，而不是给一句通用话术
      const snippet = String(lastUserText || "").trim().slice(0, 24);
      return res.json({
        data:
          parsed.data.mode === "greeting"
            ? { text: "我在。今天先挑一件最想推进的事，我们从最小的一步开始。" }
            : {
                reply: snippet
                  ? `我在。刚才没来得及把「${snippet}${lastUserText.length > 24 ? "…" : ""}」完整展开——你先告诉我最想先解决哪一步，我马上接着答。`
                  : "我在。刚才想得有点久——先告诉我你现在最想先解决哪一步，我马上接着答。"
              },
        degraded: true,
      });
    }
    return res.status(502).json({ error: "AGENT_FAILED", message: "搭子走神了，再试一次" });
  }
});
