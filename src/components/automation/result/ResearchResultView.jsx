import React from "react";
import { Globe, Download, ExternalLink, FileText } from "lucide-react";

// 调研类结果视图：报告样式（标题 + 章节）+ 下载按钮
export default function ResearchResultView({ data, preview }) {
  const fileUrl = data?.file_url;
  const fileName = data?.file_name || "调研报告.md";
  const title = data?.topic || data?.title || data?.subject || "调研报告";
  const sections = Array.isArray(data?.sections) ? data.sections : null;
  const body = data?.executive_summary || data?.content || data?.summary || preview || "";

  return (
    <div className="space-y-2.5">
      {/* 报告头 */}
      <div className="rounded-xl bg-gradient-to-br from-[#384877]/8 to-[#3b5aa2]/5 border border-[#384877]/15 p-3">
        <div className="flex items-center gap-2 mb-1">
          <Globe className="w-3.5 h-3.5 text-[#384877]" />
          <span className="text-[10px] font-semibold text-[#384877] uppercase tracking-wider">调研报告</span>
        </div>
        <div className="text-[14px] font-bold text-slate-800 leading-snug">{title}</div>
      </div>

      {/* 章节卡 */}
      {sections && sections.length > 0 ? (
        <div className="space-y-2">
          {sections.slice(0, 6).map((s, i) => {
            const heading = s.heading || s.title || `章节 ${i + 1}`;
            const content = s.body || s.content || "";
            return (
              <div key={i} className="rounded-lg bg-white border border-slate-200 p-3">
                <div className="text-[12.5px] font-bold text-slate-800 mb-1">{heading}</div>
                {content && (
                  <div className="text-[11.5px] text-slate-600 leading-relaxed line-clamp-4 whitespace-pre-wrap">
                    {content}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        body && (
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 max-h-64 overflow-y-auto">
            <pre className="text-[12px] text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">{body}</pre>
          </div>
        )
      )}

      {/* 下载按钮 */}
      {fileUrl && (
        <a
          href={fileUrl}
          target="_blank"
          rel="noopener noreferrer"
          download
          className="flex items-center gap-2.5 rounded-xl bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 hover:border-emerald-400 hover:shadow px-3 py-2.5 transition-all group"
        >
          <div className="w-8 h-8 rounded-lg bg-white border border-emerald-200 flex items-center justify-center group-hover:scale-110 transition-transform">
            <FileText className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[12.5px] font-semibold text-emerald-900 truncate">{fileName}</div>
            <div className="text-[10.5px] text-emerald-700 flex items-center gap-1">
              <Download className="w-2.5 h-2.5" /> 完整报告 · 点击下载
            </div>
          </div>
          <ExternalLink className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
        </a>
      )}
    </div>
  );
}