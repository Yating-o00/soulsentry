import React, { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Calendar, StickyNote, Loader2, ArrowRight, Mic, MicOff, ImagePlus, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { toast } from "sonner";
import { useTranslation } from "@/components/TranslationContext";

export default function Welcome({ onComplete }) {
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [showResult, setShowResult] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const recognitionRef = useRef(null);
  const imageInputRef = useRef(null);
  const navigate = useNavigate();
  const { t } = useTranslation();

  const handleImageSelect = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    // 验证文件类型
    if (!file.type.startsWith('image/')) {
      toast.error("请选择图片文件");
      return;
    }

    // 验证文件大小 (最大 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error("图片大小不能超过 10MB");
      return;
    }

    setImageFile(file);
    
    // 创建预览
    const reader = new FileReader();
    reader.onload = function(event) {
      setImagePreview(event.target.result);
    };
    reader.readAsDataURL(file);
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
    if (imageInputRef.current) {
      imageInputRef.current.value = '';
    }
  };

  const startVoiceInput = () => {
    try {
      // 检查是否支持语音识别
      const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognitionAPI) {
        toast.error("您的浏览器不支持语音输入");
        return;
      }

      recognitionRef.current = new SpeechRecognitionAPI();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'zh-CN';

      recognitionRef.current.onstart = function() {
        setIsListening(true);
      };

      recognitionRef.current.onresult = function(event) {
        var finalTranscript = '';
        
        for (var i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i] && event.results[i][0]) {
            var transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              finalTranscript += transcript;
            }
          }
        }
        
        if (finalTranscript) {
          setInput(function(prev) { return prev + finalTranscript; });
        }
      };

      recognitionRef.current.onerror = function(event) {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
        if (event.error === 'not-allowed') {
          toast.error("请允许麦克风权限");
        }
      };

      recognitionRef.current.onend = function() {
        setIsListening(false);
      };

      recognitionRef.current.start();
    } catch (e) {
      console.error('Voice input error:', e);
      toast.error("语音输入初始化失败");
    }
  };

  const stopVoiceInput = () => {
    try {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        setIsListening(false);
      }
    } catch (e) {
      console.error('Stop voice input error:', e);
      setIsListening(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if ((!input.trim() && !imageFile) || isProcessing) return;

    setIsProcessing(true);

    try {
      let textToAnalyze = input;
      let imageUrl = null;

      // 如果有图片，先上传并进行 OCR 识别
      if (imageFile) {
        setIsUploadingImage(true);
        try {
          // 上传图片
          const uploadResult = await base44.integrations.Core.UploadFile({ file: imageFile });
          imageUrl = uploadResult.file_url;

          // 使用 AI 识别图片内容
          const ocrResponse = await base44.integrations.Core.InvokeLLM({
            prompt: `请仔细分析这张图片，提取其中所有的文字内容。如果图片中包含：
- 日程、会议、约会信息
- 待办事项、任务清单
- 笔记、备忘录
- 截图中的重要文字

请完整提取文字内容，保持原有格式。如果图片不包含文字，请描述图片内容。`,
            file_urls: [imageUrl],
            response_json_schema: {
              type: "object",
              properties: {
                extracted_text: { type: "string", description: "提取的文字内容" },
                has_text: { type: "boolean", description: "图片是否包含文字" },
                image_description: { type: "string", description: "图片内容描述" }
              },
              required: ["extracted_text", "has_text"]
            }
          });

          if (ocrResponse.has_text && ocrResponse.extracted_text) {
            textToAnalyze = input.trim() 
              ? `${input}\n\n[图片内容]:\n${ocrResponse.extracted_text}`
              : ocrResponse.extracted_text;
          } else if (ocrResponse.image_description) {
            textToAnalyze = input.trim()
              ? `${input}\n\n[图片描述]: ${ocrResponse.image_description}`
              : `[图片描述]: ${ocrResponse.image_description}`;
          }
        } catch (uploadError) {
          console.error("图片处理失败:", uploadError);
          toast.error("图片处理失败，将仅使用文字内容");
        }
        setIsUploadingImage(false);
      }

      if (!textToAnalyze.trim()) {
        toast.error("无法识别内容，请输入文字或使用更清晰的图片");
        setIsProcessing(false);
        return;
      }

      // 使用 AI 识别内容类型和提取信息
      const aiResponse = await base44.integrations.Core.InvokeLLM({
        prompt: `分析以下用户输入，判断这是一个"任务/约定"还是"笔记/心签"。

任务/约定的特征：
- 包含时间、日期、提醒
- 包含动作词汇（做、完成、去、买、开会等）
- 是待办事项、计划、会议、活动

笔记/心签的特征：
- 记录想法、灵感、感悟
- 知识、学习笔记
- 日记、心情
- 没有明确的时间或待办性质

用户输入："""${textToAnalyze}"""

请返回JSON格式：
{
  "type": "task" 或 "note",
  "title": "提取的标题（任务用）",
  "description": "详细描述",
  "content": "完整内容（笔记用）",
  "reminder_time": "提取的时间（ISO格式，如果有）",
  "priority": "low/medium/high/urgent（任务用）",
  "category": "work/personal/health/study等（任务用）",
  "tags": ["标签1", "标签2"]（笔记用）
}`,
        response_json_schema: {
          type: "object",
          properties: {
            type: { type: "string", enum: ["task", "note"] },
            title: { type: "string" },
            description: { type: "string" },
            content: { type: "string" },
            reminder_time: { type: "string" },
            priority: { type: "string" },
            category: { type: "string" },
            tags: { type: "array", items: { type: "string" } }
          },
          required: ["type"]
        }
      });

      const result = aiResponse;

      if (result.type === "task") {
        // 创建任务
        const taskData = {
          title: result.title || textToAnalyze.substring(0, 50),
          description: result.description || textToAnalyze,
          priority: result.priority || "medium",
          category: result.category || "personal",
          status: "pending"
        };

        if (result.reminder_time) {
          taskData.reminder_time = result.reminder_time;
        }

        await base44.entities.Task.create(taskData);
        setShowResult({ type: "task", data: taskData });

        toast.success("已创建约定", {
          description: taskData.title
        });

        setTimeout(() => {
          if (onComplete) onComplete();
          navigate(createPageUrl("Tasks"));
        }, 1500);
      } else {
        // 创建笔记
        const noteData = {
          content: result.content || textToAnalyze,
          tags: result.tags || [],
          color: "white"
        };

        await base44.entities.Note.create(noteData);
        setShowResult({ type: "note", data: noteData });

        toast.success("已创建心签", {
          description: "笔记已保存"
        });

        setTimeout(() => {
          if (onComplete) onComplete();
          navigate(createPageUrl("Notes"));
        }, 1500);
      }

    } catch (error) {
      console.error("处理失败:", error);
      toast.error("处理失败，请重试");
      setIsProcessing(false);
    }
  };

  const handleSkip = () => {
    if (onComplete) onComplete();
    navigate(createPageUrl("Dashboard"));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/30 flex items-center justify-center p-6 relative overflow-hidden">
      {/* 背景装饰 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 0.1, scale: 1 }}
          transition={{ duration: 2, repeat: Infinity, repeatType: "reverse" }}
          className="absolute top-20 right-20 w-96 h-96 bg-blue-400 rounded-full blur-3xl" />

        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 0.1, scale: 1 }}
          transition={{ duration: 2.5, repeat: Infinity, repeatType: "reverse" }}
          className="absolute bottom-20 left-20 w-96 h-96 bg-purple-400 rounded-full blur-3xl" />

      </div>

      <div className="relative z-10 w-full max-w-2xl">
        <AnimatePresence mode="wait">
          {!showResult ?
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="text-center">

              {/* Logo & 标题 */}
              <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="mb-12">

                <div className="inline-flex items-center justify-center w-20 h-20 mb-6 rounded-3xl bg-gradient-to-br from-[#384877] to-[#3b5aa2] shadow-2xl shadow-[#384877]/30">
                  <Sparkles className="w-10 h-10 text-white" />
                </div>
                <h1 className="text-5xl font-bold bg-gradient-to-r from-[#384877] via-[#3b5aa2] to-purple-600 bg-clip-text text-transparent mb-4">
                  灵魂哨兵
                </h1>
                <p className="text-5xl font-bold bg-gradient-to-r from-[#384877] via-[#3b5aa2] to-purple-600 bg-clip-text text-transparent mb-4">心栈 SoulSentry



              </p>
              </motion.div>

              {/* 输入框 */}
              <motion.form
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2 }}
              onSubmit={handleSubmit}
              className="mb-8">

                <div className="relative">
                  <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="随便写点什么... 比如「明天下午3点开会」或「今天学到了...」，也可以上传图片"
                  disabled={isProcessing}
                  className="w-full h-40 px-6 py-5 pr-28 text-lg rounded-2xl border-2 border-slate-200 
                             focus:border-[#384877] focus:ring-4 focus:ring-[#384877]/10 
                             transition-all outline-none resize-none
                             bg-white/80 backdrop-blur-sm
                             placeholder:text-slate-400
                             disabled:opacity-50 disabled:cursor-not-allowed"
                  autoFocus />

                  {/* 右上角按钮组 */}
                  <div className="absolute right-4 top-4 flex gap-2">
                    {/* 图片上传按钮 */}
                    <input
                      ref={imageInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleImageSelect}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => imageInputRef.current && imageInputRef.current.click()}
                      disabled={isProcessing}
                      className="w-10 h-10 rounded-full flex items-center justify-center
                                 transition-all duration-300 bg-slate-100 hover:bg-slate-200 text-slate-600
                                 disabled:opacity-50 disabled:cursor-not-allowed"
                      title="上传图片"
                    >
                      <ImagePlus className="w-5 h-5" />
                    </button>

                    {/* 语音输入按钮 */}
                    <button
                      type="button"
                      onClick={isListening ? stopVoiceInput : startVoiceInput}
                      disabled={isProcessing}
                      className={`w-10 h-10 rounded-full flex items-center justify-center
                                 transition-all duration-300 ${
                                   isListening 
                                     ? 'bg-red-500 text-white animate-pulse shadow-lg shadow-red-500/40' 
                                     : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                                 } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                    </button>
                  </div>

                  {/* 图片预览 */}
                  {imagePreview && (
                    <div className="absolute left-4 bottom-4 flex items-center gap-2">
                      <div className="relative">
                        <img 
                          src={imagePreview} 
                          alt="预览" 
                          className="h-16 w-16 object-cover rounded-lg border-2 border-slate-200"
                        />
                        <button
                          type="button"
                          onClick={removeImage}
                          className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                      <span className="text-xs text-slate-500">已添加图片</span>
                    </div>
                  )}

                  {/* 录音中提示 */}
                  {isListening && !imagePreview && (
                    <div className="absolute left-4 bottom-4 flex items-center gap-2 text-red-500 text-sm">
                      <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                      正在录音...
                    </div>
                  )}
                  
                  {isProcessing &&
                <div className="absolute inset-0 bg-white/50 backdrop-blur-sm rounded-2xl flex items-center justify-center">
                      <div className="text-center">
                        <Loader2 className="w-8 h-8 text-[#384877] animate-spin mx-auto mb-3" />
                        <p className="text-sm text-slate-600 font-medium">
                          {isUploadingImage ? "正在识别图片内容..." : "AI 正在分析中..."}
                        </p>
                      </div>
                    </div>
                }
                </div>

                <motion.button
                type="submit"
                disabled={(!input.trim() && !imageFile) || isProcessing}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="mt-6 w-full py-4 px-8 bg-gradient-to-r from-[#384877] to-[#3b5aa2] 
                           text-white text-lg font-semibold rounded-xl
                           shadow-lg shadow-[#384877]/30
                           hover:shadow-xl hover:shadow-[#384877]/40
                           disabled:opacity-50 disabled:cursor-not-allowed
                           transition-all duration-300
                           flex items-center justify-center gap-2">







                  {isProcessing ?
                <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      处理中...
                    </> :

                <>
                      开始使用
                      <ArrowRight className="w-5 h-5" />
                    </>
                }
                </motion.button>
              </motion.form>

              {/* 功能说明 */}
              <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-lg mx-auto mb-6">

                <div className="p-4 rounded-xl bg-white/60 backdrop-blur-sm border border-slate-200">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                      <Calendar className="w-5 h-5 text-blue-600" />
                    </div>
                    <h3 className="font-semibold text-slate-800">智能约定</h3>
                  </div>
                  <p className="text-sm text-slate-600">
                    自动识别时间、任务，创建提醒
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-white/60 backdrop-blur-sm border border-slate-200">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                      <StickyNote className="w-5 h-5 text-purple-600" />
                    </div>
                    <h3 className="font-semibold text-slate-800">灵感心签</h3>
                  </div>
                  <p className="text-sm text-slate-600">
                    记录想法、笔记，自动打标签
                  </p>
                </div>
              </motion.div>

              {/* 跳过按钮 */}
              <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              onClick={handleSkip}
              className="text-sm text-slate-500 hover:text-slate-700 transition-colors">

                跳过，直接进入
              </motion.button>
            </motion.div> :

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center">

              <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", duration: 0.6 }}
              className={`inline-flex items-center justify-center w-24 h-24 mb-6 rounded-3xl ${
              showResult?.type === "task" ?
              "bg-gradient-to-br from-blue-500 to-blue-600" :
              "bg-gradient-to-br from-purple-500 to-purple-600"} shadow-2xl`
              }>

                {showResult?.type === "task" ?
              <Calendar className="w-12 h-12 text-white" /> :

              <StickyNote className="w-12 h-12 text-white" />
              }
              </motion.div>

              <motion.h2
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-3xl font-bold text-slate-800 mb-3">

                已创建{showResult?.type === "task" ? "约定" : "心签"}
              </motion.h2>

              <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="text-lg text-slate-600 mb-8">

                {showResult?.type === "task" ? showResult?.data?.title : "笔记已保存"}
              </motion.p>

              <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="flex items-center justify-center gap-2 text-sm text-slate-500">

                <Loader2 className="w-4 h-4 animate-spin" />
                正在跳转...
              </motion.div>
            </motion.div>
          }
        </AnimatePresence>
      </div>
    </div>);

}