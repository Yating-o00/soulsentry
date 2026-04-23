// 统一的反馈调度器——所有业务代码通过 feedback.* 发送反馈
// 替代散落的 toast.success/error/info，确保所有通知风格一致
import { toast } from "sonner";

const BRAND_PRIMARY = "#384877";
const BRAND_SECONDARY = "#3b5aa2";

// 轻量级成功：右下角、紧凑、带主色
export const success = (message, opts = {}) => {
  return toast.success(message, {
    position: "bottom-right",
    duration: 2800,
    ...opts,
  });
};

// 轻量级错误：右下角、紧凑、带重试入口（可选）
export const error = (message, opts = {}) => {
  return toast.error(message, {
    position: "bottom-right",
    duration: 4200,
    ...opts,
  });
};

// 中性信息
export const info = (message, opts = {}) => {
  return toast.message(message, {
    position: "bottom-right",
    duration: 3200,
    ...opts,
  });
};

// 加载中（返回 id，用于更新）
export const loading = (message, opts = {}) => {
  return toast.loading(message, {
    position: "bottom-right",
    ...opts,
  });
};

// 更新一条 loading 为 success/error
export const update = (id, type, message) => {
  if (type === "success") return toast.success(message, { id, position: "bottom-right", duration: 2800 });
  if (type === "error")   return toast.error(message, { id, position: "bottom-right", duration: 4200 });
  return toast.message(message, { id, position: "bottom-right", duration: 3200 });
};

// 带来源提示的成功（例如"✓ 已创建 · 来源：心签页"）
export const successWithSource = (message, sourceLabel) => {
  return toast.success(sourceLabel ? `${message} · ${sourceLabel}` : message, {
    position: "bottom-right",
    duration: 2800,
  });
};

// AI 富反馈卡片：完成总结、下一步建议、鼓励语
// 右下角展示，不遮挡主要内容
export const aiRichCard = ({ title, suggestions = [], footnote, duration = 6000 }) => {
  return toast.custom(
    (id) => (
      <div className="w-[320px] bg-white rounded-2xl border border-[#384877]/15 shadow-[0_8px_24px_rgba(56,72,119,0.15)] overflow-hidden">
        <div
          className="px-4 py-2.5 flex items-center gap-2"
          style={{ background: `linear-gradient(90deg, ${BRAND_PRIMARY} 0%, ${BRAND_SECONDARY} 100%)` }}
        >
          <span className="text-base">✨</span>
          <span className="text-[13px] font-semibold text-white flex-1 line-clamp-1">{title}</span>
          <button
            onClick={() => toast.dismiss(id)}
            className="text-white/70 hover:text-white text-sm leading-none w-5 h-5 flex items-center justify-center rounded hover:bg-white/10"
            aria-label="关闭"
          >
            ×
          </button>
        </div>
        {suggestions.length > 0 && (
          <div className="px-4 py-2.5 border-b border-slate-100">
            <div className="text-[11px] font-medium text-[#384877] mb-1.5 flex items-center gap-1">
              💡 <span>下一步</span>
            </div>
            <ul className="space-y-1">
              {suggestions.slice(0, 3).map((s, idx) => (
                <li key={idx} className="text-[12px] text-slate-600 leading-snug flex gap-1.5">
                  <span className="text-[#384877]/50 mt-0.5">·</span>
                  <span className="flex-1">{s}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {footnote && (
          <p className="px-4 py-2 text-[11px] italic text-slate-400 bg-slate-50/50 line-clamp-2">
            "{footnote}"
          </p>
        )}
      </div>
    ),
    { duration, position: "bottom-right" }
  );
};

// 执行链路全部完成：更隆重一点，带庆祝感（主题石墨色调）
export const executionChainDone = (chainTitle) => {
  return toast.custom(
    (id) => (
      <div className="flex items-center gap-2.5 px-4 py-3 bg-white rounded-xl border border-[#384877]/20 shadow-[0_8px_24px_rgba(56,72,119,0.12)] min-w-[280px]">
        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#384877] to-[#3b5aa2] flex items-center justify-center flex-shrink-0 shadow-sm shadow-[#384877]/30">
          <span className="text-white text-xs">✓</span>
        </div>
        <div className="flex-1 text-[13px] font-semibold text-[#384877] leading-snug">
          🎉 执行链路已全部完成{chainTitle ? ` · ${chainTitle}` : ""}
        </div>
        <button
          onClick={() => toast.dismiss(id)}
          className="text-slate-400 hover:text-slate-600 text-base leading-none w-5 h-5 flex items-center justify-center rounded hover:bg-slate-100 flex-shrink-0"
          aria-label="关闭"
        >
          ×
        </button>
      </div>
    ),
    { position: "bottom-right", duration: 3500 }
  );
};

export default {
  success,
  error,
  info,
  loading,
  update,
  successWithSource,
  aiRichCard,
  executionChainDone,
};