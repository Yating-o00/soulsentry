import React, { useRef, useState } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import html2canvas from "html2canvas";
import { Download } from "lucide-react";
import { buildApiUrl } from "@/api/httpClient";
import { useCheckins } from "@/components/checkins/useCheckins";

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
 * 打卡分享卡：包含打卡内容（累计次数、时间区间、最佳附言、最佳照片），
 * 使用品牌主色 (#384877)，给打卡人成就感。
 * 自取自打数据，分享菜单与里程碑弹层共用。
 */
export default function CheckinShareCard({ task, onClose }) {
  const { data } = useCheckins(task.id);
  const total = data?.total ?? 0;
  const firstAt = data?.first_at;
  const items = data?.items || [];
  const bestNote = items.find((c) => c.note)?.note || null;
  const bestPhoto = items.find((c) => c.photo_url)?.photo_url || null;

  return (
    <ShareCardOverlay
      task={task}
      total={total}
      firstAt={firstAt}
      bestNote={bestNote}
      bestPhoto={bestPhoto}
      onClose={onClose}
    />
  );
}

function ShareCardOverlay({ task, total, firstAt, bestNote, bestPhoto, onClose }) {
  const cardRef = useRef(null);
  const [exporting, setExporting] = useState(false);
  const range = firstAt
    ? `${format(new Date(firstAt), "yyyy.MM")} — ${format(new Date(), "yyyy.MM")}`
    : format(new Date(), "yyyy.MM");

  const saveImage = async () => {
    if (!cardRef.current || exporting) return;
    setExporting(true);
    try {
      const canvas = await html2canvas(cardRef.current, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
      const a = document.createElement("a");
      a.download = `心栈打卡-${task.title}-${total}次.png`;
      a.href = canvas.toDataURL("image/png");
      a.click();
      toast.success("分享卡已保存到本地");
    } catch {
      toast.error("生成图片失败，请稍后再试");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex flex-col items-center justify-center gap-4 bg-stone-900/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div ref={cardRef} onClick={(e) => e.stopPropagation()} className="w-[320px] rounded-3xl overflow-hidden bg-white text-left shadow-2xl">
        {/* 头部：品牌蓝渐变 + 最佳打卡照片 */}
        <div
          className="h-44 relative flex items-center justify-center"
          style={{ background: `linear-gradient(135deg, ${CHECKIN_BRAND_PRIMARY} 0%, ${CHECKIN_BRAND_SECONDARY} 55%, #7288b8 100%)` }}
        >
          {bestPhoto ? (
            <img src={buildApiUrl(bestPhoto)} alt="" className="w-full h-full object-cover" crossOrigin="anonymous" />
          ) : (
            <span className="text-5xl" style={{ filter: "drop-shadow(0 6px 16px rgba(0,0,0,.25))" }}>👣</span>
          )}
          <span className="absolute bottom-3 left-4 text-white text-[11px] tracking-[.16em] opacity-90">
            {total > 0 ? `第 ${total} 次 · ` : "从第一次开始 · "}{format(new Date(), "M月d日")}
          </span>
          <span
            className="absolute top-3 right-3 text-white text-[10px] tracking-[.2em] px-2 py-1 rounded-full"
            style={{ background: "rgba(255,255,255,.18)", backdropFilter: "blur(4px)" }}
          >
            如 约
          </span>
        </div>
        <div className="px-6 pt-6 pb-4">
          {total > 0 && CHECKIN_MILESTONES.includes(total) && (
            <span
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-wider mb-3"
              style={{ background: CHECKIN_BRAND_TINT, color: CHECKIN_BRAND_PRIMARY }}
            >
              🏅 {total} 次里程碑达成
            </span>
          )}
          <h4 className="text-[21px] font-bold leading-snug text-stone-800">
            {total > 0 ? `${total} 次，你都赴约了。` : "这一份约定，才刚刚开始。"}
          </h4>
          <p className="text-xs text-stone-400 mt-2 tracking-wider">{range}</p>
          {bestNote && (
            <p className="mt-4 pl-3 border-l-[3px] text-[13.5px] text-stone-500 leading-relaxed" style={{ borderColor: CHECKIN_BRAND_TINT }}>
              「{bestNote}」
            </p>
          )}
          <p className="mt-3 text-[13.5px] font-medium" style={{ color: CHECKIN_BRAND_PRIMARY }}>
            ——心栈记 · {MILESTONE_QUOTES[total] || "每一次都算数。"}
          </p>
        </div>
        <div className="flex items-center justify-between px-6 py-3 border-t" style={{ borderColor: CHECKIN_BRAND_TINT, background: "#F7F9FE" }}>
          <small className="text-[11px] text-stone-400 tracking-wider">约定 · {task.title}</small>
          <small className="text-[11px] text-stone-300">心栈 SOULSENTRY</small>
        </div>
      </div>
      <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={saveImage}
          disabled={exporting}
          className="inline-flex items-center gap-1.5 rounded-full px-6 py-3 text-sm text-white shadow-lg hover:-translate-y-0.5 transition-transform disabled:opacity-60"
          style={{ background: `linear-gradient(90deg, ${CHECKIN_BRAND_PRIMARY}, ${CHECKIN_BRAND_SECONDARY})`, boxShadow: "0 10px 24px -8px rgba(56,72,119,.5)" }}
        >
          <Download className="w-4 h-4" />
          {exporting ? "生成中…" : "保存图片"}
        </button>
        <button onClick={onClose} className="text-[13px] text-stone-300 hover:text-stone-100 px-2 py-3">
          关闭
        </button>
      </div>
    </div>
  );
}
