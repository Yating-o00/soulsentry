import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Bot, Loader2, Send, ListPlus, Flag, FileText } from "lucide-react";
import { runCollabAgent, persistAgentResult } from "@/lib/collabAgent";

const TAGS = { consensus: ["共识", "bg-emerald-50 text-emerald-700"], divergence: ["分歧", "bg-rose-50 text-rose-600"], pending: ["待确认", "bg-amber-50 text-amber-700"] };
const QUICK = ["整理一下我们目前的分歧", "把讨论拆成子约定草案", "还有哪些信息没有确认？"];

export default function DiscussionTab({ space, me, messages, items, refresh }) {
  const [text, setText] = useState("");
  const [agentBusy, setAgentBusy] = useState(false);
  const base = { space_id: space.id, member_ids: space.member_ids };
  const agentOn = space.agent_enabled && !space.agent_paused;

  const callAgent = async (request) => {
    setAgentBusy(true);
    await persistAgentResult(space, await runCollabAgent({ space, messages, items, request }));
    setAgentBusy(false);
    refresh();
  };

  const send = async () => {
    const content = text.trim();
    if (!content) return;
    setText("");
    await base44.entities.CollabMessage.create({ ...base, author_name: me.full_name || me.email, content });
    refresh();
    if (agentOn && content.includes("@Agent")) callAgent(content.replace("@Agent", "").trim() || "organize");
  };

  const tag = async (m, t) => { await base44.entities.CollabMessage.update(m.id, { tag: m.tag === t ? "none" : t }); refresh(); };
  const convert = async (m, kind) => {
    await base44.entities.CollabItem.create({ ...base, kind, status: "draft", title: m.content.slice(0, 40), content: m.content });
    refresh();
  };

  return (
    <div className="space-y-5">
      <div className="space-y-4">
        {messages.map((m) => (
          <div key={m.id} className={`group rounded-2xl p-4 ${m.is_agent ? "bg-[#384877]/[0.04] border border-[#384877]/10" : "bg-white border border-slate-100"}`}>
            <div className="flex items-center gap-2 mb-1.5">
              {m.is_agent && <Bot className="w-4 h-4 text-[#384877]" />}
              <span className="text-sm font-semibold text-slate-800">{m.author_name}</span>
              {TAGS[m.tag] && <span className={`text-[11px] px-2 py-0.5 rounded-full ${TAGS[m.tag][1]}`}>{TAGS[m.tag][0]}</span>}
              <span className="text-[11px] text-slate-400 ml-auto">{new Date(m.created_date).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
            </div>
            <p className="text-[15px] text-slate-700 whitespace-pre-wrap leading-relaxed">{m.content}</p>
            <div className="flex flex-wrap gap-1.5 mt-3 opacity-60 group-hover:opacity-100 transition">
              {Object.entries(TAGS).map(([k, [l]]) => <button key={k} onClick={() => tag(m, k)} className="text-[11px] px-2 py-1 rounded-full border border-slate-200 text-slate-500 hover:border-[#384877]/40">{l}</button>)}
              <button onClick={() => convert(m, "subagreement")} className="text-[11px] px-2 py-1 rounded-full text-[#384877] hover:bg-[#384877]/5 flex items-center gap-1"><ListPlus className="w-3 h-3" />转子约定</button>
              <button onClick={() => convert(m, "milestone")} className="text-[11px] px-2 py-1 rounded-full text-[#384877] hover:bg-[#384877]/5 flex items-center gap-1"><Flag className="w-3 h-3" />标记节点</button>
              <button onClick={() => convert(m, "document")} className="text-[11px] px-2 py-1 rounded-full text-[#384877] hover:bg-[#384877]/5 flex items-center gap-1"><FileText className="w-3 h-3" />沉淀文件</button>
            </div>
          </div>
        ))}
        {agentBusy && <p className="text-sm text-[#384877] flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Agent 正在整理…</p>}
      </div>

      <div className="sticky bottom-0 bg-white pt-3 space-y-2">
        {agentOn && (
          <div className="flex flex-wrap gap-2">
            <button disabled={agentBusy} onClick={() => callAgent("organize")} className="text-xs px-3 py-1.5 rounded-full bg-[#384877] text-white flex items-center gap-1"><Bot className="w-3.5 h-3.5" />@Agent 整理</button>
          </div>
        )}
        <div className="flex gap-2">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="发表观点…" className="rounded-2xl min-h-[52px] bg-slate-50"
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
          <Button onClick={send} className="h-auto rounded-2xl bg-[#384877] hover:bg-[#2d3a62] px-5"><Send className="w-4 h-4" /></Button>
        </div>
      </div>
    </div>
  );
}