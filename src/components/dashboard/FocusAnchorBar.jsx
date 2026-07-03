import React, { useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { extractTerms, scoreText } from "@/components/knowledge/relatedKnowledgeMatcher";
import { Crosshair, StickyNote, Clock, ChevronRight } from "lucide-react";
import { format, parseISO } from "date-fns";
import { motion } from "framer-motion";

function stripHtml(html) {
  return (html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

const PRIO = { urgent: 0, high: 1, medium: 2, low: 3 };

// 选取当下最应该专注的约定：
// 进行中 > 正处于时间窗口内 > 即将开始（就近） > 今天已过时间未处理 > 全天任务（按优先级）
function pickFocus(tasks) {
  const now = new Date();
  const candidates = (tasks || []).filter(
    (t) => t.status === "in_progress" || t.status === "pending"
  );
  if (candidates.length === 0) return null;

  const byPrioThenTime = (a, b) =>
    (PRIO[a.priority] ?? 2) - (PRIO[b.priority] ?? 2) ||
    new Date(a.reminder_time || 0) - new Date(b.reminder_time || 0);

  const inProgress = candidates.filter((t) => t.status === "in_progress");
  if (inProgress.length > 0) {
    return { task: inProgress.sort(byPrioThenTime)[0], label: "进行中" };
  }

  // 有具体时刻的任务优先，避免全天/跨天背景任务抢占锚点
  const timed = candidates.filter((t) => t.reminder_time && !t.is_all_day);

  const ongoing = timed.filter((t) => {
    const start = parseISO(t.reminder_time);
    const end = t.end_time ? parseISO(t.end_time) : start;
    return start <= now && now <= end;
  });
  if (ongoing.length > 0) {
    return { task: ongoing.sort(byPrioThenTime)[0], label: "进行中" };
  }

  const upcoming = timed
    .filter((t) => parseISO(t.reminder_time) > now)
    .sort(
      (a, b) =>
        parseISO(a.reminder_time) - parseISO(b.reminder_time) ||
        (PRIO[a.priority] ?? 2) - (PRIO[b.priority] ?? 2)
    );
  if (upcoming.length > 0) {
    return { task: upcoming[0], label: "即将开始" };
  }

  const missed = timed.filter((t) => {
    const start = parseISO(t.reminder_time);
    const end = t.end_time ? parseISO(t.end_time) : start;
    return end < now;
  });
  if (missed.length > 0) {
    return { task: missed.sort(byPrioThenTime)[0], label: "已过时间，待处理" };
  }

  return { task: candidates.sort(byPrioThenTime)[0], label: "今日待办" };
}

// 当前专注锚点：串联今日最优先的约定与其相关心签，一点即达
export default function FocusAnchorBar({ tasks, onTaskClick }) {
  const focus = useMemo(() => pickFocus(tasks), [tasks]);
  const focusTask = focus?.task;

  const { data: notes = [] } = useQuery({
    queryKey: ["related-knowledge-notes"],
    queryFn: () => base44.entities.Note.list("-created_date", 200),
    staleTime: 5 * 60 * 1000,
    enabled: !!focusTask,
  });

  const relatedNotes = useMemo(() => {
    if (!focusTask) return [];
    const terms = extractTerms(
      `${focusTask.title || ""} ${(focusTask.tags || []).join(" ")}`
    );
    if (terms.length === 0) return [];
    // 相关度阈值随关键词数量提升，避免仅命中 1-2 个通用词就误判为相关
    const minScore = Math.min(4, Math.max(2, Math.ceil(terms.length * 0.3)));
    return notes
      .filter((n) => !n.deleted_at)
      .map((n) => {
        const text = n.plain_text || stripHtml(n.content);
        return { note: n, text, score: scoreText(terms, `${text} ${(n.tags || []).join(" ")}`) };
      })
      .filter((m) => m.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, 2);
  }, [focusTask?.id, notes]);

  if (!focusTask) return null;

  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={() => onTaskClick(focusTask)}
      className="w-full text-left bg-gradient-to-r from-[#384877] to-[#3b5aa2] rounded-2xl p-4 shadow-lg shadow-[#384877]/20 hover:shadow-xl transition-shadow group"
    >
      <div className="flex items-center gap-2 mb-1.5">
        <Crosshair className="w-3.5 h-3.5 text-blue-200" />
        <span className="text-[11px] font-semibold text-blue-200 uppercase tracking-wider">当前专注锚点</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/15 text-blue-100">
          {focus.label}
        </span>
        {focusTask.reminder_time && (
          <span className="ml-auto flex items-center gap-1 text-[11px] text-blue-200">
            <Clock className="w-3 h-3" />
            {format(parseISO(focusTask.reminder_time), "HH:mm")}
            {focusTask.end_time && ` - ${format(parseISO(focusTask.end_time), "HH:mm")}`}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <h3 className="text-white font-bold text-base md:text-lg truncate flex-1">
          {focusTask.title}
        </h3>
        <ChevronRight className="w-4 h-4 text-blue-200 group-hover:translate-x-1 transition-transform flex-shrink-0" />
      </div>
      {relatedNotes.length > 0 && (
        <div className="mt-2.5 flex flex-col gap-1.5">
          {relatedNotes.map((m) => (
            <div
              key={m.note.id}
              className="flex items-center gap-1.5 bg-white/10 rounded-lg px-2.5 py-1.5"
            >
              <StickyNote className="w-3 h-3 text-amber-300 flex-shrink-0" />
              <span className="text-[11px] text-blue-50 truncate">
                {m.note.ai_analysis?.summary || m.text.slice(0, 60)}
              </span>
            </div>
          ))}
          <span className="text-[10px] text-blue-300 pl-0.5">已自动关联 {relatedNotes.length} 条相关心签，点击查看详情</span>
        </div>
      )}
    </motion.button>
  );
}