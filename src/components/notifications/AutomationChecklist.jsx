import React from "react";
import { Zap, Activity, Play, Eye } from "lucide-react";

const STATUS_META = {
  ACTIVE:     { icon: Activity, color: "text-emerald-600 bg-emerald-50 border-emerald-200", label: "运行中" },
  READY:      { icon: Play,     color: "text-indigo-600 bg-indigo-50 border-indigo-200",   label: "待就绪" },
  MONITORING: { icon: Eye,      color: "text-amber-600 bg-amber-50 border-amber-200",     label: "监控中" },
};

/**
 * 自动执行清单 —— 展示 AI 解析后生成的自动化动作项。
 * 挂在「执行链路」卡片下方，与现实事项链路互为补充。
 */
export default function AutomationChecklist({ items = [] }) {
  if (!items || items.length === 0) return null;

  return (
    <div className="mt-2 p-2.5 rounded-lg bg-gradient-to-br from-indigo-50/40 to-slate-50 border border-indigo-100/70">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-indigo-500" />
          <span className="text-xs font-medium text-slate-700">自动执行清单</span>
          <span className="text-[10px] text-slate-400">· AI 派发</span>
        </div>
        <span className="text-[11px] text-slate-400">{items.length} 项</span>
      </div>
      <ul className="space-y-1.5">
        {items.map((it, i) => {
          const meta = STATUS_META[it.status] || STATUS_META.READY;
          const Icon = meta.icon;
          return (
            <li key={i} className="flex items-start gap-2">
              <div className={`flex-shrink-0 mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center ${meta.color}`}>
                <Icon className="w-2.5 h-2.5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-[13px] font-medium text-slate-800 leading-snug truncate">
                    {it.title}
                  </span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${meta.color}`}>
                    {meta.label}
                  </span>
                </div>
                {it.desc && (
                  <p className="text-[11px] text-slate-500 leading-snug mt-0.5 line-clamp-2">
                    {it.desc}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}