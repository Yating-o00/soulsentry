import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Mail, Send, Loader2, Sparkles, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

/**
 * 邮件预览 / 编辑弹窗
 * - 展示 AI 起草的收件人/主题/正文
 * - 用户可直接修改
 * - 点击"发送"才真正调用 agentSendEmail
 *
 * Props:
 *  - open, onOpenChange
 *  - draft: { to, subject, body, to_name? }
 *  - instruction: 用户原始指令（用于落地到 Task.description）
 *  - executionId: 关联的 TaskExecution id，发送成功后会更新其 automation_result.data
 *  - onSent: (finalDraft) => void  发送完成回调
 */
export default function EmailPreviewDialog({
  open,
  onOpenChange,
  draft,
  instruction = "",
  executionId,
  onSent,
}) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (open && draft) {
      setTo(draft.to || "");
      setSubject(draft.subject || "");
      setBody(draft.body || "");
    }
  }, [open, draft]);

  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((to || "").trim());
  const canSend = isEmail && subject.trim() && body.trim() && !sending;

  const handleSend = async () => {
    if (!canSend) return;
    setSending(true);
    try {
      const res = await base44.functions.invoke("agentSendEmail", {
        to: to.trim(),
        subject: subject.trim(),
        body: body.trim(),
        instruction,
      });
      if (res?.data?.error) throw new Error(res.data.error);

      // 同步回 TaskExecution（让卡片预览也变成最新内容）
      if (executionId) {
        const finalData = { to: to.trim(), subject: subject.trim(), body: body.trim() };
        try {
          await base44.entities.TaskExecution.update(executionId, {
            execution_status: "completed",
            completed_at: new Date().toISOString(),
            automation_result: {
              type: "email_draft",
              preview: `收件人: ${finalData.to}\n主题: ${finalData.subject}\n\n${finalData.body}`,
              data: { ...finalData, sent: true, gmail_message_id: res?.data?.gmail_message_id || "" },
            },
          });
        } catch (_) { /* 写回失败不阻塞用户 */ }
      }

      toast.success(`邮件已发送给 ${to}`, { icon: "✉️" });
      onSent?.({ to, subject, body });
      onOpenChange(false);
    } catch (e) {
      toast.error("发送失败：" + (e?.message || "未知错误"));
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-slate-100 bg-gradient-to-r from-[#384877]/5 to-transparent">
          <DialogTitle className="flex items-center gap-2 text-base">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#384877] to-[#3b5aa2] flex items-center justify-center shadow-sm">
              <Mail className="w-4 h-4 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="font-semibold text-slate-800">邮件预览</span>
              <span className="text-[11px] text-slate-500 font-normal flex items-center gap-1">
                <Sparkles className="w-2.5 h-2.5 text-amber-500" />
                AI 已起草，发送前可自由修改
              </span>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="px-6 py-4 space-y-3">
          <div>
            <Label className="text-[11px] font-medium text-slate-500 mb-1 block">收件人</Label>
            <Input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="例如 zhangsan@example.com"
              className={`text-sm ${to && !isEmail ? "border-rose-300 focus-visible:ring-rose-300" : ""}`}
            />
            {to && !isEmail && (
              <p className="text-[11px] text-rose-500 mt-1">邮箱格式不正确</p>
            )}
          </div>

          <div>
            <Label className="text-[11px] font-medium text-slate-500 mb-1 block">主题</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="邮件主题"
              className="text-sm"
            />
          </div>

          <div>
            <Label className="text-[11px] font-medium text-slate-500 mb-1 block">正文</Label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="邮件正文…"
              rows={10}
              className="text-sm leading-relaxed font-sans resize-y min-h-[200px]"
            />
            <p className="text-[10.5px] text-slate-400 mt-1">
              {body.length} 字 · 你可以修改任何一句话再发送
            </p>
          </div>
        </div>

        <DialogFooter className="px-6 py-3 border-t border-slate-100 bg-slate-50/60 flex !justify-between items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={sending}
            className="text-slate-500 hover:text-slate-700"
          >
            <X className="w-3.5 h-3.5 mr-1" />
            取消
          </Button>
          <Button
            onClick={handleSend}
            disabled={!canSend}
            className="bg-gradient-to-r from-[#384877] to-[#3b5aa2] hover:from-[#2d3a5f] hover:to-[#324a8a] text-white shadow-sm"
          >
            {sending ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                发送中…
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5 mr-1.5" />
                确认发送
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}