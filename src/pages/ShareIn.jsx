import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Loader2, CheckCircle2 } from "lucide-react";

export default function ShareIn() {
  const [state, setState] = useState("loading");
  const p = new URLSearchParams(window.location.search);
  const content = [p.get("title"), p.get("text"), p.get("url")].filter(Boolean).join("\n");

  useEffect(() => {
    if (!content) { setState("empty"); return; }
    base44.functions.invoke("intakeForward", { content, source: p.get("source") || "share" })
      .then(() => setState("done"))
      .catch(() => setState("error"));
  }, []);

  return (
    <div className="max-w-md mx-auto p-8 text-center space-y-4">
      {state === "loading" && <><Loader2 className="w-8 h-8 mx-auto animate-spin text-[#384877]" /><p className="text-slate-600">心栈正在收下并整理…</p></>}
      {state === "done" && <><CheckCircle2 className="w-8 h-8 mx-auto text-emerald-600" /><p className="text-slate-700">已收进心栈，AI 已帮你拆成约定草稿。</p></>}
      {state === "empty" && <p className="text-slate-500">没有收到要分享的内容。</p>}
      {state === "error" && <p className="text-rose-600">收件失败，请稍后再试。</p>}
      {content && <p className="text-xs text-slate-400 whitespace-pre-wrap line-clamp-4">{content}</p>}
      <Link to="/Dashboard" className="inline-block text-sm text-[#384877] underline">回到今日</Link>
    </div>
  );
}