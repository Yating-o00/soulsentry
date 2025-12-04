import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, Loader2, Wand2, TrendingUp, Tag, AlertCircle, X, Plus } from "lucide-react";
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
  const [newTag, setNewTag] = useState("");

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
            subtasks: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        title: { type: "string" },
                        description: { type: "string" }
                    },
                    required: ["title"]
                }
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
      subtasks: suggestions.subtasks // Pass subtasks if parent component supports it
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

  const updateSuggestion = (field, value) => {
    setSuggestions(prev => ({ ...prev, [field]: value }));
  };

  const addTag = () => {
    if (newTag.trim() && !suggestions.tags.includes(newTag.trim())) {
      updateSuggestion('tags', [...suggestions.tags, newTag.trim()]);
      setNewTag("");
    }
  };

  const removeTag = (tagToRemove) => {
    updateSuggestion('tags', suggestions.tags.filter(t => t !== tagToRemove));
  };

  return (
    <div className="space-y-4">
      <Button
        type="button"
        onClick={handleAnalyze}
        disabled={isAnalyzing || !taskTitle.trim()}
        className="w-full bg-gradient-to-r from-[#384877] to-[#2a3659] hover:from-[#0ea5e9] hover:to-[#0284c7] text-white rounded-xl h-11 shadow-lg shadow-[#384877]/25"
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

              {/* 描述建议 - 可编辑 */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-[14px] text-[#52525b] font-medium">
                  <Tag className="w-4 h-4 text-[#384877]" />
                  <span>完善描述</span>
                </div>
                <Textarea
                  value={suggestions.description}
                  onChange={(e) => updateSuggestion('description', e.target.value)}
                  className="bg-white min-h-[80px] text-[14px] border-[#e5e9ef] focus-visible:ring-[#384877]"
                />
              </div>

              {/* 分类和优先级 - 可编辑 */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-[14px] text-[#52525b] font-medium">
                    <Tag className="w-4 h-4 text-[#384877]" />
                    <span>推荐分类</span>
                  </div>
                  <Select
                    value={suggestions.category}
                    onValueChange={(val) => updateSuggestion('category', val)}
                  >
                    <SelectTrigger className="bg-white border-[#e5e9ef]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map(cat => (
                        <SelectItem key={cat.value} value={cat.value}>
                          <div className="flex items-center gap-2">
                            <span>{cat.icon}</span>
                            <span>{cat.label}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-[14px] text-[#52525b] font-medium">
                    <AlertCircle className="w-4 h-4 text-[#384877]" />
                    <span>推荐优先级</span>
                  </div>
                  <Select
                    value={suggestions.priority}
                    onValueChange={(val) => updateSuggestion('priority', val)}
                  >
                    <SelectTrigger className="bg-white border-[#e5e9ef]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORITIES.map(pri => (
                        <SelectItem key={pri.value} value={pri.value}>
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${pri.color.split(' ')[0].replace('bg-', 'bg-')}`} />
                            <span>{pri.label}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* 标签建议 - 可编辑 */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-[14px] text-[#52525b] font-medium">
                  <TrendingUp className="w-4 h-4 text-[#384877]" />
                  <span>推荐标签</span>
                </div>
                <div className="bg-white p-3 rounded-lg border border-[#e5e9ef] space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {suggestions.tags.map((tag, index) => (
                      <Badge
                        key={index}
                        variant="outline"
                        className="bg-[#f0f9ff] border-[#384877]/20 text-[#384877] text-[13px] pl-2.5 pr-1.5 py-1 flex items-center gap-1"
                      >
                        #{tag}
                        <button
                          onClick={() => removeTag(tag)}
                          className="hover:bg-[#384877]/10 rounded-full p-0.5 transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={newTag}
                      onChange={(e) => setNewTag(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                      placeholder="添加新标签..."
                      className="h-8 text-sm border-[#e5e9ef]"
                    />
                    <Button
                      size="sm"
                      onClick={addTag}
                      disabled={!newTag.trim()}
                      className="h-8 bg-[#f0f9ff] text-[#384877] hover:bg-[#e0f2fe] border border-[#384877]/20"
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>

              {/* 建议的子任务 */}
              {suggestions.subtasks && suggestions.subtasks.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-[14px] text-[#52525b] font-medium">
                    <div className="w-4 h-4 flex items-center justify-center text-[#384877] font-bold text-xs border border-[#384877] rounded-sm">✓</div>
                    <span>建议子任务</span>
                  </div>
                  <div className="bg-white rounded-lg border border-[#e5e9ef] overflow-hidden">
                    {suggestions.subtasks.map((sub, idx) => (
                        <div key={idx} className="p-2 border-b border-[#e5e9ef] last:border-0 flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-[#384877]" />
                            <div className="flex-1">
                                <div className="text-sm text-slate-700 font-medium">{sub.title}</div>
                                {sub.description && <div className="text-xs text-slate-500">{sub.description}</div>}
                            </div>
                        </div>
                    ))}
                  </div>
                </div>
              )}

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
                  className="flex-1 bg-gradient-to-r from-[#384877] to-[#2a3659] hover:from-[#0ea5e9] hover:to-[#0284c7] text-white rounded-lg"
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