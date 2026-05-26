import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Heart, Search, RefreshCw, Sparkles, Globe } from "lucide-react";
import HeartSignMessage from "@/components/heartsign/HeartSignMessage";
import HeartSignInput from "@/components/heartsign/HeartSignInput";
import HeartSignInsightPanel from "@/components/heartsign/HeartSignInsightPanel";
import ExternalFeedDialog from "@/components/heartsign/ExternalFeedDialog";
import { format, isToday, isYesterday } from "date-fns";
import { zhCN } from "date-fns/locale";

function dayLabel(d) {
  const date = new Date(d);
  if (isToday(date)) return '今天';
  if (isYesterday(date)) return '昨天';
  return format(date, 'M月d日 EEEE', { locale: zhCN });
}

function groupByDay(notes) {
  const groups = [];
  let lastKey = null;
  notes.forEach(n => {
    const key = format(new Date(n.created_date), 'yyyy-MM-dd');
    if (key !== lastKey) {
      groups.push({ key, label: dayLabel(n.created_date), items: [] });
      lastKey = key;
    }
    groups[groups.length - 1].items.push(n);
  });
  return groups;
}

export default function HeartSign() {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [feedDialogOpen, setFeedDialogOpen] = useState(false);
  const streamRef = useRef(null);

  const load = async () => {
    try {
      // 按时间正序，最新在底部（像聊天）
      const list = await base44.entities.Note.filter({ deleted_at: null }, 'created_date', 200);
      setNotes(list || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // 实时订阅
    const unsub = base44.entities.Note.subscribe?.((event) => {
      if (event.type === 'create') {
        setNotes(prev => [...prev.filter(n => n.id !== event.data.id), event.data]);
      } else if (event.type === 'update') {
        setNotes(prev => prev.map(n => n.id === event.id ? event.data : n));
      } else if (event.type === 'delete') {
        setNotes(prev => prev.filter(n => n.id !== event.id));
      }
    });
    return () => unsub?.();
  }, []);

  useEffect(() => {
    // 滚动到底部
    if (streamRef.current) {
      streamRef.current.scrollTop = streamRef.current.scrollHeight;
    }
  }, [notes.length]);

  const handleSend = async (payload) => {
    // 乐观插入
    const optimistic = { ...payload, id: `tmp-${Date.now()}`, created_date: new Date().toISOString(), ai_status: 'pending' };
    setNotes(prev => [...prev, optimistic]);
    try {
      const created = await base44.entities.Note.create(payload);
      setNotes(prev => prev.map(n => n.id === optimistic.id ? created : n));
      // 触发 AI 分析（异步，不阻塞）
      base44.functions.invoke('analyzeHeartSign', { note_id: created.id }).catch(e => console.error(e));
    } catch (e) {
      setNotes(prev => prev.filter(n => n.id !== optimistic.id));
      console.error(e);
    }
  };

  const filtered = search
    ? notes.filter(n => {
        const q = search.toLowerCase();
        return (n.plain_text || '').toLowerCase().includes(q)
          || (n.ai_analysis?.summary || '').toLowerCase().includes(q)
          || (n.tags || []).some(t => t.toLowerCase().includes(q));
      })
    : notes;

  const groups = groupByDay(filtered);

  return (
    <div className="flex h-full bg-slate-50">
      {/* 主聊天区 */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 顶部栏 */}
        <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-4 md:px-6 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-md">
              <Heart className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-slate-800 text-[15px] leading-tight">心签 · 给自己的传输助手</h1>
              <p className="text-[11px] text-slate-500 flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                AI 实时整理 · 你的私密知识库
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg">
              <Search className="w-3.5 h-3.5 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索心签..."
                className="bg-transparent outline-none text-sm w-40"
              />
            </div>
            <button onClick={() => setFeedDialogOpen(true)} className="px-3 py-1.5 bg-violet-50 hover:bg-violet-100 text-violet-600 rounded-lg text-xs font-medium flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5" />
              外部连接
            </button>
            <button onClick={load} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </header>
        <ExternalFeedDialog open={feedDialogOpen} onOpenChange={setFeedDialogOpen} />

        {/* 消息流 */}
        <div ref={streamRef} className="flex-1 overflow-y-auto px-3 md:px-6 py-4">
          {loading ? (
            <div className="text-center py-12 text-slate-400 text-sm">加载中...</div>
          ) : groups.length === 0 ? (
            <div className="text-center py-16 max-w-md mx-auto">
              <div className="w-16 h-16 bg-gradient-to-br from-violet-100 to-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Sparkles className="w-7 h-7 text-violet-500" />
              </div>
              <h3 className="text-slate-800 font-medium mb-2">这是你的私密空间</h3>
              <p className="text-slate-500 text-sm leading-relaxed">
                像给文件传输助手发消息一样，随时发送文字、链接、文件、图片。<br />
                AI 会自动摘要、打标签、归档，构建你的知识宇宙。
              </p>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-6">
              {groups.map(g => (
                <div key={g.key} className="space-y-3">
                  <div className="flex items-center justify-center my-4">
                    <span className="text-[11px] text-slate-400 bg-slate-100 px-3 py-1 rounded-full">{g.label}</span>
                  </div>
                  {g.items.map(n => (
                    <HeartSignMessage key={n.id} note={n} />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 输入区 */}
        <HeartSignInput onSend={handleSend} />
      </div>

      {/* 右侧洞察面板 */}
      <HeartSignInsightPanel notes={notes} />
    </div>
  );
}