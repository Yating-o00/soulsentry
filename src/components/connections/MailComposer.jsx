import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Sparkles, Send } from "lucide-react";
import { toast } from "sonner";

export default function MailComposer({ initial, replyToId, onSent }) {
  const [draft, setDraft] = useState(initial || { to: "", subject: "", body: "" });
  const [intent, setIntent] = useState("");
  const [busy, setBusy] = useState(null);

  const generate = async () => {
    setBusy("draft");
    const res = await base44.functions.invoke("userMailbox", { action: "draft", messageId: replyToId, to: draft.to, intent });
    setDraft((d) => ({ ...d, ...res.data.draft }));
    setBusy(null);
  };

  const send = async () => {
    setBusy("send");
    try {
      await base44.functions.invoke("userMailbox", { action: "send", ...draft });
      toast.success("邮件已发送");
      onSent?.();
    } catch (e) {
      toast.error(e?.response?.data?.error || "发送失败");
    }
    setBusy(null);
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input value={intent} onChange={(e) => setIntent(e.target.value)} placeholder="想说什么？如：礼貌地答应周三开会" />
        <Button variant="outline" onClick={generate} disabled={!!busy}>
          {busy === "draft" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          <span className="ml-1">按我的习惯写</span>
        </Button>
      </div>
      <Input value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} placeholder="收件人" />
      <Input value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} placeholder="主题" />
      <Textarea rows={8} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} placeholder="正文" />
      <div className="flex justify-end">
        <Button onClick={send} disabled={!!busy || !draft.to || !draft.subject || !draft.body} className="bg-[#384877] hover:bg-[#2d3a60]">
          {busy === "send" ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Send className="w-4 h-4 mr-1" />}确认发送
        </Button>
      </div>
    </div>
  );
}