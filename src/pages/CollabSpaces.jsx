import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Plus, Loader2, Users } from "lucide-react";
import CreateCollabDialog from "@/components/collab/CreateCollabDialog";
import CollabSpaceCard from "@/components/collab/CollabSpaceCard";

export default function CollabSpaces() {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["collab-spaces"],
    queryFn: async () => {
      const spaces = await base44.entities.CollabSpace.list("-updated_date", 50);
      const ids = spaces.map((s) => s.id);
      const items = ids.length ? await base44.entities.CollabItem.filter({ space_id: { $in: ids }, kind: { $in: ["subagreement", "milestone"] } }, "due_date", 500) : [];
      const stats = {};
      spaces.forEach((s) => {
        const mine = items.filter((i) => i.space_id === s.id);
        const subs = mine.filter((i) => i.kind === "subagreement");
        stats[s.id] = {
          total: subs.length,
          done: subs.filter((i) => i.status === "done").length,
          pending: mine.filter((i) => ["draft", "pending_confirm"].includes(i.status)).length,
          next: mine.find((i) => i.kind === "milestone" && i.status !== "done")?.title,
        };
      });
      return { spaces, stats };
    },
  });

  return (
    <div className="max-w-5xl mx-auto px-5 md:px-8 py-10">
      <div className="flex items-end justify-between mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900">协同约定</h1>
          <p className="text-sm text-slate-500 mt-1.5">和 TA / 朋友 / 同事一起讨论、形成共识，由 Agent 整理沉淀</p>
        </div>
        <Button onClick={() => setOpen(true)} className="rounded-full bg-[#384877] hover:bg-[#2d3a62] h-11 px-5"><Plus className="w-4 h-4 mr-1" />创建协同约定</Button>
      </div>
      {isLoading ? <Loader2 className="w-6 h-6 animate-spin text-slate-400 mx-auto mt-20" /> :
        data.spaces.length === 0 ? (
          <div className="text-center py-20 rounded-[28px] border border-dashed border-slate-200">
            <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">还没有协同约定，邀请身边的人一起共建吧</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-5">{data.spaces.map((s) => <CollabSpaceCard key={s.id} space={s} stats={data.stats[s.id]} />)}</div>
        )}
      <CreateCollabDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}