import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { buildTaskContext, buildPrompt } from "@/components/memory/TaskMemoryInsight";

// 智能助手守护中：自动呈现「记忆洞察」对该约定内容的分析总结
export default function GuardianInsightLine({ task, fallbackText }) {
  const { data: allTasks = [] } = useQuery({
    queryKey: ["tasks-memory-ctx"],
    queryFn: () => base44.entities.Task.list("-created_date", 200),
    staleTime: 60000,
  });
  const { data: relationships = [] } = useQuery({
    queryKey: ["relationships-memory-ctx"],
    queryFn: () => base44.entities.Relationship.list("-created_date", 50),
    staleTime: 60000,
  });
  const { data: behaviors = [] } = useQuery({
    queryKey: ["behaviors-memory-ctx"],
    queryFn: () => base44.entities.UserBehavior.list("-created_date", 200),
    staleTime: 60000,
  });
  const { data: completions = [] } = useQuery({
    queryKey: ["completions-memory-ctx"],
    queryFn: () => base44.entities.TaskCompletion.list("-created_date", 100),
    staleTime: 60000,
  });

  const ready = allTasks.length > 0;

  const { data: insight, isFetching } = useQuery({
    queryKey: ["task-guardian-insight", task.id],
    enabled: !!task?.id && ready,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
    queryFn: async () => {
      const ctx = buildTaskContext(task, allTasks, relationships, behaviors, completions);
      const res = await base44.functions.invoke("kimiMemoryInsight", { prompt: buildPrompt(task, ctx) });
      return res?.data?.insight || null;
    },
  });

  return (
    <p className="text-[11px] text-stone-500 truncate leading-relaxed">
      {insight || (isFetching ? "正在结合你的记忆分析这条约定…" : fallbackText)}
    </p>
  );
}