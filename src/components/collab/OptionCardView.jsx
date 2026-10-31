// Agent 选项卡：联网检索得到的候选方案（机票/酒店/门票/餐厅/礼物…）
// 排版：头部（领域+需求口径）→ 直达预订 → 候选列表（排名/标题/价格/标签/决策区）→ 操作提示
import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  BedDouble, Check, ExternalLink, Gift, LayoutGrid, Plane, ThumbsDown, ThumbsUp, Ticket, UtensilsCrossed,
} from "lucide-react";
import { httpRequest } from "@/api/httpClient";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { C } from "./constants";

const DOMAIN_META = {
  flight: { label: "机票候选", Icon: Plane },
  hotel: { label: "酒店候选", Icon: BedDouble },
  ticket: { label: "门票候选", Icon: Ticket },
  food: { label: "餐厅候选", Icon: UtensilsCrossed },
  gift: { label: "礼物候选", Icon: Gift },
  other: { label: "候选方案", Icon: LayoutGrid },
};

export default function OptionCardView({ taskId, commentId, card, currentUserId }) {
  const queryClient = useQueryClient();
  const [pendingKey, setPendingKey] = useState(null);
  const options = Array.isArray(card?.options) ? card.options : [];
  const choices = card?.choices || {};
  const my = choices[currentUserId] || null;
  const { label: domainLabel, Icon: DomainIcon } = DOMAIN_META[card?.domain] || DOMAIN_META.other;

  const choose = async (optionId, action) => {
    const key = `${optionId}:${action}`;
    setPendingKey(key);
    try {
      await httpRequest(
        `/api/collab/${taskId}/messages/${commentId}/options/${encodeURIComponent(optionId)}/choice`,
        { method: "POST", body: { action } }
      );
      await queryClient.invalidateQueries({ queryKey: ["collab", taskId] });
    } catch (error) {
      toast.error(error?.message || "操作失败，请重试");
    } finally {
      setPendingKey(null);
    }
  };

  const adoptCountOf = (optId) => Object.values(choices).filter((c) => c?.adopt === optId).length;
  const maxAdopts = Math.max(0, ...options.map((o) => adoptCountOf(o.id)));

  if (options.length === 0) return null;
  return (
    <div
      className="mt-2 overflow-hidden rounded-xl border"
      style={{ borderColor: C.lineSoft, backgroundColor: "#fff" }}
    >
      {/* 头部：领域 + 需求口径 */}
      <div
        className="flex items-center gap-2 border-b px-3.5 py-2"
        style={{ borderColor: C.lineSoft, backgroundColor: C.brandTint }}
      >
        <DomainIcon className="h-3.5 w-3.5 shrink-0" style={{ color: "#384877" }} />
        <span className="shrink-0 text-[11px] font-semibold" style={{ color: "#384877" }}>
          {domainLabel}
        </span>
        {card.query && (
          <>
            <span className="h-3 w-px shrink-0" style={{ backgroundColor: "#c7cde8" }} />
            <span className="truncate text-[11px]" style={{ color: "#5b6a94" }} title={card.query}>
              {card.query}
            </span>
          </>
        )}
      </div>

      {/* 直达预订：带参深链，打开即可下单/比价 */}
      {Array.isArray(card.bookingLinks) && card.bookingLinks.length > 0 && (
        <div
          className="flex flex-wrap items-center gap-2 border-b px-3.5 py-2"
          style={{ borderColor: C.lineSoft, backgroundColor: "#fdfcf9" }}
        >
          <span className="shrink-0 text-[10px]" style={{ color: "#8a867e" }}>直达预订</span>
          {card.bookingLinks.map((bl) => (
            <a
              key={bl.url}
              href={bl.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10.5px] font-medium text-white transition-opacity hover:opacity-90 min-h-7"
              style={{ backgroundColor: "#384877" }}
            >
              {bl.label}<ExternalLink className="h-2.5 w-2.5" />
            </a>
          ))}
        </div>
      )}

      {/* 候选列表 */}
      <div>
        {options.map((opt, idx) => {
          const adoptCount = adoptCountOf(opt.id);
          const discardCount = Object.values(choices).filter(
            (c) => Array.isArray(c?.discard) && c.discard.includes(opt.id)
          ).length;
          const myAdopt = my?.adopt === opt.id;
          const myDiscard = Array.isArray(my?.discard) && my.discard.includes(opt.id);
          const leading = !myAdopt && adoptCount > 0 && adoptCount === maxAdopts;
          return (
            <div
              key={opt.id}
              className="border-t px-3.5 py-3 first:border-t-0"
              style={{ borderColor: "#f0eee8" }}
            >
              {/* 第一行：排名 + 标题 …… 价格 */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-2">
                  <span
                    className="mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold"
                    style={{
                      width: 18, height: 18,
                      backgroundColor: myAdopt ? "#384877" : "#efefe9",
                      color: myAdopt ? "#fff" : "#77736c",
                    }}
                  >
                    {idx + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[12.5px] font-semibold leading-5" style={{ color: "#302c2a" }}>
                        {opt.title}
                      </span>
                      {leading && (
                        <span className="rounded-full bg-emerald-50 px-1.5 py-px text-[9.5px] font-medium text-emerald-700">
                          领先
                        </span>
                      )}
                      {myAdopt && (
                        <span
                          className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-px text-[9.5px] font-medium"
                          style={{ backgroundColor: C.brandTint, color: "#384877" }}
                        >
                          <Check className="h-2.5 w-2.5" />我的选择
                        </span>
                      )}
                    </div>
                    {opt.summary && (
                      <p className="mt-0.5 text-[11.5px] leading-5" style={{ color: "#8a867e" }}>
                        {opt.summary}
                      </p>
                    )}
                  </div>
                </div>
                {opt.price && (
                  <span className="shrink-0 text-right text-[13px] font-semibold leading-5" style={{ color: "#384877" }}>
                    {opt.price}
                  </span>
                )}
              </div>

              {/* 第二行：亮点 / 注意点标签 */}
              {(opt.points?.length > 0 || opt.concerns?.length > 0) && (
                <div className="mt-1.5 flex flex-wrap gap-1.5 pl-[26px]">
                  {opt.points.map((p, i) => (
                    <span
                      key={`p${i}`}
                      className="rounded-md px-1.5 py-0.5 text-[10.5px] leading-4"
                      style={{ backgroundColor: "#eef7f1", color: "#2f7d5c" }}
                    >
                      {p}
                    </span>
                  ))}
                  {opt.concerns.map((c, i) => (
                    <span
                      key={`c${i}`}
                      className="rounded-md px-1.5 py-0.5 text-[10.5px] leading-4"
                      style={{ backgroundColor: "#faf3e8", color: "#b45309" }}
                    >
                      {c}
                    </span>
                  ))}
                </div>
              )}

              {/* 第三行：来源链接 …… 决策区 */}
              <div className="mt-2 flex items-center justify-between gap-2 pl-[26px]">
                <div className="flex min-w-0 items-center gap-2">
                  {opt.link && (
                    <a
                      href={opt.link}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex shrink-0 items-center gap-0.5 text-[10.5px] transition-colors hover:underline"
                      style={{ color: "#99958d" }}
                    >
                      来源<ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  )}
                  {(adoptCount > 0 || discardCount > 0) && (
                    <span className="truncate text-[10px]" style={{ color: "#b8b4ab" }}>
                      {adoptCount > 0 && `${adoptCount} 人采纳`}
                      {adoptCount > 0 && discardCount > 0 && " · "}
                      {discardCount > 0 && `${discardCount} 人放弃`}
                    </span>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    disabled={!!pendingKey}
                    onClick={() => choose(opt.id, "discard")}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10.5px] font-medium transition-colors disabled:opacity-50 min-h-7",
                      myDiscard
                        ? "border-transparent text-[#8c5a5a]"
                        : "hover:border-rose-300 hover:text-rose-600"
                    )}
                    style={
                      myDiscard
                        ? { backgroundColor: "#f7eeee" }
                        : { borderColor: "#e3e1da", color: "#b0aca3" }
                    }
                  >
                    <ThumbsDown className="h-3 w-3" />
                    {myDiscard ? "已放弃" : "放弃"}
                  </button>
                  <button
                    type="button"
                    disabled={!!pendingKey}
                    onClick={() => choose(opt.id, myAdopt ? "reset" : "adopt")}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[10.5px] font-medium transition-colors disabled:opacity-50 min-h-7",
                      myAdopt
                        ? "border-transparent text-white"
                        : "hover:border-[#384877] hover:text-[#384877]"
                    )}
                    style={
                      myAdopt
                        ? { backgroundColor: "#384877" }
                        : { borderColor: "#c7cde8", color: "#5b6a94" }
                    }
                  >
                    {myAdopt ? <Check className="h-3 w-3" /> : <ThumbsUp className="h-3 w-3" />}
                    {myAdopt ? "已采纳" : "采纳"}
                    {adoptCount > 0 && <span className="opacity-80">{adoptCount}</span>}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 底部提示 */}
      <p
        className="border-t px-3.5 py-1.5 text-[10px] leading-4"
        style={{ borderColor: C.lineSoft, backgroundColor: "#fdfcf9", color: "#8a867e" }}
      >
        采纳即表达倾向，可从讨论中继续比较；选定后如涉及登录、下单或支付，请本人通过上方「直达预订」完成
      </p>
    </div>
  );
}
