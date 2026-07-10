import React, { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { isPast, parseISO, format } from "date-fns";
import DeferredCatchupCard from "./DeferredCatchupCard";

const SHOWN_KEY = "ss_catchup_shown_v1";

// 打开应用时，把所有被推迟/逾期未处理的约定聚合为一条汇总卡片（每天最多一次）
export default function DeferredCatchupHost() {
  const shownRef = useRef(false);
  const queryClient = useQueryClient();
  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks"],
    queryFn: async () => {
      try { return await base44.entities.Task.list(); } catch { return []; }
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  useEffect(() => {
    if (shownRef.current || !Array.isArray(tasks) || tasks.length === 0) return;
    const today = format(new Date(), "yyyy-MM-dd");
    try {
      if (localStorage.getItem(SHOWN_KEY) === today) { shownRef.current = true; return; }
    } catch {}

    const deferred = tasks.filter((t) => t && !t.deleted_at && !t.parent_task_id && (
      t.status === "snoozed" ||
      (t.status === "pending" && t.reminder_sent && t.reminder_time && isPast(parseISO(t.reminder_time)))
    ));
    shownRef.current = true;
    try { localStorage.setItem(SHOWN_KEY, today); } catch {}
    if (deferred.length < 2) return;

    // 推迟次数多的排前面，优先引起注意
    const sorted = [...deferred].sort((a, b) => (b.snooze_count || 0) - (a.snooze_count || 0));
    const snoozeAll = async () => {
      const until = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      for (const t of sorted) {
        await base44.entities.Task.update(t.id, {
          status: "snoozed",
          snooze_until: until,
          snooze_count: (t.snooze_count || 0) + 1,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    };

    toast.custom((tst) => (
      <DeferredCatchupCard
        tasks={sorted.slice(0, 5)}
        total={sorted.length}
        onSnoozeAll={() => { snoozeAll(); toast.dismiss(tst); }}
        onDismiss={() => toast.dismiss(tst)}
      />
    ), {
      duration: 25000,
      unstyled: true,
      classNames: { toast: "!bg-transparent !border-0 !shadow-none !p-0" },
    });
  }, [tasks, queryClient]);

  return null;
}