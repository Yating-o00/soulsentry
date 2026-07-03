import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { ShieldCheck, ShieldAlert, Shield, TrendingDown } from "lucide-react";
import { AUTOMATION_TYPES } from "./automationConfig";

const LEVEL_STYLE = {
  high: { icon: ShieldCheck, cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  medium: { icon: Shield, cls: "bg-amber-50 text-amber-700 border-amber-200" },
  low: { icon: ShieldAlert, cls: "bg-red-50 text-red-700 border-red-200" },
};

export default function AutomationTrustStrip() {
  const { data } = useQuery({
    queryKey: ['automation-trust'],
    queryFn: async () => {
      const res = await base44.functions.invoke('getAutomationTrust', {});
      return res.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  if (!data?.types || Object.keys(data.types).length === 0) return null;

  const entries = Object.entries(data.types)
    .filter(([type]) => AUTOMATION_TYPES[type])
    .sort((a, b) => a[1].score - b[1].score);
  const lowest = entries[0];
  const topReason = data.deferral_insights?.[0];

  return (
    <div className="mt-3 pt-3 border-t border-slate-100">
      <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5 px-1">
        自动化信任度 · 基于历史执行与你的评价
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
        {entries.map(([type, t]) => {
          const cfg = AUTOMATION_TYPES[type];
          const style = LEVEL_STYLE[t.level] || LEVEL_STYLE.medium;
          const Icon = style.icon;
          return (
            <div
              key={type}
              className={`flex-shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-full border text-[11px] ${style.cls}`}
              title={`${cfg.label}：成功 ${t.completed}/${t.completed + t.failed}${t.avg_rating ? ` · 评价 ${t.avg_rating}分` : ''}`}
            >
              <Icon className="w-3 h-3" />
              {cfg.emoji} {cfg.label} {t.score}
            </div>
          );
        })}
      </div>
      {(lowest?.[1]?.level === 'low' || topReason) && (
        <div className="flex items-center gap-1.5 mt-1.5 px-1 text-[11px] text-slate-500">
          <TrendingDown className="w-3 h-3 text-red-400 flex-shrink-0" />
          <span className="truncate">
            {lowest?.[1]?.level === 'low'
              ? `「${AUTOMATION_TYPES[lowest[0]].label}」近期成功率偏低，执行前建议附上参考文件或更具体的描述`
              : `近期任务顺延最多的原因是「${topReason.label}」（${topReason.count} 次），安排自动化时可留意`}
          </span>
        </div>
      )}
    </div>
  );
}