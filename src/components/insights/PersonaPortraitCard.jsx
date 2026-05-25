import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Sparkles, RefreshCw, Brain, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Kimi 个人画像卡片
 * - 用于 Knowledge 页 / Account 认知洞察
 * - 实时调用 kimiPersonalInsight 后端函数
 */
export default function PersonaPortraitCard({ compact = false }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await base44.functions.invoke("kimiPersonalInsight", { scope: "profile" });
      setData(res.data);
    } catch (e) {
      setError(e?.message || "分析失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-slate-100 bg-gradient-to-br from-[#384877]/5 via-white to-purple-50/40 p-5 shadow-sm"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#384877] to-[#3b5aa2] flex items-center justify-center shadow-sm">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Kimi 个人画像</h3>
            <p className="text-xs text-slate-500">
              {data?.data_count ? `基于 ${data.data_count} 条画像数据` : "实时学习你的偏好"}
            </p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={load} disabled={loading} className="h-7 px-2">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {loading && !data && (
        <div className="space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
        </div>
      )}

      {error && (
        <p className="text-xs text-rose-500">{error}</p>
      )}

      {data?.empty && (
        <p className="text-sm text-slate-500 leading-relaxed">
          {data.persona}
        </p>
      )}

      {data && !data.empty && (
        <div className="space-y-3">
          {data.persona && (
            <p className="text-sm text-slate-700 leading-relaxed italic">
              "{data.persona}"
            </p>
          )}

          {!compact && data.insights?.length > 0 && (
            <div className="space-y-2">
              {data.insights.slice(0, 4).map((it, i) => (
                <div key={i} className="flex items-start gap-2 bg-white/60 rounded-xl p-2.5 border border-slate-100">
                  <Brain className="w-3.5 h-3.5 text-[#384877] mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-slate-800">{it.title}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{it.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {data.suggestions?.length > 0 && (
            <div className="pt-2 border-t border-slate-100">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-xs font-semibold text-slate-700">个性化建议</span>
              </div>
              <ul className="space-y-1">
                {data.suggestions.slice(0, 3).map((s, i) => (
                  <li key={i} className="text-xs text-slate-600 leading-relaxed">• {s}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}