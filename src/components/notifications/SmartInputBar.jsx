import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import UnifiedTaskInput from "@/components/tasks/UnifiedTaskInput";
import { extractAndCreateTasks } from "@/components/utils/extractAndCreateTasks";
import { syncPlanToNote } from "@/components/utils/syncPlanToNote";
import { format } from "date-fns";

export default function SmartInputBar() {
  const [inputValue, setInputValue] = useState("");
  const queryClient = useQueryClient();

  const handleAddTask = async (taskData) => {
    const userInput = taskData.title || "";
    if (!userInput.trim()) return;

    const now = new Date().toISOString();
    const todayStr = format(new Date(), "yyyy-MM-dd");

    // Determine category based on task data
    const execCategory = taskData.category === "work" ? "promise" : taskData.priority === "low" ? "note" : "task";

    // Step 1: Create execution record
    let execution;
    try {
      execution = await base44.entities.TaskExecution.create({
        task_title: userInput.slice(0, 60),
        original_input: userInput,
        execution_status: "parsing",
        category: execCategory,
        execution_steps: [
          { step_name: "AI解析", status: "running", detail: "正在分析输入内容...", timestamp: now },
          { step_name: "任务生成", status: "pending", detail: "等待创建", timestamp: null },
          { step_name: "同步约定", status: "pending", detail: "等待同步", timestamp: null },
          { step_name: "同步心签", status: "pending", detail: "等待同步", timestamp: null },
        ],
      });
      queryClient.invalidateQueries({ queryKey: ['task-executions'] });
    } catch (e) {
      console.error("Failed to create execution record:", e);
    }

    // Step 2: Create the main task (same logic as Tasks page)
    try {
      const newTask = await base44.entities.Task.create({
        title: userInput,
        description: taskData.description || "",
        category: taskData.category || "personal",
        priority: taskData.priority || "medium",
        status: "pending",
        reminder_time: taskData.reminder_time || now,
        tags: taskData.tags || [],
      });

      queryClient.invalidateQueries({ queryKey: ['tasks'] });

      // Update execution: task created
      if (execution) {
        const step2Time = new Date().toISOString();
        await base44.entities.TaskExecution.update(execution.id, {
          task_id: newTask.id,
          execution_status: "executing",
          ai_parsed_result: {
            intent: execCategory === "promise" ? "创建约定" : execCategory === "note" ? "创建心签" : "创建任务",
            priority: taskData.priority || "medium",
            summary: `已识别为${execCategory === "promise" ? "约定" : execCategory === "note" ? "心签" : "任务"}，正在同步...`,
            entities: taskData.tags || [],
          },
          execution_steps: [
            { step_name: "AI解析", status: "completed", detail: "内容解析完成", timestamp: now },
            { step_name: "任务生成", status: "completed", detail: `已创建: ${userInput.slice(0, 30)}`, timestamp: step2Time },
            { step_name: "同步约定", status: "running", detail: "正在提取并同步约定...", timestamp: step2Time },
            { step_name: "同步心签", status: "pending", detail: "等待同步", timestamp: null },
          ],
        });
        queryClient.invalidateQueries({ queryKey: ['task-executions'] });
      }

      // Step 3: Background sync to tasks (extractAndCreateTasks) + notes (syncPlanToNote)
      const results = await Promise.allSettled([
        extractAndCreateTasks(userInput, todayStr),
        syncPlanToNote(userInput, "notification_input", { date: todayStr }),
      ]);

      const taskResult = results[0];
      const noteResult = results[1];
      const syncParts = [];
      if (taskResult.status === "fulfilled" && taskResult.value?.length > 0) syncParts.push(`${taskResult.value.length} 个约定`);
      if (noteResult.status === "fulfilled" && noteResult.value) syncParts.push("心签");

      // Step 4: Mark execution as completed
      if (execution) {
        const finalTime = new Date().toISOString();
        await base44.entities.TaskExecution.update(execution.id, {
          execution_status: "completed",
          completed_at: finalTime,
          execution_steps: [
            { step_name: "AI解析", status: "completed", detail: "内容解析完成", timestamp: now },
            { step_name: "任务生成", status: "completed", detail: `已创建: ${userInput.slice(0, 30)}`, timestamp: now },
            { step_name: "同步约定", status: taskResult.status === "fulfilled" ? "completed" : "failed", detail: taskResult.status === "fulfilled" ? `已同步 ${taskResult.value?.length || 0} 个约定` : "同步失败", timestamp: finalTime },
            { step_name: "同步心签", status: noteResult.status === "fulfilled" ? "completed" : "failed", detail: noteResult.status === "fulfilled" ? "已同步到心签" : "同步失败", timestamp: finalTime },
          ],
        });
        queryClient.invalidateQueries({ queryKey: ['task-executions'] });
      }

      if (syncParts.length > 0) {
        toast.success(`已同步到${syncParts.join(" + ")}`, { icon: "🔄" });
      } else {
        toast.success("任务已创建");
      }
    } catch (error) {
      console.error("Task creation failed:", error);
      if (execution) {
        await base44.entities.TaskExecution.update(execution.id, {
          execution_status: "failed",
          error_message: error.message || "创建失败",
        });
        queryClient.invalidateQueries({ queryKey: ['task-executions'] });
      }
      toast.error("创建失败，请重试");
    }

    setInputValue("");
  };

  return (
    <UnifiedTaskInput
      value={inputValue}
      onChange={setInputValue}
      onAddTask={handleAddTask}
    />
  );
}