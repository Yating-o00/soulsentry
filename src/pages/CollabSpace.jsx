import React, { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2 } from "lucide-react";
import SpaceHeader from "@/components/collab/SpaceHeader";
import DiscussionTab from "@/components/collab/DiscussionTab";
import ItemsTab from "@/components/collab/ItemsTab";
import DocsTab from "@/components/collab/DocsTab";

const TAB = "px-1 pb-3 mr-6 text-sm font-medium text-slate-400 bg-transparent rounded-none border-b-2 border-transparent data-[state=active]:text-[#384877] data-[state=active]:border-[#384877] data-[state=active]:shadow-none data-[state=active]:bg-transparent";

export default function CollabSpace() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  const invite = params.get("invite");
  const qc = useQueryClient();
  const [joining, setJoining] = useState(!!invite);

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
  if (!data.space) return <p className="text-center text-slate-500 mt-24">协同约定不存在或你还不是成员</p>;
  const { me, space, messages, items } = data;
  const update = async (patch) => { await base44.entities.CollabSpace.update(space.id, patch); refresh(); };
  const props = { space, me, messages, items, refresh };
  const count = (k) => items.filter((i) => i.kind === k).length;

  return (
    <div className="max-w-3xl mx-auto px-5 md:px-8 py-8 space-y-8">
      <SpaceHeader space={space} onUpdate={update} />
      <Tabs defaultValue="discuss">
        <TabsList className="bg-transparent p-0 h-auto border-b border-slate-100 w-full justify-start rounded-none">
          <TabsTrigger value="discuss" className={TAB}>讨论</TabsTrigger>
          <TabsTrigger value="subs" className={TAB}>子约定 ({count("subagreement")})</TabsTrigger>
          <TabsTrigger value="ms" className={TAB}>节点 ({count("milestone")})</TabsTrigger>
          <TabsTrigger value="docs" className={TAB}>沉淀 ({count("document")})</TabsTrigger>
        </TabsList>
        <TabsContent value="discuss" className="mt-6"><DiscussionTab {...props} /></TabsContent>
        <TabsContent value="subs" className="mt-6"><ItemsTab kind="subagreement" {...props} /></TabsContent>
        <TabsContent value="ms" className="mt-6"><ItemsTab kind="milestone" {...props} /></TabsContent>
        <TabsContent value="docs" className="mt-6"><DocsTab {...props} /></TabsContent>
      </Tabs>
    </div>
  );
}