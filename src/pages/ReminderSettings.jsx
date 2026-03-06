import React, { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bell, Settings, Zap } from "lucide-react";
import { motion } from "framer-motion";
import PushNotificationSetup from "@/components/notifications/PushNotificationSetup";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";

export default function ReminderSettings() {
  return (
    <div className="min-h-screen bg-slate-50/30 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col md:flex-row md:items-center md:justify-between gap-3"
        >
          <div>
            <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-[#384877] to-[#3b5aa2] bg-clip-text text-transparent mb-1">
              提醒设置
            </h1>
            <p className="text-slate-500 text-sm md:text-base">
              管理推送通知，确保不错过任何重要任务
            </p>
          </div>
          <Button variant="outline" asChild className="w-fit">
            <Link to={createPageUrl("NotificationSettings")}>
              <Settings className="w-4 h-4 mr-2" />
              高级通知规则
            </Link>
          </Button>
        </motion.div>

        <PushNotificationSetup />
      </div>
    </div>
  );
}