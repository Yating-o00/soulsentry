import React, { useEffect, useState, useCallback, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import TaskDeferralFeedback from "./TaskDeferralFeedback";

/**
 * 任务落地反馈闭环 - 宿主
 *
 * 周期扫描"到期未完成"的任务，弹出反馈卡。
 * 用户填写后：
 *   1. 创建 TaskDeferralLog 记录原因
 *   2. 更新任务 reminder_time / status=snoozed
 *   3. 抛出全局事件，供下次重排时把日志作为上下文
 *
 * 跳过/关闭：本地缓存 24h 内不再弹该任务
 */
const SCAN_INTERVAL_MS = 5 * 60 * 1000; // 5 分钟
const SKIP_CACHE_KEY = "ss_deferral_skip_v1";
const SKIP_TTL_MS = 24 * 60 * 60 * 1000;

function loadSkipMap() {
  try {
    const raw = localStorage.getItem(SKIP_CACHE_KEY);
    if (!raw) return {};
    const m = JSON.parse(raw);
    const now = Date.now();
    // 清理过期
    Object.keys(m).forEach((k) => {
      if (!m[k] || now - m[k] > SKIP_TTL_MS) delete m[k];
    });
    return m;
  } catch {
    return {};
  }
}

function saveSkipMap(m) {
  try {
    localStorage.setItem(SKIP_CACHE_KEY, JSON.stringify(m));
  } catch {}
}

export default function OverdueFeedbackHost() {
  const [pendingTask, setPendingTask] = useState(null);
  const scanningRef = useRef(false);

  const scan = useCallback(async () => {
    if (scanningRef.current || pendingTask) return;
    scanningRef.current = true;
    try {
      // 拉一小批 pending 任务，过滤超时未处理
      const tasks = await base44.entities.Task.filter(
        { status: "pending" },
        "-reminder_time",
        50
      );
      const now = Date.now();
      const skipMap = loadSkipMap();
      const overdue = (tasks || []).find((t) => {
        if (!t || skipMap[t.id]) return false;
        if (t.deleted_at) return false;
        const target = t.end_time || t.reminder_time;
        if (!target) return false;
        const ts = new Date(target).getTime();
        // 已过期超过 10 分钟，且没有处于 snoozed
        return ts < now - 10 * 60 * 1000;
      });
      if (overdue) setPendingTask(overdue);
    } catch (e) {
      // 静默：不打扰用户
      console.warn("[OverdueFeedback] scan failed", e);
    } finally {
      scanningRef.current = false;
    }
  }, [pendingTask]);

  useEffect(() => {
    // 启动延迟 8 秒，避免与登录/首屏渲染抢资源
    const first = setTimeout(scan, 8000);
    const timer = setInterval(scan, SCAN_INTERVAL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [scan]);

  const handleSkip = () => {
    if (pendingTask) {
      const m = loadSkipMap();
      m[pendingTask.id] = Date.now();
      saveSkipMap(m);
    }
    setPendingTask(null);
  };

  const handleSubmit = async ({ reason_category, missing_prerequisite, reason_note, deferred_to }) => {
    if (!pendingTask) return;
    const originalTime = pendingTask.end_time || pendingTask.reminder_time;
    try {
      // 1. 记录日志
      await base44.entities.TaskDeferralLog.create({
        task_id: pendingTask.id,
        task_title: pendingTask.title,
        original_time: originalTime,
        deferred_to,
        reason_category,
        missing_prerequisite: missing_prerequisite || "",
        reason_note: reason_note || "",
        carry_to_next_plan: true,
      });
      // 2. 顺延任务
      await base44.entities.Task.update(pendingTask.id, {
        reminder_time: deferred_to,
        status: "snoozed",
        snooze_until: deferred_to,
        snooze_count: (pendingTask.snooze_count || 0) + 1,
      });
      // 3. 全局通知（让 SmartDailyPlanner 等模块刷新 / 重排时带上）
      window.dispatchEvent(new CustomEvent("task-deferral-logged", {
        detail: { task_id: pendingTask.id, reason_category, missing_prerequisite }
      }));

      toast.success("已记录原因，任务已顺延", {
        description: "AI 会在下次重排时优先考虑",
      });

      // 设备问题给一条更明确的引导
      if (reason_category === "device_not_ready" && missing_prerequisite) {
        toast.info(`提示：建议尽快补全「${missing_prerequisite}」`, {
          description: "可在「我的账户」中完成相关授权",
          duration: 6000,
        });
      }
      setPendingTask(null);
    } catch (e) {
      console.error("[OverdueFeedback] submit failed", e);
      toast.error("记录失败，请稍后重试");
    }
  };

  return (
    <AnimatePresence>
      {pendingTask && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed bottom-24 md:bottom-6 right-4 md:right-6 z-[60] w-[min(92vw,360px)]"
        >
          <TaskDeferralFeedback
            task={pendingTask}
            onSubmit={handleSubmit}
            onSkip={handleSkip}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}