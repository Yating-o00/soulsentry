import React from "react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { LifeBuoy, Loader2, Scissors, TrendingDown } from "lucide-react";
import { addDays, setHours, setMinutes, startOfDay } from "date-fns";
import { toast } from "sonner";

const DOWNGRADE = { urgent: "high", high: "medium", medium: "low", low: "low" };

// 失败预防与平滑补偿：任务被多次顺延或阻塞时，主动提供降级规划
export default function TaskRescuePrompt({ task, onBreakdown, onUpdate, isGenerating }) {
  const needsRescue =
    task &&
    !["completed", "cancelled"].includes(task.status) &&
    ((task.snooze_count || 0) >= 2 || task.status === "blocked");

  if (!needsRescue) return null;

  const handleDowngrade = () => {
    const tomorrow9 = setMinutes(setHours(startOfDay(addDays(new Date(), 1)), 9), 0);
    onUpdate({
      priority: DOWNGRADE[task.priority] || "low",
      reminder_time: tomorrow9.toISOString(),
      snooze_count: 0,
    });
    toast.success("已降低难度并顺延到明天上午，轻装上阵");
  };

  return (
    <Alert className="bg-gradient-to-r from-rose-50 to-amber-50 border-rose-200">
      <LifeBuoy className="h-4 w-4 text-rose-500" />
      <AlertDescription className="space-y-2">
        <p className="text-sm text-slate-700">
          {task.status === "blocked"
            ? "这个约定处于阻塞状态。"
            : `这个约定已被顺延 ${task.snooze_count} 次。`}
          与其让它积压成负担，不如平滑降级：
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={onBreakdown}
            disabled={isGenerating}
            className="h-7 text-xs bg-rose-500 hover:bg-rose-600 text-white"
          >
            {isGenerating ? (
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            ) : (
              <Scissors className="w-3 h-3 mr-1" />
            )}
            AI 拆解为微任务
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleDowngrade}
            className="h-7 text-xs border-amber-300 bg-white hover:bg-amber-50 text-amber-700"
          >
            <TrendingDown className="w-3 h-3 mr-1" />
            降级并顺延到明天
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}