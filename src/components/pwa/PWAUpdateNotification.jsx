import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PWAUpdateNotification() {
  const [showUpdate, setShowUpdate] = useState(false);
  const [registration, setRegistration] = useState(null);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/service-worker.js')
        .then((reg) => {
          setRegistration(reg);

          reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                setShowUpdate(true);
              }
            });
          });
        })
        .catch((error) => {
          console.error('Service Worker registration failed:', error);
        });
    }
  }, []);

  const handleUpdate = () => {
    if (registration?.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      window.location.reload();
    }
  };

  return (
    <AnimatePresence>
      {showUpdate && (
        <motion.div
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -100, opacity: 0 }}
          className="fixed top-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-50"
        >
          <div className="bg-gradient-to-r from-[#384877] to-[#3b5aa2] text-white rounded-2xl shadow-2xl p-4">
            <div className="flex items-center gap-3">
              <RefreshCw className="w-5 h-5 flex-shrink-0" />
              <div className="flex-1">
                <h3 className="font-semibold mb-1">有新版本可用</h3>
                <p className="text-sm text-blue-100">点击更新以获取最新功能</p>
              </div>
              <Button
                onClick={handleUpdate}
                size="sm"
                className="bg-white text-[#384877] hover:bg-blue-50"
              >
                更新
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}