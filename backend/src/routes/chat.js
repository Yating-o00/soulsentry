import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { runFlowChat } from "../services/flowChat.js";

export const chatRouter = Router();

chatRouter.use(requireAuth);

const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(500)
});

const chatBodySchema = z.object({
  messages: z.array(chatMessageSchema).min(1).max(30),
  last_extracted: z.any().optional().nullable()
});

/**
 * POST /api/chat
 * 心流对话：客户端持有完整对话历史，服务端调用 AI 理解意图，
 * 返回 { reply, extracted } —— extracted 为用户确认后要生成的约定/心签/链接提案。
 */
chatRouter.post("/", async (req, res) => {
  const parsed = chatBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "INVALID_INPUT", message: "对话内容不合法" });
  }
  const result = await runFlowChat({
    messages: parsed.data.messages,
    lastExtracted: parsed.data.last_extracted || null
  });
  res.json(result);
});
