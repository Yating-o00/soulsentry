import React, { useState } from "react";
import { motion } from "framer-motion";
import { Link as LinkIcon, FileText, Sparkles, Tag, Image as ImageIcon, Mic, Paperclip, ExternalLink, Loader2, ChevronDown, ChevronUp, Globe } from "lucide-react";
import { format } from "date-fns";

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

export default function HeartSignMessage({ note }) {
  const [expanded, setExpanded] = useState(false);
  const ai = note.ai_analysis || {};
  const time = note.created_date ? format(new Date(note.created_date), 'HH:mm') : '';
  const plain = (note.plain_text || (note.content || '').replace(/<[^>]+>/g, ' ')).trim();
  const isLong = plain.length > 300;
  const isReport = plain.length > 800;
  const displayText = expanded || !isLong ? plain : plain.slice(0, 280) + '…';

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="flex justify-end gap-2 group">
      <div className="max-w-[88%] md:max-w-[78%]">
        {/* 用户气泡 - Notion 风格卡片 */}
        <div className="bg-white border border-slate-200/80 rounded-2xl px-4 py-3 shadow-[0_1px_2px_rgba(15,15,15,0.04),0_2px_8px_rgba(15,15,15,0.03)] hover:border-slate-300/80 transition-colors">
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
          <span className="text-[10px] text-slate-400">{time}</span>
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
            className="mt-2 bg-white border border-slate-200/80 rounded-2xl p-4 shadow-[0_1px_2px_rgba(15,15,15,0.04),0_2px_8px_rgba(15,15,15,0.03)] hover:border-slate-300/80 transition-colors">
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