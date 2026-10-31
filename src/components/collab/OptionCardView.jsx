// Agent 选项卡：联网检索得到的候选方案（机票/酒店/门票/餐厅/礼物…）
// 成员在卡片上「采纳」表达倾向、「放弃」表示不考虑；选定后登录/支付由成员本人完成
import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ExternalLink, ThumbsDown, ThumbsUp } from "lucide-react";
import { httpRequest } from "@/api/httpClient";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { C } from "./constants";

const DOMAIN_LABELS = {
  flight: "机票候选",
  hotel: "酒店候选",
  ticket: "门票候选",
  food: "餐厅候选",
  gift: "礼物候选",
  other: "候选方案",
};

export default function OptionCardView({ taskId, commentId, card, currentUserId }) {
  const queryClient = useQueryClient();
  const [pendingKey, setPendingKey] = useState(null);
  const options = Array.isArray(card?.options) ? card.options : [];
  const choices = card?.choices || {};
  const my = choices[currentUserId] || null;

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
      style={{ borderColor: C.lineSoft, backgroundColor: "#fdfcf9" }}
    >
      <div
        className="flex items-center gap-2 border-b px-3.5 py-2"
        style={{ borderColor: C.lineSoft, backgroundColor: C.brandTint }}
      >
        <span className="text-[10.5px] font-semibold" style={{ color: "#384877" }}>
          {DOMAIN_LABELS[card.domain] || "候选方案"}
        </span>
        {card.query && (
          <span className="truncate text-[11px]" style={{ color: "#5b6a94" }}>
            {card.query}
          </span>
        )}
      </div>
      {Array.isArray(card.bookingLinks) && card.bookingLinks.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b px-3.5 py-2" style={{ borderColor: C.lineSoft }}>
          <span className="text-[10px]" style={{ color: "#8a867e" }}>直达预订</span>
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
      <div className="space-y-2 p-2.5">
        {options.map((opt) => {
          const adoptCount = adoptCountOf(opt.id);
          const discardCount = Object.values(choices).filter(
            (c) => Array.isArray(c?.discard) && c.discard.includes(opt.id)
          ).length;
          const myAdopt = my?.adopt === opt.id;
          const myDiscard = Array.isArray(my?.discard) && my.discard.includes(opt.id);
          const leading = adoptCount > 0 && adoptCount === maxAdopts;
          return (
            <div
              key={opt.id}
              className={cn("rounded-lg border px-3 py-2.5", myAdopt && "border-transparent")}
              style={{
                borderColor: myAdopt ? undefined : C.lineSoft,
                backgroundColor: myAdopt ? "#eef2ff" : "#fff",
                ...(myAdopt ? { boxShadow: "inset 0 0 0 1px #384877" } : {}),
              }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[12.5px] font-semibold" style={{ color: "#302c2a" }}>
                      {opt.title}
                    </span>
                    {leading && (
                      <span className="rounded-full bg-emerald-100 px-1.5 py-px text-[9.5px] font-medium text-emerald-700">
                        领先
                      </span>
                    )}
                  </div>
                  {opt.summary && (
                    <p className="mt-0.5 text-[11.5px] leading-5" style={{ color: "#5b5751" }}>
                      {opt.summary}
                    </p>
                  )}
                  {(opt.points?.length > 0 || opt.concerns?.length > 0) && (
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10.5px] leading-4">
                      {opt.points.map((p, i) => (
                        <span key={`p${i}`} style={{ color: "#2f7d5c" }}>+ {p}</span>
                      ))}
                      {opt.concerns.map((c, i) => (
                        <span key={`c${i}`} style={{ color: "#b45309" }}>! {c}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {opt.price && (
                    <span className="text-[12.5px] font-semibold" style={{ color: "#384877" }}>
                      {opt.price}
                    </span>
                  )}
                  {opt.link && (
                    <a
                      href={opt.link}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-0.5 text-[10.5px] hover:underline"
                      style={{ color: "#77736c" }}
                    >
                      查看详情<ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  )}
                </div>
              </div>
              <div className="mt-2 flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={!!pendingKey}
                  onClick={() => choose(opt.id, myAdopt ? "reset" : "adopt")}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10.5px] font-medium transition-colors disabled:opacity-50 min-h-7",
                    myAdopt
                      ? "border-transparent text-white"
                      : "hover:border-[#384877] hover:text-[#384877]"
                  )}
                  style={myAdopt ? { backgroundColor: "#384877" } : { borderColor: "#d8d6cf", color: "#77736c" }}
                >
                  <ThumbsUp className="h-3 w-3" />
                  {myAdopt ? "已采纳" : "采纳"}{adoptCount > 0 ? ` ${adoptCount}` : ""}
                </button>
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
                      ? { backgroundColor: "#f3ecec" }
                      : { borderColor: "#d8d6cf", color: "#8a867e" }
                  }
                >
                  <ThumbsDown className="h-3 w-3" />
                  {myDiscard ? "已放弃" : "放弃"}{discardCount > 0 ? ` ${discardCount}` : ""}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <p className="border-t px-3.5 py-1.5 text-[10px]" style={{ borderColor: C.lineSoft, color: "#8a867e" }}>
        选定后如涉及登录、下单或支付，请本人点开「查看详情」自行完成
      </p>
    </div>
  );
}
