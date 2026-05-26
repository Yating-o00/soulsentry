import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Rss, Plus, RefreshCw, Loader2, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";

const PRESETS = [
  { name: 'Product Hunt 每日精选', feed_type: 'rss', url: 'https://www.producthunt.com/feed', icon: '🔥', description: '产品设计灵感' },
  { name: '36氪 - 早期项目', feed_type: 'rss', url: 'https://36kr.com/feed', icon: '📰', description: '创业动态' },
  { name: 'Hacker News 头条', feed_type: 'rss', url: 'https://news.ycombinator.com/rss', icon: '⚡', description: '技术与创业' },
];

export default function ExternalFeedManager({ defaultCollapsed = false }) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [feeds, setFeeds] = useState([]);
  const [refreshingId, setRefreshingId] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newFeed, setNewFeed] = useState({ name: '', url: '', feed_type: 'rss', icon: '📡' });

  const load = async () => {
    try {
      const list = await base44.entities.ExternalFeed.list('-created_date', 50);
      setFeeds(list || []);
    } catch (e) { console.error(e); }
  };

  useEffect(() => { load(); }, []);

  const addFeed = async (data) => {
    try {
      await base44.entities.ExternalFeed.create({ ...data, is_active: true, auto_archive_to_heartsign: true });
      toast.success('已接入：' + data.name);
      setNewFeed({ name: '', url: '', feed_type: 'rss', icon: '📡' });
      setShowAdd(false);
      load();
    } catch (e) { toast.error('接入失败：' + e.message); }
  };

  const refreshFeed = async (feed) => {
    setRefreshingId(feed.id);
    try {
      const res = await base44.functions.invoke('fetchExternalFeeds', { feed_id: feed.id });
      const data = res?.data || res;
      if (data?.error) toast.error('拉取失败：' + data.error);
      else toast.success(`已拉取 ${data?.fetched || 0} 条，新增 ${data?.archived || 0} 条心签`);
      load();
    } catch (e) { toast.error('拉取失败：' + e.message); }
    setRefreshingId(null);
  };

  const removeFeed = async (feed) => {
    if (!confirm(`移除「${feed.name}」？`)) return;
    try {
      await base44.entities.ExternalFeed.delete(feed.id);
      toast.success('已移除');
      load();
    } catch (e) { toast.error(e.message); }
  };

  const existingUrls = new Set(feeds.map(f => f.url));

  return (
    <div className="rounded-xl border border-slate-200/70 bg-white/70 backdrop-blur overflow-hidden">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full px-3 py-2 flex items-center gap-2 hover:bg-slate-50/80 transition"
      >
        {collapsed ? <ChevronRight className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
        <Rss className="w-3.5 h-3.5 text-violet-600" />
        <span className="text-[12.5px] font-medium text-slate-700">外部信息接入</span>
        <span className="text-[11px] text-slate-400 ml-auto">{feeds.length} 个已接入</span>
      </button>

      {!collapsed && (
        <div className="px-3 pb-3 space-y-3 border-t border-slate-100 max-h-[50vh] overflow-y-auto overscroll-contain">
          {/* 已接入 */}
          {feeds.length > 0 && (
            <div className="space-y-1.5 pt-2">
              {feeds.map(f => (
                <div key={f.id} className="flex items-center justify-between bg-slate-50/60 rounded-lg px-2.5 py-1.5">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="text-sm">{f.icon || '📡'}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] font-medium text-slate-800 truncate">{f.name}</div>
                      <div className="text-[10.5px] text-slate-500 truncate">
                        {f.last_fetched_at ? new Date(f.last_fetched_at).toLocaleString('zh-CN') : '尚未拉取'}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    <button onClick={() => refreshFeed(f)} disabled={refreshingId === f.id} className="p-1 hover:bg-violet-50 rounded text-violet-600">
                      {refreshingId === f.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                    </button>
                    <button onClick={() => removeFeed(f)} className="p-1 hover:bg-rose-50 rounded text-rose-500">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 推荐 */}
          <div className="pt-1">
            <div className="text-[10.5px] text-slate-500 uppercase tracking-wider font-medium mb-1.5">推荐订阅</div>
            <div className="space-y-1">
              {PRESETS.map(p => {
                const added = existingUrls.has(p.url);
                return (
                  <div key={p.url} className="flex items-center justify-between bg-white border border-slate-200/70 rounded-lg px-2.5 py-1.5">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="text-sm">{p.icon}</span>
                      <div className="min-w-0">
                        <div className="text-[12px] font-medium text-slate-800 truncate">{p.name}</div>
                        <div className="text-[10.5px] text-slate-500 truncate">{p.description}</div>
                      </div>
                    </div>
                    <button
                      onClick={() => !added && addFeed(p)}
                      disabled={added}
                      className={`px-2 py-0.5 text-[10.5px] rounded ${added ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-violet-600 text-white hover:bg-violet-700'}`}
                    >
                      {added ? '已接入' : '接入'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 自定义 */}
          {showAdd ? (
            <div className="space-y-1.5 pt-1">
              <input
                value={newFeed.name}
                onChange={(e) => setNewFeed({ ...newFeed, name: e.target.value })}
                placeholder="名称"
                className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-md text-[12px] outline-none focus:border-violet-400"
              />
              <input
                value={newFeed.url}
                onChange={(e) => setNewFeed({ ...newFeed, url: e.target.value })}
                placeholder="RSS / Atom URL"
                className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-md text-[12px] outline-none focus:border-violet-400"
              />
              <div className="flex gap-1.5">
                <button
                  onClick={() => newFeed.name && newFeed.url && addFeed(newFeed)}
                  disabled={!newFeed.name || !newFeed.url}
                  className="flex-1 py-1.5 bg-violet-600 text-white text-[12px] rounded-md hover:bg-violet-700 disabled:opacity-50"
                >添加</button>
                <button onClick={() => setShowAdd(false)} className="px-3 py-1.5 text-[12px] text-slate-600 hover:bg-slate-100 rounded-md">取消</button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowAdd(true)}
              className="w-full py-1.5 flex items-center justify-center gap-1 text-[11.5px] text-slate-500 hover:text-violet-600 hover:bg-violet-50/50 rounded-md border border-dashed border-slate-200"
            >
              <Plus className="w-3 h-3" /> 添加自定义源
            </button>
          )}
        </div>
      )}
    </div>
  );
}