import React from 'react';
import { format } from 'date-fns';
import { Sparkles, Tag, Link as LinkIcon, FileText, Image as ImageIcon, Loader2, Globe, Lightbulb, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';

const CATEGORY_META = {
  work: { label: '工作', color: 'bg-blue-50 text-blue-700' },
  study: { label: '学习', color: 'bg-purple-50 text-purple-700' },
  idea: { label: '灵感', color: 'bg-amber-50 text-amber-700' },
  life: { label: '生活', color: 'bg-emerald-50 text-emerald-700' },
  finance: { label: '财务', color: 'bg-green-50 text-green-700' },
  health: { label: '健康', color: 'bg-rose-50 text-rose-700' },
  reading: { label: '阅读', color: 'bg-indigo-50 text-indigo-700' },
  other: { label: '其他', color: 'bg-slate-100 text-slate-600' },
};

const SOURCE_ICON = {
  web_link: LinkIcon,
  wechat_share: LinkIcon,
  external_feed: Globe,
  file_upload: FileText,
  image: ImageIcon,
  report: FileText,
  manual: Sparkles,
};

/**
 * 心签消息卡片 - 类似微信文件传输助手中的"自己发给自己"
 * 左侧显示用户原文，下方挂 AI 分析卡片
 */
export default function HeartSignMessage({ note, onDelete }) {
  const SourceIcon = SOURCE_ICON[note.source_type] || Sparkles;
  const ai = note.ai_analysis || {};
  const categoryMeta = ai.category ? CATEGORY_META[ai.category] || CATEGORY_META.other : null;
  const isProcessing = note.ai_status === 'processing' || note.ai_status === 'pending';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex justify-end group"
    >
      <div className="max-w-[80%] space-y-2">
        {/* 用户原始消息 - 右侧气泡 */}
        <div className="flex justify-end items-start gap-2">
          <button
            onClick={() => onDelete?.(note)}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 hover:bg-rose-50 rounded-lg text-slate-400 hover:text-rose-500 mt-2"
            title="删除"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <div className="bg-[#384877] text-white rounded-2xl rounded-tr-sm px-4 py-2.5 shadow-sm">
            <div
              className="text-[14.5px] leading-relaxed [&_a]:text-white [&_a]:underline [&_img]:rounded-lg [&_img]:my-1"
              dangerouslySetInnerHTML={{ __html: note.content }}
            />
          </div>
        </div>

        {/* 时间戳 */}
        <div className="text-right text-[10px] text-slate-400 pr-2">
          {format(new Date(note.created_date), 'HH:mm')}
        </div>

        {/* AI 分析卡片 - 左侧 */}
        {(isProcessing || ai.summary) && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="flex justify-start"
          >
            <div className="bg-white rounded-2xl rounded-tl-sm shadow-sm border border-slate-100 overflow-hidden max-w-full w-[420px]">
              {isProcessing ? (
                <div className="p-4 flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="w-4 h-4 animate-spin text-[#384877]" />
                  AI 正在理解、归档与关联…
                </div>
              ) : (
                <div className="p-4 space-y-3">
                  {/* 头部 */}
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-violet-100 flex items-center justify-center">
                      <Sparkles className="w-3 h-3 text-violet-600" />
                    </div>
                    <span className="text-xs font-medium text-violet-600">AI 智能归档</span>
                    {categoryMeta && (
                      <span className={`ml-auto px-2 py-0.5 rounded-full text-[10px] font-medium ${categoryMeta.color}`}>
                        {categoryMeta.label}
                      </span>
                    )}
                  </div>

                  {/* 摘要 */}
                  {ai.summary && (
                    <p className="text-[14px] text-slate-800 leading-relaxed font-medium">
                      {ai.summary}
                    </p>
                  )}

                  {/* 关键要点 */}
                  {ai.key_points?.length > 0 && (
                    <ul className="space-y-1">
                      {ai.key_points.slice(0, 5).map((pt, i) => (
                        <li key={i} className="text-[13px] text-slate-600 flex gap-2 leading-relaxed">
                          <span className="text-violet-400 mt-1">•</span>
                          <span>{pt}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* 外部背景补充 */}
                  {ai.external_context && (
                    <div className="bg-amber-50/60 border-l-2 border-amber-300 rounded-r-lg p-2.5 flex gap-2">
                      <Lightbulb className="w-3.5 h-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
                      <p className="text-[12px] text-slate-700 leading-relaxed">{ai.external_context}</p>
                    </div>
                  )}

                  {/* 标签 */}
                  {note.tags?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {note.tags.slice(0, 8).map((t, i) => (
                        <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md text-[11px]">
                          <Tag className="w-2.5 h-2.5" />{t}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* 来源标识 */}
                  {note.source_url && (
                    <div className="pt-2 border-t border-slate-100 flex items-center gap-1.5 text-[11px] text-slate-400">
                      <SourceIcon className="w-3 h-3" />
                      <a href={note.source_url} target="_blank" rel="noreferrer" className="truncate hover:text-[#384877]">
                        {note.source_url}
                      </a>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}