import React from "react";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Plus, Trash2, Edit3 } from "lucide-react";

const diffIcons = {
  create: { icon: Plus, color: "text-emerald-600", bg: "bg-emerald-50" },
  delete: { icon: Trash2, color: "text-red-500", bg: "bg-red-50" },
  move: { icon: ArrowRight, color: "text-blue-600", bg: "bg-blue-50" },
  update: { icon: Edit3, color: "text-amber-600", bg: "bg-amber-50" },
};

export default function AutomationResultPreview({ result }) {
  if (!result) return null;

  return (
    <div className="space-y-3">
      {/* 主体预览 */}
      {result.preview && (
        <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 max-h-64 overflow-y-auto">
          <pre className="text-xs text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">
            {result.preview}
          </pre>
        </div>
      )}

      {/* 变更详情 */}
      {Array.isArray(result.diff) && result.diff.length > 0 && (
        <div>
          <div className="text-xs font-medium text-slate-500 mb-2">变更详情</div>
          <div className="space-y-1.5">
            {result.diff.map((d, i) => {
              const cfg = diffIcons[d.action] || diffIcons.update;
              const Icon = cfg.icon;
              return (
                <div key={i} className={`flex items-start gap-2 p-2 rounded-md ${cfg.bg}`}>
                  <Icon className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${cfg.color}`} />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-slate-800 truncate">{d.target}</div>
                    {d.detail && <div className="text-[11px] text-slate-500 line-clamp-2">{d.detail}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}