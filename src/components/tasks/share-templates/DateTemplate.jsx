import React from "react";
import { Heart } from "lucide-react";
import { format } from "date-fns";
import { CardFooter, Checklist, ExtraDetails, ProgressBlock, TaskCopy, TimeBlock } from "./ShareCardSections";

export default function DateTemplate({ data }) {
  const { task, scene, isEnglish, headerImage, displayedSubtasks, hasMoreSubtasks, progress, completedSubtasks, dependencyTasks, quote } = data;
  return <div className="overflow-hidden rounded-[36px] bg-white shadow-2xl">
    <div className="relative h-56 overflow-hidden"><div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${scene.accent}, #7c2d50)` }} />{headerImage && <img src={headerImage} crossOrigin="anonymous" className="absolute inset-0 h-full w-full object-cover opacity-75" />}<div className="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent" /><div className="absolute inset-x-0 bottom-0 p-8 text-center text-white"><Heart className="mx-auto mb-2 h-7 w-7 fill-current" /><p className="text-xs font-bold tracking-[0.3em]">{scene.headerLabel[isEnglish ? "en" : "zh"]}</p><p className="mt-2 text-sm opacity-90">{format(new Date(task.reminder_time), "yyyy · MM · dd")}</p></div></div>
    <div className="space-y-6 px-8 py-7"><TaskCopy task={task} isEnglish={isEnglish} accent={scene.accent} centered /><div className="mx-auto h-px w-20" style={{ backgroundColor: `${scene.accent}55` }} /><TimeBlock task={task} isEnglish={isEnglish} accent={scene.accent} />
      <div className="rounded-[28px] p-5" style={{ backgroundColor: scene.bg }}><div className="mb-4 text-center text-xs font-black tracking-[0.2em]" style={{ color: scene.accent }}>{isEnglish ? "TOGETHER, STEP BY STEP" : "一起完成的小事"}</div><Checklist items={displayedSubtasks} hasMore={hasMoreSubtasks} remaining={data.remaining} accent={scene.accent} /></div>
      <ProgressBlock progress={progress} completed={completedSubtasks} total={data.totalSubtasks} accent={scene.accent} /><ExtraDetails task={task} dependencies={dependencyTasks} isEnglish={isEnglish} /><p className="px-4 text-center font-serif text-base italic leading-relaxed" style={{ color: scene.accent }}>“{quote}”</p><CardFooter {...data} tagline={scene.tagline[isEnglish ? "en" : "zh"]} accent={scene.accent} />
    </div>
  </div>;
}