import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { useAICreditGate } from "@/components/credits/useAICreditGate";

/**
 * 当 DailyPlan 缺少 focus_blocks 或 devices 时，
 * 用 original_input + key_tasks 调用 analyzeIntent 补齐时间线和设备协同，
 * 并写回数据库 + 刷新缓存。
 */
export default function EnrichPlanButton({
  dayPlan,
  planId,
  dateStr,
  needTimeline,
  needDevices,
  onEnriched, // (newPlanJson) => void  乐观更新缓存
}) {
  const [loading, setLoading] = useState(false);
  const { gate } = useAICreditGate();

  const handleClick = async () => {
    if (!planId || loading) return;
    const allowed = await gate("schedule_optimize", "补全规划展示");
    if (!allowed) return;

    setLoading(true);
    try {
      // 把现有 key_tasks 也喂给 AI 当作上下文，避免重新生成时丢失
      const existingPlan = {
        timeline: (dayPlan?.plan_json?.focus_blocks || []).map(b => ({
          time: b.time, title: b.title, description: b.description, type: b.type || 'focus', date: dateStr,
        })),
        devices: dayPlan?.plan_json?.devices || [],
        automations: (dayPlan?.plan_json?.key_tasks || []).map(t => ({
          title: t.title, desc: t.description || '', status: 'ready',
        })),
      };

      const baseInput = dayPlan?.original_input
        || (dayPlan?.plan_json?.key_tasks || []).map(t => t.title).join('；')
        || '';
      const input = `${baseInput}\n\n【系统提示】请基于以上安排生成「情境时间线」与「全设备智能协同」策略，保留已有 key_tasks，不要遗漏。`;

      const { data } = await base44.functions.invoke('analyzeIntent', {
        input,
        date: dateStr,
        existingPlan,
        mode: 'replan',
      });

      const newFocus = (data.timeline || []).map(t => ({
        time: t.time,
        title: t.title,
        description: t.description || '',
        type: t.type || 'focus',
      }));
      const newDevices = (data.devices && data.devices.length > 0)
        ? data.devices
        : (dayPlan?.plan_json?.devices || []);

      const newPlanJson = {
        ...(dayPlan?.plan_json || {}),
        focus_blocks: newFocus.length > 0 ? newFocus : (dayPlan?.plan_json?.focus_blocks || []),
        devices: newDevices,
        // 保留原有 key_tasks
        key_tasks: dayPlan?.plan_json?.key_tasks || [],
      };

      await base44.entities.DailyPlan.update(planId, { plan_json: newPlanJson });
      onEnriched?.(newPlanJson);
      toast.success("已补全时间线与设备协同", { icon: "✨" });
    } catch (err) {
      console.error("Enrich plan failed", err);
      toast.error(err?.response?.data?.error || err?.message || '补全失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  const labels = [];
  if (needTimeline) labels.push("情境时间线");
  if (needDevices) labels.push("全设备智能协同");
  if (labels.length === 0) return null;

  return (
    <div className="rounded-2xl border border-dashed border-[#384877]/25 bg-gradient-to-br from-[#384877]/[0.03] to-[#5b6dae]/[0.05] p-5 flex items-center gap-4">
      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#384877] to-[#5b6dae] flex items-center justify-center shadow-md shadow-[#384877]/20 shrink-0">
        <Sparkles className="w-5 h-5 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-800">{labels.join(" 与 ")} 暂未生成</p>
        <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
          一键基于当前规划补全展示，不会覆盖已有的自动执行清单
        </p>
      </div>
      <Button
        onClick={handleClick}
        disabled={loading}
        size="sm"
        className="rounded-xl bg-[#384877] hover:bg-[#2d3a5f] text-white text-xs h-9 px-4 shadow-sm shadow-[#384877]/20 shrink-0"
      >
        {loading ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />生成中</> : <><Sparkles className="w-3.5 h-3.5 mr-1.5" />一键补全</>}
      </Button>
    </div>
  );
}