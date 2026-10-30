import React from "react";
import { Share2, Copy } from "lucide-react";
import { toast } from "sonner";

const LINK = "https://xinzhan-soulsentry.com/share-in?source=shortcut&text=";

export default function ShareShortcutCard() {
  const copy = () => { navigator.clipboard.writeText(LINK); toast.success("已复制快捷指令链接"); };
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-5 space-y-3">
      <div className="flex items-center gap-2 font-semibold text-slate-800"><Share2 className="w-4 h-4 text-[#384877]" />系统分享与快捷指令</div>
      <ul className="text-xs text-slate-600 space-y-2 list-disc pl-4">
        <li><b>安卓</b>：把心栈「添加到主屏幕」后，在任意应用点「分享 → 心栈」即可收进来。</li>
        <li><b>iPhone</b>：快捷指令新建「打开 URL」，填入下方链接并在末尾接上「快捷指令输入」，再开启「在共享表单中显示」。</li>
      </ul>
      <div className="flex gap-2">
        <code className="flex-1 truncate text-[11px] bg-slate-50 border border-slate-200 rounded-lg px-2 py-2">{LINK}</code>
        <button onClick={copy} className="px-3 rounded-lg border border-slate-200 hover:bg-slate-50"><Copy className="w-4 h-4" /></button>
      </div>
    </div>
  );
}