import React, { useState } from "react";
import { Sparkles, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { processPastedContent } from "@/components/utils/processPastedContent";

/**
 * 聊天内容智能识别条。
 * 当父组件检测到输入像聊天记录时渲染本组件，用户点击即可智能分流入库
 * （约定→任务，其余→心签），完成后回调 onDone 清空输入。
 *
 * @param {string} text - 待识别文本
 * @param {() => void} onDone - 识别并入库成功后触发（用于清空输入框）
 * @param {() => void} onDismiss - 用户关闭提示
 * @param {string} [noteColor]
 */
export default function ChatPasteRecognizer({ text, onDone, onDismiss, noteColor }) {
  const [processing, setProcessing] = useState(false);

  const handleRecognize = async () => {
    if (processing) return;
    setProcessing(true);
    try {
      const { createdCommitments, createdNotes } = await processPastedContent(text, { noteColor });
      if (createdCommitments === 0 && createdNotes === 0) {
        toast.info("未识别到可生成的内容");
      } else {
        const parts = [];
        if (createdCommitments > 0) parts.push(`${createdCommitments} 个约定`);
        if (createdNotes > 0) parts.push(`${createdNotes} 条心签`);
        toast.success(`已智能生成 ${parts.join(" · ")}`);
        if (onDone) onDone();
      }
    } catch (e) {
      toast.error("识别失败，请重试");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="mb-2 flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-violet-50 to-indigo-50 border border-violet-100 rounded-xl text-sm">
      <Sparkles className="w-4 h-4 text-violet-500 flex-shrink-0" />
      <span className="text-slate-600 flex-1">检测到聊天记录，可智能识别并自动生成约定/心签</span>
      <button
        onClick={handleRecognize}
        disabled={processing}
        className="px-3 py-1.5 bg-gradient-to-br from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white text-xs font-medium rounded-lg flex items-center gap-1.5 disabled:opacity-60 transition"
      >
        {processing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
        {processing ? "识别中" : "智能识别"}
      </button>
      <button onClick={onDismiss} className="text-slate-400 hover:text-slate-600 flex-shrink-0">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}