import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Wand2, Loader2, X, Send, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { cn } from "@/lib/utils";

/**
 * 单条时间线条目的"提修改意见"弹窗
 * 两种模式：
 *   - "single"：只改这一条（调用 InvokeLLM 重写该条）
 *   - "replan"：基于这条 + 用户意见，让父组件触发整体重新规划（onReplan 回调）
 * 删除：单独的"删除"按钮（带二次确认），通过 onDelete 回调上抛
 */
export default function TimelineItemReviser({ block, onApply, onReplan, onDelete }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [mode, setMode] = useState("single"); // single | replan
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    const txt = feedback.trim();
    if (!txt || loading) return;
    setLoading(true);
    try {
      if (mode === "replan") {
        // 交给父组件做整体重规划（父组件会调用 analyzeIntent 并替换当日方案）
        if (typeof onReplan !== "function") {
          toast.error("当前不支持整体重新规划");
        } else {
          await onReplan({ feedback: txt, anchorBlock: block });
          setOpen(false);
          setFeedback("");
        }
      } else {
        const result = await base44.integrations.Core.InvokeLLM({
          prompt: `你是日程规划助手。用户对下面这条时间线条目提出修改意见，请基于原条目和意见生成新的条目。

【原条目】
时间: ${block.time || "(无)"}
标题: ${block.title || ""}
描述: ${block.description || ""}
类型: ${block.type || "focus"}

【用户修改意见】
${txt}

要求:
- 仅修改用户提到的部分，未提及的字段尽量保留原值
- 时间格式: HH:mm (如 14:30)
- type 可选: meeting / focus / break / personal / travel / reminder
- 描述要具体、可执行，1-2 句话
- 返回 JSON 即可，不要解释`,
          response_json_schema: {
            type: "object",
            properties: {
              time: { type: "string" },
              title: { type: "string" },
              description: { type: "string" },
              type: { type: "string" },
            },
            required: ["title"],
          },
        });

        const newBlock = {
          ...block,
          time: result.time || block.time,
          title: result.title || block.title,
          description: result.description || block.description,
          type: result.type || block.type,
        };
        onApply(newBlock);
        toast.success("已根据你的意见更新", { icon: "✨" });
        setOpen(false);
        setFeedback("");
      }
    } catch (e) {
      toast.error("处理失败: " + (e?.message || "未知错误"));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = () => {
    if (typeof onDelete !== "function") return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      // 3 秒内不点确认就自动还原
      setTimeout(() => setConfirmDelete(false), 3000);
      return;
    }
    try {
      onDelete();
      toast.success("已删除", { icon: "🗑️" });
    } catch (e) {
      toast.error("删除失败: " + (e?.message || "未知错误"));
    } finally {
      setConfirmDelete(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1 text-[10.5px] text-[#384877]/60 hover:text-[#384877] hover:bg-[#384877]/8 px-1.5 py-0.5 rounded-md"
          title="对这条提修改意见"
        >
          <Wand2 className="w-3 h-3" />
          改一下
        </button>
        {typeof onDelete === "function" && (
          <button
            onClick={handleDelete}
            className={cn(
              "flex items-center gap-1 text-[10.5px] px-1.5 py-0.5 rounded-md transition-colors",
              confirmDelete
                ? "bg-rose-500 text-white hover:bg-rose-600"
                : "text-rose-500/70 hover:text-rose-600 hover:bg-rose-50"
            )}
            title={confirmDelete ? "再次点击确认删除" : "删除这条"}
          >
            <Trash2 className="w-3 h-3" />
            {confirmDelete ? "确认删除" : "删除"}
          </button>
        )}
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden mt-2 w-full"
          >
            <div className="rounded-xl border border-[#384877]/20 bg-gradient-to-br from-[#384877]/5 to-white p-2.5">
              {/* Mode tabs */}
              <div className="flex items-center gap-1 mb-2">
                <button
                  onClick={() => setMode("single")}
                  className={cn(
                    "flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors",
                    mode === "single"
                      ? "bg-[#384877] text-white"
                      : "bg-white text-slate-500 hover:text-[#384877] border border-slate-200"
                  )}
                >
                  <Wand2 className="w-3 h-3" />
                  仅改这条
                </button>
                {typeof onReplan === "function" && (
                  <button
                    onClick={() => setMode("replan")}
                    className={cn(
                      "flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors",
                      mode === "replan"
                        ? "bg-[#384877] text-white"
                        : "bg-white text-slate-500 hover:text-[#384877] border border-slate-200"
                    )}
                  >
                    <RefreshCw className="w-3 h-3" />
                    整体重新规划
                  </button>
                )}
                <button
                  onClick={() => { setOpen(false); setFeedback(""); }}
                  className="ml-auto text-slate-400 hover:text-slate-600 p-0.5"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <Textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder={
                  mode === "replan"
                    ? "告诉 AI 整体怎么调整，比如：今天精力不够，把下午会议都推到明天，上午多留专注时间……"
                    : "例如：改到下午 3 点 / 标题改成季度复盘会 / 加上要带的资料……"
                }
                className="min-h-[64px] text-xs border-slate-200 bg-white resize-none focus-visible:ring-1 focus-visible:ring-[#384877]"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent?.isComposing) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
              />
              <div className="flex items-center justify-between gap-1.5 mt-1.5">
                <span className="text-[10px] text-slate-400">
                  {mode === "replan" ? "将基于现有规划 + 你的意见整体重排" : "只更新当前这一条"}
                </span>
                <Button
                  size="sm"
                  onClick={handleSubmit}
                  disabled={!feedback.trim() || loading}
                  className="h-7 px-3 text-[11px] bg-[#384877] hover:bg-[#2d3a5f] text-white rounded-md"
                >
                  {loading ? (
                    <><Loader2 className="w-3 h-3 mr-1 animate-spin" />{mode === "replan" ? "重新规划中…" : "重新生成中…"}</>
                  ) : (
                    <><Send className="w-3 h-3 mr-1" />{mode === "replan" ? "整体重排" : "重新生成"}</>
                  )}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}