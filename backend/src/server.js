import { app } from "./app.js";
import { env } from "./config/env.js";
import { ensureDemoUser } from "./lib/ensureDemoUser.js";
import { startReminderCron } from "./services/reminderCron.js";

process.on("uncaughtException", (error) => {
  console.error("[uncaughtException]", error);
  // 保持进程运行，记录错误；生产环境建议配合 PM2 等进程管理器重启
});

process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});

await ensureDemoUser();
startReminderCron();

app.listen(env.PORT, () => {
  console.log(`SoulSentry backend listening on http://localhost:${env.PORT}`);
});
