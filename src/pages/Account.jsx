import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { User, Mail, Shield, LogOut, Edit2, Check, X, Bot, Upload, Camera, Coins, History, ChevronRight, Brain, AlertCircle, Globe, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { SUBSCRIPTION_PLANS } from "@/components/credits/creditConfig";
import CreditHistoryDialog from "@/components/credits/CreditHistoryDialog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { httpRequest } from "@/api/httpClient";
import Orb from "@/components/buddy/Orb";
import { PERSONAS, DEFAULT_PERSONA, BUDDIES, BUDDY_TINTS } from "@/lib/buddies";
import ProductInsights from "@/components/memory/ProductInsights";
import PersonalProfileCard from "@/components/insights/PersonalProfileCard";
import AlertChannelSettings from "@/components/account/AlertChannelSettings";
import PWAInstallGuide from "@/components/account/PWAInstallGuide";
import EnableBackgroundPush from "@/components/account/EnableBackgroundPush";
import DeleteAccountSection from "@/components/account/DeleteAccountSection";

export default function Account() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState({
    full_name: "",
    assistant_name: "小雅",
    avatar_url: "",
  });
  const [historyOpen, setHistoryOpen] = useState(false);

  // 认知洞察所需数据
  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => base44.entities.Task.list("-created_date", 300),
  });
  const { data: notes = [] } = useQuery({
    queryKey: ["notes"],
    queryFn: () => base44.entities.Note.list("-created_date", 200),
  });
  const { data: behaviors = [] } = useQuery({
    queryKey: ["behaviors"],
    queryFn: () => base44.entities.UserBehavior.list("-created_date", 500),
  });
  const { data: executions = [] } = useQuery({
    queryKey: ["task-executions"],
    queryFn: () => base44.entities.TaskExecution.list("-created_date", 100),
    initialData: [],
  });
  const { data: relationships = [] } = useQuery({
    queryKey: ["relationships-account"],
    queryFn: () => base44.entities.Relationship.list("-created_date", 50),
    initialData: [],
  });

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const currentUser = await base44.auth.me();
      setUser(currentUser);
      setFormData({
        full_name: currentUser.full_name || "",
        assistant_name: currentUser.assistant_name || "小雅",
        avatar_url: currentUser.avatar_url || "",
      });

    } catch (error) {
      console.error("Load user error:", error);
      toast.error("加载用户信息失败");
    }
    setLoading(false);
  };

  const handleSave = async () => {
    try {
      await base44.auth.updateMe({
        ...formData
      });
      
      await loadUser();
      setEditing(false);
      toast.success("个人信息更新成功");
    } catch (error) {
      console.error("Update error:", error);
      toast.error("更新失败，请重试");
    }
  };

  // 压缩头像：等比缩到最长边 512px 的 JPEG（约 50-100KB，顺便避开网关 1MB 限制）
  const compressAvatar = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const MAX = 512;
        const scale = Math.min(1, MAX / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        canvas.toBlob((blob) => {
          if (blob) resolve(new File([blob], 'avatar.jpg', { type: 'image/jpeg' }));
          else reject(new Error('图片压缩失败'));
        }, 'image/jpeg', 0.85);
      };
      img.onerror = () => reject(new Error('图片读取失败'));
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error('图片读取失败'));
    reader.readAsDataURL(file);
  });

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type and size
    if (!file.type.startsWith('image/')) {
      toast.error('请上传图片文件');
      return;
    }

    if (file.size > 10 * 1024 * 1024) { // 压缩前原图上限 10MB
      toast.error('图片大小不能超过 10MB');
      return;
    }

    const toastId = toast.loading('正在上传头像...');

    try {
      // 1. 压缩后上传到后端存储
      const compressed = await compressAvatar(file).catch(() => file);
      const result = await base44.integrations.Core.UploadFile({
        file: compressed
      });
      
      const fileUrl = result.file_url;
      
      // 2. Update local state
      setFormData(prev => ({ ...prev, avatar_url: fileUrl }));
      
      // 3. If not in editing mode, save immediately
      if (!editing) {
        await base44.auth.updateMe({
          avatar_url: fileUrl
        });
        await loadUser();
        toast.success('头像更新成功');
      } else {
        toast.success('头像已上传，请点击保存');
      }
    } catch (error) {
      console.error('Upload failed:', error);
      toast.error(error?.status === 413 ? '图片太大被网关拒绝，请压缩到 5MB 以内再试' : '头像上传失败，请重试');
    } finally {
      toast.dismiss(toastId);
    }
  };

  const handleLogout = () => {
    base44.auth.logout();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen p-6">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <User className="w-16 h-16 mx-auto mb-4 text-slate-300" />
            <h2 className="text-xl font-semibold text-slate-800 mb-2">未登录</h2>
            <p className="text-slate-600 mb-6">请先登录以访问您的账户</p>
            <Button
              onClick={() => base44.auth.redirectToLogin()}
              className="bg-[#384877] hover:bg-[#2E3A60]"
            >
              前往登录
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const getInitials = (name) => {
    if (!name || typeof name !== 'string') return "U";
    const trimmed = name.trim();
    if (!trimmed) return "U";
    const parts = (trimmed.includes(' ') ? trimmed.split(" ") : [trimmed]).filter(Boolean);
    if (!parts || parts.length === 0) return "U";
    return parts
      .map((n) => (n && n.length > 0 ? n[0] : ""))
      .filter(Boolean)
      .join("")
      .toUpperCase()
      .slice(0, 2) || "U";
  };

  const isDemo = user?.email === "demo@soulsentry.local" || String(user?.role || "").toLowerCase() === "demo";

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-4xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-stone-900 mb-2">
          我的账户
        </h1>
        <p className="text-slate-600">管理您的个人信息和账户设置</p>
      </motion.div>

      {isDemo && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-800">当前为 Demo 账户体验模式</p>
              <p className="text-xs text-amber-700 mt-1">
                你尚未登录/注册。Demo 中的数据不会保存到个人账户，退出后可能丢失。如需使用完整功能，请退出后重新登录或注册。
              </p>
              <div className="flex flex-wrap gap-2 mt-3">
                <Button
                  size="sm"
                  onClick={() => {
                    base44.auth.logout();
                    base44.auth.redirectToLogin();
                  }}
                  className="bg-amber-600 hover:bg-amber-700 text-white"
                >
                  退出并登录 / 注册
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleLogout}
                  className="border-amber-300 text-amber-700 hover:bg-amber-100"
                >
                  退出 Demo
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 用户信息卡片 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <Card className="border-stone-200/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <CardHeader className="bg-stone-50">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5 text-blue-600" />
                个人信息
              </CardTitle>
              {!editing ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditing(true)}
                  className="text-blue-600 hover:text-blue-700 hover:bg-blue-100"
                >
                  <Edit2 className="w-4 h-4 mr-1" />
                  编辑
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditing(false);
                      setFormData({ full_name: user.full_name || "" });
                    }}
                    className="text-slate-600 hover:text-slate-700 hover:bg-slate-100"
                  >
                    <X className="w-4 h-4 mr-1" />
                    取消
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSave}
                    className="bg-[#384877] hover:bg-[#2E3A60] text-white"
                  >
                    <Check className="w-4 h-4 mr-1" />
                    保存
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-6">
              {/* 头像 */}
              <div className="flex flex-col items-center gap-3">
                <div className="relative group">
                  <Avatar className="h-24 w-24 bg-[#384877] text-white text-2xl font-bold border-4 border-white shadow-sm">
                    {(editing ? formData.avatar_url : user.avatar_url) ? (
                      <img 
                        src={editing ? formData.avatar_url : user.avatar_url} 
                        alt="Avatar" 
                        className="w-full h-full object-cover" 
                      />
                    ) : (
                      <AvatarFallback className="bg-transparent">
                        {getInitials(editing ? formData.full_name : user.full_name)}
                      </AvatarFallback>
                    )}
                  </Avatar>
                  
                  {/* Upload Overlay */}
                  <label 
                    htmlFor="avatar-upload" 
                    className={`absolute inset-0 flex items-center justify-center bg-black/40 rounded-full cursor-pointer transition-opacity duration-200 ${editing ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                  >
                    <Camera className="w-8 h-8 text-white drop-shadow-md" />
                    <input 
                      id="avatar-upload" 
                      type="file" 
                      accept="image/*" 
                      className="hidden" 
                      onChange={handleAvatarUpload}
                    />
                  </label>
                </div>
                
                <Badge
                  variant="outline"
                  className={
                    user.role === "admin"
                      ? "bg-purple-50 text-purple-700 border-purple-200"
                      : "bg-blue-50 text-blue-700 border-blue-200"
                  }
                >
                  <Shield className="w-3 h-3 mr-1" />
                  {user.role === "admin" ? "管理员" : "用户"}
                </Badge>
              </div>

              {/* 信息表单 */}
              <div className="flex-1 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="full_name" className="flex items-center gap-2 text-slate-700">
                    <User className="w-4 h-4" />
                    姓名
                  </Label>
                  {editing ? (
                    <Input
                      id="full_name"
                      value={formData.full_name}
                      onChange={(e) =>
                        setFormData({ ...formData, full_name: e.target.value })
                      }
                      placeholder="输入您的姓名"
                      className="border-slate-200 focus-visible:ring-blue-500"
                    />
                  ) : (
                    <p className="text-lg font-semibold text-slate-800">
                      {user.full_name || "未设置"}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="assistant_name" className="flex items-center gap-2 text-slate-700">
                    <Bot className="w-4 h-4" />
                    助手昵称 (SoulSentry-...)
                  </Label>
                  {editing ? (
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-500">SoulSentry-</span>
                      <Input
                        id="assistant_name"
                        value={formData.assistant_name}
                        onChange={(e) =>
                          setFormData({ ...formData, assistant_name: e.target.value })
                        }
                        placeholder="小雅"
                        className="border-slate-200 focus-visible:ring-blue-500"
                      />
                    </div>
                  ) : (
                    <p className="text-lg font-semibold text-slate-800 flex items-center gap-1">
                      <span className="text-slate-400 text-base font-normal">SoulSentry-</span>
                      {user.assistant_name || "小雅"}
                    </p>
                  )}
                  <p className="text-xs text-slate-400">您可以自定义助手的名字，例如：小雅、Jarvis 等</p>
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-slate-700">
                    <Mail className="w-4 h-4" />
                    邮箱
                  </Label>
                  <p className="text-slate-600">{user.email}</p>
                  <p className="text-xs text-slate-400">邮箱地址不可修改</p>
                </div>

                <Separator />

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-slate-500 mb-1">账户创建时间</p>
                    <p className="font-medium text-slate-800">
                      {new Date(user.created_date).toLocaleDateString("zh-CN")}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500 mb-1">用户ID</p>
                    <p className="font-mono text-xs text-slate-600 truncate">
                      {user.id}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* 人格引擎 · 记忆分层（L1 搭子底座） */}
      <PersonaMemorySection />

      {/* AI 点数与订阅 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
      >
        <Card className="border-stone-200/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
          <CardHeader className="bg-amber-50">
            <CardTitle className="flex items-center gap-2">
              <Coins className="w-5 h-5 text-amber-600" />
              AI 点数与订阅
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
              <div>
                <p className="text-sm text-slate-500 mb-1">当前余额</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-slate-900">
                    {user?.ai_credits ?? 200}
                  </span>
                  <span className="text-slate-500">AI 点数</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge className={`${
                  (user?.subscription_plan || "free") === "free" 
                    ? "bg-slate-100 text-slate-600" 
                    : "bg-[#384877] text-white"
                } border-0`}>
                  {SUBSCRIPTION_PLANS[user?.subscription_plan || "free"]?.name || "免费版"}
                </Badge>
              </div>
            </div>
            <Separator className="my-4" />
            <div className="flex flex-wrap gap-3">
              <Link to={createPageUrl("Pricing")}>
                <Button size="sm" className="bg-[#384877] hover:bg-[#2E3A60] text-white">
                  <Coins className="w-4 h-4 mr-1" />
                  购买点数
                </Button>
              </Link>
              <Button size="sm" variant="outline" onClick={() => setHistoryOpen(true)} className="text-amber-700 border-amber-200 hover:bg-amber-50">
                <History className="w-4 h-4 mr-1" />
                消费明细
              </Button>
              <Link to={createPageUrl("Pricing")}>
                <Button size="sm" variant="outline" className="text-[#384877] border-[#384877]/20 hover:bg-[#384877]/5">
                  管理订阅
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <CreditHistoryDialog open={historyOpen} onOpenChange={setHistoryOpen} />

      {/* PWA 安装引导 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.17 }}
      >
        <PWAInstallGuide />
      </motion.div>

      {/* 后台推送一键开启 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.175 }}
      >
        <EnableBackgroundPush />
      </motion.div>

      {/* 预警通道设置 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.18 }}
      >
        <AlertChannelSettings user={user} />
      </motion.div>

      {/* 认知洞察 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.19 }}
      >
        <Card className="border-stone-200/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
          <CardHeader className="bg-stone-50">
            <CardTitle className="flex items-center gap-2">
              <Brain className="w-5 h-5 text-indigo-600" />
              认知洞察
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-5">
            <PersonalProfileCard />
            <ProductInsights
              tasks={tasks}
              notes={notes}
              behaviors={behaviors}
              executions={executions}
              relationships={relationships}
            />
          </CardContent>
        </Card>
      </motion.div>

      {/* 产品入口 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.195 }}
      >
        <Card className="border-stone-200/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
          <CardHeader className="bg-stone-50">
            <CardTitle className="flex items-center gap-2">
              <Globe className="w-5 h-5 text-sky-600" />
              产品入口
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 pb-2">
            {[
              { key: "oversea", label: "海外版", sub: "www.xinzhan-soulsentry.com", url: "https://www.xinzhan-soulsentry.com" },
              { key: "cn", label: "国内版", sub: "www.xinzhan-soulsentry.cn", url: "https://www.xinzhan-soulsentry.cn" },
              { key: "miniprogram", label: "小程序", sub: "微信搜索「心栈SoulSentry」", url: "" }
            ].map((p, idx) => (
              <button
                key={p.key}
                type="button"
                onClick={() => {
                  if (p.url) {
                    navigator.clipboard.writeText(p.url).then(
                      () => toast.success("链接已复制"),
                      () => toast.error("复制失败")
                    );
                  } else {
                    toast.info("微信搜索小程序「心栈SoulSentry」");
                  }
                }}
                className={`w-full flex items-center gap-3 px-2 py-3 text-left transition-colors hover:bg-slate-50 rounded-lg ${
                  idx > 0 ? "border-t border-slate-100" : ""
                }`}
              >
                <div className="w-9 h-9 rounded-xl bg-[#384877] flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-sm font-medium">{p.label.slice(0, 1)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800">{p.label}</p>
                  <p className="text-xs text-slate-400 truncate">{p.sub}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
              </button>
            ))}
          </CardContent>
        </Card>
      </motion.div>

      {/* 全设备智能协同 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.198 }}
      >
        <Card className="border-stone-200/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
          <CardHeader className="bg-stone-50">
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#384877]" />
              全设备智能协同
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-5">
            <p className="text-xs text-slate-500 mb-4">
              同一账户下，约定、心签、搭子与协同空间在 Web / 手机桌面 / 微信小程序之间实时同步，在哪都能接着推进。
            </p>
            <div className="space-y-2">
              {(() => {
                const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
                const isMobile = /Android|iPhone|iPad/i.test(ua);
                const isPWA = typeof window !== "undefined" && window.matchMedia?.("(display-mode: standalone)")?.matches;
                const devices = [
                  {
                    label: "Web 网页端",
                    sub: "www.xinzhan-soulsentry.cn",
                    active: !isMobile && !isPWA,
                    hint: "",
                  },
                  {
                    label: "手机桌面（PWA）",
                    sub: isMobile
                      ? "当前浏览器打开 → 分享/菜单 →「添加到主屏幕」，像 App 一样使用"
                      : "手机浏览器打开网站 →「添加到主屏幕」",
                    active: isPWA || (isMobile && !isPWA),
                    hint: isMobile && !isPWA ? "去添加" : "",
                  },
                  {
                    label: "微信小程序",
                    sub: "微信搜索「心栈SoulSentry」",
                    active: false,
                    hint: "",
                  },
                ];
                return devices.map((d) => (
                  <div key={d.label} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white px-3.5 py-3">
                    <div className="w-9 h-9 rounded-xl bg-[#384877] flex items-center justify-center flex-shrink-0">
                      <Globe className="w-4 h-4 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800">{d.label}</p>
                      <p className="text-xs text-slate-400 truncate">{d.sub}</p>
                    </div>
                    {d.active && (
                      <Badge className="bg-[#eef2ff] text-[#384877] border-0 text-[10px] flex-shrink-0">本设备</Badge>
                    )}
                  </div>
                ));
              })()}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* 账户操作 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <Card className="border-stone-200/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-slate-600" />
              账户操作
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <Button
                variant="outline"
                onClick={handleLogout}
                className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
              >
                <LogOut className="w-4 h-4 mr-2" />
                退出登录
              </Button>
              <p className="text-xs text-slate-500 px-2">
                退出后您将需要重新登录才能访问您的任务和数据
              </p>

              <Separator className="my-2" />

              <DeleteAccountSection user={user} />
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

// 人格引擎 · 记忆分层（L1 搭子底座）：
// 人格决定「心栈与所有搭子怎么说话」，切换后全域立即生效；
// 主档案全局共享，领域档案相互隔离——学习搭子不需要知道你几点赖床。
function PersonaMemorySection() {
  const queryClient = useQueryClient();
  const [switching, setSwitching] = useState(null);

  const { data: mine } = useQuery({
    queryKey: ["buddies", "mine"],
    queryFn: () => httpRequest("/api/buddies/mine"),
  });
  const persona = mine?.persona || DEFAULT_PERSONA;
  const profiles = mine?.buddies || {};
  const claimedBuddies = BUDDIES.filter((b) => profiles[b.id]?.status === "active");

  const switchPersona = async (key) => {
    if (switching || key === persona) return;
    setSwitching(key);
    try {
      await httpRequest("/api/buddies/persona", { method: "POST", body: { persona: key } });
      queryClient.invalidateQueries({ queryKey: ["buddies"] });
      toast.success("已切换，心栈和所有搭子现在用新方式陪你");
    } catch (e) {
      toast.error(e?.message || "切换失败，请再试一次");
    } finally {
      setSwitching(null);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
      <Card className="border-stone-200/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <CardHeader className="bg-stone-50">
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[#384877]" />
            人格 · 记忆分层
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6 space-y-6">
          {/* 人格切换 */}
          <div>
            <p className="text-sm text-slate-500 mb-3">
              心栈小助手的默认说话方式——切换后全局生效；每颗搭子还可以在自己的对话框里单独设置人格。
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {PERSONAS.map((p) => {
                const active = persona === p.key;
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => switchPersona(p.key)}
                    disabled={switching !== null}
                    className={`text-left rounded-2xl border p-4 transition-all ${
                      active
                        ? "border-[#384877] bg-[#eef2ff] ring-1 ring-[#384877]"
                        : "border-stone-200 bg-white hover:border-stone-300"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-stone-800">{p.name}</span>
                      {active && <Check className="w-4 h-4 text-[#384877]" />}
                    </div>
                    <p className="mt-1 text-xs text-stone-500">{p.desc}</p>
                    <p className="mt-2 text-[13px] leading-relaxed text-stone-600 italic">「{p.sample}」</p>
                  </button>
                );
              })}
            </div>
          </div>

          <Separator />

          {/* 记忆分层 */}
          <div>
            <p className="text-sm text-slate-500 mb-3">
              记忆分层——主档案心栈与所有搭子共享；领域档案相互隔离，只属于对应搭子。
            </p>
            <div className="space-y-3">
              <div className="rounded-2xl bg-[#f2efe9] p-4">
                <div className="text-[11px] tracking-widest text-stone-400">主档案（共享）</div>
                <p className="mt-1 text-[13px] text-stone-600">
                  全局人格偏好：{PERSONAS.find((p) => p.key === persona)?.name || "温柔陪伴型"}（每颗搭子可在空间内单独调整）
                  {mine?.id_profile ? ` · ${mine.id_profile.age || ""} · ${(mine.id_profile.likes || []).join("、")}` : " · 身份识别画像将在注册引导中完善"}
                </p>
              </div>
              {claimedBuddies.length === 0 ? (
                <p className="text-[13px] text-stone-400 px-1">
                  还没有在岗搭子。去
                  <Link to={createPageUrl("BuddyStore")} className="text-[#384877] hover:underline mx-1">
                    搭子Store
                  </Link>
                  认领一颗，它的领域档案会出现在这里。
                </p>
              ) : (
                claimedBuddies.map((b) => {
                  const tint = BUDDY_TINTS[b.id];
                  return (
                    <div key={b.id} className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-white p-4">
                      <Orb size={36} tint={tint} />
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] tracking-widest text-stone-400">领域档案（隔离） · {b.name}</div>
                        <p className="mt-0.5 text-[13px] text-stone-600 truncate">{b.memory}</p>
                      </div>
                      <Link
                        to={`${createPageUrl("BuddySpace")}?buddy=${b.id}`}
                        className="text-xs text-[#384877] hover:underline flex-shrink-0"
                      >
                        进入空间
                      </Link>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
