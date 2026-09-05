import React from "react";
import { motion } from "framer-motion";
import { CalendarClock, Clock, StickyNote } from "lucide-react";
import { format, parseISO, isToday } from "date-fns";

export default function TodayDueList({ tasks = [], notes = [], onTaskClick }) {
  const dueTasks = tasks
    .filter((t) => t.reminder_time && isToday(parseISO(t.reminder_time)) && t.status !== 'completed' && t.status !== 'cancelled' && !t.deleted_at)
    .sort((a, b) => new Date(a.reminder_time) - new Date(b.reminder_time));

  const dueNotes = notes.filter((n) => !n.deleted_at && n.created_date && isToday(parseISO(n.created_date)));

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-3xl border border-slate-200/80 shadow-sm p-5 md:p-6"
    >
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-9 h-9 rounded-2xl bg-[#384877]/10 flex items-center justify-center">
          <CalendarClock className="w-4.5 h-4.5 text-[#384877]" />
        </div>
        <div>
          <h3 className="font-semibold text-slate-800">今日到期</h3>
          <p className="text-xs text-slate-400">今天需要兑现的约定与心签</p>
        </div>
        <span className="ml-auto text-sm font-semibold text-slate-500 tabular-nums">
          {dueTasks.length + dueNotes.length}
        </span>
      </div>

      {dueTasks.length === 0 && dueNotes.length === 0 ? (
        <p className="text-sm text-slate-400 py-4 text-center">今天没有到期的约定，安心一点</p>
      ) : (
        <div className="space-y-2">
          {dueTasks.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onTaskClick?.(t.id)}
              className="w-full text-left flex items-center gap-3 p-3 rounded-2xl border border-slate-100 hover:border-slate-300 hover:shadow-sm transition-all"
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${
                t.priority === 'urgent' || t.priority === 'high' ? 'bg-rose-500' : t.priority === 'medium' ? 'bg-amber-500' : 'bg-emerald-500'
              }`} />
              <span className="flex-1 min-w-0 truncate text-sm text-slate-800">{t.title}</span>
              <span className="text-xs text-slate-400 flex items-center gap-1 shrink-0">
                <Clock className="w-3 h-3" />
                {format(parseISO(t.reminder_time), "HH:mm")}
              </span>
            </button>
          ))}
          {dueNotes.map((n) => (
            <div
              key={n.id}
              className="flex items-center gap-3 p-3 rounded-2xl border border-slate-100 bg-slate-50/60"
            >
              <StickyNote className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="flex-1 min-w-0 truncate text-sm text-slate-600">
                {(n.plain_text || n.content || '').replace(/<[^>]+>/g, '').slice(0, 60) || '心签'}
              </span>
              <span className="text-xs text-slate-400 shrink-0">今日</span>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}