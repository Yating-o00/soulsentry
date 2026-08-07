import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Layers } from "lucide-react";

// 显示某个子约定下的二级子约定数量徽标
export default function SubtaskChildCount({ taskId }) {
  const { data: children = [] } = useQuery({
    queryKey: ['subtasks', taskId],
    queryFn: () => base44.entities.Task.filter({ parent_task_id: taskId }),
    enabled: !!taskId,
    initialData: [],
  });

  if (children.length === 0) return null;

  const done = children.filter((c) => c.status === "completed").length;

  return (
    <span className="text-[10px] text-[#384877] bg-[#eef0fa] px-1.5 py-0.5 rounded-md font-medium flex items-center gap-0.5 flex-shrink-0">
      <Layers className="w-3 h-3" />
      {done}/{children.length}
    </span>
  );
}