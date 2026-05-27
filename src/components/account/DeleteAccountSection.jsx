import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { AlertTriangle, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function DeleteAccountSection({ user }) {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isPending = user?.account_status === "pending_deletion";
  const expected = "删除我的账号";

  const handleDelete = async () => {
    if (confirmText.trim() !== expected) {
      toast.error('请输入"删除我的账号"以确认');
      return;
    }
    setSubmitting(true);
    try {
      const res = await base44.functions.invoke("deleteAccount", { confirm_text: confirmText });
      const data = res?.data || {};
      if (data?.success) {
        toast.success("账号已标记注销，30 天后清除数据");
        setOpen(false);
        setTimeout(() => base44.auth.logout(), 1500);
      } else {
        toast.error(data?.error || "注销失败，请稍后再试");
      }
    } catch (e) {
      toast.error("注销失败：" + (e?.message || "网络异常"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3">
      {isPending && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium">账号已申请注销</p>
            <p className="text-xs mt-1">
              数据将于{" "}
              {user?.deletion_purge_at
                ? new Date(user.deletion_purge_at).toLocaleDateString("zh-CN")
                : "30 天后"}{" "}
              彻底清除。如需恢复请联系客服。
            </p>
          </div>
        </div>
      )}

      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        disabled={isPending}
        className="w-full justify-start text-red-700 hover:text-red-800 hover:bg-red-50 border-red-300"
      >
        <Trash2 className="w-4 h-4 mr-2" />
        {isPending ? "注销申请处理中" : "删除账号"}
      </Button>
      <p className="text-xs text-slate-500 px-2">
        删除后账号将被标记为已注销，30 天可恢复期内联系客服可撤销，超期后数据将被永久清除。
      </p>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5" />
              确认删除账号
            </DialogTitle>
            <DialogDescription className="pt-2 text-slate-600">
              此操作将注销您的账号，包括所有任务、心签、笔记将在 30 天后被彻底清除。
              <br /><br />
              请输入 <span className="font-mono font-semibold text-red-600">{expected}</span> 以确认：
            </DialogDescription>
          </DialogHeader>
          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={expected}
            autoFocus
          />
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={submitting || confirmText.trim() !== expected}
            >
              {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
              确认注销
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}