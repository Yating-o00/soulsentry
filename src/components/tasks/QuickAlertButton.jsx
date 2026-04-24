import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Send, Mail, MessageSquare, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

/**
 * 快捷发送提醒按钮 —— 支持通过邮件或企业微信群机器人推送任务摘要
 */
export default function QuickAlertButton({ task }) {
  const [open, setOpen] = useState(false);
  const [sendingChannel, setSendingChannel] = useState(null);

  const handleSend = async (channel) => {
    if (sendingChannel) return;
    setSendingChannel(channel);
    try {
      const res = await base44.functions.invoke("sendTaskAlert", {
        task_id: task.id,
        channels: [channel],
      });
      const data = res?.data || {};
      if (data.success) {
        toast.success(channel === "wework" ? "已推送至企业微信" : "邮件已发送");
        setOpen(false);
      } else {
        const errMsg = data.errors?.[channel] || data.error || "发送失败";
        toast.error(errMsg);
      }
    } catch (e) {
      toast.error(e?.response?.data?.error || e.message || "发送失败");
    } finally {
      setSendingChannel(null);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-9 w-9 p-0 rounded-lg bg-[#fef3f2] hover:bg-[#fde4e2] text-[#d5495f]"
          title="快捷发送提醒"
        >
          <Send className="w-4 h-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-2 rounded-xl">
        <div className="px-2 py-1.5">
          <p className="text-sm font-semibold text-slate-900">快捷发送提醒</p>
          <p className="text-[11px] text-slate-500">将任务摘要推送到指定渠道</p>
        </div>
        <div className="mt-1 space-y-1">
          <button
            onClick={() => handleSend("wework")}
            disabled={!!sendingChannel}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-50 transition-colors text-left disabled:opacity-50"
          >
            {sendingChannel === "wework" ? (
              <Loader2 className="w-4 h-4 text-[#384877] animate-spin" />
            ) : (
              <MessageSquare className="w-4 h-4 text-[#384877]" />
            )}
            <div className="flex-1">
              <div className="text-sm font-medium text-slate-900">企业微信</div>
              <div className="text-[11px] text-slate-500">群机器人推送</div>
            </div>
          </button>
          <button
            onClick={() => handleSend("email")}
            disabled={!!sendingChannel}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-50 transition-colors text-left disabled:opacity-50"
          >
            {sendingChannel === "email" ? (
              <Loader2 className="w-4 h-4 text-[#384877] animate-spin" />
            ) : (
              <Mail className="w-4 h-4 text-[#384877]" />
            )}
            <div className="flex-1">
              <div className="text-sm font-medium text-slate-900">邮件</div>
              <div className="text-[11px] text-slate-500">发送到你的 Gmail</div>
            </div>
          </button>
        </div>
        <div className="mt-2 pt-2 border-t border-slate-100 px-2 py-1.5">
          <p className="text-[10.5px] text-slate-400 leading-relaxed">
            在「账户 → 推送设置」中配置 Webhook 并开启自动预警。
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}