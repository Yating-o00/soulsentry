import React, { useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Search, Sparkles, Heart } from 'lucide-react';
import HeartSignInput from '@/components/heartsign/HeartSignInput';
import HeartSignMessage from '@/components/heartsign/HeartSignMessage';
import HeartSignInsightPanel from '@/components/heartsign/HeartSignInsightPanel';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

/**
 * 心签 - 用户的私人知识库 / 第二大脑
 * 对内: 文件传输助手式的极简记录
 * 对外: 支持链接/文件等外部信息接入
 * AI:   自动摘要 / 标签 / 分类 / 关联 / 外部背景补充
 */
export default function HeartSign() {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const streamRef = useRef(null);
  const pollRef = useRef(null);

  const loadNotes = async () => {
    try {
      const list = await base44.entities.Note.filter({ deleted_at: null }, '-created_date', 100);
      setNotes(list);
    } catch (e) {
      console.error('Load notes failed:', e);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadNotes();
  }, []);

  // 滚动到底部
  useEffect(() => {
    if (streamRef.current) {
      streamRef.current.scrollTop = streamRef.current.scrollHeight;
    }
  }, [notes.length]);

  // 轮询处理中的心签，等 AI 分析完成
  useEffect(() => {
    const hasProcessing = notes.some(n => n.ai_status === 'pending' || n.ai_status === 'processing');
    if (hasProcessing) {
      pollRef.current = setTimeout(loadNotes, 3500);
    }
    return () => clearTimeout(pollRef.current);
  }, [notes]);

  const handleSent = (newNote) => {
    setNotes(prev => [...prev, newNote]);
  };

  const handleDelete = async (note) => {
    if (!confirm('删除这条心签？')) return;
    try {
      await base44.entities.Note.update(note.id, { deleted_at: new Date().toISOString() });
      setNotes(prev => prev.filter(n => n.id !== note.id));
      toast.success('已删除');
    } catch (e) {
      toast.error('删除失败');
    }
  };

  // 搜索过滤（按时间正序展示，最新在底部，类微信对话）
  const filtered = notes
    .filter(n => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (n.plain_text || '').toLowerCase().includes(q)
        || (n.tags || []).some(t => t.toLowerCase().includes(q))
        || (n.ai_analysis?.summary || '').toLowerCase().includes(q);
    })
    .slice()
    .reverse();

  return (
    <div className="h-full flex bg-[#f7f7f7]">
      {/* 主区域 */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* 顶部栏 */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#384877] to-[#3b5aa2] flex items-center justify-center shadow-sm">
              <Heart className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-slate-800 text-[15px]">心签 · 文件传输助手</h1>
              <p className="text-[11px] text-slate-500 flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                自己与自己的连接 · AI 实时归档中
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 max-w-xs flex-1 ml-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索心签内容/标签…"
                className="pl-9 h-9 text-sm bg-slate-50 border-slate-200"
              />
            </div>
          </div>
        </header>

        {/* 消息流 */}
        <div ref={streamRef} className="flex-1 overflow-y-auto px-4 md:px-6 py-6">
          <div className="max-w-3xl mx-auto space-y-5">
            {loading ? (
              <div className="text-center text-slate-400 py-12">加载中…</div>
            ) : filtered.length === 0 && !search ? (
              <div className="text-center py-16">
                <div className="w-20 h-20 mx-auto bg-gradient-to-br from-violet-100 to-purple-100 rounded-full flex items-center justify-center mb-4">
                  <Sparkles className="w-8 h-8 text-violet-500" />
                </div>
                <h3 className="text-slate-800 font-medium mb-2">这是你的私密知识空间</h3>
                <p className="text-slate-500 text-sm max-w-md mx-auto leading-relaxed">
                  像给文件传输助手发消息一样，随时发送文字、链接、文件。<br />
                  AI 会自动理解、归档、关联，沉淀你的个人知识库。
                </p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center text-slate-400 py-12 text-sm">没有匹配的心签</div>
            ) : (
              filtered.map(note => (
                <HeartSignMessage key={note.id} note={note} onDelete={handleDelete} />
              ))
            )}
          </div>
        </div>

        {/* 底部输入 */}
        <HeartSignInput onSent={handleSent} />
      </main>

      {/* 右侧洞察面板 */}
      <HeartSignInsightPanel notes={notes} />
    </div>
  );
}