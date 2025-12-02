import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Loader2, Wand2, TrendingUp, Tag, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

const CATEGORIES = [
  { value: "work", label: "工作", icon: "💼" },
  { value: "personal", label: "个人", icon: "👤" },
  { value: "health", label: "健康", icon: "❤️" },
  { value: "study", label: "学习", icon: "📚" },
  { value: "family", label: "家庭", icon: "👨‍👩‍👧‍👦" },
  { value: "shopping", label: "购物", icon: "🛒" },
  { value: "finance", label: "财务", icon: "💰" },
  { value: "other", label: "其他", icon: "📌" },
];

const PRIORITIES = [
  { value: "low", label: "低优先级", color: "bg-slate-100 text-slate-600 border-slate-300" },
  { value: "medium", label: "中优先级", color: "bg-blue-50 text-blue-600 border-blue-300" },
  { value: "high", label: "高优先级", color: "bg-orange-50 text-orange-600 border-orange-300" },
  { value: "urgent", label: "紧急", color: "bg-red-50 text-red-600 border-red-300" },
];

export default function AITaskEnhancer({ taskTitle, currentDescription, onApply }) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [suggestions, setSuggestions] = useState(null);

  const handleAnalyze = async () => {
    if (!taskTitle.trim()) {
      toast.error("请先输入任务标题");
      return;
    }

    setIsAnalyzing(true);
    try {
      const response = await base44.integrations.Core.InvokeLLM({
        prompt: `你是一个任务管理AI助手。根据用户输入的任务信息，提供智能建议。

用户任务标题：${taskTitle}
${currentDescription ? `当前描述：${currentDescription}` : ""}

请分析并提供：
1. 完善的任务描述（如果当前描述为空或不完整，生成一个详细的描述；如果已有描述，优化它）
2. 推荐的任务分类（从以下选项中选择最合适的：work, personal, health, study, family, shopping, finance, other）
3. 推荐的优先级（从以下选项中选择：low, medium, high, urgent）
4. 建议的标签（3-5个简短的标签，帮助快速识别任务）
5. 分析原因（简要说明为什么做出这些建议）

注意：
- 描述要具体、可执行，包含关键要点
- 优先级判断要考虑紧迫性和重要性
- 标签要简洁有用
- 分类要准确反映任务性质`,
        response_json_schema: {
          type: "object",
          properties: {
            description: { type: "string" },
            category: { 
              type: "string",
              enum: ["work", "personal", "health", "study", "family", "shopping", "finance", "other"]
            },
            priority: {
              type: "string",
              enum: ["low", "medium", "high", "urgent"]
            },
            tags: {
              type: "array",
              items: { type: "string" }
            },
            reasoning: { type: "string" }
          },
          required: ["description", "category", "priority", "tags", "reasoning"]
        }
      });

      setSuggestions(response);
      toast.success("✨ AI分析完成！");
    } catch (error) {
      console.error("AI分析失败:", error);
      toast.error("AI分析失败，请重试");
    }
    setIsAnalyzing(false);
  };

  const handleApplySuggestions = () => {
    if (!suggestions) return;
    
    onApply({
      description: suggestions.description,
      category: suggestions.category,
      priority: suggestions.priority,
      tags: suggestions.tags,
    });
    
    toast.success("已应用AI建议");
    setSuggestions(null);
  };

  const getCategoryLabel = (value) => {
    return CATEGORIES.find(c => c.value === value);
  };

  const getPriorityLabel = (value) => {
    return PRIORITIES.find(p => p.value === value);
  };

  return (
    <div className="space-y-4">
      <Button
        type="button"
        onClick={handleAnalyze}
        disabled={isAnalyzing || !taskTitle.trim()}
        className="w-full bg-gradient-to-r from-[#384877] to-[#2a3659] hover:from-[#3FB3E7] hover:to-[#0A91BD] text-white rounded-xl h-11 shadow-lg shadow-[#384877]/25"
      >
        {isAnalyzing ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            AI分析中...
          </>
        ) : (
          <>
            <Sparkles className="w-4 h-4 mr-2" />
            AI智能增强
          </>
        )}
      </Button>

      <AnimatePresence>
        {suggestions && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <Card className="border-2 border-[#384877]/30 bg-gradient-to-br from-[#f0f9ff] to-white p-5 space-y-4">
              {/* AI建议标题 */}
              <div className="flex items-center gap-2 mb-3">
                <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-[#384877] to-[#2a3659] flex items-center justify-center">
                  <Wand2 className="w-4 h-4 text-white" />
                </div>
                <h3 className="text-[16px] font-semibold text-[#222222]">AI智能建议</h3>
              </div>

              {/* 描述建议 */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-[14px] text-[#52525b] font-medium">
                  <Tag className="w-4 h-4 text-[#384877]" />
                  <span>完善描述</span>
                </div>
                <div className="bg-white rounded-lg p-3 border border-[#e5e9ef]">
                  <p className="text-[14px] text-[#222222] leading-relaxed">{suggestions.description}</p>
                </div>
              </div>

              {/* 分类和优先级 */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-[14px] text-[#52525b] font-medium">
                    <Tag className="w-4 h-4 text-[#384877]" />
                    <span>推荐分类</span>
                  </div>
                  <Badge className="bg-white border-2 border-[#384877] text-[#384877] text-[14px] px-3 py-1.5">
                    {getCategoryLabel(suggestions.category)?.icon} {getCategoryLabel(suggestions.category)?.label}
                  </Badge>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-[14px] text-[#52525b] font-medium">
                    <AlertCircle className="w-4 h-4 text-[#384877]" />
                    <span>推荐优先级</span>
                  </div>
                  <Badge className={`${getPriorityLabel(suggestions.priority)?.color} border-2 text-[14px] px-3 py-1.5`}>
                    {getPriorityLabel(suggestions.priority)?.label}
                  </Badge>
                </div>
              </div>

              {/* 标签建议 */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-[14px] text-[#52525b] font-medium">
                  <TrendingUp className="w-4 h-4 text-[#384877]" />
                  <span>推荐标签</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {suggestions.tags.map((tag, index) => (
                    <Badge
                      key={index}
                      variant="outline"
                      className="bg-white border-[#384877]/40 text-[#384877] text-[13px] px-2.5 py-1"
                    >
                      #{tag}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* AI分析原因 */}
              <div className="bg-gradient-to-r from-[#4FC3F7]/10 to-[#1BA1CD]/10 rounded-lg p-3 border border-[#384877]/20">
                <div className="flex items-start gap-2">
                  <Sparkles className="w-4 h-4 text-[#384877] flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[13px] font-medium text-[#384877] mb-1">AI分析</p>
                    <p className="text-[13px] text-[#52525b] leading-relaxed">{suggestions.reasoning}</p>
                  </div>
                </div>
              </div>

              {/* 操作按钮 */}
              <div className="flex gap-2 pt-2">
                <Button
                  onClick={handleApplySuggestions}
                  className="flex-1 bg-gradient-to-r from-[#384877] to-[#2a3659] hover:from-[#3FB3E7] hover:to-[#0A91BD] text-white rounded-lg"
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  应用所有建议
                </Button>
                <Button
                  onClick={() => setSuggestions(null)}
                  variant="outline"
                  className="rounded-lg border-[#dce4ed] hover:bg-[#f9fafb]"
                >
                  关闭
                </Button>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}