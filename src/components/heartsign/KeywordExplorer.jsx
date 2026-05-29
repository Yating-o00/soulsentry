import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Loader2, ExternalLink, ChevronDown } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

/**
 * 关键词外部信息浏览器：点击关键词 chip → 调用 kimiWebBrowse 获取相关内容/链接 → 内联展开
 * 用于在 AI 智能处理卡片里把关键词与外部信息维度连接起来
 */
export default function KeywordExplorer({ keyword, context = "", inline = false }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null); // { answer, references }
  const [error, setError] = useState(null);

  const explore = async () => {
    // 已展开过且已有结果：仅切换可见
    if (result) {
      setOpen((v) => !v);
      return;
    }
    setOpen(true);
    setLoading(true);
    setError(null);
    try {
      const query = context
        ? `围绕关键词「${keyword}」结合背景「${context.slice(0, 200)}」，给出 3-5 条最相关、值得拓展阅读的内容或链接（含来源标题与网址），帮助拓展信息维度。`
        : `围绕关键词「${keyword}」，给出 3-5 条最相关、值得拓展阅读的内容或链接（含来源标题与网址）。`;
      const { data } = await base44.functions.invoke("kimiWebBrowse", { query, language: "zh" });
      if (data?.error) throw new Error(data.error);
      setResult({
        answer: data?.answer || "",
        references: Array.isArray(data?.references) ? data.references : [],
      });
    } catch (e) {
      setError(e?.message || "拉取失败");
      toast.error("拓展信息拉取失败");
    } finally {
      setLoading(false);
    }
  };

  const triggerClass = inline
    ? `text-left flex-1 min-w-0 inline-flex items-start gap-1 text-[12.5px] leading-relaxed transition
       ${open ? "text-[#384877] font-medium" : "text-slate-600 hover:text-[#384877]"}
       cursor-pointer underline decoration-dotted decoration-[#384877]/30 underline-offset-4 hover:decoration-[#384877]/70`
    : `inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] border transition
       ${open
         ? "bg-[#384877] text-white border-[#384877]"
         : "bg-white text-[#384877]/85 border-[#384877]/20 hover:bg-[#384877]/8 hover:border-[#384877]/40"}`;

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          explore();
        }}
        className={triggerClass}
        title={`查看「${keyword}」相关外部内容`}
      >
        {!inline && <Sparkles className="w-2.5 h-2.5" />}
        <span className={inline ? "flex-1" : ""}>{keyword}</span>
        <ChevronDown className={`shrink-0 transition-transform ${inline ? "w-3 h-3 mt-1 text-[#384877]/50" : "w-2.5 h-2.5"} ${open ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            key="content"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            onClick={(e) => e.stopPropagation()}
            className="basis-full mt-1 overflow-hidden"
          >
            <div className="rounded-lg bg-white border border-[#384877]/15 px-3 py-2 text-[12px] leading-relaxed">
              {loading && (
                <div className="flex items-center gap-2 text-slate-500">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  正在为「{keyword}」检索外部内容…
                </div>
              )}
              {error && !loading && (
                <div className="text-rose-600 text-[11.5px]">{error}</div>
              )}
              {!loading && !error && result && (
                <div className="space-y-2">
                  {result.answer && (
                    <p className="text-slate-700 whitespace-pre-wrap">{result.answer}</p>
                  )}
                  {result.references?.length > 0 && (
                    <ul className="space-y-1 pt-1 border-t border-[#384877]/10">
                      {result.references.slice(0, 6).map((ref, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <ExternalLink className="w-3 h-3 text-[#384877]/60 mt-0.5 shrink-0" />
                          <a
                            href={ref.url}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-[#384877] hover:underline break-all"
                          >
                            {ref.title || ref.url}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                  {!result.answer && (result.references?.length || 0) === 0 && (
                    <div className="text-slate-400">未找到更多外部内容。</div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}