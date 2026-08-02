import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Send, Loader2 } from "lucide-react";
import { toast } from "sonner";

const guestKey = () => {
  let k = localStorage.getItem("soul_guest_key");
  if (!k) {
    k = `g_${Math.random().toString(36).slice(2)}`;
    localStorage.setItem("soul_guest_key", k);
  }
  return k;
};

// 未注册访客参与心签：仅可留言，不能修改原内容
export default function GuestNotePanel({ token, onChanged }) {
  const [name, setName] = useState(localStorage.getItem("soul_guest_name") || "");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  const sendComment = async () => {
    const n = name.trim();
    if (!n) { toast.error("先留个称呼吧，让对方知道是你"); return; }
    if (!comment.trim()) { toast.error("说点什么再发送吧"); return; }
    localStorage.setItem("soul_guest_name", n);
    setBusy(true);
    try {
      await base44.functions.invoke("postNoteActivity", {
        token,
        actor_name: n,
        guest_key: guestKey(),
        activity_type: "comment",
        content: comment.trim(),
      });
      setComment("");
      toast.success("留言已发送给对方");
      if (onChanged) await onChanged();
    } catch (e) {
      toast.error(e?.response?.data?.error || "操作失败，请稍后重试");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
      <div>
        <p className="text-sm font-semibold text-slate-800 mb-1">留言给分享者</p>
        <p className="text-xs text-slate-500">
          心签内容由分享者保管，你不能修改，但可以留下你的想法，对方会立即收到。
        </p>
      </div>

      <Input
        placeholder="你的称呼，例如：小林"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="h-10"
      />

      <div className="space-y-2">
        <Textarea
          placeholder="留言给分享者，例如：我补了两点想法"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          className="min-h-[80px] text-sm"
        />
        <Button onClick={sendComment} disabled={busy} className="w-full gap-2 bg-[#384877] text-white">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          发送留言
        </Button>
      </div>
    </div>
  );
}