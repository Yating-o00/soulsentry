// 移动端底部四格导航：回到内容 / 讨论 / 动态 / 打开 Agent 抽屉（<900px 显示）
import React from "react";
import { Bot, Clock3, FileText, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export default function MobileNav({ active, onNavigate, onOpenAgent }) {
  const items = [
    { id: "content", label: "内容", icon: FileText },
    { id: "discussion", label: "讨论", icon: MessageCircle },
    { id: "activity", label: "动态", icon: Clock3 },
    { id: "agent", label: "Agent", icon: Bot },
  ];
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-4 border-t px-1 pt-1.5 backdrop-blur-md min-[900px]:hidden"
      style={{ borderColor: "#d8d6cf", backgroundColor: "rgba(250,249,245,0.95)", paddingBottom: "max(0.375rem, env(safe-area-inset-bottom))" }}
      aria-label="移动端导航"
    >
      {items.map((item) => {
        const selected = item.id === active;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => (item.id === "agent" ? onOpenAgent() : onNavigate(item.id))}
            className={cn(
              "flex min-h-12 flex-col items-center justify-center gap-1 rounded-md text-[10px] font-medium transition-colors focus-visible:outline-none",
              selected ? "text-[#384877]" : "text-[#69665f] hover:text-[#384877]"
            )}
            aria-current={selected ? "page" : undefined}
          >
            <item.icon className="h-5 w-5" strokeWidth={selected ? 2 : 1.6} />
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
