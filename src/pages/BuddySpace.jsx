import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft, Check, Footprints, GraduationCap, Loader2, Users2, Sparkles, Trash2, Pencil,
  Sun, Lightbulb, Users, BarChart3, UserCircle, MapPin, ListChecks, BookOpen, Library,
  StickyNote, CheckCircle2, CalendarCheck, CalendarDays, ClipboardList, HeartPulse,
  Backpack, FolderOpen, Circle,
} from "lucide-react";
import { toast } from "sonner";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { httpRequest } from "@/api/httpClient";
import { cn } from "@/lib/utils";
import Orb from "@/components/buddy/Orb";
import { BUDDY_TINTS, DEFAULT_PERSONA, personaName } from "@/lib/buddies";
import { getBuddyFromMine } from "@/lib/customBuddies";
import { useCheckins, useCreateCheckin } from "@/components/checkins/useCheckins";
import CollabCreateDialog from "@/components/tasks/CollabCreateDialog";
import BuddyCollabPanel from "@/components/collab/BuddyCollabPanel";
import SolvePanel from "@/components/buddy/panels/SolvePanel";
import CustomMaterialsPanel from "@/components/buddy/panels/CustomMaterialsPanel";
import WeekPanel from "@/components/buddy/panels/WeekPanel";
import { ItineraryPanel, InspirationPanel } from "@/components/buddy/panels/TravelPanels";
import { ReadingNowPanel, ShelfPanel, ReadingNotesPanel } from "@/components/buddy/panels/ReadingPanels";
import { MorningCheckPanel, HabitChainPanel } from "@/components/buddy/panels/MorningPanels";
import {
  RunningTodayPanel,
  RunningLogPanel,
  RunningBodyPanel,
  RunningGearPanel,
  RunningProfilePanel,
} from "@/components/buddy/panels/RunningPanels";
import BuddyChatPanel from "@/components/buddy/panels/BuddyChatPanel";
import { useBuddyState } from "@/components/buddy/panels/shared";
import { useListSubtasks } from "@/components/buddy/useListSubtasks";
import { isTaskEffectivelyCompleted } from "@/lib/taskStatus";

// 手机端底部标签图标映射：把配置化的板块名称转成可识别的图标
const SECTION_ICONS = {
  今日: Sun,
  解题: Lightbulb,
  协同: Users,
  周报: BarChart3,
  画像: UserCircle,
  行程: MapPin,
  清单: ListChecks,
  灵感: Sparkles,
  在读: BookOpen,
  书架: Library,
  笔记: StickyNote,
  打卡: CheckCircle2,
  习惯: CalendarCheck,
  课表: CalendarDays,
  记录: ClipboardList,
  身体: HeartPulse,
  "装备与知识": Backpack,
  资料: FolderOpen,
};

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
  const searchParams = new URLSearchParams(location.search);
  const buddyId = searchParams.get("buddy") || "";
  // 受到邀请但还没认领搭子：允许只进入轻量协同模块
  const inviteGuest = searchParams.get("guest") === "1";
  const guestBuddyName = (searchParams.get("buddyName") || "").slice(0, 20);
  const requestedCollabId = searchParams.get("collab") || "";

  const { data: mine, isLoading } = useQuery({
    queryKey: ["buddies", "mine"],
    queryFn: () => httpRequest("/api/buddies/mine"),
  });
  const buddy = getBuddyFromMine(buddyId, mine);
  const tint = buddy?.tint || BUDDY_TINTS[buddyId] || BUDDY_TINTS.study;
  const profile = mine?.buddies?.[buddyId];
  // 每颗搭子独立人格：先看用户在这颗搭子下的设置，再用该搭子类型的默认人格
  const persona = profile?.persona || buddy?.defaultPersona || mine?.persona || DEFAULT_PERSONA;

  const { data: allTasks = [] } = useQuery({
    queryKey: ["tasks", "with-subs"],
    // 按创建时间倒序：新建的协同小组没有提醒时间，按提醒时间排会沉到 300 条之后
    queryFn: () => base44.entities.Task.filter({ parent_task_id: "all" }, "-created_date", 2000),
    enabled: !!profile,
  });
  // 项目约定优先；缺失（被删/未同步）时回退到本搭子最新的一条顶层约定——
  // 一键开启协同新建的协同约定也走这里，清单/行程同样能落到它下面。
  const projectTask = useMemo(() => {
    const preferred = profile?.project_task_id
      ? allTasks.find((t) => t.id === profile.project_task_id && !t.deleted_at)
      : null;
    if (preferred) return preferred;
    return (
      allTasks
        .filter(
          (t) =>
            !t.deleted_at &&
            !t.parent_task_id &&
            t.metadata?._extraFields?.buddy_id === buddyId
        )
        .sort((a, b) => new Date(b.created_date || 0) - new Date(a.created_date || 0))[0] || null
    );
  }, [allTasks, profile, buddyId]);

  // 本搭子名下的所有顶层项目/协同小组（主项目 + 子项目 + 协同小组）
  const buddyTasks = useMemo(() => {
    const list = allTasks
      .filter(
        (t) =>
          !t.deleted_at &&
          !t.parent_task_id &&
          t.metadata?._extraFields?.buddy_id === buddyId
      )
      .sort((a, b) => {
        if (a.id === projectTask?.id) return -1;
        if (b.id === projectTask?.id) return 1;
        return new Date(b.created_date || 0) - new Date(a.created_date || 0);
      });
    if (projectTask && !list.some((t) => t.id === projectTask.id)) list.unshift(projectTask);
    return list;
  }, [allTasks, buddyId, projectTask]);

  // 支持从全屏协同退回来时直接落在「协同」页（?tab=协同）
  const [tab, setTab] = useState(() => new URLSearchParams(location.search).get("tab") || null);
  const [graduateOpen, setGraduateOpen] = useState(false);
  const [graduating, setGraduating] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [newCollabOpen, setNewCollabOpen] = useState(false);
  const [selectedCollabId, setSelectedCollabId] = useState(
    () => new URLSearchParams(location.search).get("collab") || null
  );
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [newProjectTitle, setNewProjectTitle] = useState("");
  const [newProjectGoal, setNewProjectGoal] = useState("");
  const [creatingProject, setCreatingProject] = useState(false);
  const [deleteCollabTarget, setDeleteCollabTarget] = useState(null);
  const [deletingCollab, setDeletingCollab] = useState(false);

  if (!buddy && isLoading) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center text-stone-400">
        <Loader2 className="mx-auto h-5 w-5 animate-spin" />
        <p className="mt-2 text-sm">正在打开搭子空间…</p>
      </div>
    );
  }

  // 受邀访客：没有认领这颗搭子，只开放轻量协同聊天；
  // 其它板块依赖领域档案，不在访客态展示。
  if (!isLoading && inviteGuest && profile?.status !== "active" && requestedCollabId) {
    const guestBuddy = buddy || {
      id: buddyId,
      name: guestBuddyName || "搭子",
      tint,
      custom: true,
      sections: ["协同"],
      defaultPersona: DEFAULT_PERSONA,
      greeting: {
        gentle: "一起把这次协同推进下去。",
        strict: "先把共识落成行动。",
        buddy: "来，一起把这件事往前推。",
      },
      duration: "",
    };
    return (
      <div className="flex h-full min-h-0 flex-col">
        <header className="mx-auto hidden w-full max-w-xl items-center gap-2 px-3 pb-2 pt-3 md:flex md:max-w-3xl md:px-4 md:pt-4">
          <button
            type="button"
            onClick={() => navigate(createPageUrl("Tasks"))}
            aria-label="返回约定列表"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-stone-500 transition-colors hover:bg-stone-100"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <Orb size={32} tint={tint} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h1 className="truncate text-base font-bold text-stone-900">{guestBuddy.name}</h1>
              <span className="shrink-0 rounded-full bg-[#eef2ff] px-1.5 py-0.5 text-[9px] font-medium text-[#384877]">
                受邀协同
              </span>
            </div>
          </div>
        </header>
        <div className="mx-auto flex w-full max-w-xl min-h-0 flex-1 flex-col px-3 pb-2 pt-2 md:max-w-3xl md:px-4 md:pb-3 md:pt-0">
          <BuddyCollabPanel
            taskId={requestedCollabId}
            buddy={guestBuddy}
            tint={tint}
            guest
            className="!h-full !min-h-0"
          />
        </div>
      </div>
    );
  }

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
      const res = await httpRequest(`/api/buddies/${buddy.id}/graduate`, { method: "POST" });
      queryClient.invalidateQueries({ queryKey: ["buddies"] });
      toast.success(
        res?.note_id
          ? `毕业快乐，${buddy.name}为你骄傲；这段陪伴已沉淀成心签`
          : `毕业快乐，${buddy.name}为你骄傲；约定和心签都保留着`
      );
      navigate(createPageUrl("BuddyStore"));
    } catch (e) {
      toast.error(e?.message || "操作失败，请再试一次");
      setGraduating(false);
    }
  };

  // 取消陪伴：先让服务端把真实进度沉淀成一条按主题命名的心签，再回货架；
  // 约定、子约定、心签都保留，下次重新认领可以接着用。
  const stopCompanionship = async () => {
    if (stopping) return;
    setStopping(true);
    try {
      const res = await httpRequest(`/api/buddies/${buddy.id}/stop`, { method: "POST" });
      queryClient.invalidateQueries();
      toast.success(
        res?.note_id
          ? `已收起，${buddy.name}的陪伴已沉淀为一条心签`
          : `已收起；陪伴小结没生成成功，约定和心签都还在`
      );
      navigate(createPageUrl("BuddyStore"));
    } catch (e) {
      toast.error(e?.message || "操作失败，请再试一次");
      setStopping(false);
    }
  };

  // 删除搭子里新建的协同小组（主项目不可删；成员身份由后端权限兜底）
  const deleteCollab = async () => {
    const target = deleteCollabTarget;
    if (!target || deletingCollab) return;
    setDeletingCollab(true);
    try {
      await httpRequest(`/api/tasks/${target.id}`, { method: "DELETE" });
      if (selectedCollabId === target.id) setSelectedCollabId(null);
      setDeleteCollabTarget(null);
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      toast.success(`已删除协同小组「${target.title}」`);
    } catch (e) {
      toast.error(e?.data?.message || e?.message || "删除失败，只有创建者可以删除");
    } finally {
      setDeletingCollab(false);
    }
  };

  // 在同一颗搭子下新建子项目（如学习搭子里的「数学」「英语」）
  const createProject = async () => {
    const title = newProjectTitle.trim();
    if (!title || creatingProject) return;
    setCreatingProject(true);
    try {
      await httpRequest("/api/tasks", {
        method: "POST",
        body: {
          title,
          description: newProjectGoal.trim() || undefined,
          category: "personal",
          priority: "medium",
          buddy_id: buddy.id,
          buddy_project: true,
        },
      });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      setNewProjectOpen(false);
      setNewProjectTitle("");
      setNewProjectGoal("");
      toast.success(`已创建子项目「${title}」`);
    } catch (e) {
      toast.error(e?.message || "创建失败，请再试一次");
    } finally {
      setCreatingProject(false);
    }
  };

  return (
    <div className="max-w-xl md:max-w-3xl lg:max-w-4xl mx-auto px-3 pt-2 md:px-4 md:pt-10 pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-10">
      {/* 页眉：搭子头 + 人格化问候（手机端返回按钮由全局页眉提供；
          协同页把空间让给对话框，手机端隐藏这一行） */}
      <header className={cn("items-center gap-3", activeTab === "协同" ? "hidden md:flex" : "flex")}>
        <button
          onClick={() => navigate(createPageUrl("Dashboard"))}
          aria-label="返回"
          className="hidden h-9 w-9 items-center justify-center rounded-full text-stone-500 transition-colors hover:bg-stone-100 lg:flex"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <Orb size={48} tint={tint} />
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold text-stone-900 md:text-xl">{buddy.name}</h1>
          <p className="mt-0.5 truncate text-[12px] text-stone-500 md:text-[13px]">
            {buddy.greeting[persona] || buddy.greeting.gentle}
          </p>
        </div>
        <button
          onClick={() => setGraduateOpen(true)}
          title="结束陪伴：毕业或先收起（内容会沉淀）"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700"
        >
          <GraduationCap className="w-5 h-5" />
        </button>
      </header>

      {/* 板块标签（配置驱动）：桌面端顶部标签；手机端用底部标签导航 */}
      <nav className="hidden md:mt-5 md:flex md:gap-2 overflow-x-auto scrollbar-hide border-b border-stone-200">
        {sections.map((s) => {
          const active = s === activeTab;
          return (
            <button
              key={s}
              onClick={() => setTab(s)}
              className={cn(
                "shrink-0 px-3 py-2 text-[13px] border-b-2 -mb-px transition-colors md:px-4 md:py-2.5 md:text-sm",
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
      <div className="mt-3 md:mt-5">
        {activeTab === sections[0] && buddy?.custom && (
          <div className="space-y-4">
            <BuddyChatPanel buddy={buddy} profile={profile} tint={tint} projectTask={projectTask} />
            <HomeSection buddy={buddy} profile={profile} tint={tint} projectTask={projectTask} />
            <BuddyProjectsSection
              buddy={buddy} tint={tint} primaryTask={projectTask} tasks={buddyTasks}
              onSelectCollab={(id) => { setSelectedCollabId(id); setTab("协同"); }}
              onCreateProject={() => setNewProjectOpen(true)}
              onCreateCollab={() => setNewCollabOpen(true)}
              onDeleteCollab={setDeleteCollabTarget}
            />
          </div>
        )}
        {activeTab === sections[0] && buddyId === "study" && (
          <div className="space-y-4">
            <BuddyChatPanel buddy={buddy} profile={profile} tint={tint} projectTask={projectTask} />
            <HomeSection buddy={buddy} profile={profile} tint={tint} projectTask={projectTask} />
            <BuddyProjectsSection
              buddy={buddy} tint={tint} primaryTask={projectTask} tasks={buddyTasks}
              onSelectCollab={(id) => { setSelectedCollabId(id); setTab("协同"); }}
              onCreateProject={() => setNewProjectOpen(true)}
              onCreateCollab={() => setNewCollabOpen(true)}
              onDeleteCollab={setDeleteCollabTarget}
            />
          </div>
        )}
        {activeTab === sections[0] && buddyId === "travel" && (
          <div className="space-y-4">
            <BuddyChatPanel buddy={buddy} profile={profile} tint={tint} projectTask={projectTask} />
            <HomeSection buddy={buddy} profile={profile} tint={tint} projectTask={projectTask} />
            <ItineraryPanel buddy={buddy} profile={profile} tint={tint} persona={persona} projectTask={projectTask} />
            <BuddyProjectsSection
              buddy={buddy} tint={tint} primaryTask={projectTask} tasks={buddyTasks}
              onSelectCollab={(id) => { setSelectedCollabId(id); setTab("协同"); }}
              onCreateProject={() => setNewProjectOpen(true)}
              onCreateCollab={() => setNewCollabOpen(true)}
              onDeleteCollab={setDeleteCollabTarget}
            />
          </div>
        )}
        {activeTab === sections[0] && buddyId === "reading" && (
          <div className="space-y-4">
            <BuddyChatPanel buddy={buddy} profile={profile} tint={tint} projectTask={projectTask} />
            <ReadingNowPanel profile={profile} tint={tint} persona={persona} projectTask={projectTask} />
            {projectTask && <ProjectTaskCard task={projectTask} tint={tint} />}
            <BuddyProjectsSection
              buddy={buddy} tint={tint} primaryTask={projectTask} tasks={buddyTasks}
              onSelectCollab={(id) => { setSelectedCollabId(id); setTab("协同"); }}
              onCreateProject={() => setNewProjectOpen(true)}
              onCreateCollab={() => setNewCollabOpen(true)}
              onDeleteCollab={setDeleteCollabTarget}
            />
          </div>
        )}
        {activeTab === sections[0] && buddyId === "morning" && (
          <div className="space-y-4">
            <BuddyChatPanel buddy={buddy} profile={profile} tint={tint} projectTask={projectTask} />
            <MorningCheckPanel profile={profile} tint={tint} persona={persona} projectTask={projectTask} />
            <BuddyProjectsSection
              buddy={buddy} tint={tint} primaryTask={projectTask} tasks={buddyTasks}
              onSelectCollab={(id) => { setSelectedCollabId(id); setTab("协同"); }}
              onCreateProject={() => setNewProjectOpen(true)}
              onCreateCollab={() => setNewCollabOpen(true)}
              onDeleteCollab={setDeleteCollabTarget}
            />
          </div>
        )}
        {activeTab === sections[0] && buddyId === "running" && (
          <div className="space-y-4">
            <BuddyChatPanel buddy={buddy} profile={profile} tint={tint} projectTask={projectTask} />
            <RunningTodayPanel profile={profile} tint={tint} persona={persona} projectTask={projectTask} />
            <BuddyProjectsSection
              buddy={buddy} tint={tint} primaryTask={projectTask} tasks={buddyTasks}
              onSelectCollab={(id) => { setSelectedCollabId(id); setTab("协同"); }}
              onCreateProject={() => setNewProjectOpen(true)}
              onCreateCollab={() => setNewCollabOpen(true)}
              onDeleteCollab={setDeleteCollabTarget}
            />
          </div>
        )}
        {activeTab === "解题" && <SolvePanel tint={tint} persona={persona} projectTask={projectTask} />}
        {activeTab === "周报" && <WeekPanel tint={tint} projectTask={projectTask} />}
        {activeTab === "记录" && buddyId === "running" && <RunningLogPanel profile={profile} tint={tint} />}
        {activeTab === "身体" && buddyId === "running" && <RunningBodyPanel profile={profile} tint={tint} />}
        {activeTab === "装备与知识" && buddyId === "running" && <RunningGearPanel profile={profile} tint={tint} />}
        {activeTab === "灵感" && (
          <InspirationPanel buddy={buddy} profile={profile} tint={tint} projectTask={projectTask} />
        )}
        {activeTab === "书架" && <ShelfPanel profile={profile} tint={tint} />}
        {activeTab === "笔记" && <ReadingNotesPanel tint={tint} />}
        {activeTab === "资料" && buddy.custom && (
          <CustomMaterialsPanel buddy={buddy} tint={tint} />
        )}
        {activeTab === "协同" && (
          <CollabSection
            buddy={buddy}
            tint={tint}
            persona={persona}
            profile={profile}
            projectTask={projectTask}
            allTasks={allTasks}
            selectedCollabId={selectedCollabId}
            onSelectCollab={setSelectedCollabId}
            onCreateCollab={() => setNewCollabOpen(true)}
            onDeleteCollab={setDeleteCollabTarget}
          />
        )}
        {activeTab === "画像" && (buddyId === "running" ? (
          <RunningProfilePanel profile={profile} tint={tint} />
        ) : (
          <ProfileSection buddy={buddy} profile={profile} tint={tint} projectTask={projectTask} />
        ))}
        {activeTab === "清单" && buddy.extras?.checklist && (
          <ChecklistSection items={buddy.extras.checklist} tint={tint} projectTask={projectTask} />
        )}
        {activeTab === "习惯" && buddy.extras?.habitChain && (
          <HabitChainPanel chain={buddy.extras.habitChain} tint={tint} />
        )}
        {!["协同", "资料", "画像", "清单", "习惯", "解题", "周报", "灵感", "书架", "笔记", "记录", "身体", "装备与知识"].includes(activeTab) &&
          activeTab !== sections[0] && <UpcomingSection buddy={buddy} tab={activeTab} tint={tint} />}
      </div>

      {/* 新建独立协同小组：按主题创建多个小组，归属本搭子 */}
      <CollabCreateDialog
        open={newCollabOpen}
        existingTask={null}
        buddyId={buddy.id}
        buddyName={buddy.name}
        onClose={() => setNewCollabOpen(false)}
        onCreated={(id) => {
          setNewCollabOpen(false);
          if (id) setSelectedCollabId(id);
          setTab("协同");
          queryClient.invalidateQueries({ queryKey: ["tasks"] });
        }}
      />

      {/* 新建子项目：同一颗搭子下并行推进多条线 */}
      {newProjectOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-[#384877]/45 p-5"
          onClick={() => setNewProjectOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl bg-white p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-stone-900">新建子项目</h3>
            <p className="mt-1 text-xs leading-relaxed text-stone-400">
              在{buddy.name}下并行推进另一条线，比如「数学」「英语」。
            </p>
            <input
              value={newProjectTitle}
              onChange={(e) => setNewProjectTitle(e.target.value)}
              placeholder="项目名称，如「数学 · 中考复习」"
              maxLength={60}
              className="mt-4 w-full rounded-xl border border-stone-200 px-3.5 py-2.5 text-sm outline-none focus:border-[#384877]"
            />
            <textarea
              value={newProjectGoal}
              onChange={(e) => setNewProjectGoal(e.target.value)}
              placeholder="一句话目标（可选）"
              rows={2}
              maxLength={200}
              className="mt-2 w-full resize-none rounded-xl border border-stone-200 px-3.5 py-2.5 text-sm outline-none focus:border-[#384877]"
            />
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setNewProjectOpen(false)}
                className="flex-1 rounded-full border border-stone-200 py-2.5 text-sm text-stone-600"
              >
                取消
              </button>
              <button
                onClick={createProject}
                disabled={!newProjectTitle.trim() || creatingProject}
                className="flex-1 rounded-full bg-[#384877] py-2.5 text-sm text-white disabled:opacity-50"
              >
                {creatingProject ? "创建中…" : "创建"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 删除协同小组确认 */}
      {deleteCollabTarget && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-[#384877]/45 p-5"
          onClick={() => {
            if (!deletingCollab) setDeleteCollabTarget(null);
          }}
        >
          <div
            className="w-full max-w-sm rounded-3xl bg-white p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-stone-900">删除协同小组？</h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-stone-500">
              「{deleteCollabTarget.title}」的讨论、子约定、执行节点和沉淀会一起删除，且无法恢复。
            </p>
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setDeleteCollabTarget(null)}
                disabled={deletingCollab}
                className="flex-1 rounded-full border border-stone-200 py-2.5 text-sm text-stone-600 disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={deleteCollab}
                disabled={deletingCollab}
                className="flex-1 rounded-full bg-rose-600 py-2.5 text-sm text-white disabled:opacity-50"
              >
                {deletingCollab ? "删除中…" : "确认删除"}
              </button>
            </div>
          </div>
        </div>
      )}

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
                disabled={graduating || stopping}
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
            <div className="mt-5 border-t border-stone-100 pt-4">
              <p className="text-[11px] leading-relaxed text-stone-400">
                还没走完也可以先收起：会把这段陪伴按主题沉淀成一条「陪伴小结」心签，
                约定、子约定和心签全部保留，下次重新认领接着用。
              </p>
              <button
                onClick={stopCompanionship}
                disabled={stopping || graduating}
                className="mt-2.5 text-[13px] text-stone-500 underline underline-offset-4 hover:text-stone-700 disabled:opacity-50"
              >
                {stopping ? "正在沉淀…" : "先收起搭子（沉淀为心签）"}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* 手机端场景化底部标签：把板块切换放到拇指区，同时替代全局底部导航 */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 md:hidden flex items-stretch justify-around border-t border-stone-200 bg-white pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2"
        aria-label="搭子空间标签"
      >
        {sections.map((s) => {
          const active = s === activeTab;
          const Icon = SECTION_ICONS[s] || Circle;
          return (
            <button
              key={s}
              type="button"
              onClick={() => setTab(s)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-[48px] min-w-[56px] flex-1 flex-col items-center justify-center gap-0.5 px-2 transition-colors",
                active ? "text-[#B89A6A]" : "text-stone-400 hover:text-stone-600"
              )}
            >
              <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.2 : 1.6} />
              <span className={cn("text-[11px]", active && "font-medium")}>{s}</span>
            </button>
          );
        })}
      </nav>
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

/* ---------- 项目与小组：同一颗搭子下并行多个子项目 / 协同小组 ---------- */
function BuddyProjectsSection({ buddy, tint, primaryTask, tasks = [], onSelectCollab, onCreateProject, onCreateCollab, onDeleteCollab }) {
  const queryClient = useQueryClient();
  const [renameTarget, setRenameTarget] = useState(null);
  const [renameTitle, setRenameTitle] = useState("");
  const [renaming, setRenaming] = useState(false);

  const openRename = (task) => {
    setRenameTarget(task);
    setRenameTitle(task.title || "");
  };

  const submitRename = async () => {
    const title = renameTitle.trim();
    if (!renameTarget || !title || renaming) return;
    if (title === renameTarget.title) {
      setRenameTarget(null);
      return;
    }
    setRenaming(true);
    try {
      await httpRequest(`/api/tasks/${renameTarget.id}`, { method: "PATCH", body: { title } });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["buddies", "mine"] });
      queryClient.invalidateQueries({ queryKey: ["collab"] });
      toast.success(`已改名为「${title}」`);
      setRenameTarget(null);
    } catch (error) {
      toast.error(error?.data?.message || error?.message || "改名失败，再试一次");
    } finally {
      setRenaming(false);
    }
  };

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5">
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-[11px] tracking-widest text-stone-400">项目与小组</div>
        <span className="shrink-0 text-xs text-stone-400">{tasks.length} 个</span>
      </div>

      <div className="mt-3 space-y-2">
        {tasks.map((t) => {
          const isPrimary = t.id === primaryTask?.id;
          const isCollab = !!t.metadata?.collab;
          const done = isTaskEffectivelyCompleted(t);
          return (
            <div key={t.id} className="flex items-center gap-3 rounded-xl bg-[#FAF9F7] px-3.5 py-3">
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
                style={{ background: isCollab ? tint[2] : "#384877" }}
              >
                {isCollab ? "协" : "项"}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-[13px] font-medium text-stone-800">{t.title}</span>
                  <span className="shrink-0 rounded-full bg-white px-1.5 py-0.5 text-[9px] text-stone-400">
                    {isPrimary ? (isCollab ? "主项目 · 协同" : "主项目") : isCollab ? "协同小组" : "子项目"}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-stone-400">
                  {done ? "已完成" : `${t.progress || 0}% · ${isCollab ? "多人协作中" : "进行中"}`}
                </p>
              </div>
              {isCollab && (
                <button
                  type="button"
                  onClick={() => onSelectCollab(t.id)}
                  className="shrink-0 text-[11px] text-[#384877] hover:underline"
                >
                  进入协同 →
                </button>
              )}
              <button
                type="button"
                onClick={() => openRename(t)}
                title={isCollab ? "重命名协同小组" : "重命名项目"}
                className="shrink-0 text-stone-300 transition-colors hover:text-[#384877]"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              {isCollab && !isPrimary && !t.shared_role && (
                <button
                  type="button"
                  onClick={() => onDeleteCollab?.(t)}
                  title="删除协同小组"
                  className="shrink-0 text-stone-300 transition-colors hover:text-rose-500"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          );
        })}
        {tasks.length === 0 && <p className="text-xs text-stone-400">还没有项目或小组。</p>}
      </div>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onCreateProject}
          className="flex-1 rounded-full border border-stone-200 px-3 py-2 text-xs text-stone-600 transition-colors hover:bg-stone-50"
        >
          ＋ 新建子项目
        </button>
        <button
          type="button"
          onClick={onCreateCollab}
          className="flex-1 rounded-full px-3 py-2 text-xs font-medium text-white"
          style={{ background: tint[2] }}
        >
          ＋ 新建协同小组
        </button>
      </div>

      {renameTarget && (
        <div
          className="fixed inset-0 z-[75] flex items-center justify-center bg-[#384877]/45 p-5"
          onClick={() => { if (!renaming) setRenameTarget(null); }}
        >
          <div className="w-full max-w-sm rounded-3xl bg-white p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-stone-900">
              重命名{renameTarget.metadata?.collab ? "协同小组" : "项目"}
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-stone-400">
              只改变显示名称，讨论、子约定和进度都会保留。
            </p>
            <input
              autoFocus
              value={renameTitle}
              onChange={(e) => setRenameTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submitRename();
                }
              }}
              maxLength={60}
              className="mt-4 w-full rounded-xl border border-stone-200 px-3.5 py-2.5 text-sm outline-none focus:border-[#384877]"
            />
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setRenameTarget(null)}
                disabled={renaming}
                className="flex-1 rounded-full border border-stone-200 py-2.5 text-sm text-stone-600 disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={submitRename}
                disabled={!renameTitle.trim() || renaming}
                className="flex-1 rounded-full bg-[#384877] py-2.5 text-sm text-white disabled:opacity-50"
              >
                {renaming ? "保存中…" : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/* ---------- 协同：朋友 + 搭子 Agent 的多方共创 ----------
   以专业 Agent 为协调者（拉齐共识、化解分歧、推进讨论、总结沉淀、外部信息支援）；
   讨论产出自动落成子约定与心签。只显示属于本搭子的协同约定（项目约定或同 buddy_id），
   其他搭子的协同约定不出现在这里。 */
function CollabSection({ buddy, tint, persona, profile, projectTask, allTasks = [], selectedCollabId, onSelectCollab, onCreateCollab, onDeleteCollab }) {
  const queryClient = useQueryClient();
  const [enabling, setEnabling] = useState(false);
  const [createdCollabId, setCreatedCollabId] = useState(null);
  const [createdOpened, setCreatedOpened] = useState(false);
  const isMine = (t) =>
    t?.metadata?.collab &&
    !t.deleted_at &&
    !t.parent_task_id &&
    (t.id === projectTask?.id || t.metadata?._extraFields?.buddy_id === buddy.id);
  const myCollabs = allTasks
    .filter(isMine)
    .sort((a, b) => new Date(b.created_date || 0) - new Date(a.created_date || 0));
  const projectCollab = projectTask?.metadata?.collab ? projectTask : null;
  // 新建成功后先用返回的 id 立即切入协同空间，不必等 tasks 列表回刷；
  // 一旦它出现在任务列表里就交给列表接管，避免删除后仍回退到失效 id。
  useEffect(() => {
    if (createdCollabId && !createdOpened && myCollabs.some((t) => t.id === createdCollabId)) {
      setCreatedOpened(true);
    }
  }, [createdCollabId, createdOpened, myCollabs]);
  const createdCollab = createdCollabId && !createdOpened ? { id: createdCollabId } : null;
  // 选中的小组优先；项目约定已开协同 → 用它；没有项目约定 → 用本搭子最近的一场协同
  const selectedCollab = selectedCollabId ? myCollabs.find((t) => t.id === selectedCollabId) : null;
  // 新建小组后任务列表还没回刷时，先用 id 打开它的协同空间
  const selectedFallback = selectedCollabId ? { id: selectedCollabId } : null;
  // 刚新建的小组可能还没进入任务列表：用 id 先打开它；
  // 没有显式选择时优先项目协同，其次本搭子最近的小组——进「协同」即可直接看到对话框
  const activeCollab =
    selectedCollab || selectedFallback || projectCollab || myCollabs[0] || createdCollab || null;
  const activeTask = activeCollab ? myCollabs.find((t) => t.id === activeCollab.id) || null : null;

  // 一键开启协同：默认「朋友」场景 + Agent 全程协调，无需填写任何表单；
  // 项目约定存在则就地开启，缺失（被删/未同步）时直接新建一场归属本搭子的协同约定
  const enableCollab = async () => {
    if (enabling || activeCollab) return;
    setEnabling(true);
    const collabMeta = (goal) => ({
      scenario: "friends",
      goal,
      agent: { enabled: true, paused: false },
      confirmRule: "owner",
    });
    try {
      if (projectTask) {
        await httpRequest(`/api/tasks/${projectTask.id}`, {
          method: "PATCH",
          body: {
            metadata: {
              ...(projectTask.metadata || {}),
              collab: collabMeta(`和伙伴一起推进「${projectTask.title}」`),
            },
          },
        });
      } else {
        const created = await httpRequest("/api/tasks", {
          method: "POST",
          body: {
            title: `${buddy.name}的协同约定`,
            description: "和伙伴一起推进，子约定与沉淀由搭子维护",
            category: "collab",
            status: "pending",
            priority: "medium",
            metadata: { collab: collabMeta(`和伙伴一起推进`), _extraFields: { buddy_id: buddy.id, buddy_name: buddy.name } },
          },
        });
        if (created?.id) {
          setCreatedOpened(false);
          setCreatedCollabId(created.id);
        }
      }
      toast.success("协同空间已开启，点右上角邀请伙伴加入");
      await queryClient.invalidateQueries();
    } catch (e) {
      toast.error(e?.message || "开启失败，再试一次");
    } finally {
      setEnabling(false);
    }
  };

  // 已开启协同：小组切换 + 极简协同面板（讨论为主，约定/沉淀按需查看）
  if (activeCollab) {
    return (
      <div className="space-y-3">
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide">
          {myCollabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onSelectCollab?.(t.id)}
              className={`max-w-[140px] shrink-0 truncate rounded-full px-2.5 py-1 text-[10px] transition-colors ${
                t.id === activeCollab.id
                  ? "bg-[#384877] text-white"
                  : "border border-stone-200 bg-white text-stone-500 hover:text-[#384877]"
              }`}
            >
              {t.title}
            </button>
          ))}
          <button
            type="button"
            onClick={onCreateCollab}
            className="shrink-0 rounded-full border border-dashed border-stone-300 px-2.5 py-1 text-[10px] text-stone-400 hover:text-[#384877]"
          >
            ＋ 新建小组
          </button>
        </div>
        <BuddyCollabPanel key={activeCollab.id} taskId={activeCollab.id} buddy={buddy} tint={tint} profile={profile} />
        {activeTask && activeTask.id !== projectTask?.id && !activeTask.shared_role && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => onDeleteCollab?.(activeTask)}
              className="inline-flex items-center gap-1 text-xs text-stone-400 transition-colors hover:text-rose-500"
            >
              <Trash2 className="h-3.5 w-3.5" /> 删除当前小组
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Agent 角色：一行说清，不再铺四段说明 */}
      <section className="rounded-2xl bg-[#384877] p-4 text-[#FAF9F7]">
        <div className="flex items-center gap-2 text-xs tracking-widest opacity-70">
          <Users2 className="w-4 h-4" /> 协同约定里的{buddy.name}
        </div>
        <p className="mt-2 text-[13px] leading-relaxed opacity-90">
          {personaName(persona)} · 协调分歧、推动进展、专业外援、总结沉淀
        </p>
      </section>

      {/* 本搭子的其他协同约定 */}
      {myCollabs.length > 0 && (
        <section className="rounded-2xl border border-stone-200 bg-white p-5">
          <div className="text-[11px] tracking-widest text-stone-400">本搭子的协同约定</div>
          <ul className="mt-3 space-y-2">
            {myCollabs.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => onSelectCollab?.(t.id)}
                  className="flex w-full items-center gap-3 rounded-xl bg-[#FAF9F7] px-4 py-3 text-left transition-colors hover:bg-stone-100"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white text-xs" style={{ background: tint[2] }}>协</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium text-stone-800">{t.title}</span>
                    <span className="text-xs text-stone-400">多人共创中</span>
                  </span>
                  <span className="text-stone-400">→</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 新建协同 */}
      <section className="rounded-2xl border border-stone-200 bg-white p-5 text-center">
        <p className="text-[15px] font-medium text-stone-800">拉个伙伴，一起推进</p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-stone-500">
          发邀请给朋友，大家和{buddy.name}在同一个讨论区聊，子约定和沉淀由 ta 维护。
        </p>
        <button
          onClick={enableCollab}
          disabled={enabling}
          className="mt-4 min-h-[44px] w-full rounded-full text-sm font-medium text-white disabled:opacity-50 inline-flex items-center justify-center gap-2"
          style={{ background: tint[2] }}
        >
          {enabling && <Loader2 className="w-4 h-4 animate-spin" />}
          {enabling ? "正在开启…" : "一键开启协同约定"}
        </button>
        <button
          onClick={onCreateCollab}
          className="mt-2.5 block w-full text-xs text-[#384877] hover:underline underline-offset-2"
        >
          或者新建一个独立的协同小组 →
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

/* ---------- 领域特色：旅行清单（逐项落成项目约定下的子约定，勾选状态与约定列表同源） ---------- */
function ChecklistSection({ items, tint, projectTask = null }) {
  const { state, patch } = useBuddyState("travel");
  const extra = useMemo(() => state.checklist_extra || [], [state.checklist_extra]);
  const all = useMemo(() => Array.from(new Set([...items, ...extra])), [items, extra]);
  const legacyChecked = useMemo(() => state.checklist_checked || [], [state.checklist_checked]);
  // 老版本本地勾选过的项，在创建子约定时直接落成已完成，不丢进度
  const subItems = useMemo(
    () =>
      all.map((item) => ({
        title: item,
        description: "行前清单 · 来自旅游搭子",
        done: legacyChecked.includes(item),
      })),
    [all, legacyChecked]
  );
  const { childByTitle, missingCount, syncing, autoError, syncNow, toggle } = useListSubtasks(
    projectTask,
    subItems,
    "travel_checklist"
  );

  const doneCount = subItems.filter((item) => {
    const child = childByTitle.get(item.title);
    return child ? isTaskEffectivelyCompleted(child) : legacyChecked.includes(item.title);
  }).length;

  // 没有项目约定时保留本地勾选（等约定接上后，会自动把已勾选项落成已完成子约定）
  const toggleItem = (item) => {
    if (!projectTask) {
      const next = legacyChecked.includes(item)
        ? legacyChecked.filter((x) => x !== item)
        : [...legacyChecked, item];
      patch({ checklist_checked: next });
      return;
    }
    toggle(item);
  };

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5">
      <div className="flex items-baseline justify-between">
        <div className="text-[11px] tracking-widest text-stone-400">行前清单</div>
        <span className="text-xs text-stone-400">{`${doneCount}/${all.length}`}</span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-stone-100">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${all.length ? (doneCount / all.length) * 100 : 0}%`, background: tint[2] }}
        />
      </div>
      <ul className="mt-3 space-y-2.5">
        {all.map((item) => {
          const child = childByTitle.get(item);
          const done = child ? isTaskEffectivelyCompleted(child) : legacyChecked.includes(item);
          const ready = !!child;
          return (
            <li key={item}>
              <button
                onClick={() => toggleItem(item)}
                disabled={!!projectTask && !ready}
                className="flex w-full items-center gap-3 text-left disabled:cursor-default"
              >
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
                {projectTask && !ready && (
                  <span className="ml-auto text-[10px] text-stone-400 flex-shrink-0">
                    {syncing ? "同步中…" : "待同步"}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {projectTask ? (
        <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-stone-400">
          <span>
            {autoError
              ? "清单同步没完成，点右侧重试。"
              : missingCount > 0 || syncing
                ? "正在把清单逐项列为子约定…"
                : "已全部列为子约定，勾选会同步到约定列表。"}
          </span>
          {autoError && (
            <button
              onClick={() => syncNow({ notify: true }).catch(() => {})}
              className="shrink-0 underline underline-offset-2 hover:text-stone-600"
            >
              重试同步
            </button>
          )}
        </div>
      ) : (
        <p className="mt-3 text-xs text-stone-400">认领项目约定后，清单会自动逐项列为子约定，方便在约定列表勾选。</p>
      )}
      <p className="mt-3 text-xs text-stone-400">
        出发前一晚 21:00，我会逐项跟你核对——勾选云端同步，换设备也不丢。
        {projectTask && (
          <Link to={createPageUrl("Tasks")} className="ml-1 text-[#384877] hover:underline">
            去约定列表勾选 →
          </Link>
        )}
      </p>
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
