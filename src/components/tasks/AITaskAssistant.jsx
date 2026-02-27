import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Loader2, Lightbulb, TrendingUp, Clock, MapPin, Users, AlertTriangle, CheckCircle2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function AITaskAssistant({ task, onApplySuggestion }) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [suggestions, setSuggestions] = useState(null);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    // Auto-analyze on mount if task is not completed
    if (task && task.status !== 'completed' && !suggestions) {
      analyzeTasks();
    }
  }, [task?.id]);

  const analyzeTasks = async () => {
    if (!task) return;

    setIsAnalyzing(true);
    try {
      const now = new Date().toISOString();
      const reminderTime = task.reminder_time ? new Date(task.reminder_time).toISOString() : now;
      
      // Get user context for personalization
      const [userBehavior, recentTasks, userProfile] = await Promise.all([
        base44.entities.UserBehavior.list('-created_date', 5).catch(() => []),
        base44.entities.Task.filter({ status: 'completed' }, '-completed_at', 10).catch(() => []),
        base44.auth.me().catch(() => null)
      ]);

      const response = await base44.integrations.Core.InvokeLLM({
        prompt: `你是一个智能约定助手，帮助用户更高效地完成约定。请对以下约定进行多维度深度分析，并提供可操作的建议。

当前约定:
- 标题: ${task.title}
- 描述: ${task.description || '无'}
- 类别: ${task.category}
- 优先级: ${task.priority}
- 提醒时间: ${reminderTime}
- 状态: ${task.status}
${task.location_reminder?.enabled ? `- 地点提醒: ${task.location_reminder.location_name}` : ''}

当前时间: ${now}

用户历史数据:
- 最近完成的约定: ${recentTasks.map(t => t.title).slice(0, 3).join(', ')}
- 常见类别: ${userBehavior.map(b => b.category).filter(Boolean).slice(0, 3).join(', ')}

分析维度:
1. **完成建议** (completion_tips): 3-5个具体的执行步骤或技巧，帮助用户高效完成此约定
2. **时间优化** (time_optimization): 基于约定性质和用户习惯，建议最佳执行时间段和原因
3. **潜在阻碍** (blockers): 可能遇到的困难和解决方案
4. **协作建议** (collaboration): 如果涉及他人，建议如何沟通协作
5. **资源准备** (resources_needed): 完成此约定需要准备的工具、信息或材料
6. **下一步行动** (next_actions): 当前应该立即做的 1-2 件事
7. **智能提醒** (smart_reminder): 除了时间，是否建议基于地点、天气、状态等其他触发条件
8. **效率提升** (efficiency_tips): 如何更快更好地完成
9. **优先级建议** (priority_adjustment): 是否应该调整优先级及原因

返回格式要求:
- 所有建议必须具体、可操作，避免空泛的建议
- 基于约定的实际内容和类别提供针对性建议
- 考虑当前时间和截止时间的紧迫性
- 所有文本必须使用简体中文`,
        response_json_schema: {
          type: "object",
          properties: {
            completion_tips: {
              type: "array",
              items: { type: "string" },
              description: "完成约定的具体步骤和技巧"
            },
            time_optimization: {
              type: "object",
              properties: {
                best_time_slot: { type: "string" },
                reasoning: { type: "string" },
                duration_estimate: { type: "string" }
              }
            },
            blockers: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  issue: { type: "string" },
                  solution: { type: "string" }
                }
              }
            },
            collaboration: {
              type: "object",
              properties: {
                should_involve_others: { type: "boolean" },
                suggested_collaborators: { type: "array", items: { type: "string" } },
                communication_tips: { type: "string" }
              }
            },
            resources_needed: {
              type: "array",
              items: { type: "string" }
            },
            next_actions: {
              type: "array",
              items: { type: "string" },
              maxItems: 2
            },
            smart_reminder: {
              type: "object",
              properties: {
                type: { type: "string", enum: ["time", "location", "weather", "status", "combined"] },
                suggestion: { type: "string" },
                enabled: { type: "boolean" }
              }
            },
            efficiency_tips: {
              type: "array",
              items: { type: "string" }
            },
            priority_adjustment: {
              type: "object",
              properties: {
                should_adjust: { type: "boolean" },
                new_priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
                reasoning: { type: "string" }
              }
            },
            overall_confidence: {
              type: "number",
              minimum: 0,
              maximum: 100,
              description: "AI对建议质量的置信度(0-100)"
            }
          },
          required: ["completion_tips", "next_actions", "efficiency_tips"]
        }
      });

      setSuggestions(response);
      setShowSuggestions(true);
    } catch (error) {
      console.error("AI分析失败:", error);
      toast.error("AI分析失败");
    }
    setIsAnalyzing(false);
  };

  const applySuggestion = (type, data) => {
    if (onApplySuggestion) {
      onApplySuggestion(type, data);
    }
    toast.success("已应用建议");
  };

  if (!task) return null;

  return (
    <div className="space-y-3">
      {!showSuggestions && !isAnalyzing && (
        <Button
          variant="outline"
          size="sm"
          onClick={analyzeTasks}
          className="w-full border-blue-200 bg-blue-50/50 text-blue-700 hover:bg-blue-100"
        >
          <Sparkles className="w-4 h-4 mr-2" />
          AI智能助手
        </Button>
      )}

      {isAnalyzing && (
        <div className="flex items-center justify-center py-4 text-sm text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin mr-2" />
          AI正在分析约定...
        </div>
      )}

      <AnimatePresence>
        {showSuggestions && suggestions && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-3"
          >
            {/* Next Actions - Most Important */}
            {suggestions.next_actions?.length > 0 && (
              <div className="bg-gradient-to-r from-blue-50 to-cyan-50 rounded-xl p-3 border border-blue-200">
                <div className="flex items-start gap-2 mb-2">
                  <CheckCircle2 className="w-4 h-4 text-blue-600 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-xs font-bold text-blue-900 mb-1">立即行动</p>
                    <div className="space-y-1">
                      {suggestions.next_actions.map((action, idx) => (
                        <div key={idx} className="flex items-start gap-2 text-xs text-blue-800">
                          <span className="font-bold">{idx + 1}.</span>
                          <span>{action}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Completion Tips */}
            {suggestions.completion_tips?.length > 0 && (
              <div className="bg-white rounded-xl p-3 border border-slate-200">
                <div className="flex items-start gap-2">
                  <Lightbulb className="w-4 h-4 text-amber-500 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-xs font-bold text-slate-700 mb-2">完成建议</p>
                    <div className="space-y-1.5">
                      {suggestions.completion_tips.map((tip, idx) => (
                        <div key={idx} className="flex items-start gap-2 text-xs text-slate-600">
                          <div className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 flex-shrink-0" />
                          <span className="leading-relaxed">{tip}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Time Optimization */}
            {suggestions.time_optimization && (
              <div className="bg-purple-50 rounded-xl p-3 border border-purple-200">
                <div className="flex items-start gap-2">
                  <Clock className="w-4 h-4 text-purple-600 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-xs font-bold text-purple-900 mb-1">时间优化</p>
                    <div className="space-y-1 text-xs text-purple-800">
                      <p className="font-medium">{suggestions.time_optimization.best_time_slot}</p>
                      <p className="opacity-80">{suggestions.time_optimization.reasoning}</p>
                      {suggestions.time_optimization.duration_estimate && (
                        <Badge variant="outline" className="text-xs border-purple-300 bg-purple-100 text-purple-700">
                          预计用时: {suggestions.time_optimization.duration_estimate}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Blockers & Solutions */}
            {suggestions.blockers?.length > 0 && (
              <div className="bg-red-50 rounded-xl p-3 border border-red-200">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-xs font-bold text-red-900 mb-2">潜在阻碍</p>
                    <div className="space-y-2">
                      {suggestions.blockers.map((blocker, idx) => (
                        <div key={idx} className="text-xs">
                          <p className="font-medium text-red-800 mb-0.5">⚠️ {blocker.issue}</p>
                          <p className="text-red-700 opacity-90 pl-4">✓ {blocker.solution}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Resources Needed */}
            {suggestions.resources_needed?.length > 0 && (
              <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
                <div className="flex items-start gap-2">
                  <TrendingUp className="w-4 h-4 text-slate-600 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-xs font-bold text-slate-700 mb-2">需要准备</p>
                    <div className="flex flex-wrap gap-1.5">
                      {suggestions.resources_needed.map((resource, idx) => (
                        <Badge key={idx} variant="outline" className="text-xs bg-white border-slate-300 text-slate-700">
                          {resource}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Efficiency Tips */}
            {suggestions.efficiency_tips?.length > 0 && (
              <div className="bg-green-50 rounded-xl p-3 border border-green-200">
                <div className="flex items-start gap-2">
                  <Sparkles className="w-4 h-4 text-green-600 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-xs font-bold text-green-900 mb-2">效率提升</p>
                    <div className="space-y-1">
                      {suggestions.efficiency_tips.map((tip, idx) => (
                        <div key={idx} className="flex items-start gap-2 text-xs text-green-800">
                          <span className="text-green-500">⚡</span>
                          <span>{tip}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Collaboration */}
            {suggestions.collaboration?.should_involve_others && (
              <div className="bg-indigo-50 rounded-xl p-3 border border-indigo-200">
                <div className="flex items-start gap-2">
                  <Users className="w-4 h-4 text-indigo-600 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-xs font-bold text-indigo-900 mb-1">协作建议</p>
                    <p className="text-xs text-indigo-800 mb-2">{suggestions.collaboration.communication_tips}</p>
                    {suggestions.collaboration.suggested_collaborators?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {suggestions.collaboration.suggested_collaborators.map((person, idx) => (
                          <Badge key={idx} variant="outline" className="text-xs bg-indigo-100 border-indigo-300 text-indigo-700">
                            {person}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Priority Adjustment */}
            {suggestions.priority_adjustment?.should_adjust && (
              <div className="bg-amber-50 rounded-xl p-3 border border-amber-200">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-xs font-bold text-amber-900 mb-1">优先级建议</p>
                    <p className="text-xs text-amber-800 mb-2">{suggestions.priority_adjustment.reasoning}</p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => applySuggestion('priority', suggestions.priority_adjustment.new_priority)}
                      className="h-7 text-xs border-amber-300 bg-amber-100 text-amber-700 hover:bg-amber-200"
                    >
                      调整为: {suggestions.priority_adjustment.new_priority === 'urgent' ? '紧急' : 
                                suggestions.priority_adjustment.new_priority === 'high' ? '高' :
                                suggestions.priority_adjustment.new_priority === 'medium' ? '中' : '低'}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Smart Reminder */}
            {suggestions.smart_reminder?.enabled && (
              <div className="bg-cyan-50 rounded-xl p-3 border border-cyan-200">
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-cyan-600 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-xs font-bold text-cyan-900 mb-1">智能提醒建议</p>
                    <p className="text-xs text-cyan-800 mb-2">{suggestions.smart_reminder.suggestion}</p>
                    <Badge className="text-xs bg-cyan-600 text-white">
                      {suggestions.smart_reminder.type === 'location' ? '📍 地点触发' :
                       suggestions.smart_reminder.type === 'weather' ? '🌤️ 天气触发' :
                       suggestions.smart_reminder.type === 'combined' ? '🔗 组合触发' : '⏰ 时间触发'}
                    </Badge>
                  </div>
                </div>
              </div>
            )}

            {/* Confidence Score */}
            {suggestions.overall_confidence && (
              <div className="text-center py-2">
                <p className="text-xs text-slate-400">
                  AI置信度: {suggestions.overall_confidence}%
                </p>
              </div>
            )}

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowSuggestions(false)}
              className="w-full text-xs text-slate-500 hover:text-slate-700"
            >
              收起建议
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}