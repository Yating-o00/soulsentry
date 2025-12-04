import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { 
  Sparkles, 
  Loader2, 
  List, 
  MapPin, 
  User, 
  Globe, 
  Calendar, 
  CheckSquare,
  ArrowRight,
  BrainCircuit
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export default function AINoteAssistant({ noteContent, onTagsGenerated, onSummaryGenerated, onTaskCreated }) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [activeTab, setActiveTab] = useState("entities"); // entities, summary, tasks

  const handleFullAnalysis = async () => {
    if (!noteContent || noteContent.trim().length < 5) {
      toast.error("内容太少，无法分析");
      return;
    }

    setIsAnalyzing(true);
    try {
      const res = await base44.integrations.Core.InvokeLLM({
        prompt: `请深度分析以下便签内容，并返回结构化数据。
        
        便签内容：
        ${noteContent}
        
        任务要求：
        1. 提取实体：人名、地点、网址、日期/时间。
        2. 生成摘要：提供一个简短的总结（1-2句）和3个关键要点。
        3. 识别潜在任务：如果内容包含行动项，请提取为任务对象。
        4. 生成标签：3-5个相关标签。

        返回JSON格式。
        `,
        response_json_schema: {
          type: "object",
          properties: {
            entities: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  text: { type: "string" },
                  type: { type: "string", enum: ["person", "location", "url", "date", "other"] },
                  context: { type: "string" }
                }
              }
            },
            summary: {
              type: "object",
              properties: {
                brief: { type: "string" },
                points: { type: "array", items: { type: "string" } }
              }
            },
            potential_tasks: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  description: { type: "string" },
                  priority: { type: "string", enum: ["low", "medium", "high"] }
                }
              }
            },
            tags: {
              type: "array",
              items: { type: "string" }
            }
          },
          required: ["entities", "summary", "tags"]
        }
      });

      setAnalysisResult(res);
      if (onTagsGenerated && res.tags) onTagsGenerated(res.tags);
      if (onSummaryGenerated && res.summary) onSummaryGenerated(res.summary.brief);
      toast.success("AI 分析完成");
    } catch (error) {
      console.error("AI Analysis failed", error);
      toast.error("AI 分析失败");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleCreateTask = async (task) => {
    try {
      const newTask = await base44.entities.Task.create({
        title: task.title,
        description: task.description || `From Note Analysis`,
        status: "pending",
        priority: task.priority || "medium",
        reminder_time: new Date(new Date().setHours(9, 0, 0, 0) + 24 * 60 * 60 * 1000).toISOString(), // Tomorrow 9am default
        category: "work" // Default
      });
      toast.success("任务已创建！");
      if (onTaskCreated) onTaskCreated(newTask);
    } catch (error) {
      console.error("Create task failed", error);
      toast.error("创建任务失败");
    }
  };

  const EntityIcon = ({ type }) => {
    switch (type) {
      case "person": return <User className="w-3 h-3" />;
      case "location": return <MapPin className="w-3 h-3" />;
      case "url": return <Globe className="w-3 h-3" />;
      case "date": return <Calendar className="w-3 h-3" />;
      default: return <Sparkles className="w-3 h-3" />;
    }
  };

  return (
    <div className="mt-2">
      {!analysisResult ? (
        <Button
          variant="outline"
          size="sm"
          onClick={handleFullAnalysis}
          disabled={isAnalyzing}
          className="w-full bg-gradient-to-r from-indigo-50 to-purple-50 hover:from-indigo-100 hover:to-purple-100 border-indigo-100 text-indigo-700"
        >
          {isAnalyzing ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              正在深入分析内容...
            </>
          ) : (
            <>
              <BrainCircuit className="w-4 h-4 mr-2" />
              AI 智能分析与提取
            </>
          )}
        </Button>
      ) : (
        <div className="bg-slate-50/50 rounded-xl border border-slate-200 overflow-hidden">
            <div className="flex border-b border-slate-200 bg-white/50">
                <button 
                    onClick={() => setActiveTab("entities")}
                    className={`flex-1 py-2 text-xs font-medium flex items-center justify-center gap-1.5 ${activeTab === "entities" ? "text-indigo-600 bg-indigo-50/50" : "text-slate-500 hover:bg-slate-50"}`}
                >
                    <Sparkles className="w-3.5 h-3.5" />
                    实体 ({analysisResult.entities?.length || 0})
                </button>
                <button 
                    onClick={() => setActiveTab("summary")}
                    className={`flex-1 py-2 text-xs font-medium flex items-center justify-center gap-1.5 ${activeTab === "summary" ? "text-indigo-600 bg-indigo-50/50" : "text-slate-500 hover:bg-slate-50"}`}
                >
                    <List className="w-3.5 h-3.5" />
                    摘要
                </button>
                <button 
                    onClick={() => setActiveTab("tasks")}
                    className={`flex-1 py-2 text-xs font-medium flex items-center justify-center gap-1.5 ${activeTab === "tasks" ? "text-indigo-600 bg-indigo-50/50" : "text-slate-500 hover:bg-slate-50"}`}
                >
                    <CheckSquare className="w-3.5 h-3.5" />
                    转任务 ({analysisResult.potential_tasks?.length || 0})
                </button>
            </div>

            <div className="p-3 bg-white/30 min-h-[100px]">
                <AnimatePresence mode="wait">
                    {activeTab === "entities" && (
                        <motion.div 
                            key="entities"
                            initial={{ opacity: 0, y: 5 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -5 }}
                            className="space-y-2"
                        >
                            {analysisResult.entities && analysisResult.entities.length > 0 ? (
                                <div className="flex flex-wrap gap-2">
                                    {analysisResult.entities.map((entity, idx) => (
                                        <Badge key={idx} variant="outline" className="bg-white hover:bg-slate-50 gap-1.5 pl-2 pr-2.5 py-1">
                                            <span className={`p-1 rounded-full ${
                                                entity.type === 'person' ? 'bg-orange-100 text-orange-600' :
                                                entity.type === 'location' ? 'bg-green-100 text-green-600' :
                                                entity.type === 'url' ? 'bg-blue-100 text-blue-600' :
                                                'bg-purple-100 text-purple-600'
                                            }`}>
                                                <EntityIcon type={entity.type} />
                                            </span>
                                            <span className="text-slate-700">{entity.text}</span>
                                        </Badge>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-xs text-slate-400 text-center py-4">未发现特定实体</p>
                            )}
                        </motion.div>
                    )}

                    {activeTab === "summary" && (
                        <motion.div 
                            key="summary"
                            initial={{ opacity: 0, y: 5 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -5 }}
                            className="space-y-3"
                        >
                            <div className="bg-indigo-50/30 p-2.5 rounded-lg border border-indigo-100/50">
                                <p className="text-xs font-medium text-indigo-900 mb-1">智能总结</p>
                                <p className="text-sm text-slate-700 leading-relaxed">{analysisResult.summary?.brief}</p>
                            </div>
                            {analysisResult.summary?.points && (
                                <ul className="space-y-1.5">
                                    {analysisResult.summary.points.map((point, i) => (
                                        <li key={i} className="text-xs text-slate-600 flex gap-2">
                                            <span className="text-indigo-400">•</span>
                                            {point}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </motion.div>
                    )}

                    {activeTab === "tasks" && (
                        <motion.div 
                            key="tasks"
                            initial={{ opacity: 0, y: 5 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -5 }}
                            className="space-y-2"
                        >
                            {analysisResult.potential_tasks && analysisResult.potential_tasks.length > 0 ? (
                                analysisResult.potential_tasks.map((task, idx) => (
                                    <div key={idx} className="flex items-center justify-between p-2 bg-white border border-slate-100 rounded-lg hover:border-indigo-200 transition-colors group">
                                        <div className="flex-1 min-w-0 mr-2">
                                            <div className="flex items-center gap-2">
                                                <p className="text-sm font-medium text-slate-700 truncate">{task.title}</p>
                                                <Badge variant="secondary" className="text-[10px] px-1 h-4">
                                                    {task.priority}
                                                </Badge>
                                            </div>
                                            <p className="text-xs text-slate-400 truncate">{task.description}</p>
                                        </div>
                                        <Button 
                                            size="sm" 
                                            variant="ghost"
                                            onClick={() => handleCreateTask(task)}
                                            className="h-7 w-7 p-0 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-full"
                                            title="创建为任务"
                                        >
                                            <ArrowRight className="w-4 h-4" />
                                        </Button>
                                    </div>
                                ))
                            ) : (
                                <div className="text-center py-4">
                                    <p className="text-xs text-slate-400 mb-2">未识别出明显任务</p>
                                    <Button variant="link" size="sm" className="text-xs h-auto p-0 text-indigo-500">
                                        手动添加任务
                                    </Button>
                                </div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
            
            <div className="bg-slate-50 p-2 border-t border-slate-200 flex justify-end">
                 <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => setAnalysisResult(null)}
                    className="h-6 text-[10px] text-slate-400 hover:text-slate-600"
                >
                    重新分析
                </Button>
            </div>
        </div>
      )}
    </div>
  );
}