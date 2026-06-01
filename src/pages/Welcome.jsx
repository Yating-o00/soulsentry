import React, { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Calendar, StickyNote, Loader2, ArrowRight, Mic, MicOff, Image as ImagePlus, X, Brain, MapPin, Zap, Check, Users, Clock, Paperclip, FileText } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { toast } from "sonner";
import { useTranslation } from "@/components/TranslationContext";
import { extractAndCreateTasks } from "@/components/utils/extractAndCreateTasks";
import { createExecutionRecord } from "@/components/utils/trackExecution";
import { deepSemanticParse } from "@/components/utils/semanticParser";
import { detectEmailIntent } from "@/components/gmail/detectEmailIntent";
import EmailSendConfirmDialog from "@/components/gmail/EmailSendConfirmDialog";

export default function Welcome({ onComplete }) {
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [parsingSteps, setParsingSteps] = useState([]);
  const [showResult, setShowResult] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  // 任意格式附件（PDF / Word / Excel / PPT 等），上传后会把 URL 写入 execution.ai_parsed_result.attached_files
  // 让 executeAutomation 的 buildAttachmentContext 能真正读取内容（解决"未识别附件"）
  const [docFiles, setDocFiles] = useState([]); // [{file_url, file_name, file_type, uploading}]
  const [emailSuggestion, setEmailSuggestion] = useState(null);
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const recognitionRef = useRef(null);
  const imageInputRef = useRef(null);
  const docInputRef = useRef(null);
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

  // 上传任意格式附件（PDF/Word/Excel/PPT/纯文本 等）
  const handleDocSelect = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    // 先占位显示，再异步上传
    const placeholders = files.map(f => ({ file_name: f.name, file_type: f.type, file_url: '', uploading: true }));
    setDocFiles(prev => [...prev, ...placeholders]);
    const uploaded = [];
    for (const file of files) {
      if (file.size > 20 * 1024 * 1024) {
        toast.error(`「${file.name}」超过 20MB，已跳过`);
        continue;
      }
      try {
        const res = await base44.integrations.Core.UploadFile({ file });
        if (res?.file_url) {
          uploaded.push({ file_name: file.name, file_type: file.type, file_url: res.file_url });
        }
      } catch (err) {
        toast.error(`上传「${file.name}」失败`);
      }
    }
    // 用真实上传结果替换占位
    setDocFiles(prev => [...prev.filter(p => !p.uploading), ...uploaded]);
    if (docInputRef.current) docInputRef.current.value = '';
    if (uploaded.length > 0) toast.success(`已附加 ${uploaded.length} 个文件`);
  };

  const removeDoc = (idx) => {
    setDocFiles(prev => prev.filter((_, i) => i !== idx));
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

    // Steps animation matching enhanced semantic pipeline
    const steps = [
        { icon: Brain, text: '深度语义解析中...', delay: 800 },
        { icon: Clock, text: '模糊时间实体识别...', delay: 600 },
        { icon: Users, text: '人物·地点·意图提取...', delay: 600 },
        { icon: MapPin, text: '空间计算与情境推演...', delay: 600 },
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
      let uploadedImageRef = null; // 用于把图片也收入 allAttachedFiles

      // Handle Image OCR if present
      if (imageFile) {
         setIsUploadingImage(true);
         try {
           const uploadResult = await base44.integrations.Core.UploadFile({ file: imageFile });
           uploadedImageRef = { file_url: uploadResult.file_url, file_name: imageFile.name, file_type: imageFile.type };
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

      // Pre-analyze with deep semantic parser for enhanced understanding
      let semanticHint = null;
      try {
        semanticHint = await deepSemanticParse(textToAnalyze, { enableSmartComplete: true });
      } catch (e) {
        console.warn("Semantic pre-parse skipped:", e);
      }

      // Call the custom backend function using Kimi AI
      const { data: response } = await base44.functions.invoke('analyzeIntent', {
          input: textToAnalyze
      });

      // —— AI 内容识别与精准分流 ——
      // 把用户输入拆成若干条内容，逐条判定：
      //   needs_confirmation=true（需要用户再次确认完成 / 有待办性质）→ 录入【约定】
      //   否则（纯记录、想法、信息、参考资料）→ 录入【心签】
      let classification = null;
      try {
        classification = await base44.integrations.Core.InvokeLLM({
          prompt: `分析以下用户输入，识别其中包含的内容条目，并对每一条判断它应归入"约定"还是"心签"。

判定规则（务必严格遵守）：
- 凡是需要用户【再次确认完成】的内容（待办事项、计划、提醒、约定、安排、需要执行或跟进的事），一律归为"约定"(commitment)。
- 其余仅作记录、想法、灵感、愿望、信息收藏、参考资料等无需确认完成的内容，归为"心签"(note)。

用户输入:
"""
${textToAnalyze}
"""

要求：
1. items: 数组，把输入拆成 1~N 个独立条目（若是单一意图则只有 1 条）。
2. 每条包含 kind("commitment" 或 "note") 和 text(该条对应的原文片段，尽量保留原话)。
3. 不要编造原文中不存在的内容。`,
          response_json_schema: {
            type: "object",
            properties: {
              items: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    kind: { type: "string", enum: ["commitment", "note"] },
                    text: { type: "string" },
                  },
                  required: ["kind", "text"],
                },
              },
            },
            required: ["items"],
          },
        });
      } catch (e) {
        console.warn("内容分流识别失败，回退到默认处理", e);
      }

      const items = Array.isArray(classification?.items) ? classification.items.filter(it => it?.text?.trim()) : [];
      const commitmentItems = items.filter(it => it.kind === "commitment");
      const noteItems = items.filter(it => it.kind === "note");

      let createdCommitments = 0;
      let createdNotes = 0;

      if (items.length > 0) {
        // 需要确认完成的 → 约定
        for (const it of commitmentItems) {
          try {
            const tasks = await extractAndCreateTasks(it.text);
            createdCommitments += tasks.length;
          } catch (err) {
            console.error("约定创建失败", err);
          }
        }
        // 其余 → 心签
        for (const it of noteItems) {
          try {
            await base44.entities.Note.create({
              content: it.text,
              plain_text: it.text,
              tags: [...(semanticHint?.tags || []), "随手记"],
              color: "blue",
              source_type: "manual",
            });
            createdNotes += 1;
          } catch (err) {
            console.error("心签创建失败", err);
          }
        }
      } else {
        // 回退：识别失败时沿用原有的双通道处理
        try {
          const tasks = await extractAndCreateTasks(textToAnalyze);
          createdCommitments += tasks.length;
        } catch (err) { console.error("约定创建失败", err); }
        try {
          await base44.entities.Note.create({
            content: textToAnalyze,
            plain_text: textToAnalyze,
            tags: [...(semanticHint?.tags || []), "随手记"],
            color: "blue",
            source_type: "manual",
          });
          createdNotes += 1;
        } catch (err) { console.error("心签创建失败", err); }
      }

      if (createdCommitments > 0) toast.success(`已录入 ${createdCommitments} 个约定`);
      if (createdNotes > 0) toast.success(`已录入 ${createdNotes} 条心签`);

      const isWishOrNote = noteItems.length > 0 && commitmentItems.length === 0;

      // 邮件意图检测：识别到发送邮件意图时弹出确认对话框
      detectEmailIntent(textToAnalyze).then(suggestion => {
        if (suggestion) {
          setEmailSuggestion(suggestion);
          setShowEmailDialog(true);
        }
      }).catch(e => console.warn("Email intent detection skipped:", e));

      // 收集用户上传的全部附件（图片 + 文档），让后端自动执行能读取内容
      const allAttachedFiles = [];
      if (uploadedImageRef) allAttachedFiles.push(uploadedImageRef);
      docFiles.filter(f => f.file_url && !f.uploading).forEach(f => {
        allAttachedFiles.push({ file_url: f.file_url, file_name: f.file_name, file_type: f.file_type });
      });

      // 同步执行动态到通知页面（包含规划上下文和语义分析 + 附件）
      createExecutionRecord({
        title: semanticHint?.refined_title || textToAnalyze.slice(0, 60),
        originalInput: textToAnalyze,
        source: "welcome",
        category: isWishOrNote ? "note" : "task",
        planContext: {
          timelineItems: response.timeline || [],
          automationItems: response.automations || [],
          syncTargets: isWishOrNote ? ["notes"] : ["tasks", "notes"],
          semanticIntent: semanticHint?.primary_intent,
          people: semanticHint?.people?.map(p => p.name) || [],
          locations: semanticHint?.locations?.map(l => l.name) || [],
        },
        attachedFiles: allAttachedFiles,
      }).catch(e => console.warn("Execution tracking failed:", e));

      clearInterval(stepInterval);
      
      setTimeout(() => {
          if (onComplete) onComplete();
          navigate(createPageUrl("Dashboard"), { state: { soulSentryData: response } });
      }, 1000);

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
    <div
      className="bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/30 flex items-center justify-center p-6 relative"
      style={{ minHeight: '100dvh' }}
    >
      {/* 背景装饰 —— 用纯 CSS 渐变替代 motion + blur-3xl,
          避免 iPhone 17 Pro / iOS 26 Safari 上 backdrop-blur 巨大模糊圆 + 无限动画
          导致 GPU 合成层崩溃出现整页白屏。装饰效果保留(径向渐变光晕),零 JS 成本。 */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'radial-gradient(circle at 85% 15%, rgba(96,165,250,0.18), transparent 45%), radial-gradient(circle at 15% 85%, rgba(168,85,247,0.16), transparent 45%)'
        }}
      />

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
                <p className="text-xl text-slate-500 mb-8 font-light tracking-wide">
                  坚定守护，适时轻唤 - 你的心灵存放站
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
                  placeholder="随便说... 比如「下周和老王吃饭」「后天下午开会」「我想学钢琴」，也支持语音和图片"
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
                    <input
                      ref={docInputRef}
                      type="file"
                      multiple
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.md,.json"
                      onChange={handleDocSelect}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => docInputRef.current && docInputRef.current.click()}
                      disabled={isProcessing}
                      className="w-10 h-10 rounded-full flex items-center justify-center
                                 transition-all duration-300 bg-slate-100 hover:bg-slate-200 text-slate-600
                                 disabled:opacity-50 disabled:cursor-not-allowed"
                      title="上传附件（PDF / Word / Excel / PPT）"
                    >
                      <Paperclip className="w-5 h-5" />
                    </button>
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

                  {/* 文档附件列表 */}
                  {docFiles.length > 0 && (
                    <div className="absolute left-4 bottom-4 right-4 flex flex-wrap gap-2 max-h-20 overflow-y-auto">
                      {docFiles.map((f, i) => (
                        <div key={i} className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 rounded-lg text-xs text-slate-700 border border-slate-200">
                          {f.uploading ? <Loader2 className="w-3 h-3 animate-spin text-slate-400" /> : <FileText className="w-3 h-3 text-[#384877]" />}
                          <span className="max-w-[140px] truncate">{f.file_name}</span>
                          {!f.uploading && (
                            <button
                              type="button"
                              onClick={() => removeDoc(i)}
                              className="ml-0.5 w-4 h-4 rounded-full hover:bg-slate-200 flex items-center justify-center text-slate-400 hover:text-red-500"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      ))}
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

      <EmailSendConfirmDialog
        open={showEmailDialog}
        onOpenChange={setShowEmailDialog}
        suggestion={emailSuggestion}
      />
    </div>
  );
}