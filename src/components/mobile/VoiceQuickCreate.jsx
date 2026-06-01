import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, Loader2, X, Sparkles, Check } from "lucide-react";
import { toast } from "sonner";
import { invokeAI } from "@/components/utils/aiHelper";
import { format } from "date-fns";

// 移动端"+号"语音一键生成约定：录音 → AI 解析 → 直接创建
export default function VoiceQuickCreate({ open, onClose }) {
  const queryClient = useQueryClient();
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [supported, setSupported] = useState(true);
  const recognitionRef = useRef(null);
  const isRecordingRef = useRef(false);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSupported(false);
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = "zh-CN";
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let finalText = "";
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const txt = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += txt + " ";
        else interimText += txt;
      }
      if (finalText) setTranscript((prev) => prev + finalText);
      else if (interimText) setTranscript((prev) => prev);
    };

    recognition.onerror = (event) => {
      if (event.error === "not-allowed") toast.error("请允许麦克风权限");
      isRecordingRef.current = false;
      setIsRecording(false);
    };

    recognition.onend = () => {
      if (isRecordingRef.current) {
        try { recognition.start(); } catch (e) { /* ignore */ }
      }
    };

    recognitionRef.current = recognition;
    return () => { try { recognition.stop(); } catch (e) { /* ignore */ } };
  }, []);

  // 打开时自动开始录音
  useEffect(() => {
    if (open && supported) {
      setTranscript("");
      const t = setTimeout(() => {
        isRecordingRef.current = true;
        setIsRecording(true);
        try { recognitionRef.current?.start(); toast.success("🎤 开始说话"); } catch (e) { /* ignore */ }
      }, 350);
      return () => clearTimeout(t);
    }
    if (!open) {
      isRecordingRef.current = false;
      setIsRecording(false);
      try { recognitionRef.current?.stop(); } catch (e) { /* ignore */ }
    }
  }, [open, supported]);

  const handleClose = () => {
    isRecordingRef.current = false;
    setIsRecording(false);
    try { recognitionRef.current?.stop(); } catch (e) { /* ignore */ }
    setTranscript("");
    setIsProcessing(false);
    onClose();
  };

  const handleGenerate = async () => {
    isRecordingRef.current = false;
    setIsRecording(false);
    try { recognitionRef.current?.stop(); } catch (e) { /* ignore */ }

    const text = transcript.trim();
    if (!text) {
      toast.error("未检测到语音内容");
      return;
    }

    setIsProcessing(true);
    try {
      const now = new Date().toISOString();
      const res = await invokeAI({
        prompt: `根据用户的语音内容，生成一条约定（任务）。
语音内容："${text}"
当前时间：${now}（时区 Asia/Shanghai）
请解析出标题、描述、提醒时间、优先级、类别。如果用户没有说明确时间，提醒时间默认设为明天上午9点。
返回 JSON。`,
        response_json_schema: {
          type: "object",
          properties: {
            title: { type: "string" },
            description: { type: "string" },
            reminder_time: { type: "string", description: "ISO 格式时间" },
            priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
            category: { type: "string", enum: ["work", "personal", "health", "study", "family", "shopping", "finance", "other"] }
          },
          required: ["title"]
        }
      }, "task_breakdown");

      if (!res?.title) {
        toast.error("未能识别出约定内容，请重试");
        setIsProcessing(false);
        return;
      }

      const reminderDate = res.reminder_time && !isNaN(new Date(res.reminder_time).getTime())
        ? new Date(res.reminder_time)
        : (() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d; })();

      await base44.entities.Task.create({
        title: res.title,
        description: res.description || "",
        reminder_time: reminderDate.toISOString(),
        priority: res.priority || "medium",
        category: res.category || "personal",
        status: "pending"
      });

      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      toast.success(`✨ 已创建约定：${res.title}`);
      handleClose();
    } catch (err) {
      console.error("Voice create failed:", err);
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
            onClick={handleClose}
            className="md:hidden fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, y: 80 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 80 }}
            transition={{ type: "spring", damping: 26, stiffness: 320 }}
            className="md:hidden fixed bottom-0 inset-x-0 z-[61] bg-white rounded-t-3xl shadow-2xl p-6 pb-10"
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-[#384877]" />
                <h3 className="text-base font-bold text-slate-800">语音一键生成约定</h3>
              </div>
              <button onClick={handleClose} className="p-2 rounded-full hover:bg-slate-100 no-min-size">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            {!supported ? (
              <div className="text-center py-8 text-slate-500 text-sm">
                当前浏览器不支持语音识别，请使用 Chrome 或 Safari。
              </div>
            ) : (
              <div className="flex flex-col items-center gap-6">
                <button
                  onClick={isRecording ? handleGenerate : () => {
                    isRecordingRef.current = true;
                    setIsRecording(true);
                    try { recognitionRef.current?.start(); } catch (e) { /* ignore */ }
                  }}
                  disabled={isProcessing}
                  className={`relative h-24 w-24 rounded-full flex items-center justify-center text-white shadow-lg transition-all active:scale-95 ${
                    isRecording ? "bg-red-500" : "bg-[#384877]"
                  }`}
                >
                  {isRecording && (
                    <span className="absolute inset-0 rounded-full bg-red-400 animate-ping opacity-40" />
                  )}
                  {isProcessing ? (
                    <Loader2 className="h-10 w-10 animate-spin" />
                  ) : isRecording ? (
                    <MicOff className="h-10 w-10" />
                  ) : (
                    <Mic className="h-10 w-10" />
                  )}
                </button>

                <div className="w-full bg-slate-50 rounded-2xl p-4 min-h-[80px] text-center text-slate-600 text-sm">
                  {transcript || (isRecording ? "正在听，说完点麦克风生成…" : "点击麦克风开始说话")}
                </div>

                {transcript.trim() && !isProcessing && (
                  <button
                    onClick={handleGenerate}
                    className="w-full flex items-center justify-center gap-2 bg-[#384877] text-white rounded-2xl py-3.5 font-semibold active:scale-[0.98] transition-transform"
                  >
                    <Check className="w-5 h-5" /> 生成约定
                  </button>
                )}
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}