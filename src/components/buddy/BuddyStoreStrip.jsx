import React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { createPageUrl } from "@/utils";
import { httpRequest } from "@/api/httpClient";
import Orb from "@/components/buddy/Orb";
import { BUDDIES, BUDDY_TINTS } from "@/lib/buddies";

// 首页「搭子Store」常驻入口：未认领的横滑货架；全部在岗时给「都在岗」提示卡
export default function BuddyStoreStrip() {
  const { data: mine } = useQuery({
    queryKey: ["buddies", "mine"],
    queryFn: () => httpRequest("/api/buddies/mine"),
  });
  const profiles = mine?.buddies || {};
  const claimed = BUDDIES.filter((b) => profiles[b.id]?.status === "active");
  const unclaimed = BUDDIES.filter((b) => profiles[b.id]?.status !== "active");

  return (
    <section className="mt-8">
      <div className="flex items-baseline justify-between px-1">
        <h2 className="text-base font-semibold text-[#1c1917]">搭子Store</h2>
        <Link to={createPageUrl("BuddyStore")} className="text-xs text-[#384877] hover:underline">
          逛一逛 →
        </Link>
      </div>

      {unclaimed.length > 0 ? (
        <div className="mt-3 flex gap-3 overflow-x-auto pb-1 px-1 scrollbar-hide">
          {unclaimed.map((b) => (
            <Link
              key={b.id}
              to={`${createPageUrl("BuddyClaim")}?buddy=${b.id}`}
              className="w-[150px] shrink-0 rounded-2xl border border-[#e7e5e4] bg-[#FFFFFF] p-4 transition-transform duration-200 hover:scale-[1.02] active:scale-95"
            >
              <Orb size={40} tint={BUDDY_TINTS[b.id]} />
              <div className="mt-2.5 font-medium text-[#1c1917]">{b.name}</div>
              <div className="mt-1 line-clamp-2 text-xs leading-relaxed text-[#a8a29e]">{b.slogan}</div>
            </Link>
          ))}
        </div>
      ) : (
        <Link
          to={createPageUrl("BuddyStore")}
          className="mx-1 mt-3 flex items-center gap-3 rounded-2xl border border-dashed border-[#e7e5e4] bg-[#FFFFFF] p-4 transition-colors hover:border-[#384877]"
        >
          <div className="flex -space-x-2">
            {claimed.slice(0, 4).map((b) => (
              <Orb key={b.id} size={30} tint={BUDDY_TINTS[b.id]} />
            ))}
          </div>
          <div className="flex-1 text-sm text-[#57534e]">
            {claimed.length} 颗搭子都在岗，干得漂亮
            <span className="block text-xs text-[#a8a29e]">去 Store 看看还有哪些新搭子</span>
          </div>
          <ChevronRight className="w-4 h-4 text-[#a8a29e] shrink-0" />
        </Link>
      )}
    </section>
  );
}
