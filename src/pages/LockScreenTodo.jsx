import React, { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { httpRequest } from "@/api/httpClient";
import { toast } from "sonner";
import { Download, Check } from "lucide-react";
import {
  WALLPAPER_STYLES,
  buildLockscreenItems,
  isItemDone,
  isCheckinItem,
  createWallpaperCanvas,
} from "@/lib/lockscreenWallpaper";

// 锁屏约定：把全部约定渲染成锁屏壁纸（查看用），勾选在此页完成后壁纸自动更新，重新下载即可。
// 勾选走后端接口，Web 端与小程序端的完成状态实时同步。
export default function LockScreenTodo() {
  const queryClient = useQueryClient();
  const [styleKey, setStyleKey] = useState("night");
  const [previewUrl, setPreviewUrl] = useState("");

  const { data: allTasks = [], isLoading } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => base44.entities.Task.filter({ parent_task_id: "all" }, "-reminder_time", 2000),
  });

  const items = useMemo(() => buildLockscreenItems(allTasks), [allTasks]);

  // 勾选状态或壁纸样式变化时自动重绘预览
  useEffect(() => {
    const canvas = createWallpaperCanvas(items, styleKey);
    setPreviewUrl(canvas.toDataURL("image/png"));
  }, [items, styleKey]);

  const toggleItem = async (task) => {
    const recurring = task.repeat_rule && task.repeat_rule !== "none";
    const done = isItemDone(task);

    // 打卡约定：勾选 = 一次赴约打卡（累计次数 + 当日已打卡），不是把约定标成完成；
    // 打卡一天一次、不可撤销，已打卡时再点只提示
    if (isCheckinItem(task)) {
      if (done) {
        toast("今日已赴约，明天再打卡～");
        return;
      }
      queryClient.setQueriesData({ queryKey: ["tasks"] }, (old) =>
        Array.isArray(old)
          ? old.map((t) => (t.id === task.id ? { ...t, done_today: true } : t))
          : old
      );
      try {
        await httpRequest(`/api/tasks/${task.id}/checkins`, { method: "POST", body: {} });
        toast.success("✓ 今日已赴约，壁纸已更新");
      } catch (e) {
        if (e?.status === 409) {
          // 今日已打卡（其他端打的）：状态本就一致，无需回滚
          toast("今日已赴约，明天再打卡～");
        } else {
          toast.error(e?.message || "打卡失败，请再试一次");
          queryClient.invalidateQueries({ queryKey: ["tasks"] });
        }
      }
      return;
    }

    const nextStatus = done ? "pending" : "completed";
    const completedAt = done ? null : new Date().toISOString();

    // 乐观更新：壁纸预览立即重绘
    queryClient.setQueriesData({ queryKey: ["tasks"] }, (old) =>
      Array.isArray(old)
        ? old.map((t) =>
            t.id === task.id
              ? recurring
                ? { ...t, done_today: !done }
                : { ...t, status: nextStatus, completed_at: completedAt }
              : t
          )
        : old
    );

    try {
      await base44.entities.Task.update(
        task.id,
        recurring ? { status: nextStatus } : { status: nextStatus, completed_at: completedAt }
      );
      toast.success(done ? "已取消完成" : "✓ 如约完成，壁纸已更新");
    } catch (_e) {
      toast.error("网络开小差了，请再试一次");
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    }
  };

  const download = () => {
    const canvas = createWallpaperCanvas(items, styleKey);
    const now = new Date();
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `心栈锁屏约定-${now.getMonth() + 1}月${now.getDate()}日.png`;
    a.click();
    toast.success("壁纸已下载，去设为锁屏壁纸吧");
  };

  const taskById = useMemo(() => {
    const map = {};
    (Array.isArray(allTasks) ? allTasks : []).forEach((t) => { map[t.id] = t; });
    return map;
  }, [allTasks]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 md:py-10">
      <h1 className="text-2xl font-bold text-stone-900">锁屏约定</h1>
      <p className="mt-2 text-sm text-stone-500 leading-relaxed">
        把今天的约定装进口袋：下载壁纸设为锁屏，亮屏就能看到全部约定。
        在下方勾选（含子约定）即完成约定，完成状态实时同步到 Web 端和小程序端，壁纸同步更新，重新下载替换即可。
      </p>

      <div className="mt-6 grid gap-8 md:grid-cols-[300px_1fr]">
        {/* 壁纸预览 */}
        <div className="md:sticky md:top-6 self-start">
          <div className="mx-auto w-[240px] md:w-[300px] rounded-[28px] border border-stone-200 shadow-lg overflow-hidden bg-stone-100">
            {previewUrl ? (
              <img src={previewUrl} alt="锁屏约定壁纸预览" className="w-full block" />
            ) : (
              <div className="aspect-[1170/2532] flex items-center justify-center text-stone-400 text-sm">
                生成中…
              </div>
            )}
          </div>

          {/* 壁纸样式 */}
          <div className="mt-4 flex items-center justify-center gap-3">
            {WALLPAPER_STYLES.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setStyleKey(s.key)}
                title={s.name}
                className={`w-10 h-10 rounded-xl border-2 transition-all ${
                  styleKey === s.key ? "border-[#384877] scale-110" : "border-stone-200"
                }`}
                style={{ background: `linear-gradient(180deg, ${s.from}, ${s.to})` }}
              />
            ))}
          </div>
          <p className="mt-2 text-center text-xs text-stone-400">
            {WALLPAPER_STYLES.find((s) => s.key === styleKey)?.name}
          </p>

          <button
            type="button"
            onClick={download}
            className="mt-4 w-full flex items-center justify-center gap-2 rounded-xl bg-[#384877] text-white py-3 text-sm font-medium hover:opacity-90 transition-opacity"
          >
            <Download className="w-4 h-4" />
            下载壁纸
          </button>
        </div>

        {/* 快捷勾选 */}
        <div>
          <h2 className="text-base font-semibold text-stone-800">今日约定</h2>
          <p className="mt-1 text-xs text-stone-400">点按即可勾选 / 取消，壁纸会同步更新</p>

          {isLoading ? (
            <div className="mt-6 text-sm text-stone-400">加载中…</div>
          ) : items.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-stone-300 p-8 text-center">
              <p className="text-stone-500 text-sm">今天还没有约定</p>
              <p className="mt-1 text-stone-400 text-xs">去「约定」页许下一个，再回来生成壁纸</p>
            </div>
          ) : (
            <div className="mt-4 space-y-2">
              {items.map((p) => (
                <div key={p.id} className="rounded-2xl border border-stone-200 bg-white overflow-hidden">
                  <CheckRow
                    title={p.title}
                    done={p.done}
                    onToggle={() => taskById[p.id] && toggleItem(taskById[p.id])}
                  />
                  {p.subtasks.map((s) => (
                    <CheckRow
                      key={s.id}
                      title={s.title}
                      done={s.done}
                      sub
                      onToggle={() => taskById[s.id] && toggleItem(taskById[s.id])}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CheckRow({ title, done, sub = false, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-stone-50 ${
        sub ? "pl-11 border-t border-stone-100" : ""
      }`}
    >
      <span
        className={`flex items-center justify-center rounded-md border-2 flex-shrink-0 ${
          sub ? "w-[18px] h-[18px]" : "w-[22px] h-[22px]"
        } ${done ? "bg-emerald-500 border-emerald-500" : "border-stone-300"}`}
      >
        {done && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
      </span>
      <span
        className={`${sub ? "text-sm" : "text-[15px] font-medium"} ${
          done ? "text-stone-400 line-through" : "text-stone-800"
        }`}
      >
        {title}
      </span>
    </button>
  );
}
