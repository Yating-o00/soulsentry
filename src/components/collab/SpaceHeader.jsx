import React from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ChevronLeft, Link2, Bot, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SCENES } from "@/lib/collabAgent";

export default function SpaceHeader({ space, onUpdate }) {
  const copyInvite = () => {
    navigator.clipboard.writeText(`${window.location.origin}/collab-space?id=${space.id}&invite=${space.invite_token}`);
    toast.success("邀请链接已复制，发给协作者即可加入");
  };
  return (
    <div className="bg-gradient-to-b from-[#f4f6fb] to-white rounded-[28px] p-6 md:p-8 border border-slate-100">
      <Link to="/Tasks?view=collab" className="inline-flex items-center text-xs text-slate-400 hover:text-[#384877] mb-4"><ChevronLeft className="w-4 h-4" />约定 · 协同</Link>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs px-2.5 py-1 rounded-full bg-[#384877]/10 text-[#384877] font-medium">{SCENES[space.scene]?.label}</span>
      </div>
      <h1 className="text-2xl md:text-[28px] font-bold text-slate-900 leading-snug">{space.title}</h1>
      {space.goal && <p className="text-[15px] text-slate-600 mt-2 leading-relaxed">{space.goal}</p>}
      <div className="flex flex-wrap items-center gap-3 mt-6">
        <div className="flex -space-x-2">
          {(space.members || []).map((m) => (
            <div key={m.id} title={m.name} className="w-9 h-9 rounded-full bg-[#384877] text-white text-sm flex items-center justify-center ring-2 ring-white">{(m.name || "?")[0]}</div>
          ))}
          {space.agent_enabled && <div title="Agent" className="w-9 h-9 rounded-full bg-white border border-[#384877]/30 text-[#384877] flex items-center justify-center ring-2 ring-white"><Bot className="w-4 h-4" /></div>}
        </div>
        <Button variant="outline" size="sm" onClick={copyInvite} className="rounded-full ml-auto"><Link2 className="w-4 h-4 mr-1" />邀请成员</Button>
        {space.agent_enabled && (
          <Button variant="outline" size="sm" className="rounded-full" onClick={() => onUpdate({ agent_paused: !space.agent_paused })}>
            {space.agent_paused ? <><Play className="w-4 h-4 mr-1" />恢复 Agent</> : <><Pause className="w-4 h-4 mr-1" />暂停 Agent</>}
          </Button>
        )}
      </div>
    </div>
  );
}