import React, { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import TrustLadderPanel from "@/components/automation/TrustLadderPanel";
import EnergyRhythm from "./EnergyRhythm";
import EveningReview from "./EveningReview";
import { useEvolutionStats } from "@/hooks/useEvolutionStats";
import { formatOffset, suggestedBufferMinutes } from "@/lib/calibration";
import { Flame, Timer, Activity, RefreshCcw, ShieldCheck, Settings2 } from "lucide-react";

function Block({ icon: Icon, title, children }) {
  return (
    <div className="rounded-2xl bg-white/80 border border-[#6B8E23]/15 p-4">
      <div className="flex items-center gap-2 mb-2.5">
        <Icon className="w-3.5 h-3.5 text-[#6B8E23]" />
        <p className="text-xs font-semibold text-slate-700">{title}</p>
      </div>
      {children}
    </div>
  );
}

// 「心栈越来越懂你」：数据底座的可见化侧栏
export default function EvolutionSidebar({ completedToday = 0, pending = 0 }) {
  const { data, isLoading } = useEvolutionStats();
  const [trustOpen, setTrustOpen] = useState(false);

  const offset = data?.averageOffset || 0;
  const buffer = suggestedBufferMinutes(offset);

  return (
    <aside className="space-y-3 rounded-3xl bg-[#f4f7ec] border border-[#6B8E23]/20 p-4">
      <div>
        <p className="text-sm font-semibold text-[#4d6619]">心栈越来越懂你</p>
        <p className="text-[11px] text-slate-500 mt-0.5">每一次如约与顺延都会改写这里</p>
      </div>

      {isLoading || !data ? (
        <p className="text-xs text-slate-400 px-1 py-6">正在读你的节奏…</p>
      ) : (
        <>
          <Block icon={Flame} title="连续如约">
            <p className="text-2xl font-bold text-[#4d6619] leading-none">
              {data.streak}
              <span className="text-xs font-normal text-slate-500 ml-1">天</span>
            </p>
            <p className="text-[11px] text-slate-500 mt-1.5">累计如约 {data.completedTotal} 件</p>
          </Block>

          <Block icon={Timer} title="时间校准">
            {data.offsetSamples < 3 ? (
              <p className="text-[11px] text-slate-500">再完成几件约定，就能算出你的时间习惯。</p>
            ) : offset > 0 ? (
              <p className="text-[11px] text-slate-600 leading-relaxed">
                你平均晚 <span className="font-semibold text-[#4d6619]">{formatOffset(offset)}</span> 完成
                → 新约定自动 +{formatOffset(buffer)} 缓冲
              </p>
            ) : (
              <p className="text-[11px] text-slate-600 leading-relaxed">
                你通常能提前 {formatOffset(offset)} 完成，心栈不再多留缓冲。
              </p>
            )}
          </Block>

          <Block icon={Activity} title="能量节律">
            <EnergyRhythm rhythm={data.rhythm} />
          </Block>

          <Block icon={RefreshCcw} title="顺延原因">
            {data.reasons.length === 0 ? (
              <p className="text-[11px] text-slate-500">还没有顺延记录。</p>
            ) : (
              <div className="space-y-1.5">
                {data.reasons.slice(0, 4).map((r) => (
                  <div key={r.key} className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-600 w-16 shrink-0">{r.label}</span>
                    <div className="flex-1 h-1.5 rounded-full bg-[#6B8E23]/10 overflow-hidden">
                      <div
                        className="h-full bg-[#6B8E23]/60"
                        style={{ width: `${(r.count / data.deferralTotal) * 100}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-slate-400">{r.count}</span>
                  </div>
                ))}
              </div>
            )}
          </Block>

          <Block icon={ShieldCheck} title="自动化信任度">
            <p className="text-[11px] text-slate-600 leading-relaxed">
              {data.trustScore}% 的自动执行已交给心栈 · 完全托管 {data.trustCounts.full_auto} 类、
              自动出草稿 {data.trustCounts.auto_draft} 类
            </p>
            <button
              type="button"
              onClick={() => setTrustOpen(true)}
              className="mt-2 inline-flex items-center gap-1 text-[11px] text-[#4d6619] hover:underline"
            >
              <Settings2 className="w-3 h-3" /> 调整信任阶梯
            </button>
          </Block>

          <EveningReview completedToday={completedToday} pending={pending} streak={data.streak} />
        </>
      )}

      <Dialog open={trustOpen} onOpenChange={setTrustOpen}>
        <DialogContent className="sm:max-w-[560px] max-h-[85vh] overflow-y-auto rounded-3xl">
          <DialogTitle className="sr-only">信任阶梯</DialogTitle>
          <TrustLadderPanel />
        </DialogContent>
      </Dialog>
    </aside>
  );
}