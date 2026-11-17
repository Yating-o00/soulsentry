import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { httpRequest } from "@/api/httpClient";
import { isTaskEffectivelyCompleted } from "@/lib/taskStatus";

const CHILDREN_LIMIT = 300;

/**
 * 把搭子生成的「清单型内容」落成约定下的子约定：
 * - 以 key（缺省为标题）去重，缺失项自动创建（刷新/重新生成都不会重复建）；
 * - 行程重排时按稳定 key 更新原条目，不会每天再堆一条新子约定；
 * - 原来本地勾选过的清单项，创建子约定时直接落成已完成，不丢用户进度；
 * - 清单上的勾选直接写回子约定，约定列表和搭子清单保持同一份状态。
 *
 * items: [{ key, title, description, done }]；key 缺省用标题。
 * source: 来源标记（存进子约定 metadata._extraFields.buddy_list_source，便于追溯）
 */
export function useListSubtasks(projectTask, items, source) {
  const parentId = projectTask?.id || null;
  const queryClient = useQueryClient();
  const [syncing, setSyncing] = useState(false);
  const [autoError, setAutoError] = useState(false);
  const attemptedRef = useRef("");
  const runningRef = useRef(false);

  const normalized = useMemo(() => {
    const seen = new Set();
    return (Array.isArray(items) ? items : [])
      .map((item) => {
        const title = String(item?.title || item || "").trim();
        const description = String(item?.description || "");
        return {
          key: String(item?.key || title).trim(),
          title,
          description,
          // 用内容指纹判断「生成源变了」：用户手工改过的子约定不会被无差别覆盖，
          // 只有行程重新生成（指纹变化）时才更新
          rev: `${title}\u0002${description}`,
          done: Boolean(item?.done),
        };
      })
      .filter((item) => {
        if (!item.title || !item.key || seen.has(item.key)) return false;
        seen.add(item.key);
        return true;
      });
  }, [items]);

  const { data: children = [] } = useQuery({
    queryKey: ["tasks", "children", parentId],
    queryFn: () =>
      httpRequest(
        `/api/tasks?parent_task_id=${encodeURIComponent(parentId)}&limit=${CHILDREN_LIMIT}`
      ),
    enabled: !!parentId,
    staleTime: 10 * 1000,
  });

  const { childByKey, childByTitle } = useMemo(() => {
    const byKey = new Map();
    const byTitle = new Map();
    for (const child of Array.isArray(children) ? children : []) {
      if (!child?.title) continue;
      if (!byTitle.has(child.title)) byTitle.set(child.title, child);
      // 旧数据没有 buddy_list_key，用标题当 key 兜底（清单项标题即 key）
      const key = child.buddy_list_key || child.title;
      if (!byKey.has(key)) byKey.set(key, child);
    }
    return { childByKey: byKey, childByTitle: byTitle };
  }, [children]);

  const hasChild = useCallback(
    (item) => childByKey.has(item.key) || childByTitle.has(item.title),
    [childByKey, childByTitle]
  );

  // 缺失项 key 串：用于提示「还有几项没落成子约定」
  const missingKey = useMemo(
    () =>
      normalized
        .filter((item) => !hasChild(item))
        .map((item) => item.key)
        .join("\u0001"),
    [normalized, hasChild]
  );

  // 需要新建或需要更新（生成源内容变了）的项，驱动自动同步
  const syncKey = useMemo(() => {
    const parts = [];
    for (const item of normalized) {
      const existing = childByKey.get(item.key) || childByTitle.get(item.title);
      if (!existing) {
        parts.push(`n:${item.key}`);
        continue;
      }
      if (
        existing.buddy_list_source === source &&
        existing.buddy_list_rev &&
        existing.buddy_list_rev !== item.rev
      ) {
        parts.push(`u:${item.key}`);
      }
    }
    return parts.join("\u0001");
  }, [normalized, childByKey, childByTitle, source]);

  const syncNow = useCallback(
    async ({ notify = false } = {}) => {
      if (!parentId || runningRef.current) return;
      runningRef.current = true;
      setSyncing(true);
      setAutoError(false);
      try {
        // 先取一次最新子约定，避免并发/重试时按旧列表重复建
        const fresh = await httpRequest(
          `/api/tasks?parent_task_id=${encodeURIComponent(parentId)}&limit=${CHILDREN_LIMIT}`
        );
        const freshChildren = Array.isArray(fresh) ? fresh : [];
        const byKey = new Map();
        const byTitle = new Map();
        for (const child of freshChildren) {
          if (!child?.title) continue;
          if (!byTitle.has(child.title)) byTitle.set(child.title, child);
          const key = child.buddy_list_key || child.title;
          if (!byKey.has(key)) byKey.set(key, child);
        }

        const creates = [];
        const updates = [];
        for (const item of normalized) {
          const existing = byKey.get(item.key) || byTitle.get(item.title);
          if (existing) {
            // 行程重排后标题/说明会变：只更新由本板块生成、且生成源指纹变了的子约定，
            // 不覆盖用户手工编辑过的内容
            if (
              existing.buddy_list_source === source &&
              existing.buddy_list_rev &&
              existing.buddy_list_rev !== item.rev
            ) {
              updates.push({ id: existing.id, title: item.title, description: item.description, rev: item.rev });
            }
            continue;
          }
          creates.push(item);
        }

        await Promise.all([
          ...creates.map((item) =>
            httpRequest("/api/tasks", {
              method: "POST",
              body: {
                title: item.title,
                description: item.description,
                category: "personal",
                priority: "medium",
                parent_task_id: parentId,
                status: item.done ? "completed" : "pending",
                ...(item.done ? { completed_at: new Date().toISOString() } : {}),
                buddy_list_key: item.key,
                buddy_list_source: source,
                buddy_list_rev: item.rev,
              },
            })
          ),
          ...updates.map((item) =>
            httpRequest(`/api/tasks/${item.id}`, {
              method: "PATCH",
              body: {
                title: item.title,
                description: item.description,
                buddy_list_rev: item.rev,
              },
            })
          ),
        ]);
        await queryClient.invalidateQueries({ queryKey: ["tasks"] });
        if (notify) {
          const changed = creates.length + updates.length;
          toast.success(
            changed > 0
              ? `已同步 ${changed} 项子约定${updates.length > 0 ? "（含行程更新）" : ""}`
              : "清单已经全部在子约定里了"
          );
        }
      } catch (error) {
        setAutoError(true);
        if (notify) toast.error(error?.message || "清单同步没完成，再试一次");
        throw error;
      } finally {
        runningRef.current = false;
        setSyncing(false);
      }
    },
    [parentId, normalized, source, queryClient]
  );

  // 清单出现/变化（或行程重排）时自动补齐/更新子约定；
  // 同一份内容只自动尝试一次，失败留给用户手动重试
  useEffect(() => {
    if (!parentId || !syncKey) return;
    const attemptKey = `${parentId}::${syncKey}`;
    if (attemptedRef.current === attemptKey) return;
    attemptedRef.current = attemptKey;
    syncNow().catch(() => {});
  }, [parentId, syncKey, syncNow]);

  const toggle = useCallback(
    async (item) => {
      const title = String(item?.title || item || "").trim();
      const key = String(item?.key || title).trim();
      const child = childByKey.get(key) || childByTitle.get(title);
      if (!child) {
        await syncNow({ notify: true }).catch(() => {});
        return;
      }
      const nextDone = !isTaskEffectivelyCompleted(child);
      try {
        await httpRequest(`/api/tasks/${child.id}`, {
          method: "PATCH",
          body: {
            status: nextDone ? "completed" : "pending",
            completed_at: nextDone ? new Date().toISOString() : null,
          },
        });
        await queryClient.invalidateQueries({ queryKey: ["tasks"] });
      } catch (error) {
        toast.error(error?.message || "勾选没同步，稍后再试");
      }
    },
    [childByKey, childByTitle, syncNow, queryClient]
  );

  return {
    childByKey,
    childByTitle,
    missingKey,
    missingCount: missingKey ? missingKey.split("\u0001").length : 0,
    syncing,
    autoError,
    syncNow,
    toggle,
  };
}
