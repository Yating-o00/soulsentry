import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Plus, Loader2, Users } from "lucide-react";
import CreateCollabDialog from "@/components/collab/CreateCollabDialog";
import CollabSpaceCard from "@/components/collab/CollabSpaceCard";

export default function CollabSection() {
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
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#384877]/10 flex items-center justify-center"><Users className="w-5 h-5 text-[#384877]" /></div>
          <div>
            <h3 className="text-lg font-semibold text-slate-900">协同约定</h3>
            <p className="text-sm text-slate-500">和 TA / 朋友 / 同事一起讨论共建，由 Agent 整理沉淀</p>
          </div>
        </div>
        <button onClick={() => setOpen(true)} className="flex items-center gap-1 rounded-full bg-[#384877] hover:bg-[#2d3a62] text-white text-sm h-10 px-4"><Plus className="w-4 h-4" />新建协同约定</button>
      </div>
      {isLoading ? <Loader2 className="w-6 h-6 animate-spin text-slate-400 mx-auto my-12" /> :
        data.spaces.length === 0 ? (
          <div className="text-center py-16 rounded-[24px] border border-dashed border-slate-200 text-slate-500">还没有协同约定，邀请身边的人一起共建吧</div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-5">{data.spaces.map((s) => <CollabSpaceCard key={s.id} space={s} stats={data.stats[s.id]} />)}</div>
        )}
      <CreateCollabDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}