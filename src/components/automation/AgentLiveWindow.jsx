import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Keyboard, RotateCw, Maximize2, Minimize2 } from "lucide-react";
import { getAccessToken } from "@/api/httpClient";

// 实时浏览器窗口（Muse 式接管）：WebSocket 接收 CDP 视频流帧，
// 用户在画面上的鼠标/键盘操作实时转发进真实浏览器；关闭窗口即交还小助手。
// 视口固定 1280x800（与 Agent 会话一致），坐标按比例映射。

const VIEW_W = 1280;
const VIEW_H = 800;

function wsUrl(executionId, takeover = true) {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const mode = takeover ? "takeover" : "view";
  return `${proto}//${window.location.host}/ws/agent-stream?token=${encodeURIComponent(getAccessToken() || "")}&executionId=${encodeURIComponent(executionId)}&mode=${mode}`;
}

// e.key → Playwright key 名
function mapKey(key) {
  if (key === " ") return "Space";
  if (key === "Esc") return "Escape";
  return key;
}

export default function AgentLiveWindow({ executionId, onClose, compact = false, takeoverRequested = 0 }) {
  const [expanded, setExpanded] = useState(!compact);
  const [takeover, setTakeover] = useState(!compact || takeoverRequested > 0);
  const isFull = !compact || expanded;
  const [frame, setFrame] = useState("");
  const [connected, setConnected] = useState(false);
  const [notice, setNotice] = useState("正在连接…");
  const [postmortem, setPostmortem] = useState(false); // 小助手已退出，用户接管失败现场
  const [typeText, setTypeText] = useState("");
  const wsRef = useRef(null);
  const stageRef = useRef(null);
  const lastMoveRef = useRef(0);
  const closedRef = useRef(false);
  const finalMsgRef = useRef(false); // 服务端已发来终态消息（error/ended），断线时保留原文案

  // 父级要求接管（例如在提问卡里点了「我自己来操作网页」）时自动切换
  useEffect(() => {
    if (takeoverRequested > 0) setTakeover(true);
  }, [takeoverRequested]);

  useEffect(() => {
    let ws;
    let disposed = false;
    // 切换观看/接管时先让旧连接退订，避免服务端「已有窗口接管」的竞态
    const timer = setTimeout(() => {
      if (disposed) return;
      closedRef.current = false;
      finalMsgRef.current = false;
      try {
        ws = new WebSocket(wsUrl(executionId, takeover));
      } catch {
        setNotice("连接失败，请刷新后重试");
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        // 具体文案等 ready 消息（区分小助手待命 / 失败现场接管）
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === "frame") setFrame(msg.data);
          else if (msg.type === "ready") {
            setPostmortem(!!msg.postmortem);
            setNotice(msg.postmortem
              ? "小助手停在这里了：你可以亲手操作，收起窗口后现场再保留约 30 分钟"
              : takeover
                ? "已接管：小助手原地待命，你的操作实时生效"
                : "实时观看中：小助手继续操作，需要登录/付款时可点「接管操作」");
          }
          else if (msg.type === "ended") { finalMsgRef.current = true; setNotice("小助手已结束本次任务"); }
          else if (msg.type === "error") { finalMsgRef.current = true; setNotice(msg.message || "连接异常"); }
        } catch {
          // 忽略单条消息解析失败
        }
      };
      ws.onclose = () => {
        setConnected(false);
        if (!closedRef.current && !finalMsgRef.current) setNotice("连接已断开");
      };
      ws.onerror = () => setNotice("连接异常，请关闭重试");
    }, 250);

    return () => {
      disposed = true;
      clearTimeout(timer);
      closedRef.current = true;
      try { ws?.close(); } catch {
        // 连接可能已断开
      }
    };
  }, [executionId, takeover]);

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
    if (!takeover) return;
    const now = Date.now();
    if (now - lastMoveRef.current < 25) return; // ~40/s 限流
    lastMoveRef.current = now;
    const p = toViewport(e);
    if (p) send({ type: "mousemove", ...p });
  };

  const onPointerDown = (e) => {
    if (!takeover) return;
    stageRef.current?.focus();
    const p = toViewport(e);
    if (p) send({ type: "mousedown", ...p, button: e.button === 2 ? "right" : "left" });
  };

  const onPointerUp = (e) => {
    if (!takeover) return;
    const p = toViewport(e);
    if (p) send({ type: "mouseup", ...p, button: e.button === 2 ? "right" : "left" });
  };

  const onContextMenu = (e) => {
    e.preventDefault();
    if (!takeover) return;
    const p = toViewport(e);
    if (!p) return;
    send({ type: "mousedown", ...p, button: "right" });
    setTimeout(() => send({ type: "mouseup", ...p, button: "right" }), 80);
  };

  // wheel 需要非 passive 监听才能 preventDefault
  useEffect(() => {
    const el = stageRef.current;
    if (!el || !takeover) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      send({ type: "wheel", deltaX: Math.round(e.deltaX), deltaY: Math.round(e.deltaY) });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
     
  }, [connected, takeover]);

  const onKeyDown = (e) => {
    if (!takeover) return;
    // 目标是输入条时不截获
    if (e.target.tagName === "INPUT") return;
    e.preventDefault();
    send({ type: "keydown", key: mapKey(e.key) });
  };
  const onKeyUp = (e) => {
    if (!takeover) return;
    if (e.target.tagName === "INPUT") return;
    e.preventDefault();
    send({ type: "keyup", key: mapKey(e.key) });
  };

  const sendTypedText = () => {
    if (!takeover) return;
    const t = typeText.trim();
    if (!t) return;
    setTypeText("");
    send({ type: "type", text: t });
  };

  return createPortal(
    <div
      className={isFull
        ? "fixed inset-0 z-[90] flex flex-col bg-slate-950/92 p-3 sm:p-5"
        : "fixed right-2 top-[calc(56px_+_env(safe-area-inset-top))] z-[96] flex w-[min(360px,calc(100vw-16px))] flex-col overflow-hidden rounded-2xl border border-white/15 bg-slate-950 p-2 shadow-2xl md:right-5 md:top-auto md:bottom-[calc(84px_+_env(safe-area-inset-bottom))] md:w-[min(420px,calc(100vw-40px))]"}
      style={isFull ? { background: "rgba(2,6,23,0.94)" } : undefined}
    >
      {/* 顶栏 */}
      <div className={isFull ? "mx-auto flex w-full max-w-5xl items-center gap-3 pb-3" : "flex items-center gap-2 pb-2"}>
        <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: connected ? "#34d399" : "#f59e0b" }} />
        <p className={`truncate text-slate-200 ${isFull ? "text-[13px]" : "text-[11px]"}`}>{notice}</p>
        <button
          type="button"
          onClick={() => send({ type: "refresh" })}
          title="刷新画面"
          className={`ml-auto flex shrink-0 items-center justify-center rounded-full text-slate-300 transition-colors hover:bg-white/10 ${isFull ? "h-8 w-8" : "h-7 w-7"}`}
        >
          <RotateCw className={isFull ? "w-4 h-4" : "w-3.5 h-3.5"} />
        </button>
        {compact && (
          <button
            type="button"
            onClick={() => setTakeover((value) => !value)}
            title={takeover ? "切回观看，让小助手继续操作" : "接管操作，亲手处理登录/付款"}
            className="flex h-7 shrink-0 items-center rounded-full border border-white/15 px-2.5 text-[11px] text-slate-200 transition-colors hover:bg-white/10"
          >
            {takeover ? "仅观看" : "接管操作"}
          </button>
        )}
        {compact && (
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            title={expanded ? "缩小窗口" : "放大窗口"}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-300 transition-colors hover:bg-white/10"
          >
            {expanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          title="交还小助手并关闭"
          className={`flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/90 font-medium text-white transition-colors hover:bg-emerald-500 ${isFull ? "h-8 px-3 text-[12px]" : "h-7 px-2.5 text-[11px]"}`}
        >
          <X className="w-3.5 h-3.5" /> {compact ? (postmortem ? "关闭" : takeover ? "交还" : "收起") : (postmortem ? "关闭窗口" : "交还小助手")}
        </button>
      </div>

      {/* 输入条（IME 输入法走这里）；观看模式不接管输入 */}
      {takeover && (
        <div className={isFull ? "mx-auto mb-3 flex w-full max-w-5xl items-center gap-2" : "mb-2 flex items-center gap-1.5"}>
          <Keyboard className={`shrink-0 text-slate-400 ${isFull ? "w-4 h-4" : "w-3.5 h-3.5"}`} />
          <input
            value={typeText}
            onChange={(e) => setTypeText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") sendTypedText(); }}
            placeholder={isFull ? "输入法打字从这里送入网页（回车发送文字，页面里的回车用下方按钮）" : "输入法打字送入网页，回车发送"}
            className={`min-w-0 flex-1 rounded-full border border-white/10 bg-white/5 text-slate-100 placeholder:text-slate-500 focus:outline-none ${isFull ? "px-4 py-1.5 text-[13px]" : "px-3 py-1 text-[12px]"}`}
          />
          <button type="button" onClick={sendTypedText} className={`shrink-0 rounded-full bg-slate-100 font-medium text-slate-900 ${isFull ? "px-4 py-1.5 text-[12px]" : "px-3 py-1 text-[11px]"}`}>发送文字</button>
          {isFull && (
            <button type="button" onClick={() => send({ type: "keydown", key: "Enter" })} className="shrink-0 rounded-full border border-white/15 px-3 py-1.5 text-[12px] text-slate-300">回车 ↵</button>
          )}
        </div>
      )}

      {/* 实时画面：可交互 */}
      <div className={isFull ? "flex min-h-0 flex-1 items-center justify-center" : "flex items-center justify-center"}>
        <div
          ref={stageRef}
          tabIndex={0}
          onPointerMove={onPointerMove}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onContextMenu={onContextMenu}
          onKeyDown={onKeyDown}
          onKeyUp={onKeyUp}
          className={isFull
            ? `relative max-h-full select-none overflow-hidden rounded-xl border border-white/10 shadow-2xl focus:outline-none ${takeover ? "cursor-crosshair" : "cursor-default"}`
            : `relative w-full select-none overflow-hidden rounded-lg border border-white/10 focus:outline-none ${takeover ? "cursor-crosshair" : "cursor-default"}`}
          style={isFull
            ? { aspectRatio: `${VIEW_W}/${VIEW_H}`, width: "min(100%, calc((100vh - 170px) * 1.6))" }
            : { aspectRatio: "16 / 10", width: "100%" }}
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

      <p className={isFull ? "pt-3 text-center text-[11px] text-slate-500" : "pt-1.5 text-center text-[10px] text-slate-500"}>
        {takeover
          ? (isFull
            ? "鼠标点击/拖动/右键、键盘（先点一下画面获得焦点）、滚轮都直接作用于真实网页 · 登录、滑块、付款都可以亲手完成"
            : "可直接点击/拖动画面，登录、验证码、付款由你亲手完成")
          : "实时观看中：小助手继续操作；需要登录、验证码或付款时，点上方「接管操作」亲手处理"}
      </p>
    </div>,
    document.body
  );
}
