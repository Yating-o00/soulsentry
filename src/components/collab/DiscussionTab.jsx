import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Bot, Loader2, Send } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { runCollabAgent, persistAgentResult } from "@/lib/collabAgent";

export default function DiscussionTab({ space, me, messages, items, refresh }) {
  const [text, setText] = useState("");
  const [agentBusy, setAgentBusy] = useState(false);
  const agentOn = space.agent_enabled && !space.agent_paused;

  const send = async () => {
    const content = text.trim();
    if (!content) return;
    setText("");
    const msg = await base44.entities.CollabMessage.create({ space_id: space.id, member_ids: space.member_ids, author_name: me.full_name || me.email, content });
    refresh();
    if (!agentOn || agentBusy) return;
    const mentioned = /@(心栈)?Agent/i.test(content);
    // 未 @ 时 Agent 静默整理：每 2 条成员消息更新一次看板，不插话
    const memberCount = messages.filter((m) => !m.is_agent).length + 1;
    if (!mentioned && memberCount % 2 !== 0) return;
    setAgentBusy(true);
    try {
      const r = await runCollabAgent({ space, messages: [...messages, msg], items, request: mentioned ? (content.replace(/@(心栈)?Agent/gi, "").trim() || "整理一下目前的对话") : null });
      await persistAgentResult(space, r, items);
    } finally {
      setAgentBusy(false);
      refresh();
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {messages.map((m) => (
        <div key={m.id} className={`rounded-2xl p-4 ${m.is_agent ? "bg-[#384877]/[0.04] border border-[#384877]/10" : "bg-white border border-slate-100"}`}>
          <div className="flex items-center gap-2 mb-1.5">
            {m.is_agent && <Bot className="w-4 h-4 text-[#384877]" />}
            <span className="text-sm font-semibold text-slate-800">{m.author_name}</span>
            <span className="text-[11px] text-slate-400 ml-auto">{new Date(m.created_date).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
          </div>
          <div className="text-[15px] text-slate-700 leading-relaxed prose prose-sm max-w-none"><ReactMarkdown>{m.content}</ReactMarkdown></div>
        </div>
      ))}
      {agentBusy && <p className="text-sm text-[#384877] flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Agent 正在合并整理讨论要点…</p>}

      <div className="sticky bottom-0 bg-[#f8f9fb] pt-3 flex gap-2">
        {agentOn && <button type="button" onClick={() => setText((t) => (t.includes("@心栈Agent") ? t : `@心栈Agent ${t}`))} title="@心栈Agent" className="h-auto rounded-2xl border border-[#384877]/20 bg-white px-3 text-[#384877] hover:bg-[#384877]/5"><Bot className="w-4 h-4" /></button>}
        <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="和大家聊聊，或 @心栈Agent 提问、要建议、整理对话…" className="rounded-2xl min-h-[52px] bg-white"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
        <Button onClick={send} disabled={agentBusy} className="h-auto rounded-2xl bg-[#384877] hover:bg-[#2d3a62] px-5"><Send className="w-4 h-4" /></Button>
      </div>
    </div>
  );
}