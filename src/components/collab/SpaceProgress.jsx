import React from "react";

export default function SpaceProgress({ items }) {
  const subs = items.filter((i) => i.kind === "subagreement");
  const done = subs.filter((i) => i.status === "done").length;
  const pending = items.filter((i) => ["draft", "pending_confirm"].includes(i.status)).length;
  const next = items.find((i) => i.kind === "milestone" && i.status !== "done");
  const pct = subs.length ? Math.round((done / subs.length) * 100) : 0;
  const stat = (label, value) => (
    <div><p className="text-[11px] text-slate-400">{label}</p><p className="mt-1 text-sm font-semibold text-slate-800 truncate">{value}</p></div>
  );
  return (
    <div className="pt-5 border-t border-slate-100">
      <div className="flex justify-between text-xs mb-2"><span className="font-medium text-slate-600">执行进度</span><span className="text-[#384877] font-semibold">{pct}%</span></div>
      <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-[#384877] transition-all" style={{ width: `${pct}%` }} /></div>
      <div className="grid grid-cols-3 gap-3 mt-4">
        {stat("已完成", `${done}/${subs.length}`)}
        {stat("待确认", pending)}
        {stat("下一节点", next?.title || "暂无")}
      </div>
    </div>
  );
}