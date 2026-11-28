import http from "node:http";
import { WebSocketServer } from "ws";
import { app } from "./app.js";
import { env } from "./config/env.js";
import { ensureDemoUser } from "./lib/ensureDemoUser.js";
import { startReminderCron } from "./services/reminderCron.js";
import { startStatsCron } from "./services/statsRollup.js";
import { startCollabNudgeSweep } from "./services/collabNudge.js";
import { startCollabCheckinDigestCron, startCollabCustomRuleCron } from "./services/collabAutomation.js";
import { startCompanionPatrol } from "./services/companionPatrol.js";
import { sweepStaleBrowserExecutions } from "./services/browserAgent.js";
import { attachAgentStream } from "./services/agentStream.js";
import { prisma } from "./lib/prisma.js";
import { startMemoryWorker } from "./services/memoryWorker.js";
import { startConversationLatencyCleanup } from "./services/conversationLatency.js";

process.on("uncaughtException", (error) => {
  console.error("[uncaughtException]", error);
  // 保持进程运行，记录错误；生产环境建议配合 PM2 等进程管理器重启
});

process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});

await ensureDemoUser();
// 冒烟/测试环境可用 DISABLE_REMINDER_CRON=1 关闭定时提醒，避免与手动验证互相干扰
if (process.env.DISABLE_REMINDER_CRON !== "1") startReminderCron();
// 协同约定停滞推动轮询（10min）：成员久未推进时 Agent 主动出面
startCollabNudgeSweep();
// 协同空间每日打卡公布：每分钟扫描，到点且当天未发过的空间发一次
startCollabCheckinDigestCron();
// 协同空间自定义定时功能：每分钟扫描自然语言规则，到点由 Agent 执行
startCollabCustomRuleCron();
// 小助手 24 小时巡检：逾期/协同待确认/晚间未办/久未露面时主动在陪伴对话里留消息
startCompanionPatrol();
// 数据看板日汇总：每天 03:07 滚昨天，启动后回补缺失日期（独立于提醒开关）
startStatsCron();
startConversationLatencyCleanup(prisma.conversationLatency);
startMemoryWorker(prisma);
sweepStaleBrowserExecutions(prisma);

const server = http.createServer(app);

// 实时窗口 WebSocket（浏览器 Agent 视频流 + 输入转发）
const wss = new WebSocketServer({ noServer: true });
server.on("upgrade", (req, socket, head) => {
  if (!req.url || !req.url.startsWith("/ws/agent-stream")) {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    attachAgentStream(ws, req);
  });
});

server.listen(env.PORT, () => {
  console.log(`SoulSentry backend listening on http://localhost:${env.PORT}`);
});
