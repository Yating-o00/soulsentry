// 统一的产品命名、图标、配色——唯一事实源
// 所有模块（执行链路/任务/心签/通知）共享这些常量，确保一致性
import {
  Sparkles,
  Clock,
  Zap,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Handshake,
  ListChecks,
  StickyNote,
  LayoutDashboard,
  Calendar,
  CalendarDays,
  CalendarRange,
  Bell,
} from "lucide-react";

// 内容类别：约定（promise）/ 任务（task）/ 心签（note）
export const CATEGORY = {
  promise: {
    key: "promise",
    label: "约定",
    emoji: "🤝",
    Icon: Handshake,
    color: "bg-purple-50 text-purple-600 border-purple-200",
    accent: "#7c3aed",
  },
  task: {
    key: "task",
    label: "任务",
    emoji: "⚡",
    Icon: ListChecks,
    color: "bg-blue-50 text-blue-600 border-blue-200",
    accent: "#384877",
  },
  note: {
    key: "note",
    label: "心签",
    emoji: "📝",
    Icon: StickyNote,
    color: "bg-emerald-50 text-emerald-600 border-emerald-200",
    accent: "#059669",
  },
};

// 执行状态：统一的状态词典
export const EXEC_STATUS = {
  parsing:         { label: "AI规划中",  color: "bg-indigo-50 text-indigo-600 border-indigo-200", Icon: Sparkles,       animate: true },
  pending:         { label: "待执行",    color: "bg-slate-50 text-slate-600 border-slate-200",    Icon: Clock },
  executing:       { label: "执行中",    color: "bg-indigo-50 text-indigo-600 border-indigo-200", Icon: Zap,            animate: true },
  completed:       { label: "已完成",    color: "bg-emerald-50 text-emerald-600 border-emerald-200", Icon: CheckCircle2 },
  failed:          { label: "执行失败",  color: "bg-red-50 text-red-600 border-red-200",          Icon: XCircle },
  cancelled:       { label: "已取消",    color: "bg-slate-50 text-slate-400 border-slate-200",    Icon: XCircle },
  waiting_confirm: { label: "待确认",    color: "bg-amber-50 text-amber-600 border-amber-200",    Icon: AlertTriangle },
};

// 输入来源：统一入口词典
export const SOURCE = {
  welcome:        { label: "欢迎页",   emoji: "👋", Icon: LayoutDashboard, color: "purple" },
  dashboard:      { label: "智能日程", emoji: "📋", Icon: LayoutDashboard, color: "blue" },
  task:           { label: "约定页",   emoji: "🤝", Icon: Handshake,       color: "indigo" },
  note:           { label: "心签页",   emoji: "📝", Icon: StickyNote,      color: "emerald" },
  notification:   { label: "通知中心", emoji: "🔔", Icon: Bell,            color: "amber" },
  calendar_day:   { label: "日规划",   emoji: "📅", Icon: Calendar,        color: "blue" },
  calendar_week:  { label: "周规划",   emoji: "🗓️", Icon: CalendarDays,    color: "teal" },
  calendar_month: { label: "月规划",   emoji: "📆", Icon: CalendarRange,   color: "violet" },
};

export const getCategoryMeta = (key) => CATEGORY[key] || CATEGORY.task;
export const getStatusMeta = (key) => EXEC_STATUS[key] || EXEC_STATUS.pending;
export const getSourceMeta = (key) => (key ? SOURCE[key] || null : null);