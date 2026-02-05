import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { logUserBehavior } from "@/components/utils/behaviorLogger";

export function useTaskOperations() {
  const queryClient = useQueryClient();

  const updateTaskMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Task.update(id, data),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['subtasks'] });
      
      // 自动同步到 Google Calendar (如果已设置提醒时间)
      // 在后台静默执行，不阻塞用户
      base44.functions.invoke('syncTaskToGoogleCalendar', { task_id: variables.id }).catch(console.error);
      
      // Log behavior based on what changed
      if (variables.data.status === 'completed') {
        logUserBehavior("task_completed", { id: variables.id, ...variables.data });
      } else if (variables.data.status === 'snoozed') {
        logUserBehavior("task_snoozed", { id: variables.id, ...variables.data });
      } else {
        logUserBehavior("task_edited", { id: variables.id, ...variables.data });
      }
    },
    onError: () => {
        toast.error("更新任务失败");
    }
  });

  const createTaskMutation = useMutation({
    mutationFn: (taskData) => base44.entities.Task.create(taskData),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      
      // 自动同步到 Google Calendar (如果已设置提醒时间)
      // 在后台静默执行，不阻塞用户
      if (data && data.id) {
        base44.functions.invoke('syncTaskToGoogleCalendar', { task_id: data.id }).catch(console.error);
      }
      
      toast.success("任务创建成功");
      logUserBehavior("task_created", data);
    },
    onError: () => {
        toast.error("创建任务失败");
    }
  });

  const deleteTaskMutation = useMutation({
    mutationFn: (id) => base44.entities.Task.update(id, { deleted_at: new Date().toISOString() }),
    onSuccess: (data, id) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast.success("任务已移至垃圾箱");
      logUserBehavior("task_deleted", { id });
    },
    onError: () => {
        toast.error("删除任务失败");
    }
  });

  const handleComplete = async (task, allTasks = []) => {
    const isRecurring = task.repeat_rule && task.repeat_rule !== 'none';
    const newStatus = task.status === "completed" ? "pending" : "completed";
    const completedAt = newStatus === "completed" ? new Date().toISOString() : null;
    
    // 乐观更新 - 立即更新UI，无需等待服务器响应
    const optimisticStatus = isRecurring && newStatus === 'completed' ? 'pending' : newStatus;
    queryClient.setQueryData(['tasks'], (oldData) => {
      if (!oldData) return oldData;
      return oldData.map(t => 
        t.id === task.id 
          ? { ...t, status: optimisticStatus, completed_at: completedAt }
          : t
      );
    });

    // Automation: Unblock dependent tasks if this task is completed
    if (newStatus === 'completed' && allTasks.length > 0) {
      // 1. Unblock dependent tasks
      const dependentTasks = allTasks.filter((t) =>
        t.dependencies &&
        t.dependencies.includes(task.id) &&
        t.status === 'blocked'
      );

      for (const depTask of dependentTasks) {
        const dependencies = depTask.dependencies || [];
        const otherDepIds = dependencies.filter((id) => id !== task.id);
        const otherDeps = allTasks.filter((t) => otherDepIds.includes(t.id));
        const allOthersCompleted = otherDeps.every((t) => t.status === 'completed');

        if (allOthersCompleted) {
          await updateTaskMutation.mutateAsync({
            id: depTask.id,
            data: { status: 'pending' }
          });
          toast.success(`任务 "${depTask.title}" 已解除阻塞`, { icon: "🔓" });
        }
      }

      // 2. Cascade completion to subtasks (选中父约定的勾选框，约定自动完成)
      const subtasks = allTasks.filter(t => t.parent_task_id === task.id && t.status !== 'completed');
      if (subtasks.length > 0) {
         // Optimistically update subtasks in UI
         queryClient.setQueryData(['tasks'], (oldData) => {
            if (!oldData) return oldData;
            const subtaskIds = new Set(subtasks.map(s => s.id));
            return oldData.map(t => {
              if (subtaskIds.has(t.id)) {
                return { ...t, status: 'completed', completed_at: completedAt };
              }
              return t;
            });
         });

         // Update subtasks in backend
         for (const subtask of subtasks) {
            updateTaskMutation.mutate({
               id: subtask.id,
               data: { status: 'completed', completed_at: completedAt }
            });
         }
         toast.success(`已自动完成 ${subtasks.length} 个子约定`);
      }
    }

    // 后台异步更新服务器
    updateTaskMutation.mutate({
      id: task.id,
      data: { 
        status: optimisticStatus,
        completed_at: completedAt
      }
    });

    if (newStatus === "completed") {
      try {
        await base44.entities.TaskCompletion.create({
          task_id: task.id,
          status: "completed",
          completed_at: completedAt
        });
        
        if (isRecurring) {
          toast.success("✓ 已记录完成，约定继续重复");
        } else {
          toast.success("✓ 约定已完成");
        }

        // AI完成总结和建议 (后台异步执行，不阻塞用户操作)
        generateCompletionSummary(task, allTasks);
      } catch (e) {
        console.error("Failed to record completion", e);
      }
    } else {
      try {
        const history = await base44.entities.TaskCompletion.filter({ task_id: task.id }, "-created_date", 1);
        if (history && history.length > 0) {
           await base44.entities.TaskCompletion.delete(history[0].id);
        }
      } catch (e) {
        console.error("Failed to remove completion record", e);
      }
    }
  };

  // AI完成总结和下一步建议
  const generateCompletionSummary = async (task, allTasks = []) => {
    try {
      // 获取相关联的任务信息
      const relatedTasks = allTasks.filter(t => 
        (t.parent_task_id === task.id) || // 子任务
        (task.dependencies && task.dependencies.includes(t.id)) || // 依赖任务
        (t.category === task.category && t.status === 'pending') // 同类待办
      );

      const prompt = `分析用户刚完成的约定，提供简短总结和下一步建议。

完成的约定:
- 标题: ${task.title}
- 描述: ${task.description || '无'}
- 分类: ${task.category}
- 优先级: ${task.priority}
- 计划时间: ${task.reminder_time ? new Date(task.reminder_time).toLocaleString('zh-CN') : '无'}
- 完成时间: ${new Date().toLocaleString('zh-CN')}

${relatedTasks.length > 0 ? `相关约定 (${relatedTasks.length}个):
${relatedTasks.slice(0, 3).map(t => `- ${t.title} (${t.status})`).join('\n')}` : ''}

请提供:
1. 完成总结: 一句话总结完成情况和成就
2. 下一步建议: 2-3个具体的后续行动建议
3. 激励语: 一句鼓励的话

要求: 简洁、积极、实用`;

      const response = await base44.integrations.Core.InvokeLLM({
        prompt,
        response_json_schema: {
          type: "object",
          properties: {
            summary: { type: "string" },
            next_steps: { type: "array", items: { type: "string" } },
            encouragement: { type: "string" }
          }
        }
      });

      if (response) {
        // 显示AI总结
        toast.success(
          <div className="space-y-2">
            <p className="font-semibold">🎉 {response.summary}</p>
            {response.next_steps && response.next_steps.length > 0 && (
              <div className="text-sm">
                <p className="font-medium mb-1">💡 下一步:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  {response.next_steps.map((step, idx) => (
                    <li key={idx}>{step}</li>
                  ))}
                </ul>
              </div>
            )}
            {response.encouragement && (
              <p className="text-sm italic opacity-80">"{response.encouragement}"</p>
            )}
          </div>,
          { duration: 8000 }
        );
      }
    } catch (error) {
      console.error("AI总结生成失败:", error);
      // 静默失败，不影响用户体验
    }
  };

  const handleSubtaskToggle = async (subtask, allTasks = []) => {
    const newStatus = subtask.status === "completed" ? "pending" : "completed";
    const completedAt = newStatus === "completed" ? new Date().toISOString() : null;
    
    // 乐观更新子任务
    queryClient.setQueryData(['tasks'], (oldData) => {
      if (!oldData) return oldData;
      return oldData.map(t => 
        t.id === subtask.id 
          ? { ...t, status: newStatus, completed_at: completedAt }
          : t
      );
    });

    queryClient.setQueryData(['subtasks', subtask.parent_task_id], (oldData) => {
      if (!oldData) return oldData;
      return oldData.map(t => 
        t.id === subtask.id 
          ? { ...t, status: newStatus, completed_at: completedAt }
          : t
      );
    });
    
    await updateTaskMutation.mutateAsync({
      id: subtask.id,
      data: { 
        status: newStatus,
        completed_at: completedAt
      }
    });

    if (subtask.parent_task_id && allTasks.length > 0) {
      const siblings = allTasks.filter((t) => t.parent_task_id === subtask.parent_task_id);
      const completedCount = siblings.reduce((acc, s) => {
          if (s.id === subtask.id) return acc + (newStatus === "completed" ? 1 : 0);
          return acc + (s.status === "completed" ? 1 : 0);
      }, 0);
      
      const progress = siblings.length > 0 ? Math.round((completedCount / siblings.length) * 100) : 0;

      await updateTaskMutation.mutateAsync({
        id: subtask.parent_task_id,
        data: { progress }
      });
    }
  };

  return {
    updateTask: updateTaskMutation.mutate,
    updateTaskAsync: updateTaskMutation.mutateAsync,
    createTask: createTaskMutation.mutate,
    createTaskAsync: createTaskMutation.mutateAsync,
    deleteTask: deleteTaskMutation.mutate,
    handleComplete,
    handleSubtaskToggle
  };
}