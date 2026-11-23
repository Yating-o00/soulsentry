import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { httpRequest } from "@/api/httpClient";
import { Sparkles, Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import Orb from "@/components/buddy/Orb";
import { BUDDY_TINTS, personaName } from "@/lib/buddies";
import { getAllBuddies } from "@/lib/customBuddies";
import CustomBuddyDesigner from "@/components/buddy/CustomBuddyDesigner";

// 搭子Store —— 货架上卖的不是一次性 Agent，而是一段长期关系（六要素知情认领）
export default function BuddyStore() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [designerOpen, setDesignerOpen] = useState(false);
  const [editingBuddy, setEditingBuddy] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const closeDesigner = () => {
    setDesignerOpen(false);
    setEditingBuddy(null);
  };
  const deleteBuddy = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      const result = await httpRequest(`/api/buddies/custom/${deleteTarget.id}`, { method: "DELETE" });
      queryClient.invalidateQueries({ queryKey: ["buddies", "mine"] });
      queryClient.invalidateQueries({ queryKey: ["buddies"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["buddy", deleteTarget.id, "materials"] });
      toast.success(
        result?.detached_tasks > 0
          ? `${deleteTarget.name} 已删除，原来的项目和协同已转为普通内容保留`
          : `${deleteTarget.name} 已删除`
      );
      setDeleteTarget(null);
    } catch (error) {
      toast.error(error?.message || "删除失败，再试一次");
    } finally {
      setDeleting(false);
    }
  };
  const { data: mine } = useQuery({
    queryKey: ["buddies", "mine"],
    queryFn: () => httpRequest("/api/buddies/mine"),
  });
  const profiles = mine?.buddies || {};
  const buddies = useMemo(() => getAllBuddies(mine), [mine]);

  return (
    <div className="max-w-3xl lg:max-w-5xl mx-auto px-4 py-6 md:py-10">
      <h1 className="hidden text-xl font-bold text-stone-900 lg:block lg:text-2xl">搭子Store</h1>
      <p className="text-[13px] leading-relaxed text-stone-500 md:mt-1.5 md:text-sm">
        每颗搭子都有自己的专业、记忆和陪伴时长，认领后常驻首页。
      </p>

      <div className="mt-5 space-y-4 lg:mt-6 lg:grid lg:grid-cols-2 lg:gap-5 lg:space-y-0 lg:items-start">
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
                {(buddy.abilities || []).length > 0 && (
                  <div>
                    <div className="text-[11px] tracking-widest text-stone-400">专业能力</div>
                    <ul className="mt-1.5 space-y-1.5">
                      {(buddy.abilities || []).map((ability) => (
                        <li key={ability} className="flex items-start gap-2 leading-relaxed text-stone-700">
                          <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: tint[1] }} />
                          {ability}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
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
                  <div className="mb-2 flex items-center justify-center gap-4 py-1 text-[12px] text-stone-400">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingBuddy(buddy);
                        setDesignerOpen(true);
                      }}
                      className="flex items-center gap-1.5 transition-colors hover:text-[#384877]"
                    >
                      <Pencil className="h-3 w-3" />
                      调整设计
                    </button>
                    <span className="h-3 w-px bg-stone-200" />
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(buddy)}
                      className="flex items-center gap-1.5 transition-colors hover:text-rose-500"
                    >
                      <Trash2 className="h-3 w-3" />
                      删除搭子
                    </button>
                  </div>
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
                用自然语言描述你想要一个怎样的搭子，心栈会按这个领域真正要做的事，设计它的专业能力、计划和对话方式；可以反复调整，满意后上架到自己的 Store。
              </p>
            </div>
          </div>
        </button>

        <p className="px-2 pt-1 text-center text-xs leading-relaxed text-stone-400">
          更多搭子在路上：健身搭子、求职搭子、记账搭子……也可以自己设计一颗。
        </p>
      </div>

      <CustomBuddyDesigner
        open={designerOpen}
        editingBuddy={editingBuddy}
        claimed={Boolean(editingBuddy && profiles[editingBuddy.id]?.status === "active")}
        onClose={closeDesigner}
      />

      {deleteTarget && (
        <div
          className="fixed inset-0 z-[96] flex items-end justify-center bg-[#231f20]/45 p-4 sm:items-center"
          onClick={() => { if (!deleting) setDeleteTarget(null); }}
        >
          <div className="w-full max-w-sm rounded-3xl bg-white p-6" onClick={(event) => event.stopPropagation()}>
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-50 text-rose-500">
              <Trash2 className="h-5 w-5" />
            </div>
            <h2 className="mt-3 text-lg font-semibold text-stone-900">删除「{deleteTarget.name}」？</h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-stone-500">
              它会从你的 Store 消失，专属资料也会一并删除。已经创建的项目和协同会保留下来，变成普通内容，不会丢数据。此操作不能撤销。
            </p>
            {profiles[deleteTarget.id]?.status === "active" && (
              <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-700">
                这颗搭子正在陪伴中，删除后它的空间入口会消失。
              </p>
            )}
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="flex-1 rounded-full border border-stone-200 py-2.5 text-sm text-stone-600 disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={deleteBuddy}
                disabled={deleting}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-rose-500 py-2.5 text-sm font-medium text-white disabled:opacity-50"
              >
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {deleting ? "正在删除…" : "删除搭子"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
