import http from "node:http";
import { WebSocketServer } from "ws";
import { app } from "./app.js";
import { env } from "./config/env.js";
import { ensureDemoUser } from "./lib/ensureDemoUser.js";
import { startReminderCron } from "./services/reminderCron.js";
import { sweepStaleBrowserExecutions } from "./services/browserAgent.js";
import { attachAgentStream } from "./services/agentStream.js";
import { prisma } from "./lib/prisma.js";

process.on("uncaughtException", (error) => {
  console.error("[uncaughtException]", error);
  // 保持进程运行，记录错误；生产环境建议配合 PM2 等进程管理器重启
});

process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});

await ensureDemoUser();
startReminderCron();
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
