import React from "react";
import { Link } from "react-router-dom";
import { Bot, Users, Flag } from "lucide-react";
import { SCENES } from "@/lib/collabAgent";

export default function CollabSpaceCard({ space, stats }) {
  const s = stats || { total: 0, done: 0, pending: 0, next: null };
  return (
    <Link to={`/collab-space?id=${space.id}`} className="block bg-white rounded-[24px] border border-slate-100 p-6 hover:shadow-lg hover:-translate-y-0.5 transition-all">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs px-2.5 py-1 rounded-full bg-[#384877]/10 text-[#384877] font-medium">{SCENES[space.scene]?.label}</span>
        <span className="text-xs text-slate-400 flex items-center gap-1"><Users className="w-3.5 h-3.5" />{(space.members || []).length} 人共建</span>
        {space.agent_enabled && <Bot className="w-3.5 h-3.5 text-[#384877] ml-auto" />}
      </div>
      <h3 className="text-lg font-semibold text-slate-900 leading-snug">{space.title}</h3>
      {space.goal && <p className="text-sm text-slate-500 mt-1.5 line-clamp-2 leading-relaxed">{space.goal}</p>}
      <div className="mt-5 h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div className="h-full bg-[#384877] rounded-full" style={{ width: `${s.total ? (s.done / s.total) * 100 : 0}%` }} />
      </div>
      <div className="flex items-center justify-between mt-3 text-xs text-slate-500">
        <span>子约定 {s.done}/{s.total} 已完成</span>
        {s.pending > 0 && <span className="text-amber-600">{s.pending} 项待确认</span>}
      </div>
      {s.next && <p className="mt-2 text-xs text-slate-600 flex items-center gap-1"><Flag className="w-3.5 h-3.5 text-[#384877]" />下一节点：{s.next}</p>}
    </Link>
  );
}