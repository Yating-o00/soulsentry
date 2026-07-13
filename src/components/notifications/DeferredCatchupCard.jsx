import React from "react";
import { Inbox, Clock, ArrowRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DeferredCatchupCard({ tasks, total, onSnoozeAll, onDismiss }) {
  return (
    <div className="bg-white rounded-xl shadow-2xl border border-[#384877]/20 p-4 min-w-[300px] max-w-[380px]">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-[#384877] to-[#3b5aa2] flex items-center justify-center flex-shrink-0">
          <Inbox className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-slate-800 mb-1">📥 {total} 条被推迟/逾期的约定待处理</h4>
          <ul className="text-sm text-slate-600 mb-3 space-y-1">
            {tasks.map((t) => (
              <li key={t.id} className="truncate">
                · {t.title}
                {(t.snooze_count || 0) >= 3 && (
                  <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-rose-50 text-rose-600">
                    已推迟{t.snooze_count}次
                  </span>
                )}
              </li>
            ))}
            {total > tasks.length && <li className="text-slate-400">…等共 {total} 条</li>}
          </ul>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="text-xs" onClick={onSnoozeAll}>
              <Clock className="w-3 h-3 mr-1" />全部推迟1小时
            </Button>
            <Button size="sm" className="text-xs bg-gradient-to-r from-[#384877] to-[#3b5aa2]" onClick={() => { window.location.href = "/Tasks"; onDismiss(); }}>
              前往处理<ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </div>
        </div>
        <button onClick={onDismiss} className="text-slate-400 hover:text-slate-600 no-min-size">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}