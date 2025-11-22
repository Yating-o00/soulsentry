import React from "react";
import { Link, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { LayoutDashboard, ListTodo, Calendar, User, Bell } from "lucide-react";
import FloatingAssistantButton from "./components/assistant/FloatingAssistantButton";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

const navigationItems = [
  {
    title: "今日",
    url: createPageUrl("Dashboard"),
    icon: LayoutDashboard,
  },
  {
    title: "任务",
    url: createPageUrl("Tasks"),
    icon: ListTodo,
  },
  {
    title: "日历",
    url: createPageUrl("Calendar"),
    icon: Calendar,
  },
  {
    title: "团队",
    url: createPageUrl("Teams"),
    icon: Bell,
  },
  {
    title: "我的账户",
    url: createPageUrl("Account"),
    icon: User,
  },
];

export default function Layout({ children }) {
  const location = useLocation();

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <style>{`
          /* === Apple-Inspired Design System === */

          /* 主色调 - 蓝钢色系 (70% 占比) */
          :root {
            --primary: 90 100 125;
            --primary-dark: 30 58 95;
            --primary-light: 120 135 165;

            /* 背景色 - 极简灰 (主导背景) */
            --bg-primary: 249 250 251;
            --bg-secondary: 255 255 255;
            --bg-tertiary: 244 246 248;

            /* 文字色 - 深石墨灰 */
            --text-primary: 34 34 34;
            --text-secondary: 82 82 91;
            --text-tertiary: 161 161 170;

            /* 辅助色 - 浅蓝/天空蓝 (25% 占比) */
            --accent-sky: 147 197 253;
            --accent-cyan: 6 182 212;

            /* 撞色 - 青绿提亮 (5% 占比) */
            --highlight: 16 185 129;
            --highlight-warm: 251 191 36;

            /* 功能色 */
            --success: 34 197 94;
            --warning: 251 146 60;
            --error: 239 68 68;

            /* 阴影系统 - 精细层次 */
            --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
            --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.08), 0 2px 4px -1px rgba(0, 0, 0, 0.04);
            --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -2px rgba(0, 0, 0, 0.04);
            --shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.08), 0 10px 10px -5px rgba(0, 0, 0, 0.04);

            /* 圆角系统 - 统一标准 */
            --radius-sm: 8px;
            --radius-md: 12px;
            --radius-lg: 16px;
            --radius-xl: 20px;

            /* 间距系统 - 黄金比例 */
            --space-xs: 4px;
            --space-sm: 8px;
            --space-md: 16px;
            --space-lg: 24px;
            --space-xl: 40px;
          }

          /* === 全局样式重置 === */
          body {
            background: rgb(var(--bg-primary));
            color: rgb(var(--text-primary));
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
          }

          /* === 主色调应用 (70%) === */
          .bg-gradient-to-r.from-blue-500,
          .bg-gradient-to-r.from-purple-500,
          .from-purple-500.to-blue-500,
          .from-purple-500.to-blue-600,
          .from-blue-500.to-purple-600,
          .from-purple-600.to-blue-600,
          .from-blue-600.to-purple-600 {
            background: linear-gradient(135deg, rgb(var(--primary)) 0%, rgb(var(--primary-dark)) 100%) !important;
          }

          .bg-gradient-to-br.from-blue-500,
          .bg-gradient-to-br.from-purple-500 {
            background: linear-gradient(135deg, rgb(var(--primary)) 0%, rgb(var(--primary-dark)) 100%) !important;
          }

          /* 主色调文字 */
          .text-blue-500, .text-blue-600, .text-blue-700,
          .text-purple-500, .text-purple-600, .text-purple-700 {
            color: rgb(var(--primary)) !important;
          }

          /* === 背景色系统 === */
          .bg-white { background-color: rgb(var(--bg-secondary)) !important; }
          .bg-slate-50, .bg-blue-50, .bg-purple-50 { 
            background-color: rgb(var(--bg-primary)) !important; 
          }
          .bg-slate-100, .bg-blue-100, .bg-purple-100 { 
            background-color: rgb(var(--bg-tertiary)) !important; 
          }

          /* === 边框系统 === */
          .border-slate-200, .border-blue-200, .border-purple-200 {
            border-color: rgba(var(--primary), 0.12) !important;
          }
          .border-slate-300, .border-blue-300, .border-purple-300 {
            border-color: rgba(var(--primary), 0.2) !important;
          }

          /* === 悬停状态 === */
          .hover\\:bg-slate-50:hover, 
          .hover\\:bg-blue-50:hover, 
          .hover\\:bg-purple-50:hover {
            background-color: rgb(var(--bg-tertiary)) !important;
          }

          .hover\\:border-blue-300:hover,
          .hover\\:border-purple-300:hover {
            border-color: rgba(var(--primary), 0.3) !important;
          }

          /* === 辅助色应用 (25%) === */
          .text-sky-500, .text-cyan-500 {
            color: rgb(var(--accent-sky)) !important;
          }

          .bg-sky-50, .bg-cyan-50 {
            background-color: rgba(var(--accent-sky), 0.08) !important;
          }

          /* === 撞色/高光应用 (5%) === */
          .bg-green-500, .text-green-500, .text-green-600 {
            background-color: rgb(var(--highlight));
            color: rgb(var(--highlight)) !important;
          }

          .bg-emerald-500 {
            background-color: rgb(var(--highlight)) !important;
          }

          /* === 阴影优化 === */
          .shadow-sm { box-shadow: var(--shadow-sm) !important; }
          .shadow-md { box-shadow: var(--shadow-md) !important; }
          .shadow-lg { box-shadow: var(--shadow-lg) !important; }
          .shadow-xl, .shadow-2xl { box-shadow: var(--shadow-xl) !important; }

          /* === 圆角统一 === */
          .rounded-lg { border-radius: var(--radius-md) !important; }
          .rounded-xl { border-radius: var(--radius-lg) !important; }
          .rounded-2xl { border-radius: var(--radius-xl) !important; }

          /* === 渐变背景优化 === */
          .bg-gradient-to-br {
            background: linear-gradient(135deg, 
              rgb(var(--bg-primary)) 0%, 
              rgba(var(--primary), 0.04) 50%,
              rgba(var(--accent-sky), 0.06) 100%) !important;
          }

          /* === 卡片样式 === */
          [class*="Card"] {
            background: rgb(var(--bg-secondary));
            border: 1px solid rgba(var(--primary), 0.08);
            box-shadow: var(--shadow-sm);
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          }

          [class*="Card"]:hover {
            box-shadow: var(--shadow-md);
            border-color: rgba(var(--primary), 0.12);
          }

          /* === 按钮优化 === */
          button {
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          }

          /* === 滚动条美化 === */
          ::-webkit-scrollbar {
            width: 6px;
            height: 6px;
          }

          ::-webkit-scrollbar-track {
            background: transparent;
          }

          ::-webkit-scrollbar-thumb {
            background: rgba(var(--text-tertiary), 0.3);
            border-radius: 3px;
          }

          ::-webkit-scrollbar-thumb:hover {
            background: rgba(var(--text-secondary), 0.5);
          }

          /* === 焦点状态优化 === */
          .focus-visible\\:ring-blue-500:focus-visible,
          .focus-visible\\:ring-purple-500:focus-visible {
            outline: none;
            box-shadow: 0 0 0 3px rgba(var(--primary), 0.12);
          }

          /* === 徽章优化 === */
          .bg-red-500 {
            background: linear-gradient(135deg, rgb(var(--error)) 0%, rgb(239, 68, 68) 100%) !important;
          }

          .bg-green-400 {
            background-color: rgb(var(--highlight)) !important;
          }

          /* === 特殊渐变 === */
          .from-slate-50 { --tw-gradient-from: rgb(var(--bg-primary)) !important; }
          .to-blue-50\\/30, .to-purple-50\\/30 { 
            --tw-gradient-to: rgba(var(--bg-primary), 0.3) !important; 
          }
        `}</style>
        
        <Sidebar className="border-r border-slate-200/50 bg-white/95 backdrop-blur-xl">
          <SidebarHeader className="border-b border-slate-200/50 px-6 py-5">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-[18px] bg-gradient-to-br from-[#5a647d] to-[#1e3a5f] flex items-center justify-center shadow-md">
                <Bell className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="font-semibold text-[17px] tracking-tight text-[#222222]">
                  任务管家
                </h2>
                <p className="text-[13px] text-[#52525b] font-normal">智能提醒·贴心陪伴</p>
              </div>
            </div>
          </SidebarHeader>
          
          <SidebarContent className="px-3 py-2">
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  {navigationItems.map((item) => {
                    const isActive = location.pathname === item.url;
                    return (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton 
                          asChild 
                          className={`group relative overflow-hidden transition-all duration-200 rounded-[12px] mb-1.5 ${
                            isActive 
                              ? 'bg-gradient-to-r from-[#5a647d] to-[#1e3a5f] text-white shadow-md' 
                              : 'hover:bg-[#f4f6f8] text-[#52525b]'
                          }`}
                        >
                          <Link to={item.url} className="flex items-center gap-3 px-4 py-2.5">
                            <item.icon className={`w-[18px] h-[18px] transition-transform duration-200 ${
                              isActive ? '' : 'group-hover:scale-105'
                            }`} strokeWidth={isActive ? 2.5 : 2} />
                            <span className={`text-[15px] ${isActive ? 'font-semibold' : 'font-medium'}`}>{item.title}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>

        <main className="flex-1 flex flex-col bg-gradient-to-br from-[#f9fafb] via-[#f9fafb]/50 to-[#eef2f7]/30 relative">
          <FloatingAssistantButton />
          <header className="bg-white/95 backdrop-blur-xl border-b border-slate-200/50 px-6 py-4 lg:hidden sticky top-0 z-10">
            <div className="flex items-center gap-4">
              <SidebarTrigger className="hover:bg-slate-100 p-2 rounded-xl transition-all duration-200" />
              <h1 className="text-lg font-semibold bg-gradient-to-r from-[#5a647d] to-[#1e3a5f] bg-clip-text text-transparent">
                任务管家
              </h1>
            </div>
          </header>

          <div className="flex-1 overflow-auto">
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}