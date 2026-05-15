import React from "react";
import { Mail, User, Tag, AlertTriangle, Paperclip, X as XIcon, Plus } from "lucide-react";

// 邮件类结果视图：收件人/抄送/主题/正文 + 附件均可编辑；变更通过 onChange 上抛
// availableAttachments: 同任务下可挂载的候选文件 [{file_name, file_url, source}]
export default function EmailResultView({ data, preview, editable = true, onChange, availableAttachments = [] }) {
  if (!data && !preview) return null;
  const handle = (key) => (e) => {
    if (!onChange) return;
    onChange({ ...(data || {}), [key]: e.target.value });
  };

  const to = data?.to || "";
  const cc = data?.cc || "";
  const subject = data?.subject || "";
  const body = data?.body || preview || "";
  const attachments = Array.isArray(data?.attachments) ? data.attachments : [];

  const isAttached = (url) => attachments.some(a => a.file_url === url);
  const toggleAttachment = (att) => {
    if (!onChange) return;
    const next = isAttached(att.file_url)
      ? attachments.filter(a => a.file_url !== att.file_url)
      : [...attachments, { file_name: att.file_name, file_url: att.file_url }];
    onChange({ ...(data || {}), attachments: next });
  };
  const removeAttachment = (url) => {
    if (!onChange) return;
    onChange({ ...(data || {}), attachments: attachments.filter(a => a.file_url !== url) });
  };

  // 候选中尚未被挂载的部分
  const unattachedCandidates = availableAttachments.filter(a => a.file_url && !isAttached(a.file_url));

  return (
    <div className="space-y-2.5">
      {/* 字段卡 */}
      <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2.5">
        <EditableField
          label="收件人"
          icon={User}
          value={to}
          required
          placeholder="请输入收件人邮箱，如 zhang@company.com"
          editable={editable}
          onChange={handle("to")}
        />
        <EditableField
          label="抄送"
          icon={User}
          value={cc}
          placeholder="可选，多个邮箱用逗号分隔"
          editable={editable}
          onChange={handle("cc")}
        />
        <EditableField
          label="主题"
          icon={Tag}
          value={subject}
          bold
          placeholder="邮件主题"
          editable={editable}
          onChange={handle("subject")}
        />
      </div>

      {/* 正文 */}
      <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
        <div className="flex items-center gap-1 text-[10px] font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
          <Mail className="w-3 h-3" /> 邮件正文
        </div>
        {editable ? (
          <textarea
            value={body}
            onChange={handle("body")}
            rows={8}
            placeholder="邮件正文内容"
            className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-[12.5px] text-slate-700 leading-relaxed font-sans resize-y focus:outline-none focus:border-[#384877] focus:ring-2 focus:ring-[#384877]/15"
          />
        ) : (
          <pre className="text-[12.5px] text-slate-700 whitespace-pre-wrap font-sans leading-relaxed max-h-56 overflow-y-auto">
            {body}
          </pre>
        )}
      </div>

      {/* 附件区 */}
      <div className="rounded-xl bg-white border border-slate-200 p-3">
        <div className="flex items-center gap-1 text-[10px] font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
          <Paperclip className="w-3 h-3" /> 附件
          {attachments.length > 0 && (
            <span className="ml-1 text-[10px] font-medium text-slate-400 normal-case">· 共 {attachments.length} 个，将随邮件发送</span>
          )}
        </div>

        {/* 已挂载附件 */}
        {attachments.length > 0 ? (
          <ul className="space-y-1.5 mb-2">
            {attachments.map((a, i) => (
              <li key={a.file_url || i} className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-2.5 py-1.5">
                <Paperclip className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                <div className="flex-1 min-w-0 text-[12px] font-medium text-emerald-900 truncate">{a.file_name || a.file_url}</div>
                {editable && (
                  <button
                    type="button"
                    onClick={() => removeAttachment(a.file_url)}
                    className="flex-shrink-0 p-0.5 rounded hover:bg-emerald-100 text-emerald-700 transition"
                    title="移除该附件"
                  >
                    <XIcon className="w-3.5 h-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-[11px] text-slate-400 mb-2">暂无附件{unattachedCandidates.length > 0 ? "，可从下方候选中挂载" : ""}</div>
        )}

        {/* 候选附件 */}
        {editable && unattachedCandidates.length > 0 && (
          <div>
            <div className="text-[10px] text-slate-400 mb-1">本任务可挂载的产物</div>
            <ul className="space-y-1">
              {unattachedCandidates.map((a, i) => (
                <li key={a.file_url || i} className="flex items-center gap-2 rounded-lg bg-slate-50 border border-slate-200 px-2.5 py-1.5">
                  <Paperclip className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-medium text-slate-700 truncate">{a.file_name}</div>
                    {a.source && <div className="text-[10px] text-slate-400 truncate">来自：{a.source}</div>}
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleAttachment(a)}
                    className="flex-shrink-0 text-[11px] font-semibold text-[#384877] hover:text-[#3b5aa2] flex items-center gap-0.5"
                  >
                    <Plus className="w-3 h-3" /> 挂载
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* 提示 */}
      <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-2">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="text-[11px] text-amber-800 leading-relaxed">
          {to
            ? <><span className="font-semibold">草稿已就绪</span>，确认无误后将通过 Gmail 发送{attachments.length > 0 ? `（含 ${attachments.length} 个附件）` : ""}。</>
            : <><span className="font-semibold">请先填写收件人</span>，确认所有字段后再点击发送。</>
          }
        </div>
      </div>
    </div>
  );
}

function EditableField({ label, icon: Icon, value, onChange, placeholder, bold, required, editable }) {
  return (
    <div>
      <div className="flex items-center gap-1 text-[9.5px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
        {Icon && <Icon className="w-2.5 h-2.5" />}
        {label}
        {required && <span className="text-rose-500">*</span>}
      </div>
      {editable ? (
        <input
          type="text"
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className={`w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-[12.5px] ${bold ? "font-semibold" : ""} text-slate-800 focus:outline-none focus:border-[#384877] focus:bg-white focus:ring-2 focus:ring-[#384877]/15`}
        />
      ) : (
        <div className={`text-[12.5px] ${value ? "text-slate-800" : "text-slate-400"} ${bold ? "font-semibold" : ""}`}>
          {value || placeholder}
        </div>
      )}
    </div>
  );
}