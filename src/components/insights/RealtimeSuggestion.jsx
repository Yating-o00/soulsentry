// 实时个性化建议气泡：在任务创建/AI 对话场景中即时调用 Kimi 给出基于历史的建议
import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, X } from "lucide-react";
import { getPersonalSuggestion } from "@/lib/personalDataEngine";

export default function RealtimeSuggestion({ scene, context, autoLoad = true }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!autoLoad || !context || context.trim().length < 4) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      const res = await getPersonalSuggestion({ scene, context });
      if (!cancelled) {
        setData(res);
        setLoading(false);
      }
    }, 600); // 简易防抖
    return () => { cancelled = true; clearTimeout(timer); };
  }, [scene, context, autoLoad]);

  if (dismissed) return null;
  if (!loading && (!data?.suggestions || data.suggestions.length === 0)) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        className="bg-gradient-to-r from-[#384877]/5 to-purple-50/60 border border-[#384877]/15 rounded-xl p-3 space-y-2 relative"
      >
        <button
          onClick={() => setDismissed(true)}
          className="absolute top-2 right-2 text-slate-400 hover:text-slate-600 p-0.5 rounded hover:bg-white"
          aria-label="关闭"
        >
          <X className="w-3.5 h-3.5" />
        </button>
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#384877]">
          <Sparkles className="w-3.5 h-3.5" />
          {loading ? "Kimi 基于你的习惯分析中…" : "Kimi 基于你的习惯建议"}
        </div>
        {!loading && (
          <ul className="space-y-1.5 pr-6">
            {data.suggestions.slice(0, 3).map((s, i) => (
              <li key={i} className="text-[12.5px] text-slate-700 leading-snug">
                <span className="text-[#384877]/50 mr-1">·</span>
                <span className="font-medium">{s.title}</span>
                {s.reason && <span className="text-slate-400 ml-1">— {s.reason}</span>}
              </li>
            ))}
          </ul>
        )}
      </motion.div>
    </AnimatePresence>
  );
}