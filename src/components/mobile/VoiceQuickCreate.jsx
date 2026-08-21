import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, Loader2, X, Sparkles, Check } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { invokeAI } from "@/components/utils/aiHelper";
import { toast } from "sonner";
import { getTimeContextForAI, normalizeTaskTime } from "@/lib/timeCore";

/**
 * 移动端「+ → 新建约定」语音一键生成弹窗。
 * 录音 → AI 解析 → 直接创建约定，无需跳转或手动填表。
 *
 * 注意：移动端 Web Speech API 必须由用户手势触发，因此弹窗打开后
 * 不自动录音，需要用户点击麦克风按钮才开始。每次点击都创建新的
 * recognition 实例，避免旧实例状态腐烂导致首次点击无响应。
 */
export default function VoiceQuickCreate({ open, onClose }) {
  const queryClient = useQueryClient();
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [supported, setSupported] = useState(true);
  const recognitionRef = useRef(null);

  // 只检测设备是否支持语音识别，不预先创建实例
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    setSupported(!!SpeechRecognition);
  }, []);

  // 关闭弹窗时停止录音并清空文案
  useEffect(() => {
    if (!open) {
      stopRecognition();
      setTranscript("");
      setIsProcessing(false);
    }
  }, [open]);

  const stopRecognition = () => {
    setIsRecording(false);
    try {
      recognitionRef.current?.stop();
    } catch (e) { /* noop */ }
    recognitionRef.current = null;
  };

  const startRecording = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error("当前浏览器不支持语音识别");
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
        setTranscript((prev) => prev + finalText);
        setInterim("");
      } else if (interimText) {
        setInterim(interimText);
      }
    };

    recognition.onerror = (event) => {
      if (event.error === "not-allowed") toast.error("请允许麦克风权限");
      if (event.error === "aborted") return;
      setIsRecording(false);
    };

    recognition.onend = () => {
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
    } catch (e) {
      toast.error("麦克风启动失败，请重试");
      setIsRecording(false);
    }
  };

  const handleGenerate = async () => {
    stopRecognition();
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

请推断标题、描述、时间、优先级、类别。返回 JSON。`,
        response_json_schema: {
          type: "object",
          properties: {
            title: { type: "string" },
            description: { type: "string" },
            reminder_time: { type: "string", description: "ISO 时间，优先使用带 +08:00 的格式" },
            end_time: { type: "string", description: "可选，带 +08:00 的 ISO 时间" },
            is_all_day: { type: "boolean", description: "是否为全天事件" },
            priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
            category: { type: "string", enum: ["work", "personal", "health", "study", "family", "shopping", "finance", "other"] }
          },
          required: ["title", "reminder_time"]
        }
      }, "task_breakdown");

      if (!result?.title) {
        toast.error("未能识别出约定内容，请重试");
        setIsProcessing(false);
        return;
      }

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
            onClick={() => { stopRecognition(); onClose(); }}
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
                onClick={() => { stopRecognition(); onClose(); }}
                className="p-2 rounded-full hover:bg-slate-100 text-slate-400 no-min-size"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {!supported ? (
              <div className="text-center py-8 text-slate-500 text-sm">
                当前浏览器不支持语音识别，请使用 Chrome 或 Safari。
              </div>
            ) : (
              <div className="flex flex-col items-center gap-5">
                <button
                  onClick={isRecording ? stopRecognition : startRecording}
                  disabled={isProcessing}
                  className={`h-24 w-24 rounded-full flex items-center justify-center text-white shadow-lg transition-all no-min-size ${
                    isRecording
                      ? "bg-red-500 animate-pulse shadow-red-500/30"
                      : "bg-gradient-to-br from-[#384877] to-[#3b5aa2] shadow-[#384877]/30"
                  }`}
                >
                  {isProcessing ? (
                    <Loader2 className="w-10 h-10 animate-spin" />
                  ) : isRecording ? (
                    <MicOff className="w-10 h-10" />
                  ) : (
                    <Mic className="w-10 h-10" />
                  )}
                </button>

                <div className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 min-h-[80px] text-center text-slate-600 text-sm">
                  {transcript || interim ? (
                    <>
                      {transcript}
                      {interim && <span className="text-slate-400"> {interim}</span>}
                    </>
                  ) : (
                    isRecording ? "正在聆听，请说出你的约定…" : "点击麦克风开始说话"
                  )}
                </div>

                <button
                  onClick={handleGenerate}
                  disabled={isProcessing || !transcript.trim()}
                  className="w-full h-12 rounded-2xl bg-[#384877] hover:bg-[#2c3b63] text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-40 transition-colors"
                >
                  {isProcessing ? (
                    <><Loader2 className="w-5 h-5 animate-spin" /> AI 生成中…</>
                  ) : (
                    <><Check className="w-5 h-5" /> 一键生成约定</>
                  )}
                </button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}