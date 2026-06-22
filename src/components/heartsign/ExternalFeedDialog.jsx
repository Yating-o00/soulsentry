import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { base44 } from "@/api/base44Client";
import { Rss, Mail, Globe, Share2, Plus, RefreshCw, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

const PRESETS = [
  { name: 'Product Hunt 每日精选', feed_type: 'rss', url: 'https://www.producthunt.com/feed', icon: '🔥', description: '产品设计灵感' },
  { name: '36氪 - 早期项目', feed_type: 'rss', url: 'https://36kr.com/feed', icon: '📰', description: '创业动态' },
  { name: 'Hacker News 头条', feed_type: 'rss', url: 'https://news.ycombinator.com/rss', icon: '⚡', description: '技术与创业' },
];

export default function ExternalFeedDialog({ open, onOpenChange }) {
  const [feeds, setFeeds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshingId, setRefreshingId] = useState(null);
  const [newFeed, setNewFeed] = useState({ name: '', url: '', feed_type: 'rss', icon: '📡' });

  const load = async () => {
    setLoading(true);
    try {
      const list = await base44.entities.ExternalFeed.list('-created_date', 50);
      setFeeds(list || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const fetchFeedNow = async (feedId) => {
    const res = await base44.functions.invoke('fetchExternalFeeds', { feed_id: feedId });
    return res?.data || res;
  };

  useEffect(() => {
    if (!open) return undefined;
    load();
    const unsub = base44.entities.ExternalFeed.subscribe?.(() => {
      load();
    });
    return () => unsub?.();
  }, [open]);

  const addFeed = async (data) => {
    try {
      const created = await base44.entities.ExternalFeed.create({
        ...data,
        is_active: true,
        auto_archive_to_heartsign: true
      });

      let fetchResult = null;
      if (created?.id && created?.url) {
        try {
          fetchResult = await fetchFeedNow(created.id);
        } catch (fetchError) {
          toast.error(`已接入，但首次拉取失败：${fetchError.message}`);
        }
      }

      if (fetchResult?.error) {
        toast.error(`已接入，但首次拉取失败：${fetchResult.error}`);
      } else if (fetchResult) {
        toast.success(`已接入 ${data.name}，首次拉取 ${fetchResult.fetched || 0} 条`);
      } else {
        toast.success('已接入：' + data.name);
      }

      setNewFeed({ name: '', url: '', feed_type: 'rss', icon: '📡' });
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-violet-600" />
            外部信息接入 · 拓展你的视野
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* 已接入 */}
          {feeds.length > 0 && (
            <div className="bg-violet-50/50 rounded-xl p-4 border border-violet-100">
              <h4 className="font-medium text-violet-800 mb-3 flex items-center gap-2 text-sm">
                <Rss className="w-4 h-4" /> 已接入 ({feeds.length})
              </h4>
              <div className="space-y-2">
                {feeds.map(f => (
                  <div key={f.id} className="flex items-center justify-between bg-white rounded-lg p-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-8 h-8 bg-violet-100 rounded-lg flex items-center justify-center text-base">{f.icon || '📡'}</div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-slate-800 truncate">{f.name}</div>
                        <div className="text-[11px] text-slate-500 truncate">
                          {f.last_fetched_at ? `上次拉取：${new Date(f.last_fetched_at).toLocaleString('zh-CN')}` : '尚未拉取'}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => refreshFeed(f)} disabled={refreshingId === f.id} className="p-1.5 hover:bg-violet-50 rounded text-violet-600">
                        {refreshingId === f.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                      </button>
                      <button onClick={() => removeFeed(f)} className="p-1.5 hover:bg-rose-50 rounded text-rose-500">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 推荐 */}
          <div className="bg-blue-50/50 rounded-xl p-4 border border-blue-100">
            <h4 className="font-medium text-blue-800 mb-3 flex items-center gap-2 text-sm">
              <Mail className="w-4 h-4" /> 推荐订阅源
            </h4>
            <div className="space-y-2">
              {PRESETS.map(p => {
                const added = existingUrls.has(p.url);
                return (
                  <div key={p.url} className="flex items-center justify-between bg-white rounded-lg p-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center text-base">{p.icon}</div>
                      <div>
                        <div className="text-sm font-medium text-slate-800">{p.name}</div>
                        <div className="text-[11px] text-slate-500">{p.description}</div>
                      </div>
                    </div>
                    <button
                      onClick={() => !added && addFeed(p)}
                      disabled={added}
                      className={`px-3 py-1 text-xs rounded-lg ${added ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-violet-600 text-white hover:bg-violet-700'}`}
                    >
                      {added ? '已接入' : '接入'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 自定义 */}
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
            <h4 className="font-medium text-slate-800 mb-3 flex items-center gap-2 text-sm">
              <Plus className="w-4 h-4" /> 添加自定义源
            </h4>
            <div className="space-y-2">
              <input
                value={newFeed.name}
                onChange={(e) => setNewFeed({ ...newFeed, name: e.target.value })}
                placeholder="名称（如：我关注的 Newsletter）"
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-violet-400"
              />
              <input
                value={newFeed.url}
                onChange={(e) => setNewFeed({ ...newFeed, url: e.target.value })}
                placeholder="RSS / Atom Feed URL"
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-violet-400"
              />
              <button
                onClick={() => newFeed.name && newFeed.url && addFeed(newFeed)}
                disabled={!newFeed.name || !newFeed.url}
                className="w-full py-2 bg-violet-600 text-white text-sm rounded-lg hover:bg-violet-700 disabled:opacity-50"
              >
                添加并自动拉取
              </button>
            </div>
          </div>

          {/* 转发说明 */}
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
            <h4 className="font-medium text-slate-800 mb-2 flex items-center gap-2 text-sm">
              <Share2 className="w-4 h-4" /> 分享接入
            </h4>
            <p className="text-xs text-slate-600">在浏览器/微信看到好内容？直接粘贴链接到心签输入框，AI 自动解析归档。</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
