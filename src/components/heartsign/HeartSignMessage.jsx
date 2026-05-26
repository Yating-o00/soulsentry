import React from "react";
import { motion } from "framer-motion";
import { Link as LinkIcon, FileText, Sparkles, Tag, Image as ImageIcon, Mic, Paperclip, ExternalLink, Loader2 } from "lucide-react";
import { format } from "date-fns";

function StatusDot({ status }) {
  if (status === 'processing' || status === 'pending') {
    return <span className="inline-flex items-center gap-1 text-[11px] text-violet-500"><Loader2 className="w-3 h-3 animate-spin" />AI 处理中</span>;
  }
  if (status === 'failed') {
    return <span className="text-[11px] text-rose-500">AI 分析失败</span>;
  }
  return null;
}

function SourceBadge({ note }) {
  const map = {
    manual: { icon: null, label: null },
    web_link: { icon: <LinkIcon className="w-3 h-3" />, label: '链接' },
    file: { icon: <FileText className="w-3 h-3" />, label: '文件' },
    image: { icon: <ImageIcon className="w-3 h-3" />, label: '图片' },
    voice: { icon: <Mic className="w-3 h-3" />, label: '语音' },
    external_feed: { icon: <ExternalLink className="w-3 h-3" />, label: '外部订阅' },
    wechat_share: { icon: <ExternalLink className="w-3 h-3" />, label: '微信转发' },
  };
  const cfg = map[note.source_type] || map.manual;
  if (!cfg.label) return null;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 text-white text-[10px] font-medium">
      {cfg.icon}{cfg.label}
    </span>
  );
}

export default function HeartSignMessage({ note }) {
  const ai = note.ai_analysis || {};
  const time = note.created_date ? format(new Date(note.created_date), 'HH:mm') : '';
  const plain = (note.plain_text || (note.content || '').replace(/<[^>]+>/g, ' ')).trim();
  const isLong = plain.length > 200;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex justify-end gap-2"
    >
      <div className="max-w-[85%] md:max-w-[70%]">
        {/* 用户气泡 */}
        <div className="bg-gradient-to-br from-violet-600 to-indigo-600 text-white rounded-2xl rounded-tr-sm px-4 py-3 shadow-md">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <SourceBadge note={note} />
            {note.source_url && (
              <a href={note.source_url} target="_blank" rel="noreferrer" className="text-[11px] underline opacity-90 truncate max-w-[200px]">
                {note.source_url}
              </a>
            )}
          </div>
          <div className={`text-[15px] leading-relaxed whitespace-pre-wrap break-words ${isLong ? 'line-clamp-6' : ''}`}>
            {plain || '（空内容）'}
          </div>
          {note.attachments?.length > 0 && (
            <div className="mt-2 space-y-1">
              {note.attachments.map((a, i) => (
                <a
                  key={i}
                  href={a.file_url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 px-2 py-1.5 bg-white/15 rounded-lg text-[12px] hover:bg-white/25 transition"
                >
                  <Paperclip className="w-3 h-3" />
                  <span className="truncate flex-1">{a.file_name || '附件'}</span>
                </a>
              ))}
            </div>
          )}
        </div>

        {/* AI 知识卡片 */}
        {(note.ai_status === 'pending' || note.ai_status === 'processing') && (
          <div className="mt-2 bg-white border border-violet-100 rounded-2xl rounded-tl-sm p-3 shadow-sm">
            <StatusDot status={note.ai_status} />
          </div>
        )}

        {note.ai_status === 'completed' && ai.summary && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mt-2 bg-white border border-slate-100 rounded-2xl rounded-tl-sm p-4 shadow-sm"
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="w-6 h-6 rounded-full bg-violet-100 flex items-center justify-center">
                <Sparkles className="w-3 h-3 text-violet-600" />
              </div>
              <span className="text-[12px] font-medium text-violet-600">AI 智能处理</span>
              {ai.category && (
                <span className="ml-auto text-[11px] px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full">{ai.category}</span>
              )}
            </div>

            <p className="text-[13px] text-slate-700 leading-relaxed mb-2">{ai.summary}</p>

            {ai.key_points?.length > 0 && (
              <ul className="mb-2 space-y-1">
                {ai.key_points.slice(0, 4).map((p, i) => (
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
              <div className="mt-2 text-[11px] text-slate-500">
                <span className="font-medium">可拓展：</span>
                {ai.related_topics.slice(0, 3).join(' · ')}
              </div>
            )}
          </motion.div>
        )}

        <div className="text-right mt-1">
          <span className="text-[10px] text-slate-400">{time}</span>
        </div>
      </div>
    </motion.div>
  );
}