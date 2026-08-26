import { env } from "../config/env.js";
import { getWechatAccessToken } from "./wechatAccessToken.js";

function isConfigured() {
  return Boolean(env.WECHAT_APPID);
}

function fmtWechatTime(iso) {
  if (!iso) return new Date().toLocaleString("zh-CN", { hour12: false }).slice(0, 20);
  return new Date(iso).toLocaleString("zh-CN", { hour12: false }).slice(0, 20);
}

function priorityLabel(priority) {
  const map = {
    urgent: "紧急",
    high: "高",
    medium: "中",
    low: "低"
  };
  return map[priority] || "普通";
}

function categoryLabel(category) {
  const map = {
    work: "工作",
    personal: "个人",
    health: "健康",
    study: "学习",
    family: "家庭",
    shopping: "购物",
    finance: "财务",
    other: "其他"
  };
  return map[category] || "约定";
}

function statusLabel(status) {
  const map = {
    pending: "待开始",
    active: "进行中",
    ready: "已就绪",
    monitoring: "监控中",
    done: "已完成",
    archived: "已归档"
  };
  return map[status] || "进行中";
}

function buildReminderData(task) {
  const tmplId = env.WECHAT_SUBSCRIBE_REMINDER_TMPL_ID;
  if (!tmplId) return null;

  // 日程提醒模板字段（与后台模板一一对应）
  // 提醒内容 thing2 / 执行时间 time3 / 日程标题 thing5 / 紧急度 thing8 / 当前进度 short_thing21
  const titleField = env.WECHAT_SUBSCRIBE_REMINDER_TITLE_FIELD || "thing5";
  const descField = env.WECHAT_SUBSCRIBE_REMINDER_DESC_FIELD || "thing2";
  const timeField = env.WECHAT_SUBSCRIBE_REMINDER_TIME_FIELD || "time3";
  const urgencyField = env.WECHAT_SUBSCRIBE_REMINDER_URGENCY_FIELD || "thing8";
  const progressField = env.WECHAT_SUBSCRIBE_REMINDER_PROGRESS_FIELD || "short_thing21";

  const title = task.title ? String(task.title).slice(0, 20) : "约定提醒";
  const desc = task.description ? String(task.description).slice(0, 40) : "您有一个约定到时间了";
  const time = fmtWechatTime(task.reminderTime);
  const urgency = priorityLabel(task.priority);
  const progress = statusLabel(task.status);

  return {
    template_id: tmplId,
    page: `pages/tasks/index?id=${task.id}`,
    data: {
      [titleField]: { value: title },
      [descField]: { value: desc },
      [timeField]: { value: time },
      [urgencyField]: { value: urgency },
      [progressField]: { value: progress }
    },
    miniprogram_state: env.NODE_ENV === "production" ? "formal" : "trial"
  };
}

function buildFollowUpData(task) {
  const tmplId = env.WECHAT_SUBSCRIBE_FOLLOWUP_TMPL_ID;
  if (!tmplId) return null;

  // 项目进度提醒模板字段（与后台模板一一对应）
  // 项目名称 thing1 / 项目类型 thing4 / 结束时间 time7 / 当前状态 phrase3 / 备注 thing10
  const titleField = env.WECHAT_SUBSCRIBE_FOLLOWUP_TITLE_FIELD || "thing1";
  const typeField = env.WECHAT_SUBSCRIBE_FOLLOWUP_TYPE_FIELD || "thing4";
  const timeField = env.WECHAT_SUBSCRIBE_FOLLOWUP_TIME_FIELD || "time7";
  const statusField = env.WECHAT_SUBSCRIBE_FOLLOWUP_STATUS_FIELD || "phrase3";
  const noteField = env.WECHAT_SUBSCRIBE_FOLLOWUP_NOTE_FIELD || "thing10";

  const title = task.title ? String(task.title).slice(0, 20) : "约定跟进";
  const type = categoryLabel(task.category);
  const endTime = fmtWechatTime(task.endTime);
  const status = statusLabel(task.status);
  const note = "约定的预计时间到了，完成了吗？";

  return {
    template_id: tmplId,
    page: `pages/tasks/index?id=${task.id}`,
    data: {
      [titleField]: { value: title },
      [typeField]: { value: type },
      [timeField]: { value: endTime },
      [statusField]: { value: status },
      [noteField]: { value: note }
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
