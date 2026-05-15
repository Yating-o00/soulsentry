import React from "react";
import { Mail, User, Tag, AlertTriangle, Paperclip, X, Plus } from "lucide-react";

// 邮件类结果视图：收件人/抄送/主题/正文均可编辑；变更通过 onChange 上抛
// availableAttachments: 同任务下其它执行产物（PPT/PDF/调研报告等），用户可一键挂载
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
  const attachedUrls = new Set(attachments.map(a => a.file_url));
  const candidates = (availableAttachments || []).filter(a => a.file_url && !attachedUrls.has(a.file_url));

  const removeAttachment = (idx) => {
    if (!onChange) return;
    const next = attachments.filter((_, i) => i !== idx);
    onChange({ ...(data || {}), attachments: next });
  };

  const addAttachment = (item) => {
    if (!onChange || !item?.file_url) return;
    if (attachedUrls.has(item.file_url)) return;
    onChange({ ...(data || {}), attachments: [...attachments, item] });
  };

  const addAllCandidates = () => {
    if (!onChange || candidates.length === 0) return;
    onChange({ ...(data || {}), attachments: [...attachments, ...candidates] });
  };

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

      {/* 可挂载候选（同任务下其它执行产物） */}
      {editable && candidates.length > 0 && (
        <div className="rounded-xl border border-dashed border-[#384877]/30 bg-[#384877]/5 p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1 text-[10px] font-semibold text-[#384877] uppercase tracking-wide">
              <Paperclip className="w-3 h-3" /> 可挂载附件 · 来自本任务的其它产物（{candidates.length}）
            </div>
            <button
              type="button"
              onClick={addAllCandidates}
              className="text-[10.5px] font-semibold text-[#384877] hover:text-[#3b5aa2] underline"
            >
              全部挂载
            </button>
          </div>
          <div className="space-y-1.5">
            {candidates.map((a, i) => (
              <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-white border border-slate-200">
                <div className="w-7 h-7 rounded-md bg-slate-50 border border-slate-200 flex items-center justify-center flex-shrink-0">
                  <Paperclip className="w-3.5 h-3.5 text-slate-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-medium text-slate-800 truncate">{a.file_name}</div>
                  {a.source && <div className="text-[10.5px] text-slate-500 truncate">来源：{a.source}</div>}
                </div>
                <button
                  type="button"
                  onClick={() => addAttachment(a)}
                  className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[#384877] hover:bg-[#3b5aa2] text-white text-[10.5px] font-semibold transition"
                >
                  <Plus className="w-3 h-3" /> 挂载
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 附件列表 */}
      {attachments.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex items-center gap-1 text-[10px] font-semibold text-slate-500 mb-2 uppercase tracking-wide">
            <Paperclip className="w-3 h-3" /> 附件 · 将随邮件一并发送（{attachments.length}）
          </div>
          <div className="space-y-1.5">
            {attachments.map((a, i) => (
              <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 border border-slate-100">
                <div className="w-7 h-7 rounded-md bg-white border border-slate-200 flex items-center justify-center flex-shrink-0">
                  <Paperclip className="w-3.5 h-3.5 text-slate-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-medium text-slate-800 truncate">{a.file_name}</div>
                  {a.source && <div className="text-[10.5px] text-slate-500 truncate">来源：{a.source}</div>}
                </div>
                {editable && (
                  <button
                    type="button"
                    onClick={() => removeAttachment(i)}
                    title="不发送此附件"
                    className="flex-shrink-0 w-6 h-6 rounded-md hover:bg-red-50 text-slate-400 hover:text-red-500 flex items-center justify-center transition"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 提示 */}
      <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-2">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="text-[11px] text-amber-800 leading-relaxed">
          {to
            ? <><span className="font-semibold">草稿已就绪</span>，确认无误后将通过 Gmail 直接发送。</>
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