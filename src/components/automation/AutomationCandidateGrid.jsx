import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Check, Loader2, X, Zap } from "lucide-react";
import { AUTOMATION_TYPES } from "./automationConfig";

/**
 * 候选自动执行清单（网格）
 * - 每张卡片显示一条可自动执行的子项，用户点击 "授权执行" 触发
 * - 已授权的卡片状态变为 "ready" / "完成"
 * - 末尾有 "+ 自定义" 卡片让用户手动添加
 */
export default function AutomationCandidateGrid({
  candidates = [],
  authorizingIds = new Set(),
  authorizedIds = new Set(),
  onAuthorize,
  onAddCustom,
}) {
  const [showCustom, setShowCustom] = useState(false);
  const [customTitle, setCustomTitle] = useState("");
  const [customDetail, setCustomDetail] = useState("");

  const handleSubmitCustom = () => {
    if (!customTitle.trim()) return;
    onAddCustom?.({
      title: customTitle.trim(),
      detail: customDetail.trim() || customTitle.trim(),
      automation_type: "summary_note",
      _custom: true,
    });
    setCustomTitle("");
    setCustomDetail("");
    setShowCustom(false);
  };

  if (candidates.length === 0 && !showCustom) return null;

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-2.5 px-0.5">
        <h4 className="text-sm font-semibold text-slate-800">自动执行清单</h4>
        <span className="text-[11px] text-slate-400">
          {authorizedIds.size}/{candidates.length} 已授权
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <AnimatePresence>
          {candidates.map((c, idx) => {
            const id = c._id || String(idx);
            const cfg = AUTOMATION_TYPES[c.automation_type] || AUTOMATION_TYPES.none;
            const Icon = cfg.icon;
            const isAuthorizing = authorizingIds.has(id);
            const isAuthorized = authorizedIds.has(id);

            return (
              <motion.div
                key={id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className={`group relative p-3 rounded-xl border transition-all ${
                  isAuthorized
                    ? "bg-emerald-50/40 border-emerald-200"
                    : "bg-white border-slate-200 hover:border-indigo-300 hover:shadow-sm"
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${cfg.iconBg}`}>
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <h5 className="text-[13px] font-semibold text-slate-900 truncate">{c.title}</h5>
                      {isAuthorized ? (
                        <span className="flex items-center gap-1 text-[10px] text-emerald-600 font-medium flex-shrink-0">
                          <Check className="w-3 h-3" />已执行
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400 flex-shrink-0">· ready</span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 leading-snug line-clamp-2">{c.detail}</p>

                    {!isAuthorized && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isAuthorizing}
                        onClick={() => onAuthorize?.({ ...c, _id: id })}
                        className="mt-2 h-7 text-[11px] gap-1 border-indigo-200 text-indigo-600 hover:bg-indigo-50"
                      >
                        {isAuthorizing ? (
                          <><Loader2 className="w-3 h-3 animate-spin" />执行中</>
                        ) : (
                          <><Zap className="w-3 h-3" />授权自动执行</>
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* 自定义添加卡片 */}
        {!showCustom ? (
          <motion.button
            layout
            onClick={() => setShowCustom(true)}
            className="flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-dashed border-slate-200 text-slate-400 hover:border-indigo-300 hover:text-indigo-500 hover:bg-indigo-50/30 transition-colors min-h-[72px]"
          >
            <Plus className="w-4 h-4" />
            <span className="text-xs font-medium">自定义自动执行项</span>
          </motion.button>
        ) : (
          <motion.div
            layout
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-3 rounded-xl border border-indigo-200 bg-indigo-50/40 space-y-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-indigo-700">添加自定义项</span>
              <button onClick={() => setShowCustom(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <Input
              autoFocus
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              placeholder="标题，例如：晚上 21:00 提醒回顾"
              className="h-8 text-xs bg-white"
            />
            <Input
              value={customDetail}
              onChange={(e) => setCustomDetail(e.target.value)}
              placeholder="说明（可选）"
              className="h-8 text-xs bg-white"
              onKeyDown={(e) => e.key === "Enter" && handleSubmitCustom()}
            />
            <Button
              size="sm"
              onClick={handleSubmitCustom}
              disabled={!customTitle.trim()}
              className="w-full h-7 text-[11px] bg-gradient-to-r from-[#384877] to-[#3b5aa2]"
            >
              添加并授权
            </Button>
          </motion.div>
        )}
      </div>
    </div>
  );
}