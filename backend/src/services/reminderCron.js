import { schedule } from "node-cron";
import { sendDueReminders } from "./reminderSender.js";
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

  console.log("[reminderCron] scheduled to run every minute");
}
