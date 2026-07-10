import React from "react";
import { toast } from "sonner";
import { Bell, Clock, ArrowRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";

// 多个约定同时到点时，合并为一条聚合通知，避免连环弹窗
export function showAggregatedDueToast({ tasks, onSnoozeAll }) {
  toast.custom((t) => (
    <div className="bg-white rounded-xl shadow-2xl border-2 border-indigo-200 p-4 min-w-[300px] max-w-[380px]">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0">
          <Bell className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-slate-800 mb-1">⏰ {tasks.length} 个约定同时到点</h4>
          <ul className="text-sm text-slate-600 mb-3 space-y-1">
            {tasks.slice(0, 5).map((task) => (
              <li key={task.id} className="truncate">· {task.title}</li>
            ))}
            {tasks.length > 5 && <li className="text-slate-400">…等共 {tasks.length} 条</li>}
          </ul>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="text-xs" onClick={() => { onSnoozeAll(15); toast.dismiss(t); }}>
              <Clock className="w-3 h-3 mr-1" />全部推迟15分钟
            </Button>
            <Button size="sm" className="text-xs bg-gradient-to-r from-[#384877] to-[#3b5aa2]" onClick={() => { window.location.href = "/Tasks"; toast.dismiss(t); }}>
              前往处理<ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </div>
        </div>
        <button onClick={() => toast.dismiss(t)} className="text-slate-400 hover:text-slate-600 no-min-size">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  ), {
    duration: 20000,
    unstyled: true,
    classNames: { toast: "!bg-transparent !border-0 !shadow-none !p-0" },
  });
}