import { prisma } from "../src/lib/prisma.js";
import "../src/config/env.js";
import { configureWebPush, sendPushNotification, isWebPushConfigured } from "../src/lib/webPush.js";

// 全量用户广播：给「注册且使用过」的每位用户发一条应用内消息，有 Web Push 订阅的同步推送到浏览器/PWA。
// 微信端用户打开小程序即可在消息中心看到；微信订阅消息模板与约定提醒强绑定，不适合此类问候，不套用。
//
// 用法（在服务器 backend 目录下）：
//   node scripts/broadcast-message.js                # 干跑：只统计收件人，不发送
//   node scripts/broadcast-message.js --send         # 正式发送（可重复执行，当天同标题自动去重跳过）
//   node scripts/broadcast-message.js --send --title "自定义标题" --body "自定义正文" --url /flow

const args = process.argv.slice(2);
const SEND = args.includes("--send");
const argAt = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const TITLE = argAt("--title", "今天的你，还是那个从容的自己吗？");
const BODY = argAt("--body", "来自心栈的一句问候。");
const URL = argAt("--url", "/flow");

const EXCLUDE_EMAILS = new Set(["demo@soulsentry.local"]);
const isInternalAccount = (u) =>
  (u.email && (EXCLUDE_EMAILS.has(u.email) || /@test\.local$/i.test(u.email))) || u.role !== "USER";

function getPushSubscription(preferences) {
  const extra = preferences?.metadata && typeof preferences.metadata === "object"
    ? preferences.metadata._extraFields || {}
    : {};
  return extra.push_subscription || null;
}

function pushEnabled(preferences) {
  return preferences?.pushNotifications !== false;
}

async function main() {
  configureWebPush();

  // 注册且使用过的用户：有约定、心签、登录设备偏好之一
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { tasks: { some: {} } },
        { notes: { some: {} } },
        { preferences: { isNot: null } }
      ]
    },
    include: {
      preferences: true,
      _count: { select: { tasks: true, notes: true } }
    }
  });

  const recipients = users.filter((u) => !isInternalAccount(u));
  const internal = users.length - recipients.length;
  const pushCapable = recipients.filter((u) => getPushSubscription(u.preferences) && pushEnabled(u.preferences));

  console.log(`模式: ${SEND ? "正式发送" : "干跑（加 --send 正式发送）"}`);
  console.log(`标题: ${TITLE}`);
  console.log(`正文: ${BODY}`);
  console.log(`跳转: ${URL}`);
  console.log(`收件人: ${recipients.length}（内部/测试账号排除 ${internal} 个）`);
  console.log(`可推送(Web Push): ${pushCapable.length}；仅应用内: ${recipients.length - pushCapable.length}`);
  console.log(`样例: ${recipients.slice(0, 5).map((u) => u.email || u.phone || u.id).join(", ")}${recipients.length > 5 ? " …" : ""}`);

  if (!SEND) {
    await prisma.$disconnect();
    return;
  }

  // 当天同标题去重：重复执行不会给同一用户发第二条
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const alreadySent = new Set(
    (await prisma.notification.findMany({
      where: { title: TITLE, createdAt: { gte: todayStart } },
      select: { userId: true }
    })).map((n) => n.userId)
  );

  let inAppSent = 0;
  let pushSent = 0;
  let pushFailed = 0;
  let skipped = 0;

  for (const user of recipients) {
    if (alreadySent.has(user.id)) {
      skipped += 1;
      continue;
    }

    await prisma.notification.create({
      data: {
        userId: user.id,
        title: TITLE,
        body: BODY,
        channel: "in_app",
        status: "SENT",
        payload: { type: "broadcast", url: URL }
      }
    });
    inAppSent += 1;

    const subscription = getPushSubscription(user.preferences);
    if (isWebPushConfigured() && subscription && pushEnabled(user.preferences)) {
      try {
        await sendPushNotification(subscription, {
          title: TITLE,
          body: BODY,
          url: URL,
          tag: "broadcast",
          requireInteraction: false,
          data: { type: "broadcast", url: URL }
        });
        pushSent += 1;
      } catch (err) {
        pushFailed += 1;
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          // 订阅已失效：清除，避免后续再撞
          await prisma.userPreference.update({
            where: { userId: user.id },
            data: {
              metadata: {
                ...(user.preferences?.metadata || {}),
                _extraFields: {
                  ...(user.preferences?.metadata?._extraFields || {}),
                  push_subscription: null
                }
              }
            }
          }).catch(() => {});
        }
      }
    }

    if ((inAppSent + skipped) % 50 === 0) {
      console.log(`…进度 ${inAppSent + skipped}/${recipients.length}`);
    }
    await new Promise((r) => setTimeout(r, 15));
  }

  console.log(`完成：应用内 ${inAppSent}，推送成功 ${pushSent}，推送失败/失效 ${pushFailed}，去重跳过 ${skipped}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
