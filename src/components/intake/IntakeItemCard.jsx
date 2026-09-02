import React from "react";
import { Trash2, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import AgreementDeliveryCard from "@/components/automation/AgreementDeliveryCard";

const SOURCE_LABELS = {
  paste: "粘贴",
  wechat: "微信聊天",
  email: "邮件",
  file: "文件",
  share: "分享",
  shortcut: "快捷指令",
  browser: "浏览器",
  other: "其它",
};

export default function IntakeItemCard({ item, onRemove }) {
  const failed = item.status === "failed";
  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 md:p-6">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px]">
              {SOURCE_LABELS[item.source] || item.source}
            </span>
            <span className="text-[11px] text-slate-400">
              {item.created_date ? format(new Date(item.created_date), "MM-dd HH:mm") : ""}
            </span>
          </div>
          <p className="text-sm text-slate-800 mt-2 leading-relaxed">
            {item.summary || item.raw_content?.slice(0, 120)}
          </p>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="text-slate-300 hover:text-rose-500 transition-colors shrink-0 p-1"
          aria-label="清除"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {failed ? (
        <div className="flex items-start gap-2 p-3 rounded-2xl bg-rose-50 border border-rose-200">
          <AlertCircle className="w-4 h-4 text-rose-500 mt-0.5 shrink-0" />
          <p className="text-xs text-rose-700 leading-relaxed">{item.error_message || "拆解失败"}</p>
        </div>
      ) : (
        <AgreementDeliveryCard
          machineParts={item.machine_parts || []}
          humanParts={item.human_parts || []}
        />
      )}
    </div>
  );
}