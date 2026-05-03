import React from "react";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import {
  BellRing,
  CalendarPlus,
  Check,
  Trash2,
  ExternalLink,
  Clock,
  MessageSquare,
  UserPlus,
  Info,
  Sparkles,
} from "lucide-react";
import { Link } from "react-router-dom";

/**
 * 把"系统通知"的视觉换成"提醒卡片"质感：
 * - 左侧彩色色带 + 类型图标徽章
 * - 突出展示触发时间（弹窗式日程感）
 * - 一键"加入日历"按钮
 */
const TYPE_CONFIG = {
  reminder: {
    label: "提醒",
    accent: "from-orange-400 to-amber-400",
    chipBg: "bg-orange-50",
    chipText: "text-orange-600",
    icon: BellRing,
  },
  assignment: {
    label: "指派",
    accent: "from-blue-400 to-indigo-400",
    chipBg: "bg-blue-50",
    chipText: "text-blue-600",
    icon: UserPlus,
  },
  comment: {
    label: "评论",
    accent: "from-emerald-400 to-teal-400",
    chipBg: "bg-emerald-50",
    chipText: "text-emerald-600",
    icon: MessageSquare,
  },
  mention: {
    label: "提及",
    accent: "from-purple-400 to-fuchsia-400",
    chipBg: "bg-purple-50",
    chipText: "text-purple-600",
    icon: Sparkles,
  },
  system: {
    label: "系统",
    accent: "from-slate-300 to-slate-400",
    chipBg: "bg-slate-100",
    chipText: "text-slate-600",
    icon: Info,
  },
};

function buildGoogleCalendarUrl(notification) {
  const start = new Date(notification.created_date);
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  const fmt = (d) =>
    d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: notification.title || "提醒",
    details: notification.content || "",
    dates: `${fmt(start)}/${fmt(end)}`,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export default function ReminderCard({
  notification,
  onMarkRead,
  onDelete,
}) {
  const cfg = TYPE_CONFIG[notification.type] || TYPE_CONFIG.system;
  const Icon = cfg.icon;
  const date = new Date(notification.created_date);
  const isUnread = !notification.is_read;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      layout
      className={`relative overflow-hidden rounded-2xl border bg-white transition-all hover:shadow-lg hover:-translate-y-0.5 ${
        isUnread ? "border-slate-200 shadow-sm" : "border-slate-100"
      }`}
    >
      {/* 左侧色带 */}
      <div
        className={`absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b ${cfg.accent}`}
      />

      <div className="pl-5 pr-4 py-4 flex gap-3">
        {/* 图标徽章 */}
        <div className="relative flex-shrink-0">
          <div
            className={`w-11 h-11 rounded-xl ${cfg.chipBg} flex items-center justify-center`}
          >
            <Icon className={`w-5 h-5 ${cfg.chipText}`} />
          </div>
          {isUnread && (
            <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-rose-500 ring-2 ring-white" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          {/* 头部：类型 chip + 时间 */}
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${cfg.chipBg} ${cfg.chipText}`}
              >
                {cfg.label}
              </span>
              <h4
                className={`font-semibold text-sm truncate ${
                  isUnread ? "text-slate-900" : "text-slate-600"
                }`}
              >
                {notification.title}
              </h4>
            </div>
            <div className="flex items-center gap-1 text-[11px] text-slate-400 flex-shrink-0">
              <Clock className="w-3 h-3" />
              {format(date, "MM-dd HH:mm", { locale: zhCN })}
            </div>
          </div>

          {/* 内容 */}
          <p
            className={`text-xs leading-relaxed mb-3 ${
              isUnread ? "text-slate-600" : "text-slate-500"
            }`}
          >
            {notification.content}
          </p>

          {/* 操作区 */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {notification.link && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-[11px] rounded-lg border-slate-200"
                asChild
              >
                <Link to={notification.link}>
                  查看 <ExternalLink className="w-3 h-3 ml-1" />
                </Link>
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              className="h-7 text-[11px] rounded-lg border-slate-200 text-[#384877] hover:bg-[#384877]/5 hover:text-[#384877]"
              asChild
            >
              <a
                href={buildGoogleCalendarUrl(notification)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <CalendarPlus className="w-3 h-3 mr-1" />
                加入日历
              </a>
            </Button>

            {isUnread && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onMarkRead?.(notification.id)}
                className="h-7 text-[11px] rounded-lg text-slate-500 hover:text-slate-700"
              >
                <Check className="w-3 h-3 mr-1" />
                已读
              </Button>
            )}

            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete?.(notification.id)}
              className="h-7 text-[11px] rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 ml-auto"
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}