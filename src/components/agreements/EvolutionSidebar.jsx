import React from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import EveningReview from "./EveningReview";
import { useEvolutionStats } from "@/hooks/useEvolutionStats";
import { BarChart3, ChevronRight } from "lucide-react";

// 约定页侧栏：只保留今日复盘，详细数据分析已并入「我的账户 · 认知洞察」
export default function EvolutionSidebar({ completedToday = 0, pending = 0 }) {
  const { data } = useEvolutionStats();

  return (
    <aside className="space-y-3 rounded-3xl bg-[#f4f7ec] border border-[#6B8E23]/20 p-4">
      <EveningReview completedToday={completedToday} pending={pending} streak={data?.streak || 0} />

      <Link
        to={createPageUrl("Account")}
        className="flex items-center gap-2 rounded-2xl bg-white/80 border border-[#6B8E23]/15 px-3.5 py-3 hover:bg-white transition-colors"
      >
        <BarChart3 className="w-3.5 h-3.5 text-[#6B8E23] flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-slate-700">心栈越来越懂你</p>
          <p className="text-[11px] text-slate-500 mt-0.5">节律、时间校准与信任度已移至认知洞察</p>
        </div>
        <ChevronRight className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
      </Link>
    </aside>
  );
}