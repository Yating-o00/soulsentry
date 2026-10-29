// 协同约定邀请弹窗：三种邀请方式
// ① 邀请卡片：品牌渐变卡片 + 二维码，可保存为图片或系统分享（html2canvas 导出）
// ② 邀请链接：复制即达，扫码即入（与公开分享同一链路）
// ③ 直接邀请：输入对方用户ID（也支持手机号/邮箱），已注册即加入并通知对方
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Copy,
  UserPlus,
  Users,
  Link as LinkIcon,
  Crown,
  Download,
  Share2,
  Image as ImageIcon,
  AtSign,
  Loader2,
} from "lucide-react";
import QRCodeImage from "@/components/ui/QRCode";
import { httpRequest } from "@/api/httpClient";
import { base44 } from "@/api/base44Client";
import html2canvas from "html2canvas";
import { toast } from "sonner";

const getInitials = (name) => {
  if (!name || typeof name !== "string") return "?";
  const trimmed = name.trim();
  if (!trimmed) return "?";
  if (/^[一-龥]/.test(trimmed)) return trimmed.slice(0, 1);
  const parts = trimmed.split(/\s+/).filter(Boolean);
  return parts.map((p) => p[0]).join("").toUpperCase().slice(0, 2) || "?";
};

const CATEGORY_LABELS = {
  work: "工作", personal: "个人", health: "健康", study: "学习",
  family: "家庭", shopping: "购物", finance: "财务", life: "生活",
  checkin: "打卡", other: "其他"
};

const TABS = [
  { key: "card", label: "邀请卡片", icon: ImageIcon },
  { key: "link", label: "邀请链接", icon: LinkIcon },
  { key: "direct", label: "直接邀请", icon: AtSign },
];

export default function CollabInviteDialog({ task, members = [], open, onClose, onChanged }) {
  const [tab, setTab] = useState("card");
  const [inviteUrl, setInviteUrl] = useState("");
  const [linkLoading, setLinkLoading] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [adding, setAdding] = useState(false);
  const [exporting, setExporting] = useState(false);
  const cardRef = useRef(null);

  const { data: currentUser } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => base44.auth.me(),
    enabled: open,
  });

  // 打开时确保分享链接已生成：二维码/卡片指向 /share/<token> 公开协作页（与 TaskShareCard 同一链路）
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

  const inviterName = useMemo(() => {
    const name = currentUser?.displayName || currentUser?.display_name || currentUser?.email || "发起人";
    return name;
  }, [currentUser]);

  const memberList = members.filter((m) => m.role !== "owner");
  const ownerMember = members.find((m) => m.role === "owner");

  const handleCopy = () => {
    if (!inviteUrl) return;
    navigator.clipboard.writeText(inviteUrl).then(() => {
      toast.success("邀请链接已复制");
    }).catch(() => toast.error("复制失败"));
  };

  // 卡片导出为 PNG：优先系统分享（手机可直接发微信/QQ）；分享不可用或失败时回退为下载保存
  const handleShareCard = async () => {
    if (!cardRef.current || exporting) return;
    setExporting(true);
    const fileName = `心栈协同邀请-${(task?.title || "约定").slice(0, 12)}.png`;
    try {
      const canvas = await html2canvas(cardRef.current, {
        scale: 2,
        backgroundColor: "#2e3a62",
        logging: false,
        useCORS: true,
      });
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("生成图片失败");
      const file = new File([blob], fileName, { type: "image/png" });
      // 仅触屏设备走系统分享（分享面板真正可用）；桌面端及分享超时一律回退为下载保存
      const isTouchFirst =
        (typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches) ||
        /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
      let shared = false;
      if (isTouchFirst && typeof navigator.share === "function" && navigator.canShare?.({ files: [file] })) {
        try {
          await Promise.race([
            navigator.share({
              files: [file],
              title: "心栈协同约定邀请",
              text: `邀请你一起协作完成「${task?.title || "协同约定"}」`,
            }),
            new Promise((_, reject) => setTimeout(() => reject(new Error("SHARE_TIMEOUT")), 8000)),
          ]);
          shared = true;
        } catch (shareError) {
          // AbortError = 用户取消分享，直接结束；其余错误（含超时）回退为下载
          if (shareError?.name === "AbortError") {
            setExporting(false);
            return;
          }
        }
      }
      if (!shared) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        // 延迟回收：立即 revoke 可能让部分浏览器取消刚触发的下载
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        toast.success("邀请卡片已保存，去发给伙伴吧");
      }
    } catch (error) {
      console.error("[collab] 邀请卡片导出失败:", error);
      toast.error("卡片生成失败，请稍后再试");
    } finally {
      setExporting(false);
    }
  };

  const handleAddMember = async () => {
    const value = identifier.trim();
    if (!value) return;
    setAdding(true);
    try {
      // 智能识别：含@按邮箱，纯数字按手机号，其余按用户ID
      const body = /@/.test(value)
        ? { email: value }
        : /^\d{5,}$/.test(value)
          ? { phone: value }
          : { user_id: value };
      const result = await httpRequest(`/api/collab/${task.id}/members`, { method: "POST", body });
      toast.success(result?.already_member
        ? `${result?.member?.display_name || "对方"} 已是成员`
        : `已邀请 ${result?.member?.display_name || "对方"} 加入协同约定`);
      setIdentifier("");
      onChanged?.();
    } catch (error) {
      if (error?.status === 404 && error?.data?.error === "USER_NOT_FOUND") {
        toast.warning(error.data.hint || "未找到该用户，请通过邀请卡片或链接邀请对方加入");
      } else if (error?.status === 409) {
        toast.info(error?.message || "对方已是成员");
      } else {
        toast.error(error?.message || "邀请失败，请稍后再试");
      }
    } finally {
      setAdding(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose?.()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-[#384877]" />
            邀请协作伙伴
          </DialogTitle>
        </DialogHeader>

        {/* 三种邀请方式切换 */}
        <div className="flex gap-1.5 p-1 bg-slate-100 rounded-xl">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                tab === key
                  ? "bg-white text-[#384877] shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* 当前成员速览 */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex -space-x-1.5">
            {members.slice(0, 4).map((m) => (
              <div
                key={m.user_id || m.id}
                className="w-6 h-6 rounded-full bg-[#384877] text-white text-[10px] flex items-center justify-center ring-2 ring-white"
              >
                {getInitials(m.display_name)}
              </div>
            ))}
          </div>
          <span className="text-xs text-slate-500">
            已有 {members.length} 人参与{ownerMember ? ` · 发起人 ${ownerMember.display_name}` : ""}
          </span>
        </div>

        {/* ① 邀请卡片 */}
        {tab === "card" && (
          <div className="space-y-3">
            {linkLoading ? (
              <div className="flex items-center justify-center py-16 text-slate-400">
                <Loader2 className="w-5 h-5 animate-spin mr-2" /> 正在生成邀请卡片…
              </div>
            ) : inviteUrl ? (
              <>
                {/* 卡片本体：纯 DOM + 首字母头像 + dataURL 二维码，保证 html2canvas 导出无跨域污染 */}
                <div className="flex justify-center py-1">
                  <div
                    ref={cardRef}
                    className="relative overflow-hidden rounded-2xl shadow-xl"
                    style={{
                      width: 330,
                      background: "linear-gradient(135deg, #2e3a62 0%, #384877 55%, #3b5aa2 100%)",
                      padding: 20,
                      fontFamily: "inherit",
                    }}
                  >
                    {/* 装饰圆 */}
                    <div style={{ position: "absolute", top: -46, right: -46, width: 150, height: 150, borderRadius: "50%", background: "rgba(255,255,255,0.06)" }} />
                    <div style={{ position: "absolute", bottom: -60, left: -40, width: 170, height: 170, borderRadius: "50%", background: "rgba(255,255,255,0.05)" }} />
                    <div style={{ position: "absolute", top: 60, right: 40, width: 60, height: 60, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.12)" }} />

                    <div style={{ position: "relative" }}>
                      {/* 头部品牌 */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-xl bg-white/15 flex items-center justify-center text-white text-sm font-bold">
                            心
                          </div>
                          <div>
                            <p style={{ fontSize: 13, fontWeight: 600, color: "#fff", lineHeight: 1.2 }}>心栈 SoulSentry</p>
                            <p style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", marginTop: 2 }}>协同约定邀请</p>
                          </div>
                        </div>
                        <span style={{ fontSize: 10, padding: "3px 8px", borderRadius: 999, background: "rgba(255,255,255,0.14)", color: "#fff" }}>
                          多人协同
                        </span>
                      </div>

                      {/* 约定信息 */}
                      <p style={{ marginTop: 16, fontSize: 17, fontWeight: 700, color: "#fff", lineHeight: 1.4 }}>
                        {task?.title || "未命名约定"}
                      </p>
                      {task?.description && (
                        <p style={{
                          marginTop: 6, fontSize: 11, color: "rgba(255,255,255,0.72)", lineHeight: 1.6,
                          display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 2, overflow: "hidden",
                        }}>
                          {task.description}
                        </p>
                      )}
                      <div className="flex items-center gap-2" style={{ marginTop: 10 }}>
                        {task?.category && (
                          <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 999, background: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.85)" }}>
                            {CATEGORY_LABELS[task.category] || task.category}
                          </span>
                        )}
                        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.6)" }}>
                          {members.length} 人在协作{memberList.length > 0 ? ` · ${memberList.slice(0, 2).map((m) => m.display_name).join("、")}${memberList.length > 2 ? " 等" : ""}` : ""}
                        </span>
                      </div>

                      <div style={{ height: 1, background: "rgba(255,255,255,0.14)", margin: "14px 0" }} />

                      {/* 底部：邀请人 + 二维码 */}
                      <div className="flex items-end justify-between">
                        <div style={{ maxWidth: 160 }}>
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-white text-[#384877] text-xs font-bold flex items-center justify-center">
                              {getInitials(inviterName)}
                            </div>
                            <p style={{ fontSize: 11, color: "#fff", fontWeight: 600 }}>{inviterName}</p>
                          </div>
                          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.78)", marginTop: 8, lineHeight: 1.6 }}>
                            邀请你加入协作<br />一起把这个约定完成
                          </p>
                          <p style={{ fontSize: 9, color: "rgba(255,255,255,0.45)", marginTop: 8 }}>
                            心栈 · 从容记录每一声心动
                          </p>
                        </div>
                        <div className="flex flex-col items-center gap-1">
                          <div className="bg-white rounded-xl p-1.5 shadow-md">
                            <QRCodeImage value={inviteUrl} size={96} className="w-24 h-24 block" alt="邀请二维码" />
                          </div>
                          <span style={{ fontSize: 9, color: "rgba(255,255,255,0.72)" }}>扫码加入协同</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    className="flex-1 bg-[#384877] hover:bg-[#2e3a62]"
                    onClick={handleShareCard}
                    disabled={exporting}
                  >
                    {exporting ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Share2 className="w-4 h-4 mr-1.5" />}
                    {exporting ? "正在生成…" : "保存 / 分享卡片"}
                  </Button>
                  <Button variant="outline" className="flex-1" onClick={handleCopy}>
                    <Copy className="w-4 h-4 mr-1.5" /> 复制链接
                  </Button>
                </div>
                <p className="text-[11px] text-slate-400 text-center">卡片内含邀请二维码，对方扫码即可加入协作</p>
              </>
            ) : (
              <p className="text-xs text-slate-400 text-center py-10">未能生成邀请链接：需要是该约定的发起人或成员</p>
            )}
          </div>
        )}

        {/* ② 邀请链接 */}
        {tab === "link" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Input
                value={inviteUrl}
                readOnly
                className="text-xs h-9"
                placeholder={linkLoading ? "正在生成链接…" : "未能生成链接"}
                onFocus={(e) => e.target.select()}
              />
              <Button size="sm" className="h-9 shrink-0 bg-[#384877] hover:bg-[#2e3a62]" onClick={handleCopy} disabled={!inviteUrl}>
                <Copy className="w-3.5 h-3.5 mr-1" /> 复制
              </Button>
            </div>
            {inviteUrl && (
              <div className="flex justify-center py-2">
                <div className="p-2 bg-white rounded-xl border border-slate-200 shadow-sm">
                  <QRCodeImage value={inviteUrl} size={160} className="w-36 h-36" alt="邀请二维码" />
                </div>
              </div>
            )}
            <p className="text-[11px] text-slate-400 text-center">链接发到微信/QQ 后，对方打开登录即可加入协同</p>
          </div>
        )}

        {/* ③ 直接邀请：输入用户ID（支持手机号/邮箱） */}
        {tab === "direct" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Input
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="输入对方的用户ID（或手机号/邮箱）"
                className="text-xs h-9"
                onKeyDown={(e) => { if (e.key === "Enter") handleAddMember(); }}
              />
              <Button
                size="sm"
                className="h-9 shrink-0 bg-[#384877] hover:bg-[#2e3a62]"
                onClick={handleAddMember}
                disabled={adding || !identifier.trim()}
              >
                {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "邀请"}
              </Button>
            </div>
            <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 space-y-1.5">
              <p className="text-[11px] text-slate-500">
                用户ID 形如 <span className="font-mono text-[10px] bg-white border border-slate-200 rounded px-1 py-0.5">cmrolg6mm0000ljtu…</span>
              </p>
              <p className="text-[11px] text-slate-500">对方可在「我的 → 账号信息」里复制自己的用户ID 发给你</p>
              <p className="text-[11px] text-slate-500">对方已注册的话会立刻加入并收到通知；未注册则引导使用邀请卡片/链接</p>
            </div>
          </div>
        )}

        {/* 当前成员管理 */}
        <div className="border-t border-slate-100 pt-3">
          <p className="text-xs font-medium text-slate-500 mb-2 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" /> 当前成员（{members.length}）
          </p>
          <div className="flex flex-wrap gap-2">
            {members.map((m) => (
              <div
                key={m.user_id || m.id}
                className="flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-full bg-slate-50 border border-slate-200"
              >
                <div className="w-6 h-6 rounded-full bg-[#384877] text-white text-[10px] flex items-center justify-center">
                  {getInitials(m.display_name)}
                </div>
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
      </DialogContent>
    </Dialog>
  );
}
