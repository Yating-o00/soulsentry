import React from "react";
import MemoryVaultPanel from "@/components/memory/MemoryVaultPanel";
import PersonalTemplateList from "@/components/memory/PersonalTemplateList";

export default function MemoryVault() {
  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-8 md:py-12 space-y-6">
      <header className="px-1">
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-slate-900">记忆库</h1>
        <p className="text-sm text-slate-500 mt-2 leading-relaxed max-w-xl">
          你留下的每一次记录都在让心栈更懂你。这些记忆完全属于你。
        </p>
      </header>

      <PersonalTemplateList />
      <MemoryVaultPanel />
    </div>
  );
}