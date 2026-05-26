import React, { useState } from "react";
import { motion } from "framer-motion";
import { Link as LinkIcon, FileText, Sparkles, Tag, Image as ImageIcon, Mic, Paperclip, ExternalLink, Loader2, ChevronDown, ChevronUp, Globe } from "lucide-react";
import { format } from "date-fns";

function SourceBadge({ note }) {
  const map = {
    manual: null,
    web_link: { icon: <LinkIcon className="w-3 h-3" />, label: '链接', cls: 'bg-gradient-to-r from-indigo-500 to-violet-500' },
    file: { icon: <FileText className="w-3 h-3" />, label: '文件', cls: 'bg-gradient-to-r from-blue-500 to-indigo-500' },
    image: { icon: <ImageIcon className="w-3 h-3" />, label: '图片', cls: 'bg-gradient-to-r from-pink-500 to-rose-500' },
    voice: { icon: <Mic className="w-3 h-3" />, label: '语音', cls: 'bg-gradient-to-r from-emerald-500 to-teal-500' },
    external_feed: { icon: <Globe className="w-3 h-3" />, label: '外部信息', cls: 'bg-gradient-to-r from-purple-600 to-fuchsia-600' },
    wechat_share: { icon: <ExternalLink className="w-3 h-3" />, label: '微信转发', cls: 'bg-gradient-to-r from-green-500 to-emerald-500' },
  };
  const cfg = map[note.source_type];
  if (!cfg) return null;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-white text-[10px] font-medium ${cfg.cls}`}>
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
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex justify-end gap-2 group">
      <div className="max-w-[85%] md:max-w-[75%]">
        {/* 用户气泡 */}
        <div className="bg-gradient-to-br from-violet-600 to-indigo-600 text-white rounded-2xl rounded-tr-sm px-4 py-3 shadow-md">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <SourceBadge note={note} />
            {isReport && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/20 text-[10px] font-medium">
                <FileText className="w-3 h-3" /> 长文本报告 · {plain.length}字
              </span>
            )}
            {note.source_url && (
              <a href={note.source_url} target="_blank" rel="noreferrer" className="text-[11px] underline opacity-90 truncate max-w-[180px]">
                {note.source_url}
              </a>
            )}
          </div>
          <div className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">
            {displayText || '（空内容）'}
          </div>
          {isLong && (
            <button onClick={() => setExpanded(v => !v)} className="mt-2 inline-flex items-center gap-1 text-[12px] bg-white/15 hover:bg-white/25 rounded-md px-2 py-1 transition">
              {expanded ? <>收起 <ChevronUp className="w-3 h-3" /></> : <>展开全文 <ChevronDown className="w-3 h-3" /></>}
            </button>
          )}
          {note.attachments?.length > 0 && (
            <div className="mt-2 space-y-1">
              {note.attachments.map((a, i) => (
                <a key={i} href={a.file_url} target="_blank" rel="noreferrer"
                  className="flex items-center gap-2 px-2 py-1.5 bg-white/15 rounded-lg text-[12px] hover:bg-white/25 transition">
                  <Paperclip className="w-3 h-3" />
                  <span className="truncate flex-1">{a.file_name || '附件'}</span>
                </a>
              ))}
            </div>
          )}
        </div>

        <div className="text-right mt-1">
          <span className="text-[10px] text-slate-400">{time}</span>
        </div>

        {/* AI 处理状态 */}
        {(note.ai_status === 'pending' || note.ai_status === 'processing') && (
          <div className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-violet-500 bg-violet-50 border border-violet-100 rounded-full px-3 py-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            AI 正在理解、整理、关联…
          </div>
        )}
        {note.ai_status === 'failed' && (
          <div className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-rose-500 bg-rose-50 border border-rose-100 rounded-full px-3 py-1">
            AI 分析失败
          </div>
        )}

        {/* AI 知识卡片 */}
        {note.ai_status === 'completed' && ai.summary && (
          <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}
            className="mt-3 bg-white border border-slate-100 rounded-2xl rounded-tl-sm p-4 shadow-sm hover:shadow-md transition">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-6 h-6 rounded-full bg-violet-100 flex items-center justify-center">
                <Sparkles className="w-3 h-3 text-violet-600" />
              </div>
              <span className="text-[12px] font-medium text-violet-600">
                {isReport ? '长文摘要' : note.source_type === 'external_feed' ? '外部信息已解析' : 'AI 智能处理'}
              </span>
              {ai.category && (
                <span className="ml-auto text-[11px] px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full">{ai.category}</span>
              )}
            </div>

            <p className="text-[13px] text-slate-700 leading-relaxed mb-2">{ai.summary}</p>

            {ai.key_points?.length > 0 && (
              <ul className="mb-2 space-y-1">
                {ai.key_points.slice(0, isReport ? 6 : 4).map((p, i) => (
                  <li key={i} className="text-[12px] text-slate-600 flex gap-2">
                    <span className="text-violet-400">•</span>
                    <span className="flex-1">{p}</span>
                  </li>
                ))}
              </ul>
            )}

            {note.tags?.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-slate-100">
                {note.tags.slice(0, 6).map((t, i) => (
                  <span key={i} className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-violet-50 text-violet-600 text-[10px] rounded-md">
                    <Tag className="w-2.5 h-2.5" />{t}
                  </span>
                ))}
              </div>
            )}

            {ai.related_topics?.length > 0 && (
              <div className="mt-2 text-[11px] text-slate-500 bg-slate-50 rounded p-2 leading-relaxed">
                <span className="font-medium text-slate-600">🌐 拓展视野：</span>
                {ai.related_topics.slice(0, 3).join(' · ')}
              </div>
            )}
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}