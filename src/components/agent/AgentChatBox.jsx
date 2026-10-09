import React, { useState } from "react";
import { Send, Loader2 } from "lucide-react";

/** 与小助手的多轮对话：追加要求，逐步把内容落实 */
export default function AgentChatBox({ history, busy, onSend }) {
  const [text, setText] = useState("");
  const send = () => {
    const t = text.trim();
    if (!t || busy) return;
    setText("");
    onSend(t);
  };

  return (
    <div className="space-y-2">
      {history.length > 0 && (
        <div className="space-y-1.5 max-h-56 overflow-auto">
          {history.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed ${m.role === "user" ? "bg-[#384877] text-white" : "bg-white border border-slate-200 text-slate-700"}`}>
                {m.text}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (!e.nativeEvent.isComposing && e.key === "Enter") send(); }}
          placeholder="继续告诉小助手，如：只要直飞、预算 5000 内 / 语气再客气些"
          className="flex-1 bg-transparent outline-none text-sm text-slate-700 placeholder:text-slate-400 min-w-0"
          disabled={busy}
        />
        <button onClick={send} disabled={!text.trim() || busy} className="no-min-size p-1.5 rounded-lg bg-[#384877] text-white disabled:opacity-40">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );
}