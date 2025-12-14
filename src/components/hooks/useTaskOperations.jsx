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
    const newStatus = task.status === "completed" ? "pending" : "completed";
    const completedAt = newStatus === "completed" ? new Date().toISOString() : null;
    
    // Automation: Unblock dependent tasks if this task is completed
    if (newStatus === 'completed' && allTasks.length > 0) {
      const dependentTasks = allTasks.filter((t) =>
        t.dependencies &&
        t.dependencies.includes(task.id) &&
        t.status === 'blocked'
      );

      for (const depTask of dependentTasks) {
        const dependencies = depTask.dependencies || [];
        // Check if all OTHER dependencies are completed
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
    }

    updateTaskMutation.mutate({
      id: task.id,
      data: { 
        status: newStatus,
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

  const handleSubtaskToggle = async (subtask, allTasks = []) => {
    const newStatus = subtask.status === "completed" ? "pending" : "completed";
    
    await updateTaskMutation.mutateAsync({
      id: subtask.id,
      data: { 
        status: newStatus,
        completed_at: newStatus === "completed" ? new Date().toISOString() : null
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