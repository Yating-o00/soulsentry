import { Mail, FolderTree, Globe, FileText, Calendar, StickyNote, Zap } from "lucide-react";

export const AUTOMATION_TYPES = {
  email_draft: {
    label: "邮件草稿",
    emoji: "📧",
    icon: Mail,
    color: "bg-orange-50 text-orange-600 border-orange-200",
    iconBg: "bg-orange-100 text-orange-600",
    description: "自动生成邮件草稿，用户审核后发送",
  },
  file_organize: {
    label: "文件整理",
    emoji: "📁",
    icon: FolderTree,
    color: "bg-blue-50 text-blue-600 border-blue-200",
    iconBg: "bg-blue-100 text-blue-600",
    description: "生成文件整理计划（需桌面伴侣 App 配合）",
  },
  web_research: {
    label: "网页调研",
    emoji: "🌐",
    icon: Globe,
    color: "bg-emerald-50 text-emerald-600 border-emerald-200",
    iconBg: "bg-emerald-100 text-emerald-600",
    description: "调研主题并生成结构化摘要",
  },
  office_doc: {
    label: "办公文档",
    emoji: "📊",
    icon: FileText,
    color: "bg-purple-50 text-purple-600 border-purple-200",
    iconBg: "bg-purple-100 text-purple-600",
    description: "生成 PPT/Word/Excel 文档大纲",
  },
  calendar_event: {
    label: "日历事件",
    emoji: "📅",
    icon: Calendar,
    color: "bg-indigo-50 text-indigo-600 border-indigo-200",
    iconBg: "bg-indigo-100 text-indigo-600",
    description: "自然语言转日历约定",
  },
  summary_note: {
    label: "总结心签",
    emoji: "📝",
    icon: StickyNote,
    color: "bg-amber-50 text-amber-600 border-amber-200",
    iconBg: "bg-amber-100 text-amber-600",
    description: "把零散思绪整理成心签",
  },
  none: {
    label: "未识别",
    emoji: "⚡",
    icon: Zap,
    color: "bg-slate-50 text-slate-500 border-slate-200",
    iconBg: "bg-slate-100 text-slate-500",
    description: "",
  },
};

export const QUICK_AUTOMATION_TEMPLATES = [
  { type: "email_draft", emoji: "📧", label: "写邮件", example: "给张总发一封会议跟进邮件" },
  { type: "web_research", emoji: "🌐", label: "做调研", example: "调研一下国内 AI Agent 平台的现状" },
  { type: "office_doc", emoji: "📊", label: "做PPT", example: "做一份本周工作汇报 PPT 大纲" },
  { type: "summary_note", emoji: "📝", label: "整理笔记", example: "把刚才会议要点整理成心签" },
  { type: "calendar_event", emoji: "📅", label: "加约定", example: "下周三下午两点产品评审会" },
  { type: "file_organize", emoji: "📁", label: "整理文件", example: "把下载文件夹按类型分类" },
];