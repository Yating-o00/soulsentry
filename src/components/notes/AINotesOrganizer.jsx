import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Sparkles, Loader2, Wand2, Merge, Archive, Tag, Palette, CheckCircle2, AlertCircle, TrendingUp, FileText } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

const COLORS = [
  { name: "white", label: "白色" },
  { name: "red", label: "红色" },
  { name: "orange", label: "橙色" },
  { name: "yellow", label: "黄色" },
  { name: "green", label: "绿色" },
  { name: "blue", label: "蓝色" },
  { name: "purple", label: "紫色" },
  { name: "pink", label: "粉色" },
];

export default function AINotesOrganizer({ notes, open, onOpenChange }) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [analysis, setAnalysis] = useState(null);
  const [autoApply, setAutoApply] = useState(false);
  const queryClient = useQueryClient();

  const updateNotesMutation = useMutation({
    mutationFn: async (updates) => {
      for (const update of updates) {
        await base44.entities.Note.update(update.id, update.data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] });
      toast.success("笔记整理完成");
    },
  });

  const handleAnalyzeAll = async () => {
    if (!notes || notes.length === 0) {
      toast.error("暂无笔记可分析");
      return;
    }

    setIsAnalyzing(true);
    setProgress(0);

    try {
      const notesToAnalyze = notes.filter(n => !n.deleted_at).slice(0, 50); // 限制50条防止超时
      const batchSize = 10;
      const batches = [];
      
      for (let i = 0; i < notesToAnalyze.length; i += batchSize) {
        batches.push(notesToAnalyze.slice(i, i + batchSize));
      }

      let allSuggestions = [];
      let similarities = [];

      // 批量分析
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        setProgress(Math.round((i / batches.length) * 50));

        const batchData = batch.map(note => ({
          id: note.id,
          content: note.plain_text?.slice(0, 500) || note.content?.slice(0, 500),
          current_tags: note.tags || [],
          current_color: note.color || 'white'
        }));

        const res = await base44.integrations.Core.InvokeLLM({
          prompt: `分析以下笔记，为每条笔记提供智能分类建议：

笔记数据:
${JSON.stringify(batchData, null, 2)}

任务：
1. 为每条笔记推荐3-5个相关标签（基于内容主题）
2. 推荐最合适的颜色标记（根据内容类型/情绪）：
   - red: 紧急/重要/警告
   - orange: 工作/行动项
   - yellow: 想法/创意/提醒
   - green: 健康/财务/成长
   - blue: 学习/知识/参考
   - purple: 个人/情感/日记
   - pink: 灵感/艺术/美好
   - white: 中性/普通
3. 给出推荐理由

返回JSON数组，每个元素对应一条笔记`,
          response_json_schema: {
            type: "object",
            properties: {
              suggestions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    note_id: { type: "string" },
                    recommended_tags: { type: "array", items: { type: "string" } },
                    recommended_color: { type: "string" },
                    reasoning: { type: "string" }
                  }
                }
              }
            }
          }
        });

        if (res?.suggestions) {
          allSuggestions.push(...res.suggestions);
        }
      }

      setProgress(60);

      // 相似笔记检测
      toast.loading("正在检测相似笔记...", { id: 'similarity' });
      
      const similarityRes = await base44.integrations.Core.InvokeLLM({
        prompt: `分析以下笔记，找出内容相似或主题相关的笔记组，建议合并或归档。

笔记列表:
${notesToAnalyze.map(n => `ID: ${n.id}, 内容: ${n.plain_text?.slice(0, 200) || '空'}, 标签: ${n.tags?.join(', ') || '无'}`).join('\n\n')}

任务：
1. 识别内容高度相似（>70%）或主题完全相同的笔记
2. 识别可以合并为一条笔记的多条碎片笔记
3. 识别过时/重复的笔记建议归档

返回相似组列表，每组包含笔记ID列表和建议操作`,
        response_json_schema: {
          type: "object",
          properties: {
            similar_groups: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  note_ids: { type: "array", items: { type: "string" } },
                  similarity_reason: { type: "string" },
                  suggested_action: { 
                    type: "string", 
                    enum: ["merge", "archive_duplicates", "keep_separate"]
                  },
                  merge_title_suggestion: { type: "string" }
                }
              }
            }
          }
        }
      });

      toast.dismiss('similarity');
      setProgress(100);

      if (similarityRes?.similar_groups) {
        similarities = similarityRes.similar_groups.filter(g => 
          g.suggested_action !== "keep_separate" && g.note_ids?.length > 1
        );
      }

      setAnalysis({
        suggestions: allSuggestions,
        similarities: similarities,
        total_analyzed: notesToAnalyze.length
      });

      // 自动应用
      if (autoApply && allSuggestions.length > 0) {
        applyAllSuggestions(allSuggestions);
      } else {
        toast.success(`AI分析完成！处理了 ${notesToAnalyze.length} 条笔记`);
      }

    } catch (error) {
      console.error("AI批量分析失败:", error);
      const errorMsg = error?.message || error?.toString() || "未知错误";
      toast.error(`分析失败: ${errorMsg}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const applyAllSuggestions = async (suggestions) => {
    const updates = suggestions.map(s => ({
      id: s.note_id,
      data: {
        tags: s.recommended_tags,
        color: s.recommended_color
      }
    }));

    await updateNotesMutation.mutateAsync(updates);
  };

  const applySingleSuggestion = async (suggestion) => {
    await updateNotesMutation.mutateAsync([{
      id: suggestion.note_id,
      data: {
        tags: suggestion.recommended_tags,
        color: suggestion.recommended_color
      }
    }]);
  };

  const handleMergeNotes = async (group) => {
    try {
      toast.loading("正在合并笔记...", { id: 'merge' });
      
      const notesToMerge = notes.filter(n => group.note_ids.includes(n.id));
      const combinedContent = notesToMerge.map(n => n.content).join('\n<hr/>\n');
      const allTags = [...new Set(notesToMerge.flatMap(n => n.tags || []))];

      // 创建合并后的新笔记
      await base44.entities.Note.create({
        content: combinedContent,
        plain_text: notesToMerge.map(n => n.plain_text).join('\n\n'),
        tags: allTags,
        color: notesToMerge[0].color,
        is_pinned: notesToMerge.some(n => n.is_pinned)
      });

      // 软删除原笔记
      for (const note of notesToMerge) {
        await base44.entities.Note.update(note.id, {
          deleted_at: new Date().toISOString()
        });
      }

      queryClient.invalidateQueries({ queryKey: ['notes'] });
      toast.success("笔记已合并", { id: 'merge' });
      
      // 移除已处理的组
      setAnalysis(prev => ({
        ...prev,
        similarities: prev.similarities.filter(g => g !== group)
      }));

    } catch (error) {
      console.error("合并失败:", error);
      toast.error("合并失败，请重试", { id: 'merge' });
    }
  };

  const getNoteById = (id) => notes.find(n => n.id === id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="w-5 h-5 text-purple-600" />
            AI 笔记整理助手
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* 控制面板 */}
          <Card className="p-4 bg-gradient-to-br from-purple-50 to-blue-50 border-purple-200">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-slate-800 mb-1">智能分析设置</h3>
                <p className="text-xs text-slate-600">
                  共 {notes?.filter(n => !n.deleted_at).length || 0} 条笔记待整理
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="auto-apply"
                  checked={autoApply}
                  onCheckedChange={setAutoApply}
                />
                <Label htmlFor="auto-apply" className="text-sm cursor-pointer">
                  自动应用建议
                </Label>
              </div>
            </div>

            <Button
              onClick={handleAnalyzeAll}
              disabled={isAnalyzing}
              className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white h-12"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  AI分析中... {progress}%
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5 mr-2" />
                  开始AI智能整理
                </>
              )}
            </Button>

            {isAnalyzing && (
              <div className="mt-4">
                <Progress value={progress} className="h-2" />
              </div>
            )}
          </Card>

          {/* 分析结果 */}
          <AnimatePresence>
            {analysis && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4"
              >
                {/* 统计概览 */}
                <div className="grid grid-cols-3 gap-3">
                  <Card className="p-4 text-center border-blue-200 bg-blue-50">
                    <FileText className="w-6 h-6 mx-auto mb-2 text-blue-600" />
                    <div className="text-2xl font-bold text-blue-700">{analysis.total_analyzed}</div>
                    <div className="text-xs text-blue-600">已分析</div>
                  </Card>
                  <Card className="p-4 text-center border-green-200 bg-green-50">
                    <Tag className="w-6 h-6 mx-auto mb-2 text-green-600" />
                    <div className="text-2xl font-bold text-green-700">{analysis.suggestions?.length || 0}</div>
                    <div className="text-xs text-green-600">标签建议</div>
                  </Card>
                  <Card className="p-4 text-center border-orange-200 bg-orange-50">
                    <Merge className="w-6 h-6 mx-auto mb-2 text-orange-600" />
                    <div className="text-2xl font-bold text-orange-700">{analysis.similarities?.length || 0}</div>
                    <div className="text-xs text-orange-600">相似组</div>
                  </Card>
                </div>

                {/* 分类建议 */}
                {analysis.suggestions && analysis.suggestions.length > 0 && !autoApply && (
                  <Card className="p-4">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold flex items-center gap-2">
                        <Tag className="w-5 h-5 text-blue-600" />
                        智能分类建议
                      </h3>
                      <Button
                        size="sm"
                        onClick={() => applyAllSuggestions(analysis.suggestions)}
                        className="bg-blue-600 hover:bg-blue-700"
                      >
                        <CheckCircle2 className="w-4 h-4 mr-1" />
                        全部应用
                      </Button>
                    </div>

                    <div className="space-y-3 max-h-96 overflow-y-auto">
                      {analysis.suggestions.map((suggestion, idx) => {
                        const note = getNoteById(suggestion.note_id);
                        if (!note) return null;

                        return (
                          <motion.div
                            key={suggestion.note_id}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: idx * 0.05 }}
                            className="p-3 bg-slate-50 rounded-lg border border-slate-200 hover:border-blue-300 transition-colors"
                          >
                            <div className="flex items-start justify-between gap-3 mb-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-slate-800 truncate mb-1">
                                  {note.plain_text?.slice(0, 60) || '未命名笔记'}
                                </p>
                                <p className="text-xs text-slate-500 line-clamp-2">
                                  {suggestion.reasoning}
                                </p>
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => applySingleSuggestion(suggestion)}
                                className="flex-shrink-0"
                              >
                                应用
                              </Button>
                            </div>

                            <div className="flex items-center gap-2 flex-wrap">
                              {/* 颜色建议 */}
                              <div className="flex items-center gap-1.5">
                                <Palette className="w-3 h-3 text-slate-400" />
                                <div className={`w-5 h-5 rounded border-2 ${
                                  suggestion.recommended_color === 'white' ? 'bg-white border-slate-300' : 
                                  `bg-${suggestion.recommended_color}-100 border-${suggestion.recommended_color}-300`
                                }`} />
                                <span className="text-xs text-slate-600">
                                  {COLORS.find(c => c.name === suggestion.recommended_color)?.label}
                                </span>
                              </div>

                              {/* 标签建议 */}
                              <div className="flex items-center gap-1 flex-wrap">
                                <span className="text-xs text-slate-400">→</span>
                                {suggestion.recommended_tags?.map(tag => (
                                  <Badge key={tag} variant="secondary" className="text-xs">
                                    #{tag}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </Card>
                )}

                {/* 相似笔记检测 */}
                {analysis.similarities && analysis.similarities.length > 0 && (
                  <Card className="p-4 border-orange-200 bg-orange-50/30">
                    <h3 className="font-semibold flex items-center gap-2 mb-4">
                      <Merge className="w-5 h-5 text-orange-600" />
                      发现 {analysis.similarities.length} 组相似笔记
                    </h3>

                    <div className="space-y-4">
                      {analysis.similarities.map((group, idx) => {
                        const groupNotes = group.note_ids.map(id => getNoteById(id)).filter(Boolean);
                        
                        return (
                          <motion.div
                            key={idx}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.1 }}
                            className="p-4 bg-white rounded-lg border-2 border-orange-200"
                          >
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                  <Badge className={`text-xs ${
                                    group.suggested_action === 'merge' ? 'bg-blue-600' : 'bg-orange-600'
                                  }`}>
                                    {group.suggested_action === 'merge' ? '建议合并' : '建议归档重复项'}
                                  </Badge>
                                  {group.merge_title_suggestion && (
                                    <span className="text-xs text-slate-600">
                                      → "{group.merge_title_suggestion}"
                                    </span>
                                  )}
                                </div>
                                <p className="text-sm text-slate-700 mb-3">
                                  {group.similarity_reason}
                                </p>
                              </div>
                            </div>

                            {/* 相似笔记列表 */}
                            <div className="space-y-2 mb-3">
                              {groupNotes.map((note, i) => (
                                <div key={note.id} className="flex items-start gap-2 text-xs p-2 bg-slate-50 rounded">
                                  <span className="text-slate-400 font-mono">{i + 1}.</span>
                                  <p className="flex-1 text-slate-700 line-clamp-2">
                                    {note.plain_text?.slice(0, 100) || '空白笔记'}
                                  </p>
                                  {note.tags && note.tags.length > 0 && (
                                    <div className="flex gap-1">
                                      {note.tags.slice(0, 2).map(tag => (
                                        <Badge key={tag} variant="outline" className="text-[9px] px-1">
                                          {tag}
                                        </Badge>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>

                            <div className="flex gap-2">
                              {group.suggested_action === 'merge' && (
                                <Button
                                  size="sm"
                                  onClick={() => handleMergeNotes(group)}
                                  className="bg-blue-600 hover:bg-blue-700"
                                >
                                  <Merge className="w-3 h-3 mr-1" />
                                  合并这些笔记
                                </Button>
                              )}
                              {group.suggested_action === 'archive_duplicates' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={async () => {
                                    // 保留第一条，归档其余
                                    const toArchive = group.note_ids.slice(1);
                                    for (const id of toArchive) {
                                      await base44.entities.Note.update(id, {
                                        deleted_at: new Date().toISOString()
                                      });
                                    }
                                    queryClient.invalidateQueries({ queryKey: ['notes'] });
                                    toast.success("已归档重复笔记");
                                    setAnalysis(prev => ({
                                      ...prev,
                                      similarities: prev.similarities.filter(g => g !== group)
                                    }));
                                  }}
                                  className="border-orange-300 text-orange-600"
                                >
                                  <Archive className="w-3 h-3 mr-1" />
                                  归档重复项
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setAnalysis(prev => ({
                                    ...prev,
                                    similarities: prev.similarities.filter(g => g !== group)
                                  }));
                                }}
                                className="text-slate-500"
                              >
                                忽略
                              </Button>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </Card>
                )}

                {/* 完成状态 */}
                {analysis && !isAnalyzing && (
                  <div className="flex items-center justify-center gap-2 text-green-600 py-4">
                    <CheckCircle2 className="w-5 h-5" />
                    <span className="font-medium">AI整理完成</span>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
}