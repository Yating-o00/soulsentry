import React from "react";
import { format } from "date-fns";

const KIND = { subagreement: "子约定", milestone: "节点", document: "文件" };

export default function ActivityFeed({ messages, items }) {
  const events = [
    ...items.map((i) => ({ id: i.id, at: i.updated_date || i.created_date, who: i.source === "agent" ? "Agent" : (i.owner_name || "成员"), text: `${i.version > 1 ? "更新" : "创建"}了${KIND[i.kind]}「${i.title}」` })),
    ...messages.filter((m) => m.tag && m.tag !== "none").map((m) => ({ id: m.id, at: m.created_date, who: m.author_name || "成员", text: `标记了一条${{ consensus: "共识", divergence: "分歧", pending: "待定" }[m.tag]}` })),
  ].sort((a, b) => new Date(b.at) - new Date(a.at));

  if (!events.length) return <p className="text-sm text-slate-400 text-center py-12">还没有共同动态</p>;
  return (
    <ol className="relative border-l border-slate-200 ml-2 space-y-5">
      {events.map((e) => (
        <li key={e.id} className="pl-5 relative">
          <span className="absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full bg-[#384877]/70" />
          <p className="text-sm text-slate-700"><span className="font-medium text-slate-900">{e.who}</span> {e.text}</p>
          <p className="text-xs text-slate-400 mt-0.5">{format(new Date(e.at), "MM-dd HH:mm")}</p>
        </li>
      ))}
    </ol>
  );
}