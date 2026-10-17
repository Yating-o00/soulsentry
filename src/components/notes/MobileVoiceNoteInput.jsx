import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Mic, MicOff, Camera, Image, Send, X, Loader2, Sparkles, Type } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

export default function MobileVoiceNoteInput({ onSave, onClose }) {
  const [inputMode, setInputMode] = useState("voice"); // "voice" or "text"
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [capturedImage, setCapturedImage] = useState(null);
  const [uploadedImageUrl, setUploadedImageUrl] = useState(null);
  const recognitionRef = useRef(null);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.lang = 'zh-CN';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript + ' ';
        }
      }
      if (finalTranscript) {
        setTranscript(prev => prev + finalTranscript);
      }
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        toast.error("语音识别出错");
      }
      setIsRecording(false);
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  const toggleRecording = () => {
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
    } else {
      setTranscript("");
      setIsRecording(true);
      recognitionRef.current?.start();
      toast.success("🎤 开始录音");
    }
  };

  const handleImageUpload = async (file) => {
    if (!file) return;

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await base44.integrations.Core.UploadFile({ file });
      setUploadedImageUrl(response.file_url);
      setCapturedImage(URL.createObjectURL(file));
      toast.success("图片已上传");
    } catch (error) {
      console.error("上传失败:", error);
      toast.error("图片上传失败");
    }
  };

  const handleSave = async () => {
    if (!transcript.trim() && !uploadedImageUrl) {
      toast.error("请输入内容或上传图片");
      return;
    }

    setIsProcessing(true);

    try {
      let content = transcript.trim();
      
      // 如果有图片，添加到内容中
      if (uploadedImageUrl) {
        content = `<img src="${uploadedImageUrl}" alt="照片" style="max-width: 100%; border-radius: 8px; margin: 8px 0;" /><p>${content}</p>`;
      } else {
        content = `<p>${content}</p>`;
      }

      // 使用AI分析内容
      let aiAnalysis = null;
      if (content) {
        try {
          const analysisPrompt = uploadedImageUrl 
            ? `分析这张图片和文字描述。提取关键信息、实体和标签。\n\n文字: ${transcript}`
            : `分析这段文字，提取关键信息、实体和标签。\n\n内容: ${transcript}`;

          const res = await base44.integrations.Core.InvokeLLM({
            prompt: analysisPrompt,
            file_urls: uploadedImageUrl ? [uploadedImageUrl] : undefined,
            response_json_schema: {
              type: "object",
              properties: {
                summary: { type: "string" },
                key_points: { type: "array", items: { type: "string" } },
                tags: { type: "array", items: { type: "string" } },
                entities: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      text: { type: "string" },
                      type: { type: "string" }
                    }
                  }
                }
              }
            }
          });

          if (res) {
            aiAnalysis = {
              summary: res.summary,
              key_points: res.key_points || [],
              entities: res.entities || []
            };
          }
        } catch (e) {
          console.error("AI分析失败:", e);
        }
      }

      onSave({
        content,
        plain_text: transcript.trim(),
        tags: aiAnalysis?.tags || [],
        color: "white",
        ai_analysis: aiAnalysis
      });

      setTranscript("");
      setCapturedImage(null);
      setUploadedImageUrl(null);
    } catch (error) {
      console.error("保存失败:", error);
      toast.error("保存失败");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-3xl shadow-2xl border-t-2 border-slate-200 max-h-[90vh] overflow-y-auto"
    >
      <div className="p-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <h3 className="font-bold text-lg text-slate-800">快速记录</h3>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Image Preview */}
        <AnimatePresence>
          {capturedImage && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="relative"
            >
              <img
                src={capturedImage}
                alt="预览"
                className="w-full rounded-xl border-2 border-slate-200 max-h-64 object-cover"
              />
              <Button
                variant="destructive"
                size="icon"
                className="absolute top-2 right-2"
                onClick={() => {
                  setCapturedImage(null);
                  setUploadedImageUrl(null);
                }}
              >
                <X className="w-4 h-4" />
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Input Mode Toggle */}
        <div className="flex gap-2 bg-slate-100 p-1 rounded-lg">
          <button
            onClick={() => setInputMode("voice")}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md transition-all ${
              inputMode === "voice"
                ? "bg-white shadow-sm text-[#384877] font-medium"
                : "text-slate-500"
            }`}
          >
            <Mic className="w-4 h-4" />
            <span className="text-sm">语音</span>
          </button>
          <button
            onClick={() => setInputMode("text")}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md transition-all ${
              inputMode === "text"
                ? "bg-white shadow-sm text-[#384877] font-medium"
                : "text-slate-500"
            }`}
          >
            <Type className="w-4 h-4" />
            <span className="text-sm">文字</span>
          </button>
        </div>

        {/* Input Area */}
        {inputMode === "voice" ? (
          <div className="min-h-[120px] max-h-[300px] overflow-y-auto bg-slate-50 rounded-xl p-4 border-2 border-dashed border-slate-200">
            {transcript ? (
              <p className="text-slate-700 text-base leading-relaxed">{transcript}</p>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-slate-400">
                <Mic className="w-12 h-12 mb-2" />
                <p className="text-sm">点击麦克风开始语音输入...</p>
              </div>
            )}
          </div>
        ) : (
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder="输入心签内容..."
            className="w-full min-h-[120px] max-h-[300px] p-4 bg-slate-50 rounded-xl border-2 border-slate-200 focus:border-[#384877] focus:ring-2 focus:ring-[#384877]/20 outline-none resize-none text-base text-slate-700"
          />
        )}

        {/* Action Buttons */}
        <div className="grid grid-cols-3 gap-3">
          {/* Camera */}
          <Button
            variant="outline"
            size="lg"
            className="h-16 flex-col gap-1"
            onClick={() => cameraInputRef.current?.click()}
          >
            <Camera className="w-6 h-6" />
            <span className="text-xs">拍照</span>
          </Button>
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => handleImageUpload(e.target.files?.[0])}
          />

          {/* Voice - Only in voice mode */}
          {inputMode === "voice" && (
            <Button
              variant={isRecording ? "destructive" : "default"}
              size="lg"
              className={`h-16 flex-col gap-1 ${isRecording ? 'animate-pulse' : ''}`}
              onClick={toggleRecording}
            >
              {isRecording ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
              <span className="text-xs">{isRecording ? "停止" : "语音"}</span>
            </Button>
          )}

          {/* Gallery */}
          <Button
            variant="outline"
            size="lg"
            className={`h-16 flex-col gap-1 ${inputMode === "text" ? "col-span-2" : ""}`}
            onClick={() => fileInputRef.current?.click()}
          >
            <Image className="w-6 h-6" />
            <span className="text-xs">相册</span>
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleImageUpload(e.target.files?.[0])}
          />
        </div>

        {/* Save Button */}
        <Button
          className="w-full h-14 text-lg bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
          onClick={handleSave}
          disabled={isProcessing || (!transcript.trim() && !uploadedImageUrl)}
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              处理中...
            </>
          ) : (
            <>
              <Send className="w-5 h-5 mr-2" />
              保存心签
            </>
          )}
        </Button>

        <p className="text-xs text-center text-slate-500">
          💡 支持文字/语音输入、拍照记录和相册上传
        </p>
      </div>
    </motion.div>
  );
}