import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Smartphone,
  Monitor,
  Apple,
  Chrome,
  Share,
  Plus,
  MoreVertical,
  Download,
  CheckCircle2,
  Sparkles,
  Bell,
  Zap,
  WifiOff,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

/**
 * PWA 安装引导
 * - 自动识别当前平台（iOS / Android / Desktop）并优先展示对应步骤
 * - 已安装时显示成功状态，不再骚扰用户
 * - 支持原生 beforeinstallprompt 时提供"一键安装"按钮
 */
export default function PWAInstallGuide() {
  const [platform, setPlatform] = useState("desktop"); // ios | android | desktop
  const [isInstalled, setIsInstalled] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [activeTab, setActiveTab] = useState("desktop");

  useEffect(() => {
    // 检测平台
    const ua = navigator.userAgent || "";
    let p = "desktop";
    if (/iPhone|iPad|iPod/i.test(ua)) p = "ios";
    else if (/Android/i.test(ua)) p = "android";
    setPlatform(p);
    setActiveTab(p);

    // 检测是否已安装
    const isStandalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      window.navigator.standalone === true;
    setIsInstalled(isStandalone);

    // 监听原生安装事件（Chrome/Edge 桌面 & Android）
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handler);
    const onInstalled = () => setIsInstalled(true);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const handleNativeInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
  };

  const benefits = [
    { icon: Zap, label: "极速启动", color: "text-amber-500", bg: "bg-amber-50" },
    { icon: Bell, label: "推送提醒", color: "text-rose-500", bg: "bg-rose-50" },
    { icon: WifiOff, label: "离线可用", color: "text-emerald-500", bg: "bg-emerald-50" },
    { icon: Sparkles, label: "沉浸全屏", color: "text-indigo-500", bg: "bg-indigo-50" },
  ];

  return (
    <Card className="border-0 shadow-lg overflow-hidden">
      <CardHeader className="bg-gradient-to-r from-sky-50 to-indigo-50">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center gap-2">
            <Download className="w-5 h-5 text-sky-600" />
            一步安装桌面应用，随时开启
          </CardTitle>
          {isInstalled ? (
            <Badge className="bg-emerald-100 text-emerald-700 border-0">
              <CheckCircle2 className="w-3 h-3 mr-1" />
              已安装
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-white/60 text-sky-700 border-sky-200">
              推荐
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-6 space-y-5">
        {/* 已安装：不再显示步骤 */}
        {isInstalled ? (
          <div className="text-center py-6 px-4 bg-emerald-50/50 rounded-2xl border border-emerald-100">
            <div className="w-14 h-14 rounded-2xl bg-emerald-100 flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 className="w-7 h-7 text-emerald-600" />
            </div>
            <h4 className="font-semibold text-slate-800 mb-1">SoulSentry 已安装到您的设备</h4>
            <p className="text-sm text-slate-500">
              您正在以应用模式访问，可享受全屏、离线缓存和推送通知能力。
            </p>
          </div>
        ) : (
          <>
            {/* 收益亮点 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {benefits.map((b) => {
                const Icon = b.icon;
                return (
                  <div
                    key={b.label}
                    className={`${b.bg} rounded-xl p-3 flex items-center gap-2`}
                  >
                    <Icon className={`w-4 h-4 ${b.color} flex-shrink-0`} />
                    <span className="text-xs font-medium text-slate-700">{b.label}</span>
                  </div>
                );
              })}
            </div>

            {/* 原生一键安装（如可用） */}
            {deferredPrompt && (
              <Button
                onClick={handleNativeInstall}
                className="w-full bg-gradient-to-r from-sky-500 to-indigo-500 hover:from-sky-600 hover:to-indigo-600 text-white h-11"
              >
                <Download className="w-4 h-4 mr-2" />
                一键安装到本机
              </Button>
            )}

            {/* 平台切换 Tab */}
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl w-fit">
              {[
                { id: "ios", label: "iPhone / iPad", icon: Apple },
                { id: "android", label: "Android", icon: Smartphone },
                { id: "desktop", label: "电脑", icon: Monitor },
              ].map((tab) => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      active
                        ? "bg-white text-[#384877] shadow-sm"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* 步骤 */}
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >
                {activeTab === "ios" && <IOSSteps />}
                {activeTab === "android" && <AndroidSteps />}
                {activeTab === "desktop" && <DesktopSteps />}
              </motion.div>
            </AnimatePresence>

            <p className="text-[11px] text-slate-400 leading-relaxed">
              提示：iOS 必须使用 Safari 浏览器；Android 建议使用 Chrome。安装后图标会出现在桌面/主屏幕，点击即可像 App 一样直接打开。
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function StepItem({ index, title, children }) {
  return (
    <div className="flex gap-3">
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-[#384877] text-white text-xs font-bold flex items-center justify-center">
        {index}
      </div>
      <div className="flex-1 pt-0.5">
        <p className="text-sm font-medium text-slate-800 mb-1">{title}</p>
        <div className="text-xs text-slate-500 leading-relaxed">{children}</div>
      </div>
    </div>
  );
}

function IconChip({ icon: Icon, label }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 mx-0.5 bg-slate-100 border border-slate-200 rounded-md align-middle">
      <Icon className="w-3 h-3 text-slate-600" />
      <span className="text-[11px] font-medium text-slate-700">{label}</span>
    </span>
  );
}

function IOSSteps() {
  return (
    <div className="space-y-4 bg-slate-50/60 rounded-2xl p-4 border border-slate-100">
      <StepItem index={1} title="用 Safari 打开本网页">
        请使用系统自带的 <strong>Safari 浏览器</strong>，微信内置浏览器和其他第三方 App 都<strong>无法</strong>安装。
      </StepItem>
      <StepItem index={2} title="点击底部「分享」按钮">
        点击屏幕底部中央的分享图标
        <IconChip icon={Share} label="分享" />
        （正方形向上箭头）。
      </StepItem>
      <StepItem index={3} title="选择「添加到主屏幕」">
        在弹出菜单中向下滑动，找到
        <IconChip icon={Plus} label="添加到主屏幕" />
        并点击。
      </StepItem>
      <StepItem index={4} title="确认添加">
        右上角点击「添加」，桌面上就会出现 SoulSentry 图标，像 App 一样打开即可。
      </StepItem>
    </div>
  );
}

function AndroidSteps() {
  return (
    <div className="space-y-4 bg-slate-50/60 rounded-2xl p-4 border border-slate-100">
      <StepItem index={1} title="用 Chrome 打开本网页">
        推荐使用 <strong>Chrome 浏览器</strong>（Edge、三星浏览器等也支持）。
      </StepItem>
      <StepItem index={2} title="点击右上角「⋮」菜单">
        点击地址栏右侧的
        <IconChip icon={MoreVertical} label="更多" />
        按钮打开菜单。
      </StepItem>
      <StepItem index={3} title="选择「安装应用」或「添加到主屏幕」">
        不同版本的 Chrome 显示文案略有不同，找到
        <IconChip icon={Download} label="安装应用" />
        点击即可。
      </StepItem>
      <StepItem index={4} title="确认安装">
        弹窗中点击「安装」，主屏幕上会出现 SoulSentry 图标，可享受全屏与推送通知。
      </StepItem>
    </div>
  );
}

function DesktopSteps() {
  return (
    <div className="space-y-4 bg-slate-50/60 rounded-2xl p-4 border border-slate-100">
      <StepItem index={1} title="使用 Chrome 或 Edge 浏览器">
        在 <strong>Windows / macOS</strong> 上推荐使用
        <IconChip icon={Chrome} label="Chrome" />
        或 Microsoft Edge。
      </StepItem>
      <StepItem index={2} title="点击地址栏右侧的安装图标">
        地址栏最右侧（书签星标附近）会出现一个
        <IconChip icon={Download} label="安装" />
        图标，点击它。如果没看到，请打开浏览器菜单 → 「安装 SoulSentry…」。
      </StepItem>
      <StepItem index={3} title="确认安装到桌面">
        在弹出的对话框中点击「安装」，应用会出现在桌面/启动台/开始菜单中，可作为独立窗口运行。
      </StepItem>
      <StepItem index={4} title="享受全屏体验">
        从桌面直接打开 SoulSentry，无浏览器地址栏干扰，体验更接近原生应用。
      </StepItem>
    </div>
  );
}