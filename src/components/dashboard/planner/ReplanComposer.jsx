import React, { useState } from "react";
import { motion } from "framer-motion";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 调整当日规划 — 统一入口
 * 不再区分"追加"/"修改"，由 AI 根据用户表述判断意图，对现有规划进行整体调整。
 *
 * onSubmit({ feedback })
 */
export default function ReplanComposer({ onSubmit, disabled }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);

  const presets = [
    "把番茄循环改到上午",
    "增加 21:00 复盘",
    "去掉低优先任务",
    "加一个午休安排",
  ];

  const submit = async () => {
    const v = text.trim();
    if (!v || loading || disabled) return;
    setLoading(true);
    try {
      await onSubmit?.({ feedback: v });
      setText("");
      setOpen(false);
    } catch (_) {
      // 错误已在上层 toast 处理
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-2 py-2.5 text-xs text-slate-500 hover:text-[#384877] border border-dashed border-slate-200 rounded-xl hover:border-[#384877]/30 hover:bg-[#384877]/[0.02] transition-colors"
      >
        <Wand2 className="w-3.5 h-3.5" />
        <span className="font-medium">调整当日规划</span>
        <span className="text-slate-300">·</span>
        <span className="text-slate-400">AI 自动识别追加或修改</span>
      </button>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-[#384877]/15 bg-gradient-to-b from-white to-[#384877]/[0.02] overflow-hidden shadow-sm"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-slate-100">
        <div className="flex items-center gap-1.5 text-[#384877]">
          <Wand2 className="w-3.5 h-3.5" />
          <span className="text-xs font-semibold">调整当日规划</span>
        </div>
        <button
          type="button"
          onClick={() => { setOpen(false); setText(""); }}
          className="text-[11px] text-slate-400 hover:text-slate-600 px-2 py-1 transition-colors"
        >
          取消
        </button>
      </div>

      {/* Input */}
      <div className="p-3">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="说说要怎么改：可以追加新安排，也可以调整 / 删除现有内容…"
          className="min-h-[72px] border-none shadow-none focus-visible:ring-0 resize-none bg-transparent text-sm placeholder:text-slate-350"
          autoFocus
          onKeyDown={(e) => {
            const composing = e.nativeEvent && e.nativeEvent.isComposing;
            if (!composing && e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100/80 mt-1">
          <div className="flex gap-1.5 flex-wrap overflow-hidden">
            {presets.map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setText(s)}
                className="px-2.5 py-1 rounded-lg text-[11px] bg-slate-50 border border-slate-150 text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors whitespace-nowrap"
              >
                {s}
              </button>
            ))}
          </div>
          <Button
            onClick={submit}
            disabled={!text.trim() || loading || disabled}
            className={cn(
              "rounded-xl h-8 px-5 text-xs font-medium shadow-sm transition-all shrink-0",
              text.trim()
                ? "bg-[#384877] hover:bg-[#2d3a5f] text-white shadow-[#384877]/20"
                : "bg-slate-100 text-slate-400 shadow-none"
            )}
          >
            {loading ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />生成中</> : <><Sparkles className="w-3 h-3 mr-1" />重新生成</>}
          </Button>
        </div>
      </div>
    </motion.div>
  );
}