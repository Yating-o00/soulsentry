// 共创空间共享小组件：成员 Avatar（色调圆底）与 AgentAvatar（深色圆底 Sparkles）——Group 概念核心
import React from "react";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { C, getInitials } from "./constants";

const TONES = [
  "bg-[#e4e6f8] text-[#2a2861]",
  "bg-[#dfe9df] text-[#294b35]",
  "bg-[#f3e4d1] text-[#6b3e1d]",
  "bg-[#f1dfe0] text-[#6d3138]",
  "bg-[#e2e5e5] text-[#344345]",
];

export const toneFor = (idOrName) => {
  const s = String(idOrName || "?");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return TONES[h % TONES.length];
};

export function MemberAvatar({ name, seed, size = "md", className }) {
  const dim = size === "sm" ? "h-7 w-7 text-[11px]" : size === "lg" ? "h-11 w-11 text-[15px]" : "h-9 w-9 text-[13px]";
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full border-2 font-medium", dim, toneFor(seed ?? name), className)}
      title={name}
      aria-label={name}
    >
      {getInitials(name)}
    </span>
  );
}

export function AgentAvatar({ size = "md", className, breathing = false }) {
  const dim = size === "sm" ? "h-7 w-7" : size === "lg" ? "h-14 w-14" : "h-9 w-9";
  const icon = size === "sm" ? "h-3.5 w-3.5" : size === "lg" ? "h-6 w-6" : "h-4 w-4";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full text-[#f7f8f3]",
        dim,
        breathing && "collab-agent-breathe",
        className
      )}
      style={{ backgroundColor: C.ink }}
      aria-label="心栈 Agent"
    >
      <Sparkles className={icon} />
    </span>
  );
}

export function Eyebrow({ children, className }) {
  return (
    <div className={cn("font-mono text-[9px] uppercase tracking-[0.16em]", className)} style={{ color: C.sub }}>
      {children}
    </div>
  );
}

export function EmptyState({ title, description, document = false }) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center px-6 py-8 text-center">
      <p className="text-[13px] font-semibold" style={{ color: "#312e2d" }}>{title}</p>
      <p className="mt-1.5 max-w-sm text-xs leading-5" style={{ color: C.sub }}>{description}</p>
      {document && <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.14em]" style={{ color: C.faint }}>Shared memory</p>}
    </div>
  );
}

// 面板区块头部：eyebrow + 标题 + 描述 + 右侧操作
export function PanelHeader({ eyebrow, title, description, action }) {
  return (
    <div className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-start sm:justify-between" style={{ borderColor: C.line }}>
      <div>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2 className="mt-1.5 text-[18px] font-semibold tracking-[-0.02em]" style={{ color: "#302c2a" }}>{title}</h2>
        {description && <p className="mt-1 text-xs leading-5" style={{ color: C.sub }}>{description}</p>}
      </div>
      {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
    </div>
  );
}
