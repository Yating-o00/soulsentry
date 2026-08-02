import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Link2, Copy, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";

// 生成"协作快照"分享链接：对方打开即可看到约定并一键加入协作
export default function CollaborationLinkBox({ task, message, currentUser }) {
  const [link, setLink] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const generate = async () => {
    if (!task) { toast.error("请先选择一个约定"); return; }
    setLoading(true);
    try {
      const token = `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
      const expires = new Date();
      expires.setDate(expires.getDate() + 14);
      await base44.entities.CollaborationInvite.create({
        token,
        task_id: task.id,
        task_title: task.title,
        inviter_id: currentUser?.id,
        inviter_name: currentUser?.full_name || "一位伙伴",
        message: (message || "").trim(),
        permission: "collaborate",
        expires_at: expires.toISOString(),
        status: "active",
      });
      const url = `${window.location.origin}/Collaborate?token=${token}`;
      setLink(url);
      await navigator.clipboard.writeText(url).then(() => setCopied(true)).catch(() => {});
      toast.success("协作链接已生成，发给伙伴即可一起参与");
    } catch (e) {
      toast.error(e?.message || "生成链接失败");
    } finally {
      setLoading(false);
    }
  };

  const copy = async () => {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    toast.success("链接已复制");
  };

  return (
    <div className="rounded-xl border border-dashed border-[#384877]/25 bg-[#384877]/[0.03] p-3 space-y-2">
      <p className="text-xs text-slate-500">或生成协作链接，发到微信 / 消息里，对方打开即可加入</p>
      {link ? (
        <div className="flex items-center gap-2">
          <div className="flex-1 truncate text-[11px] bg-white border border-slate-200 rounded-lg px-2 py-2 text-slate-600">
            {link}
          </div>
          <Button size="sm" variant="outline" onClick={copy} className="gap-1 shrink-0">
            {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
            复制
          </Button>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={generate} disabled={loading || !task} className="w-full gap-2">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
          生成协作链接
        </Button>
      )}
    </div>
  );
}