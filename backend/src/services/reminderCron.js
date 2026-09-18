import { schedule } from "node-cron";
import { sendDueReminders, sendEndTimeFollowUps, sendForgetReminders } from "./reminderSender.js";
import { configureWebPush } from "../lib/webPush.js";

let started = false;

export function startReminderCron() {
  if (started) return;
  started = true;

  configureWebPush();

  // 每分钟检查一次到期的约定提醒
  schedule("* * * * *", async () => {
    try {
      const result = await sendDueReminders();
      if (result.sent > 0 || result.total > 0) {
        console.log("[reminderCron] reminders:", result);
      }
    } catch (err) {
      console.error("[reminderCron] failed:", err);
    }
  });

  // 每分钟检查一次约定 end_time 跟进
  schedule("* * * * *", async () => {
    try {
      const result = await sendEndTimeFollowUps();
      if (result.sent > 0 || result.total > 0) {
        console.log("[reminderCron] follow-ups:", result);
      }
    } catch (err) {
      console.error("[reminderCron] follow-up failed:", err);
    }
  });

  // 每 10 分钟检查一次遗忘对抗提醒（过期/创建满一周未完成的约定）
  schedule("*/10 * * * *", async () => {
    try {
      const result = await sendForgetReminders();
      if (result.sent > 0 || result.total > 0) {
        console.log("[reminderCron] forget reminders:", result);
      }
    } catch (err) {
      console.error("[reminderCron] forget reminder failed:", err);
    }
  });

  console.log("[reminderCron] scheduled to run every minute (reminders + follow-ups) + every 10 minutes (forget reminders)");
}
