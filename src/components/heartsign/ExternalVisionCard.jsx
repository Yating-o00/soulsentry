import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  Globe, RefreshCw, ChevronDown, ChevronUp, Loader2,
  Newspaper, Bell, Rss, Quote, Compass, ExternalLink, Bookmark, Sparkles
} from "lucide-react";

const TYPE_META = {
  news:         { label: "新闻",   icon: Newspaper, color: "bg-rose-50 text-rose-700 border-rose-200" },
  subscription: { label: "订阅",   icon: Rss,       color: "bg-amber-50 text-amber-700 border-amber-200" },
  notification: { label: "即时",   icon: Bell,      color: "bg-blue-50 text-blue-700 border-blue-200" },
  classic:      { label: "经典",   icon: Quote,     color: "bg-violet-50 text-violet-700 border-violet-200" },
  expansion:    { label: "拓展",   icon: Compass,   color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
};

function VisionItem({ card }) {
  const meta = TYPE_META[card.type] || TYPE_META.expansion;
  const Icon = meta.icon;

  const handleSave = async (e) => {
    e.stopPropagation();
    try {
      const content = `**${card.title}**\n\n${card.summary}\n\n_来源：${card.source || '外部视野'}_${card.relevance ? `\n_关联：${card.relevance}_` : ''}`;
      await base44.entities.Note.create({
        content,
        plain_text: `${card.title} ${card.summary}`,
        source_type: 'external_feed',
        source_url: card.url || '',
        tags: ['外部视野', meta.label],
        ai_status: 'pending',
      });
      toast.success('已收为心签');
    } catch {
      toast.error('收藏失败');
    }
  };

  const handleOpen = (e) => {
    if (!card.url) return;
    e.stopPropagation();
    window.open(card.url, '_blank', 'noopener,noreferrer');
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="group flex gap-3 p-3 rounded-xl bg-white border border-slate-200/70 hover:border-slate-300 hover:shadow-sm transition-all"
    >
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${meta.color} border`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className={`text-[10px] px-1.5 py-0.5 rounded-md border ${meta.color} font-medium`}>
            {meta.label}
          </span>
          {card.source && (
            <span className="text-[11px] text-slate-500 truncate">· {card.source}</span>
          )}
        </div>
        <h4 className="text-[13.5px] font-medium text-slate-800 leading-snug mb-1">{card.title}</h4>
        <p className="text-[12.5px] text-slate-600 leading-relaxed line-clamp-2">{card.summary}</p>
        {card.relevance && (
          <p className="text-[11px] text-slate-400 mt-1.5 flex items-start gap-1">
            <Sparkles className="w-2.5 h-2.5 mt-0.5 flex-shrink-0" />
            <span>{card.relevance}</span>
          </p>
        )}
        <div className="flex gap-1.5 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
          {card.url && (
            <button
              onClick={handleOpen}
              className="text-[11px] px-2 py-0.5 rounded-md bg-slate-50 hover:bg-slate-100 text-slate-600 inline-flex items-center gap-1"
            >
              <ExternalLink className="w-3 h-3" /> 打开
            </button>
          )}
          <button
            onClick={handleSave}
            className="text-[11px] px-2 py-0.5 rounded-md bg-slate-50 hover:bg-slate-100 text-slate-600 inline-flex items-center gap-1"
          >
            <Bookmark className="w-3 h-3" /> 收为心签
          </button>
        </div>
      </div>
    </motion.div>
  );
}

export default function ExternalVisionCard() {
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [loadedOnce, setLoadedOnce] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke('getExternalVision', {});
      setCards(res?.data?.cards || []);
      setLoadedOnce(true);
    } catch (e) {
      console.error(e);
      toast.error('外部视野加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // 首次进入自动拉取一次
    load();
    const unsub = base44.entities.ExternalFeed.subscribe?.(() => {
      load();
    });
    return () => unsub?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-violet-50/40 via-white to-blue-50/30 overflow-hidden">
      {/* 头部 */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/50 transition-colors"
      >
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center shadow-sm flex-shrink-0">
          <Globe className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 text-left min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-[13.5px] font-semibold text-slate-800">外部视野</h3>
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-violet-100 text-violet-700 font-medium">AI 策展</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5 truncate">
            {loadedOnce ? `${cards.length} 条相关新闻、订阅、经典与拓展视角` : '为你跳出信息茧房'}
          </p>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); load(); }}
          disabled={loading}
          className="p-1.5 hover:bg-slate-100 rounded-md text-slate-500 disabled:opacity-50"
          title="刷新"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
        </button>
        {expanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>

      {/* 内容 */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="p-3 pt-0 space-y-2">
              {loading && cards.length === 0 && (
                <div className="text-center py-6 text-[12px] text-slate-500 flex items-center justify-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  AI 正在为你策展外部视野…
                </div>
              )}
              {!loading && cards.length === 0 && loadedOnce && (
                <div className="text-center py-6 text-[12px] text-slate-400">
                  暂无推荐 · 点击右上角刷新重试
                </div>
              )}
              {cards.map((c, i) => (
                <VisionItem key={i} card={c} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
