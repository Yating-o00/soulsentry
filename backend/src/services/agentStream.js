import { prisma } from "../lib/prisma.js";
import { verifyAccessToken } from "../lib/jwt.js";
import {
  subscribeAgentLive,
  handleLiveInput
} from "./browserAgent.js";

// 实时窗口 WebSocket：/ws/agent-stream?token=<JWT>&executionId=<id>
// 画面：CDP screencast 帧（base64 JPEG）持续推给客户端；
// 输入：客户端转发鼠标/键盘事件到真实浏览器。
export async function attachAgentStream(ws, req) {
  let executionId = null;

  try {
    const url = new URL(req.url, "http://localhost");
    const token = url.searchParams.get("token") || "";
    executionId = url.searchParams.get("executionId") || "";
    const payload = verifyAccessToken(token);
    const userId = payload.sub;

    if (!executionId) throw new Error("缺少 executionId");
    const owned = await prisma.taskExecution.findFirst({
      where: { id: executionId, userId, automationType: "browser_task" },
      select: { id: true }
    });
    if (!owned) throw new Error("执行单不存在或无权限");

    const sub = await subscribeAgentLive(executionId, (frame) => {
      if (ws.readyState !== ws.OPEN) return;
      if (frame === null) {
        ws.send(JSON.stringify({ type: "ended" }));
        return;
      }
      ws.send(JSON.stringify({ type: "frame", data: frame }));
    });

    if (!sub.ok) {
      ws.send(JSON.stringify({ type: "error", message: sub.message }));
      ws.close();
      return;
    }

    ws.send(JSON.stringify({ type: "ready", viewport: { width: 1280, height: 800 }, postmortem: !!sub.postmortem }));

    ws.on("message", async (raw) => {
      try {
        const msg = JSON.parse(String(raw));
        const result = await handleLiveInput(executionId, msg);
        if (result && result.ok === false && ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({ type: "error", message: result.message }));
        }
      } catch {
        // 单个消息失败不打断流
      }
    });

    ws.on("close", async () => {
      await sub.unsubscribe().catch(() => {});
    });
  } catch (err) {
    try {
      ws.send(JSON.stringify({ type: "error", message: err?.message || "连接失败" }));
    } catch {}
    ws.close();
  }
}
