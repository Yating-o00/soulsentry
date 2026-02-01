import React, { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Loader2, Mic, MicOff, Image as ImagePlus, X, Send, Brain, MapPin, Zap, Check } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { toast } from "sonner";
import { useTranslation } from "@/components/TranslationContext";
import AITranslatedText from "@/components/AITranslatedText";
import "../components/dashboard/SoulSentryHub.css"; // Reuse the styles

export default function Welcome({ onComplete }) {
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [parsingSteps, setParsingSteps] = useState([]);
  const [isListening, setIsListening] = useState(false);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const recognitionRef = useRef(null);
  const imageInputRef = useRef(null);
  const navigate = useNavigate();
  const { t } = useTranslation();

  const autoResize = (e) => {
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
  };

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

  const handleSubmit = async () => {
    if ((!input.trim() && !imageFile) || isProcessing) return;

    setIsProcessing(true);
    setParsingSteps([]);

    // Steps animation
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
      }

      const now = new Date();
      const response = await base44.integrations.Core.InvokeLLM({
            prompt: `
            User Input: "${textToAnalyze}"
            Current Time: ${now.toLocaleString()}
            
            Task: Analyze the user's input and generate a structured "SoulSentry" plan for device coordination, timeline, and automation.
            
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
      
      // Navigate to Dashboard with results
      if (onComplete) onComplete();
      navigate(createPageUrl("Dashboard"), { state: { soulSentryData: response } });

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
    <div className="min-h-screen soul-sentry-root w-full bg-[#f5f5f0] flex items-center justify-center p-4 relative overflow-hidden">
        {/* Background Effects */}
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#e8d5b7]/20 rounded-full blur-[100px] animate-breathe pointer-events-none" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-[#6366f1]/10 rounded-full blur-[100px] animate-breathe pointer-events-none" style={{ animationDelay: '3s' }} />

        <div className="relative z-10 w-full max-w-3xl flex flex-col items-center">
            
            {/* Input Section */}
            <motion.div 
                className="w-full transition-all duration-700"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
            >
                <div className="text-center mb-10 space-y-4">
                    <h1 className="text-4xl md:text-5xl font-serif font-light text-[#0a0a0f] tracking-tight">
                        告诉我，<br />
                        <span className="gradient-text-subtle italic">任何事情</span>
                    </h1>
                    <p className="text-[#0a0a0f]/50 font-light">
                        像与朋友倾诉般自然。我会倾听、理解，<br />在所有设备上为你悄然安排妥当。
                    </p>
                </div>

                <div className="w-full relative group input-glow rounded-3xl transition-all duration-500">
                    <div className="absolute -inset-1 bg-gradient-to-r from-[#e8d5b7]/30 to-[#6366f1]/20 rounded-3xl blur opacity-30 group-hover:opacity-50 transition duration-1000" />
                    <div className="relative glass-refined rounded-3xl p-2">
                        <div className="bg-white/40 rounded-2xl flex flex-col">
                            <textarea
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onInput={autoResize}
                                placeholder="明天下午三点和林总在望京SOHO见面，帮我提前准备好项目资料..."
                                className="w-full bg-transparent border-none outline-none text-lg text-[#0a0a0f] placeholder-[#0a0a0f]/30 resize-none px-6 py-5 font-light leading-relaxed scrollbar-hide min-h-[140px]"
                                disabled={isProcessing}
                                autoFocus
                            />
                            
                            {imagePreview && (
                                <div className="px-6 pb-2">
                                    <div className="relative inline-block">
                                        <img src={imagePreview} alt="Preview" className="h-16 w-16 object-cover rounded-lg border border-[#e8d5b7]" />
                                        <button onClick={removeImage} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5 shadow-sm">
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                </div>
                            )}

                            <div className="flex items-center justify-between px-4 pb-4">
                                <div className="flex gap-2">
                                    <button 
                                        onClick={isListening ? stopVoiceInput : startVoiceInput}
                                        className={`p-2 rounded-lg transition-colors ${isListening ? 'bg-red-500/10 text-red-500' : 'hover:bg-[#0a0a0f]/5 text-[#0a0a0f]/40'}`}
                                    >
                                        {isListening ? <MicOff className="w-5 h-5 animate-pulse" /> : <Mic className="w-5 h-5" />}
                                    </button>
                                    <button 
                                        onClick={() => imageInputRef.current?.click()}
                                        className="p-2 hover:bg-[#0a0a0f]/5 rounded-lg text-[#0a0a0f]/40 transition-colors"
                                    >
                                        <ImagePlus className="w-5 h-5" />
                                    </button>
                                    <input type="file" ref={imageInputRef} className="hidden" accept="image/*" onChange={handleImageSelect} />
                                </div>
                                <button 
                                    onClick={handleSubmit}
                                    disabled={isProcessing || (!input.trim() && !imageFile)}
                                    className="btn-primary-soul px-6 py-2 rounded-full text-sm font-medium flex items-center gap-2 shadow-lg disabled:opacity-50 disabled:shadow-none"
                                >
                                    {isProcessing ? '分析中...' : '开始'}
                                    {!isProcessing && <Send className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex justify-center mt-6">
                    <button 
                        onClick={handleSkip}
                        className="text-sm text-[#0a0a0f]/40 hover:text-[#0a0a0f]/70 transition-colors"
                    >
                        跳过，直接进入
                    </button>
                </div>
            </motion.div>

            {/* Processing State */}
            <AnimatePresence>
                {isProcessing && (
                    <motion.div 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="w-full max-w-xl mt-8"
                    >
                        <div className="glass-refined rounded-2xl p-6 border-l-4 border-[#e8d5b7]">
                            <div className="flex items-center gap-3 mb-6 text-[#0a0a0f]/70">
                                <div className="flex gap-1.5">
                                    <div className="w-2 h-2 bg-[#e8d5b7] rounded-full thinking-dot" />
                                    <div className="w-2 h-2 bg-[#e8d5b7] rounded-full thinking-dot" />
                                    <div className="w-2 h-2 bg-[#e8d5b7] rounded-full thinking-dot" />
                                </div>
                                <span className="font-serif italic text-sm">心栈正在理解语境...</span>
                            </div>
                            <div className="space-y-4">
                                {parsingSteps.map((step, idx) => (
                                    <motion.div 
                                        key={idx}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        className="flex items-center gap-3 text-[#0a0a0f]/70"
                                    >
                                        <step.icon className="w-5 h-5" />
                                        <span className="text-sm font-light flex-1">{step.text}</span>
                                        <Check className="w-4 h-4 text-[#10b981]" />
                                    </motion.div>
                                ))}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    </div>
  );
}