import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Sparkles, Loader2, Wand2, TrendingUp, Tag, AlertCircle, X, Plus, ListTodo, Clock, ShieldAlert } from "lucide-react";
import { format } from "date-fns";
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

// Safely normalize suggestions to ensure all array fields exist
function normalizeSuggestions(data) {
  return {
    ...data,
    tags: Array.isArray(data.tags) ? data.tags : [],
    subtasks: Array.isArray(data.subtasks) ? data.subtasks : [],
    risks: Array.isArray(data.risks) ? data.risks : [],
    dependencies: Array.isArray(data.dependencies) ? data.dependencies : [],
  };
}

export default function AITaskEnhancer({ taskTitle, currentDescription, availableTemplates, onApply }) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [suggestions, setSuggestions] = useState(null);
  const [newTag, setNewTag] = useState("");
  const [preserveDescription, setPreserveDescription] = useState(false);
  const [refineInstruction, setRefineInstruction] = useState("");
  const [isRefining, setIsRefining] = useState(false);

  const updateSuggestion = (field, value) => {
    setSuggestions((prev) => ({ ...prev, [field]: value }));
  };

  const addTag = () => {
    if (!newTag.trim()) return;
    const currentTags = Array.isArray(suggestions?.tags) ? suggestions.tags : [];
    if (!currentTags.includes(newTag.trim())) {
      updateSuggestion("tags", [...currentTags, newTag.trim()]);
      setNewTag("");
    }
  };

  const removeTag = (tagToRemove) => {
    const currentTags = Array.isArray(suggestions?.tags) ? suggestions.tags : [];
    updateSuggestion("tags", currentTags.filter((t) => t !== tagToRemove));
  };

  const handleRefine = async () => {
    if (!refineInstruction.trim() || !suggestions) return;
    setIsRefining(true);
    try {
      const now = new Date().toISOString();
      const response = await base44.integrations.Core.InvokeLLM({
        prompt: `你是一个智能助手，帮助用户微调约定建议。
当前建议数据 (JSON):
${JSON.stringify(suggestions)}
用户的修改指令: "${refineInstruction}"
当前时间: ${now}
请根据用户指令更新上述 JSON 数据，返回更新后的完整 JSON 对象，所有文本使用简体中文。`,
        response_json_schema: {
          type: "object",
          properties: {
            description: { type: "string" },
            category: { type: "string" },
            priority: { type: "string" },
            tags: { type: "array", items: { type: "string" } },
            subtasks: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
                  category: { type: "string", enum: ["work", "personal", "health", "study", "family", "shopping", "finance", "other"] },
                  time: { type: "string" },
                },
                required: ["title"],
              },
            },
            reminder_time: { type: "string" },
            execution_start: { type: "string" },
            execution_end: { type: "string" },
            time_reasoning: { type: "string" },
            risks: { type: "array", items: { type: "string" } },
            risk_level: { type: "string" },
            dependencies: { type: "array", items: { type: "string" } },
            reasoning: { type: "string" },
          },
          required: ["description", "category", "priority", "tags"],
        },
      });
      setSuggestions(normalizeSuggestions(response));
      setRefineInstruction("");
      toast.success("已根据您的指令调整建议");
    } catch (error) {
      toast.error(`调整失败: ${error?.message || "未知错误"}`);
    }
    setIsRefining(false);
  };

  const handleAnalyze = async () => {
    if (!taskTitle.trim()) {
      toast.error("请先输入约定标题");
      return;
    }
    setIsAnalyzing(true);
    try {
      const now = new Date().toISOString();
      const templatesInfo =
        availableTemplates && availableTemplates.length > 0
          ? `现有模板列表:\n${availableTemplates.map((t) => `${t.id}: ${t.name} - ${t.description || "无描述"}`).join("\n")}\n如果匹配某模板请返回其 ID。`
          : "";

      const response = await base44.integrations.Core.InvokeLLM({
        prompt: `你是一个约定管理AI助手。分析用户约定并提供建议。
用户约定标题：${taskTitle}
${currentDescription ? `当前描述：${currentDescription}` : ""}
当前时间：${now}
${templatesInfo}
请提供JSON格式建议：描述、分类、优先级、标签(3-5个)、子约定列表(每个含title/priority/category/time)、提醒时间、执行时间、风险分析。
所有时间用ISO 8601格式，所有文本用简体中文。`,
        response_json_schema: {
          type: "object",
          properties: {
            description: { type: "string" },
            category: { type: "string", enum: ["work", "personal", "health", "study", "family", "shopping", "finance", "other"] },
            priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
            tags: { type: "array", items: { type: "string" } },
            subtasks: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
                  category: { type: "string", enum: ["work", "personal", "health", "study", "family", "shopping", "finance", "other"] },
                  time: { type: "string" },
                },
                required: ["title"],
              },
            },
            reminder_time: { type: "string", format: "date-time" },
            execution_start: { type: "string", format: "date-time" },
            execution_end: { type: "string", format: "date-time" },
            time_reasoning: { type: "string" },
            risks: { type: "array", items: { type: "string" } },
            risk_level: { type: "string", enum: ["low", "medium", "high", "critical"] },
            dependencies: { type: "array", items: { type: "string" } },
            reasoning: { type: "string" },
            recommended_template_id: { type: "string" },
          },
          required: ["description", "category", "priority", "tags", "reasoning", "risk_level"],
        },
      });

      let finalResponse = response;
      if (response.recommended_template_id && availableTemplates) {
        const template = availableTemplates.find((t) => t.id === response.recommended_template_id);
        if (template && template.template_data) {
          const data = template.template_data;
          finalResponse = {
            ...response,
            category: data.category || response.category,
            priority: data.priority || response.priority,
            subtasks:
              (data.subtasks || []).map((s) =>
                typeof s === "string" ? { title: s, priority: response.priority, category: response.category } : s
              ) || response.subtasks,
            reasoning: `(基于模板 "${template.name}") ${response.reasoning}`,
          };
          toast("已自动匹配约定模板: " + template.name, { icon: "📋" });
        }
      }

      setSuggestions(normalizeSuggestions(finalResponse));
      toast.success("✨ AI分析完成！");
    } catch (error) {
      toast.error(`AI分析失败: ${error?.message || "未知错误"}`);
    }
    setIsAnalyzing(false);
  };

  const handleApplySuggestions = () => {
    if (!suggestions) return;

    let timeStr = "09:00";
    if (suggestions.reminder_time) {
      try {
        const date = new Date(suggestions.reminder_time);
        if (!isNaN(date.getTime())) timeStr = format(date, "HH:mm");
      } catch (e) {}
    }

    const formattedSubtasks = (suggestions.subtasks || []).map((item) => {
      if (typeof item === "string") {
        return { title: item, is_completed: false, priority: suggestions.priority, category: suggestions.category, time: timeStr };
      }
      return {
        title: item.title || "新子约定",
        is_completed: false,
        priority: item.priority || suggestions.priority,
        category: item.category || suggestions.category,
        time: item.time || timeStr,
      };
    });

    onApply({
      description: preserveDescription ? currentDescription || suggestions.description : suggestions.description,
      category: suggestions.category,
      priority: suggestions.priority,
      tags: suggestions.tags || [],
      subtasks: formattedSubtasks,
      reminder_time: suggestions.reminder_time,
      end_time: suggestions.execution_end,
      ai_analysis: {
        status_summary: "Initial Analysis",
        risks: suggestions.risks || [],
        risk_level: suggestions.risk_level || "low",
        key_dependencies: suggestions.dependencies || [],
        time_reasoning: suggestions.time_reasoning,
        recommended_execution_start: suggestions.execution_start,
        recommended_execution_end: suggestions.execution_end,
        priority_reasoning: suggestions.reasoning,
      },
    });

    setSuggestions(null);
  };

  const tags = Array.isArray(suggestions?.tags) ? suggestions.tags : [];
  const subtasks = Array.isArray(suggestions?.subtasks) ? suggestions.subtasks : [];
  const risks = Array.isArray(suggestions?.risks) ? suggestions.risks : [];

  return (
    <div className="space-y-4">
      <Button
        type="button"
        onClick={handleAnalyze}
        disabled={isAnalyzing || !taskTitle.trim()}
        className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white w-full h-11 shadow-lg shadow-blue-600/25 rounded-xl"
      >
        {isAnalyzing ? (
          <><Loader2 className="w-4 h-4 mr-2 animate-spin" />AI分析中...</>
        ) : (
          <><Sparkles className="w-4 h-4 mr-2" />AI智能增强</>
        )}
      </Button>

      <AnimatePresence>
        {suggestions && (
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
            <Card className="border-2 border-blue-600/30 bg-gradient-to-br from-blue-50 to-white p-5 space-y-4">
              {/* 标题 */}
              <div className="flex items-center gap-2 mb-3">
                <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center">
                  <Wand2 className="w-4 h-4 text-white" />
                </div>
                <h3 className="text-[16px] font-semibold text-slate-900">AI智能建议</h3>
              </div>

              {/* 描述 */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-[14px] text-slate-500 font-medium">
                  <Tag className="w-4 h-4 text-blue-600" />
                  <span>完善描述</span>
                </div>
                <Textarea
                  value={suggestions.description || ""}
                  onChange={(e) => updateSuggestion("description", e.target.value)}
                  className="bg-white min-h-[80px] text-[14px] border-slate-200 focus-visible:ring-blue-600"
                />
              </div>

              {/* 分类和优先级 */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-[14px] text-slate-500 font-medium">
                    <Tag className="w-4 h-4 text-blue-600" />
                    <span>推荐分类</span>
                  </div>
                  <Select value={suggestions.category} onValueChange={(val) => updateSuggestion("category", val)}>
                    <SelectTrigger className="bg-white border-slate-200"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((cat) => (
                        <SelectItem key={cat.value} value={cat.value}>
                          <div className="flex items-center gap-2"><span>{cat.icon}</span><span>{cat.label}</span></div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-[14px] text-slate-500 font-medium">
                    <AlertCircle className="w-4 h-4 text-blue-600" />
                    <span>推荐优先级</span>
                  </div>
                  <Select value={suggestions.priority} onValueChange={(val) => updateSuggestion("priority", val)}>
                    <SelectTrigger className="bg-white border-slate-200"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PRIORITIES.map((pri) => (
                        <SelectItem key={pri.value} value={pri.value}>
                          <span>{pri.label}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* 标签 */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-[14px] text-slate-500 font-medium">
                  <TrendingUp className="w-4 h-4 text-blue-600" />
                  <span>推荐标签</span>
                </div>
                <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {tags.map((tag, index) => (
                      <Badge key={index} variant="outline" className="bg-blue-50 border-blue-600/20 text-blue-600 text-[13px] pl-2.5 pr-1.5 py-1 flex items-center gap-1">
                        #{tag}
                        <button onClick={() => removeTag(tag)} className="hover:bg-blue-600/10 rounded-full p-0.5 transition-colors">
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={newTag}
                      onChange={(e) => setNewTag(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
                      placeholder="添加新标签..."
                      className="h-8 text-sm border-slate-200"
                    />
                    <Button size="sm" onClick={addTag} disabled={!newTag.trim()} className="h-8 bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-600/20">
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>

              {/* 子约定 */}
              {subtasks.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-[14px] text-slate-500 font-medium">
                    <ListTodo className="w-4 h-4 text-blue-600" />
                    <span>建议子约定</span>
                  </div>
                  <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-2">
                    {subtasks.map((st, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                        <Input
                          value={typeof st === "string" ? st : (st.title || "")}
                          onChange={(e) => {
                            const newSubtasks = [...subtasks];
                            newSubtasks[idx] = typeof newSubtasks[idx] === "string"
                              ? e.target.value
                              : { ...newSubtasks[idx], title: e.target.value };
                            updateSuggestion("subtasks", newSubtasks);
                          }}
                          className="h-8 text-sm border-0 border-b border-transparent focus-visible:border-blue-500 rounded-none px-0 focus-visible:ring-0 bg-transparent flex-1"
                          placeholder="输入子约定..."
                        />
                        {typeof st !== "string" && (
                          <div className="flex items-center gap-1">
                            {st.time && <Badge variant="outline" className="text-[10px] px-1 h-5 text-slate-500 border-slate-200">{st.time}</Badge>}
                            {st.category && (
                              <Badge variant="outline" className="text-[10px] px-1 h-5 text-blue-600 border-blue-200 bg-blue-50">
                                {CATEGORIES.find((c) => c.value === st.category)?.label || st.category}
                              </Badge>
                            )}
                            {st.priority && (
                              <Badge variant="outline" className={`text-[10px] px-1 h-5 border-slate-200 ${st.priority === "high" || st.priority === "urgent" ? "text-red-500 bg-red-50" : "text-slate-500"}`}>
                                {PRIORITIES.find((p) => p.value === st.priority)?.label || st.priority}
                              </Badge>
                            )}
                          </div>
                        )}
                        <button
                          onClick={() => updateSuggestion("subtasks", subtasks.filter((_, i) => i !== idx))}
                          className="p-1 text-slate-400 hover:text-red-500 transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => updateSuggestion("subtasks", [...subtasks, { title: "", priority: suggestions.priority, category: suggestions.category, time: "09:00" }])}
                      className="w-full text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 h-7"
                    >
                      <Plus className="w-3.5 h-3.5 mr-1" />添加子约定
                    </Button>
                  </div>
                </div>
              )}

              {/* 时间与风险 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="bg-indigo-50/50 p-3 rounded-lg border border-indigo-100">
                  <div className="flex items-center gap-2 mb-2 text-indigo-800">
                    <Clock className="w-4 h-4" />
                    <span className="text-xs font-bold">最佳执行时间</span>
                  </div>
                  <div className="space-y-1 text-xs text-indigo-700">
                    {suggestions.reminder_time && (() => {
                      try { return <div className="flex justify-between"><span className="opacity-70">建议提醒:</span><span className="font-medium">{format(new Date(suggestions.reminder_time), "MM-dd HH:mm")}</span></div>; }
                      catch { return null; }
                    })()}
                    {suggestions.execution_start && (() => {
                      try { return <div className="flex justify-between"><span className="opacity-70">建议执行:</span><span className="font-medium">{format(new Date(suggestions.execution_start), "MM-dd HH:mm")}{suggestions.execution_end && ` - ${format(new Date(suggestions.execution_end), "HH:mm")}`}</span></div>; }
                      catch { return null; }
                    })()}
                    {suggestions.time_reasoning && <p className="mt-1 pt-1 border-t border-indigo-200/50 opacity-80 leading-snug">{suggestions.time_reasoning}</p>}
                  </div>
                </div>

                <div className={`p-3 rounded-lg border ${suggestions.risk_level === "high" || suggestions.risk_level === "critical" ? "bg-red-50 border-red-100" : "bg-amber-50 border-amber-100"}`}>
                  <div className={`flex items-center gap-2 mb-2 ${suggestions.risk_level === "high" || suggestions.risk_level === "critical" ? "text-red-800" : "text-amber-800"}`}>
                    <ShieldAlert className="w-4 h-4" />
                    <span className="text-xs font-bold">风险等级: {(suggestions.risk_level || "low").toUpperCase()}</span>
                  </div>
                  <div className="space-y-1 text-xs">
                    {risks.length > 0 ? (
                      <ul className="list-disc list-inside space-y-0.5 opacity-80">
                        {risks.map((risk, i) => <li key={i}>{risk}</li>)}
                      </ul>
                    ) : (
                      <span className="opacity-60">未检测到显著风险</span>
                    )}
                  </div>
                </div>
              </div>

              {/* AI分析原因 */}
              <div className="bg-gradient-to-r from-sky-100 to-cyan-100 rounded-lg p-3 border border-blue-600/20">
                <div className="flex items-start gap-2">
                  <Sparkles className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[13px] font-medium text-blue-600 mb-1">AI分析</p>
                    <p className="text-[13px] text-slate-600 leading-relaxed">{suggestions.reasoning}</p>
                  </div>
                </div>
              </div>

              {/* 微调输入 */}
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-2">
                <Label className="text-xs font-medium text-slate-500 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-purple-500" />
                  对建议不满意？告诉AI如何调整
                </Label>
                <div className="flex gap-2">
                  <Input
                    value={refineInstruction}
                    onChange={(e) => setRefineInstruction(e.target.value)}
                    placeholder="例如：把优先级调低点、时间改到明天下午..."
                    className="h-9 text-sm bg-white"
                    onKeyDown={(e) => e.key === "Enter" && handleRefine()}
                  />
                  <Button size="sm" onClick={handleRefine} disabled={isRefining || !refineInstruction.trim()} className="h-9 bg-purple-100 text-purple-700 hover:bg-purple-200 border border-purple-200">
                    {isRefining ? <Loader2 className="w-4 h-4 animate-spin" /> : "调整"}
                  </Button>
                </div>
              </div>

              {/* 操作按钮 */}
              <div className="flex flex-col gap-3 pt-2">
                <div className="flex items-center space-x-2 px-1">
                  <Switch id="preserve-mode" checked={preserveDescription} onCheckedChange={setPreserveDescription} />
                  <Label htmlFor="preserve-mode" className="text-sm font-medium text-slate-600 cursor-pointer">
                    保留原约定描述 (仅应用属性和其他建议)
                  </Label>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={handleApplySuggestions}
                    className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white h-9 flex-1 rounded-lg"
                  >
                    <Sparkles className="w-4 h-4 mr-2" />应用建议
                  </Button>
                  <Button onClick={() => setSuggestions(null)} variant="outline" className="rounded-lg border-slate-200 hover:bg-slate-50">
                    关闭
                  </Button>
                </div>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}