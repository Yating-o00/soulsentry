import React, { useState } from "react";
import { FileText, Download, ExternalLink, Users, Calendar, Hash, Clock, ChevronDown, ChevronRight, AlertCircle, CheckCircle2, MessageCircle } from "lucide-react";

// 会议纪要结果视图：直接渲染结构化内容（sections/timeline/insights），不再依赖 iframe
export default function MinutesResultView({ data, preview }) {
  const fileUrl = data?.file_url;
  const fileName = data?.file_name || "会议纪要.html";
  const title = data?.title || "会议纪要";
  const meta = data?.meta || {};
  const sections = Array.isArray(data?.sections) ? data.sections : [];
  const timeline = Array.isArray(data?.timeline) ? data.timeline : [];
  const insights = data?.insights || {};
  const tags = Array.isArray(data?.tags) ? data.tags : [];

  const [showRawFile, setShowRawFile] = useState(false);

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

      {/* 主体：直接渲染结构化 sections */}
      {sections.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
          {sections.map((s, idx) => (
            <SectionBlock key={idx} index={idx} section={s} />
          ))}
        </div>
      )}

      {/* 时间线 */}
      {timeline.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-1.5 mb-3">
            <Clock className="w-3.5 h-3.5 text-indigo-600" />
            <span className="text-[12px] font-semibold text-slate-700">关键时间线</span>
          </div>
          <div className="space-y-2">
            {timeline.map((t, i) => (
              <div key={i} className="flex gap-3 text-[12px]">
                <div className="flex-shrink-0 px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 font-medium h-fit">
                  {t.time || `节点 ${i + 1}`}
                </div>
                <div className="text-slate-700 leading-relaxed">{t.content || t.label || ""}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 洞察四象限 */}
      {insights && (insights.people?.length || insights.tech?.length || insights.time?.length || insights.actions?.length) ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <InsightCard label="关键人物" items={insights.people} color="purple" />
          <InsightCard label="技术要点" items={insights.tech} color="blue" />
          <InsightCard label="时间节点" items={insights.time} color="indigo" />
          <InsightCard label="行动项" items={insights.actions} color="emerald" />
        </div>
      ) : null}

      {/* 文件操作条：下载 / 新窗口打开 / 可选 iframe 预览 */}
      {fileUrl && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-200">
            <button
              onClick={() => setShowRawFile(v => !v)}
              className="inline-flex items-center gap-1.5 text-[11px] text-slate-600 hover:text-slate-900"
            >
              {showRawFile ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              <FileText className="w-3 h-3" />
              <span className="font-medium truncate">{fileName}</span>
            </button>
            <div className="flex items-center gap-1">
              <a
                href={fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white border border-slate-200 hover:bg-slate-100 text-[10.5px] text-slate-700"
              >
                <ExternalLink className="w-2.5 h-2.5" /> 打开
              </a>
              <a
                href={fileUrl}
                download={fileName}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-[10.5px]"
              >
                <Download className="w-2.5 h-2.5" /> 下载
              </a>
            </div>
          </div>
          {showRawFile && (
            <iframe
              src={fileUrl}
              title={fileName}
              sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
              className="w-full bg-white"
              style={{ height: 600, border: 0 }}
            />
          )}
        </div>
      )}

      {/* 兜底：什么结构都没有时显示 preview 文本 */}
      {sections.length === 0 && !fileUrl && preview && (
        <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 max-h-64 overflow-y-auto">
          <pre className="text-xs text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">{preview}</pre>
        </div>
      )}
    </div>
  );
}

function SectionBlock({ index, section }) {
  const type = section.type || "point";
  const items = Array.isArray(section.items) ? section.items : [];

  if (type === "callout") {
    return (
      <div className="border-l-4 border-amber-400 bg-amber-50 rounded-r-lg p-3">
        <div className="flex items-center gap-1.5 mb-1">
          <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
          <div className="text-[12.5px] font-semibold text-amber-900">{section.title || `结论 ${index + 1}`}</div>
        </div>
        {items.length > 0 && (
          <ul className="space-y-1 mt-1.5">
            {items.map((it, i) => (
              <li key={i} className="text-[12.5px] text-amber-900/90 leading-relaxed">• {it}</li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  if (type === "qa") {
    return (
      <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
        <div className="flex items-center gap-1.5 mb-1.5">
          <MessageCircle className="w-3.5 h-3.5 text-slate-500" />
          <div className="text-[12.5px] font-semibold text-slate-800">{section.title || `问答 ${index + 1}`}</div>
        </div>
        <ul className="space-y-1">
          {items.map((it, i) => (
            <li key={i} className="text-[12.5px] text-slate-700 leading-relaxed">{it}</li>
          ))}
        </ul>
      </div>
    );
  }

  if (type === "sub") {
    return (
      <div className="pl-3 border-l-2 border-slate-200">
        <div className="text-[12px] font-semibold text-slate-700 mb-1">{section.title || `小节 ${index + 1}`}</div>
        <ul className="space-y-1">
          {items.map((it, i) => (
            <li key={i} className="text-[12.5px] text-slate-600 leading-relaxed">• {it}</li>
          ))}
        </ul>
      </div>
    );
  }

  // 默认 point
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <CheckCircle2 className="w-3.5 h-3.5 text-blue-500" />
        <div className="text-[13px] font-semibold text-slate-800">{section.title || `章节 ${index + 1}`}</div>
      </div>
      <ul className="space-y-1 pl-5">
        {items.map((it, i) => (
          <li key={i} className="text-[12.5px] text-slate-700 leading-relaxed list-disc">{it}</li>
        ))}
      </ul>
    </div>
  );
}

const INSIGHT_COLORS = {
  purple: "bg-purple-50 border-purple-200 text-purple-700",
  blue: "bg-blue-50 border-blue-200 text-blue-700",
  indigo: "bg-indigo-50 border-indigo-200 text-indigo-700",
  emerald: "bg-emerald-50 border-emerald-200 text-emerald-700",
};

function InsightCard({ label, items, color }) {
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) return null;
  return (
    <div className={`rounded-lg border p-2.5 ${INSIGHT_COLORS[color] || INSIGHT_COLORS.blue}`}>
      <div className="text-[10.5px] font-semibold uppercase tracking-wider mb-1.5 opacity-80">{label}</div>
      <ul className="space-y-0.5">
        {list.slice(0, 6).map((it, i) => (
          <li key={i} className="text-[12px] leading-relaxed">• {it}</li>
        ))}
      </ul>
    </div>
  );
}