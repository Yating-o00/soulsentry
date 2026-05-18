import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertTriangle,
  Clock,
  Battery,
  Layers,
  PhoneOff,
  Brain,
  HelpCircle,
  Sparkles,
  Loader2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

/**
 * 任务落地反馈闭环 - 简短的"未按时完成"原因卡
 *
 * Props:
 *  - task: 任务对象
 *  - onSubmit({ reason_category, missing_prerequisite, reason_note, deferred_to }) 返回 Promise
 *  - onSkip() 用户暂时不想反馈
 */
const REASONS = [
  { key: "device_not_ready", label: "设备/条件未就绪", icon: PhoneOff, hint: "缺少位置授权、推送、Gmail/日历连接等" },
  { key: "time_conflict", label: "时间被占用", icon: Layers, hint: "临时被其它事打断" },
  { key: "energy_low", label: "精力不够", icon: Battery, hint: "状态不佳/疲劳" },
  { key: "external_blocker", label: "外部阻塞", icon: AlertTriangle, hint: "等他人/系统反馈" },
  { key: "forgot", label: "忘记了", icon: Brain, hint: "下次需要更强的提醒" },
  { key: "other", label: "其它", icon: HelpCircle, hint: "" },
];

const DEFER_PRESETS = [
  { label: "1 小时后", minutes: 60 },
  { label: "今晚 20:00", custom: "tonight" },
  { label: "明天此时", minutes: 60 * 24 },
];

function computeDeferTarget(preset) {
  const now = new Date();
  if (preset.custom === "tonight") {
    const t = new Date();
    t.setHours(20, 0, 0, 0);
    if (t.getTime() <= now.getTime()) t.setDate(t.getDate() + 1);
    return t;
  }
  return new Date(now.getTime() + (preset.minutes || 60) * 60 * 1000);
}

export default function TaskDeferralFeedback({ task, onSubmit, onSkip }) {
  const [reason, setReason] = useState(null);
  const [missing, setMissing] = useState("");
  const [note, setNote] = useState("");
  const [defer, setDefer] = useState(DEFER_PRESETS[0]);
  const [loading, setLoading] = useState(false);

  const isDeviceIssue = reason === "device_not_ready";

  const handleSubmit = async () => {
    if (!reason || loading) return;
    setLoading(true);
    try {
      const target = computeDeferTarget(defer);
      await onSubmit?.({
        reason_category: reason,
        missing_prerequisite: isDeviceIssue ? missing.trim() : "",
        reason_note: note.trim(),
        deferred_to: target.toISOString(),
      });
    } finally {
      setLoading(false);
    }
  };

  const originalTime = task?.reminder_time || task?.end_time;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.98 }}
      transition={{ duration: 0.22 }}
      className="rounded-2xl border border-amber-200/70 bg-gradient-to-b from-amber-50/70 to-white shadow-lg shadow-amber-500/5 overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-start justify-between px-4 pt-3.5 pb-2.5 border-b border-amber-100/60">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-sm shadow-amber-500/30 flex-shrink-0">
            <AlertTriangle className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-amber-950 tracking-tight">这件事没按时落地</p>
            <p className="text-[11px] text-amber-700/80 truncate mt-0.5">
              「{task?.title || "任务"}」
              {originalTime && (
                <span className="text-amber-600/70"> · 原定 {format(new Date(originalTime), "MM-dd HH:mm")}</span>
              )}
            </p>
          </div>
        </div>
        <button
          onClick={onSkip}
          className="text-amber-500/70 hover:text-amber-700 p-1 -mr-1 rounded-md hover:bg-amber-100/60 transition-colors flex-shrink-0"
          title="稍后再说"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body */}
      <div className="p-4 space-y-3.5">
        {/* Step 1: 原因 */}
        <div>
          <p className="text-[11px] font-medium text-stone-500 mb-2">主要原因（帮助哨兵下次更懂你）</p>
          <div className="grid grid-cols-2 gap-1.5">
            {REASONS.map((r) => {
              const Icon = r.icon;
              const active = reason === r.key;
              return (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => setReason(r.key)}
                  className={cn(
                    "flex items-center gap-2 px-2.5 py-2 rounded-lg border text-left transition-all",
                    active
                      ? "bg-[#384877] text-white border-[#384877] shadow-sm"
                      : "bg-white text-stone-700 border-stone-200 hover:border-stone-300 hover:bg-stone-50"
                  )}
                >
                  <Icon className={cn("w-3.5 h-3.5 flex-shrink-0", active ? "text-white" : "text-stone-400")} />
                  <span className="text-[12px] font-medium truncate">{r.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Step 2: 设备/条件细节（仅当选了设备未就绪） */}
        <AnimatePresence>
          {isDeviceIssue && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.18 }}
            >
              <p className="text-[11px] font-medium text-stone-500 mb-1.5">缺什么？（一两个词即可）</p>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {["位置授权", "推送权限", "Gmail 连接", "Google 日历", "网络/设备", "文件资料"].map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setMissing(p)}
                    className={cn(
                      "px-2 py-1 rounded-md text-[11px] border transition-colors",
                      missing === p
                        ? "bg-rose-50 text-rose-700 border-rose-200"
                        : "bg-white text-stone-500 border-stone-200 hover:bg-stone-50"
                    )}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={missing}
                onChange={(e) => setMissing(e.target.value)}
                placeholder="如：相机权限 / 公司 VPN…"
                className="w-full text-xs px-2.5 py-1.5 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white"
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Step 3: 补充说明（可选） */}
        <div>
          <p className="text-[11px] font-medium text-stone-500 mb-1.5">补充说明（可选）</p>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="一句话也行，AI 会带进下一次重排…"
            className="min-h-[56px] text-xs resize-none border-stone-200 focus-visible:ring-amber-300"
          />
        </div>

        {/* Step 4: 顺延到 */}
        <div>
          <p className="text-[11px] font-medium text-stone-500 mb-1.5 flex items-center gap-1.5">
            <Clock className="w-3 h-3" />
            自动顺延到
          </p>
          <div className="grid grid-cols-3 gap-1.5">
            {DEFER_PRESETS.map((p) => {
              const active = defer.label === p.label;
              return (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setDefer(p)}
                  className={cn(
                    "px-2 py-1.5 rounded-lg text-[11px] border transition-colors",
                    active
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200 font-medium"
                      : "bg-white text-stone-600 border-stone-200 hover:bg-stone-50"
                  )}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-1">
          <p className="text-[10.5px] text-stone-400 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-amber-400" />
            会带入下次「调整当日规划」
          </p>
          <Button
            onClick={handleSubmit}
            disabled={!reason || loading || (isDeviceIssue && !missing.trim())}
            className={cn(
              "rounded-xl h-8 px-4 text-xs font-medium shadow-sm transition-all",
              reason
                ? "bg-[#384877] hover:bg-[#2d3a5f] text-white"
                : "bg-stone-100 text-stone-400 shadow-none"
            )}
          >
            {loading ? (
              <><Loader2 className="w-3 h-3 mr-1 animate-spin" />记录中</>
            ) : (
              "记录并顺延"
            )}
          </Button>
        </div>
      </div>
    </motion.div>
  );
}