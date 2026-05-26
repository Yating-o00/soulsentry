import React, { useRef, useState } from 'react';
import { Plus, Paperclip, Link as LinkIcon, Mic, Image as ImageIcon, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

/**
 * 心签输入组件 - 类似微信文件传输助手的极简输入
 * 支持: 文本 / 链接 / 文件 / 图片
 */
export default function HeartSignInput({ onSent }) {
  const [text, setText] = useState('');
  const [pendingFiles, setPendingFiles] = useState([]);
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef(null);
  const imgInputRef = useRef(null);
  const textareaRef = useRef(null);

  const autoResize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  };

  const handleFile = async (e, isImage = false) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setSending(true);
    try {
      for (const f of files) {
        const { file_url } = await base44.integrations.Core.UploadFile({ file: f });
        setPendingFiles(prev => [...prev, {
          file_url,
          file_name: f.name,
          file_type: f.type || (isImage ? 'image' : 'file'),
          file_size: f.size,
          is_image: isImage,
        }]);
      }
    } catch (err) {
      toast.error('上传失败: ' + err.message);
    }
    setSending(false);
    e.target.value = '';
  };

  const detectSourceType = () => {
    const t = text.trim();
    if (pendingFiles.length > 0) {
      if (pendingFiles.every(f => f.is_image)) return 'image';
      return 'file_upload';
    }
    if (/^https?:\/\//i.test(t)) return 'web_link';
    if (t.length > 500) return 'report';
    return 'manual';
  };

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed && pendingFiles.length === 0) return;

    setSending(true);
    try {
      const sourceType = detectSourceType();
      const isLink = sourceType === 'web_link';
      const sourceUrl = isLink ? trimmed : '';

      // 构造心签内容
      let htmlContent = '';
      let plainText = trimmed;

      if (pendingFiles.length > 0) {
        const filesHtml = pendingFiles.map(f => {
          if (f.is_image) {
            return `<div><img src="${f.file_url}" alt="${f.file_name}" style="max-width:100%;border-radius:8px;margin:4px 0"/></div>`;
          }
          return `<div>📎 <a href="${f.file_url}" target="_blank">${f.file_name}</a></div>`;
        }).join('');
        htmlContent += filesHtml;
        plainText = `${pendingFiles.map(f => f.file_name).join(', ')}${trimmed ? '\n' + trimmed : ''}`;
      }

      if (trimmed) {
        htmlContent += isLink
          ? `<div>🔗 <a href="${trimmed}" target="_blank">${trimmed}</a></div>`
          : `<div>${trimmed.replace(/\n/g, '<br/>')}</div>`;
      }

      const created = await base44.entities.Note.create({
        content: htmlContent || trimmed,
        plain_text: plainText,
        source_type: sourceType,
        source_url: sourceUrl,
        attachments: pendingFiles.map(f => ({
          file_url: f.file_url,
          file_name: f.file_name,
          file_type: f.file_type,
          file_size: f.file_size,
        })),
        ai_status: 'pending',
        color: 'white',
      });

      // 触发后端 AI 分析（不阻塞 UI）
      base44.functions.invoke('analyzeHeartSign', { note_id: created.id }).catch(err => {
        console.warn('AI analyze failed:', err.message);
      });

      setText('');
      setPendingFiles([]);
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
      onSent?.(created);
    } catch (err) {
      toast.error('发送失败: ' + err.message);
    }
    setSending(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="bg-white border-t border-slate-200 p-4">
      <div className="max-w-3xl mx-auto">
        {/* 待发送的附件预览 */}
        {pendingFiles.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {pendingFiles.map((f, i) => (
              <div key={i} className="flex items-center gap-2 bg-slate-100 rounded-lg px-3 py-1.5 text-xs">
                {f.is_image ? <ImageIcon className="w-3.5 h-3.5" /> : <Paperclip className="w-3.5 h-3.5" />}
                <span className="max-w-[160px] truncate">{f.file_name}</span>
                <button onClick={() => setPendingFiles(prev => prev.filter((_, idx) => idx !== i))}>
                  <X className="w-3 h-3 text-slate-500 hover:text-slate-900" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* 工具栏 */}
        <div className="flex items-center gap-1 mb-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-2 hover:bg-slate-100 rounded-lg text-slate-500"
            title="文件"
          >
            <Paperclip className="w-4 h-4" />
          </button>
          <button
            onClick={() => imgInputRef.current?.click()}
            className="p-2 hover:bg-slate-100 rounded-lg text-slate-500"
            title="图片"
          >
            <ImageIcon className="w-4 h-4" />
          </button>
          <button
            onClick={() => setText(prev => prev || 'https://')}
            className="p-2 hover:bg-slate-100 rounded-lg text-slate-500"
            title="粘贴链接"
          >
            <LinkIcon className="w-4 h-4" />
          </button>
          <div className="flex-1" />
          <span className="text-[11px] text-slate-400">Enter 发送 · Shift+Enter 换行</span>
        </div>

        {/* 输入框 */}
        <div className="flex items-end gap-2 bg-slate-50 border border-slate-200 rounded-2xl p-3 focus-within:ring-2 focus-within:ring-[#384877]/20 focus-within:border-[#384877]/40 transition-all">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => { setText(e.target.value); autoResize(); }}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder="给自己发一条…文字、链接、文件，AI 自动整理"
            className="flex-1 bg-transparent outline-none resize-none text-slate-800 placeholder:text-slate-400 max-h-40 text-[15px] leading-relaxed"
            disabled={sending}
          />
          <Button
            onClick={handleSend}
            disabled={sending || (!text.trim() && pendingFiles.length === 0)}
            className="bg-[#384877] hover:bg-[#3b5aa2] text-white rounded-xl h-10 w-10 p-0 flex-shrink-0"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>

        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => handleFile(e, false)} />
        <input ref={imgInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleFile(e, true)} />
      </div>
    </div>
  );
}