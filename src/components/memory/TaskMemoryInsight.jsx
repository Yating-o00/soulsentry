import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { motion, AnimatePresence } from "framer-motion";
import { Brain, Loader2, ChevronDown, ChevronUp, Sparkles, TrendingUp, AlertTriangle, Clock } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

export default function TaskMemoryInsight({ task }) {
  const [expanded, setExpanded] = useState(false);
  const [insight, setInsight] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleGenerate = async (e) => {
    e.stopPropagation();
    if (insight) {
      setExpanded(!expanded);
      return;
    }
    setLoading(true);
    setExpanded(true);
    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `你是一个智能记忆助手。请基于以下约定信息，生成简短的记忆洞察（3句话以内）。

约定标题: ${task.title}
描述: ${task.description || "无"}
分类: ${task.category || "其他"}
优先级: ${task.priority || "中"}
状态: ${task.status}
创建时间: ${task.created_date}
提醒时间: ${task.reminder_time || "未设置"}
完成时间: ${task.completed_at || "未完成"}
标签: ${(task.tags || []).join(", ") || "无"}
子任务数: ${task.parent_task_id ? "这是子任务" : "主任务"}

请从以下维度分析：
1. 时间模式：这个约定的时间安排是否合理？
2. 执行建议：基于优先级和截止时间给出行动建议
3. 关联洞察：这类约定的规律性特征

返回JSON格式`,
        response_json_schema: {
          type: "object",
          properties: {
            pattern: { type: "string", description: "时间/行为模式观察" },
            suggestion: { type: "string", description: "执行建议" },
            risk: { type: "string", description: "风险提示，如果没有则返回空字符串" },
          }
        }
      });
      setInsight(result);
    } catch (err) {
      console.error("Memory insight failed:", err);
      setInsight({ pattern: "分析暂时不可用", suggestion: "请稍后重试", risk: "" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-2" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={handleGenerate}
        className="flex items-center gap-1.5 text-[11px] text-[#384877] font-medium hover:text-[#2c3a63] transition-colors px-2 py-1 rounded-lg hover:bg-[#384877]/5"
      >
        <Brain className="w-3.5 h-3.5" />
        {loading ? "分析中..." : insight ? "记忆洞察" : "AI 记忆洞察"}
        {insight && (expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            {loading ? (
              <div className="flex items-center gap-2 mt-2 p-3 bg-[#384877]/5 rounded-xl">
                <Loader2 className="w-4 h-4 text-[#384877] animate-spin" />
                <span className="text-xs text-[#384877]">正在生成记忆洞察...</span>
              </div>
            ) : insight ? (
              <div className="mt-2 p-3 bg-gradient-to-r from-[#384877]/5 to-purple-50/30 rounded-xl border border-[#384877]/10 space-y-1.5">
                {insight.pattern && (
                  <div className="flex items-start gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-[#384877] mt-0.5 flex-shrink-0" />
                    <p className="text-[11px] text-slate-700 leading-relaxed">{insight.pattern}</p>
                  </div>
                )}
                {insight.suggestion && (
                  <div className="flex items-start gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-purple-500 mt-0.5 flex-shrink-0" />
                    <p className="text-[11px] text-slate-600 leading-relaxed">{insight.suggestion}</p>
                  </div>
                )}
                {insight.risk && (
                  <div className="flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
                    <p className="text-[11px] text-amber-700 leading-relaxed">{insight.risk}</p>
                  </div>
                )}
              </div>
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}