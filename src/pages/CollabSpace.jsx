import React, { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Loader2 } from "lucide-react";
import SpaceHeader from "@/components/collab/SpaceHeader";
import FoldSection from "@/components/collab/FoldSection";
import DiscussionTab from "@/components/collab/DiscussionTab";
import ItemsTab from "@/components/collab/ItemsTab";
import DocsTab from "@/components/collab/DocsTab";

export default function CollabSpace() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  const invite = params.get("invite");
  const qc = useQueryClient();
  const [joining, setJoining] = useState(!!invite);
  const [view, setView] = useState("discussion");

  useEffect(() => {
    if (!invite) return;
    base44.functions.invoke("joinCollabSpace", { space_id: id, token: invite }).finally(() => {
      window.history.replaceState(null, "", `/collab-space?id=${id}`);
      setJoining(false);
    });
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["collab-space", id],
    enabled: !joining,
    refetchInterval: 8000,
    queryFn: async () => {
      const [me, spaces, messages, items] = await Promise.all([
        base44.auth.me(),
        base44.entities.CollabSpace.filter({ id }),
        base44.entities.CollabMessage.filter({ space_id: id }, "created_date", 200),
        base44.entities.CollabItem.filter({ space_id: id }, "created_date", 300),
      ]);
      return { me, space: spaces[0], messages, items };
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["collab-space", id] });

  if (joining || isLoading) return <Loader2 className="w-6 h-6 animate-spin text-slate-400 mx-auto mt-24" />;
  if (!data?.space) return <p className="text-center text-slate-500 mt-24">协同约定不存在或你还不是成员</p>;
  const { me, space, messages, items } = data;
  const update = async (patch) => { await base44.entities.CollabSpace.update(space.id, patch); refresh(); };
  const props = { space, me, messages, items, refresh };
  const count = (k) => items.filter((i) => i.kind === k).length;

  return (
    <div className="min-[900px]:grid min-[900px]:grid-cols-2 min-[900px]:h-[calc(100vh-0px)] bg-white">
      {/* 左窗：心栈约定卡片 */}
      <div className="min-[900px]:overflow-y-auto border-r border-slate-100 px-5 md:px-8 py-8">
        <SpaceHeader space={space} onUpdate={update} />
        <FoldSection title="子约定" count={items.filter((i) => i.kind === "subagreement" && !i.is_theme).length}><ItemsTab kind="subagreement" {...props} /></FoldSection>
        <FoldSection title="共同节点" count={count("milestone")}><ItemsTab kind="milestone" {...props} /></FoldSection>
        <FoldSection title="沉淀文件" count={count("document")} defaultOpen={false}><DocsTab {...props} /></FoldSection>
      </div>

      {/* 右窗：讨论 / 共同动态 */}
      <div className="min-[900px]:overflow-y-auto bg-[#f8f9fb] px-5 md:px-8 py-8">
        <DiscussionTab {...props} />
      </div>
    </div>
  );
}