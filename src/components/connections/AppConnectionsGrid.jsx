import React from "react";
import { Mail, CalendarDays, ListChecks, MessageCircle } from "lucide-react";

const APPS = [
  { key: "mail", name: "邮箱", desc: "读取邮件、智能建议、代写代发", icon: Mail, live: true },
  { key: "calendar", name: "日历", desc: "双向同步日程", icon: CalendarDays },
  { key: "todo", name: "待办", desc: "同步外部待办清单", icon: ListChecks },
  { key: "message", name: "消息", desc: "汇总聊天中的约定", icon: MessageCircle },
];

export default function AppConnectionsGrid({ mailConnected, active, onSelect }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {APPS.map((a) => {
        const Icon = a.icon;
        const status = a.key === "mail" ? (mailConnected ? "已连接" : "未连接") : "即将开放";
        return (
          <button
            key={a.key}
            disabled={!a.live}
            onClick={() => onSelect(a.key)}
            className={`text-left p-4 rounded-2xl border bg-white transition-all ${active === a.key ? "border-[#384877] shadow-md" : "border-slate-200 hover:border-slate-300"} disabled:opacity-60 disabled:cursor-not-allowed`}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-xl bg-[#384877]/10 flex items-center justify-center">
                <Icon className="w-5 h-5 text-[#384877]" />
              </div>
              <span className={`text-[11px] px-2 py-0.5 rounded-full ${status === "已连接" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{status}</span>
            </div>
            <p className="font-semibold text-slate-800">{a.name}</p>
            <p className="text-xs text-slate-500 mt-1">{a.desc}</p>
          </button>
        );
      })}
    </div>
  );
}