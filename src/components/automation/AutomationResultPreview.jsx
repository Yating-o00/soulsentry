import React from "react";
import { ArrowRight, Plus, Trash2, Edit3, Download, ExternalLink } from "lucide-react";
import EmailResultView from "./result/EmailResultView";
import ResearchResultView from "./result/ResearchResultView";
import PptResultView from "./result/PptResultView";
import NoteResultView from "./result/NoteResultView";
import CalendarResultView from "./result/CalendarResultView";
import FileResultView from "./result/FileResultView";

const diffIcons = {
  create: { icon: Plus, color: "text-emerald-600", bg: "bg-emerald-50", hover: "hover:bg-emerald-100" },
  delete: { icon: Trash2, color: "text-red-500", bg: "bg-red-50", hover: "hover:bg-red-100" },
  move: { icon: ArrowRight, color: "text-blue-600", bg: "bg-blue-50", hover: "hover:bg-blue-100" },
  update: { icon: Edit3, color: "text-amber-600", bg: "bg-amber-50", hover: "hover:bg-amber-100" },
};

// 从 result 中尽可能解析出与 diff target 对应的可下载 URL
function resolveFileUrl(result, diffItem) {
  if (diffItem?.url) return diffItem.url;
  const d = result?.data;
  if (!d) return null;
  if (d.file_url && d.file_name && diffItem.target && diffItem.target.includes(d.file_name)) {
    return d.file_url;
  }
  if (d.file_url && Array.isArray(result.diff) && result.diff.length === 1 && diffItem.action === "create") {
    return d.file_url;
  }
  return null;
}

// 根据 result.type / 字段特征推断该用哪个视图
function pickView(result, automationType) {
  const t = (automationType || result?.type || "").toLowerCase();
  const d = result?.data || {};
  if (t.includes("email") || d.to || d.subject) return "email";
  // office_doc：有 sections（章节式 Markdown 文档），无 slides → 走 research 视图（支持 Markdown 图片渲染）
  if (t.includes("office") && Array.isArray(d.sections) && !Array.isArray(d.slides)) return "research";
  if (t.includes("research") || t.includes("web")) return "research";
  if (t.includes("ppt") || t.includes("slide") || Array.isArray(d.slides) || Array.isArray(d.outline)) return "ppt";
  if (t.includes("calendar") || t.includes("event") || d.start_time || d.reminder_time) return "calendar";
  if (t.includes("file") || t.includes("organize")) return "file";
  if (t.includes("note") || t.includes("summary") || Array.isArray(d.tags) || Array.isArray(d.key_points)) return "note";
  return null;
}

export default function AutomationResultPreview({ result, automationType, onDataChange, onSaveEdits, availableAttachments }) {
  if (!result) return null;

  const view = pickView(result, automationType);

  // ---- 类型化视图分发 ----
  if (view === "email")    return <EmailResultView    data={result.data} preview={result.preview} onChange={onDataChange} availableAttachments={availableAttachments} />;
  if (view === "research") return <ResearchResultView data={result.data} preview={result.preview} onChange={onDataChange} onSave={onSaveEdits} />;
  if (view === "ppt")      return <PptResultView      data={result.data} preview={result.preview} />;
  if (view === "note")     return <NoteResultView     data={result.data} preview={result.preview} onChange={onDataChange} />;
  if (view === "calendar") return <CalendarResultView data={result.data} preview={result.preview} />;
  if (view === "file")     return <FileResultView     result={result} />;

  // ---- 通用兜底视图：保留原 preview + diff 列表 ----
  const previewUrlMatch = result.preview && result.preview.match(/https?:\/\/[^\s)）"】>]+/);
  const previewFileUrl = previewUrlMatch ? previewUrlMatch[0] : null;

  return (
    <div className="space-y-3">
      {result.preview && (
        <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 max-h-64 overflow-y-auto">
          <pre className="text-xs text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">
            {result.preview}
          </pre>
        </div>
      )}

      {Array.isArray(result.diff) && result.diff.length > 0 && (
        <div>
          <div className="text-xs font-medium text-slate-500 mb-2">变更详情</div>
          <div className="space-y-1.5">
            {result.diff.map((d, i) => {
              const cfg = diffIcons[d.action] || diffIcons.update;
              const Icon = cfg.icon;
              const fileUrl = resolveFileUrl(result, d) || previewFileUrl;
              const isHttpUrl = fileUrl && /^https?:\/\//.test(fileUrl);

              const inner = (
                <>
                  <Icon className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${cfg.color}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <div className={`text-xs font-medium truncate ${isHttpUrl ? 'text-[#384877] group-hover:underline' : 'text-slate-800'}`}>
                        {d.target}
                      </div>
                      {isHttpUrl && (
                        <span className="flex-shrink-0 inline-flex items-center gap-0.5 text-[9.5px] font-semibold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-full">
                          <Download className="w-2.5 h-2.5" />
                          下载
                        </span>
                      )}
                    </div>
                    {d.detail && <div className="text-[11px] text-slate-500 line-clamp-2">{d.detail}</div>}
                  </div>
                  {isHttpUrl && (
                    <ExternalLink className={`w-3 h-3 flex-shrink-0 mt-1 ${cfg.color} opacity-60 group-hover:opacity-100`} />
                  )}
                </>
              );

              return isHttpUrl ? (
                <a
                  key={i}
                  href={fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  download
                  className={`group flex items-start gap-2 p-2 rounded-md ${cfg.bg} ${cfg.hover} transition-colors cursor-pointer`}
                >
                  {inner}
                </a>
              ) : (
                <div key={i} className={`flex items-start gap-2 p-2 rounded-md ${cfg.bg}`}>
                  {inner}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}