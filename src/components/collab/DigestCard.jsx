// 执行概览：Agent「执行驱动」自动维护的全局摘要（大方向 / 新进展 / 待确认）
// 数据为单例沉淀文档（doc_type=digest），由后端 drive 动作每次讨论后重写。
import React from "react";
import { Sparkles } from "lucide-react";
import { C, formatTime } from "./constants";
import { AgentAvatar } from "./Common";

export default function DigestCard({ doc }) {
  if (!doc) return null;
  const lines = String(doc.content || "").split("\n").filter((l) => l.trim());

  return (
    <section className="px-4 pt-5 sm:px-6" aria-label="执行概览">
      <div className="rounded-2xl border bg-[#fdfcf9] p-4 sm:p-5" style={{ borderColor: C.lineSoft }}>
        <div className="flex items-center gap-2.5">
          <AgentAvatar size="sm" />
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-semibold tracking-[-0.01em]" style={{ color: "#302c2a" }}>执行概览</h2>
            <p className="text-[10px]" style={{ color: C.faint }}>
              由心栈 Agent 自动维护{doc.updated_date ? ` · ${formatTime(doc.updated_date)}` : ""}
            </p>
          </div>
          <Sparkles className="h-3.5 w-3.5 shrink-0" style={{ color: C.sub }} aria-hidden />
        </div>

        <div className="mt-3 space-y-2.5">
          {lines.map((line, i) => {
            const text = line.trim();
            if (text.startsWith("##")) {
              return (
                <p key={i} className="pt-1 font-mono text-[9px] uppercase tracking-[0.16em]" style={{ color: "#384877" }}>
                  {text.replace(/^#+\s*/, "")}
                </p>
              );
            }
            if (text.startsWith("-") || text.startsWith("·")) {
              return (
                <p key={i} className="flex gap-2 text-[13px] leading-5" style={{ color: "#57534d" }}>
                  <span className="mt-[9px] h-1 w-1 shrink-0 rounded-full" style={{ backgroundColor: "#384877" }} />
                  <span className="min-w-0">{text.replace(/^[-·]\s*/, "")}</span>
                </p>
              );
            }
            return (
              <p key={i} className="text-[13px] leading-5" style={{ color: "#57534d" }}>{text}</p>
            );
          })}
        </div>
      </div>
    </section>
  );
}
