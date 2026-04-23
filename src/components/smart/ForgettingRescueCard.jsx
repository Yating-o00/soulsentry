import React from "react";
import { motion } from "framer-motion";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

/**
 * 遗忘拯救卡片 - 基于遗忘曲线 + 沉默约定
 */
export default function ForgettingRescueCard({ data, onSnooze }) {
  const navigate = useNavigate();
  if (!data?.primary) return null;

  const { primary, others, silent_notes } = data;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border-2 border-purple-200 bg-white overflow-hidden shadow-sm"
    >
      {/* Header */}
      <div className="flex items-start justify-between p-4 pb-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-purple-100 flex items-center justify-center flex-shrink-0">
            <AlertCircle className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900 text-base">遗忘拯救</h3>
            <p className="text-xs text-slate-500 mt-0.5">基于遗忘曲线预警</p>
          </div>
        </div>
        <span className="px-2.5 py-1 bg-purple-50 text-purple-600 text-xs rounded-full font-medium whitespace-nowrap">
          智能干预
        </span>
      </div>

      {/* Content */}
      <div className="mx-4 mb-4 p-4 bg-purple-50/60 rounded-xl">
        <div className="flex items-start gap-2 mb-2">
          <div className="w-5 h-5 rounded-full bg-purple-500 text-white flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
            !
          </div>
          <div className="flex-1">
            <h4 className="font-semibold text-slate-800 text-sm leading-snug">
              您{primary.days}天前提到的"{primary.title}"还未完成
            </h4>
            <p className="text-xs text-slate-500 mt-1">
              超过{primary.days}天未完成遗忘率高达{primary.forget_rate}%
            </p>
          </div>
        </div>

        {primary.context && (
          <div className="mt-3 p-3 bg-white rounded-lg border border-purple-100">
            <div className="text-xs font-medium text-slate-500 mb-1">上下文：</div>
            <p className="text-xs text-slate-700 leading-relaxed">
              {primary.context}
              {primary.overdue_days > 0 && (
                <span className="text-red-500">，已逾期{primary.overdue_days}天。</span>
              )}
            </p>
          </div>
        )}

        {(others?.length > 0 || silent_notes?.length > 0) && (
          <div className="mt-3 pt-3 border-t border-purple-100 space-y-1">
            {others?.map((t) => (
              <div key={t.id} className="text-xs text-slate-500 flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-purple-400" />
                <span className="truncate flex-1">{t.title}</span>
                <span className="text-purple-500">{t.days}天</span>
              </div>
            ))}
            {silent_notes?.map((n) => (
              <div key={n.id} className="text-xs text-slate-500 flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-indigo-400" />
                <span className="truncate flex-1">心签 · {n.title}</span>
                <span className="text-indigo-500">{n.days}天</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 px-4 pb-4">
        <Button
          onClick={() => navigate(`/Tasks?taskId=${primary.id}`)}
          className="flex-1 bg-purple-600 hover:bg-purple-700 text-white rounded-xl h-10"
        >
          立即处理
        </Button>
        <Button
          onClick={onSnooze}
          variant="outline"
          className="px-5 border-slate-200 rounded-xl h-10"
        >
          延后
        </Button>
      </div>
    </motion.div>
  );
}