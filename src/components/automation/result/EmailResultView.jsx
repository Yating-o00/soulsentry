import React from "react";
import { Mail, User, Tag, AlertTriangle } from "lucide-react";

// 邮件类结果视图：收件人/抄送/主题字段 + 正文
export default function EmailResultView({ data, preview }) {
  if (!data && !preview) return null;
  const to = data?.to;
  const cc = data?.cc;
  const subject = data?.subject;
  const body = data?.body || preview || "";

  return (
    <div className="space-y-2.5">
      {/* 字段卡 */}
      <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
        <Field label="收件人" icon={User} value={to} />
        <Field label="抄送" icon={User} value={cc || "无"} muted={!cc} />
        <Field label="主题" icon={Tag} value={subject} bold />
      </div>

      {/* 正文 */}
      {body && (
        <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 max-h-56 overflow-y-auto">
          <div className="flex items-center gap-1 text-[10px] font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
            <Mail className="w-3 h-3" /> 邮件正文
          </div>
          <pre className="text-[12.5px] text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">{body}</pre>
        </div>
      )}

      {/* 发送提示 */}
      <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-2">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="text-[11px] text-amber-800 leading-relaxed">
          <span className="font-semibold">草稿已生成</span>，确认无误后将通过 Gmail 直接发送。
        </div>
      </div>
    </div>
  );
}

function Field({ label, icon: Icon, value, muted, bold }) {
  if (!value) return null;
  return (
    <div>
      <div className="flex items-center gap-1 text-[9.5px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">
        {Icon && <Icon className="w-2.5 h-2.5" />} {label}
      </div>
      <div className={`text-[12.5px] ${muted ? "text-slate-400" : "text-slate-800"} ${bold ? "font-semibold" : ""}`}>
        {value}
      </div>
    </div>
  );
}