import React from "react";
import ItemRow from "./ItemRow";
import ThemeCard from "./ThemeCard";

export default function ItemsTab({ kind, items, refresh }) {
  const list = items.filter((i) => i.kind === kind);
  if (!list.length) return <p className="text-sm text-slate-400 py-4">讨论中形成的内容会自动出现在这里</p>;
  if (kind !== "subagreement") return list.map((i) => <ItemRow key={i.id} item={i} refresh={refresh} />);

  const themes = list.filter((i) => i.is_theme);
  const themeIds = new Set(themes.map((t) => t.id));
  const loose = list.filter((i) => !i.is_theme && !themeIds.has(i.parent_id));

  return (
    <div className="space-y-4">
      {themes.map((t) => <ThemeCard key={t.id} theme={t} kids={list.filter((i) => i.parent_id === t.id)} refresh={refresh} />)}
      {loose.length > 0 && <div className="px-1">{loose.map((i) => <ItemRow key={i.id} item={i} refresh={refresh} />)}</div>}
    </div>
  );
}