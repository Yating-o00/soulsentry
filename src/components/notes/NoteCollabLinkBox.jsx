import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link2, Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";

// 生成免注册协作链接：任何人打开都能查看、修改并留言给你
export default function NoteCollabLinkBox({ note, permission = "collaborate" }) {
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);

  const generate = async () => {
    setBusy(true);
    try {
      const me = await base44.auth.me();
      const token = `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
      await base44.entities.CollaborationInvite.create({
        token,
        resource_type: "note",
        note_id: note.id,
        task_title: (note.plain_text || "心签").slice(0, 40),
        inviter_id: me.id,
        inviter_name: me.full_name || "一位伙伴",
        permission,
        status: "active",
      });
      const url = `${window.location.origin}/ShareNote?token=${token}`;
      setLink(url);
      await navigator.clipboard.writeText(url).catch(() => {});
      toast.success("协作链接已生成并复制");
    } catch (e) {
      toast.error("生成链接失败，请稍后重试");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
      <p className="text-xs text-slate-600">
        免注册协作链接：对方打开即可{permission === "view" ? "查看并留言" : "修改内容、留言"}，动态会回流给你。
      </p>
      {link ? (
        <div className="flex gap-2">
          <Input value={link} readOnly className="h-8 text-xs" />
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            onClick={() => { navigator.clipboard.writeText(link); toast.success("已复制"); }}
          >
            <Copy className="w-3.5 h-3.5" />
          </Button>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={generate} disabled={busy} className="h-8 gap-1.5 text-xs">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
          生成协作链接
        </Button>
      )}
    </div>
  );
}