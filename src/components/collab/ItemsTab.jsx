import React from "react";
import ItemRow from "./ItemRow";

export default function ItemsTab({ kind, items, refresh }) {
  const list = items.filter((i) => i.kind === kind);
  if (!list.length) return <p className="text-sm text-slate-400 py-4">讨论中形成的内容会自动出现在这里</p>;
  if (kind !== "subagreement") return list.map((i) => <ItemRow key={i.id} item={i} refresh={refresh} />);

  const themes = list.filter((i) => i.is_theme);
  const themeIds = new Set(themes.map((t) => t.id));
  const loose = list.filter((i) => !i.is_theme && !themeIds.has(i.parent_id));

  return (
    <div className="space-y-4">
      {themes.map((t) => {
        const kids = list.filter((i) => i.parent_id === t.id);
        const done = kids.filter((k) => k.status === "done").length;
        return (
          <div key={t.id} className="rounded-2xl border border-slate-100 bg-white px-4 py-3">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-slate-900">{t.title}</p>
              <span className="text-xs text-slate-400">{done}/{kids.length}</span>
            </div>
            <div className="pl-1 mt-1">{kids.map((k) => <ItemRow key={k.id} item={k} refresh={refresh} />)}</div>
          </div>
        );
      })}
      {loose.length > 0 && <div className="px-1">{loose.map((i) => <ItemRow key={i.id} item={i} refresh={refresh} />)}</div>}
    </div>
  );
}