import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import UnifiedTaskInput from "@/components/tasks/UnifiedTaskInput";
import { generateExecutionPlan, executeStep } from "./ExecutionPlanGenerator";

export default function SmartInputBar() {
  const [inputValue, setInputValue] = useState("");
  const queryClient = useQueryClient();

  const handleAddTask = async (taskData) => {
    const userInput = taskData.title || "";
    if (!userInput.trim()) return;

    const now = new Date().toISOString();
    const semanticHint = taskData._semantic || null;
    let execution = null;

    // Create initial execution record
    try {
      execution = await base44.entities.TaskExecution.create({
        task_title: userInput.slice(0, 60),
        original_input: userInput,
        execution_status: "parsing",
        category: semanticHint?.primary_intent === "wish" ? "note" :
                  semanticHint?.primary_intent === "note" ? "note" : "task",
        execution_steps: [
          { step_name: "深度语义解析", status: "completed", detail: semanticHint ? `意图: ${semanticHint.primary_intent} (${Math.round((semanticHint.intent_confidence || 0) * 100)}%)` : "跳过", timestamp: now },
          { step_name: "AI执行规划", status: "running", detail: "正在生成执行链路...", timestamp: now },
        ],
        ai_parsed_result: semanticHint ? {
          intent: semanticHint.primary_intent,
          summary: semanticHint.intent_reasoning || "",
          entities: [
            ...(semanticHint.people || []).map(p => "@" + p.name),
            ...(semanticHint.locations || []).map(l => "📍" + l.name),
            ...(semanticHint.tags || []),
          ],
          time_expression: semanticHint.time_entities?.[0]?.original_text || "",
          priority: semanticHint.priority || "medium",
        } : undefined,
      });
      queryClient.invalidateQueries({ queryKey: ['task-executions'] });
    } catch (e) {
      console.error("Failed to create execution record:", e);
    }

    // Generate AI execution plan with semantic hints
    let plan = null;
    try {
      plan = await generateExecutionPlan(userInput, semanticHint);
    } catch (e) {
      console.error("AI plan generation failed:", e);
    }

    if (plan && plan.execution_steps?.length > 0) {
      const mergedTaskData = {
        ...taskData,
        title: plan.task_data?.title || taskData.title,
        description: plan.task_data?.description || taskData.description || "",
        category: plan.task_data?.category || taskData.category || "personal",
        priority: plan.task_data?.priority || taskData.priority || "medium",
        reminder_time: plan.task_data?.reminder_time || taskData.reminder_time || now,
        end_time: plan.task_data?.end_time || null,
        is_all_day: plan.task_data?.is_all_day || false,
        tags: plan.task_data?.tags || taskData.tags || [],
      };

      const planSteps = plan.execution_steps.map((s, i) => ({
        step_name: s.step_name,
        status: i === 0 ? "running" : "pending",
        detail: s.detail,
        timestamp: i === 0 ? now : null,
      }));

      if (execution) {
        await base44.entities.TaskExecution.update(execution.id, {
          category: plan.category || "task",
          execution_status: "executing",
          ai_parsed_result: {
            intent: plan.intent_summary,
            summary: plan.intent_summary,
            entities: mergedTaskData.tags,
            priority: mergedTaskData.priority,
          },
          execution_steps: planSteps,
        });
        queryClient.invalidateQueries({ queryKey: ['task-executions'] });
      }

      let taskId = null;
      const confirmsNeeded = [];
      const completedSteps = [];

      for (let i = 0; i < plan.execution_steps.length; i++) {
        const step = plan.execution_steps[i];

        if (step.action_type === "confirm") {
          confirmsNeeded.push(step);
          completedSteps.push({
            step_name: step.step_name,
            status: "pending",
            detail: "⏸ 待确认: " + step.detail,
            timestamp: null,
          });
          continue;
        }

        try {
          const result = await executeStep(step, taskId, mergedTaskData, execution);
          if (result.taskId) taskId = result.taskId;
          completedSteps.push({
            step_name: step.step_name,
            status: result.success ? "completed" : "failed",
            detail: result.detail,
            timestamp: new Date().toISOString(),
          });
        } catch (err) {
          completedSteps.push({
            step_name: step.step_name,
            status: "failed",
            detail: err.message || "执行失败",
            timestamp: new Date().toISOString(),
          });
        }

        if (execution) {
          await base44.entities.TaskExecution.update(execution.id, {
            task_id: taskId || "",
            execution_steps: completedSteps,
          });
          queryClient.invalidateQueries({ queryKey: ['task-executions'] });
        }
      }

      // 🆕 把 AI 规划的"情境感知事项链路"作为子约定挂到父约定下
      // 每一条子约定 = 一个 execution_step，备注情境时间(when_hint) 与「自动执行」来源
      if (taskId && Array.isArray(plan.execution_steps) && plan.execution_steps.length > 0) {
        try {
          const childPayloads = plan.execution_steps
            .filter(s => s && s.step_name && s.action_type !== "confirm")
            .map(s => {
              const parts = [];
              if (s.detail) parts.push(s.detail);
              if (s.when_hint) parts.push(`⏱ 情境时间：${s.when_hint}`);
              parts.push("⚙️ 自动执行：由哨兵 AI 规划");
              return {
                title: s.step_name,
                description: parts.join("\n"),
                parent_task_id: taskId,
                category: mergedTaskData.category || "personal",
                priority: mergedTaskData.priority || "medium",
                status: "pending",
                tags: ["AI自动执行"],
              };
            });
          if (childPayloads.length > 0) {
            await base44.entities.Task.bulkCreate(childPayloads);
            queryClient.invalidateQueries({ queryKey: ['tasks'] });
          }
        } catch (e) {
          console.error("Failed to create child tasks from execution steps:", e);
        }
      }

      const hasFailures = completedSteps.some(s => s.status === "failed");
      const hasConfirms = confirmsNeeded.length > 0;

      if (execution) {
        await base44.entities.TaskExecution.update(execution.id, {
          task_id: taskId || "",
          execution_status: hasConfirms ? "waiting_confirm" : hasFailures ? "failed" : "completed",
          completed_at: !hasConfirms && !hasFailures ? new Date().toISOString() : null,
          execution_steps: completedSteps,
        });
        queryClient.invalidateQueries({ queryKey: ['task-executions'] });
      }

      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['notes'] });

      if (hasConfirms) {
        toast(plan.intent_summary + " — " + confirmsNeeded.length + "项需要确认", { icon: "⚡" });
      } else if (hasFailures) {
        toast.error("部分步骤执行失败，请查看详情");
      } else {
        toast.success("执行完成: " + plan.intent_summary, { icon: "✅" });
      }

      if (plan.user_prompts?.length > 0) {
        plan.user_prompts.forEach(function(p) {
          toast.info(p, { duration: 6000 });
        });
      }
    } else {
      // Fallback: simple task creation
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

        if (execution) {
          await base44.entities.TaskExecution.update(execution.id, {
            task_id: newTask.id,
            execution_status: "completed",
            completed_at: new Date().toISOString(),
            execution_steps: [
              { step_name: "创建任务", status: "completed", detail: "已创建: " + userInput.slice(0, 40), timestamp: new Date().toISOString() },
            ],
          });
        }

        queryClient.invalidateQueries({ queryKey: ['tasks'] });
        queryClient.invalidateQueries({ queryKey: ['task-executions'] });
        toast.success("任务已创建");
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