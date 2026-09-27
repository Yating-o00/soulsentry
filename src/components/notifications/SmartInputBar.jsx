import React, { useState, useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Mic, MicOff, Loader2, ArrowUp } from "lucide-react";
import { deepSemanticParse } from "@/components/utils/semanticParser";
import ChatPasteRecognizer from "@/components/heartsign/ChatPasteRecognizer";
import { looksLikeChatLog } from "@/components/utils/processPastedContent";
import TodayChatDialog from "@/components/today/TodayChatDialog";

const SAMPLES = ['明早7点飞深圳', '今晚8点给妈妈打电话', '突然想去看看海', '今天有点累，但很踏实'];

// 可自动执行的差事关键词:命中则预览标签提示「⚙ 自动执行」
const AUTO_RE = /邮件|email|e-mail|调研|调查报告|报告|ppt|PPT|总结|笔记|账本|文档|周报|月报|纪要|简历|方案|数据分析|邀请函|合同|议程/;

/**
 * 心栈之门 —— 今日页统一记忆入口(视觉对齐参考稿 HeroGate)
 * 用户只管说；提交后进入与心栈的对话（TodayChatDialog），
 * 由 AI 多轮理解意图，用户确认后才生成约定 / 心签 / 链接记录。
 */
export default function SmartInputBar() {
  const [inputValue, setInputValue] = useState("");
  const [focused, setFocused] = useState(false);
  const [echo, setEcho] = useState(null); // 记忆回响:刚才那一句去了哪里
  const [semanticAnalysis, setSemanticAnalysis] = useState(null);
  const [isAiAnalyzing, setIsAiAnalyzing] = useState(false);
  const [isListeningVoice, setIsListeningVoice] = useState(false);
  const [showChatRecognizer, setShowChatRecognizer] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatSeed, setChatSeed] = useState("");
  // 用户在预览里手动点的类型(约定/心签),作为对话里的倾向提示
  const [previewOverride, setPreviewOverride] = useState(null);
  const aiTimerRef = useRef(null);
  const recognitionRef = useRef(null);
  const taRef = useRef(null);
  const queryClient = useQueryClient();

  // 输入框随内容自动长高（上限约 6 行），空着时保持单行的简洁状态
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 168)}px`;
  }, [inputValue]);

  // —— 实时倾听:输入停顿 1s 后做一次深度语义解析,驱动「我会把它收进…」预览 ——
  const analyzeWithAI = useCallback(async (text) => {
    if (!text || text.trim().length < 3) {
      setSemanticAnalysis(null);
      return;
    }
    setIsAiAnalyzing(true);
    try {
      const result = await deepSemanticParse(text, { enableSmartComplete: false });
      setSemanticAnalysis(result);
    } catch (e) {
      console.error('Semantic analysis failed:', e);
      setSemanticAnalysis(null);
    } finally {
      setIsAiAnalyzing(false);
    }
  }, []);

  useEffect(() => {
    if (aiTimerRef.current) clearTimeout(aiTimerRef.current);
    setPreviewOverride(null); // 内容一变,手动改判失效,重新听 AI 的
    if (!inputValue || inputValue.trim().length < 3) {
      setSemanticAnalysis(null);
      return;
    }
    aiTimerRef.current = setTimeout(() => analyzeWithAI(inputValue), 1000);
    return () => { if (aiTimerRef.current) clearTimeout(aiTimerRef.current); };
  }, [inputValue, analyzeWithAI]);

  useEffect(() => () => {
    try { recognitionRef.current?.stop?.(); } catch {}
  }, []);

  // —— 预览分类:用户手动选择 > AI 意图;关键词补充「自动执行」判定 ——
  const preview = (() => {
    const text = inputValue.trim();
    if (text.length < 4) return null;
    const intent = semanticAnalysis?.primary_intent;
    const aiIsNote = intent === 'note' || intent === 'wish';
    const isHeartSign = previewOverride ? previewOverride === 'note' : aiIsNote;
    const auto = !isHeartSign && AUTO_RE.test(text);
    const timeEntity = semanticAnalysis?.time_entities?.find(
      (t) => t.resolved_datetime && t.time_confidence !== 'low'
    );
    return {
      isHeartSign,
      auto,
      time: timeEntity?.resolved_datetime ? fmtDayTime(timeEntity.resolved_datetime) : null,
      analyzing: isAiAnalyzing && !semanticAnalysis,
    };
  })();

  function fmtDayTime(iso) {
    try {
      const d = new Date(iso);
      const now = new Date();
      const sameDay = d.toDateString() === now.toDateString();
      const tomorrow = new Date(now.getTime() + 86400000).toDateString() === d.toDateString();
      const day = sameDay ? '今天' : tomorrow ? '明天' : `${d.getMonth() + 1}月${d.getDate()}日`;
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      return `${day} ${hh}:${mm}`;
    } catch {
      return '';
    }
  }

  // —— 提交:不直建,进入对话由 AI 理解后再确认生成 ——
  const handleSubmit = () => {
    const text = inputValue.trim();
    if (!text) return;
    const hint = previewOverride === 'note' ? '（我想记成心签）' : previewOverride === 'task' ? '（我想立成约定）' : '';
    setChatSeed(hint ? `${text}${hint}` : text);
    setChatOpen(true);
    setInputValue("");
    setSemanticAnalysis(null);
  };

  // —— 对话里确认生成后的回响 ——
  const handleChatCreated = ({ type, label } = {}) => {
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
    queryClient.invalidateQueries({ queryKey: ['notes'] });
    queryClient.invalidateQueries({ queryKey: ['task-executions'] });
    setEcho({ kind: type === 'task' ? 'task' : 'note', title: label || '' });
  };

  const handleVoiceInput = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      return;
    }

    if (isListeningVoice) {
      recognitionRef.current?.stop();
      setIsListeningVoice(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'zh-CN';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognitionRef.current = recognition;

    recognition.onstart = () => setIsListeningVoice(true);
    recognition.onend = () => setIsListeningVoice(false);
    recognition.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      setInputValue((v) => (v ? v + transcript : transcript));
    };
    recognition.start();
  };

  const handlePaste = (e) => {
    const pasted = (e.clipboardData || window.clipboardData)?.getData("text") || "";
    if (looksLikeChatLog((inputValue + pasted).trim())) setShowChatRecognizer(true);
  };

  const echoReply = (() => {
    if (!echo) return '';
    if (echo.kind === 'note') return `「${echo.title}」—— 这句我替你收好了。心事放在这里，不会被弄丢。`;
    return `「${echo.title}」已收进今日印记，到点我会轻轻唤你。`;
  })();

  return (
    <div className="mt-7 w-full">
      {showChatRecognizer && inputValue.trim() && (
        <div className="px-1 mb-2">
          <ChatPasteRecognizer
            text={inputValue}
            onDone={() => { setInputValue(""); setShowChatRecognizer(false); }}
            onDismiss={() => setShowChatRecognizer(false)}
          />
        </div>
      )}

      <p className="mb-3 font-[var(--font-serif)] text-[17px] text-[var(--sky-ink)]">
        告诉我，<span className="text-[var(--signal)]">任何事情</span>
      </p>

      {/* 心栈之门 */}
      <div className={`gate-vessel rounded-2xl ${focused ? 'is-listening' : 'is-quiet'}`}>
        <textarea
          ref={taRef}
          value={inputValue}
          rows={1}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(e) => setInputValue(e.target.value)}
          onPaste={handlePaste}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
          placeholder="约定、心事、一闪而过的念头……说给我听"
          className="w-full resize-none overflow-hidden bg-transparent px-5 sm:px-6 pt-4 pb-1.5 text-[15.5px] leading-relaxed text-[var(--sky-ink)] placeholder:text-[var(--sky-sub)]/70 focus:outline-none"
        />

        {/* 实时倾听预览:可点击改判 约定 ↔ 心签（提交后作为对话倾向） */}
        {preview && (
          <div className="parse-preview echo-born mx-4 sm:mx-5 mb-1 rounded-xl bg-[var(--sentinel)]/[0.06] px-4 py-2.5 text-[12px] text-[var(--ink-2)]">
            <div className="flex flex-wrap items-center gap-2">
              {preview.analyzing ? (
                <span className="flex items-center gap-1.5 text-[var(--ink-3)]">
                  <Loader2 className="w-3 h-3 animate-spin" /> 正在倾听…
                </span>
              ) : (
                <>
                  <span className="text-[var(--signal)]">◈</span>
                  <span className="text-[var(--ink-3)]">将为你生成</span>
                  <button
                    type="button"
                    onClick={() => setPreviewOverride(preview.isHeartSign ? 'task' : 'note')}
                    title="点我切换：约定 ↔ 心签"
                    className={`rounded-full px-2.5 py-0.5 font-medium transition-opacity hover:opacity-75 ${
                      preview.isHeartSign
                        ? 'bg-[var(--sentinel)]/[0.09] text-[var(--sentinel)]'
                        : 'bg-[var(--signal-soft)] text-[var(--signal)]'
                    }`}
                  >
                    {preview.isHeartSign ? '✦ 心签' : '♪ 约定'}
                  </button>
                  {preview.auto && (
                    <span className="rounded-full bg-[var(--jade)]/10 px-2.5 py-0.5 font-medium text-[var(--jade)]">
                      ⚙ 自动执行
                    </span>
                  )}
                </>
              )}
              {preview.time && (
                <span className="num rounded-full bg-white/70 px-2.5 py-0.5">
                  {preview.time}，我记得
                </span>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 px-4 sm:px-5 pb-3.5 pt-1">
          <button
            type="button"
            onClick={handleVoiceInput}
            title={isListeningVoice ? '点击停止' : '语音输入'}
            className={`flex h-9 w-9 items-center justify-center rounded-full transition-all duration-200 ${
              isListeningVoice
                ? 'bg-red-100 text-red-500 animate-pulse'
                : 'text-[var(--sky-sub)] hover:text-[var(--sky-ink)] hover:bg-black/[0.04]'
            }`}
          >
            {isListeningVoice ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>
          <button
            onClick={handleSubmit}
            disabled={!inputValue.trim()}
            title="发送（Enter）"
            className="ml-auto flex h-9 w-9 items-center justify-center rounded-full bg-[var(--sentinel)] text-white transition-all duration-300 hover:bg-[var(--sentinel-deep)] disabled:opacity-30 disabled:hover:bg-[var(--sentinel)]"
          >
            <ArrowUp className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 示例引路 */}
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {SAMPLES.map((s) => (
          <button
            key={s}
            onClick={() => setInputValue(s)}
            className="sky-chip rounded-full border border-[var(--hairline)] bg-slate-50/80 px-3.5 py-1.5 text-[12.5px] text-[var(--ink-2)] transition-all duration-300 hover:border-[var(--sentinel)]/50 hover:text-[var(--sentinel)]"
          >
            {s}
          </button>
        ))}
      </div>

      {/* 记忆回响:被听见、被记住的瞬间 */}
      {echo && (
        <div key={echo.title + echo.kind} className="echo-born hairline-card mt-6 rounded-2xl p-5">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--signal-soft)] text-[13px] text-[var(--signal)]">
              ✦
            </span>
            <div className="min-w-0">
              <p className="font-[var(--font-serif)] text-[14.5px] leading-relaxed text-[var(--ink)]">
                {echoReply}
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-[11.5px]">
                {echo.kind === 'note' ? (
                  <span className="rounded-md bg-[var(--sentinel)]/[0.09] px-2.5 py-1 font-medium text-[var(--sentinel)]">
                    已生成心签
                  </span>
                ) : (
                  <span className="rounded-md bg-[var(--signal-soft)] px-2.5 py-1 font-medium text-[var(--signal)]">
                    已生成约定
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 对话浮层:输入内容进入对话，AI 理解意图、确认后生成 */}
      <TodayChatDialog
        open={chatOpen}
        seedText={chatSeed}
        onClose={() => setChatOpen(false)}
        onCreated={handleChatCreated}
      />
    </div>
  );
}
