import React from "react";
import { Clock, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 从子约定的 description 中提取「⏱ 情境时间：xxx」「⚙️ 自动执行：xxx」备注,
 * 以及通过 tags 判断是否来自 AI 自动规划。
 * 在子约定行下方以小徽章形式渲染。
 */
function extractFromDescription(desc) {
  if (!desc || typeof desc !== "string") return { contextTime: null, autoExec: null };
  const contextMatch = desc.match(/⏱\s*情境时间[:：]\s*([^\n]+)/);
  const autoExecMatch = desc.match(/⚙️\s*自动执行[:：]\s*([^\n]+)/);
  return {
    contextTime: contextMatch ? contextMatch[1].trim() : null,
    autoExec: autoExecMatch ? autoExecMatch[1].trim() : null,
  };
}

export default function SubtaskContextBadges({ subtask, className }) {
  if (!subtask) return null;
  const { contextTime, autoExec } = extractFromDescription(subtask.description);
  const tags = subtask.tags || [];
  const hasAutoExecTag = tags.includes("AI自动执行");
  const hasTimelineTag = tags.includes("情境时间线");

  // 没有任何情境标记则不渲染
  if (!contextTime && !autoExec && !hasAutoExecTag && !hasTimelineTag) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5 mt-1", className)}>
      {contextTime && (
        <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-100">
          <Clock className="w-2.5 h-2.5" />
          情境时间 · {contextTime}
        </span>
      )}
      {(autoExec || hasAutoExecTag) && (
        <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-100">
          <Sparkles className="w-2.5 h-2.5" />
          {autoExec ? `自动执行 · ${autoExec}` : "自动执行"}
        </span>
      )}
    </div>
  );
}