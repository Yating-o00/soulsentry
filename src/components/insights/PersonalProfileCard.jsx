import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Brain, Sparkles, Clock, AlertTriangle, TrendingUp, RefreshCw, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getProfileInsight } from "@/lib/personalDataEngine";

export default function PersonalProfileCard({ compact = false }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getProfileInsight();
      setData(res);
    } catch (e) {
      setError(e?.message || "无法生成画像");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return (
      <Card className="border-0 shadow-sm bg-gradient-to-br from-indigo-50/60 to-purple-50/40">
        <CardContent className="p-5 space-y-3">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card className="border-0 shadow-sm bg-slate-50">
        <CardContent className="p-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Database className="w-4 h-4" />
            <span>个人数据库正在积累中,使用越多画像越准</span>
          </div>
          <Button size="sm" variant="ghost" onClick={load}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" />
            刷新
          </Button>
        </CardContent>
      </Card>
    );
  }

  const persona = data.persona || data.summary || "";
  const insights = Array.isArray(data.insights) ? data.insights : [];
  const suggestions = Array.isArray(data.suggestions) ? data.suggestions : [];

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="border-0 shadow-sm bg-gradient-to-br from-indigo-50/70 to-purple-50/50 overflow-hidden">
        <CardContent className={compact ? "p-4 space-y-3" : "p-5 space-y-4"}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-sm">
                <Brain className="w-4 h-4 text-white" />
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-800">我的画像</div>
                <div className="text-[11px] text-slate-500">基于你的操作习惯与结果</div>
              </div>
            </div>
            <Button size="sm" variant="ghost" onClick={load} className="text-slate-500 hover:text-slate-700 h-7">
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>

          {persona && (
            <p className="text-sm text-slate-700 leading-relaxed">{persona}</p>
          )}

          {insights.length > 0 && (
            <div className="space-y-1.5">
              {insights.slice(0, compact ? 2 : 4).map((it, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-slate-600">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-500 mt-0.5 flex-shrink-0" />
                  <span>{typeof it === "string" ? it : it.text || it.summary}</span>
                </div>
              ))}
            </div>
          )}

          {suggestions.length > 0 && (
            <div className="border-t border-indigo-100 pt-3 space-y-1.5">
              <div className="text-[11px] font-semibold text-indigo-700 flex items-center gap-1">
                <TrendingUp className="w-3 h-3" />
                建议
              </div>
              {suggestions.slice(0, compact ? 2 : 3).map((s, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-slate-700">
                  <Clock className="w-3.5 h-3.5 text-purple-500 mt-0.5 flex-shrink-0" />
                  <span>{typeof s === "string" ? s : s.text || s.summary}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}