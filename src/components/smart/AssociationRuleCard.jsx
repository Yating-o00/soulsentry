import React from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Link2, ArrowRight, MapPin, Sparkles, TrendingUp, CheckCircle2 } from "lucide-react";

const PRIORITY_COLOR = {
  urgent: "bg-red-50 text-red-600 border-red-100",
  high: "bg-orange-50 text-orange-600 border-orange-100",
  medium: "bg-blue-50 text-[#384877] border-blue-100",
  low: "bg-slate-50 text-slate-500 border-slate-100"
};

/**
 * 关联规则推荐卡片
 * - sequential: 基于"完成A后通常处理B"的序贯规则
 * - location:   当前地点的历史高频操作（决策前置）
 */
export default function AssociationRuleCard({ sequential, location }) {
  if (!sequential && !location) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-50">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-50 to-purple-50 flex items-center justify-center">
            <Link2 className="w-4 h-4 text-indigo-500" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-slate-800">关联规则推荐</h4>
            <p className="text-xs text-slate-400">从你的历史中学到的隐藏逻辑</p>
          </div>
        </div>
        <span className="text-[10px] font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
          决策前置
        </span>
      </div>

      <div className="p-5 space-y-5">
        {/* 序贯规则 */}
        {sequential && (
          <section>
            <div className="flex items-center gap-2 mb-3 text-xs text-slate-500">
              <TrendingUp className="w-3.5 h-3.5 text-indigo-400" />
              <span>完成 <CheckCircle2 className="inline w-3 h-3 text-emerald-500 mx-0.5" /> 「{sequential.trigger_task.title}」后，你通常会接着处理…</span>
            </div>

            <div className="space-y-2.5">
              {sequential.suggestions.map((s, idx) => (
                <div key={idx} className="bg-slate-50/60 rounded-xl p-3 border border-slate-100">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <span className="font-medium text-slate-700">{s.from_label}</span>
                      <ArrowRight className="w-3 h-3 text-slate-400" />
                      <span className="font-medium text-indigo-600">{s.to_label}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-slate-400">
                      <span>置信度 <span className="font-semibold text-indigo-500">{s.confidence}%</span></span>
                      <span>·</span>
                      <span>{s.support} 次共现</span>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    {s.tasks.map((t) => (
                      <Link
                        key={t.id}
                        to={createPageUrl(`Tasks?taskId=${t.id}`)}
                        className="flex items-center justify-between gap-2 px-3 py-2 bg-white rounded-lg border border-slate-100 hover:border-indigo-200 hover:shadow-sm transition-all group"
                      >
                        <span className="text-sm text-slate-700 truncate group-hover:text-indigo-600">{t.title}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border flex-shrink-0 ${PRIORITY_COLOR[t.priority] || PRIORITY_COLOR.medium}`}>
                          {t.priority || 'medium'}
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 地点情境推荐 */}
        {location && (
          <section>
            <div className="flex items-center gap-2 mb-3 text-xs text-slate-500">
              <MapPin className="w-3.5 h-3.5 text-emerald-500" />
              <span>
                你在 <span className="font-medium text-slate-700">{location.icon} {location.location_name}</span>（约 {location.distance}m）
                附近通常会做：
              </span>
            </div>

            {/* 历史高频类别 */}
            <div className="flex flex-wrap gap-1.5 mb-3">
              {location.top_categories.map((c) => (
                <span key={c.category} className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-full text-[11px]">
                  <Sparkles className="w-2.5 h-2.5" />
                  {c.label}
                  <span className="text-emerald-500/70">×{c.count}</span>
                </span>
              ))}
              {location.top_titles.slice(0, 2).map((t, i) => (
                <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-50 text-slate-600 border border-slate-100 rounded-full text-[11px]">
                  常做「{t.title.length > 12 ? t.title.slice(0, 12) + '…' : t.title}」
                </span>
              ))}
            </div>

            {/* 当下可行动的候选任务 */}
            {location.suggested_tasks.length > 0 ? (
              <div className="space-y-1.5">
                <p className="text-[11px] text-slate-400 mb-1">现在就能处理：</p>
                {location.suggested_tasks.map((t) => (
                  <Link
                    key={t.id}
                    to={createPageUrl(`Tasks?taskId=${t.id}`)}
                    className="flex items-center justify-between gap-2 px-3 py-2 bg-white rounded-lg border border-emerald-100 hover:border-emerald-300 hover:shadow-sm transition-all group"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100 flex-shrink-0">
                        {t.category_label}
                      </span>
                      <span className="text-sm text-slate-700 truncate group-hover:text-emerald-700">{t.title}</span>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border flex-shrink-0 ${PRIORITY_COLOR[t.priority] || PRIORITY_COLOR.medium}`}>
                      {t.priority || 'medium'}
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">
                基于 {location.history_sample_size} 条历史记录推断，目前暂无匹配的待办。
              </p>
            )}
          </section>
        )}
      </div>
    </motion.div>
  );
}