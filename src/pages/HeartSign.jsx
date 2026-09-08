import React, { useState, useEffect, useRef, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Heart, Search, RefreshCw, Sparkles, Globe, User, Lock } from "lucide-react";
import { toast } from "sonner";
import HeartSignMessage, { HEARTSIGN_CATEGORIES } from "@/components/heartsign/HeartSignMessage";
import HeartSignInput from "@/components/heartsign/HeartSignInput";
import HeartSignInsightPanel from "@/components/heartsign/HeartSignInsightPanel";
import ExternalFeedDialog from "@/components/heartsign/ExternalFeedDialog";
import VaultDialog from "@/components/heartsign/VaultDialog";
import { detectSensitive } from "@/components/heartsign/detectSensitive";
import { isStandaloneMode } from "@/api/platformConfig";
import { format, isToday, isYesterday } from "date-fns";
import { zhCN } from "date-fns/locale";
import { useTrialGate } from "@/hooks/useTrialGate";
import RegisterPromptModal from "@/components/auth/RegisterPromptModal";

// 独立后端把 AI 分析结果放在 metadata.ai_analysis，这里统一提升到 note.ai_analysis 便于读取
const normalizeNote = (n) => ({
  ...n,
  ai_analysis: n.ai_analysis || n.metadata?.ai_analysis || null,
});

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

// 按 created_date 升序（最旧 → 最新），保证聊天信息流顺序正确
function sortByTimeAsc(list) {
  return [...list].sort((a, b) => {
    const ta = new Date(a.created_date || 0).getTime();
    const tb = new Date(b.created_date || 0).getTime();
    return ta - tb;
  });
}

export default function HeartSign() {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [feedDialogOpen, setFeedDialogOpen] = useState(false);
  const [onlyMine, setOnlyMine] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [vaultOpen, setVaultOpen] = useState(false);
  const [vaultInitialValue, setVaultInitialValue] = useState(null);
  const [vaultPendingNote, setVaultPendingNote] = useState(null);
  const streamRef = useRef(null);
  const { checkTrial, showPrompt, promptFeature, closePrompt } = useTrialGate();

  // 纯外部信息来源（外部订阅源 / 网页链接 / 微信转发）
  const EXTERNAL_SOURCES = ['external_feed', 'web_link', 'wechat_share'];

  const load = async () => {
    try {
      // 拉取后按 created_date 升序排列，最新在底部（聊天信息流）
      const list = await base44.entities.Note.filter({ deleted_at: null }, '-created_date', 200);
      setNotes(sortByTimeAsc((list || []).map(normalizeNote)));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // 独立后端无实时推送：分析是异步的，轮询补拉一次最新状态（最多约 30 秒）
  const refreshNoteWhenDone = async (id) => {
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 3000));
      try {
        const fresh = normalizeNote(await base44.entities.Note.get(id));
        if (fresh?.ai_status && fresh.ai_status !== 'pending' && fresh.ai_status !== 'processing') {
          setNotes(prev => sortByTimeAsc(prev.map(n => (n.id === id ? { ...n, ...fresh } : n))));
          return;
        }
      } catch (e) {
        return;
      }
    }
  };

  useEffect(() => {
    load();
    // 实时订阅
    const unsub = base44.entities.Note.subscribe?.((event) => {
      if (event.type === 'create') {
        if (event.data?.deleted_at) return;
        const data = normalizeNote(event.data);
        setNotes(prev => sortByTimeAsc([...prev.filter(n => n.id !== data.id), data]));
      } else if (event.type === 'update') {
        // 若该条被软删除，则从信息流中移除
        if (event.data?.deleted_at) {
          setNotes(prev => prev.filter(n => n.id !== event.id));
          return;
        }
        const data = normalizeNote(event.data);
        setNotes(prev => sortByTimeAsc(prev.map(n => (n.id === event.id ? data : n))));
      } else if (event.type === 'delete') {
        setNotes(prev => prev.filter(n => n.id !== event.id));
      }
    });
    return () => unsub?.();
  }, []);

  useEffect(() => {
    // 滚动到底部（最新在下，聊天信息流）
    if (streamRef.current) {
      streamRef.current.scrollTop = streamRef.current.scrollHeight;
    }
  }, [notes.length]);

  const handleSend = async (payload) => {
    const allowed = checkTrial("heart_sign", "心签");
    if (!allowed) return;

    // 敏感信息拦截：不创建心签，引导存入保险柜
    const hit = detectSensitive(payload.plain_text);
    if (hit) {
      toast.warning(`检测到敏感信息（${hit.label}），建议存入保险柜`, { description: '保险柜内容独立加密，不会进入 AI 分析' });
      setVaultPendingNote(null);
      setVaultInitialValue(payload.plain_text);
      setVaultOpen(true);
      return;
    }

    // 乐观插入
    const optimistic = { ...payload, id: `tmp-${Date.now()}`, created_date: new Date().toISOString(), ai_status: 'pending' };
    setNotes(prev => sortByTimeAsc([...prev, optimistic]));
    try {
      const created = await base44.entities.Note.create(payload);
      setNotes(prev => sortByTimeAsc(prev.map(n => n.id === optimistic.id ? created : n)));
      // 触发 AI 分析（异步，不阻塞）——直接带上笔记内容，绕开后端"查不到笔记"的隔离问题
      base44.functions.invoke('analyzeHeartSign', {
        note_id: created.id,
        note_data: {
          plain_text: created.plain_text,
          content: created.content,
          source_type: created.source_type,
          source_url: created.source_url,
          attachments: created.attachments,
          tags: created.tags,
        },
      }).catch(e => console.error(e));
      // 独立后端无实时推送，轮询补拉分析结果
      refreshNoteWhenDone(created.id);
    } catch (e) {
      setNotes(prev => prev.filter(n => n.id !== optimistic.id));
      console.error(e);
    }
  };

  // 「分错了」纠正：HeartSignMessage 乐观调用，这里同步本地 state（source_type + 中英文分类）
  const handleTypeChange = (id, newType, newLabel) => {
    setNotes(prev => prev.map(n => {
      if (n.id !== id) return n;
      const prevAi = n.ai_analysis || {};
      const prevMetaAi = n.metadata?.ai_analysis || {};
      return {
        ...n,
        source_type: newType,
        ai_analysis: { ...prevAi, category: newLabel },
        metadata: { ...n.metadata, ai_analysis: { ...prevMetaAi, category: newLabel } },
      };
    }));
  };

  const handleVaultRequest = (note) => {
    if (!isStandaloneMode) {
      toast.error('当前环境不支持保险柜');
      return;
    }
    setVaultInitialValue(null);
    setVaultPendingNote(note);
    setVaultOpen(true);
  };

  const handleVaultButton = () => {
    if (!isStandaloneMode) {
      toast.error('当前环境不支持保险柜');
      return;
    }
    setVaultInitialValue(null);
    setVaultPendingNote(null);
    setVaultOpen(true);
  };

  const handleVaultDialogChange = (open) => {
    setVaultOpen(open);
    if (!open) {
      setVaultInitialValue(null);
      setVaultPendingNote(null);
    }
  };

  const handleVaulted = (id) => {
    setNotes(prev => prev.filter(n => n.id !== id));
  };

  // 各类计数（纯前端）
  const categoryCounts = useMemo(() => {
    const counts = { all: notes.length };
    HEARTSIGN_CATEGORIES.forEach(c => {
      counts[c.type] = notes.filter(n => n.source_type === c.type).length;
    });
    return counts;
  }, [notes]);

  let filtered = onlyMine
    ? notes.filter(n => !EXTERNAL_SOURCES.includes(n.source_type))
    : notes;
  if (categoryFilter !== 'all') {
    filtered = filtered.filter(n => n.source_type === categoryFilter);
  }
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(n =>
      (n.plain_text || '').toLowerCase().includes(q)
      || (n.ai_analysis?.summary || '').toLowerCase().includes(q)
      || (n.tags || []).some(t => t.toLowerCase().includes(q))
    );
  }

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
            <button
              onClick={() => setOnlyMine(v => !v)}
              title={onlyMine ? '当前只显示我自建的内容，点击显示全部' : '只显示我自建的内容'}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${
                onlyMine
                  ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200'
              }`}
            >
              <User className="w-3.5 h-3.5" />
              {onlyMine ? '仅我的内容' : '全部内容'}
            </button>
            <button onClick={() => setFeedDialogOpen(true)} className="px-3 py-1.5 bg-violet-50 hover:bg-violet-100 text-violet-600 rounded-lg text-xs font-medium flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5" />
              外部连接
            </button>
            <button onClick={handleVaultButton} title="保险柜：安全存放敏感信息" className="p-2 hover:bg-slate-100 rounded-lg text-slate-500">
              <Lock className="w-4 h-4" />
            </button>
            <button onClick={load} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </header>
        <ExternalFeedDialog open={feedDialogOpen} onOpenChange={setFeedDialogOpen} />
        <VaultDialog
          open={vaultOpen}
          onOpenChange={handleVaultDialogChange}
          initialValue={vaultInitialValue}
          pendingNote={vaultPendingNote}
          onVaulted={handleVaulted}
        />

        {/* 五类分类过滤条 */}
        <div className="bg-white border-b border-slate-100 px-4 md:px-6 py-2 flex items-center gap-1.5 overflow-x-auto flex-shrink-0">
          <button
            onClick={() => setCategoryFilter('all')}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border transition-colors ${
              categoryFilter === 'all'
                ? 'bg-[#384877] text-white border-[#384877]'
                : 'bg-white text-slate-600 border-slate-200 hover:border-[#384877]/40 hover:text-[#384877]'
            }`}
          >
            全部
            <span className={`text-[10px] ${categoryFilter === 'all' ? 'text-white/70' : 'text-slate-400'}`}>{categoryCounts.all}</span>
          </button>
          {HEARTSIGN_CATEGORIES.map(c => {
            const active = categoryFilter === c.type;
            return (
              <button
                key={c.type}
                onClick={() => setCategoryFilter(active ? 'all' : c.type)}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border transition-colors ${
                  active
                    ? 'bg-[#384877] text-white border-[#384877]'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-[#384877]/40 hover:text-[#384877]'
                }`}
              >
                {c.label}
                <span className={`text-[10px] ${active ? 'text-white/70' : 'text-slate-400'}`}>{categoryCounts[c.type]}</span>
              </button>
            );
          })}
        </div>

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
                    <HeartSignMessage
                      key={n.id}
                      note={n}
                      onDeleted={(id) => setNotes(prev => prev.filter(x => x.id !== id))}
                      onRestore={(restored) => setNotes(prev => sortByTimeAsc([...prev.filter(x => x.id !== restored.id), restored]))}
                      onTypeChange={handleTypeChange}
                      onVaultRequest={handleVaultRequest}
                    />
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
      <RegisterPromptModal
        open={showPrompt}
        onOpenChange={closePrompt}
        featureName={promptFeature}
      />
    </div>
  );
}