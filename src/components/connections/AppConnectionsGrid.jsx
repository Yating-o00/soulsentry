import React from "react";
import { Mail, CalendarDays, ListChecks, MapPin, Users, HeartPulse, Music, Image } from "lucide-react";

const APPS = [
  { key: "mail", name: "邮箱", desc: "读取邮件、智能建议、代写代发", icon: Mail },
  { key: "calendar", name: "日历", desc: "约定同步到日历并提醒", icon: CalendarDays },
  { key: "todo", name: "待办", desc: "外部待办并入约定守护", icon: ListChecks },
  { key: "location", name: "位置", desc: "地点识别与围栏提醒", icon: MapPin },
  { key: "contacts", name: "通讯录", desc: "理解你的社交关系", icon: Users, soon: true },
  { key: "health", name: "健康", desc: "运动数据与建议", icon: HeartPulse, soon: true },
  { key: "music", name: "音乐", desc: "为约定唤起音乐", icon: Music, soon: true },
  { key: "photos", name: "照片", desc: "嵌入重要瞬间", icon: Image, soon: true },
];

export default function AppConnectionsGrid({ mailConnected, active, onSelect }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {APPS.map((a) => {
        const Icon = a.icon;
        const status = a.soon ? "即将开放" : a.key === "mail" ? (mailConnected ? "已连接" : "未连接") : "可用";
        const good = status === "已连接" || status === "可用";
        return (
          <button
            key={a.key}
            onClick={() => onSelect(a.key)}
            className={`text-left p-4 rounded-2xl border bg-white transition-all ${active === a.key ? "border-[#384877] shadow-md" : "border-slate-200 hover:border-slate-300"} ${a.soon ? "opacity-70" : ""}`}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-xl bg-[#384877]/10 flex items-center justify-center">
                <Icon className="w-5 h-5 text-[#384877]" />
              </div>
              <span className={`text-[11px] px-2 py-0.5 rounded-full ${good ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{status}</span>
            </div>
            <p className="font-semibold text-slate-800">{a.name}</p>
            <p className="text-xs text-slate-500 mt-1">{a.desc}</p>
          </button>
        );
      })}
    </div>
  );
}