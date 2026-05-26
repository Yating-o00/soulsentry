import React, { useMemo } from 'react';
import { Tag, BarChart3, Lightbulb, FileText, Link as LinkIcon, Sparkles } from 'lucide-react';

/**
 * 右侧 AI 洞察面板 - 知识库概览
 */
export default function HeartSignInsightPanel({ notes }) {
  const stats = useMemo(() => {
    const tagCount = {};
    const categoryCount = {};
    let links = 0;
    let files = 0;
    let reports = 0;

    notes.forEach(n => {
      (n.tags || []).forEach(t => { tagCount[t] = (tagCount[t] || 0) + 1; });
      const cat = n.ai_analysis?.category;
      if (cat) categoryCount[cat] = (categoryCount[cat] || 0) + 1;
      if (n.source_type === 'web_link' || n.source_type === 'wechat_share') links++;
      if (n.source_type === 'file_upload') files++;
      if (n.source_type === 'report' || (n.plain_text || '').length > 500) reports++;
    });

    const hotTags = Object.entries(tagCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12);

    return {
      total: notes.length,
      links,
      files,
      reports,
      tagCount: Object.keys(tagCount).length,
      hotTags,
    };
  }, [notes]);

  const insights = useMemo(() => {
    const out = [];
    if (stats.hotTags[0]) {
      out.push(`你最常记录关于 #${stats.hotTags[0][0]} 的内容（${stats.hotTags[0][1]} 条），可以生成一份主题报告。`);
    }
    if (stats.reports >= 3) {
      out.push(`已沉淀 ${stats.reports} 篇长文本，建议在「智能报告」中查看跨篇关联。`);
    }
    if (stats.links >= 5) {
      out.push(`收藏了 ${stats.links} 个外部链接，AI 可帮你提炼共同主题。`);
    }
    if (out.length === 0) out.push('开始给自己发心签，AI 会逐步沉淀你的知识画像。');
    return out;
  }, [stats]);

  return (
    <aside className="w-80 bg-white border-l border-slate-200 overflow-y-auto flex-shrink-0 hidden lg:block">
      <div className="p-5 border-b border-slate-100">
        <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2 text-sm">
          <BarChart3 className="w-4 h-4 text-[#384877]" />
          知识概览
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-violet-50 rounded-xl p-3 text-center">
            <div className="text-2xl font-bold text-violet-600">{stats.total}</div>
            <div className="text-[11px] text-slate-500 mt-1">心签</div>
          </div>
          <div className="bg-blue-50 rounded-xl p-3 text-center">
            <div className="text-2xl font-bold text-blue-600">{stats.links}</div>
            <div className="text-[11px] text-slate-500 mt-1">链接</div>
          </div>
          <div className="bg-amber-50 rounded-xl p-3 text-center">
            <div className="text-2xl font-bold text-amber-600">{stats.tagCount}</div>
            <div className="text-[11px] text-slate-500 mt-1">标签</div>
          </div>
          <div className="bg-emerald-50 rounded-xl p-3 text-center">
            <div className="text-2xl font-bold text-emerald-600">{stats.files + stats.reports}</div>
            <div className="text-[11px] text-slate-500 mt-1">长文/文件</div>
          </div>
        </div>
      </div>

      <div className="p-5 border-b border-slate-100">
        <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2 text-sm">
          <Tag className="w-4 h-4 text-[#384877]" />
          热门标签
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {stats.hotTags.length === 0 && (
            <p className="text-xs text-slate-400">AI 会在你记录后自动生成标签</p>
          )}
          {stats.hotTags.map(([tag, count]) => (
            <span
              key={tag}
              className="px-2.5 py-1 bg-slate-100 hover:bg-violet-100 hover:text-violet-700 text-slate-600 rounded-full text-[11px] cursor-pointer transition-colors"
            >
              #{tag} <span className="opacity-60">{count}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="p-5">
        <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2 text-sm">
          <Lightbulb className="w-4 h-4 text-amber-500" />
          AI 洞察
        </h3>
        <div className="space-y-2">
          {insights.map((tip, i) => (
            <div key={i} className="bg-gradient-to-br from-slate-50 to-white border-l-2 border-[#384877] p-3 rounded-r-lg">
              <p className="text-[12px] text-slate-700 leading-relaxed">{tip}</p>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}