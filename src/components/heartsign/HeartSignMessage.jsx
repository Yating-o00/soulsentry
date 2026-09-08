import React, { useState } from "react";
import { motion } from "framer-motion";
import { Link as LinkIcon, FileText, Sparkles, Tag, Image as ImageIcon, Mic, Paperclip, ExternalLink, Loader2, ChevronDown, ChevronUp, Globe, MoreHorizontal, Share2, Copy, Trash2, CalendarPlus, RefreshCw, BookOpen, Lock, Check, PenLine, Pin, Send } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import KeywordExplorer from "@/components/heartsign/KeywordExplorer";
import WarmResponseCard from "@/components/heartsign/WarmResponseCard";
import HeartSignShareCard from "@/components/heartsign/HeartSignShareCard";
import { TYPE_META, DENSITY_KEY, getNoteType, isPinnedNote } from "@/components/heartsign/heartSignMeta";

// 心签五类分类（与 analyzeHeartSign 写入的 source_type / metadata.ai_analysis.category 对应）
export const HEARTSIGN_CATEGORIES = [
  { type: 'emotion', label: '情绪' },
  { type: 'inspiration', label: '灵感' },
  { type: 'material', label: '资料' },
  { type: 'memo', label: '备忘' },
  { type: 'share', label: '分享' },
];

// 卡内小按钮（操作条 / 继续聊聊）
const OP_CLS = "inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-[#384877] hover:bg-slate-50 rounded-md px-2 py-1 transition-colors";

// 理性内容的「知识补充」卡：白色卡面 + 品牌蓝细条，底部关键词可拓展外部链接
function KnowledgeCard({ ai, plain }) {
  if (!ai?.emotional_response) return null;
  const keywords = [...(ai.key_points || []), ...(ai.related_topics || [])];
  return (
    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
      className="relative mt-2 rounded-2xl p-4 border border-slate-200/80 bg-white overflow-hidden">
      {/* 左侧品牌蓝细条（对齐 AI 卡风格） */}
      <span className="absolute left-0 top-0 bottom-0 w-[2px] bg-[#384877]/40" aria-hidden />

      <div className="flex items-center gap-2 mb-2.5">
        <div className="w-5 h-5 rounded-md bg-[#384877]/10 flex items-center justify-center">
          <BookOpen className="w-3 h-3 text-[#384877]" />
        </div>
        <span className="text-[11.5px] font-medium text-[#384877]/80 tracking-wide">
          {ai.response_title || '知识补充'}
        </span>
      </div>

      <p className="text-[13.5px] text-slate-700 leading-[1.8] whitespace-pre-wrap break-words">{ai.emotional_response}</p>

      {keywords.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-100">
          <div className="flex flex-wrap gap-x-2 gap-y-1.5">
            {keywords.slice(0, 6).map((k, i) => (
              <KeywordExplorer key={i} keyword={k} context={ai.summary || plain} inline />
            ))}
          </div>
          <div className="mt-2 text-[10.5px] text-slate-400">点击关键词 · 拓展相关知识与链接</div>
        </div>
      )}
    </motion.div>
  );
}

// 后端标记的敏感心签：原文不展示，引导在保险柜中查看
function VaultLockedCard({ note, onDelete, onVaultRequest, isOptimistic }) {
  const createdAt = note.created_date ? new Date(note.created_date) : null;
  const time = createdAt && !isNaN(createdAt.getTime())
    ? new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(createdAt)
    : '';
  return (
    <div className="space-y-2">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="flex justify-end gap-2 group">
        <div className="max-w-[88%] md:max-w-[78%] w-full">
          <div className="relative bg-white border border-slate-200 rounded-2xl px-4 py-4 shadow-[0_1px_2px_rgba(15,15,15,0.04),0_2px_8px_rgba(15,15,15,0.03)]">
            {!isOptimistic && (
              <div
                className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity md:opacity-0"
                onClick={(e) => e.stopPropagation()}
              >
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      onClick={(e) => e.stopPropagation()}
                      className="w-7 h-7 rounded-full bg-white border border-slate-200 shadow-sm hover:bg-slate-50 flex items-center justify-center text-slate-500"
                      aria-label="更多操作"
                    >
                      <MoreHorizontal className="w-3.5 h-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenuItem onSelect={(e) => { e.preventDefault?.(); onVaultRequest?.(note); }}>
                      <Lock className="w-3.5 h-3.5 mr-2" /> 移入保险柜
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={(e) => { e.preventDefault?.(); onDelete(); }}
                      className="text-rose-600 focus:text-rose-700 focus:bg-rose-50"
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-2" /> 删除
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
            <div className="flex items-center gap-3">
              <span className="w-9 h-9 rounded-full bg-[#384877]/8 border border-[#384877]/15 flex items-center justify-center flex-shrink-0">
                <Lock className="w-4 h-4 text-[#384877]" />
              </span>
              <div>
                <div className="text-[13.5px] font-medium text-slate-700">敏感内容已被保护</div>
                <div className="text-[11.5px] text-slate-400 mt-0.5">原文已加密存证，不在信息流中展示</div>
              </div>
            </div>
          </div>
          <div className="mt-1 text-right pr-1">
            <span className="text-[10px] text-slate-400">{time}</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function SourceBadge({ note }) {
  const map = {
    manual: null,
    web_link: { icon: <LinkIcon className="w-3 h-3" />, label: '链接' },
    file: { icon: <FileText className="w-3 h-3" />, label: '文件' },
    image: { icon: <ImageIcon className="w-3 h-3" />, label: '图片' },
    voice: { icon: <Mic className="w-3 h-3" />, label: '语音' },
    external_feed: { icon: <Globe className="w-3 h-3" />, label: '外部信息' },
    wechat_share: { icon: <ExternalLink className="w-3 h-3" />, label: '微信转发' },
  };
  const cfg = map[note.source_type];
  if (!cfg) return null;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-medium border border-slate-200/70">
      {cfg.icon}{cfg.label}
    </span>
  );
}

// 卡内对话线程：渲染 followupHeartSign 写入 metadata.conversation 的多轮对话
function ConversationThread({ conv, typing }) {
  if (!conv.length && !typing) return null;
  return (
    <div className="mt-3 pt-3 border-t border-slate-100 space-y-2.5">
      {conv.map((m, i) => m.role === 'user' ? (
        <div key={i} className="flex justify-end">
          <div className="max-w-[85%] bg-slate-50 border border-slate-200/70 rounded-2xl rounded-br-md px-3 py-2 text-[13px] text-slate-700 leading-relaxed whitespace-pre-wrap break-words">
            {m.text}
          </div>
        </div>
      ) : m.typing ? (
        <div key={i} className="flex justify-start">
          <div className="inline-flex items-center gap-1.5 text-[11px] text-slate-400 bg-white border border-slate-100 rounded-2xl px-3 py-2">
            <Loader2 className="w-3 h-3 animate-spin" /> 另一个你 正在倾听…
          </div>
        </div>
      ) : (
        <div key={i} className="flex justify-start">
          <div className="max-w-[85%]">
            <div className="text-[10px] text-slate-400 mb-0.5">另一个你{m.tag ? ` · ${m.tag}` : ''}</div>
            <div className="bg-white border border-slate-200/80 rounded-2xl rounded-bl-md px-3 py-2 text-[13px] text-slate-600 leading-relaxed whitespace-pre-wrap break-words">
              {m.text}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function HeartSignMessage({
  note,
  flash,
  onDeleted,
  onRestore,
  onTypeChange,
  onVaultRequest,
  onPinnedChange,
  onConvertToTask,
  onSaveToKnowledge,
}) {
  const [expanded, setExpanded] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [localConv, setLocalConv] = useState(null); // 卡内对话的本地乐观态
  const [followText, setFollowText] = useState("");
  const [followSending, setFollowSending] = useState(false);
  const ai = note.ai_analysis || {};
  const typeKey = getNoteType(note);
  const conv = localConv || note.metadata?.conversation || [];

  // 携带笔记内容一起传给后端，绕开后端"查不到笔记"的数据隔离问题
  const buildNoteData = () => ({
    plain_text: note.plain_text,
    content: note.content,
    source_type: note.source_type,
    source_url: note.source_url,
    attachments: note.attachments,
    tags: note.tags,
  });

  const handleRetry = async () => {
    if (retrying || isOptimistic) return;
    setRetrying(true);
    try {
      await base44.functions.invoke('analyzeHeartSign', { note_id: note.id, note_data: buildNoteData() });
      toast.success('已重新分析');
    } catch (e) {
      toast.error('重试失败，请稍后再试');
    } finally {
      setRetrying(false);
    }
  };

  // 长时间卡在 pending 的旧记录：进入页面时自动补触发一次分析
  React.useEffect(() => {
    if (note.ai_status !== 'pending') return;
    if (typeof note.id === 'string' && note.id.startsWith('tmp-')) return;
    const age = Date.now() - new Date(note.created_date || 0).getTime();
    if (age < 30000) return; // 刚创建的交给创建流程处理，避免重复
    base44.functions.invoke('analyzeHeartSign', {
      note_id: note.id,
      note_data: buildNoteData(),
    }).catch(() => {});

  }, [note.id]);
  const createdAt = note.created_date ? new Date(note.created_date) : null;
  const isValidDate = createdAt && !isNaN(createdAt.getTime());
  let time = '';
  let fullTime = '';
  if (isValidDate) {
    // 统一以北京时间（Asia/Shanghai）显示，避免设备时区不同导致时间错乱
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).formatToParts(createdAt).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
    const y = parts.year, mo = +parts.month, d = +parts.day;
    const hh = parts.hour === '24' ? '00' : parts.hour, mm = parts.minute, ss = parts.second;
    time = `${y}年${mo}月${d}日 ${hh}:${mm}`;
    fullTime = `${y}年${mo}月${d}日 ${hh}:${mm}:${ss}`;
  }
  const decodeEntities = (s) => String(s || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
  // 保留原文换行：用换行替换块级标签，再去除其余标签
  const rawPlain = note.plain_text || (note.content || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|blockquote|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  // 解码两次：处理双重编码（&amp;lt; → &lt; → <）
  // 保留换行/空行，仅清理行尾空格并把连续多空行压缩为最多一个空行
  const plain = decodeEntities(decodeEntities(rawPlain))
    .replace(/<[^>]+>/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
  const isLong = plain.length > 300;
  const isReport = plain.length > 800;
  const displayText = expanded || !isLong ? plain : plain.slice(0, 280) + '…';
  const isOptimistic = typeof note.id === 'string' && note.id.startsWith('tmp-');
  // 纯外部信息（外部订阅源 / 网页链接 / 微信转发）靠左对齐，与用户自建内容（靠右）区分
  const isExternal = ['external_feed', 'web_link', 'wechat_share'].includes(note.source_type);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(plain);
      toast.success('已复制到剪贴板');
    } catch {
      toast.error('复制失败');
    }
  };

  const handleShare = () => {
    setShareOpen(true);
  };

  // 删除交给父级统一处理（乐观移除 + 服务端软删除 + 失败回滚），避免双发
  const handleDelete = () => {
    if (isOptimistic) return;
    onDeleted?.(note.id);
  };

  // 卡内继续对话：乐观上屏 → followupHeartSign → 用服务端返回的完整会话替换
  const handleFollow = async () => {
    const text = followText.trim();
    if (!text || followSending || isOptimistic) return;
    const now = new Date().toISOString();
    const optimisticConv = [...conv, { role: 'user', text, ts: now }];
    setLocalConv(optimisticConv);
    setFollowText('');
    setFollowSending(true);
    try {
      const round = conv.filter((m) => m.role === 'user').length + 1;
      const density = localStorage.getItem(DENSITY_KEY) || 'light';
      const { data } = await base44.functions.invoke('followupHeartSign', {
        note_id: note.id,
        text,
        round,
        density,
      });
      if (Array.isArray(data?.conversation)) {
        setLocalConv(data.conversation);
      } else {
        setLocalConv(optimisticConv.filter((m) => !m.typing));
      }
    } catch (e) {
      setLocalConv(conv);
      toast.error('发送失败，请重试');
    } finally {
      setFollowSending(false);
    }
  };

  // 「分错了」纠正：乐观更新由父级统一处理（缓存 + 服务端 + 回滚）
  const handleTypeChange = (cat) => {
    if (isOptimistic || cat.type === typeKey) return;
    onTypeChange?.(note, cat.type, cat.label);
  };

  // 后端已标记的敏感心签：渲染锁定卡，不展示原文与 AI 卡
  const isVault = note.source_type === 'vault' || note.metadata?.is_vault;
  if (isVault) {
    return (
      <VaultLockedCard
        note={note}
        isOptimistic={isOptimistic}
        onDelete={handleDelete}
        onVaultRequest={onVaultRequest}
      />
    );
  }

  // 理性内容（资料/知识类）：用「知识补充」卡替代温暖回应卡
  const isRational = ai.emotional_response && (ai.is_emotional === false || ai.response_tag === '理性补充');

  return (
   <div data-hs-id={note.id} data-hs-type={typeKey} className={`hs-card ${flash ? 'hs-flash' : ''}`}>
    <HeartSignShareCard note={note} text={plain} open={shareOpen} onClose={() => setShareOpen(false)} />

    {/* 卡头：类型 chip + 置顶标记 + 时间 + 分错了纠正 */}
    <div className="flex items-center gap-2 mb-2">
      <span className="hs-type-chip">{TYPE_META[typeKey]?.label || '心签'}签</span>
      {isPinnedNote(note) && <Pin className="w-3 h-3 text-[#384877] fill-[#384877]" />}
      <span className="text-[10px] text-slate-400 ml-auto" title={fullTime}>{time}</span>
      {!isOptimistic && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              onClick={(e) => e.stopPropagation()}
              title="分错了？点击纠正"
              className="inline-flex items-center gap-0.5 text-[10.5px] text-slate-400 hover:text-[#384877] transition-colors"
            >
              分错了<PenLine className="w-2.5 h-2.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuLabel className="text-[10.5px] text-slate-400">分错了？重新归类</DropdownMenuLabel>
            {HEARTSIGN_CATEGORIES.map((c) => (
              <DropdownMenuItem
                key={c.type}
                onSelect={(e) => { e.preventDefault?.(); handleTypeChange(c); }}
                className="text-xs"
              >
                <Check className={`w-3.5 h-3.5 mr-2 ${typeKey === c.type ? 'opacity-100' : 'opacity-0'}`} />
                {c.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>

    {/* 用户气泡 */}
    <div className={`flex ${isExternal ? 'justify-start' : 'justify-end'}`}>
      <div className="max-w-[88%] md:max-w-[78%] w-full">
        <div className="relative bg-white border border-slate-200/80 rounded-2xl px-4 py-3">
          {(note.source_type !== 'manual' || isReport || note.source_url) && (
            <div className="flex items-center gap-1.5 mb-2 flex-wrap">
              <SourceBadge note={note} />
              {isReport && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200/70 text-[10px] font-medium">
                  <FileText className="w-3 h-3" /> 长文本 · {plain.length}字
                </span>
              )}
              {note.source_url && (
                <a href={note.source_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-[11px] text-slate-500 hover:text-slate-700 truncate max-w-[200px] inline-flex items-center gap-1">
                  <LinkIcon className="w-3 h-3" />{note.source_url.replace(/^https?:\/\//, '')}
                </a>
              )}
            </div>
          )}
          <div className="text-[14.5px] leading-[1.7] text-slate-800 whitespace-pre-wrap break-words">
            {displayText || <span className="text-slate-400">（空内容）</span>}
          </div>
          {isLong && (
            <button onClick={(e) => { e.stopPropagation(); setExpanded(v => !v); }} className="mt-2 inline-flex items-center gap-1 text-[12px] text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-md px-2 py-1 transition">
              {expanded ? <>收起 <ChevronUp className="w-3 h-3" /></> : <>展开全文 <ChevronDown className="w-3 h-3" /></>}
            </button>
          )}
          {note.attachments?.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {note.attachments.map((a, i) => (
                <a key={i} href={a.file_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                  className="flex items-center gap-2 px-2.5 py-2 bg-slate-50 border border-slate-200/70 rounded-lg text-[12px] text-slate-700 hover:bg-slate-100 hover:border-slate-300 transition">
                  <Paperclip className="w-3.5 h-3.5 text-slate-400" />
                  <span className="truncate flex-1">{a.file_name || '附件'}</span>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>

    {/* 所有非用户编辑的 AI 内容 —— 统一置于签卡左侧 */}
    <div className="flex justify-start mt-2">
      <div className="max-w-[88%] md:max-w-[78%] w-full">
        {/* AI 处理状态 */}
        {(note.ai_status === 'pending' || note.ai_status === 'processing') && (
          <div className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 bg-slate-50 border border-slate-200/70 rounded-md px-2.5 py-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            AI 正在理解、整理、关联…
          </div>
        )}
        {note.ai_status === 'failed' && (
          <button
            onClick={handleRetry}
            disabled={retrying}
            className="inline-flex items-center gap-1.5 text-[11px] text-rose-600 bg-rose-50 border border-rose-200/70 rounded-md px-2.5 py-1 hover:bg-rose-100 transition disabled:opacity-60"
          >
            {retrying ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            AI 分析失败 · 点击重试
          </button>
        )}

        {/* 感性温暖回应 / 理性知识补充 —— 置于智能处理之前 */}
        {note.ai_status === 'completed' && (
          isRational
            ? <KnowledgeCard ai={ai} plain={plain} />
            : <WarmResponseCard ai={ai} />
        )}

        {/* AI 知识卡片 - 主题色低调风格 */}
        {note.ai_status === 'completed' && ai.summary && (
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
            className="relative mt-2 rounded-2xl p-4 border border-[#384877]/15 bg-[#384877]/[0.03] hover:bg-[#384877]/[0.045] transition-all overflow-hidden">
            {/* 左侧主题色细条 */}
            <span className="absolute left-0 top-0 bottom-0 w-[2px] bg-[#384877]/40" aria-hidden />

            <div className="flex items-center gap-2 mb-3">
              <div className="w-5 h-5 rounded-md bg-[#384877]/10 flex items-center justify-center">
                <Sparkles className="w-3 h-3 text-[#384877]" />
              </div>
              <span className="text-[11.5px] font-medium text-[#384877]/80 tracking-wide">
                {isReport ? '长文摘要' : note.source_type === 'external_feed' ? '外部信息已解析' : 'AI 智能处理'}
              </span>
            </div>

            <p className="text-[13.5px] text-slate-800 leading-[1.7] mb-3">{ai.summary}</p>

            {ai.key_points?.length > 0 && (
              <div className="mb-3 pl-3 border-l-2 border-[#384877]/20">
                <ul className="space-y-1.5">
                  {ai.key_points.slice(0, isReport ? 6 : 4).map((p, i) => (
                    <li key={i} className="text-[12.5px] text-slate-600 leading-relaxed flex flex-wrap gap-x-2 gap-y-1 items-start">
                      <span className="text-[#384877]/40 mt-0.5">·</span>
                      <KeywordExplorer keyword={p} context={ai.summary || plain} inline />
                    </li>
                  ))}
                </ul>
                <div className="mt-2 text-[10.5px] text-slate-400">点击关键词 · 展开外部相关内容与链接</div>
              </div>
            )}

            {note.tags?.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-3 pt-3 border-t border-[#384877]/10">
                {note.tags.slice(0, 6).map((t, i) => (
                  <span key={i} className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-white text-[#384877]/75 text-[10.5px] rounded-md border border-[#384877]/15">
                    <Tag className="w-2.5 h-2.5" />{t}
                  </span>
                ))}
              </div>
            )}

            {ai.related_topics?.length > 0 && (
              <div className="mt-3 text-[11.5px] text-slate-600 bg-white/70 border border-[#384877]/12 rounded-lg px-3 py-2 leading-relaxed">
                <span className="font-medium text-[#384877]/80">拓展视野 · </span>
                {ai.related_topics.slice(0, 3).join(' · ')}
              </div>
            )}
          </motion.div>
        )}
      </div>
    </div>

    {/* 卡内对话线程（followupHeartSign → metadata.conversation） */}
    <ConversationThread conv={conv} typing={followSending} />

    {/* 卡内继续聊聊 */}
    {!isOptimistic && (
      <div
        className="mt-3 pt-2 border-t border-dashed border-slate-100 flex items-center gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          value={followText}
          onChange={(e) => setFollowText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleFollow(); } }}
          placeholder="继续聊聊…"
          className="flex-1 min-w-0 bg-transparent outline-none text-[13px] text-slate-700 placeholder:text-slate-300 px-1 py-1.5"
        />
        <button
          onClick={handleFollow}
          disabled={followSending || !followText.trim()}
          title="发送"
          className="w-7 h-7 rounded-lg text-[#384877] hover:bg-slate-50 flex items-center justify-center transition disabled:opacity-40"
        >
          {followSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
        </button>
      </div>
    )}

    {/* 卡内操作条 */}
    {!isOptimistic && (
      <div
        className="mt-1.5 flex items-center gap-0.5 flex-wrap"
        onClick={(e) => e.stopPropagation()}
      >
        <button className={OP_CLS} onClick={() => onPinnedChange?.(note)} title={isPinnedNote(note) ? '取消置顶' : '置顶'}>
          <Pin className={`w-3 h-3 ${isPinnedNote(note) ? 'text-[#384877] fill-[#384877]' : ''}`} />
          {isPinnedNote(note) ? '已置顶' : '置顶'}
        </button>
        <button className={OP_CLS} onClick={() => onConvertToTask?.(note)}>
          <CalendarPlus className="w-3 h-3" /> 转为约定
        </button>
        <button className={OP_CLS} onClick={() => onSaveToKnowledge?.(note)}>
          <BookOpen className="w-3 h-3" /> 沉淀知识库
        </button>
        <button className={OP_CLS} onClick={handleShare}>
          <Share2 className="w-3 h-3" /> 分享
        </button>
        <button className={OP_CLS} onClick={handleCopy}>
          <Copy className="w-3 h-3" /> 复制
        </button>
        <button
          className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md px-2 py-1 transition-colors"
          onClick={handleDelete}
        >
          <Trash2 className="w-3 h-3" /> 删除
        </button>
      </div>
    )}
   </div>
  );
}
