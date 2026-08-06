import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  MessageSquare,
  Send,
  CheckCircle2,
  Bell,
  CalendarClock,
  CalendarPlus,
  UserPlus,
  Tag,
  AlertCircle,
  Loader2,
  ChevronLeft,
  StickyNote,
  ListTodo,
  ExternalLink,
  Copy,
  Share2
} from "lucide-react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { httpRequest } from "@/api/httpClient";
import QRCodeImage from "@/components/ui/QRCode";
import html2canvas from "html2canvas";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from "@/components/ui/dialog";

const CATEGORY_LABELS = {
  work: "工作",
  personal: "个人",
  health: "健康",
  study: "学习",
  family: "家庭",
  shopping: "购物",
  finance: "财务",
  other: "其他"
};

const PRIORITY_COLORS = {
  urgent: "bg-red-100 text-red-700 border-red-200",
  high: "bg-orange-100 text-orange-700 border-orange-200",
  medium: "bg-blue-100 text-blue-700 border-blue-200",
  low: "bg-slate-100 text-slate-700 border-slate-200"
};

function getVisitorToken(token) {
  const key = `ss_visitor_${token}`;
  try {
    const stored = window.localStorage.getItem(key);
    if (stored) return stored;
  } catch (e) {}
  const generated = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  try {
    window.localStorage.setItem(key, generated);
  } catch (e) {}
  return generated;
}

function getVisitorName() {
  try {
    return window.localStorage.getItem("ss_visitor_name") || "";
  } catch (e) {
    return "";
  }
}

function setVisitorName(name) {
  try {
    window.localStorage.setItem("ss_visitor_name", name);
  } catch (e) {}
}

function api(path, options = {}) {
  return httpRequest(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
    body: options.body
  }).catch((error) => {
    throw error.data || { error: error.message || "REQUEST_FAILED" };
  });
}

function isDemoUser(user) {
  if (!user) return false;
  return user.email === "demo@soulsentry.local" || String(user.role || "").toLowerCase() === "demo";
}

function isWechatBrowser() {
  if (typeof window === "undefined") return false;
  return /MicroMessenger|WeChat/i.test(window.navigator.userAgent);
}

function toCalendarUTC(date) {
  const d = date ? new Date(date) : new Date();
  if (isNaN(d.getTime())) return null;
  return d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

function getCalendarEventData(item) {
  const startRaw = item?.reminder_time || item?.due_at || item?.reminderTime || item?.dueAt;
  const startDate = startRaw ? new Date(startRaw) : new Date();
  if (isNaN(startDate.getTime())) startDate.setTime(Date.now());
  const start = toCalendarUTC(startDate);

  const endRaw = item?.end_time || item?.endTime;
  let endDate = endRaw ? new Date(endRaw) : new Date(startDate.getTime() + 60 * 60 * 1000);
  if (isNaN(endDate.getTime())) endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
  const end = toCalendarUTC(endDate);

  const title = encodeURIComponent(item?.title || "未命名");
  const details = encodeURIComponent(item?.description || item?.plain_text || "");
  return { start, end, title, details };
}

function getGoogleCalendarUrl(item) {
  const { start, end, title, details } = getCalendarEventData(item);
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${start}/${end}&details=${details}`;
}

function getOutlookCalendarUrl(item) {
  const { start, end, title, details } = getCalendarEventData(item);
  return `https://outlook.live.com/calendar/0/deeplink/compose?subject=${title}&body=${details}&startdt=${start}&enddt=${end}`;
}

export default function Share() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [visitorName, setVisitorNameState] = useState(getVisitorName());
  const [commentText, setCommentText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [currentUser, setCurrentUser] = useState(undefined);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importConfirmOpen, setImportConfirmOpen] = useState(false);
  const [namePromptOpen, setNamePromptOpen] = useState(false);
  const pendingActionRef = useRef(null);
  const snapshotRef = useRef(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);

  const visitorToken = useMemo(() => getVisitorToken(token), [token]);

  const ensureNameThen = (action) => {
    const name = visitorName.trim();
    if (!name) {
      pendingActionRef.current = action;
      setNamePromptOpen(true);
      return;
    }
    action();
  };

  const confirmVisitorName = () => {
    const name = visitorName.trim();
    if (!name) {
      toast.error("请先填写你的称呼");
      return;
    }
    setVisitorName(name);
    setNamePromptOpen(false);
    const action = pendingActionRef.current;
    pendingActionRef.current = null;
    if (action) action();
  };

  const fetchShare = async () => {
    try {
      setLoading(true);
      const result = await api(`/api/public/share/${token}`);
      setData(result);
      setError(null);
    } catch (err) {
      setError(err?.error === "SHARE_EXPIRED" ? "分享链接已失效" : "分享内容不存在或已删除");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShare();
  }, [token]);

  useEffect(() => {
    // Try to detect if the visitor is already logged in.
    // AuthContext skips auth for /share paths, so we check directly.
    api("/api/users/me")
      .then((user) => {
        // Demo user should not be treated as a real logged-in user for import.
        if (isDemoUser(user)) {
          setCurrentUser(null);
          return;
        }
        setCurrentUser(user);
        // If the user just logged in to import this share, ask for confirmation first.
        try {
          const pending = window.localStorage.getItem("ss_pending_import_share");
          if (pending) {
            const parsed = JSON.parse(pending);
            if (parsed.token === token) {
              window.localStorage.removeItem("ss_pending_import_share");
              setTimeout(() => setImportConfirmOpen(true), 0);
            }
          }
        } catch (e) {}
      })
      .catch(() => setCurrentUser(null));
  }, []);

  const handleToggleTask = async (checked, subtaskId) => {
    if (data?.type !== "task") return;
    setSubmitting(true);
    try {
      const result = await api(`/api/public/share/${token}/toggle`, {
        method: "POST",
        body: {
          checked,
          subtask_id: subtaskId || undefined,
          visitor_token: visitorToken,
          visitor_name: visitorName || undefined
        }
      });
      if (subtaskId) {
        setData((prev) => ({
          ...prev,
          subtasks: prev.subtasks.map((s) =>
            s.id === subtaskId ? result.task : s
          )
        }));
      } else {
        setData((prev) => ({ ...prev, item: result.task }));
      }
      toast.success(checked ? "已勾选" : "已取消勾选");
    } catch (err) {
      toast.error(err?.message || "操作失败");
    } finally {
      setSubmitting(false);
    }
  };

  const handleComment = async () => {
    if (!commentText.trim()) return;
    setSubmitting(true);
    try {
      const result = await api(`/api/public/share/${token}/comments`, {
        method: "POST",
        body: {
          content: commentText.trim(),
          visitor_token: visitorToken,
          visitor_name: visitorName || undefined
        }
      });
      setData((prev) => ({
        ...prev,
        comments: [result.comment, ...(prev.comments || [])]
      }));
      setCommentText("");
      if (result.visitor_token) getVisitorToken(token);
      toast.success("评论已发布");
    } catch (err) {
      toast.error(err?.message || "评论失败");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubscribe = async () => {
    try {
      await api(`/api/public/share/${token}/subscribe`, {
        method: "POST",
        body: {
          visitor_token: visitorToken,
          visitor_name: visitorName || undefined
        }
      });
      setSubscribed(true);
      toast.success("已订阅更新通知");
    } catch (err) {
      toast.error(err?.message || "订阅失败");
    }
  };

  const handleAddToCalendar = () => {
    if (!item) return;
    const icsUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/api/public/share/${token}/ics`;
    openCalendar(icsUrl);
    toast.success("正在打开日历…");
  };

  const handleImportToMine = () => {
    if (!currentUser || isDemoUser(currentUser)) {
      // Remember the share so we can import after login.
      try {
        window.localStorage.setItem("ss_pending_import_share", JSON.stringify({ token, type: data?.type }));
      } catch (e) {}
      setImportDialogOpen(true);
      return;
    }
    setImportConfirmOpen(true);
  };

  const runImport = async () => {
    setImporting(true);
    try {
      const result = await api(`/api/public/share/${token}/import`, {
        method: "POST",
        body: { visitor_token: visitorToken }
      });
      toast.success(result.type === "task" ? "已添加到你的约定" : "已添加你的心签");
      setImportConfirmOpen(false);
      // Navigate to the imported item
      if (result.type === "task") {
        navigate(`/tasks?taskId=${result.item.id}`);
      } else {
        navigate(`/notes?noteId=${result.item.id}`);
      }
    } catch (err) {
      toast.error(err?.message || "导入失败");
    } finally {
      setImporting(false);
    }
  };

  const handleGenerateSnapshot = async () => {
    if (!snapshotRef.current) return;
    setSnapshotLoading(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 200));
      const canvas = await html2canvas(snapshotRef.current, {
        backgroundColor: "#ffffff",
        scale: 2,
        logging: false,
        useCORS: true,
        allowTaint: true,
        windowWidth: snapshotRef.current.scrollWidth,
        windowHeight: snapshotRef.current.scrollHeight
      });
      const link = document.createElement("a");
      link.download = `约定分享-${item?.title || "未命名"}-${Date.now()}.png`;
      link.href = canvas.toDataURL("image/png", 0.95);
      link.click();
      toast.success("分享快照已生成，可发送给好友");
    } catch (err) {
      console.error("snapshot error:", err);
      toast.error("生成快照失败，请重试");
    } finally {
      setSnapshotLoading(false);
    }
  };

  const handleLoginRedirect = () => {
    const returnUrl = encodeURIComponent(`/share/${token}`);
    navigate(`/login?redirect=${returnUrl}`);
  };

  const handleNameChange = (value) => {
    setVisitorNameState(value);
    setVisitorName(value);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-[#384877]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-800">
              <AlertCircle className="w-5 h-5 text-red-500" />
              无法查看分享
            </CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardFooter>
            <Button variant="outline" onClick={() => navigate("/")} className="w-full">
              返回首页
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  const isTask = data?.type === "task";
  const item = data?.item;
  const comments = data?.comments || [];
  const subtasks = data?.subtasks || [];
  const icsUrl = typeof window !== "undefined" ? `${window.location.origin}/api/public/share/${token}/ics` : "";
  const googleUrl = item ? getGoogleCalendarUrl(item) : "";
  const outlookUrl = item ? getOutlookCalendarUrl(item) : "";
  const inWechat = isWechatBrowser();

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-1 text-sm text-slate-600 hover:text-[#384877] transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            首页
          </button>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            {isTask ? <ListTodo className="w-4 h-4" /> : <StickyNote className="w-4 h-4" />}
            <span>{isTask ? "公开约定" : "公开心签"}</span>
          </div>
        </div>
      </header>

      {inWechat && (
        <div className="bg-amber-50 border-b border-amber-100">
          <div className="max-w-3xl mx-auto px-4 py-2.5 flex items-start gap-2 text-sm text-amber-800">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <p>
              你正在微信内打开。为保证日历、评论等功能正常，请点击右上角 ⋯ 选择
              <strong>“在浏览器打开”</strong>。
            </p>
          </div>
        </div>
      )}

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* 拥有者信息 */}
        <div className="flex items-center gap-3">
          <Avatar className="w-10 h-10 bg-gradient-to-br from-[#384877] to-[#3b5aa2]">
            <AvatarFallback className="text-white text-sm">
              {(data?.owner_name || "S").slice(0, 1)}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="text-sm font-medium text-slate-800">{data?.owner_name || "分享者"}</p>
            <p className="text-xs text-slate-500">邀请你一起参与</p>
          </div>
        </div>

        {/* 内容卡片 */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              {isTask && item.category && (
                <Badge variant="outline" className="text-xs">
                  {CATEGORY_LABELS[item.category] || item.category}
                </Badge>
              )}
              {isTask && item.priority && (
                <Badge variant="outline" className={`text-xs ${PRIORITY_COLORS[item.priority] || ""}`}>
                  {item.priority === "urgent" ? "紧急" : item.priority === "high" ? "高" : item.priority === "medium" ? "中" : "低"}
                </Badge>
              )}
            </div>
            <CardTitle className="text-xl text-slate-900 leading-snug">{item.title || "未命名"}</CardTitle>
            {isTask && item.description && (
              <CardDescription className="text-sm text-slate-600 whitespace-pre-line mt-2">
                {item.description}
              </CardDescription>
            )}
            {!isTask && (
              <CardDescription className="text-sm text-slate-600 whitespace-pre-line mt-2">
                {item.plain_text || item.content?.replace?.(/<[^>]+>/g, "") || ""}
              </CardDescription>
            )}
          </CardHeader>

          <CardContent className="space-y-4">
            {isTask && (
              <>
                {item.reminder_time && (
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <CalendarClock className="w-4 h-4 text-slate-400" />
                    <span>{format(new Date(item.reminder_time), "yyyy年M月d日 HH:mm", { locale: zhCN })}</span>
                  </div>
                )}
                {item.tags?.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Tag className="w-4 h-4 text-slate-400" />
                    {item.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                    ))}
                  </div>
                )}

                <Separator />

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Checkbox
                      id="main-task"
                      checked={item.status === "completed"}
                      onCheckedChange={(checked) => ensureNameThen(() => handleToggleTask(checked))}
                      disabled={submitting}
                    />
                    <label htmlFor="main-task" className={`text-sm font-medium ${item.status === "completed" ? "text-slate-400 line-through" : "text-slate-800"}`}>
                      {item.status === "completed" ? "已完成" : "标记为已完成"}
                    </label>
                  </div>
                  {item.status === "completed" && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
                </div>

                {subtasks.length > 0 && (
                  <div className="bg-slate-50 rounded-xl p-4 space-y-3">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">子约定</p>
                    {subtasks.map((sub) => (
                      <div key={sub.id} className="flex items-center gap-3">
                        <Checkbox
                          id={`subtask-${sub.id}`}
                          checked={sub.status === "completed"}
                          onCheckedChange={(checked) => ensureNameThen(() => handleToggleTask(!!checked, sub.id))}
                          disabled={submitting}
                        />
                        <label
                          htmlFor={`subtask-${sub.id}`}
                          className={`text-sm ${sub.status === "completed" ? "text-slate-400 line-through" : "text-slate-700"}`}
                        >
                          {sub.title}
                        </label>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* 访客身份 */}
            <div className="bg-blue-50/50 rounded-xl p-4 border border-blue-100">
              <label className="text-xs font-medium text-blue-800 block mb-1.5">你的称呼</label>
              <Input
                value={visitorName}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="如：小林"
                className="h-9 bg-white border-blue-200 text-sm"
                maxLength={50}
              />
              <p className="text-xs text-blue-600 mt-1.5">
                不注册也可以勾选进度、留言，对方会立刻收到。
              </p>
            </div>
          </CardContent>
        </Card>

        {/* 操作入口 */}
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="py-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {inWechat ? (
                <Button
                  variant="outline"
                  className="justify-start gap-2 h-auto py-3 px-4 border-slate-200 hover:bg-slate-50"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(icsUrl);
                      toast.success("日历链接已复制，请在浏览器中粘贴打开");
                    } catch {
                      toast.error("复制失败，请长按手动复制链接");
                    }
                  }}
                >
                  <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center flex-shrink-0">
                    <Copy className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium text-slate-800">复制日历链接</p>
                    <p className="text-xs text-slate-500">去浏览器打开即可添加</p>
                  </div>
                </Button>
              ) : (
                <Button
                  asChild
                  variant="outline"
                  className="justify-start gap-2 h-auto py-3 px-4 border-slate-200 hover:bg-slate-50"
                >
                  <a href={icsUrl} className="no-underline">
                    <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center flex-shrink-0">
                      <CalendarPlus className="w-4 h-4 text-emerald-600" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-medium text-slate-800">添加到日历</p>
                      <p className="text-xs text-slate-500">手机上会直接打开日历 App</p>
                    </div>
                  </a>
                </Button>
              )}

              <Button
                variant="outline"
                className="justify-start gap-2 h-auto py-3 px-4 border-slate-200 hover:bg-slate-50"
                onClick={handleImportToMine}
                disabled={importing || currentUser === undefined}
              >
                <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <UserPlus className="w-4 h-4 text-blue-600" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium text-slate-800">
                    {currentUser === undefined ? "检查中..." : currentUser ? "添加至我的列表" : "登录后添加至我的列表"}
                  </p>
                  <p className="text-xs text-slate-500">
                    {currentUser ? "导入到你的约定/心签" : "登录/注册后即可保存"}
                  </p>
                </div>
              </Button>
            </div>

            {/* 日历兜底链接 */}
            {item && (
              <div className="pt-3 border-t border-slate-100">
                <p className="text-xs text-slate-500 mb-2">如果无法直接打开日历，可使用以下方式：</p>
                <div className="flex flex-wrap gap-2">
                  <a
                    href={googleUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
                  >
                    Google 日历 <ExternalLink className="w-3 h-3" />
                  </a>
                  <a
                    href={outlookUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
                  >
                    Outlook 日历 <ExternalLink className="w-3 h-3" />
                  </a>
                  <a
                    href={icsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
                  >
                    下载 .ics <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 生成分享快照 */}
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="py-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#384877]/10 flex items-center justify-center">
                  <Share2 className="w-5 h-5 text-[#384877]" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-800">生成分享快照</p>
                  <p className="text-xs text-slate-500">下载带二维码的卡片图片，扫码即可参与</p>
                </div>
              </div>
              <Button
                size="sm"
                onClick={handleGenerateSnapshot}
                disabled={snapshotLoading}
                className="bg-gradient-to-r from-[#384877] to-[#3b5aa2]"
              >
                {snapshotLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "生成图片"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 订阅通知 */}
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="py-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center">
                  <Bell className="w-5 h-5 text-indigo-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-800">订阅更新</p>
                  <p className="text-xs text-slate-500">当有新评论或状态变化时接收通知</p>
                </div>
              </div>
              <Button
                size="sm"
                variant={subscribed ? "outline" : "default"}
                disabled={subscribed}
                onClick={() => ensureNameThen(handleSubscribe)}
                className={subscribed ? "" : "bg-gradient-to-r from-[#384877] to-[#3b5aa2]"}
              >
                {subscribed ? "已订阅" : "订阅"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 评论区 */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-slate-500" />
              评论 ({comments.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!commentText.trim()) return;
                ensureNameThen(handleComment);
              }}
              className="space-y-3"
            >
              <Textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="写下你的评论..."
                className="min-h-[80px] resize-none"
                maxLength={5000}
              />
              <div className="flex justify-end">
                <Button
                  type="submit"
                  disabled={!commentText.trim() || submitting}
                  size="sm"
                  className="bg-gradient-to-r from-[#384877] to-[#3b5aa2]"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4 mr-1.5" />}
                  发送评论
                </Button>
              </div>
            </form>

            {comments.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-6">暂无评论，来说两句吧</p>
            ) : (
              <div className="space-y-4">
                {comments.map((comment) => (
                  <div key={comment.id} className="flex gap-3">
                    <Avatar className="w-8 h-8 bg-slate-200">
                      <AvatarFallback className="text-xs text-slate-600">
                        {(comment.visitor_name || comment.created_by || "访").slice(0, 1)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-slate-800">
                          {comment.visitor_name || comment.created_by || "访客"}
                        </span>
                        <span className="text-xs text-slate-400">
                          {format(new Date(comment.created_date), "M月d日 HH:mm", { locale: zhCN })}
                        </span>
                      </div>
                      <p className="text-sm text-slate-600 whitespace-pre-line mt-1">{comment.content}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 隐藏：分享快照渲染区 */}
        <div
          ref={snapshotRef}
          className="fixed left-[-9999px] top-0 bg-white"
          style={{ width: "375px", padding: "24px" }}
        >
          <div className="bg-gradient-to-br from-[#384877] to-[#3b5aa2] rounded-2xl p-5 text-white mb-5">
            <div className="flex items-center gap-2 mb-3 opacity-90">
              {isTask ? <ListTodo className="w-5 h-5" /> : <StickyNote className="w-5 h-5" />}
              <span className="text-sm font-medium">{isTask ? "公开约定" : "公开心签"}</span>
            </div>
            <h2 className="text-xl font-bold leading-snug mb-2">{item?.title || "未命名"}</h2>
            <p className="text-sm opacity-80">
              来自 {data?.owner_name || "分享者"} 的分享
            </p>
          </div>

          {isTask && subtasks.length > 0 && (
            <div className="mb-5">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">子约定</p>
              <div className="space-y-2">
                {subtasks.slice(0, 8).map((sub) => (
                  <div key={sub.id} className="flex items-start gap-2">
                    <div className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${sub.status === "completed" ? "bg-[#384877] border-[#384877] text-white" : "border-slate-300"}`}>
                      {sub.status === "completed" && <CheckCircle2 className="w-3 h-3" />}
                    </div>
                    <span className={`text-sm ${sub.status === "completed" ? "text-slate-400 line-through" : "text-slate-700"}`}>
                      {sub.title}
                    </span>
                  </div>
                ))}
                {subtasks.length > 8 && (
                  <p className="text-xs text-slate-400 pl-6">+ 还有 {subtasks.length - 8} 项</p>
                )}
              </div>
            </div>
          )}

          <div className="flex flex-col items-center justify-center bg-slate-50 rounded-2xl p-5 border border-slate-100">
            <QRCodeImage
              value={typeof window !== "undefined" ? `${window.location.origin}/share/${token}` : ""}
              size={160}
              className="w-40 h-40 mb-3"
            />
            <p className="text-sm font-medium text-slate-800">扫码参与</p>
            <p className="text-xs text-slate-500 text-center mt-1">
              匿名勾选 · 评论 · 订阅更新
            </p>
          </div>

          <div className="mt-5 text-center">
            <p className="text-xs text-slate-400">SoulSentry · 心栈</p>
          </div>
        </div>

        {/* 登录/导入提示 */}
        <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-base">登录/注册以保存</DialogTitle>
              <DialogDescription className="text-sm text-slate-500">
                添加至个人列表需要先登录。登录后你可以确认是否将该{isTask ? "约定" : "心签"}加入个人列表。
              </DialogDescription>
            </DialogHeader>
            <div className="flex gap-3 pt-2">
              <Button onClick={handleLoginRedirect} className="flex-1 bg-gradient-to-r from-[#384877] to-[#3b5aa2]">
                去登录
              </Button>
              <Button variant="outline" onClick={() => setImportDialogOpen(false)} className="flex-1">
                稍后再说
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* 导入前确认 */}
        <Dialog open={importConfirmOpen} onOpenChange={setImportConfirmOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-base">加入个人列表？</DialogTitle>
              <DialogDescription className="text-sm text-slate-500">
                是否将该{isTask ? "约定" : "心签"}《{item?.title || "未命名"}》加入你的列表？确认后将立刻导入。
              </DialogDescription>
            </DialogHeader>
            <div className="flex gap-3 pt-2">
              <Button
                onClick={runImport}
                disabled={importing}
                className="flex-1 bg-gradient-to-r from-[#384877] to-[#3b5aa2]"
              >
                {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : "确认加入"}
              </Button>
              <Button variant="outline" onClick={() => setImportConfirmOpen(false)} disabled={importing} className="flex-1">
                取消
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* 称呼输入提示 */}
        <Dialog open={namePromptOpen} onOpenChange={(open) => {
          setNamePromptOpen(open);
          if (!open) pendingActionRef.current = null;
        }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-base">你的称呼</DialogTitle>
              <DialogDescription className="text-sm text-slate-500">
                不注册也可以勾选进度、留言，对方会立刻收到。
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 pt-1">
              <Input
                value={visitorName}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="如：小林"
                maxLength={50}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") confirmVisitorName();
                }}
              />
              <div className="flex gap-3">
                <Button onClick={confirmVisitorName} className="flex-1 bg-gradient-to-r from-[#384877] to-[#3b5aa2]">
                  确认
                </Button>
                <Button variant="outline" onClick={() => { setNamePromptOpen(false); pendingActionRef.current = null; }} className="flex-1">
                  取消
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
