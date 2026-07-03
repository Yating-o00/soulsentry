import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { extractTerms, scoreText } from "./relatedKnowledgeMatcher";
import { StickyNote, CheckCircle2, BrainCircuit, ChevronDown } from "lucide-react";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";

function stripHtml(html) {
  return (html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function RelatedItem({ icon: Icon, iconClass, title, date, snippet, fullText }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setExpanded(!expanded)}
      className="w-full text-left bg-white rounded-lg border border-slate-200 hover:border-indigo-300 transition-colors p-2.5"
    >
      <div className="flex items-center gap-2">
        <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${iconClass}`} />
        <span className="text-xs font-medium text-slate-700 truncate flex-1">{title}</span>
        <span className="text-[10px] text-slate-400 flex-shrink-0">{date}</span>
        <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </div>
      <p className={`text-[11px] text-slate-500 mt-1 leading-relaxed whitespace-pre-wrap ${expanded ? "" : "line-clamp-2"}`}>
        {expanded ? fullText : snippet}
      </p>
    </button>
  );
}

export default function RelatedKnowledgePanel({ task }) {
  const { data: notes = [] } = useQuery({
    queryKey: ["related-knowledge-notes"],
    queryFn: () => base44.entities.Note.list("-created_date", 200),
    staleTime: 5 * 60 * 1000,
  });
  const { data: pastTasks = [] } = useQuery({
    queryKey: ["related-knowledge-tasks"],
    queryFn: () => base44.entities.Task.filter({ status: "completed" }, "-completed_at", 200),
    staleTime: 5 * 60 * 1000,
  });

  const matches = useMemo(() => {
    if (!task) return [];
    const terms = extractTerms(`${task.title || ""} ${(task.tags || []).join(" ")}`);
    if (terms.length === 0) return [];

    const noteMatches = notes
      .filter((n) => !n.deleted_at)
      .map((n) => {
        const text = n.plain_text || stripHtml(n.content);
        const score = scoreText(terms, `${text} ${(n.tags || []).join(" ")}`);
        return { type: "note", score, item: n, text };
      });

    const taskMatches = pastTasks
      .filter((t) => !t.deleted_at && t.id !== task.id && !t.parent_task_id)
      .map((t) => {
        const text = `${t.title || ""} ${t.description || ""}`;
        return { type: "task", score: scoreText(terms, text), item: t, text };
      });

    return [...noteMatches, ...taskMatches]
      .filter((m) => m.score >= 2)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);
  }, [task?.id, task?.title, notes, pastTasks]);

  if (matches.length === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-r from-indigo-50/60 to-slate-50 border border-indigo-100 rounded-xl p-3"
      >
        <div className="flex items-center gap-1.5 mb-2">
          <BrainCircuit className="w-3.5 h-3.5 text-indigo-500" />
          <span className="text-xs font-semibold text-indigo-900">相关知识</span>
          <span className="text-[10px] text-slate-400">根据内容自动关联的历史记录</span>
        </div>
        <div className="space-y-1.5">
          {matches.map((m) =>
            m.type === "note" ? (
              <RelatedItem
                key={`n-${m.item.id}`}
                icon={StickyNote}
                iconClass="text-amber-500"
                title={m.item.ai_analysis?.summary || m.text.slice(0, 30) || "心签"}
                date={m.item.created_date ? format(new Date(m.item.created_date), "yyyy-MM-dd") : ""}
                snippet={m.text.slice(0, 120)}
                fullText={m.text}
              />
            ) : (
              <RelatedItem
                key={`t-${m.item.id}`}
                icon={CheckCircle2}
                iconClass="text-emerald-500"
                title={`已完成：${m.item.title}`}
                date={m.item.completed_at ? format(new Date(m.item.completed_at), "yyyy-MM-dd") : ""}
                snippet={(m.item.description || m.item.ai_analysis?.status_summary || "过往完成的相似约定").slice(0, 120)}
                fullText={`${m.item.description || ""}\n${m.item.ai_analysis?.status_summary || ""}`.trim() || m.item.title}
              />
            )
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}