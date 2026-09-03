import React from "react";
import EveningReview from "./EveningReview";
import { useEvolutionStats } from "@/hooks/useEvolutionStats";

// 约定页侧栏：只保留今日复盘，详细数据分析已并入「我的账户 · 认知洞察」
export default function EvolutionSidebar({ completedToday = 0, pending = 0 }) {
  const { data } = useEvolutionStats();

  return (
    <aside className="rounded-3xl bg-[#f2f5fb] border border-[#384877]/20 p-4">
      <EveningReview completedToday={completedToday} pending={pending} streak={data?.streak || 0} />
    </aside>
  );
}