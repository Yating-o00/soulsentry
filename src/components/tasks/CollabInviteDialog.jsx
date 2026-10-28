// 协同约定邀请弹窗：公开邀请链接 + 二维码（复用分享链路）+ 手机号/邮箱直接添加已注册成员
import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Copy, UserPlus, Users, Link as LinkIcon, Crown } from "lucide-react";
import QRCodeImage from "@/components/ui/QRCode";
import { httpRequest } from "@/api/httpClient";
import { toast } from "sonner";

const getInitials = (name) => {
  if (!name || typeof name !== "string") return "?";
  const trimmed = name.trim();
  if (!trimmed) return "?";
  if (/^[\u4e00-\u9fa5]/.test(trimmed)) return trimmed.slice(0, 1);
  const parts = trimmed.split(/\s+/).filter(Boolean);
  return parts.map((p) => p[0]).join("").toUpperCase().slice(0, 2) || "?";
};

export default function CollabInviteDialog({ task, members = [], open, onClose, onChanged }) {
  const [inviteUrl, setInviteUrl] = useState("");
  const [linkLoading, setLinkLoading] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [adding, setAdding] = useState(false);

  // 打开时确保分享链接已生成：二维码指向 /share/<token> 公开协作页（与 TaskShareCard 同一链路）
  useEffect(() => {
    if (!open || !task?.id) return;
    let cancelled = false;
    setLinkLoading(true);
    (async () => {
      try {
        const result = await httpRequest(`/api/public/share/generate/task/${task.id}`, {
          method: "POST",
          body: { enabled: true },
        });
        if (cancelled) return;
        if (result?.url) {
          setInviteUrl(result.url.replace(/^https?:\/\/[^/]+/, window.location.origin));
        }
      } catch (error) {
        // 透出真实原因（如无权限），不再静默失败
        if (!cancelled) {
          console.error("[collab] 邀请链接生成失败:", error?.message || error);
          toast.error(error?.data?.message || error?.message || "邀请链接生成失败，请稍后再试");
        }
      } finally {
        if (!cancelled) setLinkLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, task?.id]);

  const handleCopy = () => {
    if (!inviteUrl) return;
    navigator.clipboard.writeText(inviteUrl).then(() => {
      toast.success("邀请链接已复制");
    }).catch(() => toast.error("复制失败"));
  };

  const handleAddMember = async () => {
    const value = identifier.trim();
    if (!value) return;
    setAdding(true);
    try {
      const body = /@/.test(value) ? { email: value } : { phone: value };
      await httpRequest(`/api/collab/${task.id}/members`, { method: "POST", body });
      toast.success("已添加成员");
      setIdentifier("");
      onChanged?.();
    } catch (error) {
      if (error?.status === 404 && error?.data?.error === "USER_NOT_FOUND") {
        toast.warning(error.data.hint || "对方还未注册心栈，请通过邀请链接邀请对方加入");
      } else if (error?.status === 409) {
        toast.info(error?.message || "对方已是成员");
      } else {
        toast.error(error?.message || "添加失败，请稍后再试");
      }
    } finally {
      setAdding(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose?.()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-[#384877]" />
            管理与邀请
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* 当前成员 */}
          <div>
            <p className="text-xs font-medium text-slate-500 mb-2 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" /> 当前成员（{members.length}）
            </p>
            <div className="flex flex-wrap gap-2">
              {members.map((m) => (
                <div
                  key={m.user_id || m.id}
                  className="flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-full bg-slate-50 border border-slate-200"
                >
                  <Avatar className="w-6 h-6">
                    <AvatarFallback className="text-[10px] bg-[#384877] text-white">
                      {getInitials(m.display_name)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-xs text-slate-700">{m.display_name}</span>
                  {m.role === "owner" && (
                    <Badge className="text-[10px] px-1.5 py-0 bg-amber-50 text-amber-700 border-amber-200">
                      <Crown className="w-2.5 h-2.5 mr-0.5" />发起人
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* 邀请链接 + 二维码 */}
          <div className="rounded-xl border border-slate-200 p-4 space-y-3">
            <p className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
              <LinkIcon className="w-3.5 h-3.5" /> 邀请链接（扫码或转发即可加入）
            </p>
            {linkLoading ? (
              <p className="text-xs text-slate-400">正在生成链接…</p>
            ) : inviteUrl ? (
              <>
                <div className="flex items-center gap-2">
                  <Input value={inviteUrl} readOnly className="text-xs h-8" onFocus={(e) => e.target.select()} />
                  <Button size="sm" variant="outline" className="h-8 shrink-0" onClick={handleCopy}>
                    <Copy className="w-3.5 h-3.5 mr-1" /> 复制
                  </Button>
                </div>
                <div className="flex justify-center py-1">
                  <div className="p-2 bg-white rounded-xl border border-slate-200 shadow-sm">
                    <QRCodeImage value={inviteUrl} size={140} className="w-28 h-28" alt="邀请二维码" />
                  </div>
                </div>
              </>
            ) : (
              <p className="text-xs text-slate-400">未能生成邀请链接：需要是该约定的发起人或成员</p>
            )}
          </div>

          {/* 直接添加已注册成员 */}
          <div className="rounded-xl border border-slate-200 p-4 space-y-3">
            <p className="text-xs font-medium text-slate-500">按手机号 / 邮箱添加已注册成员</p>
            <div className="flex items-center gap-2">
              <Input
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="手机号或邮箱"
                className="text-xs h-9"
                onKeyDown={(e) => { if (e.key === "Enter") handleAddMember(); }}
              />
              <Button
                size="sm"
                className="h-9 shrink-0 bg-[#384877] hover:bg-[#2e3a62]"
                onClick={handleAddMember}
                disabled={adding || !identifier.trim()}
              >
                {adding ? "添加中…" : "添加"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
