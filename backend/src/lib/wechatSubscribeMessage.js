import { env } from "../config/env.js";
import { getWechatAccessToken } from "./wechatAccessToken.js";

function isConfigured() {
  return Boolean(env.WECHAT_APPID);
}

function buildReminderData(task) {
  const tmplId = env.WECHAT_SUBSCRIBE_REMINDER_TMPL_ID;
  if (!tmplId) return null;

  // 微信订阅消息字段需与模板 ID 在 MP 后台配置的字段一致。
  // 这里采用常见字段名，若后台不同请在 .env 中另配模板后调整。
  const title = task.title ? String(task.title).slice(0, 20) : "约定提醒";
  const desc = task.description ? String(task.description).slice(0, 40) : "您有一个约定到时间了";
  const time = task.reminderTime
    ? new Date(task.reminderTime).toLocaleString("zh-CN", { hour12: false })
    : new Date().toLocaleString("zh-CN", { hour12: false });

  return {
    template_id: tmplId,
    page: `pages/tasks/index?id=${task.id}`,
    data: {
      thing1: { value: title },
      thing2: { value: desc },
      time3: { value: time.slice(0, 20) }
    },
    miniprogram_state: env.NODE_ENV === "production" ? "formal" : "trial"
  };
}

function buildFollowUpData(task) {
  const tmplId = env.WECHAT_SUBSCRIBE_FOLLOWUP_TMPL_ID;
  if (!tmplId) return null;

  const title = task.title ? String(task.title).slice(0, 20) : "约定跟进";
  const endTime = task.endTime
    ? new Date(task.endTime).toLocaleString("zh-CN", { hour12: false })
    : new Date().toLocaleString("zh-CN", { hour12: false });

  return {
    template_id: tmplId,
    page: `pages/tasks/index?id=${task.id}`,
    data: {
      thing1: { value: title },
      time2: { value: endTime.slice(0, 20) },
      thing3: { value: "约定的预计时间到了，完成了吗？" }
    },
    miniprogram_state: env.NODE_ENV === "production" ? "formal" : "trial"
  };
}

export async function sendWechatSubscribeMessage(openid, task, type = "reminder") {
  if (!isConfigured() || !openid) {
    return { ok: false, reason: "wechat_not_configured_or_no_openid" };
  }

  const payloadBase = type === "follow_up" ? buildFollowUpData(task) : buildReminderData(task);
  if (!payloadBase) {
    return { ok: false, reason: "template_not_configured" };
  }

  const { token, error } = await getWechatAccessToken();
  if (!token) {
    return { ok: false, reason: error || "no_access_token" };
  }

  const payload = { touser: openid, ...payloadBase };

  try {
    const res = await fetch(`https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (data.errcode === 0) {
      return { ok: true };
    }

    // 43101 表示用户拒绝订阅或订阅次数用完
    if (data.errcode === 43101) {
      return { ok: false, reason: "user_rejected_or_no_quota", code: data.errcode };
    }

    return { ok: false, reason: data.errmsg || `wechat_send_err_${data.errcode}`, code: data.errcode };
  } catch (err) {
    console.error("[wechatSubscribeMessage] send failed:", err?.message || err);
    return { ok: false, reason: err?.message || "wechat_send_failed" };
  }
}
