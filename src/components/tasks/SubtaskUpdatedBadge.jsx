import React from "react";
import { RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { parseServerDate } from "@/lib/serverTime";

const WINDOW_MS = 24 * 60 * 60 * 1000;

/** 判断子约定近期是否被更新过（创建后又发生过修改，且在 24 小时内） */
export function isSubtaskUpdated(subtask) {
  if (!subtask?.updated_date || !subtask?.created_date) return false;
  const updated = parseServerDate(subtask.updated_date).getTime();
  const created = parseServerDate(subtask.created_date).getTime();
  if (updated - created < 60 * 1000) return false;
  return Date.now() - updated < WINDOW_MS;
}

/** 依据变更记录生成具体的更新描述 */
function describeChange(log, subtask) {
  if (!log) {
    return subtask?.status === "completed" ? "已完成" : "内容有修改";
  }
  const details = Array.isArray(log.changes_detail) ? log.changes_detail : [];
  const statusChange = details.find((d) => d.field === "status");

  if (log.change_type === "subtask_deleted" || log.change_type === "deleted") return "已删除";
  if (statusChange) {
    if (statusChange.new_value === "已完成") return "已完成";
    if (statusChange.old_value === "已完成") return "取消完成";
    return `状态改为「${statusChange.new_value}」`;
  }
  if (details.length > 0) {
    const labels = details.map((d) => d.field_label || d.field).filter(Boolean);
    return `修改了${labels.slice(0, 2).join("、")}`;
  }
  return "内容有修改";
}

/** 子约定「有更新」标识：说明具体改了什么 */
export default function SubtaskUpdatedBadge({ subtask }) {
  const updated = isSubtaskUpdated(subtask);

  const { data: log } = useQuery({
    queryKey: ["subtask-change-log", subtask?.id, subtask?.updated_date],
    queryFn: async () => {
      const logs = await base44.entities.TaskChangeLog.filter(
        { task_id: subtask.id },
        "-created_date",
        1
      );
      return logs[0] || null;
    },
    enabled: !!updated && !!subtask?.id,
    staleTime: 60 * 1000,
  });

  if (!updated) return null;

  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-medium whitespace-nowrap">
      <RefreshCw className="w-2.5 h-2.5" />
      {describeChange(log, subtask)} ·{" "}
      {formatDistanceToNow(parseServerDate(subtask.updated_date), { addSuffix: true, locale: zhCN })}
    </span>
  );
}