import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Send, Save, Loader2 } from "lucide-react";
import { toast } from "sonner";

const guestKey = () => {
  let k = localStorage.getItem("soul_guest_key");
  if (!k) {
    k = `g_${Math.random().toString(36).slice(2)}`;
    localStorage.setItem("soul_guest_key", k);
  }
  return k;
};

// 未注册访客也能参与心签：直接修改内容、留言给分享者
export default function GuestNotePanel({ token, note, canEdit, onChanged }) {
  const [name, setName] = useState(localStorage.getItem("soul_guest_name") || "");
  const [text, setText] = useState(note.plain_text || "");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState("");

  const post = async (payload, key) => {
    const n = name.trim();
    if (!n) { toast.error("先留个称呼吧，让对方知道是你"); return false; }
    localStorage.setItem("soul_guest_name", n);
    setBusy(key);
    try {
      await base44.functions.invoke("postNoteActivity", {
        token, actor_name: n, guest_key: guestKey(), ...payload,
      });
      if (onChanged) await onChanged();
      return true;
    } catch (e) {
      toast.error(e?.response?.data?.error || "操作失败，请稍后重试");
      return false;
    } finally {
      setBusy("");
    }
  };

  const saveEdit = async () => {
    if (!text.trim()) { toast.error("内容不能为空"); return; }
    const ok = await post({ activity_type: "note_edit", content: text.trim() }, "edit");
    if (ok) toast.success("修改已保存，并同步给了分享者");
  };

  const sendComment = async () => {
    if (!comment.trim()) { toast.error("说点什么再发送吧"); return; }
    const ok = await post({ activity_type: "comment", content: comment.trim() }, "comment");
    if (ok) { setComment(""); toast.success("留言已发送给对方"); }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
      <div>
        <p className="text-sm font-semibold text-slate-800 mb-1">参与这条心签</p>
        <p className="text-xs text-slate-500">
          {canEdit ? "不用注册也可以直接修改内容、留言，对方会立即收到。" : "这条分享是只读的，你可以留言给对方。"}
        </p>
      </div>

      <Input
        placeholder="你的称呼，例如：小林"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="h-10"
      />

      {canEdit && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-500">内容（可直接修改）</p>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="min-h-[140px] text-sm leading-relaxed"
          />
          <Button onClick={saveEdit} disabled={busy === "edit"} className="w-full gap-2 bg-[#384877] text-white">
            {busy === "edit" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            保存修改
          </Button>
        </div>
      )}

      <div className="space-y-2 pt-1 border-t border-slate-100">
        <Textarea
          placeholder="留言给分享者，例如：我补了两点想法"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          className="min-h-[64px] text-sm"
        />
        <Button onClick={sendComment} disabled={busy === "comment"} variant="outline" className="w-full gap-2">
          {busy === "comment" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          发送留言
        </Button>
      </div>
    </div>
  );
}