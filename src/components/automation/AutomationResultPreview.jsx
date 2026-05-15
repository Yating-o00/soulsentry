import React from "react";
import { ArrowRight, Plus, Trash2, Edit3, Download, ExternalLink } from "lucide-react";

const diffIcons = {
  create: { icon: Plus, color: "text-emerald-600", bg: "bg-emerald-50", hover: "hover:bg-emerald-100" },
  delete: { icon: Trash2, color: "text-red-500", bg: "bg-red-50", hover: "hover:bg-red-100" },
  move: { icon: ArrowRight, color: "text-blue-600", bg: "bg-blue-50", hover: "hover:bg-blue-100" },
  update: { icon: Edit3, color: "text-amber-600", bg: "bg-amber-50", hover: "hover:bg-amber-100" },
};

// 从 result 中尽可能解析出与 diff target 对应的可下载 URL
function resolveFileUrl(result, diffItem) {
  // 1) 优先用 diff 自己携带的 url（未来扩展用）
  if (diffItem?.url) return diffItem.url;
  // 2) 命中 result.data 中的 file_url（最常见：调研报告/文档/PPT）
  const d = result?.data;
  if (!d) return null;
  // 文件名匹配：target 中含有 file_name 就把它当下载链接
  if (d.file_url && d.file_name && diffItem.target && diffItem.target.includes(d.file_name)) {
    return d.file_url;
  }
  // 单文件场景：diff 只有一条 create 且 result.data 只有一个 file_url，直接绑定
  if (d.file_url && Array.isArray(result.diff) && result.diff.length === 1 && diffItem.action === "create") {
    return d.file_url;
  }
  return null;
}

export default function AutomationResultPreview({ result }) {
  if (!result) return null;

  // 从 preview 文本兜底抽 URL（防止 data 字段缺失）
  const previewUrlMatch = result.preview && result.preview.match(/https?:\/\/[^\s)）"】>]+/);
  const previewFileUrl = previewUrlMatch ? previewUrlMatch[0] : null;

  return (
    <div className="space-y-3">
      {/* 主体预览 */}
      {result.preview && (
        <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 max-h-64 overflow-y-auto">
          <pre className="text-xs text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">
            {result.preview}
          </pre>
        </div>
      )}

      {/* 变更详情 */}
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