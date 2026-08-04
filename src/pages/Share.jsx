import React, { useEffect, useMemo, useState } from "react";
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
  Circle,
  Share2,
  Bell,
  CalendarClock,
  CalendarPlus,
  UserPlus,
  Tag,
  AlertCircle,
  Loader2,
  ChevronLeft,
  StickyNote,
  ListTodo
} from "lucide-react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import QRCodeImage from "@/components/ui/QRCode";
import { httpRequest } from "@/api/httpClient";
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

function escapeICS(text) {
  if (!text) return "";
  return String(text)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "");
}

function toICSDate(date) {
  const d = date ? new Date(date) : new Date();
  return d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

function generateICS(item, type) {
  const title = escapeICS(item.title || "未命名");
  const description = escapeICS(item.description || item.plain_text || "");
  const uid = `${item.id}@soulsentry.cn`;
  const now = toICSDate(new Date());
  const start = item.reminder_time ? toICSDate(item.reminder_time) : now;
  const end = item.end_time ? toICSDate(item.end_time) : toICSDate(new Date(new Date(start).getTime() + 60 * 60 * 1000));

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SoulSentry//CN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${title}`,
    `DESCRIPTION:${description}`,
    "END:VEVENT",
    "END:VCALENDAR"
  ].join("\r\n");
}

function downloadICS(item, type) {
  const ics = generateICS(item, type);
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${type === "task" ? "约定" : "心签"}-${(item.title || "未命名").slice(0, 20)}.ics`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
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

  const visitorToken = useMemo(() => getVisitorToken(token), [token]);
  const shareUrl = useMemo(() => typeof window !== "undefined" ? `${window.location.origin}/share/${token}` : "", [token]);

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
        setCurrentUser(user);
        // If the user just logged in to import this share, do it automatically.
        try {
          const pending = window.localStorage.getItem("ss_pending_import_share");
          if (pending) {
            const parsed = JSON.parse(pending);
            if (parsed.token === token) {
              window.localStorage.removeItem("ss_pending_import_share");
              setTimeout(() => handleImportToMine(), 0);
            }
          }
        } catch (e) {}
      })
      .catch(() => setCurrentUser(null));
  }, []);

  const handleToggleTask = async (checked) => {
    if (data?.type !== "task") return;
    setSubmitting(true);
    try {
      const result = await api(`/api/public/share/${token}/toggle`, {
        method: "POST",
        body: {
          checked,
          visitor_token: visitorToken,
          visitor_name: visitorName || undefined
        }
      });
      setData((prev) => ({ ...prev, item: result.task }));
      toast.success(checked ? "已勾选" : "已取消勾选");
    } catch (err) {
      toast.error(err?.message || "操作失败");
    } finally {
      setSubmitting(false);
    }
  };

  const handleComment = async (e) => {
    e.preventDefault();
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
    downloadICS(item, data.type);
    toast.success("日历文件已下载，可导入系统日历");
  };

  const handleImportToMine = async () => {
    if (!currentUser) {
      // Remember the share so we can import after login.
      try {
        window.localStorage.setItem("ss_pending_import_share", JSON.stringify({ token, type: data?.type }));
      } catch (e) {}
      setImportDialogOpen(true);
      return;
    }

    setImporting(true);
    try {
      const result = await api(`/api/public/share/${token}/import`, {
        method: "POST",
        body: { visitor_token: visitorToken }
      });
      toast.success(result.type === "task" ? "已添加到你的约定" : "已添加你的心签");
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
                      onCheckedChange={handleToggleTask}
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
                        {sub.status === "completed" ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        ) : (
                          <Circle className="w-4 h-4 text-slate-300" />
                        )}
                        <span className={`text-sm ${sub.status === "completed" ? "text-slate-400 line-through" : "text-slate-700"}`}>
                          {sub.title}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* 访客身份 */}
            <div className="bg-blue-50/50 rounded-xl p-4 border border-blue-100">
              <label className="text-xs font-medium text-blue-800 block mb-1.5">你的昵称（可选）</label>
              <Input
                value={visitorName}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="访客"
                className="h-9 bg-white border-blue-200 text-sm"
                maxLength={50}
              />
            </div>
          </CardContent>
        </Card>

        {/* 操作入口 */}
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="py-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Button
                variant="outline"
                className="justify-start gap-2 h-auto py-3 px-4 border-slate-200 hover:bg-slate-50"
                onClick={handleAddToCalendar}
              >
                <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center flex-shrink-0">
                  <CalendarPlus className="w-4 h-4 text-emerald-600" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium text-slate-800">添加到日历</p>
                  <p className="text-xs text-slate-500">下载 .ics 文件导入系统日历</p>
                </div>
              </Button>

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
                onClick={handleSubscribe}
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
            <form onSubmit={handleComment} className="space-y-3">
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

        {/* 二维码 */}
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="py-6">
            <div className="flex flex-col items-center text-center gap-3">
              <p className="text-sm font-medium text-slate-700 flex items-center gap-2">
                <Share2 className="w-4 h-4" />
                扫码查看此分享
              </p>
              <div className="p-2 bg-white rounded-xl border border-slate-200">
                <QRCodeImage value={shareUrl} size={160} alt="分享二维码" />
              </div>
              <p className="text-xs text-slate-400 break-all max-w-xs">{shareUrl}</p>
            </div>
          </CardContent>
        </Card>

        {/* 登录/导入提示 */}
        <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-base">登录/注册以保存</DialogTitle>
              <DialogDescription className="text-sm text-slate-500">
                添加至个人列表需要先登录。登录后我们会自动把这个{isTask ? "约定" : "心签"}导入你的账户。
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
      </main>
    </div>
  );
}
