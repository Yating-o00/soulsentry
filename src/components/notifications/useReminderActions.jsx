import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";

/**
 * 约定提醒的三个标准动作（立即处理/延后/轻轻放下），
 * 供 ReminderActionCard、TaskQuickActions、时空感知守护面板等所有提醒面共用。
 * 语义与后端约定一致：
 * - 立即处理 = 打卡履约（重复约定由后端按打卡语义推进到下一期）
 * - 延后 = PATCH snooze_until，由唤回 cron 到点轻声提醒
 * - 轻轻放下 = gentle_dismiss，本周期全链路静默（见 tasks.js 归一化）
 */
export function useReminderActions(task, { onAction } = {}) {
  const queryClient = useQueryClient();
  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Task.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const complete = () =>
    updateMutation.mutate(
      { id: task.id, data: { status: "completed", completed_at: new Date().toISOString() } },
      {
        onSuccess: () => {
          toast.success(`「${task.title}」已如约处理完成`);
          onAction?.("completed");
        },
        onError: () => toast.error("操作失败，请稍后再试"),
      }
    );

  const snooze = (minutes) => {
    const until = new Date(Date.now() + minutes * 60000);
    updateMutation.mutate(
      {
        id: task.id,
        data: {
          status: "snoozed",
          snooze_until: until.toISOString(),
          snooze_count: (task.snooze_count || 0) + 1,
        },
      },
      {
        onSuccess: () => {
          toast(`好，${minutes} 分钟后轻轻提醒你「${task.title}」`);
          onAction?.("snoozed", minutes);
        },
        onError: () => toast.error("操作失败，请稍后再试"),
      }
    );
  };

  const dismiss = () =>
    updateMutation.mutate(
      { id: task.id, data: { gentle_dismiss: true } },
      {
        onSuccess: () => {
          toast("好，这个周期先不提醒它了");
          onAction?.("dismissed");
        },
        onError: () => toast.error("操作失败，请稍后再试"),
      }
    );

  return { complete, snooze, dismiss, isPending: updateMutation.isPending };
}
