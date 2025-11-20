import React from "react";
import { Link, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { LayoutDashboard, ListTodo, Calendar, User, Bell } from "lucide-react";
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
            --color-primary: 224 76% 65%;
            --color-secondary: 262 83% 58%;
            --color-accent: 31 100% 65%;
            --color-success: 142 76% 45%;
          }
        `}</style>
        
        <Sidebar className="border-r border-slate-200/50 bg-gradient-to-b from-slate-50 to-white">
          <SidebarHeader className="border-b border-slate-200/50 p-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg">
                <Bell className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="font-bold text-lg bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
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
                              ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg shadow-purple-500/25' 
                              : 'hover:bg-slate-100 text-slate-700'
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

        <main className="flex-1 flex flex-col bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/30">
          <header className="bg-white/80 backdrop-blur-lg border-b border-slate-200/50 px-6 py-4 lg:hidden sticky top-0 z-10">
            <div className="flex items-center gap-4">
              <SidebarTrigger className="hover:bg-slate-100 p-2 rounded-xl transition-all duration-200" />
              <h1 className="text-lg font-semibold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
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