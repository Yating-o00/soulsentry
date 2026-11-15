import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { httpRequest } from "@/api/httpClient";
import Orb from "@/components/buddy/Orb";

/** 北京时间的日期键（按日持久化板块状态用） */
export function todayKey(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000 + 8 * 3600000);
  return d.toISOString().slice(0, 10);
}

/** 本周（周一起）七天的日期键 + 星期几标签 */
export function weekDays() {
  const now = new Date(Date.now() + 8 * 3600000);
  const dow = (now.getUTCDay() + 6) % 7; // 周一=0
  const labels = ["一", "二", "三", "四", "五", "六", "日"];
  return labels.map((label, i) => ({ label, key: todayKey(i - dow), isToday: i === dow }));
}

/**
 * 搭子板块状态：读 buddies/mine 缓存里的 profile.state，写走 POST /api/buddies/:id/state（深合并）。
 * 返回 { state, patch, patching }——patch(patchObj, {onSuccess}) 乐观更新本地缓存。
 */
export function useBuddyState(buddyId) {
  const queryClient = useQueryClient();
  // 订阅同一缓存键（BuddySpace 已在拉取，此处共享数据、跟随乐观更新实时重渲染）
  const { data: mine } = useQuery({
    queryKey: ["buddies", "mine"],
    queryFn: () => httpRequest("/api/buddies/mine"),
    staleTime: 30 * 1000,
  });
  const state = mine?.buddies?.[buddyId]?.state || {};

  const mutation = useMutation({
    mutationFn: (patch) => httpRequest(`/api/buddies/${buddyId}/state`, { method: "POST", body: { patch } }),
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: ["buddies", "mine"] });
      const prev = queryClient.getQueryData(["buddies", "mine"]);
      queryClient.setQueryData(["buddies", "mine"], (old) => {
        if (!old?.buddies?.[buddyId]) return old;
        const cur = old.buddies[buddyId];
        return {
          ...old,
          buddies: { ...old.buddies, [buddyId]: { ...cur, state: deepMerge(cur.state || {}, patch) } },
        };
      });
      return { prev };
    },
    onError: (_e, _p, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["buddies", "mine"], ctx.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["buddies", "mine"] }),
  });

  return { state, patch: mutation.mutate, patchAsync: mutation.mutateAsync, patching: mutation.isPending };
}

function deepMerge(base, patch) {
  if (!isObj(base) || !isObj(patch)) return patch;
  const out = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    out[k] = isObj(v) && isObj(out[k]) ? deepMerge(out[k], v) : v;
  }
  return out;
}
const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);

/** 搭子技能调用：POST /api/buddies/:id/agent */
export function useBuddyAgent(buddyId) {
  const mutation = useMutation({
    mutationFn: ({ mode, payload }) =>
      httpRequest(`/api/buddies/${buddyId}/agent`, { method: "POST", body: { mode, payload } }).then((r) => r.data),
  });
  return { call: mutation.mutateAsync, calling: mutation.isPending };
}

/** 搭子气泡（ Orb + 卡片） */
export function BuddyMsg({ tint, children }) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="mt-0.5 shrink-0">
        <Orb size={28} tint={tint} />
      </div>
      <div className="max-w-[85%] rounded-2xl rounded-tl-md px-3.5 py-2.5 text-[14px] leading-relaxed text-stone-800 bg-[#FAF9F7] border border-stone-200">
        {children}
      </div>
    </div>
  );
}

/** 面板区块卡 */
export function PanelCard({ title, extra, children, dark = false }) {
  return (
    <section className={dark ? "rounded-2xl bg-[#384877] p-5 text-[#FAF9F7]" : "rounded-2xl border border-stone-200 bg-white p-5"}>
      {(title || extra) && (
        <div className="flex items-baseline justify-between">
          {title && <div className={dark ? "text-[11px] tracking-widest opacity-70" : "text-[11px] tracking-widest text-stone-400"}>{title}</div>}
          {extra}
        </div>
      )}
      {children}
    </section>
  );
}

/** 主按钮 / 次按钮（搭子配色） */
export function TintButton({ tint, children, outline = false, className = "", ...rest }) {
  return (
    <button
      {...rest}
      className={`min-h-[44px] cursor-pointer rounded-full px-4 text-sm font-medium transition-transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${
        outline ? "border" : "text-white"
      } ${className}`}
      style={outline ? { borderColor: tint[2], color: tint[2] } : { background: tint[2] }}
    >
      {children}
    </button>
  );
}

/** 进度条 */
export function ProgressBar({ pct, tint, track = "#e7e5e4" }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full" style={{ background: track }}>
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: tint[2] }}
      />
    </div>
  );
}
