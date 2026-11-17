import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, Clock, Footprints, Loader2, Pin, Repeat } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { isRecurringTask } from "@/lib/taskStatus";
import { formatShanghaiTime } from "@/lib/timeCore";
import { useCreateCheckin } from "@/components/checkins/useCheckins";

// 触屏设备（无 hover 能力）：此时悬停展开不生效，退化为「首触点展开、再点进详情」
const isTouchLike = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(hover: none)").matches;

/**
 * 约定卡片的极简折叠容器：
 * - 平时只渲染一行摘要（完成/打卡圆钮 + 标题 + 时间），列表保持紧凑
 * - 桌面端鼠标悬停自动展开完整卡片，移开自动收起
 * - 触屏（手机 Web）首次点按摘要行展开；展开后再次点击摘要行进入约定详情
 * - 摘要行的圆钮始终可用（勾选完成 / 打卡），不会触发展开
 * 完整卡片以 children 传入，渲染时去掉其自身边框/阴影/圆角，与摘要行合成一张卡。
 */
export default function CollapsibleTaskCard({ task, onToggleDone, onOpenDetail, children }) {
  const [open, setOpen] = useState(false);
  // 展开区内一旦发生交互（点按钮/开下拉菜单）即固定展开：
  // 否则鼠标移向 portal 弹层（渲染在卡片 DOM 之外）会触发 mouseleave 把卡片连同菜单一起收起
  const [pinned, setPinned] = useState(false);
  const queryClient = useQueryClient();
  const isCheckin = task.category === "checkin";
  const recurring = isRecurringTask(task);
  const done =
    recurring || isCheckin
      ? !!task.done_today || task.status === "completed"
      : task.status === "completed";
  const createCheckin = useCreateCheckin(task.id);

  const handleSummaryClick = () => {
    if (!open) setOpen(true);
    else if (onOpenDetail) onOpenDetail();
  };

  const handleCircleClick = (e) => {
    e.stopPropagation();
    if (isCheckin) {
      if (done || createCheckin.isPending) return;
      createCheckin.mutate(
        {},
        {
          onSuccess: () => {
            toast.success("打卡成功，又赴约一次～");
            queryClient.invalidateQueries({ queryKey: ["tasks"] });
          },
          onError: (err) => toast.error(err?.message || "打卡没成功，再点一下试试"),
        }
      );
      return;
    }
    if (onToggleDone) onToggleDone(task, !done);
  };

  return (
    <div
      onMouseEnter={() => {
        if (!isTouchLike()) setOpen(true);
      }}
      onMouseLeave={() => {
        if (!isTouchLike() && !pinned) setOpen(false);
      }}
      className={cn(
        "bg-white rounded-2xl border border-stone-200/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden transition-colors duration-300 hover:border-stone-300",
        done && !open && "opacity-60"
      )}
    >
      {/* 极简摘要行：收起时点击展开；展开后再次点击进入详情 */}
      <div
        role="button"
        tabIndex={0}
        onClick={handleSummaryClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleSummaryClick();
          }
        }}
        title={open ? "查看约定详情" : "展开约定"}
        className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none"
      >
        {/* 完成 / 打卡圆钮：独立于展开逻辑，随时可点 */}
        <button
          type="button"
          onClick={handleCircleClick}
          disabled={isCheckin && (done || createCheckin.isPending)}
          title={
            isCheckin
              ? done
                ? "今日已赴约"
                : "打卡：记录这次赴约"
              : done
                ? "恢复为未完成"
                : "完成约定"
          }
          className={cn(
            "w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors",
            done
              ? "bg-emerald-500 border-emerald-500 text-white"
              : isCheckin
                ? "border-[#c9d5ef] text-[#384877] hover:border-[#384877] hover:bg-[#EEF2FF]"
                : "border-stone-300 text-transparent hover:border-emerald-400 hover:text-emerald-400"
          )}
        >
          {isCheckin ? (
            createCheckin.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : done ? (
              <Check className="w-3.5 h-3.5" />
            ) : (
              <Footprints className="w-3.5 h-3.5" />
            )
          ) : (
            <Check className="w-3.5 h-3.5" />
          )}
        </button>

        <span
          className={cn(
            "flex-1 min-w-0 truncate text-[15px] font-medium",
            done ? "text-stone-400 line-through" : "text-stone-800"
          )}
        >
          {task.title}
        </span>

        {task.pinned_at && <Pin className="w-3.5 h-3.5 text-[#384877] flex-shrink-0" />}
        {recurring && <Repeat className="w-3.5 h-3.5 text-stone-400 flex-shrink-0" />}
        {task.reminder_time && (
          <span className="hidden sm:inline-flex items-center gap-1 text-xs text-stone-400 tabular-nums flex-shrink-0">
            <Clock className="w-3 h-3" />
            {formatShanghaiTime(task.reminder_time)}
          </span>
        )}

        {/* 收起/展开小箭头：触屏上收起用（桌面 hover 收起用不到）；收起时解除固定 */}
        <button
          type="button"
          aria-label={open ? "收起约定" : "展开约定"}
          onClick={(e) => {
            e.stopPropagation();
            if (open) setPinned(false);
            setOpen((v) => !v);
          }}
          className="w-6 h-6 flex items-center justify-center flex-shrink-0 text-stone-300 hover:text-stone-500 transition-colors"
        >
          <ChevronDown
            className={cn("w-4 h-4 transition-transform duration-300", open && "rotate-180")}
          />
        </button>
      </div>

      {/* 展开区：完整卡片（去掉自身边框/阴影/圆角，与摘要行合成一张卡）。
          区内任何交互（pointer/focus，含打开弹层）都会固定展开，保证卡片上的功能都能点到 */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
            onPointerEnter={() => setPinned(true)}
            onPointerDownCapture={() => setPinned(true)}
            onFocusCapture={() => setPinned(true)}
          >
            <div className="border-t border-stone-100 [&>div]:!rounded-none [&>div]:!border-0 [&>div]:!shadow-none">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
