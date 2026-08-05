import React from "react";
import { Home, Pin } from "lucide-react";
import { CardFooter, Checklist, ExtraDetails, ProgressBlock, TaskCopy, TimeBlock } from "./ShareCardSections";

export default function RoommateTemplate({ data }) {
  const { task, scene, isEnglish, displayedSubtasks, hasMoreSubtasks, progress, completedSubtasks, dependencyTasks, quote } = data;
  return <div className="rounded-[32px] p-3 shadow-2xl" style={{ backgroundColor: scene.accent }}><div className="overflow-hidden rounded-[24px] bg-[#fffdf7]">
    <div className="flex items-center justify-between border-b-2 border-dashed px-7 py-5" style={{ borderColor: `${scene.accent}45` }}><div className="flex items-center gap-3"><Home className="h-6 w-6" style={{ color: scene.accent }} /><div><p className="text-lg font-black text-slate-800">{scene.headerLabel[isEnglish ? "en" : "zh"]}</p><p className="text-xs text-slate-500">{scene.tagline[isEnglish ? "en" : "zh"]}</p></div></div><Pin className="h-5 w-5 rotate-12" style={{ color: scene.accent }} /></div>
    <div className="space-y-6 p-7"><TaskCopy task={task} isEnglish={isEnglish} accent={scene.accent} /><TimeBlock task={task} isEnglish={isEnglish} accent={scene.accent} />
      <div className="rounded-2xl border-2 border-dashed bg-white p-5" style={{ borderColor: `${scene.accent}45` }}><div className="mb-4 flex items-center justify-between"><p className="font-black text-slate-700">{isEnglish ? "Who's doing what?" : "今天谁来做？"}</p><span className="rounded-full px-2 py-1 text-xs font-bold" style={{ backgroundColor: scene.bg, color: scene.accent }}>{completedSubtasks}/{data.totalSubtasks}</span></div><Checklist items={displayedSubtasks} hasMore={hasMoreSubtasks} remaining={data.remaining} accent={scene.accent} /></div>
      <ProgressBlock progress={progress} completed={completedSubtasks} total={data.totalSubtasks} accent={scene.accent} /><ExtraDetails task={task} dependencies={dependencyTasks} isEnglish={isEnglish} /><div className="-rotate-1 rounded-sm px-5 py-4 text-center text-sm font-medium text-slate-700 shadow-sm" style={{ backgroundColor: "#FEF3C7" }}>“{quote}”</div><CardFooter {...data} tagline={isEnglish ? "One roof, shared rhythm" : "同住一屋 · 一起靠谱"} accent={scene.accent} />
    </div>
  </div></div>;
}