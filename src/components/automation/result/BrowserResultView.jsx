import React, { useState, useEffect, useRef, useCallback } from "react";
import { Loader2, Hand, Bot, Send, RotateCcw, ChevronDown, ChevronUp, Globe } from "lucide-react";
import { httpRequest } from "@/api/httpClient";
import { toast } from "sonner";

// 浏览器 Agent 结果视图：
// - running：实时截图 + 步骤流水
// - waiting_input：展示 AI 的提问，用户选择/补充回答，或亲自接管
// - takeover：截图流 + 点按转发 + 键盘输入，完成后交还 AI
// - done：汇总 + 提取的信息 + 完整步骤

const VIEW_W = 1280;
const VIEW_H = 800;

const TOOL_LABEL = {
  goto: "打开",
  click: "点击",
  fill: "填写",
  select: "选择",
  press: "按键",
  scroll: "滚动",
  extract: "记录",
  ask_user: "提问",
  user_answer: "回应",
  done: "完成",
  fail: "放弃",
  error: "异常"
};

function StepLine({ step }) {
  const label = TOOL_LABEL[step.tool] || step.tool;
  return (
    <div className="flex items-start gap-2 py-1 border-b border-slate-100 last:border-0">
      <span className="mt-0.5 inline-flex w-12 justify-center rounded bg-[#384877]/8 text-[10px] font-medium text-[#384877] px-1 py-0.5 flex-shrink-0">
        {label}
      </span>
      <div className="min-w-0 flex-1">
        {step.args ? <div className="text-[11.5px] text-slate-700 break-all">{step.args}</div> : null}
        {step.result ? <div className="text-[10.5px] text-slate-400 break-all line-clamp-2">{step.result}</div> : null}
      </div>
    </div>
  );
}

export default function BrowserResultView({ data, preview, executionId }) {
  const agent = data?.agent || {};
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const [showAllSteps, setShowAllSteps] = useState(false);
  const imgRef = useRef(null);

  const refresh = useCallback(async () => {
    if (!executionId) return null;
    try {
      const s = await httpRequest(`/api/task-executions/${executionId}/agent-state`);
      setState(s);
      return s;
    } catch {
      return null;
    }
  }, [executionId]);

  useEffect(() => {
    if (!executionId) return undefined;
    let cancelled = false;
    let timer = null;
    const tick = async () => {
      try {
        const s = await httpRequest(`/api/task-executions/${executionId}/agent-state`);
        if (cancelled) return;
        setState(s);
        if (s.active && ["running", "waiting_input", "takeover"].includes(s.status)) {
          timer = setTimeout(tick, 2500);
        }
      } catch {
        if (!cancelled) timer = setTimeout(tick, 4000);
      }
    };
    timer = setTimeout(tick, 500);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [executionId]);

  const act = async (path, body) => {
    if (!executionId || busy) return;
    setBusy(true);
    try {
      await httpRequest(`/api/task-executions/${executionId}/${path}`, { method: "POST", body });
      await refresh();
    } catch (e) {
      toast.error(e?.message || "操作失败，请稍后再试");
    } finally {
      setBusy(false);
    }
  };

  const sendCmd = async (cmd) => {
    if (!executionId || busy) return;
    setBusy(true);
    try {
      const r = await httpRequest(`/api/task-executions/${executionId}/agent-command`, { method: "POST", body: { cmd } });
      if (r && r.ok === false) toast.error(r.message || "指令失败");
      await refresh();
    } catch (e) {
      toast.error(e?.message || "指令失败");
    } finally {
      setBusy(false);
    }
  };

  const onShotClick = (e) => {
    const rect = imgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const x = Math.round(((e.clientX - rect.left) / rect.width) * VIEW_W);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * VIEW_H);
    sendCmd({ type: "click", x, y });
  };

  const status = state?.active ? state.status : (agent.status || "running");
  const steps = (state?.active ? state.steps : agent.steps) || [];
  const screenshot = (state?.active ? state.latestScreenshot : agent.latestScreenshot) || null;
  const currentUrl = (state?.active ? state.currentUrl : agent.finalUrl) || "";
  const waiting = state?.active ? state.waiting : agent.waiting;
  const summary = agent.summary || (status === "done" ? preview : "");
  const extracted = agent.extracted || "";
  const live = ["running", "waiting_input", "takeover"].includes(status) && state?.active !== false;

  const visibleSteps = showAllSteps ? steps : steps.slice(-6);

  return (
    <div className="space-y-3">
      {/* 状态条 */}
      <div className="flex items-center gap-2 text-[12px]">
        {status === "running" && (
          <span className="inline-flex items-center gap-1.5 text-[#384877] bg-[#384877]/8 rounded-full px-2.5 py-1">
            <Loader2 className="w-3 h-3 animate-spin" /> 浏览器 Agent 正在执行
          </span>
        )}
        {status === "waiting_input" && (
          <span className="inline-flex items-center gap-1.5 text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1">
            <Hand className="w-3 h-3" /> 需要你的回应
          </span>
        )}
        {status === "takeover" && (
          <span className="inline-flex items-center gap-1.5 text-violet-700 bg-violet-50 border border-violet-200 rounded-full px-2.5 py-1">
            <Hand className="w-3 h-3" /> 由你手动操作中
          </span>
        )}
        {status === "done" && (
          <span className="inline-flex items-center gap-1.5 text-emerald-700 bg-emerald-50 rounded-full px-2.5 py-1">
            <Globe className="w-3 h-3" /> 已完成
          </span>
        )}
        {currentUrl && (
          <a href={currentUrl} target="_blank" rel="noreferrer" className="text-[11px] text-slate-400 hover:text-[#384877] truncate max-w-[260px]">
            {currentUrl}
          </a>
        )}
      </div>

      {/* 网页画面 */}
      {screenshot && (
        <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-900">
          <img
            ref={imgRef}
            src={screenshot}
            alt="网页实时画面"
            className={`w-full block ${status === "takeover" ? "cursor-crosshair" : ""}`}
            onClick={status === "takeover" ? onShotClick : undefined}
            draggable={false}
          />
        </div>
      )}
      {status === "takeover" && (
        <p className="text-[11px] text-violet-600 -mt-1">点击上方网页画面即可操作真实浏览器；输入文字前先在页面点一下输入框。</p>
      )}

      {/* 需要回应 */}
      {status === "waiting_input" && waiting && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3.5 space-y-3">
          <p className="text-[13.5px] leading-relaxed text-slate-800">{waiting.question}</p>
          {Array.isArray(waiting.choices) && waiting.choices.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {waiting.choices.map((c) => (
                <button
                  key={c}
                  disabled={busy}
                  onClick={() => { setText(""); act("agent-respond", { choice: c }); }}
                  className="rounded-full border border-[#384877]/30 bg-white px-3.5 py-1.5 text-[12.5px] text-[#384877] hover:bg-[#384877]/8 transition disabled:opacity-50"
                >
                  {c}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && text.trim()) { act("agent-respond", { text: text.trim() }); setText(""); } }}
              placeholder="补充说明（可选）…"
              className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-[12.5px] outline-none focus:border-amber-300"
            />
            <button
              disabled={busy || !text.trim()}
              onClick={() => { act("agent-respond", { text: text.trim() }); setText(""); }}
              className="inline-flex items-center gap-1 rounded-lg bg-[#384877] text-white px-3 py-1.5 text-[12px] hover:bg-[#3b5aa2] transition disabled:opacity-40"
            >
              <Send className="w-3 h-3" /> 回应
            </button>
          </div>
          <button
            disabled={busy}
            onClick={() => act("agent-takeover")}
            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-violet-700 border border-violet-200 rounded-lg px-3 py-1.5 hover:bg-violet-50 transition disabled:opacity-50"
          >
            <Hand className="w-3.5 h-3.5" /> 我自己来操作网页
          </button>
        </div>
      )}

      {/* 手动操作工具条 */}
      {status === "takeover" && (
        <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-3 space-y-2.5">
          <div className="flex items-center gap-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && text.trim()) { sendCmd({ type: "type", text: text.trim() }); setText(""); } }}
              placeholder="输入文字，回车发送到当前焦点…"
              className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-[12.5px] outline-none focus:border-violet-300"
            />
            <button
              disabled={busy || !text.trim()}
              onClick={() => { sendCmd({ type: "type", text: text.trim() }); setText(""); }}
              className="inline-flex items-center gap-1 rounded-lg bg-violet-600 text-white px-3 py-1.5 text-[12px] hover:bg-violet-700 transition disabled:opacity-40"
            >
              <Send className="w-3 h-3" /> 输入
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button disabled={busy} onClick={() => sendCmd({ type: "key", key: "Enter" })} className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-[11.5px] text-slate-600 hover:bg-slate-50 disabled:opacity-40">回车</button>
            <button disabled={busy} onClick={() => sendCmd({ type: "key", key: "Escape" })} className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-[11.5px] text-slate-600 hover:bg-slate-50 disabled:opacity-40">Esc</button>
            <button disabled={busy} onClick={() => sendCmd({ type: "key", key: "Tab" })} className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-[11.5px] text-slate-600 hover:bg-slate-50 disabled:opacity-40">Tab</button>
            <button disabled={busy} onClick={() => sendCmd({ type: "scroll", dy: -500 })} className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-[11.5px] text-slate-600 hover:bg-slate-50 disabled:opacity-40">上滑</button>
            <button disabled={busy} onClick={() => sendCmd({ type: "scroll", dy: 500 })} className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-[11.5px] text-slate-600 hover:bg-slate-50 disabled:opacity-40">下滑</button>
            <button
              disabled={busy}
              onClick={() => { act("agent-release", { note: text.trim() }); setText(""); }}
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-[#384877] text-white px-3.5 py-1.5 text-[12px] hover:bg-[#3b5aa2] transition disabled:opacity-40"
            >
              <Bot className="w-3.5 h-3.5" /> 交还给 AI 继续
            </button>
          </div>
        </div>
      )}

      {/* 完成汇总 */}
      {status === "done" && summary && (
        <div className="rounded-xl bg-emerald-50/50 border border-emerald-100 p-3.5">
          <div className="text-[11px] font-medium text-emerald-700 mb-1">执行汇总</div>
          <p className="text-[13px] leading-relaxed text-slate-800 whitespace-pre-wrap">{summary}</p>
        </div>
      )}
      {status === "done" && extracted && (
        <div className="rounded-xl bg-slate-50 border border-slate-200 p-3.5">
          <div className="text-[11px] font-medium text-slate-500 mb-1">提取的信息</div>
          <p className="text-[12.5px] leading-relaxed text-slate-700 whitespace-pre-wrap">{extracted}</p>
        </div>
      )}

      {/* 步骤流水 */}
      {steps.length > 0 && (
        <div>
          <button
            onClick={() => setShowAllSteps(v => !v)}
            className="inline-flex items-center gap-1 text-[11.5px] text-slate-400 hover:text-slate-700 mb-1"
          >
            {showAllSteps ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            执行步骤（{steps.length}）
          </button>
          <div className="rounded-xl border border-slate-100 bg-white px-3 py-1 max-h-64 overflow-y-auto">
            {visibleSteps.map((s, i) => <StepLine key={i} step={s} />)}
          </div>
        </div>
      )}

      {/* 会话结束提示 */}
      {!live && status === "running" && !state?.active && (
        <p className="text-[11.5px] text-slate-400 flex items-center gap-1.5">
          <RotateCcw className="w-3 h-3" /> 会话已结束，可在守护记录里查看结果或再试一次。
        </p>
      )}
    </div>
  );
}
