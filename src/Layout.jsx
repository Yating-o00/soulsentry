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
          :root {
            --color-primary: 211 24% 42%;
            --color-secondary: 210 40% 24%;
            --color-accent: 199 89% 48%;
            --color-success: 158 64% 52%;

            --slate-50: 249 250 251;
            --slate-900: 34 34 34;
            --steel-blue: 90 100 125;
            --navy-blue: 30 58 95;
            --sky-blue: 147 197 253;
            --cyan-accent: 6 182 212;
            --violet-accent: 139 92 246;

            /* Rose Theme Colors */
            --rose-primary: 213 73 95;   /* #d5495f */
            --rose-light: 222 109 126;   /* #de6d7e */
            --rose-lighter: 224 145 158; /* #e0919e */
            }

            .bg-gradient-to-r.from-blue-500 { background-image: linear-gradient(to right, rgb(56, 72, 119), rgb(30, 58, 95)) !important; }
          .bg-gradient-to-br.from-blue-500 { background-image: linear-gradient(to bottom right, rgb(56, 72, 119), rgb(30, 58, 95)) !important; }
          .from-purple-500.to-blue-500 { background-image: linear-gradient(to right, rgb(56, 72, 119), rgb(30, 58, 95)) !important; }
          .from-purple-500.to-blue-600 { background-image: linear-gradient(to right, rgb(56, 72, 119), rgb(30, 58, 95)) !important; }
          .from-purple-600.to-blue-600 { background-image: linear-gradient(to right, rgb(75, 85, 110), rgb(25, 48, 80)) !important; }
          .from-blue-600.to-purple-600 { background-image: linear-gradient(to right, rgb(30, 58, 95), rgb(56, 72, 119)) !important; }

          .text-blue-500, .text-blue-600 { color: rgb(56, 72, 119) !important; }
          .text-purple-500, .text-purple-600, .text-purple-700 { color: rgb(56, 72, 119) !important; }
          .bg-blue-50, .bg-purple-50 { background-color: rgb(249, 250, 251) !important; }
          .bg-blue-100, .bg-purple-100 { background-color: rgb(239, 242, 247) !important; }
          .border-blue-200, .border-purple-200 { border-color: rgb(220, 225, 235) !important; }
          .border-blue-300, .border-purple-300 { border-color: rgb(200, 210, 225) !important; }
          .hover\\:border-blue-300:hover, .hover\\:border-purple-300:hover { border-color: rgb(200, 210, 225) !important; }
          .hover\\:bg-blue-50:hover, .hover\\:bg-purple-50:hover { background-color: rgb(249, 250, 251) !important; }

          .bg-slate-50 { background-color: rgb(249, 250, 251) !important; }
          .from-slate-50 { --tw-gradient-from: rgb(249, 250, 251) !important; }
          .to-blue-50\\/30 { --tw-gradient-to: rgba(249, 250, 251, 0.3) !important; }
          .to-purple-50\\/30 { --tw-gradient-to: rgba(249, 250, 251, 0.3) !important; }
        `}</style>
        
        <Sidebar className="border-r border-slate-200/50 bg-gradient-to-b from-slate-50 to-white">
          <SidebarHeader className="border-b border-slate-200/50 p-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-[#d5495f] to-[#de6d7e] flex items-center justify-center shadow-lg shadow-[#d5495f]/20">
                <Bell className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="font-bold text-lg bg-gradient-to-r from-[#d5495f] to-[#de6d7e] bg-clip-text text-transparent">
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
                              ? 'bg-gradient-to-r from-[#384877] to-[#202a44] text-white shadow-lg shadow-[#384877]/25' 
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
        </Sidebar>

        <main className="flex-1 flex flex-col bg-gradient-to-br from-[#f9fafb] via-[#f9fafb]/50 to-[#eef2f7]/30 relative">
          <FloatingAssistantButton />
          <header className="bg-white/80 backdrop-blur-lg border-b border-slate-200/50 px-6 py-4 lg:hidden sticky top-0 z-10">
            <div className="flex items-center gap-4">
              <SidebarTrigger className="hover:bg-slate-100 p-2 rounded-xl transition-all duration-200" />
              <h1 className="text-lg font-semibold bg-gradient-to-r from-[#384877] to-[#202a44] bg-clip-text text-transparent">
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