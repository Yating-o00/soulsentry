import { useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Check, Footprints, GraduationCap, Loader2, Users2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { httpRequest } from "@/api/httpClient";
import { cn } from "@/lib/utils";
import Orb from "@/components/buddy/Orb";
import { BUDDY_TINTS, DEFAULT_PERSONA, getBuddy } from "@/lib/buddies";
import { useCheckins, useCreateCheckin } from "@/components/checkins/useCheckins";
import CollabCreateDialog from "@/components/tasks/CollabCreateDialog";
import SolvePanel from "@/components/buddy/panels/SolvePanel";
import WeekPanel from "@/components/buddy/panels/WeekPanel";
import { ItineraryPanel, InspirationPanel } from "@/components/buddy/panels/TravelPanels";
import { ReadingNowPanel, ShelfPanel, ReadingNotesPanel } from "@/components/buddy/panels/ReadingPanels";
import { MorningCheckPanel, HabitChainPanel } from "@/components/buddy/panels/MorningPanels";
import { useBuddyState } from "@/components/buddy/panels/shared";

/**
 * 搭子空间（二期）：配置驱动的空间脚手架——每颗搭子一套板块（buddy.sections），
 * 同一套底座渲染：首页板块（计划 + 项目约定，真实数据）/ 协同（接入协同约定）/
 * 画像（领域档案 + 陪伴统计）/ 领域特色板块（清单、习惯链）/ 其余板块预告。
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

  const { data: allTasks = [] } = useQuery({
    queryKey: ["tasks", "with-subs"],
    queryFn: () => base44.entities.Task.filter({ parent_task_id: "all" }, "-reminder_time", 300),
    enabled: !!profile?.project_task_id,
  });
  const projectTask = useMemo(
    () => allTasks.find((t) => t.id === profile?.project_task_id) || null,
    [allTasks, profile]
  );

  const [tab, setTab] = useState(null); // null → 取 sections[0]
  const [graduateOpen, setGraduateOpen] = useState(false);
  const [graduating, setGraduating] = useState(false);
  const [collabOpen, setCollabOpen] = useState(false);

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
          className="mt-4 rounded-full bg-[#384877] px-6 py-2.5 text-sm text-[#FAF9F7]"
        >
          去搭子Store
        </button>
      </div>
    );
  }

  const sections = buddy.sections;
  const activeTab = tab && sections.includes(tab) ? tab : sections[0];

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
    <div className="max-w-xl mx-auto px-4 pt-6 md:pt-10 pb-10">
      {/* 页眉：搭子头 + 人格化问候 */}
      <header className="flex items-center gap-3">
        <button
          onClick={() => navigate(createPageUrl("Dashboard"))}
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
        <button
          onClick={() => setGraduateOpen(true)}
          title="项目走完了，举行毕业仪式"
          className="flex h-9 w-9 items-center justify-center rounded-full text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700"
        >
          <GraduationCap className="w-5 h-5" />
        </button>
      </header>

      {/* 板块标签（配置驱动） */}
      <nav className="mt-5 flex gap-2 overflow-x-auto scrollbar-hide border-b border-stone-200">
        {sections.map((s) => {
          const active = s === activeTab;
          return (
            <button
              key={s}
              onClick={() => setTab(s)}
              className={cn(
                "shrink-0 px-4 py-2.5 text-sm border-b-2 -mb-px transition-colors",
                active ? "font-semibold text-stone-900" : "border-transparent text-stone-400 hover:text-stone-600"
              )}
              style={active ? { borderColor: tint[2] } : undefined}
            >
              {s}
            </button>
          );
        })}
      </nav>

      {/* 板块内容 */}
      <div className="mt-5">
        {activeTab === sections[0] && buddyId === "study" && (
          <HomeSection buddy={buddy} profile={profile} tint={tint} projectTask={projectTask} />
        )}
        {activeTab === sections[0] && buddyId === "travel" && (
          <div className="space-y-4">
            <HomeSection buddy={buddy} profile={profile} tint={tint} projectTask={projectTask} />
            <ItineraryPanel buddy={buddy} profile={profile} tint={tint} persona={persona} />
          </div>
        )}
        {activeTab === sections[0] && buddyId === "reading" && (
          <div className="space-y-4">
            <ReadingNowPanel profile={profile} tint={tint} persona={persona} />
            {projectTask && <ProjectTaskCard task={projectTask} tint={tint} />}
          </div>
        )}
        {activeTab === sections[0] && buddyId === "morning" && (
          <MorningCheckPanel profile={profile} tint={tint} persona={persona} projectTask={projectTask} />
        )}
        {activeTab === "解题" && <SolvePanel tint={tint} persona={persona} />}
        {activeTab === "周报" && <WeekPanel tint={tint} projectTask={projectTask} />}
        {activeTab === "灵感" && <InspirationPanel buddy={buddy} tint={tint} />}
        {activeTab === "书架" && <ShelfPanel profile={profile} tint={tint} />}
        {activeTab === "笔记" && <ReadingNotesPanel tint={tint} />}
        {activeTab === "协同" && (
          <CollabSection buddy={buddy} tint={tint} projectTask={projectTask} allTasks={allTasks} onOpenCollab={() => setCollabOpen(true)} />
        )}
        {activeTab === "画像" && (
          <ProfileSection buddy={buddy} profile={profile} tint={tint} projectTask={projectTask} />
        )}
        {activeTab === "清单" && buddy.extras?.checklist && (
          <ChecklistSection items={buddy.extras.checklist} tint={tint} />
        )}
        {activeTab === "习惯" && buddy.extras?.habitChain && (
          <HabitChainPanel chain={buddy.extras.habitChain} tint={tint} />
        )}
        {!["协同", "画像", "清单", "习惯", "解题", "周报", "灵感", "书架", "笔记"].includes(activeTab) &&
          activeTab !== sections[0] && <UpcomingSection buddy={buddy} tab={activeTab} tint={tint} />}
      </div>

      {/* 协同约定创建（为项目约定开启协同） */}
      <CollabCreateDialog
        open={collabOpen}
        existingTask={projectTask}
        onClose={() => setCollabOpen(false)}
        onCreated={(taskId) => {
          setCollabOpen(false);
          if (taskId) navigate(`/collabspace?taskId=${taskId}`);
        }}
      />

      {/* 毕业仪式确认 */}
      {graduateOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-[#384877]/45 p-5"
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
                className="rounded-full px-6 py-3 text-sm text-white bg-[#384877] disabled:opacity-50"
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

/* ---------- 首页板块（今日/行程/在读/打卡）：计划卡 + 项目约定 ---------- */
function HomeSection({ buddy, profile, tint, projectTask }) {
  return (
    <div className="space-y-4">
      {profile?.plan_title && (
        <section className="rounded-2xl bg-[#384877] p-5 text-[#FAF9F7]">
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
      {projectTask && <ProjectTaskCard task={projectTask} tint={tint} />}
    </div>
  );
}

/* ---------- 协同：朋友 + 搭子 Agent 的多方共创 ----------
   Agent 是协调者：拉齐共识、化解分歧、推进讨论、总结沉淀、找外部信息支援；
   讨论产出自动落成子约定与心签，由 Agent 持续维护。 */
function CollabSection({ buddy, tint, projectTask, allTasks = [], onOpenCollab }) {
  const collabs = allTasks.filter((t) => t?.metadata?.collab && !t.deleted_at && !t.parent_task_id);

  return (
    <div className="space-y-4">
      {/* Agent 角色说明 */}
      <section className="rounded-2xl bg-[#384877] p-5 text-[#FAF9F7]">
        <div className="flex items-center gap-2 text-xs tracking-widest opacity-70">
          <Users2 className="w-4 h-4" /> 协同约定里的{buddy.name}
        </div>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed">
          <li className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#FAF9F7]" />协调沟通：讨论跑偏时拉回来，有分歧时给出折中方案</li>
          <li className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#FAF9F7]" />推动进展：把聊出来的共识变成子约定，进展自动勾划</li>
          <li className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#FAF9F7]" />专业外援：需要外部信息（攻略、资料、行情）时 ta 去查</li>
          <li className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#FAF9F7]" />总结沉淀：阶段性结论自动沉淀为心签，随时翻得回来</li>
        </ul>
      </section>

      {/* 进行中的协同约定 */}
      {collabs.length > 0 && (
        <section className="rounded-2xl border border-stone-200 bg-white p-5">
          <div className="text-[11px] tracking-widest text-stone-400">进行中的协同约定</div>
          <ul className="mt-3 space-y-2">
            {collabs.map((t) => (
              <li key={t.id}>
                <Link
                  to={`/collabspace?taskId=${t.id}`}
                  className="flex items-center gap-3 rounded-xl bg-[#FAF9F7] px-4 py-3 transition-colors hover:bg-stone-100"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white text-xs" style={{ background: tint[2] }}>
                    协
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium text-stone-800">{t.title}</span>
                    <span className="text-xs text-stone-400">
                      {t.id === projectTask?.id ? "本搭子的项目约定 · " : ""}多人共创中
                    </span>
                  </span>
                  <span className="text-stone-400">→</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 新建协同 */}
      <section className="rounded-2xl border border-stone-200 bg-white p-5 text-center">
        <p className="text-[15px] font-medium text-stone-800">拉个伙伴，一起推进</p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-stone-500">
          把「{projectTask?.title || buddy.name + "的项目约定"}」变成协同约定：发邀请链接给朋友，
          大家和 {buddy.name} 在一个讨论区里聊，子约定和沉淀由 ta 维护。
        </p>
        <button
          onClick={onOpenCollab}
          disabled={!projectTask}
          className="mt-4 min-h-[44px] w-full rounded-full text-sm font-medium text-white disabled:opacity-50"
          style={{ background: tint[2] }}
        >
          {projectTask?.metadata?.collab ? "管理项目约定的协同" : "开启协同约定"}
        </button>
      </section>
    </div>
  );
}

/* ---------- 画像：领域档案（隔离）+ 陪伴统计 ---------- */
function ProfileSection({ buddy, profile, tint, projectTask }) {
  const isCheckin = projectTask?.category === "checkin";
  const { data: checkinData } = useCheckins(projectTask?.id || "", { enabled: isCheckin && !!projectTask });

  return (
    <div className="space-y-4">
      {/* 陪伴统计（真实数据） */}
      <section className="rounded-2xl border border-stone-200 bg-white p-5">
        <div className="text-[11px] tracking-widest text-stone-400">陪伴统计</div>
        <div className="mt-3 grid grid-cols-3 gap-3 text-center">
          <div>
            <div className="text-xl font-bold" style={{ color: tint[2] }}>
              {isCheckin ? checkinData?.total ?? 0 : projectTask?.status === "completed" ? 1 : 0}
            </div>
            <div className="mt-0.5 text-[11px] text-stone-400">{isCheckin ? "累计打卡" : "项目进度"}</div>
          </div>
          <div>
            <div className="text-xl font-bold" style={{ color: tint[2] }}>
              {isCheckin ? (checkinData?.done_today ? "已赴约" : "待赴约") : projectTask?.status === "completed" ? "已完成" : "进行中"}
            </div>
            <div className="mt-0.5 text-[11px] text-stone-400">今日状态</div>
          </div>
          <div>
            <div className="text-xl font-bold" style={{ color: tint[2] }}>
              {profile?.claimed_at ? `${Math.max(1, Math.ceil((Date.now() - new Date(profile.claimed_at).getTime()) / 86400000))} 天` : "—"}
            </div>
            <div className="mt-0.5 text-[11px] text-stone-400">相伴时长</div>
          </div>
        </div>
      </section>

      {/* 领域档案：这颗搭子记住的你（仅本搭子可见） */}
      <section className="rounded-2xl border border-stone-200 bg-white p-5">
        <div className="text-[11px] tracking-widest text-stone-400">领域档案 · 仅{buddy.name}可见</div>
        {profile?.answers && Object.keys(profile.answers).length > 0 ? (
          <div className="mt-2.5 flex flex-wrap gap-2">
            {Object.entries(profile.answers).map(([k, v]) => (
              <span key={k} className="rounded-full bg-[#FAF9F7] px-3 py-1.5 text-[13px] text-stone-600">
                {v}
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-[13px] text-stone-400">还没有留下档案，认领时聊几句就有了。</p>
        )}
        <p className="mt-3 text-xs text-stone-400">{buddy.memory}</p>
      </section>
    </div>
  );
}

/* ---------- 领域特色：旅行清单（勾选持久化到搭子板块状态，灵感库加进来的也在此核对） ---------- */
function ChecklistSection({ items, tint }) {
  const { state, patch } = useBuddyState("travel");
  const checked = state.checklist_checked || [];
  const extra = state.checklist_extra || [];
  const all = [...items, ...extra];

  const toggle = (item) => {
    const next = checked.includes(item) ? checked.filter((x) => x !== item) : [...checked, item];
    patch({ checklist_checked: next });
  };

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5">
      <div className="flex items-baseline justify-between">
        <div className="text-[11px] tracking-widest text-stone-400">行前清单</div>
        <span className="text-xs text-stone-400">{`${checked.length}/${all.length}`}</span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-stone-100">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${all.length ? (checked.length / all.length) * 100 : 0}%`, background: tint[2] }}
        />
      </div>
      <ul className="mt-3 space-y-2.5">
        {all.map((item) => {
          const done = checked.includes(item);
          return (
            <li key={item}>
              <button onClick={() => toggle(item)} className="flex w-full items-center gap-3 text-left">
                <span
                  className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-md border-2 flex-shrink-0 transition-colors",
                    done ? "text-white" : "border-stone-300"
                  )}
                  style={done ? { background: tint[2], borderColor: tint[2] } : undefined}
                >
                  {done && <Check className="w-3 h-3" strokeWidth={3} />}
                </span>
                <span className={cn("text-sm", done ? "text-stone-400 line-through" : "text-stone-700")}>{item}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs text-stone-400">出发前一晚 21:00，我会逐项跟你核对——勾选云端同步，换设备也不丢。</p>
    </section>
  );
}

/* ---------- 预告板块 ---------- */
const UPCOMING_DESC = {
  解题: "拍照解题：分层提示，直到你自己做出来——引导式，绝不直接给答案。",
  周报: "每周一张学习小报：掌握度曲线、错因分布、下周建议。",
  灵感: "目的地灵感库：体验、美食、景点，按你的风格筛选。",
  书架: "在读 / 想读 / 读完，每一本的进度和弃书率都在这。",
  笔记: "摘抄和讲书自动成笔记，月底生成你的读书小报。",
};

function UpcomingSection({ buddy, tab, tint }) {
  return (
    <section className="rounded-2xl border border-dashed border-stone-300 bg-white/60 p-6 text-center">
      <Sparkles className="w-7 h-7 mx-auto" style={{ color: tint[2] }} />
      <p className="mt-3 text-[15px] font-medium text-stone-800">「{tab}」板块在路上</p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-stone-500">
        {UPCOMING_DESC[tab] || `${buddy.name}的「${tab}」板块正在搭建。`}
      </p>
    </section>
  );
}

/* ---------- 项目约定卡：打卡约定显示累计与今日状态；普通约定可勾选完成 ---------- */
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
    <section className="rounded-2xl border border-stone-200 bg-white p-5">
      <div className="text-[11px] tracking-widest text-stone-400">项目约定 · 同步在约定页</div>
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={isCheckin ? doCheckin : toggleComplete}
          disabled={completing || (isCheckin && (todayDone || createCheckin.isPending))}
          title={isCheckin ? (todayDone ? "今日已赴约" : "打卡：记录这次赴约") : taskDone ? "恢复为未完成" : "完成约定"}
          className={cn(
            "w-11 h-11 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors",
            taskDone ? "border-transparent text-white" : "border-stone-300 text-stone-500 hover:border-stone-500"
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
