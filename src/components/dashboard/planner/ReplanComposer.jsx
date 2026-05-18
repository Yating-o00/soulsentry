import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, RefreshCw, Plus, Edit3 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 整体重新规划 / 追加内容 入口
 * - 折叠态：一行 CTA
 * - 展开态：输入框 + 模式切换（追加新内容 / 修改已有规划）+ 重新生成
 *
 * onSubmit({ feedback, mode })  mode: "append" | "revise"
 */
export default function ReplanComposer({ onSubmit, disabled }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("revise"); // "revise" | "append"
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);

  const placeholders = {
    revise: "比如：把番茄循环改成上午做，下午改成数据分析…",
    append: "比如：再加一个 21:00 的复盘环节…",
  };
  const presets = {
    revise: [
      "把番茄循环改到上午",
      "下午加休息时间",
      "去掉低优先任务",
    ],
    append: [
      "增加 21:00 复盘",
      "加一个午休安排",
      "晚上预留 1 小时学习",
    ],
  };

  const submit = async () => {
    const v = text.trim();
    if (!v || loading || disabled) return;
    setLoading(true);
    try {
      const prefix = mode === "append" ? "【追加】" : "【整体重新规划】";
      await onSubmit?.({ feedback: `${prefix} ${v}`, mode });
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
        <RefreshCw className="w-3.5 h-3.5" />
        <span className="font-medium">整体重新规划</span>
        <span className="text-slate-300">·</span>
        <span className="text-slate-400">追加或修改现有内容</span>
      </button>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-[#384877]/15 bg-gradient-to-b from-white to-[#384877]/[0.02] overflow-hidden shadow-sm"
    >
      {/* Mode tabs */}
      <div className="flex items-center border-b border-slate-100 px-1 pt-1">
        <button
          type="button"
          onClick={() => setMode("revise")}
          className={cn(
            "flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-all border-b-2 -mb-px",
            mode === "revise" ? "border-[#384877] text-[#384877]" : "border-transparent text-slate-400 hover:text-slate-600"
          )}
        >
          <Edit3 className="w-3.5 h-3.5" /> 修改已有规划
        </button>
        <button
          type="button"
          onClick={() => setMode("append")}
          className={cn(
            "flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-all border-b-2 -mb-px",
            mode === "append" ? "border-[#384877] text-[#384877]" : "border-transparent text-slate-400 hover:text-slate-600"
          )}
        >
          <Plus className="w-3.5 h-3.5" /> 追加新内容
        </button>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => { setOpen(false); setText(""); }}
          className="text-[11px] text-slate-400 hover:text-slate-600 px-3 py-2 transition-colors"
        >
          取消
        </button>
      </div>

      {/* Input */}
      <div className="p-3">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholders[mode]}
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
            {presets[mode].map((s, i) => (
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