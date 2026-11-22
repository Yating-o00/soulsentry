import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { createPageUrl } from "@/utils";
import { httpRequest } from "@/api/httpClient";
import Orb from "@/components/buddy/Orb";
import { BUDDY_TINTS, DEFAULT_PERSONA } from "@/lib/buddies";
import { getAllBuddies } from "@/lib/customBuddies";

// 首页「进行中的陪伴」（项目卡）：认领后的搭子住在这里，直到项目走完举行毕业仪式
export default function BuddyCompanions() {
  const { data: mine } = useQuery({
    queryKey: ["buddies", "mine"],
    queryFn: () => httpRequest("/api/buddies/mine"),
  });
  const persona = mine?.persona || DEFAULT_PERSONA;
  const profiles = mine?.buddies || {};
  const allBuddies = useMemo(() => getAllBuddies(mine), [mine]);
  const active = allBuddies.filter((b) => profiles[b.id]?.status === "active");

  return (
    <section className="mt-6">
      <div className="flex items-baseline justify-between px-1">
        <h2 className="text-base font-semibold text-[#1c1917]">进行中的陪伴</h2>
        <span className="text-xs text-[#a8a29e]">{active.length} 颗搭子在岗</span>
      </div>
      <div className="mt-3 space-y-3 px-1">
        {active.length === 0 && (
          <Link
            to={createPageUrl("BuddyStore")}
            className="block rounded-2xl border border-dashed border-[#e7e5e4] p-5 text-center text-sm text-[#a8a29e] transition-colors hover:border-[#384877] hover:text-[#384877]"
          >
            还没有认领搭子 —— 去搭子Store挑一颗
          </Link>
        )}
        {active.map((b) => {
          const tint = b.tint || BUDDY_TINTS[b.id] || BUDDY_TINTS.study;
          const profile = profiles[b.id];
          const cardPersona = profile?.persona || b.defaultPersona || persona;
          return (
            <Link
              key={b.id}
              to={`${createPageUrl("BuddySpace")}?buddy=${b.id}`}
              className="flex items-center gap-3.5 rounded-2xl border border-stone-100 bg-[#FFFFFF] p-4 shadow-[0_1px_2px_rgba(36,36,36,0.04)] transition-transform duration-200 hover:scale-[1.01] active:scale-[0.99]"
            >
              <Orb size={48} tint={tint} />
              <div className="min-w-0 flex-1">
                <div className="font-medium text-[#1c1917]">{b.name}</div>
                <div className="mt-0.5 truncate text-sm text-[#57534e]">
                  {profile?.plan_title || b.greeting[cardPersona] || b.greeting.gentle}
                  <span className="ml-1.5 text-[11px] text-[#a8a29e]">{b.duration}</span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 shrink-0 text-[#a8a29e]" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}
