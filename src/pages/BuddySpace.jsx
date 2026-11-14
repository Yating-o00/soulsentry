import React, { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Check, Footprints, GraduationCap, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { httpRequest } from "@/api/httpClient";
import { cn } from "@/lib/utils";
import Orb from "@/components/buddy/Orb";
import { BUDDY_TINTS, DEFAULT_PERSONA, getBuddy } from "@/lib/buddies";
import { useCheckins, useCreateCheckin } from "@/components/checkins/useCheckins";

/**
 * 搭子空间（一期 · 简版）：搭子头（人格化问候）+ 项目约定卡（认领即立的项目，真实数据可打卡/勾选）
 * + 领域档案摘要 + 板块预告（完整板块随二期上线）+ 毕业仪式。
 * 领域档案隔离：这里只读取并展示本搭子的档案，不看其他搭子的记忆。
 */
export default function BuddySpace() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const buddyId = new URLSearchParams(location.search).get("buddy") || "";
  const buddy = getBuddy(buddyId);
  const tint = BUDDY_TINTS[buddyId] || BUDDY_TINTS.study;

  const { data: mine, isLoading } = useQuery({
    queryKey: ["buddies", "mine"],
    queryFn: () => httpRequest("/api/buddies/mine"),
  });
  const persona = mine?.persona || DEFAULT_PERSONA;
  const profile = mine?.buddies?.[buddyId];

  // 项目约定（认领时服务端创建）：从约定列表里取真实数据
  const { data: allTasks = [] } = useQuery({
    queryKey: ["tasks", "with-subs"],
    queryFn: () => base44.entities.Task.filter({ parent_task_id: "all" }, "-reminder_time", 300),
    enabled: !!profile?.project_task_id,
  });
  const projectTask = useMemo(
    () => allTasks.find((t) => t.id === profile?.project_task_id) || null,
    [allTasks, profile]
  );

  const [graduateOpen, setGraduateOpen] = useState(false);
  const [graduating, setGraduating] = useState(false);

  if (!buddy) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center">
        <p className="text-stone-500 text-sm">这颗搭子还没有来到货架。</p>
        <button
          onClick={() => navigate(createPageUrl("BuddyStore"))}
          className="mt-4 rounded-full border border-stone-900 px-6 py-2.5 text-sm text-stone-900"
        >
          回搭子Store
        </button>
      </div>
    );
  }

  if (!isLoading && profile?.status !== "active") {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center">
        <Orb size={72} tint={tint} />
        <p className="mt-4 text-stone-500 text-sm">
          {profile?.status === "graduated" ? "这段陪伴已经毕业了，想ta了就再认领一次。" : "你还没有认领这颗搭子。"}
        </p>
        <button
          onClick={() => navigate(createPageUrl("BuddyStore"))}
          className="mt-4 rounded-full bg-stone-900 px-6 py-2.5 text-sm text-[#f2efe9]"
        >
          去搭子Store
        </button>
      </div>
    );
  }

  const graduate = async () => {
    if (graduating) return;
    setGraduating(true);
    try {
      await httpRequest(`/api/buddies/${buddy.id}/graduate`, { method: "POST" });
      queryClient.invalidateQueries({ queryKey: ["buddies"] });
      toast.success(`毕业快乐，${buddy.name}为你骄傲`);
      navigate(createPageUrl("BuddyStore"));
    } catch (e) {
      toast.error(e?.message || "操作失败，请再试一次");
      setGraduating(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto px-4 py-6 md:py-10">
      {/* 页眉：搭子头 + 人格化问候 */}
      <header className="flex items-center gap-3">
        <button
          onClick={() => navigate(createPageUrl("BuddyStore"))}
          aria-label="返回"
          className="flex h-9 w-9 items-center justify-center rounded-full text-stone-500 transition-colors hover:bg-stone-100"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <Orb size={52} tint={tint} />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold text-stone-900">{buddy.name}</h1>
          <p className="mt-0.5 text-[13px] text-stone-500 truncate">
            {buddy.greeting[persona] || buddy.greeting.gentle}
          </p>
        </div>
      </header>

      {/* 计划卡 */}
      {profile?.plan_title && (
        <section className="mt-6 rounded-2xl bg-stone-900 p-5 text-[#f2efe9]">
          <div className="text-xs tracking-widest" style={{ color: tint[1] }}>
            进行中的陪伴 · {buddy.duration}
          </div>
          <div className="mt-1.5 text-lg font-semibold">{profile.plan_title}</div>
          {Array.isArray(profile.plan_lines) && profile.plan_lines.length > 0 && (
            <ul className="mt-3 space-y-2">
              {profile.plan_lines.map((l) => (
                <li key={l} className="flex items-start gap-2 text-sm">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: tint[1] }} />
                  {l}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* 项目约定卡：认领即立的项目，真实数据 */}
      {projectTask && <ProjectTaskCard task={projectTask} tint={tint} />}

      {/* 领域档案：这颗搭子记住的你 */}
      {profile?.answers && Object.keys(profile.answers).length > 0 && (
        <section className="mt-4 rounded-2xl border border-stone-200 bg-white p-5">
          <div className="text-[11px] tracking-widest text-stone-400">它会记住（领域档案 · 仅本搭子可见）</div>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {Object.entries(profile.answers).map(([k, v]) => (
              <span key={k} className="rounded-full bg-[#f2efe9] px-3 py-1.5 text-[13px] text-stone-600">
                {v}
              </span>
            ))}
          </div>
          <p className="mt-3 text-xs text-stone-400">{buddy.memory}</p>
        </section>
      )}

      {/* 板块预告 */}
      <section className="mt-4 rounded-2xl border border-dashed border-stone-300 p-5">
        <div className="text-[11px] tracking-widest text-stone-400">空间板块</div>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {buddy.sections.map((s) => (
            <span key={s} className="rounded-full border border-stone-200 px-3 py-1.5 text-[13px] text-stone-400">
              {s} · 在路上
            </span>
          ))}
        </div>
        <p className="mt-3 text-xs leading-relaxed text-stone-400">
          {buddy.name}的完整空间（{buddy.sections.join(" / ")}）正在搭建，先把每天的约定陪你打好。
        </p>
      </section>

      {/* 毕业 */}
      <button
        onClick={() => setGraduateOpen(true)}
        className="mt-6 w-full flex items-center justify-center gap-2 rounded-full border border-stone-300 py-3 text-sm text-stone-500 transition-colors hover:border-stone-900 hover:text-stone-900"
      >
        <GraduationCap className="w-4 h-4" />
        项目走完了，举行毕业仪式
      </button>

      {/* 毕业仪式确认 */}
      {graduateOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-stone-900/45 p-5"
          onClick={() => setGraduateOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl bg-white px-7 pt-8 pb-7 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center">
              <Orb size={64} tint={tint} />
            </div>
            <p className="mt-4 text-[12px] tracking-[.3em] text-stone-400">毕 业 仪 式</p>
            <p className="mt-2 text-[15px] leading-relaxed text-stone-700">
              这段「{profile?.plan_title || buddy.name}」的陪伴要走完了。
              毕业后约定会保留，{buddy.name}回到货架，随时可以再认领。
            </p>
            <div className="mt-6 flex items-center justify-center gap-3">
              <button
                onClick={graduate}
                disabled={graduating}
                className="rounded-full px-6 py-3 text-sm text-white bg-stone-900 disabled:opacity-50"
              >
                {graduating ? "珍重…" : "毕业快乐"}
              </button>
              <button
                onClick={() => setGraduateOpen(false)}
                className="text-[13px] text-stone-400 hover:text-stone-600 px-2 py-3"
              >
                再陪陪我
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// 项目约定卡：打卡约定显示累计与今日状态（可打卡）；普通约定可勾选完成
function ProjectTaskCard({ task, tint }) {
  const queryClient = useQueryClient();
  const isCheckin = task.category === "checkin";
  const { data: checkinData } = useCheckins(task.id, { enabled: isCheckin });
  const createCheckin = useCreateCheckin(task.id);
  const [completing, setCompleting] = useState(false);

  const total = checkinData?.total ?? 0;
  const todayDone = Boolean(checkinData?.done_today);
  const taskDone = task.status === "completed" || task.done_today;

  const doCheckin = () => {
    if (todayDone || createCheckin.isPending) return;
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
  };

  const toggleComplete = async () => {
    if (completing) return;
    setCompleting(true);
    try {
      await base44.entities.Task.update(task.id, {
        status: taskDone ? "pending" : "completed",
        completed_at: taskDone ? null : new Date().toISOString(),
      });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      toast.success(taskDone ? "已恢复为未完成" : "✓ 如约完成");
    } catch (_e) {
      toast.error("网络开小差了，请再试一次");
    } finally {
      setCompleting(false);
    }
  };

  return (
    <section className="mt-4 rounded-2xl border border-stone-200 bg-white p-5">
      <div className="text-[11px] tracking-widest text-stone-400">项目约定 · 同步在约定页</div>
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={isCheckin ? doCheckin : toggleComplete}
          disabled={completing || (isCheckin && (todayDone || createCheckin.isPending))}
          title={isCheckin ? (todayDone ? "今日已赴约" : "打卡：记录这次赴约") : taskDone ? "恢复为未完成" : "完成约定"}
          className={cn(
            "w-11 h-11 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors",
            taskDone
              ? "border-transparent text-white"
              : "border-stone-300 text-stone-500 hover:border-stone-500"
          )}
          style={taskDone ? { background: tint[2] } : undefined}
        >
          {createCheckin.isPending || completing ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : isCheckin && !taskDone ? (
            <Footprints className="w-5 h-5" />
          ) : (
            <Check className="w-5 h-5" />
          )}
        </button>
        <div className="min-w-0 flex-1">
          <p className={cn("text-[15px] font-medium truncate", taskDone ? "text-stone-400 line-through" : "text-stone-800")}>
            {task.title}
          </p>
          <p className="mt-0.5 text-xs text-stone-400">
            {isCheckin
              ? todayDone
                ? `今日已赴约 · 累计 ${total} 次`
                : total > 0
                  ? `已打卡 ${total} 次，今天继续`
                  : "今天第一次赴约，点左边圆钮打卡"
              : taskDone
                ? "已完成，点圆钮可恢复"
                : "完成后点左边圆钮打勾"}
          </p>
        </div>
      </div>
    </section>
  );
}
