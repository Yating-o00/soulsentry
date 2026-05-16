import React from "react";
import { Globe, Download, ExternalLink, FileText } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

// 调研类结果视图：标题/正文/章节均可编辑 + 下载按钮
export default function ResearchResultView({ data, preview, onChange, editable = true }) {
  const fileUrl = data?.file_url;
  const fileName = data?.file_name || "调研报告.md";
  const title = data?.topic || data?.title || data?.subject || "调研报告";
  const sections = Array.isArray(data?.sections) ? data.sections : null;
  const body = data?.executive_summary || data?.content || data?.summary || preview || "";

  const titleKey = data?.topic !== undefined ? "topic" : (data?.title !== undefined ? "title" : (data?.subject !== undefined ? "subject" : "title"));
  const bodyKey  = data?.executive_summary !== undefined ? "executive_summary" : (data?.content !== undefined ? "content" : (data?.summary !== undefined ? "summary" : "content"));

  const update = (patch) => {
    if (!onChange) return;
    onChange({ ...(data || {}), ...patch });
  };

  const updateSection = (idx, patch) => {
    if (!onChange || !sections) return;
    const next = sections.map((s, i) => i === idx ? { ...s, ...patch } : s);
    onChange({ ...(data || {}), sections: next });
  };

  return (
    <div className="space-y-2.5">
      {/* 报告头 */}
      <div className="rounded-xl bg-gradient-to-br from-[#384877]/8 to-[#3b5aa2]/5 border border-[#384877]/15 p-3">
        <div className="flex items-center gap-2 mb-1">
          <Globe className="w-3.5 h-3.5 text-[#384877]" />
          <span className="text-[10px] font-semibold text-[#384877] uppercase tracking-wider">调研报告</span>
        </div>
        {editable && onChange ? (
          <Input
            value={title}
            onChange={(e) => update({ [titleKey]: e.target.value })}
            className="text-[14px] font-bold text-slate-800 leading-snug bg-white/60 border-[#384877]/20 h-8"
          />
        ) : (
          <div className="text-[14px] font-bold text-slate-800 leading-snug">{title}</div>
        )}
      </div>

      {/* 章节卡 */}
      {sections && sections.length > 0 ? (
        <div className="space-y-2">
          {sections.map((s, i) => {
            const headingKey = s.heading !== undefined ? "heading" : "title";
            const contentKey = s.body !== undefined ? "body" : "content";
            const heading = s[headingKey] || `章节 ${i + 1}`;
            const content = s[contentKey] || "";
            return (
              <div key={i} className="rounded-lg bg-white border border-slate-200 p-3">
                {editable && onChange ? (
                  <>
                    <Input
                      value={heading}
                      onChange={(e) => updateSection(i, { [headingKey]: e.target.value })}
                      className="text-[12.5px] font-bold text-slate-800 mb-1.5 h-7 border-slate-200"
                    />
                    <Textarea
                      value={content}
                      onChange={(e) => updateSection(i, { [contentKey]: e.target.value })}
                      className="text-[11.5px] text-slate-600 leading-relaxed min-h-[80px] border-slate-200 font-sans"
                    />
                  </>
                ) : (
                  <>
                    <div className="text-[12.5px] font-bold text-slate-800 mb-1">{heading}</div>
                    {content && (
                      <div className="text-[11.5px] text-slate-600 leading-relaxed whitespace-pre-wrap">
                        {content}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        editable && onChange ? (
          <Textarea
            value={body}
            onChange={(e) => update({ [bodyKey]: e.target.value })}
            className="text-[12px] text-slate-700 font-sans leading-relaxed min-h-[200px] bg-white border-slate-200"
            placeholder="报告内容..."
          />
        ) : (
          body && (
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 max-h-64 overflow-y-auto">
              <pre className="text-[12px] text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">{body}</pre>
            </div>
          )
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