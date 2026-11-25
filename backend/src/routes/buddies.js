import { Router } from "express";
import { aiRequestContext } from "../lib/aiContext.js";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { beijingToday, beijingDayRange } from "../lib/behavior.js";
import crypto from "node:crypto";
import { invokeKimiText, invokeKimiWebSearch, FAST_TEXT_MODELS, STRUCTURED_TEXT_MODELS, DASHBOARD_TEXT_MODELS } from "../lib/kimi.js";
import { readAttachmentText } from "../services/readAttachment.js";
import { assertAICredits, chargeAICredits, usageCost } from "../services/aiCredits.js";
import { BUDDY_DEFAULT_PERSONA, pickBuddyPersona } from "../services/buddyPersona.js";
import { buildCustomBuddyPrompt, buildFallbackCustomBuddy, getCustomBuddy, isKnownBuddyId, sanitizeCustomBuddy } from "../services/customBuddies.js";

/**
 * 搭子（Buddy）L1 底座：
 * - 主档案（人格 persona、身份识别 id_profile）全局共享，领域档案（buddy_profiles[id]）相互隔离——
 *   学习搭子不需要知道你几点赖床。统一存 UserPreference.metadata._extraFields，无需 schema 变更。
 * - 认领 = 项目制绑定：写领域档案 + 按服务端模板创建项目约定（防篡改）；
 * - 毕业：项目走完，关系归档（约定保留），搭子回到货架可再次认领。
 */

export const buddiesRouter = Router();

const BUDDY_IDS = new Set(["study", "travel", "reading", "morning", "running"]);

const claimSchema = z.object({
  answers: z
    .record(z.string().max(200))
    .refine((obj) => Object.keys(obj).length <= 10, { message: "answers too many" })
    .optional()
    .default({}),
  plan_title: z.string().trim().max(60).optional(),
  plan_lines: z.array(z.string().trim().max(120)).max(8).optional(),
  // 认领时可以先为这颗搭子选一个陪伴人格；缺省用搭子类型的默认人格
  persona: z.enum(["gentle", "strict", "buddy"]).optional(),
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

// 计划模板里的 {key} 用认领答案替换；缺的字段用「待定」，不让占位符露给用户
function fillPlanTemplate(template, answers = {}) {
  return String(template || "").replace(/\{([a-z0-9_]+)\}/gi, (_, key) => {
    const value = String(answers[key] || "").trim().slice(0, 40);
    return value || "待定";
  });
}

// 项目约定模板（认领即立项目）：标题与形态由服务端定型
function buildProjectTaskData(buddyId, answers = {}, customBuddy = null) {
  const a = (k, d = "") => String(answers[k] || d).slice(0, 60);
  if (customBuddy) {
    const planTitle = fillPlanTemplate(customBuddy.plan?.title, answers) || `${customBuddy.name} · 陪伴计划`;
    return {
      title: planTitle.slice(0, 60),
      description: `${customBuddy.name}：${customBuddy.slogan || ""}。能帮你：${(customBuddy.abilities || customBuddy.actions || []).slice(0, 2).join("；")}`.slice(0, 500),
      category: "personal",
      extra: { buddy_id: buddyId, buddy_name: customBuddy.name },
    };
  }
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
    case "running": {
      const goal = a("goal", "首个 5K");
      const weeks = goal.includes("全马") ? 16 : goal.includes("半马") ? 12 : goal.includes("10K") || goal.includes("10k") ? 10 : 8;
      const injury = a("injury", "没有伤");
      const injuryLine = injury && !/没有|无伤|暂无/.test(injury) ? `需要特别留意：${injury}，疼痛时立即停跑并改交叉训练。` : "目前没有伤病记录，出现持续疼痛先停跑。";
      return {
        title: `${goal} · ${weeks} 周跑步计划`,
        description: `跑步搭子周期化计划：目标「${goal}」，每周 ${a("days", "每周 3 天")}，首选${a("time", "晨跑")}；基础「${a("level", "能连续跑 30 分钟")}」。周跑量增幅不超过 10%，每第 4 周减量；缺跑不补课。${injuryLine}`,
        category: "personal",
        extra: { buddy_id: "running" },
      };
    }
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
    // 用户自己设计的搭子：只在自己的 Store 上架，定义随账号持久化
    custom_buddies: extra.custom_buddies && typeof extra.custom_buddies === "object" ? extra.custom_buddies : {},
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

const materialSchema = z.object({
  file_url: z.string().min(1).max(600),
  name: z.string().min(1).max(200),
  type: z.string().max(100).optional().nullable(),
});

const DESIGN_MATERIAL_LIMIT = 5;

function readableMaterialText(value) {
  const extracted = String(value || "").trim();
  if (!extracted) return "";
  if (/不支持的文件类型|文件内容为空|文件内容提取失败|文件过大/.test(extracted)) return "";
  return extracted.slice(0, 12000);
}

// 设计阶段允许用户先喂参考资料：这里只提取文字，不落库；确认上架时才写入 BuddyMaterial
buddiesRouter.post("/custom/materials/inspect", async (req, res) => {
  const parsed = materialSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: parsed.error.flatten() });
  }
  const text = await readAttachmentText({
    url: parsed.data.file_url,
    name: parsed.data.name,
    type: parsed.data.type,
  }).catch(() => "");
  const extracted = readableMaterialText(text);
  if (!extracted) {
    return res.status(400).json({
      error: "EMPTY_CONTENT",
      message: "没有从这份资料里读到可用的文字；扫描件可以先转成文字，或换一份 PDF/Word/文本",
    });
  }
  return res.json({
    material: {
      file_url: parsed.data.file_url,
      name: parsed.data.name.slice(0, 200),
      type: parsed.data.type || null,
      text: extracted,
      chars: extracted.length,
    },
  });
});

// 设计/保存时读取用户随请求带来的资料，统一成注入提示词的上下文
async function collectMaterialContext(items = []) {
  const list = Array.isArray(items) ? items.slice(0, DESIGN_MATERIAL_LIMIT) : [];
  const parts = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    let text = readableMaterialText(item.text);
    if (!text && item.file_url) {
      text = readableMaterialText(await readAttachmentText({
        url: item.file_url,
        name: item.name || "资料",
        type: item.type || item.file_type,
      }).catch(() => ""));
    }
    if (!text) continue;
    parts.push(`【${String(item.name || "资料").slice(0, 200)}】\n${text}`);
  }
  return parts.join("\n\n").slice(0, 6000);
}

async function persistCustomMaterials(userId, buddyId, items = []) {
  const list = Array.isArray(items) ? items.slice(0, DESIGN_MATERIAL_LIMIT) : [];
  if (list.length === 0) return { added: 0, skipped: 0 };
  const existingRows = await prisma.buddyMaterial.findMany({
    where: { userId, buddyId },
    select: { fileUrl: true },
  });
  const seenUrls = new Set(existingRows.map((row) => row.fileUrl).filter(Boolean));
  let count = existingRows.length;
  let added = 0;
  let skipped = 0;
  for (const item of list) {
    if (!item || typeof item !== "object" || count >= DESIGN_MATERIAL_LIMIT) {
      skipped += 1;
      continue;
    }
    const fileUrl = String(item.file_url || "").slice(0, 600);
    if (fileUrl && seenUrls.has(fileUrl)) continue;
    let text = readableMaterialText(item.text);
    if (!text && fileUrl) {
      text = readableMaterialText(await readAttachmentText({
        url: fileUrl,
        name: item.name || "资料",
        type: item.type || item.file_type,
      }).catch(() => ""));
    }
    if (!text) {
      skipped += 1;
      continue;
    }
    await prisma.buddyMaterial.create({
      data: {
        userId,
        buddyId,
        name: String(item.name || "资料").slice(0, 200),
        fileUrl: fileUrl || null,
        fileType: item.type || item.file_type || null,
        text,
      },
    });
    if (fileUrl) seenUrls.add(fileUrl);
    count += 1;
    added += 1;
  }
  return { added, skipped };
}

// POST /api/buddies/custom/design —— 自然语言描述 → 生成/调整一颗自定义搭子（只预览，不上架）
buddiesRouter.post("/custom/design", async (req, res) => {
  const description = String(req.body?.description || "").trim().slice(0, 1200);
  const feedback = String(req.body?.feedback || "").trim().slice(0, 600);
  const current = req.body?.current && typeof req.body.current === "object" ? req.body.current : null;
  if (description.length < 4) {
    return res.status(400).json({ error: "INVALID_INPUT", message: "先说说你想要一个什么样的搭子" });
  }
  try {
    await assertAICredits(req.user.id, 1, "custom_buddy_design");
  } catch (error) {
    return res.status(402).json({
      error: "INSUFFICIENT_CREDITS",
      message: error?.message || "AI 点数不足",
      balance: error?.balance,
      required: error?.required,
    });
  }
  const newMaterialContext = await collectMaterialContext(req.body?.materials);
  let existingMaterialContext = "";
  if (current?.id) {
    try {
      const { extra } = await readExtraFields(req.user.id);
      if (getCustomBuddy(extra, current.id)) {
        const rows = await prisma.buddyMaterial.findMany({
          where: { userId: req.user.id, buddyId: current.id },
          orderBy: { createdAt: "desc" },
          take: 5,
          select: { name: true, text: true },
        });
        existingMaterialContext = rows
          .map((item) => `【${item.name}】\n${item.text}`)
          .join("\n\n")
          .slice(0, 6000);
      }
    } catch (error) {
      console.warn("[buddies/custom] 读取已有资料失败:", error?.message || error);
    }
  }
  const materialContext = [newMaterialContext, existingMaterialContext].filter(Boolean).join("\n\n").slice(0, 6000);
  const built = buildCustomBuddyPrompt({ description, feedback, current, materialContext });
  try {
    const result = await invokeKimiText({
      prompt: built.prompt,
      systemPrompt: built.systemPrompt,
      responseJsonSchema: true,
      models: DASHBOARD_TEXT_MODELS,
      maxTokens: 2500,
      fetchTimeout: 30000,
      withUsage: true,
    });
    // 先校验/整理模型输出，再按真实用量扣点，避免输出异常时白扣
    const buddy = sanitizeCustomBuddy(result.data, { description });
    const { cost, billableTokens } = usageCost(result.usage);
    let charged = 0;
    let balance = null;
    try {
      const settled = await chargeAICredits({
        userId: req.user.id,
        cost,
        feature: "custom_buddy_design",
        description: `设计搭子 · ${description.slice(0, 24)}`,
      });
      charged = cost;
      balance = settled.balance;
    } catch (chargeError) {
      if (chargeError?.code === "INSUFFICIENT_CREDITS") {
        console.warn(`[buddies/custom] 设计完成但结算余额不足（${chargeError.balance} < ${chargeError.required}），本次放行`);
      } else {
        console.error("[buddies/custom] 设计扣点失败:", chargeError?.message || chargeError);
      }
    }
    return res.json({
      buddy,
      usage: { cost, billable_tokens: billableTokens, charged, balance },
    });
  } catch (error) {
    console.warn("[buddies/custom] AI 设计失败，使用可用兜底:", error?.message || error);
    return res.json({
      buddy: buildFallbackCustomBuddy(description),
      degraded: true,
      usage: { cost: 0, billable_tokens: 0, charged: 0 },
    });
  }
});

// POST /api/buddies/custom —— 确认上架一颗自定义搭子到自己的 Store
buddiesRouter.post("/custom", async (req, res) => {
  const raw = req.body?.buddy;
  if (!raw || typeof raw !== "object") {
    return res.status(400).json({ error: "INVALID_INPUT", message: "缺少搭子配置" });
  }
  const { pref, extra } = await readExtraFields(req.user.id);
  const existing = extra.custom_buddies && typeof extra.custom_buddies === "object" ? { ...extra.custom_buddies } : {};
  if (Object.keys(existing).length >= 20) {
    return res.status(400).json({ error: "LIMIT_REACHED", message: "最多上架 20 颗自己设计的搭子" });
  }
  const id = `custom_${crypto.randomBytes(4).toString("hex")}`;
  const config = sanitizeCustomBuddy(raw, { description: raw.description || String(req.body?.description || "") });
  config.id = id;
  config.createdAt = new Date().toISOString();
  existing[id] = config;
  await writeExtraFields(req.user.id, pref, { custom_buddies: existing });
  let materials = { added: 0, skipped: 0 };
  try {
    materials = await persistCustomMaterials(req.user.id, id, req.body?.materials);
  } catch (error) {
    console.warn("[buddies/custom] 保存设计资料失败:", error?.message || error);
  }
  return res.status(201).json({ buddy: config, materials_added: materials.added, materials_skipped: materials.skipped });
});

// PUT /api/buddies/custom/:id —— 持续调整已上架的自定义搭子
buddiesRouter.put("/custom/:id", async (req, res) => {
  const customId = req.params.id;
  const raw = req.body?.buddy;
  if (!raw || typeof raw !== "object") {
    return res.status(400).json({ error: "INVALID_INPUT", message: "缺少搭子配置" });
  }
  const { pref, extra } = await readExtraFields(req.user.id);
  const existing = extra.custom_buddies && typeof extra.custom_buddies === "object" ? { ...extra.custom_buddies } : {};
  const previous = existing[customId];
  if (!previous) {
    return res.status(404).json({ error: "NOT_FOUND", message: "这颗自定义搭子不存在" });
  }
  const config = sanitizeCustomBuddy(raw, { description: raw.description || previous.description || "" });
  config.id = customId;
  config.createdAt = previous.createdAt || new Date().toISOString();
  config.updatedAt = new Date().toISOString();
  existing[customId] = config;

  // 已认领时同步档案里的搭子名；配置与档案一次性写入，避免用旧 metadata 覆盖刚保存的配置
  const profiles = extra.buddy_profiles && typeof extra.buddy_profiles === "object" ? { ...extra.buddy_profiles } : {};
  const profile = profiles[customId];
  const patch = { custom_buddies: existing };
  if (profile) {
    profiles[customId] = { ...profile, buddy_name: config.name };
    patch.buddy_profiles = profiles;
  }
  await writeExtraFields(req.user.id, pref, patch);

  if (profile) {
    if (profile.project_task_id) {
      try {
        const task = await prisma.task.findUnique({ where: { id: profile.project_task_id }, select: { metadata: true } });
        if (task) {
          const metadata = task.metadata && typeof task.metadata === "object" ? { ...task.metadata } : {};
          const extraFields = metadata._extraFields && typeof metadata._extraFields === "object" ? { ...metadata._extraFields } : {};
          await prisma.task.update({
            where: { id: profile.project_task_id },
            data: { metadata: { ...metadata, _extraFields: { ...extraFields, buddy_name: config.name } } },
          });
        }
      } catch (error) {
        console.warn("[buddies/custom] 同步项目搭子名失败:", error?.message || error);
      }
    }
  }
  let materials = { added: 0, skipped: 0 };
  try {
    materials = await persistCustomMaterials(req.user.id, customId, req.body?.materials);
  } catch (error) {
    console.warn("[buddies/custom] 保存设计资料失败:", error?.message || error);
  }
  return res.json({ buddy: config, materials_added: materials.added, materials_skipped: materials.skipped });
});

// DELETE /api/buddies/custom/:id —— 删除自己设计的搭子（项目和协同保留，转为普通内容）
// 删除是幂等的：先解绑任务和资料，再移除搭子配置；如果上次中途被重启打断，重试即可完成。
buddiesRouter.delete("/custom/:id", async (req, res) => {
  const customId = req.params.id;
  const { extra } = await readExtraFields(req.user.id);
  const existing = extra.custom_buddies && typeof extra.custom_buddies === "object" ? { ...extra.custom_buddies } : {};
  const hadCustom = Boolean(existing[customId]);

  let detachedTasks = 0;
  try {
    // SQLite JSON1 一次更新完成解绑，避免逐个 update 让删除请求拖到网关超时。
    detachedTasks = await prisma.$executeRaw`
      UPDATE "Task"
      SET "metadata" = json_remove("metadata", '$._extraFields.buddy_id', '$._extraFields.buddy_name')
      WHERE "userId" = ${req.user.id}
        AND json_extract("metadata", '$._extraFields.buddy_id') = ${customId}
    `;
  } catch (error) {
    console.warn("[buddies/custom] JSON 解绑任务失败，回退逐条处理:", error?.message || error);
    try {
      const tasks = await prisma.task.findMany({
        where: { userId: req.user.id },
        select: { id: true, metadata: true },
      });
      for (const task of tasks) {
        const extraFields = task.metadata?._extraFields;
        if (!extraFields || extraFields.buddy_id !== customId) continue;
        const nextExtraFields = { ...extraFields };
        delete nextExtraFields.buddy_id;
        delete nextExtraFields.buddy_name;
        await prisma.task.update({
          where: { id: task.id },
          data: {
            metadata: {
              ...(task.metadata && typeof task.metadata === "object" ? task.metadata : {}),
              _extraFields: nextExtraFields,
            },
          },
        });
        detachedTasks += 1;
      }
    } catch (fallbackError) {
      console.warn("[buddies/custom] 回退解绑任务失败:", fallbackError?.message || fallbackError);
    }
  }

  // 先清资料（包括功能专属资料），即使后面进程重启，重试仍能接着完成。
  await prisma.buddyMaterial.deleteMany({
    where: {
      userId: req.user.id,
      OR: [
        { buddyId: customId },
        { buddyId: { startsWith: `${customId}::feature::` } },
      ],
    },
  }).catch((error) => {
    console.warn("[buddies/custom] 删除搭子资料失败:", error?.message || error);
  });

  // 重新读取最新偏好，避免删除期间的其他写入（对话/设置）被旧 metadata 覆盖。
  const latest = await readExtraFields(req.user.id);
  const latestExtra = latest.extra;
  const latestCustom = latestExtra.custom_buddies && typeof latestExtra.custom_buddies === "object"
    ? { ...latestExtra.custom_buddies }
    : {};
  const profiles = latestExtra.buddy_profiles && typeof latestExtra.buddy_profiles === "object"
    ? { ...latestExtra.buddy_profiles }
    : {};
  const hadProfile = Boolean(profiles[customId]);
  delete latestCustom[customId];
  delete profiles[customId];
  await writeExtraFields(req.user.id, latest.pref, {
    custom_buddies: latestCustom,
    buddy_profiles: profiles,
  });

  return res.json({
    ok: true,
    had_profile: hadProfile,
    had_custom: hadCustom,
    already_deleted: !hadCustom && !hadProfile,
    detached_tasks: Number(detachedTasks) || 0,
  });
});

/* ---------- 专属搭子资料：让自定义搭子在特定方向更专业 ---------- */

async function assertCustomBuddy(req, res) {
  const buddyId = req.params.id;
  const { pref, extra } = await readExtraFields(req.user.id);
  const buddy = getCustomBuddy(extra, buddyId);
  if (!buddy) {
    res.status(404).json({ error: "NOT_FOUND", message: "只有自己设计的搭子可以上传专属资料" });
    return null;
  }
  return { pref, extra, buddyId, buddy };
}

buddiesRouter.get("/:id/materials", async (req, res) => {
  const ctx = await assertCustomBuddy(req, res);
  if (!ctx) return;
  const rows = await prisma.buddyMaterial.findMany({
    where: { userId: req.user.id, buddyId: ctx.buddyId },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, fileUrl: true, fileType: true, text: true, createdAt: true },
  });
  return res.json({
    materials: rows.map((row) => ({
      id: row.id,
      name: row.name,
      file_url: row.fileUrl,
      file_type: row.fileType,
      chars: String(row.text || "").length,
      created_at: row.createdAt,
    })),
    limit: 5,
  });
});

buddiesRouter.post("/:id/materials", async (req, res) => {
  const ctx = await assertCustomBuddy(req, res);
  if (!ctx) return;
  const parsed = materialSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: parsed.error.flatten() });
  }
  const count = await prisma.buddyMaterial.count({ where: { userId: req.user.id, buddyId: ctx.buddyId } });
  if (count >= 5) {
    return res.status(400).json({ error: "LIMIT_REACHED", message: "最多上传 5 份专属资料，先删掉旧的再加" });
  }
  const text = await readAttachmentText({
    url: parsed.data.file_url,
    name: parsed.data.name,
    type: parsed.data.type,
  }).catch(() => "");
  const extracted = String(text || "").trim();
  if (!extracted || /不支持的文件类型|文件内容为空|文件内容提取失败|文件过大/.test(extracted)) {
    return res.status(400).json({
      error: "EMPTY_CONTENT",
      message: "没有从这份资料里读到可用的文字；扫描件可以先转成文字，或换一份 PDF/Word/文本",
    });
  }
  const material = await prisma.buddyMaterial.create({
    data: {
      userId: req.user.id,
      buddyId: ctx.buddyId,
      name: parsed.data.name.slice(0, 200),
      fileUrl: parsed.data.file_url,
      fileType: parsed.data.type || null,
      text: String(text).slice(0, 12000),
    },
  });
  return res.status(201).json({
    material: {
      id: material.id,
      name: material.name,
      file_url: material.fileUrl,
      file_type: material.fileType,
      chars: material.text.length,
      created_at: material.createdAt,
    },
  });
});

buddiesRouter.delete("/:id/materials/:materialId", async (req, res) => {
  const ctx = await assertCustomBuddy(req, res);
  if (!ctx) return;
  const deleted = await prisma.buddyMaterial.deleteMany({
    where: { id: req.params.materialId, userId: req.user.id, buddyId: ctx.buddyId },
  });
  if (deleted.count === 0) {
    return res.status(404).json({ error: "NOT_FOUND", message: "资料不存在" });
  }
  return res.json({ ok: true });
});

// POST /api/buddies/:id/claim —— 认领：写领域档案 + 创建项目约定（项目制绑定）
buddiesRouter.post("/:id/claim", async (req, res) => {
  const buddyId = req.params.id;
  const { pref, extra } = await readExtraFields(req.user.id);
  const customBuddy = getCustomBuddy(extra, buddyId);
  if (!isKnownBuddyId(BUDDY_IDS, extra, buddyId)) {
    return res.status(404).json({ error: "NOT_FOUND", message: "这颗搭子还没有来到货架" });
  }
  const parsed = claimSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: parsed.error.flatten() });
  }

  const profiles = extra.buddy_profiles && typeof extra.buddy_profiles === "object" ? { ...extra.buddy_profiles } : {};
  const existing = profiles[buddyId];
  if (existing && existing.status === "active") {
    return res.status(409).json({ error: "ALREADY_CLAIMED", message: "这颗搭子已经在陪你啦" });
  }

  const taskData = buildProjectTaskData(buddyId, parsed.data.answers, customBuddy);
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
    // 每颗搭子独立人格：认领时选定的 > 搭子类型默认 > 全局人格
    persona: parsed.data.persona || customBuddy?.defaultPersona || BUDDY_DEFAULT_PERSONA[buddyId] || extra.persona || "gentle",
    buddy_name: customBuddy?.name || BUDDY_NAMES[buddyId] || null,
    custom: Boolean(customBuddy),
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
  const { pref, extra } = await readExtraFields(req.user.id);
  if (!isKnownBuddyId(BUDDY_IDS, extra, buddyId)) {
    return res.status(404).json({ error: "NOT_FOUND", message: "这颗搭子还没有来到货架" });
  }
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
  const { pref, extra } = await readExtraFields(req.user.id);
  if (!isKnownBuddyId(BUDDY_IDS, extra, buddyId)) {
    return res.status(404).json({ error: "NOT_FOUND", message: "这颗搭子还没有来到货架" });
  }
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

export const BUDDY_NAMES = { study: "学习搭子", travel: "旅游搭子", reading: "读书搭子", morning: "早起搭子", running: "跑步搭子" };

/**
 * 结束一段陪伴时，把这段关系的真实内容按主题沉淀成一条心签：
 * 项目约定进度、子约定完成情况、打卡次数、最近沉淀、下次接着做的事。
 * 约定/心签本身不删除；下次重新认领还能接着用。
 */
async function createBuddySediment(userId, buddyId, profile, scene) {
  const buddyName = profile?.buddy_name || BUDDY_NAMES[buddyId] || "搭子";
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

const layoutModuleShape = z.object({
  id: z.string().trim().min(1).max(48),
  label: z.string().trim().min(1).max(12).optional(),
  type: z.enum(["checklist", "notes", "tracker", "assistant"]).optional(),
  unit: z.string().trim().max(6).optional(),
  metric: z.string().trim().max(8).optional(),
  aggregate: z.enum(["sum", "avg", "latest"]).optional(),
  hint: z.string().trim().max(80).optional(),
  preset: z.string().trim().max(40).optional(),
  icon: z.string().trim().max(24).optional(),
  items: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  instructions: z.string().trim().max(800).optional(),
  placeholder: z.string().trim().max(60).optional(),
  examples: z.array(z.string().trim().min(1).max(60)).max(4).optional(),
  web_research: z.boolean().optional(),
  mode: z.enum(["guide", "language"]).optional(),
});

const layoutModuleSchema = z.object({
  modules: z.array(layoutModuleShape).min(1).max(6),
  archived: z.array(layoutModuleShape).max(12).optional().default([]),
});

function storedLayoutModule(item) {
  return {
    id: item.id,
    ...(item.label ? { label: item.label } : {}),
    ...(item.type ? { type: item.type } : {}),
    ...(item.unit ? { unit: item.unit } : {}),
    ...(item.metric ? { metric: item.metric } : {}),
    ...(item.aggregate ? { aggregate: item.aggregate } : {}),
    ...(item.hint ? { hint: item.hint } : {}),
    ...(item.preset ? { preset: item.preset } : {}),
    ...(item.icon ? { icon: item.icon } : {}),
    ...(item.items ? { items: item.items } : {}),
    ...(item.instructions ? { instructions: item.instructions } : {}),
    ...(item.placeholder ? { placeholder: item.placeholder } : {}),
    ...(item.examples ? { examples: item.examples } : {}),
    ...(typeof item.web_research === "boolean" ? { web_research: item.web_research } : {}),
    ...(item.mode ? { mode: item.mode } : {}),
  };
}

// POST /api/buddies/:id/layout —— 保存这颗搭子的页面模块顺序与自定义模块
buddiesRouter.post("/:id/layout", async (req, res) => {
  const buddyId = req.params.id;
  const parsed = layoutModuleSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: parsed.error.flatten() });
  }
  const { pref, profiles, profile, extra } = await getActiveProfile(req.user.id, buddyId);
  if (!isKnownBuddyId(BUDDY_IDS, extra, buddyId)) {
    return res.status(404).json({ error: "NOT_FOUND", message: "这颗搭子还没有来到货架" });
  }
  if (!profile) {
    return res.status(409).json({ error: "NOT_ACTIVE", message: "这段陪伴还没有开始，或已经毕业" });
  }
  const modules = parsed.data.modules.map(storedLayoutModule);
  const archived = parsed.data.archived.map(storedLayoutModule);
  // 智能功能是自定义搭子的能力入口，内置搭子继续使用固定专业板块。
  if ([...modules, ...archived].some((item) => item.type === "assistant") && !getCustomBuddy(extra, buddyId)) {
    return res.status(400).json({ error: "INVALID_INPUT", message: "只有自定义搭子可以添加智能功能" });
  }
  const layout = { version: 1, modules, archived, updated_at: new Date().toISOString() };
  profiles[buddyId] = { ...profile, layout };
  await writeExtraFields(req.user.id, pref, { buddy_profiles: profiles });
  return res.json({ layout });
});

/* ---------- 自定义搭子的智能功能：自然语言生成入口 + 功能专属参考资料 ---------- */

const FEATURE_ICONS = new Set([
  "sparkles", "dumbbell", "chef-hat", "utensils", "gauge", "list-checks", "notebook-pen",
  "wallet", "trophy", "heart-pulse", "calendar-check", "cloud-sun", "bot", "brain",
  "briefcase", "messages-square",
]);

function featureMaterialScope(buddyId, featureId) {
  return `${buddyId}::feature::${featureId}`;
}

function fallbackFeatureDraft(text) {
  const raw = String(text || "").trim();
  const kitchen = /(厨房|菜|食谱|做饭|烹饪|饮食|菜单)/.test(raw);
  const fitness = /(健身|训练|运动|增肌|减脂|力量|康复)/.test(raw);
  const icon = fitness ? "dumbbell"
    : kitchen ? "chef-hat"
      : /(预算|记账|理财|花费)/.test(raw) ? "wallet"
        : /(计划|方案|复盘)/.test(raw) ? "briefcase"
          : "sparkles";
  const label = fitness ? "健身指导"
    : kitchen ? "菜单指导"
      : /(预算|记账|理财|花费)/.test(raw) ? "预算助手"
        : /(计划|方案|复盘)/.test(raw) ? "方案定制"
          : "智能功能";
  const cleaned = raw
    .replace(/^(帮我|请|想|要|增加|添加|新增|加|一个|做个|一个叫)+/g, "")
    .replace(/^(一个)?(菜单|健身|训练|方案|计划)(功能|入口)?[，,：: ]*/g, "")
    .trim();
  return {
    label,
    hint: (cleaned || raw).slice(0, 60),
    instructions: `围绕用户的需求给出具体、可执行的结果。优先参考用户为这个功能上传的方案、菜单或资料；资料没有覆盖时明确说明，不要编造。先确认最少的关键信息，再给出步骤、清单或方案。用户对这个功能的原始要求：${raw}`.slice(0, 800),
    placeholder: kitchen ? "想吃什么？说说口味、现有食材和时间" : fitness ? "说说目标、训练时间和器械条件" : "说说你的需求…",
    examples: kitchen
      ? ["推荐几道低脂晚餐", "冰箱里有鸡蛋和西兰花，能做什么？"]
      : fitness
        ? ["按我的目标排一周训练", "膝盖不舒服，今天怎么调整？"]
        : [],
    icon,
  };
}

function sanitizeFeatureDraft(raw, { text = "" } = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  const fallback = fallbackFeatureDraft(text);
  const label = String(source.label || fallback.label).trim().slice(0, 12) || "智能功能";
  const hint = String(source.hint || fallback.hint || "").trim().slice(0, 80);
  const instructions = String(source.instructions || fallback.instructions || "").trim().slice(0, 800);
  const placeholder = String(source.placeholder || fallback.placeholder || "").trim().slice(0, 60);
  const examples = (Array.isArray(source.examples) ? source.examples : fallback.examples || [])
    .map((item) => String(item || "").trim().slice(0, 60))
    .filter(Boolean)
    .slice(0, 4);
  const icon = FEATURE_ICONS.has(source.icon) ? source.icon : fallback.icon;
  return { label, hint, instructions, placeholder, examples, icon };
}

function cleanFeatureText(value, max = 200) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function sanitizeFeatureArtifact(raw) {
  if (!raw || typeof raw !== "object") return null;
  const cards = (Array.isArray(raw.cards) ? raw.cards : [])
    .slice(0, 4)
    .map((card) => ({
      title: cleanFeatureText(card?.title, 24),
      subtitle: cleanFeatureText(card?.subtitle, 60),
      tags: (Array.isArray(card?.tags) ? card.tags : [])
        .map((tag) => cleanFeatureText(tag, 16))
        .filter(Boolean)
        .slice(0, 5),
      body: cleanFeatureText(card?.body, 260),
    }))
    .filter((card) => card.title);
  const steps = (Array.isArray(raw.steps) ? raw.steps : [])
    .slice(0, 8)
    .map((step) => ({
      title: cleanFeatureText(step?.title, 24),
      detail: cleanFeatureText(step?.detail, 260),
      minutes: Number.isFinite(Number(step?.minutes)) ? Math.max(0, Math.min(240, Number(step.minutes))) : null,
    }))
    .filter((step) => step.title || step.detail);
  const title = cleanFeatureText(raw.title, 32);
  const subtitle = cleanFeatureText(raw.subtitle, 80);
  const scenario = cleanFeatureText(raw.scenario, 120);
  const phrases = (Array.isArray(raw.phrases) ? raw.phrases : [])
    .slice(0, 6)
    .map((phrase) => ({
      en: cleanFeatureText(phrase?.en, 160),
      zh: cleanFeatureText(phrase?.zh, 160),
      tip: cleanFeatureText(phrase?.tip, 80),
    }))
    .filter((phrase) => phrase.en || phrase.zh);
  const feedback = raw.feedback && typeof raw.feedback === "object"
    ? {
        good: cleanFeatureText(raw.feedback.good, 160),
        improve: cleanFeatureText(raw.feedback.improve, 160),
        next: cleanFeatureText(raw.feedback.next, 120),
      }
    : null;
  if (!title && !subtitle && cards.length === 0 && steps.length === 0 && phrases.length === 0 && !feedback) return null;
  return {
    title: title || "功能结果",
    subtitle,
    scenario,
    badges: (Array.isArray(raw.badges) ? raw.badges : [])
      .map((badge) => cleanFeatureText(badge, 16))
      .filter(Boolean)
      .slice(0, 5),
    cards,
    steps,
    phrases,
    feedback,
    tips: (Array.isArray(raw.tips) ? raw.tips : [])
      .map((tip) => cleanFeatureText(tip, 120))
      .filter(Boolean)
      .slice(0, 6),
    followups: (Array.isArray(raw.followups) ? raw.followups : [])
      .map((item) => cleanFeatureText(item, 60))
      .filter(Boolean)
      .slice(0, 4),
  };
}

function safeReferenceUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function isPublicReferenceUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (!["http:", "https:"].includes(url.protocol)) return false;
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (!host || host === "localhost" || host.endsWith(".local")) return false;
    if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host)) return false;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
    if (host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:")) return false;
    return true;
  } catch {
    return false;
  }
}

async function fetchOpenGraphImage(url) {
  if (!isPublicReferenceUrl(url)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": "Mozilla/5.0 (compatible; SoulSentryBot/1.0)", accept: "text/html" },
    });
    if (!res.ok || !isPublicReferenceUrl(res.url || url)) return null;
    const type = res.headers.get("content-type") || "";
    if (!type.includes("text/html")) return null;
    const html = (await res.text()).slice(0, 250000);
    const patterns = [
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
      /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
    ];
    const match = patterns.map((pattern) => html.match(pattern)).find(Boolean);
    if (!match?.[1]) return null;
    return safeReferenceUrl(new URL(match[1], url).toString());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function enrichFeatureReferences(refs) {
  const seen = new Set();
  const references = (Array.isArray(refs) ? refs : [])
    .map((ref) => ({
      title: cleanFeatureText(ref?.title || ref?.url, 100),
      url: safeReferenceUrl(ref?.url),
    }))
    .filter((ref) => {
      if (!ref.url || seen.has(ref.url)) return false;
      seen.add(ref.url);
      return true;
    })
    .slice(0, 5);
  const enriched = await Promise.all(references.map(async (ref) => ({
    ...ref,
    image: await fetchOpenGraphImage(ref.url),
  })));
  return enriched;
}

function sanitizeFeatureReferences(refs) {
  const seen = new Set();
  return (Array.isArray(refs) ? refs : [])
    .map((ref) => ({
      title: cleanFeatureText(ref?.title || ref?.url, 100),
      url: safeReferenceUrl(ref?.url),
      image: safeReferenceUrl(ref?.image),
    }))
    .filter((ref) => {
      if (!ref.url || seen.has(ref.url)) return false;
      seen.add(ref.url);
      return true;
    })
    .slice(0, 5);
}

async function getCustomFeatureContext(req, res) {
  const buddyId = req.params.id;
  const { profile, extra } = await getActiveProfile(req.user.id, buddyId);
  const customBuddy = getCustomBuddy(extra, buddyId);
  if (!customBuddy) {
    res.status(404).json({ error: "NOT_FOUND", message: "只有自定义搭子可以添加智能功能" });
    return null;
  }
  if (!profile) {
    res.status(409).json({ error: "NOT_ACTIVE", message: "这段陪伴还没有开始，或已经毕业" });
    return null;
  }
  const featureId = String(req.params.featureId || "").trim().slice(0, 48);
  const modules = Array.isArray(profile.layout?.modules) ? profile.layout.modules : [];
  const feature = modules.find((item) => item?.id === featureId && item?.type === "assistant");
  if (!feature) {
    res.status(404).json({ error: "FEATURE_NOT_FOUND", message: "这个功能入口不存在，先在页面模块里添加" });
    return null;
  }
  return { buddyId, profile, extra, customBuddy, feature };
}

const featureParseSchema = z.object({
  text: z.string().trim().min(4).max(600),
});

// POST /api/buddies/:id/features/parse —— 把一句需求变成自定义搭子的功能入口草稿
buddiesRouter.post("/:id/features/parse", async (req, res) => {
  const buddyId = req.params.id;
  const parsed = featureParseSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: "INVALID_INPUT", message: "先用一句话说说想增加什么功能" });
  }
  const { profile, extra } = await getActiveProfile(req.user.id, buddyId);
  const customBuddy = getCustomBuddy(extra, buddyId);
  if (!customBuddy) {
    return res.status(404).json({ error: "NOT_FOUND", message: "只有自定义搭子可以添加智能功能" });
  }
  if (!profile) {
    return res.status(409).json({ error: "NOT_ACTIVE", message: "这段陪伴还没有开始，或已经毕业" });
  }
  const text = parsed.data.text;
  const fallback = sanitizeFeatureDraft(null, { text });
  try {
    const result = await invokeKimiText({
      systemPrompt: `你是心栈 SoulSentry 的自定义搭子功能设计师。用户要给自己的搭子增加一个可以点进去使用的功能入口，可能是健身指导、菜单与做菜指导、方案定制、资料查询等。功能必须：
- 有清晰的输入和输出，用户输入需求后能得到具体、可执行的结果；
- 如果需要参考资料，明确按「优先参考用户为这个功能上传的资料」执行；
- 不编造用户没有提供的身体数据、食材、预算或事实；
- 只输出严格 JSON，不要 markdown、代码块或解释。`,
      prompt: `这颗自定义搭子叫「${customBuddy.name}」，定位：${customBuddy.expertise || customBuddy.slogan || "围绕用户目标提供具体帮助"}。它的能力：${(customBuddy.abilities || []).slice(0, 4).join("；")}。
用户想增加的功能：
「${text}」

请把它设计成这个搭子空间里的一个功能入口，输出 JSON：
{
  "label": "入口名，2-8个字，如「个性化指导」「菜单」",
  "hint": "一句话说明这个入口能做什么（40字内）",
  "instructions": "给搭子的执行说明（150-500字）：用户会输入什么、你要输出什么、如何优先使用用户上传的参考资料、需要先追问哪些最少的关键信息、专业边界是什么；不要写空泛的陪伴话术",
  "placeholder": "输入框提示，20字内",
  "examples": ["用户可能这样问1（30字内）", "用户可能这样问2"],
  "icon": "从 sparkles/dumbbell/chef-hat/utensils/gauge/list-checks/notebook-pen/wallet/trophy/heart-pulse/calendar-check/cloud-sun/bot/brain/briefcase/messages-square 里选一个"
}`,
      responseJsonSchema: true,
      models: FAST_TEXT_MODELS,
      maxTokens: 1200,
      fetchTimeout: 25000,
    });
    return res.json({ feature: sanitizeFeatureDraft(result?.data, { text }) });
  } catch (error) {
    console.warn("[buddies/features] 功能设计 AI 失败，使用兜底:", error?.message || error);
    return res.json({ feature: fallback, degraded: true });
  }
});

function publicMaterial(row) {
  return {
    id: row.id,
    name: row.name,
    file_url: row.fileUrl,
    file_type: row.fileType,
    chars: String(row.text || "").length,
    created_at: row.createdAt,
  };
}

buddiesRouter.get("/:id/features/:featureId/materials", async (req, res) => {
  const ctx = await getCustomFeatureContext(req, res);
  if (!ctx) return;
  const rows = await prisma.buddyMaterial.findMany({
    where: { userId: req.user.id, buddyId: featureMaterialScope(ctx.buddyId, ctx.feature.id) },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, fileUrl: true, fileType: true, text: true, createdAt: true },
  });
  return res.json({ materials: rows.map(publicMaterial), limit: 5 });
});

buddiesRouter.post("/:id/features/:featureId/materials", async (req, res) => {
  const ctx = await getCustomFeatureContext(req, res);
  if (!ctx) return;
  const parsed = materialSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: parsed.error.flatten() });
  }
  const scope = featureMaterialScope(ctx.buddyId, ctx.feature.id);
  const count = await prisma.buddyMaterial.count({ where: { userId: req.user.id, buddyId: scope } });
  if (count >= 5) {
    return res.status(400).json({ error: "LIMIT_REACHED", message: "这个功能最多保留 5 份参考资料，先删掉旧的再加" });
  }
  const text = await readAttachmentText({
    url: parsed.data.file_url,
    name: parsed.data.name,
    type: parsed.data.type,
  }).catch(() => "");
  const extracted = String(text || "").trim();
  if (!extracted || /不支持的文件类型|文件内容为空|文件内容提取失败|文件过大/.test(extracted)) {
    return res.status(400).json({
      error: "EMPTY_CONTENT",
      message: "没有从这份资料里读到可用的文字；扫描件可以先转成文字，或换一份 PDF/Word/文本",
    });
  }
  const material = await prisma.buddyMaterial.create({
    data: {
      userId: req.user.id,
      buddyId: scope,
      name: parsed.data.name.slice(0, 200),
      fileUrl: parsed.data.file_url,
      fileType: parsed.data.type || null,
      text: String(text).slice(0, 12000),
    },
  });
  return res.status(201).json({ material: publicMaterial(material) });
});

buddiesRouter.delete("/:id/features/:featureId/materials/:materialId", async (req, res) => {
  const ctx = await getCustomFeatureContext(req, res);
  if (!ctx) return;
  const deleted = await prisma.buddyMaterial.deleteMany({
    where: {
      id: req.params.materialId,
      userId: req.user.id,
      buddyId: featureMaterialScope(ctx.buddyId, ctx.feature.id),
    },
  });
  if (deleted.count === 0) {
    return res.status(404).json({ error: "NOT_FOUND", message: "资料不存在" });
  }
  return res.json({ ok: true });
});

// POST /api/buddies/:id/state —— 合并写入本搭子的板块状态（领域档案隔离：只动本搭子的 state）
buddiesRouter.post("/:id/state", async (req, res) => {
  const buddyId = req.params.id;
  const patch = req.body?.patch;
  if (!isPlainObject(patch)) {
    return res.status(400).json({ error: "INVALID_INPUT", message: "patch 必须是对象" });
  }
  if (JSON.stringify(patch).length > 60000) {
    return res.status(413).json({ error: "TOO_LARGE", message: "板块状态过大，请联系心栈" });
  }
  const { pref, profiles, profile, extra } = await getActiveProfile(req.user.id, buddyId);
  if (!isKnownBuddyId(BUDDY_IDS, extra, buddyId)) {
    return res.status(404).json({ error: "NOT_FOUND", message: "这颗搭子还没有来到货架" });
  }
  if (!profile) {
    return res.status(409).json({ error: "NOT_ACTIVE", message: "这段陪伴还没有开始，或已经毕业" });
  }
  const state = deepMergeState(isPlainObject(profile.state) ? profile.state : {}, patch);
  profiles[buddyId] = { ...profile, state };
  await writeExtraFields(req.user.id, pref, { buddy_profiles: profiles });
  return res.json({ state });
});

// POST /api/buddies/:id/persona —— 单独切换某颗搭子的陪伴人格（不影响全局小助手人格）
buddiesRouter.post("/:id/persona", async (req, res) => {
  const buddyId = req.params.id;
  const persona = String(req.body?.persona || "");
  if (!["gentle", "strict", "buddy"].includes(persona)) {
    return res.status(400).json({ error: "INVALID_INPUT", message: "未知的人格类型" });
  }
  const { pref, profiles, profile, extra } = await getActiveProfile(req.user.id, buddyId);
  if (!isKnownBuddyId(BUDDY_IDS, extra, buddyId)) {
    return res.status(404).json({ error: "NOT_FOUND", message: "这颗搭子还没有来到货架" });
  }
  if (!profile) {
    return res.status(409).json({ error: "NOT_ACTIVE", message: "这段陪伴还没有开始，或已经毕业" });
  }
  profiles[buddyId] = { ...profile, persona };
  await writeExtraFields(req.user.id, pref, { buddy_profiles: profiles });
  return res.json({ persona });
});

/* ---------- 搭子 Agent：领域技能（引导式解题 / 弹性行程 / 周报小结 / 讲书回应） ---------- */

const PERSONA_TONES = {
  gentle: "温柔陪伴型——轻声细语，永远先接住情绪，不催促、不评判。",
  strict: "严格督学型——目标导向，语气温和但直接，盯进度也盯质量；用户未完成时帮他找原因而不是一味安慰。",
  buddy: "战友互卷型——像并肩作战的朋友，轻松幽默，可以互相卷也互相扛，多用「我们」「一起」。",
};

const agentSchema = z.object({
  mode: z.enum(["solve_locate", "solve_hint", "solve_quiz", "itinerary", "inspiration", "weekly", "talk", "chat", "greeting", "feature", "run_parse", "read_parse"]),
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
  running:
    "你是耐力跑步教练，风格是「陪跑型教练」而不是严厉教官：擅长周期化训练、轻松跑/间歇/节奏跑/长距离配比、配速与心率区间、伤痛预防与交叉训练。严守安全红线：周跑量增幅不超过 10%，每第 4 周减量，缺跑不补课，疼痛先停跑。绝不鼓励带伤硬练或补偿性加量。",
};

// 搭子对话里的「成立小组 / 拉伙伴一起做」意图：本地快速识别并给出可确认的协同小组提案，
// 不把这类明确诉求交给慢模型自由发挥，避免超时后落到通用兜底话术。
const GROUP_TOPICS = ["考公", "考研", "英语", "数学", "四六级", "雅思", "托福", "法考", "教资", "CPA", "高考", "中考", "编程", "健身", "减脂", "跑步", "马拉松", "半马", "全马", "跑团", "越野", "读书", "早起"];

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

/**
 * 搭子对话里的「随口记录」：用户报的跑量、读到的书、学的内容，直接从对话里结构化提取。
 * 只认用户亲历、可核对的事实；提问、计划、建议一律不记，避免把聊天污染成假数据。
 */
function buildCaptureSpec(buddyId, custom = false) {
  const head =
    `同时判断这条消息是否带来了用户亲历的真实数据，需要同步进这个搭子空间的日常记录。只提取用户明确自述或附件里可核对的事实，绝不把提问、假设、计划、建议当成数据；拿不准就 kind="none"。capture 通用格式：{"kind":"...","confidence":0到1,"checkin":true/false,"summary":"给用户看的回执（16字内）","data":{...}}；checkin 表示这件事今天已完成、应记为今日打卡；confidence 低于 0.6 时 kind 必须是 "none"。`;
  if (custom) {
    return `${head}这颗搭子由用户自己设计：kind="daily_note"，data={"topic":"一句话主题（16字内）","note":"用户提供的可记录信息（80字内）","metrics":{用户明确说出的数值字段}}。`;
  }
  switch (buddyId) {
    case "running":
      return `${head}跑步：kind="running_log"，data={"distance_km":本次公里数或null,"duration_min":本次用时分钟数或null,"avg_hr":平均心率或null,"date":"YYYY-MM-DD"或null,"note":"身体感受或路线（30字内）"}。距离和用时至少有一项才记录；用户只是问训练问题、没有报告本次跑步数据时 kind="none"。`;
    case "reading":
      return `${head}读书：kind="reading_log"，data={"book":"书名（不带书名号）或null","minutes":本次新增阅读分钟数或null,"pages_read":读了多少页或null,"summary":"用户读到或讲到的内容概述（60字内），没有就空字符串","quote":"原文摘录或null","finished":是否读完 true/false,"note":"感受（30字内）"}。用户上传书页、读书截图或摘抄并说明自己读了，也按此提取，checkin=true；用户说「今天一共读了30分钟」时，用上下文里今日已读分钟数换算成本次新增，无法确定就 minutes=null；只是问书、求推荐、讨论观点时 kind="none"。`;
    case "study":
      return `${head}学习：kind="study_log"，data={"minutes":本次新增学习分钟数或null,"topic":"学习内容（30字内）","accuracy":正确率百分数或null,"note":"卡点或感受（30字内）"}。用户说今天已学完/完成今日学习任务时 checkin=true。`;
    case "morning":
      return `${head}早起：kind="wake_log"，data={"wake_time":"HH:MM或null","sleep_h":睡眠小时数或null,"note":"起床后的感受（30字内）"}。用户说自己已起床/已打卡时 checkin=true；只是问赖床怎么办时 kind="none"。`;
    case "travel":
      return `${head}旅行：kind="travel_note"，data={"dest":"目的地或null","day":"第几天或null","note":"实际去了哪、花了多少、真实感受（60字内）"}。只是问攻略时 kind="none"。`;
    default:
      return `${head}kind="daily_note"，data={"topic":"一句话主题（16字内）","note":"用户提供的可记录信息（80字内）","metrics":{用户明确说出的数值字段}}。`;
  }
}

function buildAgentPrompt(buddyId, mode, payload, personaTone, answers, buddyMeta = {}) {
  const buddyName = buddyMeta.name || BUDDY_NAMES[buddyId] || "搭子";
  const expertise = buddyMeta.expertise || BUDDY_EXPERTISE[buddyId] || "";
  const profileLine =
    answers && Object.keys(answers).length > 0
      ? `关于这位用户，${buddyName}记住的领域档案：${Object.values(answers).join("；")}。`
      : "";
  const customLine = buddyMeta.custom
    ? `这颗搭子由用户自己设计：主张「${buddyMeta.slogan || ""}」；专业能力是${(buddyMeta.abilities || buddyMeta.actions || []).join("；") || "围绕用户目标给具体指导"}；陪伴动作是${(buddyMeta.actions || []).join("；")}；记忆范围：${buddyMeta.memory || "用户的目标与进展"}。回答专业问题时必须用上这些能力，给出具体步骤、方法或示范，不能只做空泛陪伴。`
    : "";
  const materialLine = buddyMeta.materialContext
    ? `\n用户给这颗搭子上传了专属资料。回答时优先依据这些资料，给出具体的专业判断；资料没有覆盖的内容就说「资料里没写到，我按一般经验说说」，不要编造：\n${buddyMeta.materialContext}\n`
    : "";
  const webLine = buddyMeta.webContext
    ? `\n刚刚从公开网页检索到的背景资料如下。请用它补充专业细节和实际操作步骤，不要编造来源链接；如果网页信息与用户上传资料冲突，以用户资料为准：\n${buddyMeta.webContext}\n`
    : "";
  const base = `你是心栈 SoulSentry 里的「${buddyName}」，人格：${personaTone}${profileLine}${customLine}${materialLine}${webLine}说话用简体中文，语气像朋友，不要列表式说教。`;

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
      // 动态调整时前端会把当前完整行程（含交通/住宿/每日安排）一起带进来
      const note = String(payload.note || "").slice(0, 6000);
      const hasCurrent = /当前行程/.test(note);
      return {
        systemPrompt: `${base}你是资深自由行定制师，行程必须能直接执行：地理顺序合理、交通耗时真实、每天 2-3 个主要安排、留 20% 空白、避开闭馆日和高峰、标注预约门槛、给出雨天备选和人均预算。绝不编造不存在的地点或营业信息；不确定的预约信息提醒用户查官方。所有安排必须与目的地「${dest}」严格匹配，绝不出现其他城市的景点。`,
        prompt: `为「${dest}」规划 ${days} 天弹性行程，旅行风格「${style}」。${note ? `\n用户/当前行程信息：\n${note}\n` : ""}
只输出严格 JSON，结构如下：
{"summary":"整体节奏一句话（30字内）","area":"主要区域（15字内）","transport":"往返+当地交通（30字内）","stay":"住宿区域/类型（30字内）","budget":"人均预算区间（20字内）","highlights":["亮点1（12字内）","亮点2","亮点3"],"booking":["需要提前预约/注意的事项（20字内，最多3条）"],"days":[{"day":"D1","title":"当天主题（10字内）","area":"当天区域（10字内）","pace":"轻松|适中|充实","weather":"室内为主|户外为主|看天气","rain_backup":"下雨备选概述（20字内）","rain_activities":[{"time":"10:00","name":"雨天室内安排（12字内）","detail":"怎么去/玩多久（25字内）","type":"sight|food|rest"}],"activities":[{"time":"09:30","name":"安排（12字内）","detail":"怎么去/玩多久（25字内）","type":"transport|sight|food|stay|rest"}],"food":"餐饮（20字内）","stay":"当晚住宿（20字内）","transport":"当天交通（25字内）","budget":"当天人均（20字内）","tip":"避坑/预约提示（30字内）"}],"changes":["本次实际改动（20字内，最多3条；首次生成可为空数组）"]}
要求：每天 2-3 个 activities，时间顺序正确；同一区域优先；交通写明方式和大致耗时；不要排得过满；有户外安排的天必须给 1-2 个具体可执行的 rain_activities（室内/雨天备选）。${hasCurrent ? "\n当前已有行程：只调整与新要求相关的天和字段，其他安排尽量原样保留；不要无故重排；changes 必须列出实际改动。" : ""}`,
      };
    }
    case "inspiration": {
      const dest = String(payload.dest || "").slice(0, 30);
      return {
        systemPrompt: `${base}你是资深旅行策划师：只推荐目的地本地或当日往返可达的真实体验，给实操提示（最佳时间/预约方式/避坑）。严禁推荐与目的地无关的任何地点。`,
        prompt: `用户的目的地是「${dest || "云南大理"}」。推荐 6 个当地灵感（体验/美食/景点各约 2 个，全部必须在「${dest || "云南大理"}」本地或当日往返可达），只输出 JSON：{"ideas":[{"kind":"体验","name":"名称（12字内）","desc":"一句话实操提示（40字内，含最佳时间/预约/避坑）"}]}`,
      };
    }
    case "run_parse": {
      const typed = String(payload.text || "").trim().slice(0, 800);
      const attachmentText = String(payload.attachment_text || "").trim().slice(0, 4000);
      const source = [typed, attachmentText ? `截图/附件识别内容：\n${attachmentText}` : ""].filter(Boolean).join("\n\n");
      return {
        systemPrompt: `${base}${expertise}你现在只做运动数据提取：忠实转写，不评价、不编造、看不清就留空。`,
        prompt: `从下面这条跑步记录（截图文字或用户手输）中提取数据：\n「${source || "（没有可识别的内容）"}」\n\n只输出 JSON：{"distance_km":数字或null,"duration_min":数字或null,"pace":"分'秒\\""或null,"avg_hr":数字或null,"date":"YYYY-MM-DD"或null,"confidence":0到1}。duration_min 用分钟，可含小数；pace 是每公里配速；看不清的字段填 null，绝不猜。`,
      };
    }
    case "read_parse": {
      const typed = String(payload.text || "").trim().slice(0, 800);
      const attachmentText = String(payload.attachment_text || "").trim().slice(0, 5000);
      const source = [typed, attachmentText ? `书页/截图识别内容：\n${attachmentText}` : ""].filter(Boolean).join("\n\n");
      return {
        systemPrompt: `${base}${expertise}你现在只做读书记录提取：忠实转写书页/截图和用户自述，不评价、不编造，看不清就留空。`,
        prompt: `从下面这条读书记录（书页截图文字或用户手输）中提取：\n「${source || "（没有可识别的内容）"}」\n\n只输出 JSON：{"book":"书名（不带书名号）或null","minutes":本次新增阅读分钟数或null,"pages_read":本次读了多少页或null,"summary":"读到的内容概述（60字内），没有就空字符串","quote":"书中原文摘录或null","finished":是否读完 true/false,"did_read":用户是否在报告今天读了 true/false,"confidence":0到1}。只提取用户亲历的阅读事实；用户只是在问书、求推荐、讨论观点时 did_read=false 且 book/minutes/pages_read 为 null。绝不猜数字。`,
      };
    }
    case "weekly": {
      const stats = String(payload.stats || "").slice(0, 800);
      const runningHint =
        buddyId === "running"
          ? "这是跑步周复盘：重点看周跑量、完成率、配速与恢复信号（疲劳、睡眠、疼痛）；宁可保守，绝不鼓励冒进或补偿性加量。"
          : "";
      return {
        systemPrompt: `${base}${runningHint}你在写本周复盘。低谷时先接住情绪再谈改进，高光时具体指出哪做对了。`,
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
    case "feature": {
      const feature = buddyMeta.feature || {};
      const message = String(payload.message || "").trim().slice(0, 3000);
      const context = String(payload.context || "").slice(0, 800);
      const history = Array.isArray(payload.history)
        ? payload.history
            .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
            .slice(-8)
            .map((m) => `${m.role === "user" ? "用户" : buddyName}：${String(m.content).slice(0, 600)}`)
            .join("\n")
        : "";
      if (feature.mode === "language") {
        const targetLanguage = /日语|Japanese/i.test(`${feature.label} ${feature.instructions}`) ? "日语"
          : /韩语|Korean/i.test(`${feature.label} ${feature.instructions}`) ? "韩语"
            : /法语|French/i.test(`${feature.label} ${feature.instructions}`) ? "法语"
              : /西班牙语|Spanish/i.test(`${feature.label} ${feature.instructions}`) ? "西班牙语"
                : "英语";
        return {
          systemPrompt: `${base}你现在是双语口语陪练。先用自然、地道的${targetLanguage}回应用户（1-3 句），再给出准确中文翻译；根据用户刚才的表达给一个具体纠错或升级说法；最后只用${targetLanguage}的一个问题把对话继续下去。不要一次讲太多，不要替用户编造经历。用户上传的教材和网页检索结果可作为场景词汇、表达和纠错依据。`,
          prompt: `用户刚说：${message || `（用户还没有开口，先由你发起一个简单的${targetLanguage}对话）`}\n${history ? `此前在这个功能里的对话：\n${history}\n` : ""}${context ? `用户当前上下文：${context}\n` : ""}\n请输出严格 JSON，不要输出 Markdown 代码块：
{
  "reply": "先用${targetLanguage}回应或追问（1-3句，自然口语）",
  "translation": "reply 的忠实中文翻译",
  "artifact": {
    "title": "本轮练习主题（12字内）",
    "subtitle": "场景说明（30字内）",
    "scenario": "当前对话场景（40字内）",
    "phrases": [
      {"en": "实用${targetLanguage}表达", "zh": "中文意思", "tip": "发音或用法提示（30字内）"}
    ],
    "feedback": {"good": "用户这次做得好的具体点（40字内）", "improve": "一个可改进点（40字内）", "next": "下一步建议（30字内）"},
    "tips": ["口语小提醒（40字内）"],
    "followups": ["用户可以接着说的一句${targetLanguage}（30字内）"]
  }
}
要求：phrases 2-4 条且必须双语；feedback 要针对用户这次真实表达，不能空泛；reply 用${targetLanguage}，translation 用中文且忠实；每轮只推进一个交流目标；如果用户用中文回答，先用${targetLanguage}复述并鼓励用${targetLanguage}说。不要把来源链接写进 artifact。`,
        };
      }
      return {
        systemPrompt: `${base}你现在在执行用户自定义的功能「${feature.label || "智能功能"}」。这个功能的设定：${feature.instructions || "根据用户需求给出具体、可执行的结果。"}${feature.hint ? `入口说明：${feature.hint}。` : ""}请严格围绕功能设定和用户需求回答。有参考资料时优先依据资料；资料没有覆盖的部分，可以给一般性的专业参考，但要明确说明依据边界，不要编造用户数据、事实或医疗/安全结论。结果必须让用户能直接照着做：先给结论，再给具体步骤和关键提醒。回答用简体中文，内容要有设计感，适合用卡片、图文和步骤清单呈现。`,
        prompt: `用户需求：${message || "（用户没有填写具体需求）"}\n${history ? `此前在这个功能里的对话：\n${history}\n` : ""}${context ? `用户当前上下文：${context}\n` : ""}\n请输出严格 JSON，不要输出 Markdown 代码块：
{
  "reply": "一两句话说明结果和最关键提醒（80字内）",
  "artifact": {
    "title": "结果标题（16字内）",
    "subtitle": "一句说明（30字内）",
    "badges": ["标签1（8字内）", "标签2"],
    "cards": [
      {"title": "菜名/训练日/方案项（14字内）", "subtitle": "口味、类型或适合场景（30字内）", "tags": ["标签（8字内）"], "body": "关键参考：食材、动作或为什么适合（100字内）"}
    ],
    "steps": [
      {"title": "步骤名（14字内）", "detail": "具体怎么做（120字内）", "minutes": 5}
    ],
    "tips": ["关键提醒（40字内）"],
    "followups": ["用户可继续问的一个问题（30字内）"]
  }
}
要求：cards 2-4 个，steps 3-6 个；菜单/菜谱类 cards 放菜品选择，steps 放烹饪操作；训练/方案类 cards 放训练日或方案项，steps 放实际动作；所有用量、时间、动作要点必须具体可执行，不确定的写「按实际情况调整」。不要把来源链接写进 artifact，来源由系统另行附上。`,
      };
    }
    case "greeting": {
      const context = String(payload.context || "").slice(0, 600);
      return {
        systemPrompt: `${base}${expertise}开场白必须落在真实进度上，给出一个具体可执行的提醒，不说套话。`,
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
        systemPrompt: `${base}${expertise}用户此刻的真实上下文：${context || "（暂无）"}。回答前先判断用户处在「目标设定 / 执行卡点 / 复盘调整」哪一阶段；给一个专业框架 + 一个今天就能做的最小动作，拒绝空泛的正确话。如果用户想成立小组、拉伙伴一起做某件事（如「成立一个专门考公的学习小组」），不要只给建议：在 proposal 里给出可确认的协同小组提案（type=create_collab，title=小组名，goal=一句话目标，scenario=friends），reply 里说明确认后会创建；普通问题 proposal 为 null。如果用户明确要你建一条具体的执行任务/提醒/待办（如「帮我建一条今晚 9 点刷题的任务」），在 task 里给出 {"title":"任务标题（20字内）","description":"一句话说明","due_at":"带时区的 ISO 时间或null"}，reply 里说明确认后会创建；普通建议或讲解不要输出 task。用户可能随消息发来图片或文件，附件会以识别后的文本提供给你，必须结合附件内容回答。`,
        prompt: `以下是用户与${buddyName}的最近对话：\n${history}\n${attachmentText ? `\n用户这条消息附带的图片/文件内容（已识别）：\n${attachmentText}\n` : ""}\n以${buddyName}的身份回复最后一条用户消息（120字内）：先结合上下文里的真实进度指出一个具体事实，再给最实在的专业指导和下一步；涉及情绪先接住再引导。\n${buildCaptureSpec(buddyId, Boolean(buddyMeta.custom))}\n只输出 JSON：{"reply":"...","proposal":null,"task":null,"capture":{"kind":"none"}}；需要创建小组时 proposal 输出 {"type":"create_collab","title":"...","goal":"...","scenario":"friends"}；用户明确要你建任务时才输出 task；有可落库数据时按上面的 capture 规范输出。`,
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
          const [todayStart, todayEnd] = beijingDayRange(beijingToday());
          const [total, week, today] = await Promise.all([
            prisma.checkin.count({ where: { taskId: projectTask.id } }),
            prisma.checkin.count({ where: { taskId: projectTask.id, createdAt: { gte: since } } }),
            prisma.checkin.count({ where: { taskId: projectTask.id, createdAt: { gte: todayStart, lt: todayEnd } } }),
          ]);
          lines.push(`打卡：累计 ${total} 次，近 7 天 ${week} 次，今天${today > 0 ? "已" : "还没"}打卡`);
        }
      }
    }

    if (buddyId === "running" && profile?.state && typeof profile.state === "object") {
      const st = profile.state;
      const logs = Array.isArray(st.logs)
        ? [...st.logs].sort((a, b) => String(b?.date || "").localeCompare(String(a?.date || "")))
        : [];
      const since = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
      const week = logs.filter((l) => String(l?.date || "") >= since);
      const km7 = week.reduce((sum, l) => sum + (Number(l?.distance_km) || 0), 0);
      const bits = [`近 7 天跑步 ${week.length} 次，合计 ${Math.round(km7 * 10) / 10} km`];
      const last = logs[0];
      if (last) {
        bits.push(
          `最近一次：${last.date || "未知日期"} ${last.title || "跑步"} ${last.distance_km || "?"} km${last.duration_min ? ` / ${last.duration_min} 分钟` : ""}`
        );
      }
      const injuries = (Array.isArray(st.injuries) ? st.injuries : []).filter((i) => i?.status !== "recovered");
      if (injuries.length > 0) bits.push(`在跟踪的伤病：${injuries.map((i) => i.area || "未注明").slice(0, 3).join("、")}`);
      const body = (Array.isArray(st.body) ? [...st.body] : [])
        .sort((a, b) => String(b?.date || "").localeCompare(String(a?.date || "")))[0];
      if (body) {
        bits.push(`最近身体状态：睡眠 ${body.sleep_h || "?"} 小时，疲劳 ${body.fatigue || "?"}/5`);
      }
      const shoes = Array.isArray(st.gear?.shoes) ? st.gear.shoes : [];
      const defaultShoe = shoes.find((s) => s.id === st.gear?.default_shoe_id) || shoes[0];
      if (defaultShoe) bits.push(`默认跑鞋 ${defaultShoe.name || "未命名"} 已跑 ${Math.round(Number(defaultShoe.km) || 0)} km`);
      lines.push(`跑步档案：${bits.join("；")}`);
    }

    // 读书：最近笔记 + 今日分钟数，让对话接着上次读到的地方聊
    if (buddyId === "reading" && profile?.state && typeof profile.state === "object") {
      const st = profile.state;
      const chinaToday = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
      const todayMins = Number(st.mins?.[chinaToday]) || 0;
      if (todayMins > 0) lines.push(`今日已读 ${todayMins} 分钟`);
      const recentNotes = (Array.isArray(st.notes) ? st.notes : [])
        .filter((n) => n && (n.text || n.quote))
        .slice(-3)
        .reverse()
        .map((n) => `《${String(n.book || "在读的书").slice(0, 20)}》${String(n.text || n.quote).slice(0, 30)}`);
      if (recentNotes.length > 0) lines.push(`最近读书笔记：${recentNotes.join("；")}`);
    }

    // 对话里随口记下的日常记录（学习 / 早起 / 旅行 / 自定义搭子…），下次对话要接得住
    const recentCaptures = Array.isArray(profile?.state?.captures) ? profile.state.captures.slice(-5) : [];
    if (recentCaptures.length > 0) {
      lines.push(
        `最近日常记录：${recentCaptures
          .filter((c) => c && (c.topic || c.text))
          .map((c) => `${String(c.day || "").slice(5)} ${String(c.topic || c.text).slice(0, 30)}`)
          .join("；")}`
      );
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
buddiesRouter.post("/:id/agent", aiRequestContext, async (req, res) => {
  const buddyId = req.params.id;
  const parsed = agentSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: parsed.error.flatten() });
  }
  const { profiles, profile, extra } = await getActiveProfile(req.user.id, buddyId);
  if (!isKnownBuddyId(BUDDY_IDS, extra, buddyId)) {
    return res.status(404).json({ error: "NOT_FOUND", message: "这颗搭子还没有来到货架" });
  }
  if (!profile) {
    return res.status(409).json({ error: "NOT_ACTIVE", message: "这段陪伴还没有开始，或已经毕业" });
  }
  const buddyPersona = pickBuddyPersona(profile, extra.persona, buddyId);
  const personaTone = PERSONA_TONES[buddyPersona] || PERSONA_TONES.gentle;
  const customBuddy = getCustomBuddy(extra, buddyId);
  let payload = parsed.data.payload || {};
  let feature = null;
  if (parsed.data.mode === "feature") {
    if (!customBuddy) {
      return res.status(400).json({ error: "INVALID_INPUT", message: "只有自定义搭子可以执行智能功能" });
    }
    const featureId = String(payload.feature_id || "").trim().slice(0, 48);
    const modules = Array.isArray(profile.layout?.modules) ? profile.layout.modules : [];
    feature = modules.find((item) => item?.id === featureId && item?.type === "assistant") || null;
    if (!feature) {
      return res.status(404).json({ error: "FEATURE_NOT_FOUND", message: "这个功能入口不存在，先在页面模块里添加" });
    }
  }
  let materialContext = "";
  if (customBuddy) {
    try {
      let materials = [];
      if (feature) {
        materials = await prisma.buddyMaterial.findMany({
          where: { userId: req.user.id, buddyId: featureMaterialScope(buddyId, feature.id) },
          orderBy: { createdAt: "desc" },
          take: 5,
          select: { name: true, text: true },
        });
      }
      if (materials.length === 0) {
        materials = await prisma.buddyMaterial.findMany({
          where: { userId: req.user.id, buddyId },
          orderBy: { createdAt: "desc" },
          take: 5,
          select: { name: true, text: true },
        });
      }
      materialContext = materials
        .map((item) => `【${item.name}】\n${item.text}`)
        .join("\n\n")
        .slice(0, 6000);
    } catch (error) {
      console.warn("[buddies/agent] 读取专属资料失败:", error?.message || error);
    }
  }
  let webContext = "";
  let webReferences = [];
  if (feature && feature.web_research !== false) {
    const query = [
      customBuddy?.name,
      feature.label,
      String(payload.message || "").slice(0, 180),
    ].filter(Boolean).join(" ").slice(0, 300);
    try {
      const search = await invokeKimiWebSearch({ query, maxRounds: 2, fetchTimeout: 12000 });
      webContext = String(search.answer || "").slice(0, 5000);
      webReferences = await enrichFeatureReferences(search.references);
    } catch (error) {
      console.warn("[buddies/agent] 功能联网检索失败，继续使用资料:", error?.message || error);
    }
  }
  const buddyMeta = customBuddy ? {
    name: customBuddy.name,
    expertise: customBuddy.expertise,
    custom: true,
    slogan: customBuddy.slogan,
    abilities: customBuddy.abilities,
    actions: customBuddy.actions,
    memory: customBuddy.memory,
    materialContext,
    webContext,
    feature: feature ? {
      id: feature.id,
      label: feature.label,
      hint: feature.hint,
      instructions: feature.instructions,
      placeholder: feature.placeholder,
      web_research: feature.web_research !== false,
      mode: feature.mode === "language" ? "language" : "guide",
    } : null,
  } : {};
  const lastUserText = parsed.data.mode === "feature"
    ? String(payload.message || "").slice(0, 2000)
    : Array.isArray(payload.messages)
      ? [...payload.messages].reverse().find((m) => m?.role === "user" && typeof m.content === "string")?.content || ""
      : "";
  const isInteractive = ["chat", "greeting", "talk", "feature"].includes(parsed.data.mode);

  // 搭子对话/解题支持图片与文件：先提取图片 OCR / 文件文本，再交给领域提示词
  const attachments = Array.isArray(payload.attachments) ? payload.attachments.slice(0, 3) : [];
  const hasAttachments = attachments.some((att) => att?.url || att?.file_url);
  if (hasAttachments && ["chat", "solve_locate", "run_parse", "read_parse"].includes(parsed.data.mode)) {
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
    lastUserText.length > (buddyId === "travel" ? 120 : 60) ||
    // 旅游的「规划/安排」由独立的行程生成器接手，聊天本身用快速模型回一句即可，
    // 避免用户在等行程图时还被 K3 的 15-30 秒拖着
    (buddyId !== "travel" && /(小组|协同|计划|规划|方案|目标|考公|考研|英语|数学|复习|安排|成立|创建|跑步|跑量|配速|半马|全马|马拉松|伤痛|膝盖)/.test(lastUserText));
  // 行程/灵感是结构化生成：K2.7 code-highspeed 通常 6-10 秒出 JSON；
  // 行程信息更丰富，单独给更大的输出预算和稍长超时；超时/失败自动切 DeepSeek。
  const isItinerary = parsed.data.mode === "itinerary";
  const isStructured = ["itinerary", "inspiration"].includes(parsed.data.mode);
  const structuredMaxTokens = isItinerary ? 8000 : 4000;
  // K2.7 在长 JSON 上经常想很久；给 Kimi 3 秒先试，超时立刻走 DeepSeek。
  // DeepSeek 生成完整行程约 6 秒，给它 15 秒窗口，避免被 Kimi 的短超时一起截断。
  const structuredFetchTimeout = isItinerary ? 15000 : 12000;
  const structuredEndpointTimeouts = isItinerary ? { primary: 3000, fallback: 3000, deepseek: 15000 } : undefined;
  const structuredOuterTimeout = isItinerary ? 22000 : 20000;
  const useFast = isInteractive && !isComplex;

  if (isInteractive) {
    const liveContext = await loadBuddyLiveContext(req.user.id, buddyId, profile);
    if (liveContext) {
      payload = { ...payload, context: [payload.context, liveContext].filter(Boolean).join("；") };
    }
  }
  const built = buildAgentPrompt(buddyId, parsed.data.mode, payload, personaTone, profile.answers, buddyMeta);
  if (!built) {
    return res.status(400).json({ error: "INVALID_INPUT", message: "未知的技能模式" });
  }
  try {
    const data = await Promise.race([
      invokeKimiText({
        prompt: built.prompt,
        systemPrompt: built.systemPrompt,
        responseJsonSchema: true,
        models: isStructured ? STRUCTURED_TEXT_MODELS : useFast ? FAST_TEXT_MODELS : undefined,
        // Kimi K3 / K2.7 的推理 token 也占输出预算，预算太小会返回空内容；
        // 留足预算，失败时再由 callKimiChat 切 DeepSeek
        maxTokens: isStructured ? structuredMaxTokens : useFast ? 1500 : 2500,
        fetchTimeout: isStructured ? structuredFetchTimeout : useFast ? 20000 : 45000,
        endpointFetchTimeouts: isStructured ? structuredEndpointTimeouts : undefined,
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("AGENT_TIMEOUT")), isStructured ? structuredOuterTimeout : useFast ? 28000 : 60000)
      ),
    ]);
    if (parsed.data.mode === "solve_locate" && payload.attachment_text) {
      return res.json({ data: { ...(data && typeof data === "object" ? data : {}), problem_text: payload.attachment_text } });
    }
    if (feature) {
      const artifact = sanitizeFeatureArtifact(data?.artifact);
      const reply = String(data?.reply || data?.text || artifact?.subtitle || "").trim().slice(0, 4000);
      return res.json({
        data: {
          reply,
          translation: feature.mode === "language" ? String(data?.translation || "").trim().slice(0, 1200) : "",
          artifact,
          references: sanitizeFeatureReferences(webReferences),
        },
      });
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

/* =====================================================================
   主聊天框 @搭子：从首页通用对话直接路由到某颗搭子
   - 复用搭子人格、领域档案、专属资料、实时上下文和 capture 提取
   - 附件复用搭子对话的 OCR；漏提取时用 run_parse / read_parse 兜底
   ===================================================================== */

/** 早起意图：只认「我起床了 / 起来了 / 醒了」，躲开「看起来 / 想起来 / 你醒了吗」这类误判 */
function isWakeIntent(rawText) {
  const text = String(rawText || "");
  if (!text) return false;
  if (/(不想|没起|还没|赖床|再睡|起不来|不打卡|别打卡)/.test(text)) return false;
  const cleaned = text.replace(/(看起来|听起来|想起来|做起来|说起来|读起来|用起来|拿起来|站起来|坐起来|好起来)/g, "");
  const hasSelf = /(^|[，,。！!\s])(我|俺|咱)/.test(cleaned);
  const hasWake = /(起床|起来了|醒来|醒了|睡醒)/.test(cleaned);
  const shortWake = /^(起床了|醒了|起来了|刚起床|刚起来|刚醒|刚刚起床|刚刚起来|刚刚醒)(?!吗|呢|没|[?？])/.test(cleaned.trim());
  return (hasSelf && hasWake) || shortWake;
}

/** 解析主聊天要接手的搭子：显式 @ 选择优先，其次是正文里的搭子名/明显领域动作 */
export async function resolveCompanionBuddyId(userId, rawText, explicitBuddyId = null) {
  try {
    const { extra } = await readExtraFields(userId);
    const profiles = extra.buddy_profiles && typeof extra.buddy_profiles === "object" ? extra.buddy_profiles : {};
    const activeIds = Object.keys(profiles).filter((id) => profiles[id]?.status === "active");
    if (explicitBuddyId && activeIds.includes(explicitBuddyId)) return explicitBuddyId;
    const text = String(rawText || "");
    for (const id of activeIds) {
      const custom = getCustomBuddy(extra, id);
      const name = custom?.name || BUDDY_NAMES[id];
      if (name && text.includes(name)) return id;
    }
    if (activeIds.includes("morning") && isWakeIntent(text)) {
      return "morning";
    }
    if (activeIds.includes("running") && /(跑步|跑量|配速|公里|km)/i.test(text) && /(录入|记录|截图|图片|数据)/.test(text)) {
      return "running";
    }
    if (activeIds.includes("reading") && /(读了|读到|读完|书页|读书)/.test(text) && /(录入|记录|打卡|截图|图片)/.test(text)) {
      return "reading";
    }
    return null;
  } catch (error) {
    console.warn("[buddies/companion] 解析搭子失败:", error?.message || error);
    return null;
  }
}

/** 主聊天里某颗搭子的完整回复：人格 + 资料 + 实时进度 + 对话回复 + 可落库 capture */
export async function runBuddyChatFromCompanion({ userId, buddyId, text, attachments = [], history = [] }) {
  const { profile, extra } = await getActiveProfile(userId, buddyId);
  if (!isKnownBuddyId(BUDDY_IDS, extra, buddyId)) {
    return { error: "NOT_FOUND", message: "这颗搭子还没有来到货架" };
  }
  if (!profile) {
    return { error: "NOT_ACTIVE", message: "这段陪伴还没有开始，或已经毕业" };
  }

  const customBuddy = getCustomBuddy(extra, buddyId);
  const buddyName = customBuddy?.name || BUDDY_NAMES[buddyId] || "搭子";
  const buddyPersona = pickBuddyPersona(profile, extra.persona, buddyId);
  const personaTone = PERSONA_TONES[buddyPersona] || PERSONA_TONES.gentle;

  let materialContext = "";
  if (customBuddy) {
    try {
      const materials = await prisma.buddyMaterial.findMany({
        where: { userId, buddyId },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { name: true, text: true },
      });
      materialContext = materials
        .map((item) => `【${item.name}】\n${item.text}`)
        .join("\n\n")
        .slice(0, 6000);
    } catch (error) {
      console.warn("[buddies/companion] 读取专属资料失败:", error?.message || error);
    }
  }
  const buddyMeta = customBuddy
    ? {
        name: customBuddy.name,
        expertise: customBuddy.expertise,
        custom: true,
        slogan: customBuddy.slogan,
        abilities: customBuddy.abilities,
        actions: customBuddy.actions,
        memory: customBuddy.memory,
        materialContext,
      }
    : {};

  const safeAttachments = (Array.isArray(attachments) ? attachments : []).slice(0, 3);
  const parts = [];
  for (const att of safeAttachments) {
    if (!att?.url && !att?.file_url) continue;
    try {
      const content = await readAttachmentText({
        url: att.url || att.file_url,
        name: att.name || att.file_name,
        type: att.type || att.file_type,
      });
      if (content) parts.push(content);
    } catch (error) {
      console.warn("[buddies/companion] 附件识别失败:", error?.message || error);
    }
  }
  const attachmentText = parts.join("\n\n").slice(0, 6000);
  const userText =
    String(text || "").trim().slice(0, 2000) ||
    (safeAttachments.length > 0 ? "（用户发来图片或文件）" : "");
  const priorMessages = (Array.isArray(history) ? history : [])
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-8)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 500) }));
  const payload = {
    messages: [...priorMessages, { role: "user", content: userText }],
    text: userText,
    ...(safeAttachments.length > 0 ? { attachments: safeAttachments } : {}),
    ...(attachmentText ? { attachment_text: attachmentText } : {}),
  };

  let liveContext = "";
  try {
    liveContext = await loadBuddyLiveContext(userId, buddyId, profile);
  } catch (error) {
    console.warn("[buddies/companion] 读取实时进度失败:", error?.message || error);
  }
  payload.context = [`今天是 ${beijingToday()}`, liveContext].filter(Boolean).join("；");

  const buddyInfo = {
    id: buddyId,
    name: buddyName,
    custom: Boolean(customBuddy),
    tint: Array.isArray(customBuddy?.tint) ? customBuddy.tint : null,
  };
  let projectTask = null;
  if (profile.project_task_id) {
    try {
      projectTask = await prisma.task.findUnique({
        where: { id: profile.project_task_id },
        select: { id: true, title: true, category: true },
      });
    } catch (error) {
      console.warn("[buddies/companion] 读取项目约定失败:", error?.message || error);
    }
  }
  const projectTaskInfo = projectTask
    ? { id: projectTask.id, title: projectTask.title, category: projectTask.category }
    : null;

  // 早起说一声「我起床了」：不依赖模型，立即记下并触发今日打卡
  const morningIntent = isWakeIntent(userText);
  if (buddyId === "morning" && morningIntent) {
    const time = userText.match(/(\d{1,2})\s*[:：]\s*(\d{2})/);
    const wakeTime = time ? `${String(time[1]).padStart(2, "0")}:${time[2]}` : null;
    return {
      reply: wakeTime ? `${wakeTime} 起床，记下了，今天也赢回一个早晨。` : "起来了就打卡，今天又赢回一个早晨。",
      capture: {
        kind: "wake_log",
        confidence: 0.99,
        checkin: true,
        summary: "已记录起床打卡",
        data: { wake_time: wakeTime, sleep_h: null, note: "" },
      },
      proposal: null,
      task: null,
      buddy: buddyInfo,
      project_task: projectTaskInfo,
    };
  }

  const built = buildAgentPrompt(buddyId, "chat", payload, personaTone, profile.answers, buddyMeta);
  let data = null;
  if (built) {
    try {
      data = await Promise.race([
        invokeKimiText({
          prompt: built.prompt,
          systemPrompt: built.systemPrompt,
          responseJsonSchema: true,
          maxTokens: 2500,
          fetchTimeout: 45000,
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("AGENT_TIMEOUT")), 60000)),
      ]);
    } catch (error) {
      console.warn(`[buddies/companion] ${buddyId}/chat failed:`, error?.message || error);
    }
  }

  let reply = String(data?.reply || "").trim();
  let capture = data?.capture && typeof data.capture === "object" ? data.capture : null;
  const proposal = data?.proposal?.type === "create_collab" ? data.proposal : null;
  const task =
    data?.task && typeof data.task === "object" && String(data.task.title || "").trim()
      ? {
          title: String(data.task.title).trim().slice(0, 60),
          description: String(data.task.description || "").trim().slice(0, 300),
          due_at: data.task.due_at || null,
        }
      : null;

  // 对话模型漏提取时，用专注解析再兜一层（附件文本已识别，不重复 OCR）
  if (!capture || capture.kind === "none") {
    const wantsRunningParse =
      buddyId === "running" &&
      (Boolean(attachmentText) ||
        /(跑了|跑完|跑步记录|记录一下|录入).{0,16}\d/i.test(userText) ||
        (/\d+(\.\d+)?\s*(公里|km|千米)/i.test(userText) && /(用时|耗时|配速|心率|分钟)/.test(userText)));
    const wantsReadingParse =
      buddyId === "reading" &&
      (Boolean(attachmentText) ||
        /(读了|读到|看完|读完).{0,16}(\d|分钟|页)/.test(userText) ||
        /(\d+\s*(分钟|页)).{0,12}(读|书)/.test(userText));
    const parseMode = wantsRunningParse ? "run_parse" : wantsReadingParse ? "read_parse" : null;
    if (parseMode) {
      const parseBuilt = buildAgentPrompt(buddyId, parseMode, payload, personaTone, profile.answers, buddyMeta);
      if (parseBuilt) {
        try {
          const parsed = await Promise.race([
            invokeKimiText({
              prompt: parseBuilt.prompt,
              systemPrompt: parseBuilt.systemPrompt,
              responseJsonSchema: true,
              maxTokens: 1500,
              fetchTimeout: 30000,
            }),
            new Promise((_, reject) => setTimeout(() => reject(new Error("PARSE_TIMEOUT")), 40000)),
          ]);
          if (parseMode === "run_parse" && (Number(parsed?.distance_km) > 0 || Number(parsed?.duration_min) > 0)) {
            capture = {
              kind: "running_log",
              confidence: Number(parsed?.confidence) || 0.85,
              checkin: false,
              summary: "已识别本次跑步",
              data: {
                distance_km: parsed?.distance_km ?? null,
                duration_min: parsed?.duration_min ?? null,
                avg_hr: parsed?.avg_hr ?? null,
                date: parsed?.date ?? null,
              },
            };
          }
          if (
            parseMode === "read_parse" &&
            parsed?.did_read !== false &&
            (parsed?.book ||
              Number(parsed?.minutes) > 0 ||
              Number(parsed?.pages_read) > 0 ||
              String(parsed?.summary || "").trim())
          ) {
            capture = {
              kind: "reading_log",
              confidence: Number(parsed?.confidence) || 0.85,
              checkin: parsed?.did_read !== false,
              summary: "已识别读书进度",
              data: {
                book: parsed?.book ?? null,
                minutes: parsed?.minutes ?? null,
                pages_read: parsed?.pages_read ?? null,
                summary: parsed?.summary ?? "",
                quote: parsed?.quote ?? null,
                finished: parsed?.finished === true,
              },
            };
          }
        } catch (error) {
          console.warn(`[buddies/companion] ${buddyId}/${parseMode} fallback failed:`, error?.message || error);
        }
      }
    }
  }

  if (!reply) {
    if (capture?.kind === "running_log") {
      const d = capture.data || {};
      reply = `这次${d.distance_km ? ` ${d.distance_km} km` : ""}${d.duration_min ? `、${d.duration_min} 分钟` : ""}，已经记进跑步记录。`;
    } else if (capture?.kind === "reading_log") {
      const d = capture.data || {};
      reply = `已经记下今天的阅读${d.book ? `《${d.book}》` : ""}${d.minutes ? ` ${d.minutes} 分钟` : ""}，打卡也帮你勾上了。`;
    } else {
      reply = "我在。刚才没来得及展开——把最想先解决的那一步告诉我，我马上接着答。";
    }
  }

  return {
    reply,
    capture: capture?.kind && capture.kind !== "none" ? capture : null,
    proposal,
    task,
    buddy: buddyInfo,
    project_task: projectTaskInfo,
  };
}
