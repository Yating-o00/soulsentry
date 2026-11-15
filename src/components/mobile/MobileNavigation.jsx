import React from "react";
import { Link, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Home, HeartHandshake, Bookmark, Bell, User } from "lucide-react";

// 底部五栏 Hub（与样例一致）：首页 / 约定 / 心签 / 通知 / 我的
// 五枚等宽标签，激活态焦糖色；搭子Store 不占底栏——Store 是「开始一段关系」的地方，不是每天回的地方
const TABS = [
  { id: "home", label: "首页", icon: Home, path: createPageUrl("Dashboard") },
  { id: "agreements", label: "约定", icon: HeartHandshake, path: createPageUrl("Tasks") },
  { id: "qian", label: "心签", icon: Bookmark, path: createPageUrl("Notes") },
  { id: "notice", label: "通知", icon: Bell, path: createPageUrl("Notifications") },
  { id: "me", label: "我的", icon: User, path: createPageUrl("Account") },
];

export default function MobileNavigation() {
  const location = useLocation();

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex items-stretch justify-around border-t border-[#e7e5e4] bg-[#FFFFFF] pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2"
      aria-label="主导航"
    >
      {TABS.map((t) => {
        const active =
          location.pathname === t.path ||
          (t.id === "home" && (location.pathname === "/" || location.pathname === ""));
        const Icon = t.icon;
        return (
          <Link
            key={t.id}
            to={t.path}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-[48px] min-w-[56px] flex-col items-center justify-center gap-0.5 rounded-xl px-3 transition-colors duration-200 ${
              active ? "text-[#384877]" : "text-[#a8a29e] hover:text-[#57534e]"
            }`}
          >
            <Icon className="w-[22px] h-[22px]" strokeWidth={active ? 2.2 : 1.6} />
            <span className={`text-[11px] ${active ? "font-medium" : ""}`}>{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
