import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Keyboard, RotateCw } from "lucide-react";
import { getAccessToken } from "@/api/httpClient";

// 实时浏览器窗口（Muse 式接管）：WebSocket 接收 CDP 视频流帧，
// 用户在画面上的鼠标/键盘操作实时转发进真实浏览器；关闭窗口即交还小助手。
// 视口固定 1280x800（与 Agent 会话一致），坐标按比例映射。

const VIEW_W = 1280;
const VIEW_H = 800;

function wsUrl(executionId) {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/ws/agent-stream?token=${encodeURIComponent(getAccessToken() || "")}&executionId=${encodeURIComponent(executionId)}`;
}

// e.key → Playwright key 名
function mapKey(key) {
  if (key === " ") return "Space";
  if (key === "Esc") return "Escape";
  return key;
}

export default function AgentLiveWindow({ executionId, onClose }) {
  const [frame, setFrame] = useState("");
  const [connected, setConnected] = useState(false);
  const [notice, setNotice] = useState("正在连接…");
  const [typeText, setTypeText] = useState("");
  const wsRef = useRef(null);
  const stageRef = useRef(null);
  const lastMoveRef = useRef(0);
  const closedRef = useRef(false);

  useEffect(() => {
    let ws;
    try {
      ws = new WebSocket(wsUrl(executionId));
    } catch {
      setNotice("连接失败，请刷新后重试");
      return undefined;
    }
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setNotice("已接管：小助手原地待命，你的操作实时生效");
    };
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === "frame") setFrame(msg.data);
        else if (msg.type === "ready") setNotice("已接管：小助手原地待命，你的操作实时生效");
        else if (msg.type === "ended") { setNotice("小助手已结束本次任务"); }
        else if (msg.type === "error") setNotice(msg.message || "连接异常");
      } catch {
        // 忽略单条消息解析失败
      }
    };
    ws.onclose = () => {
      setConnected(false);
      if (!closedRef.current) setNotice("连接已断开");
    };
    ws.onerror = () => setNotice("连接异常，请关闭重试");

    return () => {
      closedRef.current = true;
      try { ws.close(); } catch {
        // 连接可能已断开
      }
    };
  }, [executionId]);

  const send = (obj) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
  };

  const toViewport = (e) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      x: Math.round((e.clientX - rect.left) * VIEW_W / rect.width),
      y: Math.round((e.clientY - rect.top) * VIEW_H / rect.height)
    };
  };

  const onPointerMove = (e) => {
    const now = Date.now();
    if (now - lastMoveRef.current < 25) return; // ~40/s 限流
    lastMoveRef.current = now;
    const p = toViewport(e);
    if (p) send({ type: "mousemove", ...p });
  };

  const onPointerDown = (e) => {
    stageRef.current?.focus();
    const p = toViewport(e);
    if (p) send({ type: "mousedown", ...p, button: e.button === 2 ? "right" : "left" });
  };

  const onPointerUp = (e) => {
    const p = toViewport(e);
    if (p) send({ type: "mouseup", ...p, button: e.button === 2 ? "right" : "left" });
  };

  const onContextMenu = (e) => {
    e.preventDefault();
    const p = toViewport(e);
    if (!p) return;
    send({ type: "mousedown", ...p, button: "right" });
    setTimeout(() => send({ type: "mouseup", ...p, button: "right" }), 80);
  };

  // wheel 需要非 passive 监听才能 preventDefault
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      send({ type: "wheel", deltaX: Math.round(e.deltaX), deltaY: Math.round(e.deltaY) });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
     
  }, [connected]);

  const onKeyDown = (e) => {
    // 目标是输入条时不截获
    if (e.target.tagName === "INPUT") return;
    e.preventDefault();
    send({ type: "keydown", key: mapKey(e.key) });
  };
  const onKeyUp = (e) => {
    if (e.target.tagName === "INPUT") return;
    e.preventDefault();
    send({ type: "keyup", key: mapKey(e.key) });
  };

  const sendTypedText = () => {
    const t = typeText.trim();
    if (!t) return;
    setTypeText("");
    send({ type: "type", text: t });
  };

  return createPortal(
    <div className="fixed inset-0 z-[90] flex flex-col bg-slate-950/92 p-3 sm:p-5" style={{ background: "rgba(2,6,23,0.94)" }}>
      {/* 顶栏 */}
      <div className="mx-auto flex w-full max-w-5xl items-center gap-3 pb-3">
        <span className="inline-block h-2 w-2 rounded-full" style={{ background: connected ? "#34d399" : "#f59e0b" }} />
        <p className="truncate text-[13px] text-slate-200">{notice}</p>
        <button
          type="button"
          onClick={() => send({ type: "refresh" })}
          title="刷新画面"
          className="ml-auto flex h-8 w-8 items-center justify-center rounded-full text-slate-300 transition-colors hover:bg-white/10"
        >
          <RotateCw className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={onClose}
          title="交还小助手并关闭"
          className="flex h-8 items-center gap-1 rounded-full bg-emerald-500/90 px-3 text-[12px] font-medium text-white transition-colors hover:bg-emerald-500"
        >
          <X className="w-3.5 h-3.5" /> 交还小助手
        </button>
      </div>

      {/* 输入条（IME 输入法走这里） */}
      <div className="mx-auto mb-3 flex w-full max-w-5xl items-center gap-2">
        <Keyboard className="w-4 h-4 shrink-0 text-slate-400" />
        <input
          value={typeText}
          onChange={(e) => setTypeText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") sendTypedText(); }}
          placeholder="输入法打字从这里送入网页（回车发送文字，页面里的回车用下方按钮）"
          className="min-w-0 flex-1 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-[13px] text-slate-100 placeholder:text-slate-500 focus:outline-none"
        />
        <button type="button" onClick={sendTypedText} className="shrink-0 rounded-full bg-slate-100 px-4 py-1.5 text-[12px] font-medium text-slate-900">发送文字</button>
        <button type="button" onClick={() => send({ type: "keydown", key: "Enter" })} className="shrink-0 rounded-full border border-white/15 px-3 py-1.5 text-[12px] text-slate-300">回车 ↵</button>
      </div>

      {/* 实时画面：可交互 */}
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <div
          ref={stageRef}
          tabIndex={0}
          onPointerMove={onPointerMove}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onContextMenu={onContextMenu}
          onKeyDown={onKeyDown}
          onKeyUp={onKeyUp}
          className="relative max-h-full cursor-crosshair select-none overflow-hidden rounded-xl border border-white/10 shadow-2xl focus:outline-none"
          style={{ aspectRatio: `${VIEW_W}/${VIEW_H}`, width: "min(100%, calc((100vh - 170px) * 1.6))" }}
        >
          {frame ? (
            <img src={frame} alt="实时网页画面" draggable={false} className="h-full w-full object-fill" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-slate-900 text-[13px] text-slate-500">
              等待画面…（小助手执行中也会实时显示）
            </div>
          )}
        </div>
      </div>

      <p className="pt-3 text-center text-[11px] text-slate-500">
        鼠标点击/拖动/右键、键盘（先点一下画面获得焦点）、滚轮都直接作用于真实网页 · 登录、滑块、付款都可以亲手完成
      </p>
    </div>,
    document.body
  );
}
