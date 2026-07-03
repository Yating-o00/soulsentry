import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { invokeAI } from "@/components/utils/aiHelper";
import { extractTerms, scoreText } from "@/components/knowledge/relatedKnowledgeMatcher";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { format } from "date-fns";

// 动作召唤器：将搜索词作为 AI 命令，横跨约定/心签/执行记录动态聚合分析
export default function AICommandRunner({ query }) {
  const [running, setRunning] = useState(false);
  const [answer, setAnswer] = useState(null);

  useEffect(() => {
    setAnswer(null);
  }, [query]);

  const run = async () => {
    setRunning(true);
    setAnswer(null);
    try {
      const terms = extractTerms(query);
      const [tasks, notes, executions] = await Promise.all([
        base44.entities.Task.list("-updated_date", 300),
        base44.entities.Note.list("-created_date", 200),
        base44.entities.TaskExecution.list("-created_date", 100).catch(() => []),
      ]);

      const pick = (items, toText, limit) =>
        items
          .map((i) => ({ i, score: scoreText(terms, toText(i)) }))
          .filter((m) => m.score >= 1)
          .sort((a, b) => b.score - a.score)
          .slice(0, limit)
          .map((m) => m.i);

      const topTasks = pick(
        tasks.filter((t) => !t.deleted_at),
        (t) => `${t.title} ${t.description || ""} ${(t.tags || []).join(" ")}`,
        15
      );
      const topNotes = pick(
        notes.filter((n) => !n.deleted_at),
        (n) => `${n.plain_text || ""} ${(n.tags || []).join(" ")}`,
        10
      );
      const topExecs = pick(executions, (e) => `${e.task_title} ${e.original_input || ""}`, 5);

      const context = [
        "【约定记录】",
        ...topTasks.map(
          (t) =>
            `- ${t.title}｜状态:${t.status}｜优先级:${t.priority}｜时间:${
              t.reminder_time ? format(new Date(t.reminder_time), "yyyy-MM-dd HH:mm") : "无"
            }${t.completed_at ? `｜完成于:${format(new Date(t.completed_at), "yyyy-MM-dd")}` : ""}${
              t.description ? `｜描述:${t.description.slice(0, 100)}` : ""
            }`
        ),
        "【心签笔记】",
        ...topNotes.map(
          (n) =>
            `- [${format(new Date(n.created_date), "yyyy-MM-dd")}] ${(n.plain_text || "").slice(0, 150)}`
        ),
        "【AI 执行记录】",
        ...topExecs.map((e) => `- ${e.task_title}｜状态:${e.execution_status}`),
      ].join("\n");

      const res = await invokeAI({
        prompt: `你是 SoulSentry 的个人认知助手。用户在全局搜索中发出了一个命令，请基于下方从用户个人数据库中检索到的真实数据，直接执行该命令并给出结论。

用户命令：${query}

检索到的相关数据：
${context}

要求：
1. 直接给出分析结果或聚合报告，不要复述命令。
2. 用简体中文，markdown 格式，简洁有条理（标题+要点）。
3. 如数据不足以完整回答，指出缺少什么，并基于现有数据给出最大程度的结论。`,
      });

      setAnswer(typeof res === "string" ? res : JSON.stringify(res));
    } catch (e) {
      console.error(e);
      toast.error(e.message || "AI 分析失败，请重试");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="mx-2 mt-2 rounded-xl border border-indigo-100 bg-gradient-to-r from-indigo-50/60 to-blue-50/40 p-3">
      {!answer && (
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="w-4 h-4 text-indigo-500 flex-shrink-0" />
            <span className="text-xs text-slate-600 truncate">
              把「{query}」作为命令，让 AI 横跨约定、心签、执行记录聚合分析
            </span>
          </div>
          <Button
            size="sm"
            onClick={run}
            disabled={running}
            className="h-7 text-xs bg-indigo-600 hover:bg-indigo-700 text-white flex-shrink-0"
          >
            {running ? (
              <>
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                分析中...
              </>
            ) : (
              "AI 召唤"
            )}
          </Button>
        </div>
      )}
      {answer && (
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
            <span className="text-xs font-semibold text-indigo-900">AI 聚合分析</span>
          </div>
          <ReactMarkdown className="prose prose-sm max-w-none text-[13px] text-slate-700 prose-headings:text-sm prose-headings:font-semibold prose-p:my-1.5 prose-ul:my-1.5 prose-li:my-0.5">
            {answer}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}