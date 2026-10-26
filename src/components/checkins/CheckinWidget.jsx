import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { formatShanghai } from "@/lib/timeCore";
import { isTaskEffectivelyCompleted } from "@/lib/taskStatus";
import { X, Footprints, Camera, ListChecks, ChevronDown, ChevronUp, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { buildApiUrl } from "@/api/httpClient";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  useCheckins,
  useCreateCheckin,
  usePatchCheckin,
  uploadCheckinPhoto,
} from "@/components/checkins/useCheckins";
import CheckinShareCard, {
  CHECKIN_BRAND_PRIMARY,
  CHECKIN_BRAND_SECONDARY,
  CHECKIN_BRAND_TINT,
  CHECKIN_MILESTONES,
  MILESTONE_QUOTES,
} from "@/components/checkins/CheckinShareCard";

/**
 * 约定打卡小组件：同一个约定，每多做到一次就点一次。
 * - 点一下 = 一次打卡（最便捷），随后可补一句话或一张照片，也可以什么都不留
 * - 累计次数实时翻转，里程碑（1/7/21/50/100/365 次）弹出成就卡，可生成分享卡
 * - 「赴约记录」抽屉：每一次打卡的时间、附言、照片
 * - 约定带子约定时，打卡按钮下方可展开只读的子约定明细（标题 + 完成状态）
 */

function checkinReply(total, note) {
  const withNote = [
    `「${note}」——这句话值得留着。`,
    `记下了。第 ${total} 次赴约，连同这句话。`,
    "好。以后翻到这一次，你会想起今天的自己。",
  ];
  const bare = [
    `第 ${total} 次赴约，记下了。`,
    "好，又完成了一次。不用说什么，到就够了。",
    `收到。${total} 次了。`,
  ];
  const pool = note ? withNote : bare;
  return pool[total % pool.length];
}

export default function CheckinWidget({ task, completed = false, subtaskTree = [] }) {
  const { data } = useCheckins(task.id, { enabled: !completed });
  const createMut = useCreateCheckin(task.id);
  const patchMut = usePatchCheckin(task.id);

  const [justDone, setJustDone] = useState(false);
  const [flip, setFlip] = useState(false);
  const [pending, setPending] = useState(null); // { id, total } 待补记的当次打卡
  const [note, setNote] = useState("");
  const [photoUrl, setPhotoUrl] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [milestone, setMilestone] = useState(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);

  const total = data?.total ?? 0;
  const firstAt = data?.first_at;
  const cheerTotal = data?.cheer_total ?? 0;
  const items = useMemo(() => data?.items || [], [data]);
  const subDone = subtaskTree.filter(isTaskEffectivelyCompleted).length;

  const doCheckin = () => {
    if (completed || createMut.isPending) return;
    createMut.mutate(
      {},
      {
        onSuccess: (res) => {
          setJustDone(true);
          setFlip(true);
          setTimeout(() => setFlip(false), 550);
          setNote("");
          setPhotoUrl(null);
          setPending({ id: res.id, total: res.total });
          if (CHECKIN_MILESTONES.includes(res.total)) {
            setTimeout(() => setMilestone(res.total), 700);
          }
        },
        onError: () => toast.error("打卡失败，请稍后再试"),
      }
    );
  };

  const finishPending = (withNote) => {
    if (!pending) return;
    const trimmed = withNote ? note.trim() : "";
    const done = () => {
      toast.success(checkinReply(pending.total, trimmed), { duration: 3000 });
      setPending(null);
    };
    if (trimmed || photoUrl) {
      patchMut.mutate(
        { checkinId: pending.id, data: { note: trimmed || undefined, photo_url: photoUrl || undefined } },
        { onSuccess: done, onError: done }
      );
    } else {
      done();
    }
  };

  const pickPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadCheckinPhoto(file);
      if (url) setPhotoUrl(url);
      else toast.error("照片上传失败");
    } catch {
      toast.error("照片上传失败");
    } finally {
      setUploading(false);
    }
  };

  const nextMilestone = CHECKIN_MILESTONES.find((m) => total < m);
  const checkinTitle = completed
    ? "约定已完成"
    : nextMilestone
      ? `打卡：记录这次赴约（距 ${nextMilestone} 次里程碑还差 ${nextMilestone - total} 次）`
      : "打卡：记录这次赴约（已集齐全部里程碑，继续！）";

  const metaText = total > 0
    ? `已打卡 ${total} 次${firstAt ? ` · 从 ${formatShanghai(firstAt, "M月d日")} 开始` : ""}`
    : null;

  return (
    <>
      <div className="relative flex flex-col items-center gap-1">
        <button
          onClick={doCheckin}
          disabled={completed || createMut.isPending}
          title={checkinTitle}
          className={cn(
            "relative w-11 h-11 rounded-full border-2 flex items-center justify-center transition-all duration-300",
            completed
              ? "border-stone-100 bg-stone-50 text-stone-300 cursor-not-allowed"
              : justDone
                ? "border-transparent bg-gradient-to-br from-[#3b5aa2] to-[#384877] text-white shadow-lg shadow-[#384877]/30"
                : "border-[#c9d5ef] bg-white text-[#384877] hover:border-[#384877] hover:bg-[#EEF2FF] hover:shadow-lg hover:shadow-[#384877]/15 hover:-translate-y-0.5"
          )}
        >
          <Footprints className={cn("w-5 h-5", justDone && "hidden")} />
          {/* 打卡完成 = 盖下一枚「如约」印记，而非普通对勾 */}
          <span
            className={cn("hidden text-[8px] font-bold leading-none text-white select-none", justDone && "inline-flex")}
            style={{ writingMode: "vertical-rl", letterSpacing: "0.1em" }}
          >
            如约
          </span>
          {!justDone && !completed && (
            <span
              className="absolute inset-0 rounded-full border-2 border-[#8fa3cf] animate-ping opacity-30 pointer-events-none"
              style={{ animationDuration: "2.8s" }}
            />
          )}
        </button>
        {metaText && (
          <button
            onClick={() => setTimelineOpen(true)}
            title="查看赴约记录"
            className="text-[10px] whitespace-nowrap text-center text-[#384877] hover:text-[#2d3a5f] underline-offset-2 hover:underline"
          >
            {metaText}
          </button>
        )}
        {cheerTotal > 0 && (
          <span className="text-[10px] whitespace-nowrap text-center text-[#b0722d]" title="访客在分享页为 TA 加油的累计">
            👏 加油 {cheerTotal}
          </span>
        )}
        {subtaskTree.length > 0 && (
          <Popover open={detailOpen} onOpenChange={setDetailOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                title="展开子约定明细"
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] whitespace-nowrap transition-colors",
                  detailOpen
                    ? "border-[#c9d5ef] bg-[#EEF2FF] text-[#2d3a5f]"
                    : "border-transparent text-[#384877] hover:text-[#2d3a5f] hover:bg-[#EEF2FF]"
                )}
              >
                <ListChecks className="w-3 h-3" />
                子约定 {subDone}/{subtaskTree.length}
                {detailOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" sideOffset={6} className="w-60 rounded-2xl bg-white p-3">
              <p className="mb-2 text-[10px] font-medium tracking-wide" style={{ color: CHECKIN_BRAND_PRIMARY }}>
                子约定 · 已完成 {subDone}/{subtaskTree.length}
              </p>
              <ul className="max-h-64 space-y-1.5 overflow-y-auto">
                {subtaskTree.map((s) => {
                  const done = isTaskEffectivelyCompleted(s);
                  return (
                    <li key={s.id} className="flex items-start gap-2" style={{ paddingLeft: (s.depth || 0) * 14 }}>
                      <span
                        className={cn(
                          "mt-0.5 flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-full border",
                          done ? "border-green-500 bg-green-500 text-white" : "border-stone-300 bg-white"
                        )}
                      >
                        {done && <Check className="w-2 h-2" />}
                      </span>
                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate text-xs",
                          done ? "text-stone-400 line-through" : "text-stone-700"
                        )}
                      >
                        {s.title}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </PopoverContent>
          </Popover>
        )}
      </div>

      {/* 附言弹层：点完打卡后 optionally 留一句话/一张照片 */}
      {pending && (
        <div
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-slate-900/40 backdrop-blur-[2px] p-4"
          onClick={(e) => { e.stopPropagation(); finishPending(false); }}
        >
          <div
            className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[13px] text-stone-500 mb-1">
              这是第 <b className="text-stone-800">{pending.total}</b> 次赴约。
            </p>
            {(() => {
              const nm = CHECKIN_MILESTONES.find((m) => pending.total < m);
              return nm ? (
                <p className="text-[11px] mb-2" style={{ color: CHECKIN_BRAND_SECONDARY }}>
                  再赴约 {nm - pending.total} 次，就到 {nm} 次里程碑。
                </p>
              ) : null;
            })()}
            <p className="text-sm text-stone-800 font-medium mb-3">
              这次想留点什么吗？<span className="text-stone-400 font-normal">也可以什么都不留。</span>
            </p>
            {photoUrl && (
              <div className="mb-3 rounded-2xl overflow-hidden bg-stone-100 h-32 flex items-center justify-center">
                <img src={buildApiUrl(photoUrl)} alt="打卡照片" className="w-full h-full object-cover" />
              </div>
            )}
            <div className="flex gap-2 mb-1">
              <input
                autoFocus
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && finishPending(true)}
                placeholder="一句话就好…"
                className="flex-1 border-[1.5px] border-stone-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-[#384877] bg-[#F8F9FD]"
              />
              <label
                className={cn(
                  "w-11 rounded-xl border-[1.5px] border-stone-200 bg-[#F8F9FD] flex items-center justify-center cursor-pointer transition-colors hover:border-[#384877] hover:bg-[#EEF2FF]",
                  uploading && "opacity-50 pointer-events-none"
                )}
                title="加一张照片"
              >
                <Camera className="w-4 h-4 text-stone-500" />
                <input type="file" accept="image/*" className="hidden" onChange={pickPhoto} disabled={uploading} />
              </label>
            </div>
            <div className="flex items-center justify-between mt-3">
              <button
                onClick={() => finishPending(false)}
                className="text-[13px] text-stone-400 hover:text-stone-600 px-1 py-1.5"
              >
                就这样吧 →
              </button>
              <button
                onClick={() => finishPending(true)}
                disabled={patchMut.isPending || uploading}
                className="bg-stone-800 text-white rounded-full px-5 py-2 text-[13px] hover:bg-[#384877] transition-colors disabled:opacity-50"
              >
                {patchMut.isPending || uploading ? "收好…" : "收下这句话"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 赴约记录抽屉 */}
      {timelineOpen && (
        <>
          <div className="fixed inset-0 bg-slate-900/30 z-40" onClick={(e) => { e.stopPropagation(); setTimelineOpen(false); }} />
          <aside
            className="fixed top-0 right-0 bottom-0 w-[min(420px,92vw)] bg-[#F8F9FD] z-50 shadow-2xl flex flex-col animate-in slide-in-from-right duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative px-6 pt-7 pb-4 border-b border-stone-100">
              <button
                onClick={() => setTimelineOpen(false)}
                className="absolute top-5 right-5 w-8 h-8 rounded-full bg-stone-100 text-stone-500 flex items-center justify-center hover:bg-stone-200"
              >
                <X className="w-4 h-4" />
              </button>
              <h3 className="text-[16px] font-semibold text-stone-800 pr-8 truncate">{task.title}</h3>
              <p className="text-xs text-stone-400 mt-1.5">
                已赴约 <span className="font-bold" style={{ color: CHECKIN_BRAND_PRIMARY }}>{total}</span> 次
                {firstAt && ` · 从 ${formatShanghai(firstAt, "yyyy年M月d日")} 开始`}
              </p>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 relative">
              {items.length === 0 ? (
                <p className="text-center text-stone-400 text-sm py-10">还没有记录，点上方小脚印开始第一次打卡</p>
              ) : (
                <div className="relative">
                  <div className="absolute left-[7px] top-3 bottom-3 w-px" style={{ background: CHECKIN_BRAND_TINT }} />
                  {items.map((c) => (
                    <div key={c.id} className="relative pl-8 pb-6">
                      <span className="absolute left-0 top-1 w-[15px] h-[15px] rounded-full bg-white border-2 flex items-center justify-center" style={{ borderColor: CHECKIN_BRAND_SECONDARY }}>
                        <span className="w-[5px] h-[5px] rounded-full" style={{ background: CHECKIN_BRAND_SECONDARY }} />
                      </span>
                      <p className="text-[11px] text-stone-400">
                        {formatShanghai(c.created_at, "M月d日 HH:mm")}
                      </p>
                      {c.note && (
                        <p className="mt-1.5 text-[13.5px] leading-relaxed text-stone-700 bg-white rounded-2xl rounded-tl-sm px-3.5 py-2.5 shadow-sm">
                          {c.note}
                        </p>
                      )}
                      {c.photo_url && (
                        <div className="mt-2 rounded-xl overflow-hidden bg-stone-100 h-24 w-40">
                          <img src={buildApiUrl(c.photo_url)} alt="打卡照片" className="w-full h-full object-cover" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </aside>
        </>
      )}

      {/* 里程碑成就 */}
      {milestone && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-stone-900/45 backdrop-blur-sm p-5"
          onClick={(e) => { e.stopPropagation(); setMilestone(null); }}
        >
          <div
            className="relative w-full max-w-[400px] rounded-[28px] px-8 pt-12 pb-8 text-center overflow-hidden shadow-2xl"
            style={{ background: "linear-gradient(160deg,#F5F7FD,#EEF2FF)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setMilestone(null)}
              className="absolute top-4 right-5 text-stone-300 hover:text-stone-500 text-lg"
            >
              <X className="w-5 h-5" />
            </button>
            <div
              className="absolute -top-16 left-1/2 -translate-x-1/2 w-64 h-64 rounded-full pointer-events-none"
              style={{ background: "radial-gradient(circle,rgba(56,72,119,.18),transparent 65%)" }}
            />
            <p className="text-[12px] tracking-[.3em] mb-3" style={{ color: CHECKIN_BRAND_PRIMARY }}>里 程 碑</p>
            <MilestoneCount target={milestone} />
            <p className="text-[15px] text-stone-500 mt-2">次，你都赴约了</p>
            <p className="text-[15px] leading-loose text-stone-700 mt-5 pt-4 border-t" style={{ borderColor: CHECKIN_BRAND_TINT }}>
              <span className="font-medium" style={{ color: CHECKIN_BRAND_PRIMARY }}>——心栈记 · </span>
              {MILESTONE_QUOTES[milestone]}
            </p>
            <div className="flex items-center justify-center gap-3 mt-7">
              <button
                onClick={() => { setShareOpen(true); }}
                className="rounded-full px-6 py-3 text-sm text-white bg-gradient-to-r from-[#3b5aa2] to-[#384877] shadow-lg shadow-[#384877]/40 hover:-translate-y-0.5 transition-transform"
              >
                生成分享卡
              </button>
              <button onClick={() => setMilestone(null)} className="text-[13px] text-stone-400 hover:text-stone-600 px-2 py-3">
                默默记下
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 分享卡 */}
      {shareOpen && (
        <CheckinShareCard
          task={task}
          subtaskTree={subtaskTree}
          onClose={() => { setShareOpen(false); setMilestone(null); }}
        />
      )}
    </>
  );
}

function MilestoneCount({ target }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    let cur = 0;
    const iv = setInterval(() => {
      cur += 1;
      setN(cur);
      if (cur >= target) clearInterval(iv);
    }, Math.max(30, Math.min(90, 1600 / target)));
    return () => clearInterval(iv);
  }, [target]);
  return (
    <span className="text-[68px] leading-none font-extrabold text-stone-800 tabular-nums">{n}</span>
  );
}
