import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { prisma } from "../lib/prisma.js";
import { runFlowChat } from "../services/flowChat.js";

export const chatRouter = Router();

chatRouter.use(requireAuth);

const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  // 小助手的提问/结果可承载完整文案（ask_user/done 上限 2000 字），此处留足余量
  content: z.string().min(1).max(3000)
});

const chatBodySchema = z.object({
  messages: z.array(chatMessageSchema).min(1).max(30),
  last_extracted: z.any().optional().nullable(),
  // 对话中挂着浏览器小助手会话时携带：用户消息将直接转发给 Agent
  agent_execution_id: z.string().max(64).optional().nullable()
});

/**
 * POST /api/chat
 * 心流对话：客户端持有完整对话历史，服务端调用 AI 理解意图，
 * 返回 { reply, extracted, agent? } —— extracted 为用户确认后要生成的约定/心签/链接提案；
 * agent 非空表示浏览器小助手已出发（{ executionId, status }），客户端轮询 agent-state 获取进度与结果。
 */
chatRouter.post("/", async (req, res) => {
  const parsed = chatBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "INVALID_INPUT", message: "对话内容不合法" });
  }
  try {
    // 25s 硬上限：任何下游（AI/数据库/Agent）异常都不能把对话挂死
    const result = await Promise.race([
      runFlowChat({
        messages: parsed.data.messages,
        lastExtracted: parsed.data.last_extracted || null,
        userId: req.user.id,
        prisma,
        agentExecutionId: parsed.data.agent_execution_id || null
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("CHAT_HANDLER_TIMEOUT")), 25000))
    ]);
    res.json(result);
  } catch (err) {
    console.error("[chat] 对话处理失败:", err?.message || err);
    // 兜底也要能继续聊：客户端会把它当作普通回复展示
    res.status(200).json({
      reply: "刚才走神了一下…你再说一遍好吗？",
      extracted: null,
      agent: null,
      source: "error"
    });
  }
});
