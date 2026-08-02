import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HeartHandshake, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import CollaborationLinkBox from "./CollaborationLinkBox";

// 利他式共享：一键邀请伙伴参与约定，共同完成目标
// 已注册用户 → 直接加入协作并收到站内通知；未注册 → 发送加入邀请邮件
export default function InvitePartnerDialog({ open, onClose, task, tasks = [], allUsers = [], currentUser }) {
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (open) setSelectedTaskId(task?.id || "");
  }, [open, task?.id]);

  const targetTask = task || tasks.find((t) => t.id === selectedTaskId);

  const handleInvite = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!targetTask) { toast.error("请先选择一个约定"); return; }
    if (!/^\S+@\S+\.\S+$/.test(trimmed)) { toast.error("请输入有效的邮箱地址"); return; }
    if (trimmed === (currentUser?.email || "").toLowerCase()) { toast.error("不能邀请自己哦"); return; }

    setSending(true);
    try {
      const existing = allUsers.find((u) => (u.email || "").toLowerCase() === trimmed);
      if (existing) {
        const assigned = Array.from(new Set([...(targetTask.assigned_to || []), existing.id]));
        await base44.entities.Task.update(targetTask.id, {
          assigned_to: assigned,
          is_shared: true,
          team_visibility: "team",
        });
        await base44.entities.Notification.create({
          recipient_id: existing.id,
          type: "assignment",
          title: `🤝 ${currentUser?.full_name || "伙伴"} 邀请你共同完成约定`,
          content: `「${targetTask.title}」${message.trim() ? ` — ${message.trim()}` : ""}`,
          link: `/Tasks?taskId=${targetTask.id}`,
          related_entity_id: targetTask.id,
          sender_id: currentUser?.id,
        });
        toast.success(`已邀请 ${existing.full_name || trimmed} 加入这个约定`);
      } else {
        await base44.users.inviteUser(trimmed, "user");
        await base44.entities.Task.update(targetTask.id, {
          is_shared: true,
          team_visibility: "team",
        });
        toast.success(`邀请邮件已发送至 ${trimmed}，对方加入后即可参与协作`);
      }
      queryClient.invalidateQueries({ queryKey: ["sharedTasks"] });
      setEmail("");
      setMessage("");
      onClose();
    } catch (e) {
      toast.error(e?.message || "邀请失败，请稍后重试");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HeartHandshake className="w-5 h-5 text-[#384877]" />
            邀请伙伴共同完成
          </DialogTitle>
          <DialogDescription>
            把约定分享给伙伴，一起坚持、互相见证。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {task ? (
            <div className="rounded-xl bg-[#384877]/5 border border-[#384877]/15 px-3 py-2.5">
              <p className="text-xs text-slate-500 mb-0.5">共同约定</p>
              <p className="text-sm font-semibold text-slate-800 line-clamp-2">{task.title}</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-600">选择要共享的约定</label>
              <Select value={selectedTaskId} onValueChange={setSelectedTaskId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="选择一个你创建的约定" />
                </SelectTrigger>
                <SelectContent>
                  {tasks.length === 0 && (
                    <div className="px-3 py-2 text-sm text-slate-400">暂无可共享的约定</div>
                  )}
                  {tasks.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600">伙伴邮箱</label>
            <Input
              type="email"
              placeholder="partner@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600">附言（可选）</label>
            <Textarea
              placeholder="例如：这个目标我们一起完成吧，互相监督！"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="min-h-[64px] text-sm"
            />
          </div>

          <Button
            onClick={handleInvite}
            disabled={sending || !targetTask}
            className="w-full bg-gradient-to-r from-[#384877] to-[#3b5aa2] text-white gap-2"
          >
            {sending
              ? <><Loader2 className="w-4 h-4 animate-spin" /> 发送中…</>
              : <><Send className="w-4 h-4" /> 一键邀请</>}
          </Button>
          <CollaborationLinkBox task={targetTask} message={message} currentUser={currentUser} />

          <p className="text-[11px] text-slate-400 leading-relaxed text-center">
            已注册的伙伴会立即收到站内通知；未注册的伙伴将收到加入邀请邮件。
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}