import webPush from "web-push";
import { env } from "../config/env.js";

let configured = false;

export function configureWebPush() {
  if (configured) return;
  const publicKey = env.VAPID_PUBLIC_KEY;
  const privateKey = env.VAPID_PRIVATE_KEY;

  if (!publicKey || !privateKey) {
    console.warn("[web-push] VAPID keys not configured; push notifications disabled");
    return;
  }

  webPush.setVapidDetails(
    "mailto:admin@soulsentry.app",
    publicKey,
    privateKey
  );
  configured = true;
}

export function isWebPushConfigured() {
  return configured && Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
}

export async function sendPushNotification(pushSubscription, payload) {
  if (!isWebPushConfigured()) {
    throw new Error("Web push not configured");
  }
  return webPush.sendNotification(pushSubscription, JSON.stringify(payload));
}

export { webPush };
