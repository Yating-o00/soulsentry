import React, { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { invokeAI } from "@/components/utils/aiHelper";
import { normalizeTaskTime, toShanghaiTimeStr } from "@/lib/timeCore";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Mic, MicOff, Paperclip, Send, Loader2, Users2, Footprints, Sparkles } from "lucide-react";

const EXAMPLES = [
  { label: "协同约定：一起讨论产品方案", icon: Users2, value: "和伙伴一起讨论产品方案，落地切入点" },
  { label: "打卡约定：每晚跑步 3 公里", icon: Footprints, value: "每晚跑步 3 公里，持续 30 天" },
  { label: "其他：明天上午 10 点开会", icon: Sparkles, value: "明天上午 10 点开会" },
];

export default function QuickTaskComposer({
  onCreateTask,
  onCreateCollab,
}) {
  const [input, setInput] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileRef = useRef(null);
  const recognitionRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    const recognition = new SpeechRecognition();
    recognition.lang = "zh-CN";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      let text = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        text += event.results[i][0].transcript;
      }
      if (text) setInput((prev) => (prev ? prev + " " + text : text).trim());
    };
    recognition.onerror = () => {
      setIsRecording(false);
      toast.error("语音识别失败，请重试");
    };
    recognition.onend = () => {
      if (isRecording) recognition.start();
    };
    recognitionRef.current = recognition;
    return () => recognitionRef.current?.stop();
  }, [isRecording]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
  }, [input]);

  const toggleRecording = () => {
    if (!recognitionRef.current) {
      toast.info("当前浏览器不支持语音输入");
      return;
    }
    if (isRecording) {
      recognitionRef.current.stop();
      setIsRecording(false);
    } else {
      setInput("");
      setIsRecording(true);
      recognitionRef.current.start();
      toast.success("开始语音输入");
    }
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `请识别图片或文档中的文字内容，提取其中的约定、任务、时间、地点等关键信息，只返回一个最核心任务的标题。当前时间: ${new Date().toISOString()}`,
        file_urls: [file_url],
        response_json_schema: {
          type: "object",
          properties: {
            title: { type: "string", description: "任务标题" },
            extracted_text: { type: "string", description: "从文件中提取的原始文字" },
          },
          required: ["title"],
        },
      });
      if (result?.title) {
        setInput((prev) => (prev ? `${prev}\n${result.title}` : result.title));
        toast.success("已识别图片内容");
      } else {
        toast.error("未能识别到有效内容");
      }
    } catch (err) {
      console.error("OCR failed:", err);
      toast.error("识别失败，请重试");
    } finally {
      setIsUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleSubmit = async () => {
    const text = input.trim();
    if (!text) return;
    setIsProcessing(true);
    try {
      const parsed = await invokeAI(
        {
          prompt: `从以下自然语言中提取一个约定任务，返回 JSON。当前时间: ${new Date().toISOString()}\n文本："${text}"`,
          response_json_schema: {
            type: "object",
            properties: {
              title: { type: "string" },
              description: { type: "string" },
              reminder_time: { type: "string" },
              priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
              category: { type: "string", enum: ["work", "personal", "health", "study", "family", "shopping", "finance", "checkin", "other"] },
            },
            required: ["title", "reminder_time"],
          },
        },
        "task_breakdown"
      );
      const fallbackDate = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
      const normalized = normalizeTaskTime(parsed, fallbackDate);
      const taskToSubmit = {
        title: parsed.title,
        description: parsed.description || "",
        reminder_time: normalized.reminder_time,
        end_time: normalized.end_time,
        priority: parsed.priority || "medium",
        category: parsed.category || "personal",
        status: "pending",
      };
      await onCreateTask(taskToSubmit);
      setInput("");
    } catch (err) {
      console.error("Create failed:", err);
      toast.error("创建失败，请重试");
    } finally {
      setIsProcessing(false);
    }
  };

  const applyExample = (value) => {
    if (value.startsWith("协同约定：") && onCreateCollab) {
      onCreateCollab();
      return;
    }
    setInput(value);
    textareaRef.current?.focus();
  };

  return (
    <div className="space-y-2">
      {/* 极简输入：搜索与操作已整合进顶部工具栏 */}
      <div className="flex items-end gap-1.5 rounded-2xl border border-stone-200 bg-white p-1.5 shadow-sm transition-colors focus-within:border-[#384877]">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={isUploading}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-stone-400 transition-colors hover:bg-stone-100 hover:text-[#384877] disabled:opacity-50"
          title="上传图片或文档"
        >
          {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
        </button>
        <input ref={fileRef} type="file" className="hidden" accept="image/*,.pdf,.doc,.docx,.txt" onChange={handleFileSelect} />

        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
          placeholder="一句话描述约定…"
          rows={1}
          className="min-h-[34px] w-full resize-none border-0 bg-transparent py-2 text-[14px] leading-5 text-stone-800 placeholder:text-stone-400 focus-visible:outline-none"
        />

        <button
          type="button"
          onClick={toggleRecording}
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors",
            isRecording ? "bg-rose-50 text-rose-500" : "text-stone-400 hover:bg-stone-100 hover:text-[#384877]"
          )}
          title={isRecording ? "停止语音输入" : "语音输入"}
        >
          {isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        </button>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={isProcessing || !input.trim()}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#384877] text-white transition-colors hover:bg-[#2d3a60] disabled:opacity-50"
          title="创建约定"
        >
          {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>

      {/* 示例 */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-stone-400">试一试：</span>
        {EXAMPLES.map((ex) => (
          <button
            key={ex.label}
            type="button"
            onClick={() => applyExample(ex.value)}
            className="inline-flex items-center gap-1 rounded-full border border-stone-200 bg-white px-2.5 py-1 text-[11px] text-stone-600 transition-colors hover:border-[#384877] hover:text-[#384877]"
          >
            <ex.icon className="h-3 w-3" />
            <span>{ex.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
