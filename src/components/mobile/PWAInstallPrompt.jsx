import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, X, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PWAInstallPrompt() {
  const [showPrompt, setShowPrompt] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // 检测是否为 iOS
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    setIsIOS(iOS);

    // 检测是否已安装
    const standalone = window.matchMedia('(display-mode: standalone)').matches 
                    || window.navigator.standalone 
                    || document.referrer.includes('android-app://');
    setIsStandalone(standalone);

    // 检查是否已经提示过
    const hasPrompted = localStorage.getItem('pwa-install-prompted');
    
    if (!standalone && !hasPrompted) {
      // Android/Chrome PWA 安装提示
      const handler = (e) => {
        e.preventDefault();
        setDeferredPrompt(e);
        
        // 延迟显示提示（让用户先体验应用）
        setTimeout(() => {
          setShowPrompt(true);
        }, 5000);
      };

      window.addEventListener('beforeinstallprompt', handler);

      // iOS 用户显示手动安装提示
      if (iOS && !standalone) {
        setTimeout(() => {
          setShowPrompt(true);
        }, 5000);
      }

      return () => window.removeEventListener('beforeinstallprompt', handler);
    }
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      localStorage.setItem('pwa-install-prompted', 'true');
    }
    
    setDeferredPrompt(null);
    setShowPrompt(false);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem('pwa-install-prompted', 'true');
  };

  if (isStandalone || !showPrompt) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        className="fixed bottom-20 md:bottom-6 left-4 right-4 md:left-auto md:right-6 md:max-w-md z-50"
      >
        <div className="bg-gradient-to-r from-[#384877] to-[#3b5aa2] rounded-2xl shadow-2xl p-5 text-white">
          <button
            onClick={handleDismiss}
            className="absolute top-3 right-3 p-1 rounded-lg hover:bg-white/20 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
              <Smartphone className="w-6 h-6" />
            </div>

            <div className="flex-1">
              <h3 className="font-bold text-lg mb-1">安装心栈应用</h3>
              <p className="text-sm text-white/90 mb-4">
                {isIOS 
                  ? '点击分享按钮，然后选择"添加到主屏幕"即可安装'
                  : '安装到您的设备，获得更好的体验和离线访问'}
              </p>

              {!isIOS && (
                <Button
                  onClick={handleInstall}
                  className="bg-white text-[#384877] hover:bg-white/90 font-semibold rounded-xl"
                  size="sm"
                >
                  <Download className="w-4 h-4 mr-2" />
                  立即安装
                </Button>
              )}

              {isIOS && (
                <div className="flex items-center gap-2 text-xs text-white/80">
                  <span>提示：</span>
                  <div className="flex items-center gap-1">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2L4 7v10l8 5 8-5V7l-8-5zm0 2.18l6 3.75v7.64l-6 3.75-6-3.75V7.93l6-3.75z"/>
                      <path d="M12 8v8m-4-4h8"/>
                    </svg>
                    <span>→ 添加到主屏幕</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}