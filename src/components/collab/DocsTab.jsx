import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import { base44 } from "@/api/base44Client";
import { Bot, FileText, Check } from "lucide-react";

export default function DocsTab({ items, refresh }) {
  const docs = items.filter((i) => i.kind === "document");
  const [openId, setOpenId] = useState(null);
  const confirm = async (d) => { await base44.entities.CollabItem.update(d.id, { status: "done" }); refresh(); };

  if (!docs.length) return <p className="text-center text-sm text-slate-400 py-12 border border-dashed border-slate-200 rounded-2xl">暂无文件</p>;
  return (
    <div className="space-y-3">
      {docs.map((d) => (
        <div key={d.id} className="rounded-2xl border border-slate-100 bg-white">
          <button onClick={() => setOpenId(openId === d.id ? null : d.id)} className="w-full flex items-center gap-3 p-4 md:p-5 text-left">
            <FileText className="w-5 h-5 text-[#384877] shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-medium text-slate-900">{d.title}</p>
              <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                {d.source === "agent" && <><Bot className="w-3 h-3" />Agent 生成 · </>}
                {new Date(d.updated_date).toLocaleString("zh-CN")} · {d.status === "done" ? "已确认" : "待确认"}
              </p>
            </div>
          </button>
          {openId === d.id && (
            <div className="px-5 pb-5 border-t border-slate-100 pt-4">
              <div className="prose prose-sm max-w-none text-slate-700"><ReactMarkdown>{d.content || ""}</ReactMarkdown></div>
              {d.status !== "done" && <button onClick={() => confirm(d)} className="mt-4 text-xs px-3 py-1.5 rounded-full bg-[#384877] text-white flex items-center gap-1"><Check className="w-3.5 h-3.5" />确认为共同文件</button>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}