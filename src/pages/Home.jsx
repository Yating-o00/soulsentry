import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Sparkles, Calendar, StickyNote, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useTranslation } from "@/components/TranslationContext";

export default function Home() {
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);
  const textareaRef = useRef(null);
  const navigate = useNavigate();
  const { t } = useTranslation();

  useEffect(() => {
    // Auto focus on the textarea after welcome animation
    const timer = setTimeout(() => {
      textareaRef.current?.focus();
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  const analyzeAndCreate = async () => {
    if (!input.trim()) {
      toast.error("请输入内容");
      return;
    }

    setIsProcessing(true);

    try {
      // Use AI to analyze the input and determine if it's a task or note
      const analysis = await base44.integrations.Core.InvokeLLM({
        prompt: `分析以下用户输入，判断这是一个"任务"(Task)还是"笔记"(Note)。

任务特征：包含明确的行动、待办事项、提醒、约定、日程安排等
笔记特征：包含想法、记录、感想、知识、灵感等

用户输入："""
${input}
"""

请返回JSON格式：
- type: "task" 或 "note"
- title: 提取的标题（任务用标题，笔记用前20字）
- description: 完整内容或描述
- priority: 如果是任务，判断优先级 "low"/"medium"/"high"/"urgent"，如果是笔记则为null
- category: 如果是任务，判断分类 "work"/"personal"/"health"/"study"/"family"/"shopping"/"finance"/"other"，如果是笔记则为null
- tags: 如果是笔记，提取3-5个标签，如果是任务则为空数组`,
        response_json_schema: {
          type: "object",
          properties: {
            type: { type: "string", enum: ["task", "note"] },
            title: { type: "string" },
            description: { type: "string" },
            priority: { type: "string" },
            category: { type: "string" },
            tags: { type: "array", items: { type: "string" } }
          }
        }
      });

      // Create the item based on AI analysis
      if (analysis.type === "task") {
        await base44.entities.Task.create({
          title: analysis.title,
          description: analysis.description,
          priority: analysis.priority || "medium",
          category: analysis.category || "personal",
          status: "pending"
        });
        toast.success("✅ 已自动创建约定");
        setTimeout(() => navigate(createPageUrl("Tasks")), 1500);
      } else {
        await base44.entities.Note.create({
          content: `<p>${analysis.description}</p>`,
          plain_text: analysis.description,
          tags: analysis.tags || []
        });
        toast.success("📝 已自动创建心签");
        setTimeout(() => navigate(createPageUrl("Notes")), 1500);
      }

      setInput("");
    } catch (error) {
      toast.error("处理失败，请重试");
      console.error(error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      analyzeAndCreate();
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/20 p-4 relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          animate={{
            scale: [1, 1.2, 1],
            rotate: [0, 180, 360],
            opacity: [0.03, 0.05, 0.03]
          }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          className="absolute -top-40 -right-40 w-96 h-96 bg-blue-500 rounded-full blur-3xl"
        />
        <motion.div
          animate={{
            scale: [1, 1.3, 1],
            rotate: [360, 180, 0],
            opacity: [0.02, 0.04, 0.02]
          }}
          transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
          className="absolute -bottom-40 -left-40 w-96 h-96 bg-purple-500 rounded-full blur-3xl"
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-2xl relative z-10"
      >
        {/* Logo and Tagline */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-center mb-12"
        >
          <div className="flex items-center justify-center gap-3 mb-4">
            <motion.div
              animate={{ rotate: [0, 360] }}
              transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
              className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#384877] to-[#3b5aa2] flex items-center justify-center shadow-2xl shadow-[#384877]/30"
            >
              <Sparkles className="w-8 h-8 text-white" />
            </motion.div>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-[#384877] via-[#3b5aa2] to-[#384877] bg-clip-text text-transparent mb-3">
            {t('soulSentry')}
          </h1>
          <p className="text-lg md:text-xl text-slate-600 font-medium">
            {t('tagline')}
          </p>
          <p className="text-sm text-slate-500 mt-2">
            智能识别，自动分类 · 让每个想法都有归宿
          </p>
        </motion.div>

        {/* Main Input Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.4 }}
          className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/50 p-8 md:p-12"
        >
          <AnimatePresence mode="wait">
            {showWelcome && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-center mb-6"
              >
                <p className="text-slate-600 text-lg">
                  在这里记录任何想法，AI 会帮你自动整理
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="relative">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                if (showWelcome) setShowWelcome(false);
              }}
              onKeyDown={handleKeyDown}
              placeholder="输入任何内容... &#10;· 待办事项会自动变成约定 &#10;· 想法笔记会自动变成心签"
              className="w-full min-h-[200px] p-6 rounded-2xl border-2 border-slate-200 focus:border-[#384877] focus:ring-4 focus:ring-[#384877]/10 outline-none resize-none text-lg transition-all bg-white/50 backdrop-blur-sm placeholder:text-slate-400"
              disabled={isProcessing}
            />

            {/* Character count */}
            {input.length > 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute bottom-4 left-6 text-xs text-slate-400"
              >
                {input.length} 字
              </motion.div>
            )}
          </div>

          <div className="mt-6 flex flex-col sm:flex-row gap-4">
            <Button
              onClick={analyzeAndCreate}
              disabled={!input.trim() || isProcessing}
              className="flex-1 h-14 text-lg bg-gradient-to-r from-[#384877] to-[#3b5aa2] hover:from-[#2d3a5f] hover:to-[#2d4580] shadow-lg shadow-[#384877]/30 transition-all hover:shadow-xl hover:shadow-[#384877]/40 hover:scale-[1.02]"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  AI 正在分析...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5 mr-2" />
                  智能创建
                </>
              )}
            </Button>

            <Button
              variant="outline"
              onClick={() => navigate(createPageUrl("Dashboard"))}
              className="h-14 px-8 border-2 hover:bg-slate-50"
            >
              <ArrowRight className="w-5 h-5 mr-2" />
              跳过
            </Button>
          </div>

          <div className="mt-8 flex items-center justify-center gap-8 text-sm text-slate-500">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-600" />
              <span>约定管理</span>
            </div>
            <div className="w-px h-4 bg-slate-300" />
            <div className="flex items-center gap-2">
              <StickyNote className="w-4 h-4 text-purple-600" />
              <span>心签记录</span>
            </div>
          </div>

          <p className="text-center text-xs text-slate-400 mt-6">
            按 <kbd className="px-2 py-1 bg-slate-100 rounded border border-slate-300">⌘ Enter</kbd> 快速创建
          </p>
        </motion.div>

        {/* Features preview */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6 text-center"
        >
          <div className="p-6 bg-white/40 backdrop-blur-sm rounded-2xl">
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mx-auto mb-3">
              <Sparkles className="w-6 h-6 text-blue-600" />
            </div>
            <h3 className="font-semibold text-slate-800 mb-2">AI 智能识别</h3>
            <p className="text-sm text-slate-600">自动判断任务或笔记</p>
          </div>

          <div className="p-6 bg-white/40 backdrop-blur-sm rounded-2xl">
            <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center mx-auto mb-3">
              <Calendar className="w-6 h-6 text-purple-600" />
            </div>
            <h3 className="font-semibold text-slate-800 mb-2">约定管理</h3>
            <p className="text-sm text-slate-600">待办、提醒、日程统一管理</p>
          </div>

          <div className="p-6 bg-white/40 backdrop-blur-sm rounded-2xl">
            <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center mx-auto mb-3">
              <StickyNote className="w-6 h-6 text-green-600" />
            </div>
            <h3 className="font-semibold text-slate-800 mb-2">心签记录</h3>
            <p className="text-sm text-slate-600">想法、灵感随时记录</p>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}