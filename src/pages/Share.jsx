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
  return fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  }).then(async (res) => {
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) throw data || { error: "REQUEST_FAILED" };
    return data;
  });
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
      </main>
    </div>
  );
}
