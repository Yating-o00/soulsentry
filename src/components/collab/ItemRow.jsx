import React from "react";
import { base44 } from "@/api/base44Client";
import { Check, X } from "lucide-react";

export default function ItemRow({ item, refresh }) {
  const done = item.status === "done";
  const toggle = async () => { await base44.entities.CollabItem.update(item.id, { status: done ? "in_progress" : "done" }); refresh(); };
  const remove = async () => { await base44.entities.CollabItem.delete(item.id); refresh(); };

  return (
    <div className="group flex items-start gap-3 py-2">
      <button onClick={toggle} className={`mt-0.5 w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${done ? "bg-[#384877] border-[#384877]" : "border-slate-300 hover:border-[#384877]"}`}>
        {done && <Check className="w-3 h-3 text-white" />}
      </button>
      <div className="flex-1 min-w-0">
        <p className={`text-[15px] leading-snug ${done ? "line-through text-slate-400" : "text-slate-800"}`}>{item.title}</p>
        {(item.done_criteria || item.due_date || item.owner_name) && (
          <p className="text-xs text-slate-400 mt-1">{[item.due_date, item.done_criteria, item.owner_name].filter(Boolean).join(" · ")}</p>
        )}
      </div>
      <button onClick={remove} className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-rose-500"><X className="w-4 h-4" /></button>
    </div>
  );
}