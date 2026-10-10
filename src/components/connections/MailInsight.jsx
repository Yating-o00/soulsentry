import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2 } from "lucide-react";
import MailComposer from "./MailComposer";

const LEVEL = { high: "重要", medium: "一般", low: "可稍后" };

export default function MailInsight({ messageId, onSent }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    setData(null);
    base44.functions.invoke("userMailbox", { action: "suggest", messageId }).then((r) => setData(r.data));
  }, [messageId]);

  if (!data) return <div className="flex items-center gap-2 text-sm text-slate-500 py-6"><Loader2 className="w-4 h-4 animate-spin" />心栈正在结合你的画像与外部信息阅读这封邮件…</div>;
  const { message, analysis } = data;
  return (
    <div className="space-y-4">
      <div>
        <p className="font-semibold text-slate-800">{message.subject}</p>
        <p className="text-xs text-slate-500">{message.from}</p>
      </div>
      <div className="rounded-2xl bg-[#384877]/5 p-4 space-y-2 text-sm">
        <p><span className="font-medium">概要（{LEVEL[analysis.importance] || "一般"}）：</span>{analysis.summary}</p>
        {analysis.external_context && <p className="text-slate-600"><span className="font-medium">外部信息：</span>{analysis.external_context}</p>}
        <ul className="list-disc pl-5 text-slate-700">{(analysis.suggestions || []).map((s, i) => <li key={i}>{s}</li>)}</ul>
      </div>
      <details className="text-xs text-slate-500"><summary className="cursor-pointer">查看原文</summary><p className="whitespace-pre-wrap mt-2">{message.text}</p></details>
      <div>
        <p className="text-sm font-medium text-slate-700 mb-2">回复</p>
        <MailComposer replyToId={messageId} onSent={onSent} />
      </div>
    </div>
  );
}