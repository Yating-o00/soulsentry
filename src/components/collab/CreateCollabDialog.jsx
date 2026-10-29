import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Loader2, Sparkles } from "lucide-react";
import { SCENES, runCollabAgent, persistAgentResult } from "@/lib/collabAgent";

const CONFIRM = { all: "全员确认", owner: "负责人确认", creator: "发起人确认" };

export default function CreateCollabDialog({ open, onOpenChange }) {
  const navigate = useNavigate();
  const [f, setF] = useState({ title: "", goal: "", scene: "friends", confirm_mode: "all", agent_enabled: true });
  const [busy, setBusy] = useState(false);
  const pill = (on) => `px-3.5 py-1.5 rounded-full text-sm border transition ${on ? "bg-[#384877] text-white border-[#384877]" : "bg-white text-slate-600 border-slate-200 hover:border-[#384877]/40"}`;

  const submit = async () => {
    setBusy(true);
    const me = await base44.auth.me();
    const space = await base44.entities.CollabSpace.create({
      ...f, invite_token: crypto.randomUUID(), member_ids: [me.id],
      members: [{ id: me.id, name: me.full_name || me.email, role: "creator" }],
    });
    if (f.agent_enabled) await persistAgentResult(space, await runCollabAgent({ space, request: "init" }));
    setBusy(false);
    onOpenChange(false);
    navigate(`/collab-space?id=${space.id}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg rounded-[28px] p-8">
        <DialogHeader><DialogTitle className="text-xl text-slate-900">创建协同约定</DialogTitle></DialogHeader>
        <div className="space-y-5 mt-2">
          <div className="flex flex-wrap gap-2">
            {Object.entries(SCENES).map(([k, v]) => (
              <button key={k} type="button" className={pill(f.scene === k)} onClick={() => setF({ ...f, scene: k })}>{v.label}</button>
            ))}
          </div>
          <Input placeholder="共同主题，如：五一一起去大理" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} className="h-12 rounded-2xl" />
          <Textarea placeholder="期望结果 / 为什么建立这个约定" value={f.goal} onChange={(e) => setF({ ...f, goal: e.target.value })} className="rounded-2xl min-h-[90px]" />
          <div>
            <p className="text-xs text-slate-400 mb-2">子约定生效方式</p>
            <div className="flex gap-2">{Object.entries(CONFIRM).map(([k, v]) => (
              <button key={k} type="button" className={pill(f.confirm_mode === k)} onClick={() => setF({ ...f, confirm_mode: k })}>{v}</button>
            ))}</div>
          </div>
          <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
            <div><p className="text-sm font-medium text-slate-800">添加 Agent</p><p className="text-xs text-slate-500">只读取本空间内容，生成草稿供大家确认</p></div>
            <Switch checked={f.agent_enabled} onCheckedChange={(v) => setF({ ...f, agent_enabled: v })} />
          </div>
          <Button disabled={!f.title.trim() || busy} onClick={submit} className="w-full h-12 rounded-2xl bg-[#384877] hover:bg-[#2d3a62]">
            {busy ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Agent 正在生成初始草稿…</> : <><Sparkles className="w-4 h-4 mr-2" />创建并进入共创空间</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}