import React, { useMemo } from "react";
import { ChartPie, Tag, Lightbulb, Network } from "lucide-react";

export default function HeartSignInsightPanel({ notes }) {
  const stats = useMemo(() => {
    const all = notes || [];
    const links = all.filter(n => n.source_type === 'web_link').length;
    const files = all.filter(n => ['file', 'image'].includes(n.source_type)).length;
    const tags = new Set();
    all.forEach(n => (n.tags || []).forEach(t => tags.add(t)));
    const insights = all.filter(n => n.ai_status === 'completed').length;
    return { total: all.length, links, files, tags: tags.size, insights };
  }, [notes]);

  const topTags = useMemo(() => {
    const counter = {};
    (notes || []).forEach(n => (n.tags || []).forEach(t => { counter[t] = (counter[t] || 0) + 1; }));
    return Object.entries(counter).sort((a, b) => b[1] - a[1]).slice(0, 14);
  }, [notes]);

  const categories = useMemo(() => {
    const counter = {};
    (notes || []).forEach(n => {
      const c = n.ai_analysis?.category;
      if (c) counter[c] = (counter[c] || 0) + 1;
    });
    return Object.entries(counter).sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [notes]);

  const recentInsights = useMemo(() => {
    return (notes || [])
      .filter(n => n.ai_analysis?.summary)
      .slice(0, 4);
  }, [notes]);

  return (
    <aside className="w-80 bg-white border-l border-slate-200 overflow-y-auto flex-shrink-0 hidden lg:block">
      <div className="p-5 border-b border-slate-100">
        <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2 text-sm">
          <ChartPie className="w-4 h-4 text-violet-500" />
          知识概览
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-violet-50 rounded-xl p-3 text-center">
            <div className="text-xl font-bold text-violet-600">{stats.total}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">心签</div>
          </div>
          <div className="bg-indigo-50 rounded-xl p-3 text-center">
            <div className="text-xl font-bold text-indigo-600">{stats.links}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">链接</div>
          </div>
          <div className="bg-amber-50 rounded-xl p-3 text-center">
            <div className="text-xl font-bold text-amber-600">{stats.tags}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">标签</div>
          </div>
          <div className="bg-emerald-50 rounded-xl p-3 text-center">
            <div className="text-xl font-bold text-emerald-600">{stats.insights}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">AI 洞察</div>
          </div>
        </div>
      </div>

      {categories.length > 0 && (
        <div className="p-5 border-b border-slate-100">
          <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2 text-sm">
            <Network className="w-4 h-4 text-violet-500" />
            内容分类
          </h3>
          <div className="space-y-2">
            {categories.map(([c, n]) => (
              <div key={c} className="flex items-center gap-2">
                <span className="text-xs text-slate-600 flex-1 truncate">{c}</span>
                <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-violet-500 to-indigo-500" style={{ width: `${Math.min(100, (n / categories[0][1]) * 100)}%` }} />
                </div>
                <span className="text-[11px] text-slate-400 w-6 text-right">{n}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {topTags.length > 0 && (
        <div className="p-5 border-b border-slate-100">
          <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2 text-sm">
            <Tag className="w-4 h-4 text-violet-500" />
            智能标签
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {topTags.map(([t, n]) => (
              <span key={t} className="px-2.5 py-1 bg-slate-100 hover:bg-violet-100 hover:text-violet-700 text-slate-600 rounded-full text-[11px] transition cursor-pointer">
                #{t}<span className="ml-1 text-slate-400">{n}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {recentInsights.length > 0 && (
        <div className="p-5">
          <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2 text-sm">
            <Lightbulb className="w-4 h-4 text-amber-500" />
            今日洞察
          </h3>
          <div className="space-y-2">
            {recentInsights.map(n => (
              <div key={n.id} className="bg-gradient-to-br from-slate-50 to-white border-l-2 border-violet-400 p-3 rounded-lg">
                <p className="text-[12px] text-slate-700 leading-relaxed line-clamp-3">{n.ai_analysis.summary}</p>
                {n.ai_analysis.category && (
                  <span className="inline-block mt-1.5 text-[10px] px-1.5 py-0.5 bg-violet-100 text-violet-600 rounded">{n.ai_analysis.category}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}