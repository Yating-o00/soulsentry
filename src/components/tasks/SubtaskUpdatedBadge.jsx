import React from "react";
import { RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";

const WINDOW_MS = 24 * 60 * 60 * 1000;

/** 判断子约定近期是否被更新过（创建后又发生过修改，且在 24 小时内） */
export function isSubtaskUpdated(subtask) {
  if (!subtask?.updated_date || !subtask?.created_date) return false;
  const updated = new Date(subtask.updated_date).getTime();
  const created = new Date(subtask.created_date).getTime();
  if (updated - created < 60 * 1000) return false;
  return Date.now() - updated < WINDOW_MS;
}

/** 子约定「有更新」标识 */
export default function SubtaskUpdatedBadge({ subtask }) {
  if (!isSubtaskUpdated(subtask)) return null;
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-medium whitespace-nowrap">
      <RefreshCw className="w-2.5 h-2.5" />
      有更新 ·{" "}
      {formatDistanceToNow(new Date(subtask.updated_date), { addSuffix: true, locale: zhCN })}
    </span>
  );
}