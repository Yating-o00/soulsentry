import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, Clock, ArrowRight, Loader2, Check, Shuffle, Scissors, Layers, Star, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getConflictResolutions } from "./detectConflicts";

const STRATEGY_ICONS = {
  shift: Shuffle,
  split: Scissors,
  merge: Layers,
  priority: Star,
};

const STRATEGY_COLORS = {
  shift: "bg-blue-50 text-blue-700 border-blue-200",
  split: "bg-amber-50 text-amber-700 border-amber-200",
  merge: "bg-emerald-50 text-emerald-700 border-emerald-200",
  priority: "bg-purple-50 text-purple-700 border-purple-200",
};

export default function ConflictDialog({ open, onClose, conflicts, dateStr, allBlocks, onApplyResolution }) {
  const [resolutions, setResolutions] = useState(null);
  const [summary, setSummary] = useState("");
  const [loading, setLoading] = useState(false);
  const [appliedIndexes, setAppliedIndexes] = useState(new Set());

  useEffect(() => {
    if (open && conflicts && conflicts.length > 0 && !resolutions) {
      setLoading(true);
      getConflictResolutions(conflicts, dateStr, allBlocks)
        .then((data) => {
          setResolutions(data.resolutions || []);
          setSummary(data.summary || "");
        })
        .catch((err) => {
          console.error("Failed to get conflict resolutions", err);
          setResolutions([]);
          setSummary("AI 调配方案加载失败，请手动调整日程。");
        })
        .finally(() => setLoading(false));
    }
  }, [open, conflicts, dateStr, allBlocks, resolutions]);

  // Reset when closed
  useEffect(() => {
    if (!open) {
      setResolutions(null);
      setSummary("");
      setAppliedIndexes(new Set());
    }
  }, [open]);

  if (!open) return null;

  const handleApply = (conflictIdx, suggestion) => {
    onApplyResolution(conflictIdx, suggestion);
    setAppliedIndexes(prev => new Set([...prev, conflictIdx]));
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="bg-white rounded-3xl shadow-2xl max-w-lg w-full max-h-[85vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-6 pt-6 pb-4 border-b border-slate-100">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-400/30">
                    <AlertTriangle className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-base">日程冲突预警</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      检测到 {conflicts.length} 处时间重叠
                    </p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {/* Conflict list */}
              {conflicts.map((c, idx) => (
                <div
                  key={idx}
                  className="rounded-2xl border border-red-100 bg-red-50/50 overflow-hidden"
                >
                  <div className="px-4 py-3 flex items-center gap-3">
                    <Clock className="w-4 h-4 text-red-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-sm font-medium text-slate-800 flex-wrap">
                        <span className="truncate max-w-[140px]">{c.blockA.title}</span>
                        <span className="text-xs text-red-400 font-mono">{c.blockA.time}</span>
                        <span className="text-red-400">×</span>
                        <span className="truncate max-w-[140px]">{c.blockB.title}</span>
                        <span className="text-xs text-red-400 font-mono">{c.blockB.time}</span>
                      </div>
                      <p className="text-xs text-red-600 mt-1">
                        重叠 {c.overlapMinutes} 分钟
                      </p>
                    </div>
                  </div>

                  {/* AI suggestions for this conflict */}
                  {loading && (
                    <div className="px-4 pb-3 flex items-center gap-2 text-xs text-slate-500">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      AI 正在生成调配方案...
                    </div>
                  )}

                  {!loading && resolutions && (
                    <div className="px-4 pb-3 space-y-2">
                      {(resolutions.find(r => r.conflict_index === idx)?.suggestions || []).map((s, si) => {
                        const StrategyIcon = STRATEGY_ICONS[s.strategy] || Sparkles;
                        const colorClass = STRATEGY_COLORS[s.strategy] || "bg-slate-50 text-slate-700 border-slate-200";
                        const isApplied = appliedIndexes.has(idx);

                        return (
                          <div
                            key={si}
                            className={cn(
                              "rounded-xl border p-3 transition-all",
                              isApplied ? "bg-emerald-50 border-emerald-200" : "bg-white border-slate-100 hover:border-slate-200"
                            )}
                          >
                            <div className="flex items-start gap-2.5">
                              <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border text-xs", colorClass)}>
                                <StrategyIcon className="w-3.5 h-3.5" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border", colorClass)}>
                                    {s.strategy_label}
                                  </span>
                                </div>
                                <p className="text-xs text-slate-700 leading-relaxed">{s.description}</p>
                                {(s.new_time_a || s.new_time_b) && (
                                  <div className="flex items-center gap-2 mt-1.5 text-[11px] text-slate-500">
                                    {s.new_time_a && <span className="font-mono bg-slate-50 px-1.5 py-0.5 rounded">{s.new_time_a}</span>}
                                    {s.new_time_a && s.new_time_b && <ArrowRight className="w-3 h-3" />}
                                    {s.new_time_b && <span className="font-mono bg-slate-50 px-1.5 py-0.5 rounded">{s.new_time_b}</span>}
                                  </div>
                                )}
                              </div>
                              {!isApplied ? (
                                <Button
                                  size="sm"
                                  className="h-7 px-3 text-[11px] bg-[#384877] hover:bg-[#2d3a5f] text-white rounded-lg shrink-0"
                                  onClick={() => handleApply(idx, s)}
                                >
                                  应用
                                </Button>
                              ) : (
                                <div className="flex items-center gap-1 text-emerald-600 text-xs font-medium shrink-0">
                                  <Check className="w-3.5 h-3.5" /> 已应用
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}

              {/* AI summary */}
              {!loading && summary && (
                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-[#384877]/5 border border-[#384877]/10">
                  <Sparkles className="w-4 h-4 text-[#384877] shrink-0 mt-0.5" />
                  <p className="text-xs text-[#384877] leading-relaxed">{summary}</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between gap-3">
              <p className="text-[11px] text-slate-400">冲突处理结果将同步到心签</p>
              <Button
                onClick={onClose}
                className="bg-[#384877] hover:bg-[#2d3a5f] text-white rounded-xl h-9 px-5 text-sm"
              >
                完成
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}