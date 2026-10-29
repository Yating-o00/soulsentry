import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import ItemRow from "./ItemRow";

const LABEL = { subagreement: ["子约定", "做什么"], milestone: ["节点", "节点，如：周五前确认预算"] };

export default function ItemsTab({ kind, space, me, items, refresh }) {
  const [title, setTitle] = useState("");
  const [extra, setExtra] = useState("");
  const list = items.filter((i) => i.kind === kind);
  const done = list.filter((i) => i.status === "done").length;

  const add = async () => {
    if (!title.trim()) return;
    await base44.entities.CollabItem.create({
      space_id: space.id, member_ids: space.member_ids, kind, title: title.trim(), status: "draft",
      ...(kind === "subagreement" ? { done_criteria: extra, owner_name: me.full_name } : { due_date: extra || undefined }),
    });
    setTitle(""); setExtra(""); refresh();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col md:flex-row gap-2">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={LABEL[kind][1]} className="h-11 rounded-2xl bg-slate-50 flex-1" />
        <Input value={extra} onChange={(e) => setExtra(e.target.value)} type={kind === "milestone" ? "date" : "text"} placeholder="怎样算完成" className="h-11 rounded-2xl bg-slate-50 md:w-64" />
        <Button onClick={add} className="h-11 rounded-2xl bg-[#384877] hover:bg-[#2d3a62] px-6">添加</Button>
      </div>
      {list.length === 0 ? <p className="text-center text-sm text-slate-400 py-12 border border-dashed border-slate-200 rounded-2xl">暂无{LABEL[kind][0]}</p> :
        list.map((i) => <ItemRow key={i.id} item={i} space={space} me={me} refresh={refresh} />)}
    </div>
  );
}