import React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { createPageUrl } from "@/utils";
import { httpRequest } from "@/api/httpClient";
import Orb from "@/components/buddy/Orb";
import { BUDDIES, BUDDY_TINTS, DEFAULT_PERSONA } from "@/lib/buddies";

// 首页「进行中的陪伴」：认领后的搭子住在这里，直到项目走完举行毕业仪式
export default function BuddyCompanions() {
  const { data: mine } = useQuery({
    queryKey: ["buddies", "mine"],
    queryFn: () => httpRequest("/api/buddies/mine"),
  });
  const persona = mine?.persona || DEFAULT_PERSONA;
  const profiles = mine?.buddies || {};
  const active = BUDDIES.filter((b) => profiles[b.id]?.status === "active");

  return (
    <div className="module-shell">
      {active.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <Orb size={64} />
          <p className="text-sm text-[var(--ink-2)]">还没有进行中的陪伴</p>
          <p className="text-xs leading-relaxed text-[var(--ink-4)]">
            每颗搭子都是一段长期关系：有自己的专业、自己的记忆、自己的陪伴时长。
          </p>
          <Link
            to={createPageUrl("BuddyStore")}
            className="mt-1 rounded-full border border-[var(--ink)] px-6 py-2.5 text-sm text-[var(--ink)] transition-colors hover:bg-[var(--ink)] hover:text-[#f2efe9]"
          >
            去搭子Store挑一颗
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {active.map((b) => {
            const tint = BUDDY_TINTS[b.id];
            const profile = profiles[b.id];
            return (
              <Link
                key={b.id}
                to={`${createPageUrl("BuddySpace")}?buddy=${b.id}`}
                className="flex items-center gap-3.5 rounded-2xl border border-stone-200/70 bg-white/80 p-4 transition-colors hover:border-stone-300"
              >
                <Orb size={44} tint={tint} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[15px] font-semibold text-stone-800">{b.name}</span>
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
                      style={{ background: tint[2] }}
                    >
                      陪伴中
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-[13px] text-stone-500">
                    {profile?.plan_title || b.greeting[persona] || b.greeting.gentle}
                  </p>
                </div>
              </Link>
            );
          })}
          <Link
            to={createPageUrl("BuddyStore")}
            className="block pt-1 text-center text-xs text-[var(--ink-4)] hover:text-[var(--ink-2)]"
          >
            逛一逛搭子Store →
          </Link>
        </div>
      )}
    </div>
  );
}
