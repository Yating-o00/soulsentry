import React from "react";
import { Calendar, Users, MapPin, Bell, Check } from "lucide-react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";

// 日历约定结果视图：日期块 + 详情 + 自动执行项
export default function CalendarResultView({ data, preview }) {
  const title = data?.title || data?.summary || "约定";
  const startStr = data?.start_time || data?.reminder_time;
  const endStr = data?.end_time;
  const location = data?.location;
  const participants = Array.isArray(data?.participants) ? data.participants : [];
  const reminders = Array.isArray(data?.reminders) ? data.reminders : [];
  const detail = data?.description || data?.detail || "";

  let day = null, month = null, timeRange = null;
  if (startStr) {
    try {
      const d = new Date(startStr);
      day = format(d, "d");
      month = format(d, "M月", { locale: zhCN });
      const start = format(d, "HH:mm");
      const end = endStr ? format(new Date(endStr), "HH:mm") : null;
      timeRange = end ? `${start} - ${end}` : start;
    } catch (e) { /* ignore */ }
  }

  return (
    <div className="space-y-2.5">
      <div className="rounded-xl bg-white border border-slate-200 p-3">
        {day && (
          <div className="flex items-center gap-3 mb-2.5">
            <div className="text-center px-3 py-1.5 rounded-xl bg-[#384877]/8 min-w-[52px]">
              <div className="text-[20px] font-bold text-[#384877] leading-none">{day}</div>
              <div className="text-[10px] text-[#384877]/70 mt-0.5">{month}</div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13.5px] font-bold text-slate-800 truncate">{title}</div>
              {timeRange && <div className="text-[11.5px] text-slate-500 mt-0.5">{timeRange}</div>}
            </div>
          </div>
        )}
        {!day && <div className="text-[13.5px] font-bold text-slate-800 mb-2">{title}</div>}

        {location && (
          <div className="flex items-center gap-1.5 text-[11.5px] text-slate-600 mb-1.5">
            <MapPin className="w-3 h-3 text-slate-400" />
            {location}
          </div>
        )}

        {participants.length > 0 && (
          <div className="flex items-center gap-1.5 mb-1.5">
            <Users className="w-3 h-3 text-slate-400" />
            <div className="flex gap-1">
              {participants.slice(0, 5).map((p, i) => (
                <div key={i} className="w-6 h-6 rounded-full bg-gradient-to-br from-[#384877] to-[#3b5aa2] text-white text-[10px] font-semibold flex items-center justify-center">
                  {String(p).charAt(0)}
                </div>
              ))}
              {participants.length > 5 && (
                <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-500 text-[10px] font-semibold flex items-center justify-center">
                  +{participants.length - 5}
                </div>
              )}
            </div>
          </div>
        )}

        {detail && (
          <div className="text-[11.5px] text-slate-600 leading-relaxed mt-2 pt-2 border-t border-slate-100 whitespace-pre-wrap line-clamp-4">
            {detail}
          </div>
        )}

        {!detail && preview && !day && (
          <div className="text-[11.5px] text-slate-600 leading-relaxed mt-1 whitespace-pre-wrap line-clamp-4">
            {preview}
          </div>
        )}
      </div>

      {/* 已完成的自动操作 */}
      {(reminders.length > 0 || data?.synced_to_calendar || data?.invitation_sent) && (
        <div className="rounded-xl bg-emerald-50/50 border border-emerald-200 p-3">
          <div className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wider mb-1.5">AI 已完成</div>
          <div className="space-y-1">
            {data?.synced_to_calendar && (
              <Row icon={Calendar} text="日历已创建" sub="同步到 Google Calendar" />
            )}
            {data?.invitation_sent && (
              <Row icon={Users} text="邀请已发送" sub={`通知 ${participants.length || ""} 位参会人`} />
            )}
            {reminders.length > 0 && (
              <Row icon={Bell} text="提醒已设置" sub={reminders.join(" · ")} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ icon: Icon, text, sub }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-5 h-5 rounded bg-emerald-100 text-emerald-600 flex items-center justify-center flex-shrink-0">
        <Check className="w-2.5 h-2.5" />
      </div>
      <Icon className="w-3 h-3 text-emerald-600 flex-shrink-0" />
      <span className="text-[11.5px] font-medium text-slate-700">{text}</span>
      {sub && <span className="text-[10.5px] text-slate-500 truncate">· {sub}</span>}
    </div>
  );
}