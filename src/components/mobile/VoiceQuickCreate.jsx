import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, Loader2, X, Sparkles, Check } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { invokeAI } from "@/components/utils/aiHelper";
import { buildApiUrl, getAccessToken } from "@/api/httpClient";
import { toast } from "sonner";
import {
  getTimeContextForAI, normalizeTaskTime, parseAsShanghai,
  parseRelativeMinutes, parseRelativeHours, parseTimeOfDay,
  parseBeforeTime, parseHybridTime, getShanghaiNow
} from "@/lib/timeCore";

/**
 * 综合解析用户自然语言中的时间意图，返回兜底 ISO。
 * 覆盖：X分钟后/小时后、X点前、明天下午3点、今晚等 AI 容易漏算或算错的表达。
 * 对明确的相对时间（X分钟后/小时后）直接覆盖，不再容忍 AI 的默认值。
 */
function resolveNaturalLanguageTime(text, aiReminderTime) {
  if (!text) return null;
  const t = text.trim();

  const aiTime = aiReminderTime ? parseAsShanghai(aiReminderTime) : null;
  const withinTolerance = (expected) => {
    if (!aiTime || !expected) return false;
    return Math.abs(aiTime.getTime() - expected.getTime()) <= 5 * 60 * 1000;
  };

  // 1. 相对分钟：语义明确，直接以当前时间 + X 分钟为准
  const relativeMinutes = parseRelativeMinutes(t);
  if (relativeMinutes != null && relativeMinutes > 0) {
    const base = getShanghaiNow();
    base.setMinutes(base.getMinutes() + relativeMinutes);
    const iso = base.toISOString();
    console.log(`[VoiceTime] 识别相对分钟: ${relativeMinutes}, fallback=${iso}, ai=${aiReminderTime}`);
    toast.info(`识别到 ${relativeMinutes} 分钟后`);
    return { iso, reasoning: `用户要求 ${relativeMinutes} 分钟后提醒` };
  }

  // 2. 相对小时：语义明确，直接以当前时间 + X 小时为准
  const relativeHours = parseRelativeHours(t);
  if (relativeHours != null && relativeHours > 0) {
    const base = getShanghaiNow();
    base.setMinutes(base.getMinutes() + Math.round(relativeHours * 60));
    const iso = base.toISOString();
    console.log(`[VoiceTime] 识别相对小时: ${relativeHours}, fallback=${iso}, ai=${aiReminderTime}`);
    toast.info(`识别到 ${relativeHours} 小时后`);
    return { iso, reasoning: `用户要求 ${relativeHours} 小时后提醒` };
  }

  // 3. 组合日期+时刻：明天下午3点、后天上午、下周一晚上
  const hybridISO = parseHybridTime(t);
  if (hybridISO) {
    const hybridTime = parseAsShanghai(hybridISO);
    if (!withinTolerance(hybridTime)) {
      console.log(`[VoiceTime] 识别组合时间: fallback=${hybridISO}, ai=${aiReminderTime}`);
      return { iso: hybridISO, reasoning: "用户指定了具体日期和时刻" };
    }
    return null;
  }

  // 4. 今天内的时刻："下午3点提醒我"、"晚上8点"、"1点前提醒"
  const timeStr = parseTimeOfDay(t);
  if (timeStr) {
    const now = getShanghaiNow();
    const todayStr = now.toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
    let candidate = parseAsShanghai(`${todayStr}T${timeStr}:00+08:00`);

    // "X点前" 且该时刻已过 → 顺延到明天
    const before = parseBeforeTime(t);
    if (before && candidate && candidate.getTime() <= now.getTime()) {
      const tomorrowStr = new Date(now.getTime() + 24 * 60 * 60 * 1000)
        .toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
      candidate = parseAsShanghai(`${tomorrowStr}T${timeStr}:00+08:00`);
    }

    if (candidate && !withinTolerance(candidate)) {
      console.log(`[VoiceTime] 识别今天时刻: fallback=${candidate.toISOString()}, ai=${aiReminderTime}`);
      return { iso: candidate.toISOString(), reasoning: before ? `用户要求 ${before.timeStr} 前提醒` : `用户指定了今天的时刻 ${timeStr}` };
    }
    return null;
  }

  console.log(`[VoiceTime] 未识别时间表达: text="${t}", ai=${aiReminderTime}`);
  return null;
}

/**
 * 移动端「+ → 新建约定」语音一键生成弹窗。
 * 录音 → AI 解析 → 直接创建约定，无需跳转或手动填表。
 *
 * 注意：移动端 Web Speech API 必须由用户手势触发，因此弹窗打开后
 * 不自动录音，需要用户点击麦克风按钮才开始。每次点击都创建新的
 * recognition 实例，避免旧实例状态腐烂导致首次点击无响应。
 *
 * 国内网络下 Web Speech API 依赖境外识别服务（Android Chrome 表现为
 * 「开始说话」但永远无结果），因此提供录音兜底：getUserMedia 采集
 * PCM 并重采样为 16k WAV，上传后端走阿里云一句话识别。
 */
export default function VoiceQuickCreate({ open, onClose }) {
  const queryClient = useQueryClient();
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [supported, setSupported] = useState(true);
  // stt = 浏览器在线识别；record = 录音上传识别（国内网络兜底）
  const [mode, setMode] = useState("stt");
  const [isTranscribing, setIsTranscribing] = useState(false);
  const recognitionRef = useRef(null);
  const sttWatchdogRef = useRef(null);
  const audioRef = useRef(null); // { stream, ctx, source, processor, chunks: Float32Array[] }

  // 只检测设备是否支持语音识别，不预先创建实例；不支持则直接进录音模式
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    setSupported(!!SpeechRecognition);
    if (!SpeechRecognition) setMode("record");
  }, []);

  // 关闭弹窗时停止录音并清空文案
  useEffect(() => {
    if (!open) {
      stopRecognition();
      stopMediaRecording();
      setTranscript("");
      setIsProcessing(false);
      setIsTranscribing(false);
    }
  }, [open]);

  const clearSttWatchdog = () => {
    if (sttWatchdogRef.current) {
      clearTimeout(sttWatchdogRef.current);
      sttWatchdogRef.current = null;
    }
  };

  const stopRecognition = () => {
    setIsRecording(false);
    clearSttWatchdog();
    try {
      recognitionRef.current?.stop();
    } catch (e) { /* noop */ }
    recognitionRef.current = null;
  };

  const switchToRecordMode = (reason) => {
    stopRecognition();
    setMode("record");
    if (reason) toast.info(reason);
  };

  const startRecording = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      switchToRecordMode("当前浏览器不支持在线识别，已切换为录音识别");
      return;
    }

    // 每次点击都新建实例，避免旧实例的 onend/onerror 状态残留
    stopRecognition();
    setTranscript("");
    setInterim("");

    const recognition = new SpeechRecognition();
    recognition.lang = "zh-CN";
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let finalText = "";
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const text = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += text;
        else interimText += text;
      }
      if (finalText) {
        clearSttWatchdog(); // 有结果说明链路可用，撤掉看门狗
        setTranscript((prev) => prev + finalText);
        setInterim("");
      } else if (interimText) {
        setInterim(interimText);
      }
    };

    recognition.onerror = (event) => {
      if (event.error === "not-allowed") {
        toast.error("请允许麦克风权限");
        setIsRecording(false);
        clearSttWatchdog();
        return;
      }
      if (event.error === "aborted") return;
      clearSttWatchdog();
      setIsRecording(false);
      // 国内网络典型表现：在线识别服务连不上，自动降级录音识别
      if (event.error === "network" || event.error === "service-not-allowed") {
        switchToRecordMode("在线识别不可用，已切换为录音识别");
      }
    };

    recognition.onend = () => {
      clearSttWatchdog();
      // 用户手动停止时 isRecording 已为 false；若识别自己断了则同步状态
      setIsRecording((rec) => {
        if (rec) {
          // 意外中断：如果已有内容则保留，不自动重启
          toast.info("语音识别已结束");
        }
        return false;
      });
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
      setIsRecording(true);
      toast.success("🎤 开始说话…");
      // 看门狗：6 秒内没有任何最终结果，按国内网络不可用处理，降级录音
      clearSttWatchdog();
      sttWatchdogRef.current = setTimeout(() => {
        setIsRecording(false);
        try { recognition.stop(); } catch (e) { /* noop */ }
        switchToRecordMode("未识别到语音，已切换为录音识别");
      }, 6000);
    } catch (e) {
      toast.error("麦克风启动失败，请重试");
      setIsRecording(false);
      clearSttWatchdog();
    }
  };

  // ── 录音兜底：getUserMedia → 重采样 16k 单声道 PCM → WAV → 后端识别 ──
  const stopMediaRecording = () => {
    const a = audioRef.current;
    if (!a) return;
    audioRef.current = null;
    try { a.processor.disconnect(); } catch (e) { /* noop */ }
    try { a.source.disconnect(); } catch (e) { /* noop */ }
    try { a.stream.getTracks().forEach((t) => t.stop()); } catch (e) { /* noop */ }
    try { a.ctx.close(); } catch (e) { /* noop */ }
    setIsRecording(false);
  };

  const startMediaRecording = async () => {
    if (audioRef.current || isTranscribing) return;
    setTranscript("");
    setInterim("");
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1 } });
    } catch (e) {
      toast.error("无法访问麦克风，请检查权限设置");
      return;
    }
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    await ctx.resume();
    const source = ctx.createMediaStreamSource(stream);
    // ScriptProcessor 已废弃但全平台可用；录音时长仅数秒，性能足够
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    const chunks = [];
    processor.onaudioprocess = (e) => {
      chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    };
    source.connect(processor);
    processor.connect(ctx.destination);
    audioRef.current = { stream, ctx, source, processor, chunks, sampleRate: ctx.sampleRate };
    setIsRecording(true);
    toast.success("🎤 开始录音，说完再点一次停止");
  };

  // Float32 重采样到 16k 并打包 WAV（16bit 单声道），阿里云一句话识别直接可用
  const encodeWav16k = (chunks, inputRate) => {
    const targetRate = 16000;
    const total = chunks.reduce((n, c) => n + c.length, 0);
    const merged = new Float32Array(total);
    let offset = 0;
    chunks.forEach((c) => { merged.set(c, offset); offset += c.length; });
    const step = inputRate / targetRate;
    const outLen = Math.floor(total / step);
    const pcm = new Int16Array(outLen);
    for (let i = 0; i < outLen; i++) {
      const pos = i * step;
      const i0 = Math.floor(pos);
      const i1 = Math.min(i0 + 1, total - 1);
      const frac = pos - i0;
      const v = merged[i0] * (1 - frac) + merged[i1] * frac;
      pcm[i] = Math.max(-1, Math.min(1, v)) * 32767;
    }
    const buffer = new ArrayBuffer(44 + pcm.length * 2);
    const view = new DataView(buffer);
    const writeStr = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
    writeStr(0, "RIFF");
    view.setUint32(4, 36 + pcm.length * 2, true);
    writeStr(8, "WAVE");
    writeStr(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, targetRate, true);
    view.setUint32(28, targetRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, "data");
    view.setUint32(40, pcm.length * 2, true);
    new Int16Array(buffer, 44).set(pcm);
    return new Blob([buffer], { type: "audio/wav" });
  };

  const stopMediaRecordingAndTranscribe = async () => {
    const a = audioRef.current;
    if (!a) return;
    const { chunks, sampleRate } = a;
    stopMediaRecording();
    const totalSamples = chunks.reduce((n, c) => n + c.length, 0);
    // AudioContext 启动会有一小段空数据，真实录音至少几百毫秒
    if (totalSamples < sampleRate * 0.3) {
      toast.error("录音太短，请长按多说一点");
      return;
    }
    const wav = encodeWav16k(chunks, sampleRate);
    setIsTranscribing(true);
    try {
      const resp = await fetch(buildApiUrl("/api/voice/transcribe?format=wav&sample_rate=16000"), {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          ...(getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {})
        },
        body: wav
      });
      if (resp.status === 501) {
        toast.error("语音服务未开通，请联系管理员配置");
        setIsTranscribing(false);
        return;
      }
      if (!resp.ok) {
        toast.error("识别失败，请再试一次");
        setIsTranscribing(false);
        return;
      }
      const data = await resp.json();
      const text = (data.text || "").trim();
      if (!text) {
        toast.error("没听清内容，请再录一次");
        setIsTranscribing(false);
        return;
      }
      setTranscript((prev) => (prev ? prev + " " + text : text));
      toast.success("识别成功，检查一下内容");
    } catch (e) {
      toast.error("识别服务暂不可用，请稍后再试");
    }
    setIsTranscribing(false);
  };

  const handleGenerate = async () => {
    stopRecognition();
    stopMediaRecording();
    const text = transcript.trim();
    if (!text) {
      toast.error("未检测到语音内容");
      return;
    }
    setIsProcessing(true);
    try {
      const timeCtx = getTimeContextForAI();
      const result = await invokeAI({
        prompt: `从以下语音文字中解析出约定/任务信息，生成结构化数据。
${timeCtx.promptSnippet}

语音内容: "${text}"

请推断标题、描述、时间、优先级、类别。

⏰ 相对时间处理（最高优先级）：
- "X分钟后" / "几分钟后" / "马上" / "立刻" / "现在就" → 必须基于"当前时间"精确加 X 分钟
  - 例：当前 ${timeCtx.now_local}，用户说"十分钟后提醒我" → reminder_time 为当前时间加 10 分钟后的 ISO 时间
- "X小时后" → 当前时间加 X 小时
- "半小时后" → 加 30 分钟
- "一刻钟后" → 加 15 分钟

🤝 拟人化提醒语义（不是死板闹钟）：
- "提醒我X分钟后做某事" = 在 X 分钟时轻声提醒用户**开始**，并在默认 1 小时后温和**跟进**是否完成或需要延长。
- 因此：reminder_time = 当前时间 + X；end_time = reminder_time + 1 小时（作为预计用时和跟进窗口）。
- 如果用户没有明确说截止时间，不要把 end_time 当作硬截止，而是 AI 助手的 check-in 点。

所有时间必须输出为 ISO 8601 格式并带 +08:00 时区。
返回 JSON。`,
        response_json_schema: {
          type: "object",
          properties: {
            title: { type: "string" },
            description: { type: "string" },
            reminder_time: { type: "string", description: "ISO 时间，优先使用带 +08:00 的格式" },
            end_time: { type: "string", description: "可选，带 +08:00 的 ISO 时间" },
            is_all_day: { type: "boolean", description: "是否为全天事件" },
            priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
            category: { type: "string", enum: ["work", "personal", "health", "study", "family", "shopping", "finance", "checkin", "other"] }
          },
          required: ["title", "reminder_time"]
        }
      }, "task_breakdown");

      if (!result?.title) {
        toast.error("未能识别出约定内容，请重试");
        setIsProcessing(false);
        return;
      }

      // 客户端兜底：覆盖 AI 没按相对时间解析的常见表达
      const fallbackTime = resolveNaturalLanguageTime(text, result.reminder_time);
      if (fallbackTime) {
        result.reminder_time = fallbackTime.iso;
      }

      console.log(`[VoiceTime] 最终 reminder_time: ${result.reminder_time}`);

      const normalized = normalizeTaskTime({
        title: result.title,
        description: result.description || "",
        reminder_time: result.reminder_time,
        end_time: result.end_time,
        is_all_day: result.is_all_day,
        priority: result.priority || "medium",
        category: result.category || "personal",
        status: "pending"
      });

      await base44.entities.Task.create(normalized);

      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("✨ 已为你创建约定");
      setIsProcessing(false);
      setTranscript("");
      onClose();
    } catch (err) {
      console.error("Voice quick create failed:", err);
      toast.error(err?.code === "INSUFFICIENT_CREDITS" ? "AI 点数不足" : "生成失败，请重试");
      setIsProcessing(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => { stopRecognition(); stopMediaRecording(); onClose(); }}
            className="md:hidden fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, y: 80 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 80 }}
            transition={{ type: "spring", damping: 26, stiffness: 320 }}
            className="md:hidden fixed bottom-0 inset-x-0 z-[61] bg-white rounded-t-3xl p-6 pb-10 shadow-2xl"
          >
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-[#384877]" />
                <h3 className="font-bold text-slate-800 text-base">语音一键生成约定</h3>
              </div>
              <button
                onClick={() => { stopRecognition(); stopMediaRecording(); onClose(); }}
                className="p-2 rounded-full hover:bg-slate-100 text-slate-400 no-min-size"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-col items-center gap-5">
              <button
                onClick={() => {
                  if (isProcessing || isTranscribing) return;
                  if (mode === "record") {
                    if (isRecording) stopMediaRecordingAndTranscribe();
                    else startMediaRecording();
                  } else {
                    isRecording ? stopRecognition() : startRecording();
                  }
                }}
                disabled={isProcessing || isTranscribing}
                className={`h-24 w-24 rounded-full flex items-center justify-center text-white shadow-lg transition-all no-min-size ${
                  isRecording
                    ? "bg-red-500 animate-pulse shadow-red-500/30"
                    : "bg-gradient-to-br from-[#384877] to-[#3b5aa2] shadow-[#384877]/30"
                }`}
              >
                {isProcessing || isTranscribing ? (
                  <Loader2 className="w-10 h-10 animate-spin" />
                ) : isRecording ? (
                  <MicOff className="w-10 h-10" />
                ) : (
                  <Mic className="w-10 h-10" />
                )}
              </button>

              <div className="text-xs text-slate-400 -mt-2">
                {mode === "record"
                  ? (isRecording ? "录音中…说完再点一次停止" : "点击麦克风录音，自动识别文字")
                  : (isRecording ? "正在聆听，请说出你的约定…" : "点击麦克风开始说话")}
              </div>

              <div className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 min-h-[80px] text-center text-slate-600 text-sm">
                {transcript || interim ? (
                  <>
                    {transcript}
                    {interim && <span className="text-slate-400"> {interim}</span>}
                  </>
                ) : (
                  isRecording
                    ? (mode === "record" ? "正在录音…" : "正在聆听，请说出你的约定…")
                    : "点击麦克风开始说话"
                )}
              </div>

              {supported && (
                <button
                  onClick={() => {
                    if (mode === "record") {
                      stopMediaRecording();
                      setMode("stt");
                    } else {
                      switchToRecordMode();
                    }
                  }}
                  className="text-xs text-[#384877]/70 underline underline-offset-2 no-min-size"
                >
                  {mode === "record" ? "在线识别可用？切换回在线识别" : "识别不到？改用录音识别"}
                </button>
              )}

              <button
                onClick={handleGenerate}
                disabled={isProcessing || isTranscribing || !transcript.trim()}
                className="w-full h-12 rounded-2xl bg-[#384877] hover:bg-[#2c3b63] text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-40 transition-colors"
              >
                {isProcessing ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> AI 生成中…</>
                ) : isTranscribing ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> 识别中…</>
                ) : (
                  <><Check className="w-5 h-5" /> 一键生成约定</>
                )}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}