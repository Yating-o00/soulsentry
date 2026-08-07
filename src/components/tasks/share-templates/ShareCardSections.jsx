import React from "react";
import ReactMarkdown from "react-markdown";
import { Check, Clock, FileText, Link as LinkIcon, Paperclip, StickyNote, Target } from "lucide-react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";

export function TaskCopy({ task, isEnglish, accent, centered = false }) {
  return <div className={centered ? "text-center" : ""}>
    <h1 className="text-3xl font-black leading-tight text-slate-800">{task.title}</h1>
    {task.description && <ReactMarkdown className="prose prose-sm mt-3 max-w-none text-slate-600 prose-p:my-1 prose-li:my-0">{task.description}</ReactMarkdown>}
    <div className={`mt-4 flex flex-wrap gap-2 ${centered ? "justify-center" : ""}`}>
      <span className="rounded-full px-3 py-1 text-xs font-bold" style={{ color: accent, backgroundColor: `${accent}18` }}>{task.category || (isEnglish ? "Task" : "约定")}</span>
      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{task.priority || "medium"}</span>
    </div>
  </div>;
}

export function TimeBlock({ task, isEnglish, accent, compact = false }) {
  const dateFormat = isEnglish ? "MMM dd, yyyy HH:mm" : "yyyy-MM-dd HH:mm";
  return <div className={`rounded-2xl border p-4 ${compact ? "space-y-2" : "grid gap-3"}`} style={{ borderColor: `${accent}25`, backgroundColor: `${accent}09` }}>
    <div className="flex items-center gap-3 text-sm"><Clock className="h-4 w-4" style={{ color: accent }} /><span className="text-slate-500">{isEnglish ? "Start" : "开始"}</span><b className="ml-auto text-slate-800">{format(new Date(task.reminder_time), dateFormat, { locale: isEnglish ? undefined : zhCN })}</b></div>
    {task.end_time && <div className="flex items-center gap-3 text-sm"><Target className="h-4 w-4" style={{ color: accent }} /><span className="text-slate-500">{isEnglish ? "Due" : "截止"}</span><b className="ml-auto text-slate-800">{format(new Date(task.end_time), dateFormat, { locale: isEnglish ? undefined : zhCN })}</b></div>}
  </div>;
}

export function ProgressBlock({ progress, completed, total, accent, vertical = false }) {
  return <div className={vertical ? "text-center" : ""}>
    <div className="flex items-center justify-between text-xs font-bold text-slate-500"><span>PROGRESS</span><span style={{ color: accent }}>{completed}/{total || 0} · {progress}%</span></div>
    <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full" style={{ width: `${progress}%`, backgroundColor: accent }} /></div>
  </div>;
}

export function Checklist({ items, hasMore, remaining, accent, numbered = false }) {
  if (!items.length) return null;
  return <div className="space-y-2.5">
    {items.map((item, index) => { const done = item.status === "completed"; return <div key={item.id} className="flex items-start gap-3 text-sm">
      <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border" style={done ? { backgroundColor: accent, borderColor: accent, color: "white" } : { borderColor: `${accent}55`, color: accent }}>{done ? <Check className="h-3 w-3" /> : numbered ? index + 1 : null}</div>
      <div className="min-w-0 flex-1">
        <span className={done ? "text-slate-400 line-through" : "text-slate-700"}>{(item.title || "").replace(/^\d+\.\s*/, "")}</span>
        {(item.children || []).length > 0 && <div className="mt-1.5 space-y-1.5 border-l-2 pl-3" style={{ borderColor: `${accent}30` }}>
          {item.children.map((child) => { const cdone = child.status === "completed"; return <div key={child.id} className="flex items-start gap-2 text-xs">
            <div className="mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border" style={cdone ? { backgroundColor: accent, borderColor: accent, color: "white" } : { borderColor: `${accent}55` }}>{cdone ? <Check className="h-2 w-2" /> : null}</div>
            <span className={cdone ? "text-slate-400 line-through" : "text-slate-600"}>{(child.title || "").replace(/^\d+\.\s*/, "")}</span>
          </div>; })}
        </div>}
      </div>
    </div>; })}
    {hasMore && <p className="pl-8 text-xs italic text-slate-400">+ {remaining}</p>}
  </div>;
}

export function ExtraDetails({ task, dependencies, isEnglish }) {
  const attachments = task.attachments || [];
  const notes = task.notes || [];
  if (!attachments.length && !dependencies.length && !notes.length) return null;
  return <div className="space-y-3 border-t border-slate-100 pt-4 text-xs text-slate-600">
    {attachments.length > 0 && <div className="flex gap-2"><Paperclip className="h-4 w-4 shrink-0" /><div className="flex flex-wrap gap-1.5">{attachments.map((a, i) => <span key={i} className="rounded-md bg-slate-100 px-2 py-1"><FileText className="mr-1 inline h-3 w-3" />{a.file_name}</span>)}</div></div>}
    {dependencies.length > 0 && <div className="flex gap-2"><LinkIcon className="h-4 w-4 shrink-0" /><span>{isEnglish ? "Depends on: " : "前置依赖："}{dependencies.map(d => d.title).join("、")}</span></div>}
    {notes.length > 0 && <div className="flex gap-2"><StickyNote className="h-4 w-4 shrink-0" /><span>{notes.slice(0, 2).map(n => n.content.replace(/<[^>]+>/g, "").slice(0, 60)).join(" · ")}</span></div>}
  </div>;
}

export function CardFooter({ qrCodeUrl, task, tagline, isEnglish, accent }) {
  return <div className="flex items-center justify-between border-t border-slate-100 pt-4">
    <div><p className="text-xs font-black" style={{ color: accent }}>{isEnglish ? "SoulSentry" : "心灵存放站"}</p><p className="mt-0.5 text-[10px] text-slate-400">{tagline}</p></div>
    <div className="flex items-center gap-2"><div className="text-right text-[10px] text-slate-400"><p>{isEnglish ? "Scan to join" : "扫码参与"}</p><p className="font-mono">ID: {task.id.slice(0, 4)}</p></div><img src={qrCodeUrl} alt="QR Code" crossOrigin="anonymous" className="h-12 w-12 rounded-md border border-slate-100 bg-white p-0.5" /></div>
  </div>;
}