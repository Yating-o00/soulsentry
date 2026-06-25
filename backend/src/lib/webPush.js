import webpush from "web-push";
import { env } from "../config/env.js";
import { prisma } from "./prisma.js";

let configured = false;

function getVapidConfig() {
  const publicKey = env.VAPID_PUBLIC_KEY || null;
  const privateKey = env.VAPID_PRIVATE_KEY || null;
  const subject = env.VAPID_SUBJECT || "mailto:ops@example.com";
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject };
}

export function getVapidPublicKey() {
  return getVapidConfig()?.publicKey || null;
}

function ensureConfigured() {
  if (configured) return getVapidConfig();
  const cfg = getVapidConfig();
  if (!cfg) return null;
  webpush.setVapidDetails(cfg.subject, cfg.publicKey, cfg.privateKey);
  configured = true;
  return cfg;
}

function getPushExtraFields(preference) {
  const extra = preference?.metadata?._extraFields;
  return extra && typeof extra === "object" && !Array.isArray(extra) ? extra : {};
}

export function buildPreferenceMetadata(existingMetadata, extraFields = {}) {
  const base = existingMetadata && typeof existingMetadata === "object" && !Array.isArray(existingMetadata)
    ? { ...existingMetadata }
    : {};
  const previousExtra = getPushExtraFields({ metadata: base });
  base._extraFields = {
    ...previousExtra,
    ...extraFields
  };
  return base;
}

export async function sendWebPushToSubscription(subscription, payload = {}) {
  const cfg = ensureConfigured();
  if (!cfg) {
    const error = new Error("VAPID_NOT_CONFIGURED");
    error.status = 503;
    throw error;
  }
  return webpush.sendNotification(subscription, JSON.stringify(payload));
}

export async function sendWebPushToUser(userId, payload = {}) {
  const preference = await prisma.userPreference.findUnique({ where: { userId } });
  const extra = getPushExtraFields(preference);
  const subscription = extra.push_subscription || null;
  if (!subscription) {
    const error = new Error("PUSH_SUBSCRIPTION_NOT_FOUND");
    error.status = 404;
    throw error;
  }
  return sendWebPushToSubscription(subscription, payload);
}

