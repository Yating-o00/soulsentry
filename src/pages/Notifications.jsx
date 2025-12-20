import React from "react";
import NotificationList from "../components/notifications/NotificationList";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Settings } from "lucide-react";

export default function NotificationsPage() {
  return (
    <div className="min-h-screen bg-slate-50/30 p-4 md:p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">消息通知</h1>
            <p className="text-slate-500">查看所有的系统通知和提醒</p>
          </div>
          <Button variant="outline" asChild>
            <Link to={createPageUrl("NotificationSettings")}>
              <Settings className="w-4 h-4 mr-2" />
              通知设置
            </Link>
          </Button>
        </div>
        
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <NotificationList limit={50} />
        </div>
      </div>
    </div>
  );
}