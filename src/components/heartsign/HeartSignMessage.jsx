import React, { useState } from "react";
import { motion } from "framer-motion";
import { Link as LinkIcon, FileText, Sparkles, Tag, Image as ImageIcon, Mic, Paperclip, ExternalLink, Loader2, ChevronDown, ChevronUp, Globe, MoreHorizontal, Share2, Copy, Trash2, CalendarPlus, ListTodo } from "lucide-react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

// Notion 风的柔和色板：根据 note.color 切换气泡 + AI 卡片的配色
const COLOR_SCHEMES = {
  white:  { bubble: 'bg-white border-slate-200/80',       accent: 'bg-slate-50 border-slate-200/70 text-slate-600',     dot: 'bg-slate-300' },
  red:    { bubble: 'bg-rose-50/60 border-rose-200/70',   accent: 'bg-rose-50 border-rose-200/70 text-rose-700',         dot: 'bg-rose-400' },
  orange: { bubble: 'bg-orange-50/60 border-orange-200/70', accent: 'bg-orange-50 border-orange-200/70 text-orange-700', dot: 'bg-orange-400' },
  yellow: { bubble: 'bg-amber-50/60 border-amber-200/70', accent: 'bg-amber-50 border-amber-200/70 text-amber-700',     dot: 'bg-amber-400' },
  green:  { bubble: 'bg-emerald-50/60 border-emerald-200/70', accent: 'bg-emerald-50 border-emerald-200/70 text-emerald-700', dot: 'bg-emerald-400' },
  teal:   { bubble: 'bg-teal-50/60 border-teal-200/70',   accent: 'bg-teal-50 border-teal-200/70 text-teal-700',         dot: 'bg-teal-400' },
  blue:   { bubble: 'bg-sky-50/60 border-sky-200/70',     accent: 'bg-sky-50 border-sky-200/70 text-sky-700',             dot: 'bg-sky-400' },
  darkblue:{ bubble: 'bg-indigo-50/60 border-indigo-200/70', accent: 'bg-indigo-50 border-indigo-200/70 text-indigo-700', dot: 'bg-indigo-400' },
  purple: { bubble: 'bg-violet-50/60 border-violet-200/70', accent: 'bg-violet-50 border-violet-200/70 text-violet-700', dot: 'bg-violet-400' },
  pink:   { bubble: 'bg-pink-50/60 border-pink-200/70',   accent: 'bg-pink-50 border-pink-200/70 text-pink-700',         dot: 'bg-pink-400' },
  brown:  { bubble: 'bg-stone-50 border-stone-200/80',    accent: 'bg-stone-50 border-stone-200/70 text-stone-700',     dot: 'bg-stone-400' },
  gray:   { bubble: 'bg-slate-50 border-slate-200/80',    accent: 'bg-slate-100 border-slate-200/70 text-slate-700',    dot: 'bg-slate-400' },
};
const getScheme = (color) => COLOR_SCHEMES[color] || COLOR_SCHEMES.white;

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

export default function HeartSignMessage({ note, onDeleted }) {
  const [expanded, setExpanded] = useState(false);
  const ai = note.ai_analysis || {};
  const createdAt = note.created_date ? new Date(note.created_date) : null;
  const isValidDate = createdAt && !isNaN(createdAt.getTime());
  let time = '';
  let fullTime = '';
  if (isValidDate) {
    // 统一使用浏览器本地时区显示完整时间，避免"今天/昨天"判断错位和时区混乱
    fullTime = format(createdAt, 'yyyy年M月d日 HH:mm:ss', { locale: zhCN });
    time = format(createdAt, 'yyyy年M月d日 HH:mm', { locale: zhCN });
  }
  const decodeEntities = (s) => String(s || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
  const rawPlain = note.plain_text || (note.content || '').replace(/<[^>]+>/g, ' ');
  // 解码两次：处理双重编码（&amp;lt; → &lt; → <）
  const plain = decodeEntities(decodeEntities(rawPlain)).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const isLong = plain.length > 300;
  const isReport = plain.length > 800;
  const displayText = expanded || !isLong ? plain : plain.slice(0, 280) + '…';
  const scheme = getScheme(note.color);
  const isOptimistic = typeof note.id === 'string' && note.id.startsWith('tmp-');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(plain);
      toast.success('已复制到剪贴板');
    } catch {
      toast.error('复制失败');
    }
  };

  const handleShare = async () => {
    const text = plain.slice(0, 500);
    if (navigator.share) {
      try {
        await navigator.share({ title: '来自心签', text, url: note.source_url || window.location.href });
      } catch {/* 用户取消 */}
    } else {
      await handleCopy();
      toast.success('已复制，可粘贴分享');
    }
  };

  const handleDelete = async () => {
    if (isOptimistic) return;
    if (!confirm('确认删除这条心签？可在回收站恢复。')) return;
    try {
      await base44.entities.Note.update(note.id, { deleted_at: new Date().toISOString() });
      // 立即从父组件信息流中移除，无需等待实时订阅
      onDeleted?.(note.id);
      toast.success('已删除');
    } catch (e) {
      toast.error('删除失败');
    }
  };

  const handleConvertToTask = async (category) => {
    if (isOptimistic) return;
    try {
      const title = (ai.summary || plain).slice(0, 60) || '来自心签';
      await base44.entities.Task.create({
        title,
        description: plain.slice(0, 1000),
        category: category === 'promise' ? 'personal' : 'work',
        priority: 'medium',
        tags: note.tags || [],
      });
      toast.success(category === 'promise' ? '已转为约定' : '已转为任务');
    } catch (e) {
      toast.error('转换失败');
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="flex justify-end gap-2 group">
      <div className="max-w-[88%] md:max-w-[78%]">
        {/* 用户气泡 - Notion 风格卡片（按 note.color 着色） */}
        <div className={`relative ${scheme.bubble} border rounded-2xl px-4 py-3 shadow-[0_1px_2px_rgba(15,15,15,0.04),0_2px_8px_rgba(15,15,15,0.03)] hover:shadow-[0_2px_4px_rgba(15,15,15,0.05),0_4px_12px_rgba(15,15,15,0.04)] transition-all`}>
          {note.color && note.color !== 'white' && (
            <span className={`absolute -left-2 top-4 w-1 h-6 rounded-full ${scheme.dot}`} aria-hidden />
          )}

          {/* 操作菜单：悬停 / 移动端常驻 */}
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
                  <DropdownMenuItem onSelect={(e) => { e.preventDefault?.(); handleShare(); }}>
                    <Share2 className="w-3.5 h-3.5 mr-2" /> 分享
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={(e) => { e.preventDefault?.(); handleCopy(); }}>
                    <Copy className="w-3.5 h-3.5 mr-2" /> 复制文本
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={(e) => { e.preventDefault?.(); handleConvertToTask('promise'); }}>
                    <CalendarPlus className="w-3.5 h-3.5 mr-2" /> 转为约定
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={(e) => { e.preventDefault?.(); handleDelete(); }}
                    className="text-rose-600 focus:text-rose-700 focus:bg-rose-50"
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-2" /> 删除
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
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

        <div className="text-right mt-1 pr-1">
          <span className="text-[10px] text-slate-400" title={fullTime}>{time}</span>
        </div>

        {/* AI 处理状态 */}
        {(note.ai_status === 'pending' || note.ai_status === 'processing') && (
          <div className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-slate-500 bg-slate-50 border border-slate-200/70 rounded-md px-2.5 py-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            AI 正在理解、整理、关联…
          </div>
        )}
        {note.ai_status === 'failed' && (
          <div className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-rose-600 bg-rose-50 border border-rose-200/70 rounded-md px-2.5 py-1">
            AI 分析失败
          </div>
        )}

        {/* AI 知识卡片 - Notion 风内联块 */}
        {note.ai_status === 'completed' && ai.summary && (
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
            className={`mt-2 ${scheme.bubble} border rounded-2xl p-4 shadow-[0_1px_2px_rgba(15,15,15,0.04),0_2px_8px_rgba(15,15,15,0.03)] hover:shadow-[0_2px_4px_rgba(15,15,15,0.05),0_4px_12px_rgba(15,15,15,0.04)] transition-all`}>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-5 h-5 rounded-md bg-slate-100 flex items-center justify-center">
                <Sparkles className="w-3 h-3 text-slate-600" />
              </div>
              <span className="text-[11.5px] font-medium text-slate-500 tracking-wide">
                {isReport ? '长文摘要' : note.source_type === 'external_feed' ? '外部信息已解析' : 'AI 智能处理'}
              </span>
              {ai.category && (
                <span className="ml-auto text-[10.5px] px-2 py-0.5 bg-slate-50 text-slate-600 rounded-md border border-slate-200/70">{ai.category}</span>
              )}
            </div>

            <p className="text-[13.5px] text-slate-800 leading-[1.7] mb-3">{ai.summary}</p>

            {ai.key_points?.length > 0 && (
              <div className="mb-3 pl-3 border-l-2 border-slate-200">
                <ul className="space-y-1.5">
                  {ai.key_points.slice(0, isReport ? 6 : 4).map((p, i) => (
                    <li key={i} className="text-[12.5px] text-slate-600 leading-relaxed flex gap-2">
                      <span className="text-slate-400 mt-0.5">·</span>
                      <span className="flex-1">{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {note.tags?.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-3 pt-3 border-t border-slate-100">
                {note.tags.slice(0, 6).map((t, i) => (
                  <span key={i} className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-slate-50 text-slate-600 text-[10.5px] rounded-md border border-slate-200/60">
                    <Tag className="w-2.5 h-2.5" />{t}
                  </span>
                ))}
              </div>
            )}

            {ai.related_topics?.length > 0 && (
              <div className="mt-3 text-[11.5px] text-slate-500 bg-slate-50/70 border border-slate-200/60 rounded-lg px-3 py-2 leading-relaxed">
                <span className="font-medium text-slate-700">拓展视野 · </span>
                {ai.related_topics.slice(0, 3).join(' · ')}
              </div>
            )}
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}