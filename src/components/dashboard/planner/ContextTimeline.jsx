import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { RefreshCw, Loader2, Send, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import TimelineItemReviser from "./TimelineItemReviser";

const typeEmoji = {
  meeting:  "📋",
  focus:    "✏️",
  break:    "☕",
  personal: "🌙",
  sleep:    "🌙",
  wake:     "🌅",
  travel:   "🚗",
  navigate: "🅿️",
  reminder: "⏰",
  default:  "🕐",
};

const typeLabel = {
  meeting: "会议",
  focus: "重点",
  break: "休息",
  personal: "个人",
  sleep: "睡前",
  wake: "唤醒",
  travel: "出行",
  navigate: "导航",
  reminder: "提醒",
};

const getEmoji = (type) => typeEmoji[type] || typeEmoji.default;
const getLabel = (type) => typeLabel[type] || null;

const formatTime = (raw) => {
  if (!raw) return '';
  if (raw.includes('T')) {
    const d = new Date(raw);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  return raw;
};

export default function ContextTimeline({ blocks = [], onReviseItem, onReplan }) {
  const [replanOpen, setReplanOpen] = useState(false);
  const [replanFeedback, setReplanFeedback] = useState("");
  const [replanLoading, setReplanLoading] = useState(false);

  const handleReplanSubmit = async () => {
    const txt = replanFeedback.trim();
    if (!txt || replanLoading || typeof onReplan !== "function") return;
    setReplanLoading(true);
    try {
      await onReplan({ feedback: txt });
      setReplanOpen(false);
      setReplanFeedback("");
    } catch (e) {
      toast.error("重新规划失败: " + (e?.message || "未知错误"));
    } finally {
      setReplanLoading(false);
    }
  };

  // 保留原始索引，"改一下"回调时回写到父组件原数组的对应位置
  const list = (blocks || [])
    .map((b, originalIndex) => ({ ...b, __idx: originalIndex }))
    .sort((a, b) => {
      const dateA = a.date || '';
      const dateB = b.date || '';
      if (dateA !== dateB) return dateA.localeCompare(dateB);
      return (a.time || '').localeCompare(b.time || '');
    });

  if (list.length === 0) return null;

  return (
    <div className="rounded-3xl border border-slate-100 bg-white p-5 md:p-7 shadow-sm">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-lg font-bold text-[#2c3e50]">情境感知时间线</h4>
          <p className="text-sm text-slate-400 mt-0.5">流动的日程，而非固定的闹钟</p>
        </div>
        {typeof onReplan === "function" && !replanOpen && (
          <button
            onClick={() => setReplanOpen(true)}
            className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-[#384877] bg-[#384877]/8 hover:bg-[#384877]/15 border border-[#384877]/15 transition-colors"
            title="基于你的意见对整体规划重新调整"
          >
            <RefreshCw className="w-3 h-3" />
            整体重新规划
          </button>
        )}
      </div>

      <AnimatePresence>
        {replanOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden mb-4"
          >
            <div className="rounded-2xl border border-[#384877]/20 bg-gradient-to-br from-[#384877]/5 to-white p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <RefreshCw className="w-3.5 h-3.5 text-[#384877]" />
                <span className="text-xs font-semibold text-[#384877]">告诉 AI 怎么整体调整</span>
                <button
                  onClick={() => { setReplanOpen(false); setReplanFeedback(""); }}
                  className="ml-auto text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <Textarea
                value={replanFeedback}
                onChange={(e) => setReplanFeedback(e.target.value)}
                placeholder="例如：今天精力不够，下午会议都挪到明天 / 整体节奏太紧，每两件事之间留 30 分钟休息 / 上午专注下午社交……"
                className="min-h-[72px] text-sm border-slate-200 bg-white resize-none focus-visible:ring-1 focus-visible:ring-[#384877]"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent?.isComposing) {
                    e.preventDefault();
                    handleReplanSubmit();
                  }
                }}
              />
              <div className="flex items-center justify-between gap-2 mt-2">
                <span className="text-[10.5px] text-slate-400">将基于现有规划 + 你的意见整体重排</span>
                <Button
                  size="sm"
                  onClick={handleReplanSubmit}
                  disabled={!replanFeedback.trim() || replanLoading}
                  className="h-8 px-4 text-xs bg-[#384877] hover:bg-[#2d3a5f] text-white rounded-lg"
                >
                  {replanLoading ? (
                    <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />重新规划中…</>
                  ) : (
                    <><Send className="w-3 h-3 mr-1.5" />整体重排</>
                  )}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative ml-1">
        {/* Vertical connector line */}
        <div className="absolute left-[22px] top-6 bottom-6 w-[2px] rounded-full bg-gradient-to-b from-slate-200 via-slate-200/60 to-transparent" />

        <div className="space-y-6">
          {list.map((b, i) => {
            const emoji = getEmoji(b.type);
            const time = formatTime(b.time);
            const label = getLabel(b.type);
            return (
              <div key={i} className="flex gap-4 group relative">
                {/* Emoji icon on the timeline */}
                <div className="flex flex-col items-center z-10 shrink-0 w-[44px]">
                  <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-white to-slate-50 border border-slate-100 shadow-sm flex items-center justify-center text-xl">
                    {emoji}
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1 pb-1">
                  <div className="flex items-center gap-2.5 mb-1 flex-wrap">
                    {b.date && (
                      <span className="text-[10px] font-medium text-white bg-[#384877]/80 px-1.5 py-0.5 rounded-md">
                        {b.date}
                      </span>
                    )}
                    {time && (
                      <span className="text-sm font-mono font-semibold text-[#384877]">
                        {time}
                      </span>
                    )}
                    <span className="text-base font-bold text-[#2c3e50]">{b.title}</span>
                    {label && (
                      <span className="text-[10px] font-medium text-[#384877]/70 bg-[#384877]/8 px-2 py-0.5 rounded-full border border-[#384877]/10">
                        {label}
                      </span>
                    )}
                    {onReviseItem && (
                      <div className="ml-auto">
                        <TimelineItemReviser
                          block={b}
                          onApply={(newBlock) => onReviseItem(b.__idx, newBlock)}
                          onReplan={onReplan}
                        />
                      </div>
                    )}
                  </div>
                  {b.description && (
                    <p className="text-sm text-slate-500 leading-relaxed">{b.description}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}