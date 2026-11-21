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
import { Textarea } from "@/components/ui/textarea";
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
  ListTodo,
  ExternalLink,
  CircleCheck,
  UserMinus,
} from "lucide-react";
import QRCodeImage from "@/components/ui/QRCode";
import { httpRequest } from "@/api/httpClient";
import { base44 } from "@/api/base44Client";
import assistantPlanet from "@/assets/assistant-planet.png";
import html2canvas from "html2canvas";
import { toast } from "sonner";

// 搭子归属展示名（协同约定挂在某颗搭子下时，邀请卡片标注「XX搭子全程协调」）
const BUDDY_NAMES = { study: "学习搭子", travel: "旅游搭子", reading: "读书搭子", morning: "早起搭子", running: "跑步搭子" };

const getInitials = (name) => {
  if (!name || typeof name !== "string") return "?";
  const trimmed = name.trim();
  if (!trimmed) return "?";
  if (/^[一-龥]/.test(trimmed)) return trimmed.slice(0, 1);
  const parts = trimmed.split(/\s+/).filter(Boolean);
  return parts.map((p) => p[0]).join("").toUpperCase().slice(0, 2) || "?";
};

const TABS = [
  { key: "card", label: "邀请卡片", icon: ImageIcon },
  { key: "link", label: "邀请链接", icon: LinkIcon },
  { key: "todo", label: "待办邀请", icon: ListTodo },
  { key: "direct", label: "直接邀请", icon: AtSign },
];

const INVITE_STATUS_LABELS = {
  open: "待回应",
  accepted: "已接受邀请",
  suggested: "已建议",
  declined: "暂不参与",
};

export default function CollabInviteDialog({ task, members = [], subtasks = [], open, onClose, onChanged }) {
  const [tab, setTab] = useState("card");
  const [inviteUrl, setInviteUrl] = useState("");
  const [cardInviteeName, setCardInviteeName] = useState("");
  const [cardNote, setCardNote] = useState("");
  const [cardInvite, setCardInvite] = useState(null);
  const [creatingCard, setCreatingCard] = useState(false);
  const [adding, setAdding] = useState(false);
  const [removingMemberId, setRemovingMemberId] = useState("");
  const [exporting, setExporting] = useState(false);
  // @直接邀请：输入 @ 检索协作过的伙伴，选中后点邀请即刻发出
  const [mentionText, setMentionText] = useState("");
  const [mentionCandidates, setMentionCandidates] = useState([]);
  const [mentionSelected, setMentionSelected] = useState(null);
  // ③ 待办邀请：受邀者昵称 + 绑定子约定 + 生成带前情摘要的邀请链接
  const [todoName, setTodoName] = useState("");
  const [todoNote, setTodoNote] = useState("");
  const [todoSelected, setTodoSelected] = useState(() => new Set());
  const [todoCreating, setTodoCreating] = useState(false);
  const [todoInvite, setTodoInvite] = useState(null); // 最近一次生成的 {code,url}
  const [recentInvites, setRecentInvites] = useState([]);
  const cardRef = useRef(null);
  const standardTriedRef = useRef(false);
  // 「直接邀请」点击后滚动定位到下方 @ 邀请区块
  const mentionRef = useRef(null);

  const { data: currentUser } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => base44.auth.me(),
    enabled: open,
  });

  const inviterName = useMemo(() => {
    const name = currentUser?.displayName || currentUser?.display_name || currentUser?.email || "发起人";
    return name;
  }, [currentUser]);

  // 生成通用邀请：二维码指向 /invite/<code>，由服务端基于当前子约定+沉淀生成邀请概况，
  // 受邀者扫码后能看到概况、进展和邀请人的自定义留言。
  const createGeneralInvite = async ({ standard = false } = {}) => {
    if (!task?.id || creatingCard) return;
    setCreatingCard(true);
    try {
      const res = await httpRequest(`/api/collab/${task.id}/invites`, {
        method: "POST",
        body: {
          invitee_name: standard ? "伙伴" : cardInviteeName.trim() || "伙伴",
          subtask_ids: [],
          note: standard ? null : cardNote.trim() || null,
          skip_summary: standard,
        },
      });
      const url = res?.url ? `${window.location.origin}${res.url}` : "";
      setCardInvite({ ...(res?.invite || {}), url, standard: !!res?.standard });
      setInviteUrl(url);
      loadRecentInvites();
      toast.success(standard ? "标准邀请卡片已准备好" : "定制邀请卡片已生成");
    } catch (error) {
      toast.error(error?.data?.message || error?.message || "邀请生成失败，请稍后再试");
    } finally {
      setCreatingCard(false);
    }
  };

  // @邀请候选检索（防抖 250ms）：候选来自与我协作过的伙伴，排除本约定已有成员
  useEffect(() => {
    if (!open || !task?.id || mentionSelected) {
      setMentionCandidates([]);
      return;
    }
    const q = mentionText.replace(/^@+/, "").trim();
    if (!q) {
      setMentionCandidates([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await httpRequest(
          `/api/collab/invite-candidates?task_id=${encodeURIComponent(task.id)}&q=${encodeURIComponent(q)}`
        );
        setMentionCandidates(res?.candidates || []);
      } catch {
        setMentionCandidates([]);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [mentionText, open, task?.id, mentionSelected]);

  const ownerMember = members.find((m) => m.role === "owner");
  const isOwner = Boolean(currentUser?.id && ownerMember?.user_id === currentUser.id);

  // 剪贴板写入：优先现代 API，失败（权限/非安全上下文）回退隐藏 textarea 方案，确保一定有反馈
  const copyText = async (text) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (_e) {
      // fall through
    }
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch (_e) {
      return false;
    }
  };

  // 已复制内联反馈：点击链接或按钮复制成功后亮出 ✓，2.5s 后复位
  const [copied, setCopied] = useState(false);
  const markCopied = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleCopy = async () => {
    if (!inviteUrl) return;
    const ok = await copyText(inviteUrl);
    if (ok) {
      toast.success("邀请链接已复制");
      markCopied();
    } else {
      toast.error("复制失败，请长按选择链接后手动复制");
    }
  };

  // 主按钮：复制链接并给出内联 ✓ 反馈（不自动关闭弹窗，让用户确认复制成功）
  const handleCopyPrimary = async () => {
    if (!inviteUrl) return;
    const ok = await copyText(inviteUrl);
    if (ok) {
      toast.success("邀请链接已复制");
      markCopied();
    } else {
      toast.error("复制失败，请长按选择链接后手动复制");
    }
  };

  // 渲染卡片为 PNG blob（保存/分享 与 复制卡片 共用）
  // 导出尺寸必须与卡片实际布局严格一致：
  // ① 右侧装饰圆环溢出不参与画布尺寸，否则图片右侧会多出空白；
  // ② html2canvas 克隆时的视口宽度不能压到卡片自身，否则响应式 width:100%
  //    会在克隆文档里被挤窄，卡片同样无法铺满导出的图片。
  const renderCardBlob = async () => {
    const card = cardRef.current;
    if (!card) throw new Error("卡片尚未准备好");
    const rect = card.getBoundingClientRect();
    const width = Math.ceil(rect.width);
    const height = Math.ceil(rect.height);
    const canvas = await html2canvas(card, {
      scale: 2,
      width,
      height,
      windowWidth: Math.max(window.innerWidth || 0, width),
      windowHeight: Math.max(window.innerHeight || 0, height),
      backgroundColor: "#FFFFFF",
      logging: false,
      useCORS: true,
      // 克隆节点固定为实际卡片宽度；同时去掉弹窗祖先的高度/滚动裁剪，
      // 长标题或长留言才能完整落进图片
      onclone: (clonedDoc) => {
        const clonedCard = clonedDoc.querySelector('[data-invite-card="true"]');
        if (clonedCard) {
          clonedCard.style.width = `${width}px`;
          clonedCard.style.maxWidth = "none";
          clonedCard.style.flex = "0 0 auto";
        }
        let node = clonedCard?.parentElement;
        while (node && node !== clonedDoc.body) {
          node.style.overflow = "visible";
          node.style.maxHeight = "none";
          node = node.parentElement;
        }
      },
    });
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("生成图片失败");
    return blob;
  };

  const downloadBlob = (blob, fileName) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // 延迟回收：立即 revoke 可能让部分浏览器取消刚触发的下载
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  // 卡片导出：手机端直接调系统分享面板（分享面板真正可用）；桌面端一律下载保存
  const handleShareCard = async () => {
    if (!cardRef.current || exporting) return;
    setExporting(true);
    const fileName = `心栈协同邀请-${(task?.title || "约定").slice(0, 12)}.png`;
    try {
      const blob = await renderCardBlob();
      const file = new File([blob], fileName, { type: "image/png" });
      // 仅触屏设备走系统分享；桌面端及分享超时一律回退为下载保存
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
              text: `${inviterName} 邀请你一起协作「${task?.title || "协同约定"}」${cardInvite?.note ? `：“${cardInvite.note}”` : ""}`,
              url: inviteUrl,
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
        downloadBlob(blob, fileName);
        toast.success("邀请卡片已保存，去发给伙伴吧");
      }
    } catch (error) {
      console.error("[collab] 邀请卡片导出失败:", error);
      toast.error("卡片生成失败，请稍后再试");
    } finally {
      setExporting(false);
    }
  };

  // 复制卡片：卡片 PNG 写入剪贴板，可直接粘贴到微信/QQ；不支持时回退为下载
  const handleCopyCard = async () => {
    if (!cardRef.current || exporting) return;
    setExporting(true);
    try {
      const blob = await renderCardBlob();
      if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
        try {
          await Promise.race([
            navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]),
            new Promise((_, reject) => setTimeout(() => reject(new Error("CLIPBOARD_TIMEOUT")), 5000)),
          ]);
          toast.success("卡片已复制，可直接粘贴给好友");
        } catch {
          // 剪贴板不可用/超时：回退为下载
          downloadBlob(blob, `心栈协同邀请-${(task?.title || "约定").slice(0, 12)}.png`);
          toast.success("当前浏览器不支持复制图片，已改为下载卡片");
        }
      } else {
        downloadBlob(blob, `心栈协同邀请-${(task?.title || "约定").slice(0, 12)}.png`);
        toast.success("当前浏览器不支持复制图片，已改为下载卡片");
      }
    } catch (error) {
      console.error("[collab] 复制卡片失败:", error);
      toast.error("复制卡片失败，可尝试保存/分享");
    } finally {
      setExporting(false);
    }
  };

  // @直接邀请：优先按选中的候选 user_id 邀请；无候选时按输入内容智能识别（邮箱/手机号/用户ID）
  const handleMentionInvite = async () => {
    const value = mentionText.replace(/^@+/, "").trim();
    if (!mentionSelected && !value) return;
    setAdding(true);
    try {
      const body = mentionSelected
        ? { user_id: mentionSelected.user_id }
        : /@/.test(value)
          ? { email: value }
          : /^\d{5,}$/.test(value)
            ? { phone: value }
            : { user_id: value };
      const result = await httpRequest(`/api/collab/${task.id}/members`, { method: "POST", body });
      toast.success(
        result?.already_member
          ? `${result?.member?.display_name || "对方"} 已是成员`
          : `已邀请 ${result?.member?.display_name || "对方"} 加入协同约定`
      );
      setMentionText("");
      setMentionSelected(null);
      setMentionCandidates([]);
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

  // 创建者移除成员（后端二次校验发起人身份）
  const removeMember = async (member) => {
    if (!member?.user_id || removingMemberId) return;
    const name = member.display_name || "该成员";
    if (!window.confirm(`将 ${name} 移出这个协同约定？`)) return;
    setRemovingMemberId(member.user_id);
    try {
      await httpRequest(`/api/collab/${task.id}/members/${member.user_id}`, { method: "DELETE" });
      toast.success(`已将 ${name} 移出协同约定`);
      onChanged?.();
    } catch (error) {
      toast.error(error?.message || "移除成员失败");
    } finally {
      setRemovingMemberId("");
    }
  };

  // 切到「直接邀请」时滚动到下方 @ 邀请区块（输入框统一收在一处，避免两处重复）
  const switchTab = (key) => {
    setTab(key);
    if (key === "direct") {
      setTimeout(() => {
        mentionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 80);
    }
    if (key === "todo") loadSubtasks();
  };

  // 待办邀请：可选子约定（未完成项，扁平化带完成标准）
  // 从约定卡片打开时父层不带 subtasks——切到本页签时按需拉取 summary 兜底
  const [fetchedSubtasks, setFetchedSubtasks] = useState([]);
  const [subtasksLoading, setSubtasksLoading] = useState(false);
  const loadSubtasks = async () => {
    if (!task?.id || subtasksLoading || subtasks.length > 0 || fetchedSubtasks.length > 0) return;
    setSubtasksLoading(true);
    try {
      const res = await httpRequest(`/api/collab/${task.id}/summary`);
      setFetchedSubtasks(res?.subtasks || []);
    } catch {
      setFetchedSubtasks([]);
    } finally {
      setSubtasksLoading(false);
    }
  };

  const allSubtasks = useMemo(() => {
    const source = subtasks.length > 0 ? subtasks : fetchedSubtasks;
    const out = [];
    const walk = (list) => {
      for (const n of list || []) {
        out.push(n);
        walk(n.children || []);
      }
    };
    walk(source);
    return out;
  }, [subtasks, fetchedSubtasks]);

  const confirmedSubtasks = useMemo(
    () => allSubtasks.filter((s) => s.metadata?.collab?.state !== "draft"),
    [allSubtasks]
  );
  const completedCount = confirmedSubtasks.filter((s) => s.status === "DONE" || s.status === "completed").length;

  const flatSubtasks = useMemo(() => {
    return allSubtasks.filter((n) => n.status !== "DONE" && n.status !== "completed");
  }, [allSubtasks]);

  const loadRecentInvites = async () => {
    if (!task?.id) return;
    try {
      const res = await httpRequest(`/api/collab/${task.id}/invites`);
      setRecentInvites(res?.invites || []);
    } catch {
      setRecentInvites([]);
    }
  };

  // 切换约定时重置标准卡片
  useEffect(() => {
    standardTriedRef.current = false;
    setCardInvite(null);
    setInviteUrl("");
  }, [task?.id]);

  useEffect(() => {
    if (!open) return;
    setTodoInvite(null);
    loadRecentInvites();
    loadSubtasks();
    // 打开即准备一张标准邀请卡片；用户填写定制内容后再生成定制卡片
    if (!cardInvite && !creatingCard && !standardTriedRef.current) {
      standardTriedRef.current = true;
      createGeneralInvite({ standard: true });
    }
  }, [open, task?.id]);

  const handleCreateTodoInvite = async () => {
    const name = todoName.trim();
    if (!name || todoCreating) return;
    setTodoCreating(true);
    try {
      const res = await httpRequest(`/api/collab/${task.id}/invites`, {
        method: "POST",
        body: { invitee_name: name, subtask_ids: [...todoSelected], note: todoNote.trim() || null },
      });
      const url = `${window.location.origin}${res.url}`;
      setTodoInvite({ ...res.invite, url });
      setTodoName("");
      setTodoNote("");
      setTodoSelected(new Set());
      loadRecentInvites();
      toast.success(`已生成给 ${res.invite.invitee_name} 的邀请链接`);
    } catch (error) {
      toast.error(error?.message || "邀请生成失败，请稍后再试");
    } finally {
      setTodoCreating(false);
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
              onClick={() => switchTab(key)}
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
            <div className="space-y-2">
              <Input
                value={cardInviteeName}
                onChange={(e) => setCardInviteeName(e.target.value)}
                placeholder="对方称呼（可选，默认「伙伴」）"
                maxLength={20}
                className="h-9 text-xs"
              />
              <Textarea
                value={cardNote}
                onChange={(e) => setCardNote(e.target.value)}
                placeholder="想对 TA 说的一句话（可选）"
                maxLength={200}
                rows={2}
                className="text-xs resize-none"
              />
              <Button
                className="w-full bg-[#384877] hover:bg-[#2e3a62]"
                onClick={() => createGeneralInvite({ standard: !cardInvite && !(cardInviteeName.trim() || cardNote.trim()) })}
                disabled={creatingCard || (!!cardInvite && !(cardInviteeName.trim() || cardNote.trim()))}
              >
                {creatingCard ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <ImageIcon className="w-4 h-4 mr-1.5" />}
                {creatingCard ? "正在生成邀请卡片…" : cardInvite ? "生成定制邀请卡片" : "生成邀请卡片"}
              </Button>
              <p className="text-[10px] text-slate-400 text-center">
                {cardInvite && !(cardInviteeName.trim() || cardNote.trim())
                  ? "标准卡片已可直接分享；填写称呼或留言后，生成带 AI 概况的定制卡片"
                  : "定制卡片会由 Agent 基于当前子约定和沉淀生成邀请概况"}
              </p>
            </div>

            {cardInvite && inviteUrl ? (
              <>
                {/* 卡片本体：品牌深蓝页眉 + 白/浅蓝内容区，星球图标 + 二维码；
                    纯 DOM + 同源图片 + dataURL 二维码，文字全部普通流式排版（不用 -webkit-box 截断），
                    保证 html2canvas 导出后字样完整 */}
                <div className="flex justify-center py-1">
                  <div
                    ref={cardRef}
                    data-invite-card="true"
                    style={{
                      position: "relative",
                      width: "100%",
                      maxWidth: 330,
                      borderRadius: 22,
                      overflow: "hidden",
                      border: "1px solid #E6EAF4",
                      fontFamily: "inherit",
                      background: "linear-gradient(180deg,#FFFFFF 0%,#F7F8FC 100%)",
                      color: "#1F2A44",
                    }}
                  >
                    {/* 浅蓝轨道装饰：参考品牌功能页的细线圆环 */}
                    <div style={{ position: "absolute", width: 190, height: 190, borderRadius: "50%", border: "1px solid rgba(56,72,119,0.07)", right: -72, top: 96, pointerEvents: "none" }} />
                    <div style={{ position: "absolute", width: 116, height: 116, borderRadius: "50%", border: "1px solid rgba(56,72,119,0.06)", right: -24, top: 142, pointerEvents: "none" }} />
                    <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", background: "linear-gradient(135deg,#2F3D61 0%,#384877 100%)", padding: "16px 20px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <img
                          src={assistantPlanet}
                          alt=""
                          style={{ width: 34, height: 34, borderRadius: "50%", border: "1.5px solid rgba(255,255,255,0.55)", display: "block" }}
                        />
                        <div>
                          <p style={{ fontSize: 12, fontWeight: 600, color: "#FFFFFF", lineHeight: 1.2 }}>心栈 SoulSentry</p>
                          <p style={{ fontSize: 9, color: "rgba(255,255,255,0.65)", marginTop: 2, letterSpacing: "0.12em" }}>协同约定邀请</p>
                        </div>
                      </div>
                      <span style={{ fontSize: 9, color: "#FFFFFF", border: "1px solid rgba(255,255,255,0.5)", borderRadius: 999, padding: "3px 8px" }}>
                        邀请
                      </span>
                    </div>

                    <div style={{ position: "relative", padding: "18px 20px 20px" }}>
                      {/* 邀请对象与目的 */}
                      <p style={{ fontSize: 10, color: "#8A93A6", wordBreak: "break-word" }}>致 {cardInvite?.invitee_name || "伙伴"}</p>
                      <p style={{ marginTop: 6, fontSize: 18, fontWeight: 700, color: "#1F2A44", lineHeight: 1.45, wordBreak: "break-word" }}>
                        {task?.title || "未命名约定"}
                      </p>
                      <p style={{ marginTop: 6, fontSize: 11, color: "#6B7280", lineHeight: 1.65, wordBreak: "break-word" }}>
                        {task?.metadata?.collab?.goal || task?.description || "一起把这件事推进下去"}
                      </p>

                      {/* 邀请人留言：二维码落地页会展示同一句；完整展示，不截断 */}
                      <div style={{ marginTop: 12, padding: "10px 12px", border: "1px solid #E6EAF4", borderLeft: "2px solid #384877", background: "#F5F7FC", borderRadius: 12 }}>
                        <p style={{ fontSize: 11, color: "#4B5565", lineHeight: 1.65, wordBreak: "break-word" }}>
                          {cardInvite?.note || "邀请你加入这个协同约定。"}
                        </p>
                      </div>

                      {/* 轻量进展 + Agent 协调说明 */}
                      <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 6 }}>
                        <span style={{ fontSize: 9, color: "#384877", background: "#EEF2FF", borderRadius: 999, padding: "3px 8px" }}>
                          {members.length} 人协作
                        </span>
                        {confirmedSubtasks.length > 0 && (
                          <span style={{ fontSize: 9, color: "#5B6475", background: "#F3F5FA", borderRadius: 999, padding: "3px 8px" }}>
                            已完成 {completedCount}/{confirmedSubtasks.length} 项子约定
                          </span>
                        )}
                        <span style={{ fontSize: 9, color: "#5B6475", background: "#F3F5FA", borderRadius: 999, padding: "3px 8px" }}>
                          {task?.metadata?._extraFields?.buddy_name || BUDDY_NAMES[task?.metadata?._extraFields?.buddy_id] || "Agent"} 全程协调
                        </span>
                      </div>

                      <div style={{ height: 1, background: "#E6EAF4", margin: "16px 0" }} />

                      {/* 邀请人 + 二维码 */}
                      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#384877", color: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 }}>
                              {getInitials(cardInvite?.inviter_name || inviterName)}
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <p style={{ fontSize: 9, color: "#8A93A6" }}>邀请人</p>
                              <p style={{ fontSize: 11, fontWeight: 600, color: "#1F2A44", wordBreak: "break-word" }}>
                                {cardInvite?.inviter_name || inviterName}
                              </p>
                            </div>
                          </div>
                          <p style={{ fontSize: 9, color: "#8A93A6", marginTop: 10, lineHeight: 1.5 }}>
                            微信扫码查看完整邀请<br />与当前进展
                          </p>
                        </div>
                        <div style={{ background: "#fff", border: "1px solid #E6EAF4", borderRadius: 12, padding: 6, flexShrink: 0, boxShadow: "0 4px 16px rgba(47,61,97,0.12)" }}>
                          <QRCodeImage value={inviteUrl} size={88} className="w-[88px] h-[88px] block" alt="邀请二维码" />
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
                    保存 / 分享
                  </Button>
                  <Button variant="outline" className="flex-1" onClick={handleCopyCard} disabled={exporting}>
                    <Copy className="w-4 h-4 mr-1.5" /> 复制卡片
                  </Button>
                </div>
                <p className="text-[11px] text-slate-400 text-center">
                  对方扫码后可看到邀请概况、子约定进展、已沉淀内容和你的留言
                </p>
              </>
            ) : creatingCard ? (
              <div className="flex items-center justify-center py-8 text-xs text-slate-400">
                <Loader2 className="w-4 h-4 animate-spin mr-2" /> 正在准备标准邀请卡片…
              </div>
            ) : (
              <p className="text-xs text-slate-400 text-center py-8">
                正在准备标准邀请卡片，也可以填写称呼和留言生成定制卡片。
              </p>
            )}
          </div>
        )}

        {/* ② 邀请链接 */}
        {tab === "link" && (
          <div className="space-y-3">
            {inviteUrl ? (
              <>
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0" onClick={handleCopy} title="点击即可复制链接">
                    <Input
                      value={inviteUrl}
                      readOnly
                      className="text-xs h-9 cursor-pointer"
                      onFocus={(e) => e.target.select()}
                    />
                  </div>
                  <Button size="sm" className="h-9 shrink-0 bg-[#384877] hover:bg-[#2e3a62]" onClick={handleCopyPrimary}>
                    <Copy className="w-3.5 h-3.5 mr-1" /> 复制邀请链接
                  </Button>
                </div>
                <div className="flex justify-center py-2">
                  <div className="p-2 bg-white rounded-xl border border-slate-200 shadow-sm">
                    <QRCodeImage value={inviteUrl} size={160} className="w-36 h-36" alt="邀请二维码" />
                  </div>
                </div>
                <p className="text-[11px] text-slate-400 text-center">
                  {copied ? (
                    <span className="text-emerald-600 font-medium">✓ 已复制，去微信/QQ 粘贴给伙伴吧</span>
                  ) : (
                    "对方打开即可看到 AI 邀请概况、当前进展和你的留言；登录后可加入协同"
                  )}
                </p>
              </>
            ) : (
              <div className="space-y-2 py-4 text-center">
                <p className="text-xs text-slate-400">
                  邀请链接会打开同一份邀请概况页。可先在「邀请卡片」填写称呼和留言。
                </p>
                <Button
                  className="w-full bg-[#384877] hover:bg-[#2e3a62]"
                  onClick={() => createGeneralInvite({ standard: true })}
                  disabled={creatingCard}
                >
                  {creatingCard ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <LinkIcon className="w-4 h-4 mr-1.5" />}
                  {creatingCard ? "正在生成邀请链接…" : "生成标准邀请链接"}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ③ 待办邀请：绑定具体子约定 + Agent 前情摘要的邀请链接 */}
        {tab === "todo" && (
          <div className="space-y-3">
            <Input
              value={todoName}
              onChange={(e) => setTodoName(e.target.value)}
              placeholder="受邀者姓名 / 昵称"
              maxLength={30}
              className="h-9 text-xs"
            />
            <div className="rounded-xl border border-slate-200 max-h-44 overflow-y-auto divide-y divide-slate-100">
              {flatSubtasks.length === 0 && (
                <p className="text-[11px] text-slate-400 text-center py-5">
                  {subtasksLoading ? "正在加载子约定…" : "暂无进行中的子约定可绑定"}
                </p>
              )}
              {flatSubtasks.map((s) => {
                const checked = todoSelected.has(s.id);
                return (
                  <label key={s.id} className="flex items-start gap-2.5 px-3 py-2.5 cursor-pointer hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        const next = new Set(todoSelected);
                        if (next.has(s.id)) next.delete(s.id);
                        else next.add(s.id);
                        setTodoSelected(next);
                      }}
                      className="mt-0.5 accent-[#384877]"
                    />
                    <span className="min-w-0">
                      <span className="block text-xs font-medium text-slate-700 truncate">{s.title}</span>
                      {s.metadata?.collab?.standard && (
                        <span className="block text-[10px] text-slate-400 mt-0.5 line-clamp-1">完成标准：{s.metadata.collab.standard}</span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
            <Input
              value={todoNote}
              onChange={(e) => setTodoNote(e.target.value)}
              placeholder="给对方的一句话（可选）"
              maxLength={200}
              className="h-9 text-xs"
            />
            <Button
              className="w-full bg-[#384877] hover:bg-[#2e3a62]"
              onClick={handleCreateTodoInvite}
              disabled={todoCreating || !todoName.trim()}
            >
              {todoCreating ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <ListTodo className="w-4 h-4 mr-1.5" />}
              生成邀请链接（含 Agent 前情摘要）
            </Button>

            {todoInvite && (
              <div className="rounded-xl border border-[#c9d5ef] bg-[#eef2ff]/60 p-3 space-y-2">
                <p className="text-[11px] text-[#384877]">
                  已生成给 <span className="font-semibold">{todoInvite.invitee_name}</span> 的邀请（绑定 {todoInvite.subtask_ids?.length || 0} 项待办）
                </p>
                <div className="flex items-center gap-2">
                  <Input value={todoInvite.url} readOnly onFocus={(e) => e.target.select()} className="text-[10px] h-8" />
                  <Button size="sm" variant="outline" className="h-8 shrink-0" onClick={async () => { if (await copyText(todoInvite.url)) { toast.success("链接已复制"); markCopied(); } }}>
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="flex-1 h-8 text-xs" onClick={() => window.open(todoInvite.url, "_blank")}>
                    <ExternalLink className="w-3.5 h-3.5 mr-1" /> 预览受邀者页面
                  </Button>
                  <Button size="sm" className="flex-1 h-8 text-xs bg-[#384877] hover:bg-[#2e3a62]" onClick={async () => { if (await copyText(todoInvite.url)) { toast.success("链接已复制，去发给对方吧"); markCopied(); } }}>
                    复制并关闭
                  </Button>
                </div>
              </div>
            )}

            {recentInvites.length > 0 && (
              <div className="border-t border-slate-100 pt-3">
                <p className="text-xs font-medium text-slate-500 mb-2">最近邀请及回应</p>
                <div className="space-y-1.5 max-h-36 overflow-y-auto">
                  {recentInvites.map((inv) => (
                    <div key={inv.id} className="flex items-center gap-2 rounded-lg border border-slate-100 px-2.5 py-2">
                      <span className="text-xs font-medium text-slate-700 truncate flex-1">{inv.invitee_name}</span>
                      <span className="text-[10px] text-slate-400 shrink-0">{(inv.subtask_ids || []).length} 项待办</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${inv.status === "accepted" ? "bg-emerald-50 text-emerald-700" : inv.status === "declined" ? "bg-slate-100 text-slate-500" : inv.status === "suggested" ? "bg-amber-50 text-amber-700" : "bg-[#eef2ff] text-[#384877]"}`}>
                        {INVITE_STATUS_LABELS[inv.status] || inv.status}
                      </span>
                      <button
                        type="button"
                        title="复制该邀请链接"
                        className="text-slate-400 hover:text-[#384877] shrink-0"
                        onClick={async () => {
                          const url = `${window.location.origin}/invite/${inv.code}`;
                          if (await copyText(url)) toast.success("链接已复制");
                        }}
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ④ 直接邀请：输入统一收在下方「@ 邀请朋友」，这里只做引导 */}
        {tab === "direct" && (
          <div className="rounded-xl border border-dashed border-[#c9d5ef] bg-[#eef2ff]/50 px-3 py-3 text-center">
            <p className="text-xs text-[#384877]">
              已为你定位到下方「@ 邀请朋友」：搜索协作过的伙伴，或直接输入邮箱 / 手机号 / 用户ID 邀请
            </p>
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
                {isOwner && m.role !== "owner" && (
                  <button
                    type="button"
                    onClick={() => removeMember(m)}
                    disabled={removingMemberId === m.user_id}
                    title={`移出 ${m.display_name || "成员"}`}
                    aria-label={`移出 ${m.display_name || "成员"}`}
                    className="flex h-5 w-5 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-500 disabled:opacity-50"
                  >
                    {removingMemberId === m.user_id
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : <UserMinus className="h-3 w-3" />}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* @直接邀请（当前成员下方）：直接邀请的唯一输入入口 */}
        <div ref={mentionRef} className="border-t border-slate-100 pt-3">
          <p className="text-xs font-medium text-slate-500 mb-2 flex items-center gap-1.5">
            <AtSign className="w-3.5 h-3.5" /> @ 邀请朋友
          </p>
          <div className="relative">
            {mentionSelected ? (
              <div className="flex items-center gap-2">
                <div className="flex-1 flex items-center justify-between rounded-lg border border-[#384877]/30 bg-[#384877]/5 pl-2 pr-1.5 py-1.5 min-w-0">
                  <span className="text-xs font-medium text-[#384877] truncate">
                    @{mentionSelected.display_name}
                    <span className="text-[10px] text-slate-400 font-normal ml-1.5">{mentionSelected.email}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setMentionSelected(null)}
                    className="w-5 h-5 shrink-0 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 text-sm leading-none"
                  >
                    ×
                  </button>
                </div>
                <Button
                  size="sm"
                  className="h-9 shrink-0 bg-[#384877] hover:bg-[#2e3a62]"
                  onClick={handleMentionInvite}
                  disabled={adding}
                >
                  {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "邀请"}
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#384877] text-sm font-semibold select-none">
                    @
                  </span>
                  <Input
                    value={mentionText}
                    onChange={(e) => setMentionText(e.target.value)}
                    placeholder="输入昵称、邮箱、手机号或用户ID"
                    className="pl-7 text-xs h-9"
                    onKeyDown={(e) => { if (e.key === "Enter") handleMentionInvite(); }}
                  />
                </div>
                <Button
                  size="sm"
                  className="h-9 shrink-0 bg-[#384877] hover:bg-[#2e3a62]"
                  onClick={handleMentionInvite}
                  disabled={adding || !mentionText.replace(/^@+/, "").trim()}
                >
                  {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "邀请"}
                </Button>
              </div>
            )}
            {!mentionSelected && mentionCandidates.length > 0 && (
              <div className="absolute bottom-full left-0 right-0 z-20 mb-1 rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden">
                {mentionCandidates.map((c) => (
                  <button
                    key={c.user_id}
                    type="button"
                    onClick={() => { setMentionSelected(c); setMentionCandidates([]); }}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 hover:bg-slate-50 text-left"
                  >
                    <span className="text-xs font-medium text-slate-800 truncate">{c.display_name}</span>
                    <span className="text-[10px] text-slate-400 truncate">{c.email}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <p className="text-[10px] text-slate-400 mt-1.5">
            候选可以来自你协作过的伙伴，也可以来自其他用户
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
