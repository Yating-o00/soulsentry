import React, { useState, useRef } from "react";
import { Send, Plus, Paperclip, Link as LinkIcon, Image as ImageIcon, Mic, MicOff, X, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import QuickTemplates from "./QuickTemplates";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import ChatPasteRecognizer from "./ChatPasteRecognizer";
import { looksLikeChatLog } from "@/components/utils/processPastedContent";

export default function HeartSignInput({ onSend }) {
  const [text, setText] = useState("");
  const [showChatRecognizer, setShowChatRecognizer] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [sourceUrl, setSourceUrl] = useState("");
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const fileRef = useRef(null);
  const imgRef = useRef(null);
  const { isListening, toggle: toggleVoice } = useVoiceInput((transcript) => {
    setText((prev) => (prev ? prev + transcript : transcript));
  });

  const detectUrlInText = (val) => {
    const m = val.match(/https?:\/\/\S+/);
    if (m && !sourceUrl) setSourceUrl(m[0]);
  };

  const handlePaste = (e) => {
    const pasted = (e.clipboardData || window.clipboardData)?.getData("text") || "";
    const combined = (text + pasted).trim();
    if (looksLikeChatLog(combined)) setShowChatRecognizer(true);
  };

  const autoResize = (el) => {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  };

  const handleFile = async (e, kind = 'file') => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    try {
      for (const f of files) {
        const { file_url } = await base44.integrations.Core.UploadFile({ file: f });
        setAttachments((prev) => [...prev, {
          file_url,
          file_name: f.name,
          file_type: kind === 'image' ? 'image' : (f.type || 'file'),
          file_size: f.size
        }]);
      }
    } catch (err) {
      toast.error('上传失败：' + err.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const submit = async () => {
    const plain = text.trim();
    if (!plain && !attachments.length && !sourceUrl) return;

    let source_type = 'manual';
    if (attachments.some(a => (a.file_type || '').startsWith('image'))) source_type = 'image';
    else if (attachments.length) source_type = 'file';
    else if (sourceUrl) source_type = 'web_link';

    const payload = {
      content: plain ? `<p>${plain.replace(/\n/g, '<br/>')}</p>` : (sourceUrl ? `<p><a href="${sourceUrl}">${sourceUrl}</a></p>` : '<p></p>'),
      plain_text: plain || sourceUrl || '',
      source_type,
      source_url: sourceUrl || undefined,
      attachments,
      ai_status: 'pending',
      color: 'white'
    };

    setText('');
    setAttachments([]);
    setSourceUrl('');
    setShowUrlInput(false);

    await onSend(payload);
  };

  const onKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="bg-white border-t border-slate-200 p-3 md:p-4">
      <div className="max-w-3xl mx-auto">
        {/* 聊天记录智能识别条 */}
        {showChatRecognizer && text.trim() && (
          <ChatPasteRecognizer
            text={text}
            onDone={() => { setText(''); setShowChatRecognizer(false); }}
            onDismiss={() => setShowChatRecognizer(false)}
          />
        )}

        {/* 附件预览 */}
        {(attachments.length > 0 || sourceUrl) && (
          <div className="mb-2 flex flex-wrap gap-2">
            {sourceUrl && (
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-indigo-50 border border-indigo-100 rounded-lg text-xs text-indigo-700">
                <LinkIcon className="w-3 h-3" />
                <span className="truncate max-w-[240px]">{sourceUrl}</span>
                <button onClick={() => setSourceUrl('')} className="hover:text-indigo-900"><X className="w-3 h-3" /></button>
              </div>
            )}
            {attachments.map((a, i) => (
              <div key={i} className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700">
                <Paperclip className="w-3 h-3" />
                <span className="truncate max-w-[180px]">{a.file_name}</span>
                <button onClick={() => setAttachments(prev => prev.filter((_, idx) => idx !== i))} className="hover:text-rose-600"><X className="w-3 h-3" /></button>
              </div>
            ))}
          </div>
        )}

        {/* URL 输入条 */}
        {showUrlInput && (
          <div className="mb-2 flex items-center gap-2">
            <LinkIcon className="w-4 h-4 text-indigo-500" />
            <input
              type="url"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder="粘贴链接：https://..."
              className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-violet-400"
              autoFocus
            />
            <button onClick={() => setShowUrlInput(false)} className="text-slate-400 hover:text-slate-700"><X className="w-4 h-4" /></button>
          </div>
        )}

        {/* 快速模板悬浮 */}
        {showTemplates && (
          <div className="mb-2 flex justify-center">
            <QuickTemplates onPick={(tpl) => { setText(prev => prev + tpl); setShowTemplates(false); }} />
          </div>
        )}

        {/* 工具栏 */}
        <div className="flex items-center gap-1 mb-2 text-slate-500">
          <button onClick={() => setShowTemplates(v => !v)} className="p-2 hover:bg-slate-100 rounded-lg" title="快速模板">
            <Plus className="w-4 h-4" />
          </button>
          <button onClick={() => fileRef.current?.click()} className="p-2 hover:bg-slate-100 rounded-lg" title="文件">
            <Paperclip className="w-4 h-4" />
          </button>
          <button onClick={() => imgRef.current?.click()} className="p-2 hover:bg-slate-100 rounded-lg" title="图片">
            <ImageIcon className="w-4 h-4" />
          </button>
          <button onClick={() => setShowUrlInput(v => !v)} className="p-2 hover:bg-slate-100 rounded-lg" title="链接">
            <LinkIcon className="w-4 h-4" />
          </button>
          <button
            onClick={toggleVoice}
            className={`p-2 rounded-lg transition-colors ${isListening ? 'bg-red-100 text-red-500 animate-pulse' : 'hover:bg-slate-100'}`}
            title={isListening ? '点击停止' : '语音输入'}
          >
            {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>
          <div className="flex-1" />
          {uploading && <span className="text-xs text-violet-500 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />上传中</span>}
          <span className="hidden md:inline text-[11px] text-slate-400">Enter 发送 · Shift+Enter 换行</span>
        </div>

        {/* 输入框 */}
        <div className="flex items-end gap-2 bg-slate-50 border border-slate-200 rounded-2xl p-2 focus-within:border-violet-400 focus-within:ring-2 focus-within:ring-violet-100 transition">
          <textarea
            rows={1}
            value={text}
            onChange={(e) => { setText(e.target.value); detectUrlInText(e.target.value); autoResize(e.target); }}
            onPaste={handlePaste}
            onKeyDown={onKey}
            placeholder="发给自己 — 想法、链接、报告、文件，AI 会自动整理归档..."
            className="flex-1 bg-transparent outline-none resize-none text-[15px] text-slate-800 placeholder-slate-400 px-2 py-2 max-h-[200px]"
          />
          <button
            onClick={submit}
            disabled={uploading}
            className="p-2.5 bg-gradient-to-br from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 disabled:opacity-50 text-white rounded-xl shadow-md transition hover:scale-105 active:scale-95"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>

        <input ref={fileRef} type="file" hidden multiple onChange={(e) => handleFile(e, 'file')} />
        <input ref={imgRef} type="file" hidden multiple accept="image/*" onChange={(e) => handleFile(e, 'image')} />
      </div>
    </div>
  );
}