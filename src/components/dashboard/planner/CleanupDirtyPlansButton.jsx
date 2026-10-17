import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, Sparkles, AlertTriangle } from "lucide-react";
import { format, addDays, parseISO } from "date-fns";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from "@/components/ui/dialog";
import { detectSpanDaysFromInput } from "@/components/utils/inferBlockDate";

/**
 * 解析 title 里的 "DayN" 前缀（1~N）。找不到返回 null。
 */
function parseDayNum(title) {
  if (!title) return null;
  const s = String(title);
  let m = s.match(/Day\s*(\d+)/i);
  if (m) return parseInt(m[1], 10);
  m = s.match(/第\s*(\d+)\s*[天日]/);
  if (m) return parseInt(m[1], 10);
  const map = { '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7 };
  m = s.match(/第\s*([一二两三四五六七])\s*[天日]/);
  if (m && map[m[1]]) return map[m[1]];
  return null;
}

function stripDayPrefix(title) {
  if (!title) return "";
  return String(title)
    .replace(/^\s*Day\s*\d+\s*[:：追加补做]*\s*/i, "")
    .replace(/^\s*第\s*[一二两三四五六七\d]+\s*[天日]\s*[:：追加补做]*\s*/, "")
    .trim();
}

function normKey(t, ti) {
  return `${String(ti || "").trim()}|${stripDayPrefix(t).toLowerCase().replace(/\s+/g, "")}`;
}

/**
 * 清理与当前 plan 同源的脏数据：
 * - 仅当 dayPlan.original_input 含"N天/一周"工期时显示按钮
 * - baseDate = 最早同源 plan_date
 * - 收集所有同源 plan 的 focus_blocks（去重）
 * - 按每个 block 标题里的 DayN 前缀重新归位到 baseDate+(N-1)
 * - 删除超出 [baseDate, baseDate+spanDays-1] 的同源 plan
 * - 写回 baseDate ~ baseDate+spanDays-1 各天的 focus_blocks
 */
export default function CleanupDirtyPlansButton({ dayPlan, selectedDateStr }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [preview, setPreview] = useState(null);

  const spanDays = useMemo(() => {
    const firstLine = String(dayPlan?.original_input || "").split("\n")[0].trim();
    return detectSpanDaysFromInput(firstLine);
  }, [dayPlan]);

  // 只对"N天/一周"型规划提供清理入口
  if (!dayPlan?.original_input || spanDays < 2) return null;

  const handlePreview = async () => {
    setRunning(true);
    try {
      const firstLine = String(dayPlan.original_input).split("\n")[0].trim();
      // 拉取最近 60 条 DailyPlan，找出 first line 完全相同的同源记录
      const all = await base44.entities.DailyPlan.list("-plan_date", 60);
      const sameSource = (all || []).filter(p => {
        if (!p?.original_input) return false;
        const f = String(p.original_input).split("\n")[0].trim();
        return f === firstLine;
      });
      if (sameSource.length === 0) {
        toast.info("未找到同源规划");
        setRunning(false);
        return;
      }
      // baseDate = 最早 plan_date
      const sorted = [...sameSource].sort((a, b) => a.plan_date.localeCompare(b.plan_date));
      const baseDateStr = sorted[0].plan_date;
      const baseDate = parseISO(baseDateStr);
      const keepDates = new Set();
      for (let i = 0; i < spanDays; i++) {
        keepDates.add(format(addDays(baseDate, i), "yyyy-MM-dd"));
      }

      // 汇总所有 block，按"清洗后标题+时间"去重
      const seen = new Map();
      for (const p of sameSource) {
        const blocks = p?.plan_json?.focus_blocks || [];
        for (const b of blocks) {
          if (!b || !b.title) continue;
          const k = normKey(b.title, b.time);
          if (!seen.has(k)) seen.set(k, { ...b });
        }
      }

      // 按 DayN 归位：DayN → baseDate+(N-1)；找不到 DayN 的留在 baseDate
      const buckets = {};
      keepDates.forEach(d => { buckets[d] = []; });
      for (const b of seen.values()) {
        const n = parseDayNum(b.title);
        const idx = (n && n >= 1 && n <= spanDays) ? (n - 1) : 0;
        const targetDate = format(addDays(baseDate, idx), "yyyy-MM-dd");
        const cleanTitle = `Day${idx + 1}: ${stripDayPrefix(b.title) || "未命名"}`;
        buckets[targetDate].push({
          time: b.time || "09:00",
          title: cleanTitle,
          description: b.description || "",
          type: b.type || "focus",
          date: targetDate,
        });
      }
      // 每个桶按时间排序
      Object.keys(buckets).forEach(d => {
        buckets[d].sort((a, b) => String(a.time).localeCompare(String(b.time)));
      });

      const toDelete = sameSource.filter(p => !keepDates.has(p.plan_date));
      const toUpdate = sameSource.filter(p => keepDates.has(p.plan_date));

      setPreview({
        baseDateStr,
        spanDays,
        keepDates: Array.from(keepDates).sort(),
        buckets,
        toDelete, // 整条删
        toUpdate, // 只替 focus_blocks
        sameSource,
      });
      setOpen(true);
    } catch (e) {
      console.error(e);
      toast.error("分析失败：" + (e?.message || ""));
    } finally {
      setRunning(false);
    }
  };

  const handleConfirm = async () => {
    if (!preview) return;
    setRunning(true);
    try {
      // 删除超期同源记录
      for (const p of preview.toDelete) {
        await base44.entities.DailyPlan.delete(p.id).catch(e => console.warn("delete fail", e));
      }
      // 更新保留日：替换 focus_blocks（保留 key_tasks/devices）
      for (const p of preview.toUpdate) {
        const blocks = preview.buckets[p.plan_date] || [];
        const newPlanJson = {
          ...(p.plan_json || {}),
          focus_blocks: blocks,
        };
        await base44.entities.DailyPlan.update(p.id, { plan_json: newPlanJson })
          .catch(e => console.warn("update fail", e));
      }
      // 缺失的保留日（同源里没有该天的记录）→ 新建
      const existingDates = new Set(preview.toUpdate.map(p => p.plan_date));
      for (const d of preview.keepDates) {
        if (existingDates.has(d)) continue;
        const blocks = preview.buckets[d] || [];
        if (blocks.length === 0) continue;
        await base44.entities.DailyPlan.create({
          plan_date: d,
          original_input: dayPlan.original_input,
          theme: dayPlan.theme || "",
          summary: "",
          plan_json: { key_tasks: [], focus_blocks: blocks, devices: [] },
          is_active: true,
        }).catch(e => console.warn("create fail", e));
      }

      // 失效所有相关日期查询
      preview.sameSource.forEach(p =>
        queryClient.invalidateQueries({ queryKey: ['dailyPlan', p.plan_date] })
      );
      preview.keepDates.forEach(d =>
        queryClient.invalidateQueries({ queryKey: ['dailyPlan', d] })
      );
      queryClient.invalidateQueries({ queryKey: ['dailyPlanWindow'] });
      toast.success(`已清理：删除 ${preview.toDelete.length} 条多余记录，重新归位 ${preview.keepDates.length} 天的内容`);
      setOpen(false);
      setPreview(null);
    } catch (e) {
      console.error(e);
      toast.error("清理失败：" + (e?.message || ""));
    } finally {
      setRunning(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={handlePreview}
        disabled={running}
        className="rounded-xl text-xs gap-1.5 border-amber-200 text-amber-700 hover:bg-amber-50"
        title="清理重复/错位的多日规划数据"
      >
        {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
        清理重复内容
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              清理同源多日规划
            </DialogTitle>
            <DialogDescription>
              将 <strong>{spanDays}</strong> 天工期重新归位，删除超出范围的多余记录。此操作不可撤销。
            </DialogDescription>
          </DialogHeader>

          {preview && (
            <div className="space-y-4 text-sm">
              <div className="rounded-xl border border-slate-200 p-3 bg-slate-50/50">
                <div className="text-xs text-slate-500 mb-1">规划首行</div>
                <div className="text-slate-800">{String(dayPlan.original_input).split("\n")[0]}</div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
                  <div className="text-xs text-emerald-700 font-medium mb-1">保留并整理</div>
                  <div className="text-emerald-900 font-semibold">
                    {preview.keepDates.length} 天
                  </div>
                  <div className="text-[11px] text-emerald-700/80 mt-1">
                    {preview.keepDates.join("、")}
                  </div>
                </div>
                <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-3">
                  <div className="text-xs text-rose-700 font-medium mb-1">删除多余</div>
                  <div className="text-rose-900 font-semibold">
                    {preview.toDelete.length} 条记录
                  </div>
                  <div className="text-[11px] text-rose-700/80 mt-1 line-clamp-2">
                    {preview.toDelete.map(p => p.plan_date).join("、") || "无"}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 p-3">
                <div className="text-xs text-slate-500 font-medium mb-2">归位后的时间线预览</div>
                <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                  {preview.keepDates.map((d, idx) => {
                    const blocks = preview.buckets[d] || [];
                    return (
                      <div key={d}>
                        <div className="text-[11px] text-slate-400 font-mono mb-1">
                          Day{idx + 1} · {d} <span className="text-slate-300">({blocks.length} 项)</span>
                        </div>
                        {blocks.length === 0 ? (
                          <div className="text-[11px] text-slate-300 italic pl-2">（无内容）</div>
                        ) : (
                          <ul className="pl-2 space-y-0.5">
                            {blocks.map((b, i) => (
                              <li key={i} className="text-[12px] text-slate-700">
                                <span className="font-mono text-slate-400">{b.time}</span>
                                {' '}
                                {b.title}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={running}>
              取消
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={running || !preview}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {running ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />执行中…</> : "确认清理"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}