import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invokeAI } from "@/components/utils/aiHelper";

export default function SmartInputBar() {
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const queryClient = useQueryClient();

  const handleSubmit = async () => {
    if (!input.trim() || isProcessing) return;
    const userInput = input.trim();
    setInput("");
    setIsProcessing(true);

    try {
      // Step 1: Create execution record in "parsing" state
      const execution = await base44.entities.TaskExecution.create({
        task_title: userInput.slice(0, 50),
        original_input: userInput,
        execution_status: "parsing",
        category: "task",
        execution_steps: [
          { step_name: "AI解析", status: "running", detail: "正在分析输入内容...", timestamp: new Date().toISOString() }
        ]
      });

      queryClient.invalidateQueries({ queryKey: ['task-executions'] });

      // Step 2: AI parse the input
      const parsed = await invokeAI({
        prompt: `分析以下用户输入，识别其意图并提取关键信息。

用户输入："${userInput}"

请判断这属于哪种类型：
- promise (约定/会议/会面)
- task (任务/待办)  
- note (心签/备忘/笔记)

返回结构化JSON。`,
        response_json_schema: {
          type: "object",
          properties: {
            intent: { type: "string", description: "用户意图描述" },
            category: { type: "string", enum: ["promise", "task", "note"] },
            title: { type: "string", description: "提取的标题" },
            time_expression: { type: "string", description: "时间表达" },
            priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
            summary: { type: "string", description: "简短摘要" }
          },
          required: ["intent", "category", "title", "summary"]
        }
      });

      // Step 3: Update execution with parsed result, create the task
      const now = new Date().toISOString();
      const steps = [
        { step_name: "AI解析", status: "completed", detail: "内容解析完成", timestamp: now },
        { step_name: "任务生成", status: "running", detail: "正在创建任务...", timestamp: now },
        { step_name: "执行同步", status: "pending", detail: "等待执行", timestamp: null },
      ];

      await base44.entities.TaskExecution.update(execution.id, {
        task_title: parsed.title || userInput.slice(0, 50),
        category: parsed.category || "task",
        execution_status: "executing",
        ai_parsed_result: parsed,
        execution_steps: steps,
      });

      queryClient.invalidateQueries({ queryKey: ['task-executions'] });

      // Step 4: Create actual task
      const newTask = await base44.entities.Task.create({
        title: parsed.title || userInput,
        description: userInput,
        priority: parsed.priority || "medium",
        category: parsed.category === "promise" ? "work" : parsed.category === "note" ? "personal" : "work",
        status: "pending",
      });

      // Step 5: Mark as completed
      const finalSteps = [
        { step_name: "AI解析", status: "completed", detail: "内容解析完成", timestamp: now },
        { step_name: "任务生成", status: "completed", detail: `已创建: ${parsed.title}`, timestamp: new Date().toISOString() },
        { step_name: "执行同步", status: "completed", detail: "任务已同步至系统", timestamp: new Date().toISOString() },
      ];

      await base44.entities.TaskExecution.update(execution.id, {
        task_id: newTask.id,
        execution_status: "completed",
        execution_steps: finalSteps,
        completed_at: new Date().toISOString(),
      });

      queryClient.invalidateQueries({ queryKey: ['task-executions'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });

      toast.success(`已创建${parsed.category === "promise" ? "约定" : parsed.category === "note" ? "心签" : "任务"}：${parsed.title}`);
    } catch (error) {
      console.error("Smart input error:", error);
      toast.error("处理失败，请重试");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3">
      <div className="flex gap-2 items-end">
        <div className="flex-1 relative">
          <Textarea
            placeholder="输入内容，AI将自动解析并创建任务执行..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            className="min-h-[44px] max-h-[120px] resize-none text-sm border-0 focus-visible:ring-0 p-2 bg-slate-50 rounded-lg"
            rows={1}
          />
        </div>
        <Button
          onClick={handleSubmit}
          disabled={!input.trim() || isProcessing}
          className="h-10 px-4 bg-[#384877] hover:bg-[#2d3a63] rounded-lg flex-shrink-0"
        >
          {isProcessing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              <Sparkles className="w-4 h-4 mr-1.5" />
              <Send className="w-3.5 h-3.5" />
            </>
          )}
        </Button>
      </div>
      {isProcessing && (
        <div className="mt-2 flex items-center gap-2 text-xs text-indigo-600">
          <Loader2 className="w-3 h-3 animate-spin" />
          AI正在解析并执行...
        </div>
      )}
    </div>
  );
}