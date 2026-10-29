import React from "react";
import { base44 } from "@/api/base44Client";
import { Bot, Trash2 } from "lucide-react";

export const STATUS = {
  draft: ["草案", "bg-slate-100 text-slate-600", "提交确认"],
  pending_confirm: ["待确认", "bg-amber-50 text-amber-700", "我确认"],
  in_progress: ["进行中", "bg-[#384877]/10 text-[#384877]", "提交验收"],
  pending_accept: ["待验收", "bg-violet-50 text-violet-700", "验收通过"],
  done: ["已完成", "bg-emerald-50 text-emerald-700", null],
};
const ORDER = ["draft", "pending_confirm", "in_progress", "pending_accept", "done"];
const MS = { time: "时间", stage: "阶段", decision: "决策", review: "回顾" };

export default function ItemRow({ item, space, me, refresh }) {
  const [label, cls, action] = STATUS[item.status] || STATUS.draft;
  const confirmed = item.confirmed_by || [];

  const advance = async () => {
    let patch = { status: ORDER[ORDER.indexOf(item.status) + 1] };
    if (item.status === "pending_confirm") {
      const by = [...new Set([...confirmed, me.id])];
      const need = space.confirm_mode === "all" ? space.member_ids.length : 1;
      const allowed = space.confirm_mode !== "creator" || me.id === space.created_by_id;
      if (!allowed) return;
      patch = by.length >= need ? { ...patch, confirmed_by: by } : { confirmed_by: by };
    }
    await base44.entities.CollabItem.update(item.id, patch);
    refresh();
  };
  const remove = async () => { await base44.entities.CollabItem.delete(item.id); refresh(); };

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 md:p-5">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className={`text-[11px] px-2 py-0.5 rounded-full ${cls}`}>{label}</span>
            {item.source === "agent" && <Bot className="w-3.5 h-3.5 text-[#384877]" />}
            {item.due_date && <span className="text-[11px] text-slate-400">{item.due_date}</span>}
          </div>
          <p className="text-[15px] font-medium text-slate-900 leading-snug">{item.title}</p>
          {item.done_criteria && <p className="text-sm text-slate-500 mt-1.5 leading-relaxed"><span className="text-slate-400">完成标准：</span>{item.done_criteria}</p>}
          {item.owner_name && <p className="text-xs text-slate-400 mt-1">负责人：{item.owner_name}</p>}
          {item.status === "pending_confirm" && space.confirm_mode === "all" && <p className="text-xs text-amber-600 mt-1">已确认 {confirmed.length}/{space.member_ids.length}</p>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {action && !(item.status === "pending_confirm" && confirmed.includes(me.id)) && (
            <button onClick={advance} className="text-xs px-3 py-1.5 rounded-full bg-[#384877] text-white hover:bg-[#2d3a62]">{item.kind === "milestone" && item.status === "in_progress" ? "标记达成" : action}</button>
          )}
          <button onClick={remove} className="p-1.5 text-slate-300 hover:text-rose-500"><Trash2 className="w-4 h-4" /></button>
        </div>
      </div>
    </div>
  );
}