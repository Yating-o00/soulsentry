import React, { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Calendar, StickyNote, Loader2, ArrowRight, Mic, MicOff, Image as ImagePlus, X, Brain, MapPin, Zap, Check } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { toast } from "sonner";
import { useTranslation } from "@/components/TranslationContext";
import AITranslatedText from "@/components/AITranslatedText";

export default function Welcome({ onComplete }) {
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [parsingSteps, setParsingSteps] = useState([]);
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

    if (!file.type.startsWith('image/')) {
      toast.error("请选择图片文件");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error("图片大小不能超过 10MB");
      return;
    }

    setImageFile(file);
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
          setInput(prev => prev + finalTranscript);
        }
      };

      recognitionRef.current.onerror = function(event) {
        setIsListening(false);
      };

      recognitionRef.current.onend = function() {
        setIsListening(false);
      };

      recognitionRef.current.start();
    } catch (e) {
      toast.error("语音输入初始化失败");
    }
  };

  const stopVoiceInput = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if ((!input.trim() && !imageFile) || isProcessing) return;

    setIsProcessing(true);
    setParsingSteps([]);

    // Steps animation matching the SoulSentryHub design
    const steps = [
        { icon: Brain, text: '提取时间实体...', delay: 800 },
        { icon: Sparkles, text: '识别意图与优先级...', delay: 600 },
        { icon: MapPin, text: '空间计算与交通分析...', delay: 600 },
        { icon: Zap, text: '生成设备协同策略...', delay: 800 }
    ];

    let currentStep = 0;
    const stepInterval = setInterval(() => {
        if (currentStep < steps.length) {
            setParsingSteps(prev => [...prev, steps[currentStep]]);
            currentStep++;
        } else {
            clearInterval(stepInterval);
        }
    }, 800);

    try {
      let textToAnalyze = input;
      
      // Handle Image OCR if present
      if (imageFile) {
         setIsUploadingImage(true);
         try {
           const uploadResult = await base44.integrations.Core.UploadFile({ file: imageFile });
           const ocrResponse = await base44.integrations.Core.InvokeLLM({
             prompt: "提取图片中的文字内容。",
             file_urls: [uploadResult.file_url],
             response_json_schema: { type: "object", properties: { extracted_text: { type: "string" } } }
           });
           if (ocrResponse.extracted_text) {
             textToAnalyze += `\n\n[图片内容]: ${ocrResponse.extracted_text}`;
           }
         } catch (e) {
           console.error(e);
         }
         setIsUploadingImage(false);
      }

      const now = new Date();
      const response = await base44.integrations.Core.InvokeLLM({
            prompt: `
            User Input: "${textToAnalyze}"
            Current Time: ${now.toLocaleString()}
            
            Task: Analyze the user's input and generate a structured "SoulSentry" plan for device coordination, timeline, and automation.

            IMPORTANT: All generated text (titles, descriptions, strategies, content, methods) MUST BE IN SIMPLIFIED CHINESE (简体中文).

            Return JSON in this EXACT structure:
            {
                "devices": {
                    "phone": { "strategies": [{"time": "string", "method": "string", "content": "string", "priority": "high|medium|low"}] },
                    "watch": { "strategies": [...] },
                    "glasses": { "strategies": [...] },
                    "car": { "strategies": [...] },
                    "home": { "strategies": [...] },
                    "pc": { "strategies": [...] }
                },
                "timeline": [
                    {"time": "HH:MM", "title": "string", "desc": "string", "icon": "string (emoji)", "highlight": boolean}
                ],
                "automations": [
                    {"title": "string", "desc": "string", "status": "active|ready|monitoring|pending", "icon": "string (emoji)"}
                ]
            }
            
            Generate realistic strategies for each device based on the input context. If a device isn't relevant, provide a neutral strategy.
            For automations, identify tasks that can be automated.
            Ensure all content is friendly, concise, and in Simplified Chinese.
            `,
            response_json_schema: {
                type: "object",
                properties: {
                    devices: { type: "object" },
                    timeline: { type: "array", items: { type: "object" } },
                    automations: { type: "array", items: { type: "object" } }
                }
            }
        });

      clearInterval(stepInterval);
      
      // Ensure response has valid structure
      const safeResponse = {
          devices: response.devices || {},
          timeline: response.timeline || [],
          automations: response.automations || []
      };

      // Navigate first to ensure state is passed to the new route
      navigate(createPageUrl("Dashboard"), { state: { soulSentryData: safeResponse } });

      // Then mark welcome as complete to allow the guard to render the dashboard
      // Using a small timeout to ensure navigation state is established
      if (onComplete) {
          setTimeout(onComplete, 50);
      }

    } catch (error) {
      console.error(error);
      toast.error("分析失败，请重试");
      setIsProcessing(false);
      clearInterval(stepInterval);
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
                  <AITranslatedText text="灵魂哨兵" />
                </h1>
                <p className="text-xl text-slate-500 mb-8 font-light tracking-wide">
                  <AITranslatedText text="坚定守护，适时轻唤 - 你的心灵存放站" />
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
                    <div className="absolute inset-0 bg-white/95 backdrop-blur-sm rounded-2xl flex flex-col items-center justify-center z-20">
                      <div className="flex gap-1.5 mb-4">
                          <div className="w-2 h-2 bg-[#384877] rounded-full animate-bounce" style={{ animationDelay: '-0.32s' }} />
                          <div className="w-2 h-2 bg-[#384877] rounded-full animate-bounce" style={{ animationDelay: '-0.16s' }} />
                          <div className="w-2 h-2 bg-[#384877] rounded-full animate-bounce" />
                      </div>
                      <div className="space-y-2 text-left w-full max-w-[200px]">
                          {parsingSteps.map((step, idx) => (
                              step ? (
                              <motion.div 
                                  key={idx}
                                  initial={{ opacity: 0, x: -10 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  className="flex items-center gap-3 text-slate-700"
                              >
                                  {step.icon && <step.icon className="w-4 h-4 text-[#384877]" />}
                                  <span className="text-sm font-medium">{step.text}</span>
                                  <Check className="w-3 h-3 text-green-500 ml-auto" />
                              </motion.div>
                              ) : null
                          ))}
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
                      分析处理中...
                    </> :
                    <>
                      开始分析与规划
                      <ArrowRight className="w-5 h-5" />
                    </>
                  }
                </motion.button>
              </motion.form>

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
                {/* Fallback loading or success state if needed, though we navigate away */}
                <Loader2 className="w-12 h-12 text-[#384877] animate-spin mx-auto mb-4" />
                <h2 className="text-2xl font-bold text-slate-800">正在生成您的专属安排...</h2>
            </motion.div>
          }
        </AnimatePresence>
      </div>
    </div>
  );
}