import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Sparkles, Clock, Loader2, TrendingUp, Brain } from "lucide-react";
import { format, parseISO } from "date-fns";
import { zhCN } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

export default function SmartReminderSuggestion({ task, onApply }) {
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);

  React.useEffect(() => {
    analyzeBehavior();
  }, []);

  const analyzeBehavior = async () => {
    setAnalyzing(true);
    setLoading(true);

    try {
      // 获取用户行为数据
      const behaviors = await base44.entities.UserBehavior.list('-created_date', 100);
      
      // 使用 AI 分析最佳提醒时间
      const prompt = `你是一个时间管理专家。分析用户的约定完成行为数据，为新约定推荐最佳的提醒时间。

约定信息：
- 标题：${task.title}
- 描述：${task.description || '无'}
- 类别：${task.category}
- 优先级：${task.priority}
- 原计划时间：${task.reminder_time ? format(new Date(task.reminder_time), 'yyyy-MM-dd HH:mm', { locale: zhCN }) : '未设置'}

用户历史行为数据（最近100条）：
${behaviors.length > 0 ? behaviors.map(b => `
- 事件类型：${b.event_type}
- 类别：${b.category || '未知'}
- 时间：${b.hour_of_day}点，星期${b.day_of_week}
- 响应时间：${b.response_time_seconds ? Math.round(b.response_time_seconds / 60) + '分钟' : '未知'}
`).join('\n') : '暂无历史数据'}

请分析：
1. 用户在什么时间段对该类别约定响应最快？
2. 用户在哪天完成该类别约定效率最高？
3. 考虑约定优先级，推荐3个最佳提醒时间。**注意：推荐的时间必须晚于当前时间（${new Date().toISOString()}），严禁推荐过去的时间。**
4. 给出推荐理由

当前时间：${new Date().toISOString()}`;

      const analysis = await base44.integrations.Core.InvokeLLM({
        prompt,
        response_json_schema: {
          type: "object",
          properties: {
            optimal_time_slot: {
              type: "string",
              description: "最佳时间段（如：早上9-11点）"
            },
            best_day_pattern: {
              type: "string",
              description: "最佳日期模式（如：工作日、周末等）"
            },
            suggestions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  datetime: {
                    type: "string",
                    description: "建议的提醒时间（ISO格式）"
                  },
                  reason: {
                    type: "string",
                    description: "推荐理由"
                  },
                  confidence: {
                    type: "string",
                    enum: ["high", "medium", "low"],
                    description: "推荐置信度"
                  }
                }
              },
              minItems: 3,
              maxItems: 3
            },
            insights: {
              type: "array",
              items: {
                type: "string"
              },
              description: "用户行为洞察"
            }
          }
        }
      });

      setSuggestions(analysis);
      toast.success("AI 分析完成");
    } catch (error) {
      console.error("Analysis error:", error);
      toast.error("分析失败，请重试");
    }

    setLoading(false);
    setAnalyzing(false);
  };

  const handleApplySuggestion = (datetime) => {
    onApply(datetime);
    toast.success("已应用智能推荐时间");
  };

  const getConfidenceColor = (confidence) => {
    switch (confidence) {
      case "high":
        return "bg-green-100 text-green-700 border-green-300";
      case "medium":
        return "bg-yellow-100 text-yellow-700 border-yellow-300";
      case "low":
        return "bg-orange-100 text-orange-700 border-orange-300";
      default:
        return "bg-slate-100 text-slate-700 border-slate-300";
    }
  };

  const getConfidenceLabel = (confidence) => {
    switch (confidence) {
      case "high":
        return "高度推荐";
      case "medium":
        return "推荐";
      case "low":
        return "可选";
      default:
        return "建议";
    }
  };

  return (
    <Card className="border-2 border-purple-200 bg-gradient-to-br from-purple-50 to-blue-50 p-4">
      <div className="flex items-start gap-3 mb-3">
        <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center flex-shrink-0">
          <Brain className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-slate-800 mb-1 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-600" />
            AI 智能提醒建议
          </h3>
          <p className="text-sm text-slate-600">
            基于您的历史行为数据，AI 为您推荐最佳提醒时间
          </p>
        </div>
      </div>

      {!suggestions && !loading && (
        <Button
          onClick={analyzeBehavior}
          disabled={loading}
          className="w-full bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-white"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              分析中...
            </>
          ) : (
            <>
              <Brain className="w-4 h-4 mr-2" />
              获取智能推荐
            </>
          )}
        </Button>
      )}

      <AnimatePresence>
        {analyzing && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-3 space-y-2"
          >
            <div className="flex items-center gap-2 text-sm text-purple-600">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>AI 正在分析您的使用习惯...</span>
            </div>
            <div className="space-y-1 text-xs text-slate-500">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
                分析约定类型和优先级
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                评估历史完成率
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
                生成个性化建议
              </div>
            </div>
          </motion.div>
        )}

        {suggestions && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 space-y-4"
          >
            {/* 洞察卡片 */}
            {suggestions.insights && suggestions.insights.length > 0 && (
              <div className="bg-white rounded-lg p-3 border border-purple-200">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-4 h-4 text-purple-600" />
                  <span className="text-sm font-semibold text-slate-800">行为洞察</span>
                </div>
                <ul className="space-y-1 text-xs text-slate-600">
                  {suggestions.insights.map((insight, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-purple-500 mt-0.5">•</span>
                      <span>{insight}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* 推荐时间 */}
            <div className="space-y-2">
              <div className="text-sm font-semibold text-slate-800 mb-2">推荐提醒时间</div>
              {suggestions.suggestions.map((suggestion, idx) => {
                const datetime = parseISO(suggestion.datetime);
                return (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    className="bg-white rounded-lg p-3 border-2 border-purple-200 hover:border-purple-400 transition-all group cursor-pointer"
                    onClick={() => handleApplySuggestion(suggestion.datetime)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Clock className="w-4 h-4 text-purple-600" />
                          <span className="font-semibold text-slate-800">
                            {format(datetime, "M月d日 EEEE HH:mm", { locale: zhCN })}
                          </span>
                          <Badge className={`text-xs ${getConfidenceColor(suggestion.confidence)}`}>
                            {getConfidenceLabel(suggestion.confidence)}
                          </Badge>
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed">
                          {suggestion.reason}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="opacity-0 group-hover:opacity-100 transition-opacity bg-purple-100 hover:bg-purple-200 text-purple-700"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleApplySuggestion(suggestion.datetime);
                        }}
                      >
                        应用
                      </Button>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={analyzeBehavior}
              className="w-full border-purple-300 text-purple-600 hover:bg-purple-50"
            >
              重新分析
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}