import React, { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { formatShanghai } from "@/lib/timeCore";
import { isTaskEffectivelyCompleted } from "@/lib/taskStatus";
import html2canvas from "html2canvas";
import { Download, Copy, Check, ListChecks, EyeOff } from "lucide-react";
import { buildApiUrl, httpRequest } from "@/api/httpClient";
import { useCheckins } from "@/components/checkins/useCheckins";
import QRCodeImage from "@/components/ui/QRCode";

// 品牌主色（与 TaskShareCard 保持一致）
export const CHECKIN_BRAND_PRIMARY = "#384877";
export const CHECKIN_BRAND_SECONDARY = "#3b5aa2";
export const CHECKIN_BRAND_TINT = "#EEF2FF";

export const CHECKIN_MILESTONES = [1, 7, 21, 50, 100, 365];

export const MILESTONE_QUOTES = {
  1: "第一次赴约，从这里开始。",
  7: "7 次了。这一周的自己，都被认真度过。",
  21: "21 次，习惯已成。你已经是那个会赴约的人。",
  50: "50 次奔赴。这件事，已经长在你身上。",
  100: "100 次。百次之约，万次也不远。",
  365: "365 次。一整年的约定，你都兑现了。",
};

/**
 * 打卡分享卡：品牌蓝极简设计，大数字成就陈述 + 最佳附言/照片 + 公开二维码（扫码匿名留言）。
 * 支持保存图片与复制图片（剪贴板不可用时自动降级为下载）。
 * 自取自打数据，分享菜单与里程碑弹层共用。
 * 约定带子约定时，可在卡片上一并完整呈现子约定树（含次级及以下层级，按层级缩进；生成图前可开关），
 * 清单过长时还可一键隐藏已完成的子约定（头部仍保留 n/m 总览）。
 * 卡片过高时弹层可滚动查看（导出图始终完整），二维码区收敛为紧凑尺寸。
 */
export default function CheckinShareCard({ task, subtaskTree = [], onClose }) {
  const { data } = useCheckins(task.id);
  const total = data?.total ?? 0;
  const firstAt = data?.first_at;
  const items = data?.items || [];
  const bestNote = items.find((c) => c.note)?.note || null;
  const bestPhoto = items.find((c) => c.photo_url)?.photo_url || null;

  // 公开分享二维码：扫码进 /share/<token> 公开协作页，无需登录即可匿名留言
  const [shareUrl, setShareUrl] = useState(
    task?.share_token && typeof window !== "undefined"
      ? `${window.location.origin}/share/${task.share_token}`
      : ""
  );
  useEffect(() => {
    if (!task?.id || shareUrl) return;
    let cancelled = false;
    (async () => {
      try {
        const result = await httpRequest(`/api/public/share/generate/task/${task.id}`, {
          method: "POST",
          body: { enabled: true },
        });
        if (cancelled) return;
        if (result?.enabled && result.url) {
          setShareUrl(result.url.replace(/^https?:\/\/[^/]+/, window.location.origin));
        }
      } catch {
        // 二维码生成失败不阻塞卡片展示
      }
    })();
    return () => { cancelled = true; };
  }, [task?.id, shareUrl]);

  return (
    <ShareCardOverlay
      task={task}
      subtaskTree={subtaskTree}
      total={total}
      firstAt={firstAt}
      bestNote={bestNote}
      bestPhoto={bestPhoto}
      shareUrl={shareUrl}
      onClose={onClose}
    />
  );
}

function ShareCardOverlay({ task, subtaskTree = [], total, firstAt, bestNote, bestPhoto, shareUrl, onClose }) {
  const cardRef = useRef(null);
  const [exporting, setExporting] = useState(false);
  const [showSubtasks, setShowSubtasks] = useState(subtaskTree.length > 0);
  const [hideDone, setHideDone] = useState(false);
  const subDone = subtaskTree.filter(isTaskEffectivelyCompleted).length;
  const visibleTree = hideDone ? subtaskTree.filter((s) => !isTaskEffectivelyCompleted(s)) : subtaskTree;
  const nowIso = new Date().toISOString();
  // 打卡以天数计：精确到具体日期，并给出坚持天数，避免"2026.10—2026.10"这种同月区间
  const dayCount = firstAt
    ? Math.max(1, Math.floor((Date.now() - new Date(firstAt).getTime()) / 86400000) + 1)
    : 0;
  const range = firstAt
    ? `${formatShanghai(firstAt, "yyyy.M.d")} 起 · 第 ${dayCount} 天`
    : formatShanghai(nowIso, "yyyy.M.d");
  const isMilestone = total > 0 && CHECKIN_MILESTONES.includes(total);

  const saveImage = async () => {
    if (!cardRef.current || exporting) return;
    setExporting(true);
    try {
      const canvas = await html2canvas(cardRef.current, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
      const a = document.createElement("a");
      a.download = `心栈打卡-${task.title}-${total}次.png`;
      a.href = canvas.toDataURL("image/png");
      a.click();
      toast.success("打卡分享卡已保存到本地");
    } catch {
      toast.error("生成图片失败，请稍后再试");
    } finally {
      setExporting(false);
    }
  };

  const copyImage = async () => {
    if (!cardRef.current || exporting) return;
    setExporting(true);
    let blob = null;
    try {
      const canvas = await html2canvas(cardRef.current, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
      blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png", 0.95));
      if (!blob) throw new Error("图片生成失败");
      if (navigator.clipboard && navigator.clipboard.write && typeof ClipboardItem !== "undefined") {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        toast.success("打卡分享卡已复制到剪贴板");
      } else {
        throw new Error("UNSUPPORTED");
      }
    } catch {
      // Safari/部分浏览器拒绝图片剪贴板权限：自动降级为下载 PNG
      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `心栈打卡-${task.title}-${total}次.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        toast.success("浏览器限制了图片复制，已改为下载到本地");
      } else {
        toast.error("生成图片失败，请稍后再试");
      }
    } finally {
      setExporting(false);
    }
  };

  const exportBtnClass =
    "inline-flex items-center gap-1.5 rounded-full px-5 py-3 text-sm text-white shadow-lg hover:-translate-y-0.5 transition-transform disabled:opacity-60";

  return (
    <div
      className="fixed inset-0 z-[80] overflow-y-auto bg-stone-900/50 backdrop-blur-sm"
      onClick={(e) => { e.stopPropagation(); onClose(); }}
    >
      <div className="flex min-h-full flex-col items-center justify-center gap-4 p-4">
        <div
          ref={cardRef}
          onClick={(e) => e.stopPropagation()}
          className="w-[320px] overflow-hidden rounded-[24px] bg-white text-left shadow-2xl"
          style={{ fontFamily: "inherit" }}
        >
        {/* 头部：品牌深蓝渐变 + 大数字成就陈述 */}
        <div
          className="relative px-6 pt-5 pb-7"
          style={{ background: `linear-gradient(155deg, #2d3a5f 0%, ${CHECKIN_BRAND_PRIMARY} 48%, ${CHECKIN_BRAND_SECONDARY} 100%)` }}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] tracking-[.3em] text-white/70">心栈 SOULSENTRY</span>
            <span
              className="inline-flex h-8 w-8 rotate-[-12deg] items-center justify-center rounded-full border text-[8px] font-bold text-white/60 select-none"
              style={{ borderColor: "rgba(255,255,255,.3)", writingMode: "vertical-rl", letterSpacing: "0.12em" }}
            >
              如约
            </span>
          </div>

          <div className="mt-5 text-center">
            {total > 0 ? (
              <>
                <div className="text-[64px] font-extrabold leading-none text-white tabular-nums">{total}</div>
                <div className="mt-2 text-[11px] tracking-[.5em] text-white/75">次 赴 约</div>
              </>
            ) : (
              <>
                <div className="text-[34px] font-extrabold leading-tight text-white">第一次</div>
                <div className="mt-2 text-[11px] tracking-[.4em] text-white/75">赴 约 · 从 这 里 开 始</div>
              </>
            )}
          </div>

          <span className="absolute bottom-3 left-6 text-[10px] tracking-[.16em] text-white/60">
            {total > 0 ? `第 ${total} 次 · ` : ""}{formatShanghai(new Date().toISOString(), "yyyy年M月d日")}
          </span>
        </div>

        {/* 主体 */}
        <div className="px-6 pt-5 pb-5">
          {bestPhoto && (
            <div className="mb-4 overflow-hidden rounded-2xl border-4 border-white shadow-md ring-1 ring-stone-100">
              <img src={buildApiUrl(bestPhoto)} alt="" className="h-36 w-full object-cover" crossOrigin="anonymous" />
            </div>
          )}

          {isMilestone && (
            <span
              className="mb-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-wider"
              style={{ background: CHECKIN_BRAND_TINT, color: CHECKIN_BRAND_PRIMARY }}
            >
              🏅 {total} 次里程碑达成
            </span>
          )}

          <p className="text-[11px] tracking-wider text-stone-400">约定 · {task.title}</p>
          {showSubtasks && subtaskTree.length > 0 && (
            <div
              className="mt-3 rounded-2xl border px-3 py-2.5"
              style={{ borderColor: CHECKIN_BRAND_TINT, background: "#F7F9FE" }}
            >
              <p className="text-[10px] font-semibold tracking-wide" style={{ color: CHECKIN_BRAND_PRIMARY }}>
                子约定 · 已完成 {subDone}/{subtaskTree.length}
              </p>
              <ul className="mt-1.5 space-y-1">
                {visibleTree.map((s) => {
                  const done = isTaskEffectivelyCompleted(s);
                  return (
                    <li
                      key={s.id}
                      className="flex items-center gap-1.5 text-[11px] leading-snug"
                      style={{ paddingLeft: (s.depth || 0) * 12 }}
                    >
                      <span
                        className="flex h-3 w-3 flex-shrink-0 items-center justify-center rounded-full border"
                        style={
                          done
                            ? { background: "#22c55e", borderColor: "#22c55e", color: "#ffffff" }
                            : { borderColor: "#d6d3d1", color: "#a8a29e" }
                        }
                      >
                        {done && <Check className="h-2 w-2" />}
                      </span>
                      <span
                        className="min-w-0 truncate"
                        style={{ color: done ? "#a8a29e" : "#44403c" }}
                      >
                        {s.title}
                      </span>
                    </li>
                  );
                })}
                {visibleTree.length === 0 && (
                  <li className="text-[10px]" style={{ color: "#a8a29e" }}>
                    {subtaskTree.length} 条子约定已全部完成
                  </li>
                )}
              </ul>
            </div>
          )}
          {total === 0 && (
            <h4 className="mt-1 text-[19px] font-bold leading-snug text-stone-800">
              这一份约定，才刚刚开始。
            </h4>
          )}
          <p className={`${total === 0 ? "mt-1.5" : "mt-2"} text-[11px] tracking-wider text-stone-400`}>{range}</p>

          {bestNote && (
            <p
              className="mt-4 border-l-2 pl-3 text-[13px] leading-relaxed text-stone-500"
              style={{ borderColor: CHECKIN_BRAND_TINT }}
            >
              「{bestNote}」
            </p>
          )}
          <p className="mt-3 text-[13px] font-medium" style={{ color: CHECKIN_BRAND_PRIMARY }}>
            ——心栈记 · {MILESTONE_QUOTES[total] || "每一次都算数。"}
          </p>
        </div>

        {/* 底部：二维码（扫码匿名留言），文字单行对齐 */}
        <div
          className="flex items-center gap-3 border-t px-6 py-3"
          style={{ borderColor: CHECKIN_BRAND_TINT, background: "#F7F9FE" }}
        >
          {shareUrl ? (
            <div className="rounded-lg border bg-white p-1" style={{ borderColor: CHECKIN_BRAND_TINT }}>
              <QRCodeImage value={shareUrl} size={120} alt="扫码匿名留言" className="h-12 w-12" />
            </div>
          ) : null}
          <p className="whitespace-nowrap text-[10px] text-stone-500">
            扫码赴约 · 无需登录 · 匿名留言
          </p>
        </div>
      </div>

        <div className="flex flex-wrap items-center justify-center gap-3 pb-2" onClick={(e) => e.stopPropagation()}>
          {subtaskTree.length > 0 && (
            <button
              onClick={() => setShowSubtasks((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] transition-colors"
              style={
                showSubtasks
                  ? { borderColor: CHECKIN_BRAND_PRIMARY, background: CHECKIN_BRAND_PRIMARY, color: "#ffffff" }
                  : { borderColor: "rgba(255,255,255,.5)", background: "transparent", color: "rgba(255,255,255,.85)" }
              }
            >
              <ListChecks className="h-3.5 w-3.5" />
              卡片含子约定
            </button>
          )}
          {subtaskTree.length > 0 && subDone > 0 && (
            <button
              onClick={() => setHideDone((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] transition-colors"
              style={
                hideDone
                  ? { borderColor: "#57534e", background: "#57534e", color: "#ffffff" }
                  : { borderColor: "rgba(255,255,255,.5)", background: "transparent", color: "rgba(255,255,255,.85)" }
              }
            >
              <EyeOff className="h-3.5 w-3.5" />
              隐藏已完成
            </button>
          )}
          <button
            onClick={saveImage}
            disabled={exporting}
            className={exportBtnClass}
            style={{ background: `linear-gradient(90deg, ${CHECKIN_BRAND_PRIMARY}, ${CHECKIN_BRAND_SECONDARY})`, boxShadow: "0 10px 24px -8px rgba(56,72,119,.5)" }}
          >
            <Download className="h-4 w-4" />
            {exporting ? "生成中…" : "保存图片"}
          </button>
          <button
            onClick={copyImage}
            disabled={exporting}
            className={exportBtnClass}
            style={{ background: "linear-gradient(90deg, #4a5f94, #6b83b8)", boxShadow: "0 10px 24px -8px rgba(56,72,119,.4)" }}
          >
            <Copy className="h-4 w-4" />
            {exporting ? "生成中…" : "复制图片"}
          </button>
          <button onClick={onClose} className="px-2 py-3 text-[13px] text-stone-300 hover:text-stone-100">
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
