import React from "react";
import ItemRow from "./ItemRow";

const BADGE = {
  in_progress: ["讨论中", "bg-slate-100 text-slate-600"],
  pending_confirm: ["待确认", "bg-amber-50 text-amber-700"],
  done: ["已定", "bg-emerald-50 text-emerald-700"],
};

// 一个讨论大方向：状态 + 结论 + 下一步 + 待谁确认 + 子约定
export default function ThemeCard({ theme, kids, refresh }) {
  const [label, cls] = BADGE[theme.status] || BADGE.in_progress;
  const done = kids.filter((k) => k.status === "done").length;
  return (
    <div className="rounded-2xl border border-slate-100 bg-white px-4 py-3 space-y-2">
      <div className="flex items-center gap-2">
        <p className="font-semibold text-slate-900 flex-1">{theme.title}</p>
        <span className={`text-[11px] px-2 py-0.5 rounded-full ${cls}`}>{label}</span>
        {kids.length > 0 && <span className="text-xs text-slate-400">{done}/{kids.length}</span>}
      </div>
      {theme.content && <p className="text-sm text-slate-700"><span className="text-slate-400">结论：</span>{theme.content}</p>}
      {(theme.done_criteria || theme.owner_name) && (
        <p className="text-xs text-[#384877]">
          {theme.done_criteria && <>下一步：{theme.done_criteria}</>}
          {theme.owner_name && <span className="ml-2 text-amber-700">· 待 {theme.owner_name} 确认</span>}
        </p>
      )}
      {kids.length > 0 && <div className="pt-1 border-t border-slate-50">{kids.map((k) => <ItemRow key={k.id} item={k} refresh={refresh} />)}</div>}
    </div>
  );
}