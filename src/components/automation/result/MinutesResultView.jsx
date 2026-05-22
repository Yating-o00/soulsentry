import React from "react";
import { FileText, Download, ExternalLink, Users, Calendar, Hash } from "lucide-react";

// 会议纪要结果视图：内嵌 HTML 预览 + 元信息卡片
export default function MinutesResultView({ data, preview }) {
  const fileUrl = data?.file_url;
  const fileName = data?.file_name || "会议纪要.html";
  const title = data?.title || "会议纪要";
  const meta = data?.meta || {};
  const sections = Array.isArray(data?.sections) ? data.sections : [];
  const timeline = Array.isArray(data?.timeline) ? data.timeline : [];
  const tags = Array.isArray(data?.tags) ? data.tags : [];

  return (
    <div className="space-y-3">
      {/* 头部摘要卡片 */}
      <div className="rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50/40 border border-blue-200 p-3.5">
        <div className="flex items-center gap-1.5 mb-2">
          <FileText className="w-3.5 h-3.5 text-blue-600" />
          <span className="text-[10px] font-semibold text-blue-700 uppercase tracking-wider">会议纪要</span>
        </div>
        <div className="text-[14px] font-bold text-slate-800 leading-snug mb-2">{title}</div>

        <div className="grid grid-cols-3 gap-2 text-[11px]">
          <div className="flex items-center gap-1.5 text-slate-600">
            <Calendar className="w-3 h-3 text-blue-500 flex-shrink-0" />
            <span className="truncate">{meta.time || "未识别"}</span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-600">
            <Hash className="w-3 h-3 text-blue-500 flex-shrink-0" />
            <span>{sections.length} 章节 · {timeline.length} 时间点</span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-600">
            <Users className="w-3 h-3 text-blue-500 flex-shrink-0" />
            <span className="truncate">{(meta.attendees || []).slice(0, 3).join("、") || "未识别"}</span>
          </div>
        </div>

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {tags.slice(0, 8).map((t, i) => (
              <span key={i} className="inline-flex items-center px-1.5 py-0.5 rounded bg-white text-blue-700 border border-blue-200 text-[10px]">
                {t}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* HTML 内嵌预览：直接用 file_url，避免 entity 字段过大导致 html 丢失 */}
      {fileUrl && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
          <div className="flex items-center justify-between px-3 py-1.5 bg-slate-50 border-b border-slate-200">
            <div className="flex items-center gap-1.5 text-[11px] text-slate-600">
              <FileText className="w-3 h-3" />
              <span className="font-medium truncate">{fileName}</span>
            </div>
            <div className="flex items-center gap-1">
              {fileUrl && (
                <a
                  href={fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white border border-slate-200 hover:bg-slate-100 text-[10.5px] text-slate-700"
                  title="新窗口打开"
                >
                  <ExternalLink className="w-2.5 h-2.5" /> 打开
                </a>
              )}
              {fileUrl && (
                <a
                  href={fileUrl}
                  download={fileName}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-[10.5px]"
                  title="下载文件"
                >
                  <Download className="w-2.5 h-2.5" /> 下载
                </a>
              )}
            </div>
          </div>
          <iframe
            src={fileUrl}
            title={fileName}
            sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
            className="w-full bg-white"
            style={{ height: 600, border: 0 }}
          />
        </div>
      )}

      {/* 兜底：没文件 URL 时显示 preview 文本 */}
      {!fileUrl && preview && (
        <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 max-h-64 overflow-y-auto">
          <pre className="text-xs text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">{preview}</pre>
        </div>
      )}
    </div>
  );
}