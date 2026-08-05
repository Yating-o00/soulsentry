import React from "react";
import { BriefcaseBusiness } from "lucide-react";
import { CardFooter, Checklist, ExtraDetails, ProgressBlock, TaskCopy, TimeBlock } from "./ShareCardSections";

export default function WorkTemplate({ data }) {
  const { task, scene, isEnglish, displayedSubtasks, hasMoreSubtasks, progress, completedSubtasks, dependencyTasks } = data;
  return <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
    <div className="flex items-center justify-between px-7 py-5 text-white" style={{ backgroundColor: scene.accent }}><div className="flex items-center gap-3"><div className="rounded-lg bg-white/15 p-2"><BriefcaseBusiness className="h-5 w-5" /></div><div><p className="text-xs font-bold tracking-widest opacity-80">{scene.headerLabel[isEnglish ? "en" : "zh"]}</p><p className="text-sm font-semibold">{isEnglish ? "Execution Brief" : "协作执行简报"}</p></div></div><span className="rounded-md bg-white/15 px-2 py-1 text-[10px] font-bold">#{task.id.slice(0, 6)}</span></div>
    <div className="space-y-6 p-7"><TaskCopy task={task} isEnglish={isEnglish} accent={scene.accent} /><div className="grid grid-cols-[1fr_140px] gap-4"><TimeBlock task={task} isEnglish={isEnglish} accent={scene.accent} compact /><div className="flex flex-col justify-center rounded-2xl p-4" style={{ backgroundColor: scene.bg }}><p className="text-3xl font-black" style={{ color: scene.accent }}>{progress}%</p><p className="text-xs text-slate-500">{isEnglish ? "overall progress" : "整体进度"}</p></div></div>
      <div className="grid grid-cols-[34px_1fr] gap-3"><div className="flex flex-col items-center"><div className="h-3 w-3 rounded-full" style={{ backgroundColor: scene.accent }} /><div className="h-full w-px bg-slate-200" /></div><div className="pb-2"><p className="mb-3 text-xs font-black tracking-widest text-slate-400">ACTION ITEMS</p><Checklist items={displayedSubtasks} hasMore={hasMoreSubtasks} remaining={data.remaining} accent={scene.accent} numbered /></div></div>
      <ProgressBlock progress={progress} completed={completedSubtasks} total={data.totalSubtasks} accent={scene.accent} /><ExtraDetails task={task} dependencies={dependencyTasks} isEnglish={isEnglish} /><CardFooter {...data} tagline={scene.tagline[isEnglish ? "en" : "zh"]} accent={scene.accent} />
    </div>
  </div>;
}