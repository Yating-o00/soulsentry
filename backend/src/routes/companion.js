// 小助手陪伴对话路由：历史持久化在 CompanionMessage，重进/换端可续聊
// POST /messages 发送：用户消息落库 → 复用心流对话引擎（意图理解/提案）→ 助手回复落库
// 巡检产生的主动消息（kind=proactive）也在这条时间线上，未读数驱动小程序入口角标
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { runFlowChat } from "../services/flowChat.js";
import { moveProposalWeekday } from "../services/planCommitment.js";
import { loadPlanningBusy, resolvePlanningRequest, validateScheduledSessions } from "../services/taskHarness.js";
import { extractActions, executeActions } from "../services/assistantActions.js";
import { retrievePersonalMemories, searchMemoryTranscript } from "../services/personalMemory.js";
import { createMemory, ownedMemoryProposal, recallableMessageScope } from "../services/memoryStore.js";
import { enqueueMemoryMessage } from "../services/memoryWorker.js";
import { buildMemoryTopicSummary, loadMemoryContext, loadRememberedCommitments, RECENT_CHAT_WINDOW } from "../services/memoryContext.js";

export const companionRouter = Router();

companionRouter.use(requireAuth);

const serialize = (m) => ({
  id: m.id,
  role: m.role,
  content: m.content,
  kind: m.kind,
  meta: m.meta ? Object.fromEntries(Object.entries(m.meta).filter(([key]) => key !== "planDraft")) : null,
  read_at: m.readAt,
  created_date: m.createdAt
});

// GET /api/companion/messages?limit=100 — 全量时间线（时间正序，客户端分页从后往前取）
companionRouter.get("/messages", async (req, res) => {
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));
  const rows = await prisma.companionMessage.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: "desc" },
    take: limit
  });
  return res.json(rows.reverse().map(serialize));
});

// GET /api/companion/unread — 助手消息未读数（入口角标）
companionRouter.get("/unread", async (req, res) => {
  const count = await prisma.companionMessage.count({
    where: { userId: req.user.id, role: "assistant", readAt: null }
  });
  return res.json({ count });
});

// POST /api/companion/read — 进入聊天页即全部已读
companionRouter.post("/read", async (req, res) => {
  await prisma.companionMessage.updateMany({
    where: { userId: req.user.id, role: "assistant", readAt: null },
    data: { readAt: new Date() }
  });
  return res.json({ ok: true });
});

const sendSchema = z.object({
  content: z.string().min(1).max(3000).optional(),
  last_extracted: z.any().optional().nullable(),
  // 提案确认后的回执：客户端已完成落库，追加一条助手话术到时间线（不触发 AI）
  assistant_echo: z.string().min(1).max(1000).optional()
}).refine((d) => d.content || d.assistant_echo, { message: "content 或 assistant_echo 至少提供一个" });

companionRouter.post("/messages", async (req, res) => {
  const payload = sendSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: payload.error.flatten() });
  }

  // 回执消息：提案「确认生成」后客户端追加的助手话术
  if (payload.data.assistant_echo && !payload.data.content) {
    const echo = await prisma.companionMessage.create({
      data: { userId: req.user.id, role: "assistant", content: payload.data.assistant_echo, kind: "chat" }
    });
    return res.status(201).json({ message: serialize(echo) });
  }

  const content = payload.data.content.trim();
  const explicitMemory = content.match(/^(?:请)?(?:帮我)?记住[：:,，\s]*(.+)$/s);
  const memoryText = explicitMemory?.[1].trim().slice(0, 1000);
  const { userMsg, savedReply } = await prisma.$transaction(async (tx) => {
    const feedbackProposal = !memoryText && /(?:因为|由于|我通常|我平常|我更喜欢|我没空|我没法|我不能|对我来说)/.test(content)
      ? await ownedMemoryProposal(tx, req.user.id, payload.data.last_extracted?.memory_proposal_id) : null;
    const userMsg = await tx.companionMessage.create({
      data: {
        userId: req.user.id, role: "user", content, kind: "chat",
        ...(feedbackProposal ? { meta: { memoryProposalId: feedbackProposal.id } } : {}),
      },
    });
    if (feedbackProposal) await tx.memoryTaskSignal.create({
      data: { userId: req.user.id, kind: "stated_reason", evidenceId: userMsg.id, proposalMessageId: feedbackProposal.id },
    });
    await enqueueMemoryMessage(tx, userMsg);
    if (!memoryText) return { userMsg };
    const saved = await createMemory(tx, {
      userId: req.user.id, sourceIds: [userMsg.id], reason: "explicit_chat",
      data: {
        title: memoryText.slice(0, 200), content: memoryText,
        memoryType: /^(?:我)?(?:以后|今后|始终|永远|每次)/.test(memoryText) ? "instruction" : "preference",
      },
    });
    const savedReply = await tx.companionMessage.create({
      data: {
        userId: req.user.id, role: "assistant", content: `好的，我记住了：${memoryText}`, kind: "chat",
        meta: { memoryIds: [saved.id], memorySourceIds: [userMsg.id] },
      },
    });
    return { userMsg, savedReply };
  });
  if (savedReply) return res.json({ message: serialize(userMsg), reply: serialize(savedReply), extracted: null, actions: null });

  // 从持久化时间线取最近上下文，保证跨端/重进后语境连续
  const history = await prisma.companionMessage.findMany({
    where: recallableMessageScope(req.user.id),
    orderBy: { createdAt: "desc" },
    take: 25
  });
  const messages = history
    .reverse()
    .map((m) => ({ role: m.role, content: m.content.slice(0, 1500) }));

  try {
    const supplied = payload.data.last_extracted;
    const previousId = supplied?.plan_proposal_id || supplied?.memory_proposal_id;
    const previous = previousId ? await ownedMemoryProposal(prisma, req.user.id, previousId) : null;
    const lastExtracted = previous?.meta.planDraft?.extracted
      ?? (supplied?.plan_proposal_id || (previousId && !previous) ? null : supplied);

    const prior = previous?.meta.planDraft;
    const localMove = prior && moveProposalWeekday(prior.extracted.plan, content);
    // 动作意图优先：「勾掉/改/删现有约定心签」的指令先走动作提取，
    // 避免被对话引擎误当成心签/新约定（用户确认后才真正落库）
    try {
      const actionResult = !localMove && await extractActions({ messages, userId: req.user.id });
      if (actionResult?.actions?.length > 0) {
        const reply = actionResult.reply || "好的，我整理了一下要做的修改，确认后我就动手～";
        const assistantMsg = await prisma.companionMessage.create({
          data: { userId: req.user.id, role: "assistant", content: reply, kind: "chat" }
        });
        return res.json({
          message: serialize(userMsg),
          reply: serialize(assistantMsg),
          extracted: null,
          agent: null,
          actions: actionResult.actions
        });
      }
    } catch (err) {
      console.warn("[companion] 动作提取失败（继续走对话引擎）:", err?.message || err);
    }

    const hybridEnabled = process.env.MEMORY_HYBRID_ENABLED === "1";
    const [retrieved, memoryContext] = await Promise.all([
      retrievePersonalMemories({
        prisma, userId: req.user.id, query: content,
        mode: hybridEnabled ? "hybrid" : "lexical",
      }),
      loadMemoryContext(prisma, req.user.id),
    ]);
    const profileIds = new Set(memoryContext.profile.map(({ id }) => id));
    const memories = retrieved.filter(({ id }) => !profileIds.has(id));
    memoryContext.commitments = await loadRememberedCommitments(prisma, req.user.id, content);
    if (process.env.MEMORY_TOPIC_SUMMARY_ENABLED === "1") memoryContext.topicSummary = buildMemoryTopicSummary(memories);
    if (hybridEnabled && memories.length < 2) {
      memoryContext.transcript = await searchMemoryTranscript({
        prisma, userId: req.user.id, query: content,
        excludeIds: [...history.map(({ id }) => id), ...memoryContext.recap.map(({ sourceId }) => sourceId)],
      });
    }
    const startedAt = Date.now();
    const planRun = { signal: AbortSignal.timeout(90000), status: "chat", chatCalls: 0, plannerCalls: 0 };
    let result;
    if (localMove) {
      planRun.status = localMove.error ? "invalid" : "local_adjustment";
      planRun.constraints = prior.constraints;
      result = localMove.error ? { reply: localMove.error } : {
        extracted: { ...prior.extracted, plan: localMove.plan },
        reply: `已把那天的主要安排调到 ${localMove.clock}，看看新安排～`,
      };
    } else {
      result = await runFlowChat({
        messages, lastExtracted, userId: req.user.id, prisma, memories, memoryContext, planRun,
      });
    }
    let extracted = result?.extracted || null;
    let replyText = String(result?.reply || "").trim() || "我在听，你继续说～";
    let planDraft;
    if (extracted?.type === "plan" && extracted.plan && extracted.plan.source !== "fallback") {
      // Fallback adjustment paths must also pass the service's window checks before
      // the assistant reply becomes a confirmable version.
      const constraints = planRun.constraints || resolvePlanningRequest(
        extracted.plan_request ?? {},
        messages.filter(({ role }) => role === "user").map(({ content }) => content),
        [...memoryContext.profile, ...memories],
      ).constraints;
      constraints.busy ??= await loadPlanningBusy(prisma, req.user.id, constraints);
      const errors = validateScheduledSessions(extracted.plan, constraints);
      if (errors.length || planRun.signal.aborted) {
        extracted = null;
        planRun.status = planRun.signal.aborted ? "timeout" : "invalid";
        planRun.validation = errors.map((error) => error.match(/^([A-Z_]+)：/)?.[1] || "DOMAIN_RULE");
        replyText = errors.length ? `这份计划还不符合要求：${errors.join("；")}。请调整后再试。` : "规划超时，请稍后重试。";
      } else {
        const { busy: _busy, ...snapshot } = constraints;
        planDraft = { extracted, constraints: snapshot };
        planRun.status = "ready";
      }
    } else if (extracted?.type === "plan") {
      extracted = null;
    }
    const reply = memories.length ? `${replyText}\n\n参考记忆：${memories.map((memory) => memory.title).join("；")}` : replyText;
    const assistantMsg = await prisma.companionMessage.create({
      data: {
        userId: req.user.id, role: "assistant", content: reply, kind: "chat",
        meta: {
          memoryIds: [...profileIds, ...memories.map(({ id }) => id)],
          memorySourceIds: [...memoryContext.recap.map(({ sourceId }) => sourceId), ...(memoryContext.transcript || []).map(({ id }) => id)],
          recentUserIds: history.slice(-RECENT_CHAT_WINDOW).filter(({ role }) => role === "user").map(({ id }) => id),
          ...(planDraft ? { planProposal: true, planTitle: extracted.plan.parent?.title, planDraft } : {}),
        },
      }
    });
    if (planRun.status !== "chat" || planRun.plannerCalls) {
      console.info("[planHarness]", JSON.stringify({
        runId: userMsg.id, status: planRun.status, provider: process.env.CHAT_AI_PROVIDER?.trim() || "kimi",
        route: localMove ? "local_adjustment" : "chat",
        chatCalls: planRun.chatCalls, plannerCalls: planRun.plannerCalls,
        repairCount: Math.max(0, planRun.plannerCalls - 1), firstValidation: planRun.firstValidation,
        validation: planRun.validation, durationSource: planRun.constraints?.durationSource,
        memoryId: planRun.constraints?.durationMemoryId, elapsedMs: Date.now() - startedAt,
        proposalId: planDraft ? assistantMsg.id : undefined,
      }));
    }
    return res.json({
      message: serialize(userMsg),
      reply: serialize(assistantMsg),
      extracted: planDraft ? { ...extracted, plan_proposal_id: assistantMsg.id, memory_proposal_id: assistantMsg.id } : extracted,
      agent: result?.agent || null,
      actions: null,
      memories: memories.map(({ id, title }) => ({ id, title }))
    });
  } catch (err) {
    console.error("[companion] 对话处理失败:", err?.message || err);
    const fallback = await prisma.companionMessage.create({
      data: { userId: req.user.id, role: "assistant", content: "刚才走神了一下…你再说一遍好吗？", kind: "chat" }
    });
    return res.json({ message: serialize(userMsg), reply: serialize(fallback), extracted: null, agent: null });
  }
});

// POST /api/companion/actions — 用户确认动作提案后执行（服务端校验权限并落库）
const actionsSchema = z.object({
  actions: z.array(z.object({
    id: z.string().max(64).optional(),
    type: z.enum(["complete_task", "reopen_task", "update_task", "update_note"]),
    target_id: z.string().min(1).max(64),
    label: z.string().max(120).optional(),
    changes: z.record(z.any()).optional()
  })).min(1).max(5)
});

companionRouter.post("/actions", async (req, res) => {
  const payload = actionsSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: payload.error.flatten() });
  }
  const results = await executeActions({ actions: payload.data.actions, userId: req.user.id });
  return res.json({ results });
});
