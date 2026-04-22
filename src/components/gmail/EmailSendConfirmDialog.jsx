import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Mail, Send, Clock, Sparkles, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

/**
 * 邮件发送确认弹窗
 * Props:
 *  - open, onOpenChange
 *  - suggestion: { to?, subject?, body?, scheduledAt?, reason? }
 *  - onSent?: (result) => void
 */
export default function EmailSendConfirmDialog({ open, onOpenChange, suggestion, onSent }) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (open && suggestion) {
      setTo(suggestion.to || "");
      setSubject(suggestion.subject || "");
      setBody(suggestion.body || "");
      setScheduledAt(suggestion.scheduledAt || "");
    }
  }, [open, suggestion]);

  const handleSend = async () => {
    if (!to.trim() || !subject.trim() || !body.trim()) {
      toast.error("请填写收件人、主题和内容");
      return;
    }
    setSending(true);
    try {
      const { data } = await base44.functions.invoke("sendGmailEmail", {
        to, subject, body,
        scheduledAt: scheduledAt || undefined,
      });
      if (data?.scheduled) {
        toast.success(`已加入定时发送队列：${new Date(data.sendAt).toLocaleString()}`);
      } else if (data?.ok) {
        toast.success("邮件发送成功 ✉️");
      }
      onSent?.(data);
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast.error(err?.response?.data?.error || "发送失败");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#384877] to-[#3b5aa2] flex items-center justify-center">
              <Mail className="w-4 h-4 text-white" />
            </div>
            AI 识别到邮件发送意图
          </DialogTitle>
          <DialogDescription>
            请确认邮件内容。可以编辑后再发送，或设定定时发送时间。
          </DialogDescription>
        </DialogHeader>

        {suggestion?.reason && (
          <div className="flex items-start gap-2 px-3 py-2 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-700">
            <Sparkles className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>{suggestion.reason}</span>
          </div>
        )}

        <div className="space-y-3">
          <div>
            <Label className="text-xs text-slate-500">收件人</Label>
            <Input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="email@example.com"
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs text-slate-500">主题</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs text-slate-500">正文</Label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              className="mt-1 resize-none"
            />
          </div>
          <div>
            <Label className="text-xs text-slate-500 flex items-center gap-1">
              <Clock className="w-3 h-3" /> 定时发送（可选）
            </Label>
            <Input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="mt-1"
            />
            {scheduledAt && (
              <Badge variant="outline" className="mt-1.5 text-[10px]">
                将于 {new Date(scheduledAt).toLocaleString()} 自动发送
              </Badge>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            取消
          </Button>
          <Button
            onClick={handleSend}
            disabled={sending}
            className="bg-[#384877] hover:bg-[#2d3a5f] text-white gap-2"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {scheduledAt ? "加入定时队列" : "立即发送"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}