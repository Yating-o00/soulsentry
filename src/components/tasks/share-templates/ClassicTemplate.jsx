import React from "react";
import { Calendar } from "lucide-react";
import { format } from "date-fns";
import ShareCardAIIcon from "@/components/tasks/ShareCardAIIcon";
import { CardFooter, Checklist, ExtraDetails, ProgressBlock, TaskCopy, TimeBlock } from "./ShareCardSections";

export default function ClassicTemplate({ data }) {
  const { task, scene, isEnglish, headerImage, displayedSubtasks, hasMoreSubtasks, progress, completedSubtasks, dependencyTasks, qrCodeUrl, quote } = data;
  return <div className="overflow-hidden rounded-3xl bg-white shadow-2xl">
    <div className="relative h-36 overflow-hidden p-7 text-white" style={{ background: `linear-gradient(135deg, ${scene.accent}, ${scene.accent}cc)` }}>
      {headerImage && <img src={headerImage} crossOrigin="anonymous" className="absolute inset-0 h-full w-full object-cover opacity-45" />}
      <div className="relative flex items-start justify-between"><div><div className="flex items-center gap-2 text-xs font-bold tracking-widest"><Calendar className="h-4 w-4" />{scene.headerLabel[isEnglish ? "en" : "zh"]}</div><p className="mt-4 text-3xl font-black">{format(new Date(), "dd / MMM")}</p></div><div className="rounded-2xl bg-white p-2 shadow-lg"><ShareCardAIIcon task={task} /></div></div>
    </div>
    <div className="space-y-6 p-8"><TaskCopy task={task} isEnglish={isEnglish} accent={scene.accent} /><TimeBlock task={task} isEnglish={isEnglish} accent={scene.accent} /><ProgressBlock progress={progress} completed={completedSubtasks} total={data.totalSubtasks} accent={scene.accent} />
      <div className="rounded-2xl bg-slate-50 p-4"><p className="mb-3 text-xs font-black tracking-widest text-slate-400">CHECKLIST</p><Checklist items={displayedSubtasks} hasMore={hasMoreSubtasks} remaining={data.remaining} accent={scene.accent} /></div>
      <ExtraDetails task={task} dependencies={dependencyTasks} isEnglish={isEnglish} /><blockquote className="rounded-2xl px-5 py-4 text-center text-sm italic text-slate-600" style={{ backgroundColor: scene.bg }}>“{quote}”</blockquote><CardFooter {...data} tagline={scene.tagline[isEnglish ? "en" : "zh"]} accent={scene.accent} />
    </div>
  </div>;
}