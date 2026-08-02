import React from "react";
import { ArrowRight, Plus, Trash2, Edit3, ExternalLink } from "lucide-react";
import EmailResultView from "./result/EmailResultView";
import ResearchResultView from "./result/ResearchResultView";
import PptResultView from "./result/PptResultView";
import NoteResultView from "./result/NoteResultView";
import MinutesResultView from "./result/MinutesResultView";
import CalendarResultView from "./result/CalendarResultView";
import FileResultView from "./result/FileResultView";
import LedgerResultView from "./result/LedgerResultView";
import MarkdownLite from "./result/MarkdownLite";

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
  // 兼容相对路径文件链接（如 /uploads/xxx.html）
  if (typeof diffItem.target === "string" && diffItem.target.startsWith("/uploads/")) {
    return diffItem.target;
  }
  return null;
}

// 判断一段文本是否像文件 URL
function looksLikeFileUrl(text) {
  return typeof text === "string" && (/^https?:\/\//.test(text) || text.startsWith("/uploads/"));
}

// 根据 result.type / 字段特征推断该用哪个视图
// 优先级：result.type（后端返回的真实产物类型）> automationType（执行记录上的类型）> 字段特征
function pickView(result, automationType) {
  const d = result?.data || {};
  const rt = String(result?.type || "").toLowerCase();
  const at = String(automationType || "").toLowerCase();

  // 整理账本（必须放在 email/research 等之前，因为 d.entries 是它独有的特征）
  if (rt.includes("ledger") || at.includes("ledger") || Array.isArray(d.entries)) return "ledger";

  // 邮件：result.type 或 automationType 为 email_draft，或数据含邮件字段
  if (rt.includes("email") || at.includes("email") || d.to || d.subject || d.body) return "email";

  // PPT/演示：有 slides/outline 或类型明确
  if (rt.includes("ppt") || rt.includes("slide") || at.includes("ppt") || at.includes("slide") || Array.isArray(d.slides) || Array.isArray(d.outline)) return "ppt";

  // 联网调研 / 办公文档 / 长文总结：有 heading/body 章节结构 → 走 research 视图
  const hasResearchSections = Array.isArray(d.sections) && d.sections.length > 0 && (d.sections[0]?.heading || d.sections[0]?.body || d.sections[0]?.content);
  if (rt.includes("research") || rt.includes("web") || at.includes("research") || at.includes("web")) {
    if (hasResearchSections || d.markdown || d.executive_summary) return "research";
    // 即使没有章节，也优先走 research 兜底而不是 note
    return "research";
  }
  // office_doc：有 sections（章节式 Markdown 文档），无 slides → 走 research 视图
  if ((rt.includes("office") || at.includes("office")) && hasResearchSections && !Array.isArray(d.slides)) return "research";

  // 日历约定
  if (rt.includes("calendar") || rt.includes("event") || at.includes("calendar") || at.includes("event") || d.start_time || d.reminder_time) return "calendar";

  // 文件整理
  if (rt.includes("file") || at.includes("file") || (Array.isArray(d.plan) && d.plan[0]?.source_path)) return "file";

  // 会议纪要：variant=minutes 或 sections 是 items 结构（带 type 字段）
  if (d.variant === "minutes" || (Array.isArray(d.sections) && d.sections[0]?.items && d.file_url)) return "minutes";

  // 长文总结心签：有 heading/body 章节结构（非 items），心签视图渲染不了 → 走 research 视图
  if (hasResearchSections) return "research";

  // 笔记/总结
  if (rt.includes("note") || rt.includes("summary") || at.includes("note") || at.includes("summary") || Array.isArray(d.tags) || Array.isArray(d.key_points)) return "note";

  return null;
}

export default function AutomationResultPreview({ result, automationType, onDataChange, onSaveEdits, availableAttachments, executionId }) {
  if (!result) return null;

  const view = pickView(result, automationType);

  // ---- 类型化视图分发 ----
  if (view === "email")    return <EmailResultView    data={result.data} preview={result.preview} onChange={onDataChange} availableAttachments={availableAttachments} />;
  if (view === "research") return <ResearchResultView data={result.data} preview={result.preview} onChange={onDataChange} onSave={onSaveEdits} />;
  if (view === "ppt")      return <PptResultView      data={result.data} preview={result.preview} executionId={executionId} />;
  if (view === "minutes")  return <MinutesResultView  data={result.data} preview={result.preview} />;
  if (view === "note")     return <NoteResultView     data={result.data} preview={result.preview} onChange={onDataChange} />;
  if (view === "calendar") return <CalendarResultView data={result.data} preview={result.preview} />;
  if (view === "file")     return <FileResultView     result={result} />;
  if (view === "ledger")   return <LedgerResultView   data={result.data} preview={result.preview} />;

  // ---- 通用兜底视图：不再把 preview 当原始代码显示，而是按 Markdown 渲染 + 产物卡片 ----
  const previewUrlMatch = result.preview && result.preview.match(/https?:\/\/[^\s)）"】>]+/);
  const previewFileUrl = previewUrlMatch ? previewUrlMatch[0] : null;

  return (
    <div className="space-y-3">
      {result.preview && (
        <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 max-h-96 overflow-y-auto">
          <MarkdownLite source={result.preview} />
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
              const isFileUrl = looksLikeFileUrl(fileUrl);

              const inner = (
                <>
                  <Icon className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${cfg.color}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <div className={`text-xs font-medium truncate ${isFileUrl ? 'text-[#384877] group-hover:underline' : 'text-slate-800'}`}>
                        {d.target}
                      </div>
                      {isFileUrl && (
                        <span className="flex-shrink-0 inline-flex items-center gap-0.5 text-[9.5px] font-semibold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-full">
                          <ExternalLink className="w-2.5 h-2.5" />
                          打开
                        </span>
                      )}
                    </div>
                    {d.detail && <div className="text-[11px] text-slate-500 line-clamp-2">{d.detail}</div>}
                  </div>
                  {isFileUrl && (
                    <ExternalLink className={`w-3 h-3 flex-shrink-0 mt-1 ${cfg.color} opacity-60 group-hover:opacity-100`} />
                  )}
                </>
              );

              return isFileUrl ? (
                <a
                  key={i}
                  href={fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
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
