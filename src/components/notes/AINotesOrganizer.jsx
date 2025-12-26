import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Sparkles, 
  Loader2, 
  FolderSync, 
  Tag, 
  Palette,
  GitMerge,
  Archive,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  Layers
} from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

const COLORS = [
  { name: "white", label: "白色", class: "bg-white" },
  { name: "red", label: "红色", class: "bg-red-100" },
  { name: "orange", label: "橙色", class: "bg-orange-100" },
  { name: "yellow", label: "黄色", class: "bg-yellow-100" },
  { name: "green", label: "绿色", class: "bg-green-100" },
  { name: "blue", label: "蓝色", class: "bg-blue-100" },
  { name: "purple", label: "紫色", class: "bg-purple-100" },
  { name: "pink", label: "粉色", class: "bg-pink-100" },
];

export default function AINotesOrganizer({ notes, open, onOpenChange }) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [suggestions, setSuggestions] = useState(null);
  const [selectedActions, setSelectedActions] = useState([]);
  const queryClient = useQueryClient();

  const updateNotesMutation = useMutation({
    mutationFn: async (updates) => {
      const promises = updates.map(({ id, data }) => 
        base44.entities.Note.update(id, data)
      );
      return Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] });
      toast.success("笔记整理完成");
      setSuggestions(null);
      setSelectedActions([]);
    },
  });

  const handleAnalyze = async () => {
    if (!notes || notes.length === 0) {
      toast.error("没有可分析的笔记");
      return;
    }

    setIsAnalyzing(true);
    setProgress(0);

    try {
      const notesData = notes.map(n => ({
        id: n.id,
        content: n.plain_text || n.content?.replace(/<[^>]+>/g, '').slice(0, 500),
        current_tags: n.tags || [],
        current_color: n.color || 'white',
        created_date: n.created_date
      }));

      setProgress(20);

      const response = await base44.integrations.Core.InvokeLLM({
        prompt: `你是一个智能笔记整理助手。分析以下笔记数据，提供整理建议。

笔记数据:
${JSON.stringify(notesData, null, 2)}

任务:
1. **标签优化**: 为每个笔记推荐3-5个相关标签
2. **颜色分类**: 根据内容主题推荐颜色（工作=蓝色，个人=紫色，学习=黄色，健康=绿色，灵感=粉色等）
3. **相似检测**: 找出内容相似度>70%的笔记对，建议合并
4. **归档建议**: 识别过时或不再相关的笔记（如时间敏感信息已过期）

返回JSON格式建议，所有文本使用简体中文。`,
        response_json_schema: {
          type: "object",
          properties: {
            note_updates: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  note_id: { type: "string" },
                  suggested_tags: { type: "array", items: { type: "string" } },
                  suggested_color: { type: "string", enum: ["white", "red", "orange", "yellow", "green", "blue", "purple", "pink"] },
                  reasoning: { type: "string" }
                }
              }
            },
            similar_groups: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  note_ids: { type: "array", items: { type: "string" } },
                  similarity_reason: { type: "string" },
                  merge_suggestion: { type: "string" }
                }
              }
            },
            archive_candidates: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  note_id: { type: "string" },
                  reason: { type: "string" }
                }
              }
            },
            summary: {
              type: "object",
              properties: {
                total_analyzed: { type: "number" },
                tags_suggested: { type: "number" },
                colors_suggested: { type: "number" },
                duplicates_found: { type: "number" },
                archive_suggested: { type: "number" }
              }
            }
          },
          required: ["note_updates", "similar_groups", "archive_candidates", "summary"]
        }
      });

      setProgress(100);
      setSuggestions(response);
      
      // Auto-select all optimization actions
      const autoActions = [];
      response.note_updates?.forEach(u => {
        autoActions.push(`update_${u.note_id}`);
      });
      setSelectedActions(autoActions);

      toast.success(`AI分析完成，发现 ${response.summary.total_analyzed} 个优化点`);
    } catch (error) {
      console.error("AI整理分析失败:", error);
      const errorMsg = error?.message || error?.toString() || "未知错误";
      toast.error(`分析失败: ${errorMsg}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleApplySelected = async () => {
    if (selectedActions.length === 0) {
      toast.error("请至少选择一个优化操作");
      return;
    }

    const updates = [];

    // Apply tag and color updates
    suggestions.note_updates?.forEach(update => {
      if (selectedActions.includes(`update_${update.note_id}`)) {
        const note = notes.find(n => n.id === update.note_id);
        if (note) {
          updates.push({
            id: update.note_id,
            data: {
              tags: Array.from(new Set([...(note.tags || []), ...update.suggested_tags])),
              color: update.suggested_color
            }
          });
        }
      }
    });

    // Apply merge actions (merge content, keep first note, delete others)
    suggestions.similar_groups?.forEach((group, idx) => {
      if (selectedActions.includes(`merge_${idx}`) && group.note_ids.length > 0) {
        const notesToMerge = group.note_ids.map(id => notes.find(n => n.id === id)).filter(Boolean);
        if (notesToMerge.length > 1) {
          const primaryNote = notesToMerge[0];
          const mergedContent = notesToMerge.map(n => n.content).join('<hr class="my-4" />');
          const mergedTags = Array.from(new Set(notesToMerge.flatMap(n => n.tags || [])));

          updates.push({
            id: primaryNote.id,
            data: {
              content: mergedContent,
              plain_text: notesToMerge.map(n => n.plain_text || '').join('\n\n---\n\n'),
              tags: mergedTags
            }
          });

          // Soft delete the rest
          notesToMerge.slice(1).forEach(n => {
            updates.push({
              id: n.id,
              data: { deleted_at: new Date().toISOString() }
            });
          });
        }
      }
    });

    // Apply archive actions
    suggestions.archive_candidates?.forEach(candidate => {
      if (selectedActions.includes(`archive_${candidate.note_id}`)) {
        updates.push({
          id: candidate.note_id,
          data: { deleted_at: new Date().toISOString() }
        });
      }
    });

    await updateNotesMutation.mutateAsync(updates);
  };

  const toggleAction = (actionId) => {
    if (selectedActions.includes(actionId)) {
      setSelectedActions(selectedActions.filter(a => a !== actionId));
    } else {
      setSelectedActions([...selectedActions, actionId]);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderSync className="w-5 h-5 text-purple-600" />
            AI 智能笔记整理
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col">
          {!suggestions ? (
            <div className="flex-1 flex items-center justify-center py-12">
              <div className="text-center max-w-md">
                <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-purple-100 to-blue-100 flex items-center justify-center">
                  <Sparkles className="w-10 h-10 text-purple-600" />
                </div>
                <h3 className="text-lg font-semibold text-slate-800 mb-2">
                  AI 笔记管家
                </h3>
                <p className="text-sm text-slate-600 mb-6">
                  分析所有笔记，智能推荐标签、颜色分类，<br />
                  发现相似内容，优化你的知识库
                </p>
                
                {isAnalyzing && (
                  <div className="space-y-3 mb-6">
                    <Progress value={progress} className="h-2" />
                    <div className="flex items-center justify-center gap-2 text-sm text-slate-600">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      正在分析 {notes.length} 条笔记...
                    </div>
                  </div>
                )}

                <Button
                  onClick={handleAnalyze}
                  disabled={isAnalyzing}
                  className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
                >
                  {isAnalyzing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      分析中...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      开始智能整理
                    </>
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-hidden flex flex-col">
              {/* Summary Stats */}
              <div className="grid grid-cols-4 gap-3 mb-4">
                <Card className="p-3 bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
                  <div className="text-xs text-blue-600 mb-1">标签建议</div>
                  <div className="text-2xl font-bold text-blue-700">
                    {suggestions.summary.tags_suggested}
                  </div>
                </Card>
                <Card className="p-3 bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
                  <div className="text-xs text-purple-600 mb-1">颜色分类</div>
                  <div className="text-2xl font-bold text-purple-700">
                    {suggestions.summary.colors_suggested}
                  </div>
                </Card>
                <Card className="p-3 bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
                  <div className="text-xs text-orange-600 mb-1">相似笔记</div>
                  <div className="text-2xl font-bold text-orange-700">
                    {suggestions.summary.duplicates_found}
                  </div>
                </Card>
                <Card className="p-3 bg-gradient-to-br from-slate-50 to-slate-100 border-slate-200">
                  <div className="text-xs text-slate-600 mb-1">可归档</div>
                  <div className="text-2xl font-bold text-slate-700">
                    {suggestions.summary.archive_suggested}
                  </div>
                </Card>
              </div>

              {/* Suggestions List */}
              <ScrollArea className="flex-1 pr-4">
                <div className="space-y-4">
                  {/* Tag and Color Optimizations */}
                  {suggestions.note_updates?.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-sm flex items-center gap-2 mb-3">
                        <TrendingUp className="w-4 h-4 text-blue-600" />
                        标签与颜色优化 ({suggestions.note_updates.length})
                      </h4>
                      <div className="space-y-2">
                        {suggestions.note_updates.map(update => {
                          const note = notes.find(n => n.id === update.note_id);
                          const isSelected = selectedActions.includes(`update_${update.note_id}`);
                          const colorInfo = COLORS.find(c => c.name === update.suggested_color);

                          return (
                            <motion.div
                              key={update.note_id}
                              initial={{ opacity: 0, x: -20 }}
                              animate={{ opacity: 1, x: 0 }}
                            >
                              <Card className={`p-3 border-2 transition-all ${isSelected ? 'border-blue-300 bg-blue-50/50' : 'border-slate-200 hover:border-slate-300'}`}>
                                <div className="flex items-start gap-3">
                                  <Checkbox
                                    checked={isSelected}
                                    onCheckedChange={() => toggleAction(`update_${update.note_id}`)}
                                    className="mt-1"
                                  />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-start justify-between gap-2 mb-2">
                                      <p className="text-sm font-medium text-slate-800 line-clamp-1">
                                        {note?.plain_text?.slice(0, 60) || '未命名笔记'}
                                      </p>
                                      <div className={`w-6 h-6 rounded-md ${colorInfo?.class} border border-slate-300 flex-shrink-0`} />
                                    </div>
                                    <div className="flex flex-wrap gap-1.5 mb-2">
                                      {update.suggested_tags.map(tag => (
                                        <Badge key={tag} variant="outline" className="text-xs border-blue-300 text-blue-700">
                                          #{tag}
                                        </Badge>
                                      ))}
                                    </div>
                                    <p className="text-xs text-slate-500">
                                      {update.reasoning}
                                    </p>
                                  </div>
                                </div>
                              </Card>
                            </motion.div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Similar Notes - Merge Suggestions */}
                  {suggestions.similar_groups?.length > 0 && (
                    <div className="pt-4">
                      <h4 className="font-semibold text-sm flex items-center gap-2 mb-3">
                        <GitMerge className="w-4 h-4 text-orange-600" />
                        相似笔记合并建议 ({suggestions.similar_groups.length})
                      </h4>
                      <div className="space-y-2">
                        {suggestions.similar_groups.map((group, idx) => {
                          const isSelected = selectedActions.includes(`merge_${idx}`);
                          const groupNotes = group.note_ids.map(id => notes.find(n => n.id === id)).filter(Boolean);

                          return (
                            <motion.div
                              key={idx}
                              initial={{ opacity: 0, x: -20 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: idx * 0.05 }}
                            >
                              <Card className={`p-3 border-2 transition-all ${isSelected ? 'border-orange-300 bg-orange-50/50' : 'border-slate-200 hover:border-slate-300'}`}>
                                <div className="flex items-start gap-3">
                                  <Checkbox
                                    checked={isSelected}
                                    onCheckedChange={() => toggleAction(`merge_${idx}`)}
                                    className="mt-1"
                                  />
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-2">
                                      <Layers className="w-4 h-4 text-orange-600" />
                                      <span className="text-sm font-semibold text-slate-800">
                                        合并 {groupNotes.length} 条相似笔记
                                      </span>
                                    </div>
                                    <p className="text-xs text-slate-600 mb-3">
                                      {group.similarity_reason}
                                    </p>
                                    <div className="space-y-1.5 pl-3 border-l-2 border-orange-200">
                                      {groupNotes.map(note => (
                                        <div key={note.id} className="text-xs text-slate-700 bg-white rounded px-2 py-1 border border-slate-100">
                                          {note.plain_text?.slice(0, 80)}...
                                        </div>
                                      ))}
                                    </div>
                                    <p className="text-xs text-orange-700 mt-2 font-medium">
                                      💡 {group.merge_suggestion}
                                    </p>
                                  </div>
                                </div>
                              </Card>
                            </motion.div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Archive Candidates */}
                  {suggestions.archive_candidates?.length > 0 && (
                    <div className="pt-4">
                      <h4 className="font-semibold text-sm flex items-center gap-2 mb-3">
                        <Archive className="w-4 h-4 text-slate-600" />
                        建议归档 ({suggestions.archive_candidates.length})
                      </h4>
                      <div className="space-y-2">
                        {suggestions.archive_candidates.map(candidate => {
                          const note = notes.find(n => n.id === candidate.note_id);
                          const isSelected = selectedActions.includes(`archive_${candidate.note_id}`);

                          return (
                            <motion.div
                              key={candidate.note_id}
                              initial={{ opacity: 0, x: -20 }}
                              animate={{ opacity: 1, x: 0 }}
                            >
                              <Card className={`p-3 border-2 transition-all ${isSelected ? 'border-slate-400 bg-slate-50' : 'border-slate-200 hover:border-slate-300'}`}>
                                <div className="flex items-start gap-3">
                                  <Checkbox
                                    checked={isSelected}
                                    onCheckedChange={() => toggleAction(`archive_${candidate.note_id}`)}
                                    className="mt-1"
                                  />
                                  <div className="flex-1">
                                    <p className="text-sm text-slate-700 line-clamp-2 mb-1">
                                      {note?.plain_text?.slice(0, 100)}
                                    </p>
                                    <p className="text-xs text-slate-500">
                                      {candidate.reason}
                                    </p>
                                  </div>
                                </div>
                              </Card>
                            </motion.div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>

              {/* Action Buttons */}
              <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
                <div className="text-sm text-slate-600">
                  已选择 <span className="font-semibold text-purple-600">{selectedActions.length}</span> 个操作
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setSuggestions(null)}
                  >
                    取消
                  </Button>
                  <Button
                    onClick={handleApplySelected}
                    disabled={selectedActions.length === 0 || updateNotesMutation.isPending}
                    className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
                  >
                    {updateNotesMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        应用中...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4 mr-2" />
                        应用选中的优化
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}