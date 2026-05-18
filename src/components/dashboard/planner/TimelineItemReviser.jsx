import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Wand2, Loader2, X, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";

/**
 * 单条时间线条目的"提修改意见"弹窗
 * 用户输入意见 → 调用 InvokeLLM 让 AI 基于原条目 + 用户意见输出新条目
 * 父组件通过 onApply(newBlock) 接收并持久化
 */
export default function TimelineItemReviser({ block, onApply }) {
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    const txt = feedback.trim();
    if (!txt || loading) return;
    setLoading(true);
    try {
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
    } catch (e) {
      toast.error("重新生成失败: " + (e?.message || "未知错误"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-[10.5px] text-[#384877]/60 hover:text-[#384877] hover:bg-[#384877]/8 px-1.5 py-0.5 rounded-md"
        title="对这条提修改意见"
      >
        <Wand2 className="w-3 h-3" />
        改一下
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden mt-2"
          >
            <div className="rounded-xl border border-[#384877]/20 bg-gradient-to-br from-[#384877]/5 to-white p-2.5">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Wand2 className="w-3 h-3 text-[#384877]" />
                <span className="text-[11px] font-semibold text-[#384877]">告诉 AI 怎么改</span>
                <button
                  onClick={() => { setOpen(false); setFeedback(""); }}
                  className="ml-auto text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
              <Textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="例如：改到下午 3 点 / 标题改成季度复盘会 / 加上要带的资料……"
                className="min-h-[56px] text-xs border-slate-200 bg-white resize-none focus-visible:ring-1 focus-visible:ring-[#384877]"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent?.isComposing) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
              />
              <div className="flex justify-end gap-1.5 mt-1.5">
                <Button
                  size="sm"
                  onClick={handleSubmit}
                  disabled={!feedback.trim() || loading}
                  className="h-7 px-3 text-[11px] bg-[#384877] hover:bg-[#2d3a5f] text-white rounded-md"
                >
                  {loading ? (
                    <><Loader2 className="w-3 h-3 mr-1 animate-spin" />重新生成中…</>
                  ) : (
                    <><Send className="w-3 h-3 mr-1" />重新生成</>
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