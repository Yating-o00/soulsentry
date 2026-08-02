import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Radio } from "lucide-react";
import CollaborationFeed from "./CollaborationFeed";

// 分享者视角：查看被分享者（含未注册访客）的参与动态
export default function TeamActivityFeedCard() {
  const { data } = useQuery({
    queryKey: ["collaborationFeed"],
    queryFn: () => base44.functions.invoke("getTaskCollaborationFeed", {}).then((r) => r.data),
  });

  const activities = data?.activities || [];
  const unseen = activities.filter((a) => !a.seen_by_owner).length;

  return (
    <Card className="border border-[#e5e9ef] shadow-md rounded-[16px]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-[17px] font-semibold tracking-tight">
          <Radio className="w-5 h-5 text-[#384877]" />
          <span className="text-[#222222]">分享参与动态</span>
          {unseen > 0 && (
            <Badge className="bg-[#384877] text-white text-[11px]">{unseen} 条新</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <CollaborationFeed activities={activities.slice(0, 8)} />
      </CardContent>
    </Card>
  );
}