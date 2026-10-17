import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

export const notificationRulesRouter = Router();

const notificationRuleSchema = z.object({
  title: z.string().min(1).max(120),
  condition_category: z.string().optional(),
  condition_priority: z.string().optional(),
  action_mute: z.boolean().optional(),
  action_sound: z.string().optional(),
  action_channels: z.any().optional(),
  is_enabled: z.boolean().optional(),
  metadata: z.any().optional()
}).passthrough();

const KNOWN_RULE_FIELDS = new Set([
  "title",
  "condition_category",
  "condition_priority",
  "action_mute",
  "action_sound",
  "action_channels",
  "is_enabled",
  "metadata"
]);

notificationRulesRouter.use(requireAuth);

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getRuleExtraFields(payload = {}) {
  return Object.fromEntries(
    Object.entries(payload).filter(([key, value]) => !KNOWN_RULE_FIELDS.has(key) && value !== undefined)
  );
}

function mergeRuleMetadata(existingMetadata, nextMetadata, extraFields = {}) {
  const baseMetadata = nextMetadata === undefined ? existingMetadata : nextMetadata;
  const normalized = isPlainObject(baseMetadata)
    ? { ...baseMetadata }
    : baseMetadata === undefined || baseMetadata === null
      ? {}
      : { _value: baseMetadata };

  const previousExtraFields = isPlainObject(normalized._extraFields)
    ? normalized._extraFields
    : {};

  normalized._extraFields = {
    ...previousExtraFields,
    ...extraFields
  };

  return normalized;
}

function serializeNotificationRule(rule) {
  const extraFields = isPlainObject(rule?.metadata?._extraFields)
    ? rule.metadata._extraFields
    : {};

  return {
    id: rule.id,
    user_id: rule.userId,
    title: rule.title,
    condition_category: rule.conditionCategory,
    condition_priority: rule.conditionPriority,
    action_mute: rule.actionMute,
    action_sound: rule.actionSound,
    action_channels: Array.isArray(rule.actionChannels) ? rule.actionChannels : [],
    is_enabled: rule.isEnabled,
    ...extraFields,
    metadata: rule.metadata,
    created_date: rule.createdAt,
    updated_date: rule.updatedAt
  };
}

function buildRuleData(userId, payload, existingMetadata) {
  const extraFields = getRuleExtraFields(payload);

  return {
    userId,
    title: payload.title,
    conditionCategory: payload.condition_category === undefined ? undefined : (payload.condition_category || "all"),
    conditionPriority: payload.condition_priority === undefined ? undefined : (payload.condition_priority || "all"),
    actionMute: payload.action_mute,
    actionSound: payload.action_sound,
    actionChannels: payload.action_channels,
    isEnabled: payload.is_enabled,
    metadata: mergeRuleMetadata(existingMetadata, payload.metadata, extraFields)
  };
}

notificationRulesRouter.get("/", async (req, res) => {
  const limit = Math.min(Number(req.query.limit || req.query.take || 100), 300);
  const rules = await prisma.notificationRule.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: "desc" },
    take: Number.isFinite(limit) ? limit : 100
  });

  return res.json(rules.map(serializeNotificationRule));
});

notificationRulesRouter.post("/", async (req, res) => {
  const payload = notificationRuleSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: payload.error.flatten() });
  }

  const rule = await prisma.notificationRule.create({
    data: buildRuleData(req.user.id, payload.data, undefined)
  });

  return res.status(201).json(serializeNotificationRule(rule));
});

notificationRulesRouter.patch("/:id", async (req, res) => {
  const payload = notificationRuleSchema.partial().safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: payload.error.flatten() });
  }

  const existing = await prisma.notificationRule.findFirst({
    where: {
      id: req.params.id,
      userId: req.user.id
    }
  });

  if (!existing) {
    return res.status(404).json({ error: "NOT_FOUND", message: "通知规则不存在" });
  }

  const rule = await prisma.notificationRule.update({
    where: { id: existing.id },
    data: buildRuleData(req.user.id, payload.data, existing.metadata)
  });

  return res.json(serializeNotificationRule(rule));
});

notificationRulesRouter.delete("/:id", async (req, res) => {
  const existing = await prisma.notificationRule.findFirst({
    where: {
      id: req.params.id,
      userId: req.user.id
    }
  });

  if (!existing) {
    return res.status(404).json({ error: "NOT_FOUND", message: "通知规则不存在" });
  }

  await prisma.notificationRule.delete({ where: { id: existing.id } });
  return res.status(204).send();
});
