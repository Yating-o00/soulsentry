import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { httpRequest } from "@/api/httpClient";
import { Sparkles, Plus, Pencil } from "lucide-react";
import Orb from "@/components/buddy/Orb";
import { BUDDY_TINTS, personaName } from "@/lib/buddies";
import { getAllBuddies } from "@/lib/customBuddies";
import CustomBuddyDesigner from "@/components/buddy/CustomBuddyDesigner";

// 搭子Store —— 货架上卖的不是一次性 Agent，而是一段长期关系（六要素知情认领）
export default function BuddyStore() {
  const navigate = useNavigate();
  const [designerOpen, setDesignerOpen] = useState(false);
  const [editingBuddy, setEditingBuddy] = useState(null);
  const closeDesigner = () => {
    setDesignerOpen(false);
    setEditingBuddy(null);
  };
  const { data: mine } = useQuery({
    queryKey: ["buddies", "mine"],
    queryFn: () => httpRequest("/api/buddies/mine"),
  });
  const profiles = mine?.buddies || {};
  const buddies = useMemo(() => getAllBuddies(mine), [mine]);

  return (
    <div className="max-w-3xl lg:max-w-5xl mx-auto px-4 py-6 md:py-10">
      <h1 className="text-2xl font-bold text-stone-900">搭子Store</h1>
      <p className="mt-2 text-sm text-stone-500 leading-relaxed">
        每颗搭子都是一段长期关系：有自己的专业、自己的记忆、自己的陪伴时长。
        认领后，它会出现在你的首页，直到这个项目走完。
      </p>

      <div className="mt-6 space-y-5 lg:grid lg:grid-cols-2 lg:gap-5 lg:space-y-0 lg:items-start">
        {buddies.map((buddy) => {
          const tint = buddy.tint || BUDDY_TINTS[buddy.id] || BUDDY_TINTS.study;
          const profile = profiles[buddy.id];
          const claimed = profile?.status === "active";
          return (
            <article
              key={buddy.id}
              className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-[0_1px_3px_rgba(36,36,36,0.05)]"
            >
              {/* 头部：主张 */}
              <div className="flex items-center gap-4 p-5 pb-4">
                <Orb size={56} tint={tint} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold text-stone-900">{buddy.name}</h3>
                    {claimed && (
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
                        style={{ background: tint[2] }}
                      >
                        陪伴中
                      </span>
                    )}
                    {buddy.custom && (
                      <span className="rounded-full bg-[#eef2ff] px-2 py-0.5 text-[10px] font-medium text-[#384877]">
                        我的设计
                      </span>
                    )}
                    {profile?.status === "graduated" && (
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-medium bg-stone-100 text-stone-500">
                        已毕业
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm leading-snug text-stone-500">{buddy.slogan}</p>
                </div>
              </div>

              <div className="space-y-3.5 border-t border-stone-100 px-5 py-4 text-sm">
                <div>
                  <div className="text-[11px] tracking-widest text-stone-400">适合谁</div>
                  <p className="mt-1 leading-relaxed text-stone-600">{buddy.forWhom}</p>
                </div>
                <div>
                  <div className="text-[11px] tracking-widest text-stone-400">陪伴动作</div>
                  <ul className="mt-1.5 space-y-1.5">
                    {buddy.actions.map((a) => (
                      <li key={a} className="flex items-start gap-2 leading-relaxed text-stone-600">
                        <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: tint[2] }} />
                        {a}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="grid grid-cols-1 gap-3 rounded-2xl bg-[#FAF9F7] p-3.5">
                  <div>
                    <div className="text-[11px] tracking-widest text-stone-400">它会记住</div>
                    <p className="mt-0.5 text-[13px] leading-relaxed text-stone-600">{buddy.memory}</p>
                  </div>
                  <div className="flex items-center justify-between border-t border-[#e7e5e4] pt-2.5">
                    <span className="text-[11px] tracking-widest text-stone-400">关系时长</span>
                    <span className="text-[13px] font-medium text-stone-600">{buddy.duration}</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-[#e7e5e4] pt-2.5">
                    <span className="text-[11px] tracking-widest text-stone-400">{claimed ? "当前陪伴方式" : "默认陪伴方式"}</span>
                    <span className="text-[13px] font-medium text-stone-600">{personaName(profile?.persona || buddy.defaultPersona)}</span>
                  </div>
                </div>
                <blockquote
                  className="border-l-2 pl-3 text-[13px] leading-relaxed text-stone-500 italic"
                  style={{ borderColor: tint[1] }}
                >
                  {buddy.story}
                </blockquote>
              </div>

              <div className="px-5 pb-5">
                {buddy.custom && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingBuddy(buddy);
                      setDesignerOpen(true);
                    }}
                    className="mb-2 flex w-full items-center justify-center gap-1.5 py-1 text-[12px] text-stone-400 transition-colors hover:text-[#384877]"
                  >
                    <Pencil className="h-3 w-3" />
                    调整设计
                  </button>
                )}
                {claimed ? (
                  <button
                    onClick={() => navigate(`${createPageUrl("BuddySpace")}?buddy=${buddy.id}`)}
                    className="min-h-[46px] w-full rounded-full bg-[#384877] text-sm font-medium text-[#FAF9F7] transition-transform active:scale-[0.98]"
                  >
                    进入{buddy.name}的空间
                  </button>
                ) : (
                  <button
                    onClick={() => navigate(`${createPageUrl("BuddyClaim")}?buddy=${buddy.id}`)}
                    className="min-h-[46px] w-full rounded-full border border-stone-900 text-sm font-medium text-stone-900 transition-colors hover:bg-[#384877] hover:text-[#FAF9F7] active:scale-[0.98]"
                  >
                    {profile?.status === "graduated" ? "再认领一次" : "认领这颗搭子"}
                  </button>
                )}
              </div>
            </article>
          );
        })}
        <button
          type="button"
          onClick={() => {
            setEditingBuddy(null);
            setDesignerOpen(true);
          }}
          className="group w-full rounded-3xl border border-dashed border-stone-300 bg-white/70 p-5 text-left transition-colors hover:border-[#384877] hover:bg-[#eef2ff]/30 lg:col-span-2"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#eef2ff] text-[#384877]">
              <Sparkles className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-[15px] font-semibold text-stone-900">
                设计我的搭子 <Plus className="h-3.5 w-3.5 text-stone-300 transition-colors group-hover:text-[#384877]" />
              </div>
              <p className="mt-0.5 text-[12px] leading-relaxed text-stone-500">
                用自然语言描述你想要一个怎样的搭子，心栈帮你生成六要素、计划和对话方式；可以反复调整，满意后上架到自己的 Store。
              </p>
            </div>
          </div>
        </button>

        <p className="px-2 pt-1 text-center text-xs leading-relaxed text-stone-400">
          更多搭子在路上：健身搭子、求职搭子、记账搭子……也可以自己设计一颗。
        </p>
      </div>

      <CustomBuddyDesigner open={designerOpen} editingBuddy={editingBuddy} onClose={closeDesigner} />
    </div>
  );
}
