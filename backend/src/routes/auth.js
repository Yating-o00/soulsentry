import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { signAccessToken } from "../lib/jwt.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { requireAuth } from "../middleware/auth.js";

export const authRouter = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(1).max(50).optional()
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

function serializeUser(user) {
  return {
    id: user.id,
    email: user.email,
    display_name: user.displayName,
    role: user.role.toLowerCase(),
    subscription_plan: user.subscriptionPlan,
    ai_credits: user.aiCredits,
    theme_preferences: user.themePreferences,
    created_date: user.createdAt,
    updated_date: user.updatedAt
  };
}

authRouter.post("/register", async (req, res) => {
  const payload = registerSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: payload.error.flatten() });
  }

  const existing = await prisma.user.findUnique({
    where: { email: payload.data.email }
  });

  if (existing) {
    return res.status(409).json({ error: "EMAIL_EXISTS", message: "邮箱已注册" });
  }

  const passwordHash = await hashPassword(payload.data.password);
  const user = await prisma.user.create({
    data: {
      email: payload.data.email,
      passwordHash,
      displayName: payload.data.displayName,
      preferences: {
        create: {
          locale: "zh-CN",
          timezone: "Asia/Shanghai"
        }
      },
      creditTxs: {
        create: {
          type: "GIFT",
          amount: 200,
          balanceAfter: 200,
          description: "新用户赠送 200 AI 点数"
        }
      }
    }
  });

  const token = signAccessToken(user);

  return res.status(201).json({
    token,
    user: serializeUser(user)
  });
});

authRouter.post("/login", async (req, res) => {
  const payload = loginSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: payload.error.flatten() });
  }

  const user = await prisma.user.findUnique({
    where: { email: payload.data.email }
  });

  if (!user) {
    return res.status(401).json({ error: "INVALID_CREDENTIALS", message: "账号或密码错误" });
  }

  const isValid = await verifyPassword(payload.data.password, user.passwordHash);
  if (!isValid) {
    return res.status(401).json({ error: "INVALID_CREDENTIALS", message: "账号或密码错误" });
  }

  const token = signAccessToken(user);

  return res.json({
    token,
    user: serializeUser(user)
  });
});

authRouter.get("/me", requireAuth, async (req, res) => {
  return res.json({ user: serializeUser(req.user) });
});
