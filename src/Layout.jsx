import React from "react";
import { Link, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { LayoutDashboard, ListTodo, Calendar, User, Bell, StickyNote, Users } from "lucide-react";
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
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Trash2 } from "lucide-react";

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
    title: "便签",
    url: createPageUrl("Notes"),
    icon: StickyNote,
  },
  {
    title: "团队",
    url: createPageUrl("Teams"),
    icon: Users,
  },
  {
    title: "我的账户",
    url: createPageUrl("Account"),
    icon: User,
  },
  {
    title: "通知设置",
    url: createPageUrl("NotificationSettings"),
    icon: Bell,
  },

];

export default function Layout({ children }) {
  const location = useLocation();

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <style>{`
          :root {
            /* Main Primary Colors - Tech Blue */
            --primary-main: 56 72 119;      /* #384877 */
            --primary-enhance: 59 90 162;   /* #3b5aa2 */

            /* Secondary Colors - Vibrant Red/Rose */
            --secondary-main: 213 73 95;    /* #d5495f */
            --secondary-light: 222 109 126; /* #de6d7e */
            --secondary-lighter: 224 145 158; /* #e0919e */

            /* Neutral/Background Colors */
            --bg-white: 255 255 255;
            --bg-grey-minimal: 249 250 251; /* #f9fafb */
            --text-dark: 34 34 34;          /* #222222 */

            /* Legacy Variables Mapped to New System */
            --color-primary: var(--primary-main);
            --color-secondary: var(--text-dark);
            --slate-50: var(--bg-grey-minimal);
            --slate-900: var(--text-dark);
          }

          /* Global Overrides for Cinematic/Tech Feel */
          body {
            color: rgb(34, 34, 34);
            background-color: rgb(249, 250, 251);
          }

          /* Override Blue/Purple classes to use our new Primary Tech Blue */
          .bg-blue-600, .bg-blue-500, .bg-purple-600 { background-color: rgb(56, 72, 119) !important; }
          .text-blue-600, .text-blue-500, .text-purple-600 { color: rgb(56, 72, 119) !important; }
          .border-blue-600, .border-purple-600 { border-color: rgb(56, 72, 119) !important; }

          /* Hover states */
          .hover\\:bg-blue-700:hover { background-color: rgb(44, 56, 95) !important; }

          /* Gradients - Primary */
          .bg-gradient-to-r.from-blue-500, 
          .bg-gradient-to-r.from-blue-600,
          .from-purple-500 { 
            background-image: linear-gradient(135deg, rgb(56, 72, 119) 0%, rgb(59, 90, 162) 100%) !important; 
          }

          .bg-gradient-to-br.from-blue-500 {
            background-image: linear-gradient(135deg, rgb(56, 72, 119) 0%, rgb(59, 90, 162) 100%) !important;
          }

          /* Secondary Accents (Red) where needed specifically */
          .text-red-500, .text-rose-500 { color: rgb(213, 73, 95) !important; }

          /* Soft Backgrounds */
          .bg-blue-50, .bg-purple-50 { background-color: rgba(56, 72, 119, 0.05) !important; }
          .bg-blue-100 { background-color: rgba(56, 72, 119, 0.1) !important; }
        `}</style>
        
        <Sidebar className="border-r border-slate-200/50 bg-gradient-to-b from-slate-50 to-white">
          <SidebarHeader className="border-b border-slate-200/50 p-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-[#384877] to-[#3b5aa2] flex items-center justify-center shadow-lg shadow-[#384877]/20">
                <Bell className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="font-bold text-lg bg-gradient-to-r from-[#384877] to-[#3b5aa2] bg-clip-text text-transparent">
                  任务管家
                </h2>
                <p className="text-xs text-slate-500">智能提醒，贴心陪伴</p>
              </div>
            </div>
          </SidebarHeader>
          
          <SidebarContent className="p-3">
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  {navigationItems.map((item) => {
                    const isActive = location.pathname === item.url;
                    return (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton 
                          asChild 
                          className={`group relative overflow-hidden transition-all duration-300 rounded-xl mb-2 ${
                            isActive 
                              ? 'bg-gradient-to-r from-[#384877] to-[#3b5aa2] text-white shadow-lg shadow-[#384877]/25' 
                              : 'hover:bg-[#f9fafb] text-slate-700'
                          }`}
                        >
                          <Link to={item.url} className="flex items-center gap-3 px-4 py-3">
                            <item.icon className={`w-5 h-5 transition-transform duration-300 ${
                              isActive ? 'scale-110' : 'group-hover:scale-110'
                            }`} />
                            <span className="font-medium">{item.title}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter className="p-3 border-t border-slate-200/50">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton 
                  asChild 
                  className={`group relative overflow-hidden transition-all duration-300 rounded-xl mb-2 ${
                    location.pathname === createPageUrl("Trash") 
                      ? 'bg-[#fff1f2] text-[#d5495f] shadow-sm border border-[#e0919e]' 
                      : 'hover:bg-[#fff1f2] hover:text-[#d5495f] text-slate-700'
                  }`}
                >
                  <Link to={createPageUrl("Trash")} className="flex items-center gap-3 px-4 py-3">
                    <Trash2 className={`w-5 h-5 transition-transform duration-300 ${
                      location.pathname === createPageUrl("Trash") ? 'scale-110 text-[#d5495f]' : 'group-hover:scale-110 group-hover:text-[#d5495f] text-slate-500'
                    }`} />
                    <span className="font-medium">回收站</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
          </Sidebar>

        <main className="flex-1 flex flex-col bg-gradient-to-br from-[#f9fafb] via-[#f9fafb]/50 to-[#eef2f7]/30 relative">
          <FloatingAssistantButton />
          <header className="bg-white/80 backdrop-blur-lg border-b border-slate-200/50 px-6 py-4 lg:hidden sticky top-0 z-10">
            <div className="flex items-center gap-4">
              <SidebarTrigger className="hover:bg-slate-100 p-2 rounded-xl transition-all duration-200" />
              <h1 className="text-lg font-semibold bg-gradient-to-r from-[#384877] to-[#3b5aa2] bg-clip-text text-transparent">
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