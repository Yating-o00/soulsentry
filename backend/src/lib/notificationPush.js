import { prisma } from "./prisma.js";
import { sendGenericSubscribeMessage } from "./wechatSubscribeMessage.js";

function getExtraFields(preferences) {
  if (preferences?.metadata && typeof preferences.metadata === "object") {
    return preferences.metadata._extraFields || {};
  }
  return {};
}

/**
 * 非提醒类通知（协同讨论/共享/Agent 消息/访客互动等）的微信小程序订阅消息推送。
 * - 尽力而为：任何失败只记日志，不影响通知落库与接口响应；
 * - 尊重用户关闭推送的偏好（pushNotifications === false 不发）；
 * - 复用「项目进度提醒」模板（见 wechatSubscribeMessage.buildGenericData），
 *   不占「日程提醒」模板的订阅配额，避免挤掉每日打卡提醒；
 * - 调用方无需 await（fire-and-forget），但返回 Promise 便于需要时等待。
 */
export async function pushNotificationWechat(userId, { title, body, source }) {
  try {
    const preferences = await prisma.userPreference.findUnique({ where: { userId } });
    if (!preferences) return { ok: false, reason: "no_preferences" };
    if (preferences.pushNotifications === false) {
      return { ok: false, reason: "push_disabled_by_user" };
    }
    const openid = getExtraFields(preferences).openid || null;
    if (!openid) return { ok: false, reason: "no_openid" };

    const result = await sendGenericSubscribeMessage(openid, { title, body, source });
    if (!result.ok && result.reason !== "user_rejected_or_no_quota") {
      console.warn("[notificationPush] wechat push failed:", result.reason);
    }
    return result;
  } catch (err) {
    console.warn("[notificationPush] unexpected error:", err?.message || err);
    return { ok: false, reason: err?.message || "push_error" };
  }
}
