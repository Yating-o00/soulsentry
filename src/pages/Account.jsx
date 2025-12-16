import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { User, Mail, Shield, LogOut, Edit2, Check, X, Bot } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";

export default function Account() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState({
    full_name: "",
    assistant_name: "小雅",
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
      toast.success("✅ 个人信息更新成功");
    } catch (error) {
      console.error("Update error:", error);
      toast.error("更新失败，请重试");
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
              className="bg-gradient-to-r from-blue-600 to-blue-700"
            >
              前往登录
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const getInitials = (name) => {
    if (!name) return "U";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-4xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-[#384877] to-[#3b5aa2] bg-clip-text text-transparent mb-2">
          我的账户
        </h1>
        <p className="text-slate-600">管理您的个人信息和账户设置</p>
      </motion.div>



      {/* 用户信息卡片 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <Card className="border-0 shadow-lg">
          <CardHeader className="bg-gradient-to-r from-blue-50 to-purple-50">
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
                    className="bg-gradient-to-r from-blue-600 to-blue-700 text-white"
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
                <Avatar className="h-24 w-24 bg-gradient-to-br from-blue-500 to-purple-600 text-white text-2xl font-bold">
                  <AvatarFallback className="bg-transparent">
                    {getInitials(user.full_name)}
                  </AvatarFallback>
                </Avatar>
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

      {/* 账户操作 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <Card className="border-0 shadow-lg">
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
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}