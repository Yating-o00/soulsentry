import React from "react";
import TrustLadderPanel from "@/components/automation/TrustLadderPanel";
import ForwardInbox from "@/components/intake/ForwardInbox";

export default function AutoPilot() {
  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-8 md:py-12 space-y-6">
      <header className="px-1">
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-slate-900">自动执行</h1>
        <p className="text-sm text-slate-500 mt-2 leading-relaxed max-w-xl">
          能交给机器的，心栈直接替你做完；需要你点头的，永远等你点头。
        </p>
      </header>

      <ForwardInbox />
      <TrustLadderPanel />
    </div>
  );
}