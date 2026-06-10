import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

export const usersRouter = Router();

const updateMeSchema = z.object({
  display_name: z.string().min(1).max(50).optional(),
  subscription_plan: z.string().min(1).optional(),
  ai_credits: z.number().int().min(0).optional(),
  theme_preferences: z.record(z.any()).optional()
});

usersRouter.use(requireAuth);

usersRouter.get("/me", async (req, res) => {
  return res.json({
    id: req.user.id,
    email: req.user.email,
    display_name: req.user.displayName,
    role: req.user.role.toLowerCase(),
    subscription_plan: req.user.subscriptionPlan,
    ai_credits: req.user.aiCredits,
    theme_preferences: req.user.themePreferences,
    preferences: req.user.preferences
  });
});

usersRouter.patch("/me", async (req, res) => {
  const payload = updateMeSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: payload.error.flatten() });
  }

  const nextUser = await prisma.user.update({
    where: { id: req.user.id },
    data: {
      displayName: payload.data.display_name,
      subscriptionPlan: payload.data.subscription_plan,
      aiCredits: payload.data.ai_credits,
      themePreferences: payload.data.theme_preferences
    }
  });

  return res.json({
    id: nextUser.id,
    email: nextUser.email,
    display_name: nextUser.displayName,
    role: nextUser.role.toLowerCase(),
    subscription_plan: nextUser.subscriptionPlan,
    ai_credits: nextUser.aiCredits,
    theme_preferences: nextUser.themePreferences
  });
});
