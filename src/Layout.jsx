import React, { useState } from "react";
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
  useSidebar,
} from "@/components/ui/sidebar";
import { Trash2, MessageSquarePlus, Search } from "lucide-react";
import FeedbackDialog from "@/components/feedback/FeedbackDialog";
import GlobalSearch from "@/components/search/GlobalSearch";

const navigationItems = [
  {
    title: "今日",
    url: createPageUrl("Dashboard"),
    icon: LayoutDashboard,
  },
  {
    title: "约定",
    url: createPageUrl("Tasks"),
    icon: ListTodo,
  },
  {
    title: "心签",
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
    title: "消息通知",
    url: createPageUrl("Notifications"),
    icon: Bell,
  },
];

function AppSidebar({ setSearchOpen, setFeedbackOpen }) {
  const location = useLocation();
  const { setOpenMobile } = useSidebar();

  const handleMobileClick = () => {
    setOpenMobile(false);
  };

  return (
    <Sidebar className="border-r-0 bg-white/80 backdrop-blur-xl relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-[#384877]/5 via-transparent to-[#3b5aa2]/5 pointer-events-none" />
      
      <SidebarHeader className="border-b border-slate-200/30 p-6 relative z-10">
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-br from-[#384877] to-[#3b5aa2] rounded-2xl blur-lg opacity-40 animate-pulse" />
            <div className="relative h-12 w-12 rounded-2xl bg-gradient-to-br from-[#384877] to-[#3b5aa2] flex items-center justify-center shadow-xl">
              <Bell className="w-6 h-6 text-white" />
            </div>
          </div>
          <div className="flex-1">
            <h2 className="font-bold text-xl bg-gradient-to-r from-[#384877] via-[#3b5aa2] to-[#384877] bg-clip-text text-transparent">
              心灵存放站
            </h2>
            <p className="text-xs text-slate-500 font-medium mt-0.5">坚定守护，适时轻唤</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="p-4 relative z-10">
        <div className="mb-5">
          <button 
            onClick={() => {
              setSearchOpen(true);
              handleMobileClick();
            }}
            className="group w-full flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-slate-50 to-slate-100/50 hover:from-slate-100 hover:to-slate-200/50 rounded-2xl text-slate-600 text-sm transition-all border border-slate-200/50 hover:border-slate-300/50 shadow-sm hover:shadow-md"
          >
            <Search className="w-4 h-4 text-slate-400 group-hover:text-[#384877] transition-colors" />
            <span className="font-medium">搜索...</span>
            <div className="ml-auto flex items-center gap-1">
              <kbd className="pointer-events-none inline-flex h-6 select-none items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 font-mono text-[10px] font-semibold text-slate-500 shadow-sm">
                <span className="text-xs">⌘</span>K
              </kbd>
            </div>
          </button>
        </div>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigationItems.map((item) => {
                const isActive = location.pathname === item.url;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton 
                      asChild 
                      className={`group relative overflow-hidden transition-all duration-300 rounded-2xl mb-2 ${
                        isActive 
                          ? 'bg-gradient-to-r from-[#384877] via-[#3b5aa2] to-[#384877] text-white shadow-xl shadow-[#384877]/30' 
                          : 'hover:bg-gradient-to-r hover:from-slate-50 hover:to-slate-100 text-slate-700 hover:shadow-sm'
                      }`}
                    >
                      <Link 
                        to={item.url} 
                        onClick={handleMobileClick}
                        className="flex items-center gap-4 px-5 py-3.5 relative"
                      >
                        {isActive && (
                          <motion.div
                            layoutId="activeTab"
                            className="absolute inset-0 bg-gradient-to-r from-white/10 to-white/5 rounded-2xl"
                            transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                          />
                        )}
                        <item.icon className={`w-5 h-5 relative z-10 transition-all duration-300 ${
                          isActive ? 'scale-110 drop-shadow-lg' : 'group-hover:scale-110 text-slate-500 group-hover:text-[#384877]'
                        }`} />
                        <span className="font-semibold relative z-10 text-[15px]">{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-4 border-t border-slate-200/30 relative z-10 bg-white/50 backdrop-blur-sm">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton 
              onClick={() => {
                setFeedbackOpen(true);
                handleMobileClick();
              }}
              className="group relative overflow-hidden transition-all duration-300 rounded-2xl mb-2 hover:bg-gradient-to-r hover:from-cyan-50 hover:to-blue-50 text-slate-700 cursor-pointer hover:shadow-sm"
            >
              <div className="flex items-center gap-4 px-5 py-3.5 w-full">
                <MessageSquarePlus className="w-5 h-5 text-slate-500 group-hover:text-cyan-600 group-hover:scale-110 transition-all duration-300" />
                <span className="font-semibold group-hover:text-cyan-700 transition-colors text-[15px]">反馈与联系</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>

          <SidebarMenuItem>
            <SidebarMenuButton 
              asChild 
              className={`group relative overflow-hidden transition-all duration-300 rounded-2xl mb-2 ${
                location.pathname === createPageUrl("Trash") 
                  ? 'bg-gradient-to-r from-rose-50 to-pink-50 text-[#d5495f] shadow-lg border-2 border-rose-200' 
                  : 'hover:bg-gradient-to-r hover:from-rose-50 hover:to-pink-50 hover:text-[#d5495f] text-slate-700 hover:shadow-sm'
              }`}
            >
              <Link 
                to={createPageUrl("Trash")} 
                onClick={handleMobileClick}
                className="flex items-center gap-4 px-5 py-3.5"
              >
                <Trash2 className={`w-5 h-5 transition-all duration-300 ${
                  location.pathname === createPageUrl("Trash") ? 'scale-110 text-[#d5495f] drop-shadow-sm' : 'group-hover:scale-110 group-hover:text-[#d5495f] text-slate-500'
                }`} />
                <span className="font-semibold text-[15px]">回收站</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

export default function Layout({ children }) {
  const location = useLocation();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  
  // Fetch user theme preferences
  const [theme, setTheme] = useState({
    primary: "#384877",
    fontSize: "medium", 
    darkMode: false
  });

  React.useEffect(() => {
    const fetchTheme = async () => {
        try {
            const user = await base44.auth.me();
            if (user?.theme_preferences) {
                setTheme({
                    primary: user.theme_preferences.primary_color || "#384877",
                    fontSize: user.theme_preferences.font_size || "medium",
                    darkMode: user.theme_preferences.dark_mode || false
                });
            }
        } catch (e) {
            console.error("Failed to load theme", e);
        }
    };
    fetchTheme();
    // Listen for theme changes event (dispatched from Account page)
    const handleThemeChange = (e) => {
        if (e.detail) setTheme(prev => ({ ...prev, ...e.detail }));
    };
    window.addEventListener('theme-change', handleThemeChange);
    return () => window.removeEventListener('theme-change', handleThemeChange);
  }, []);

  React.useEffect(() => {
    const down = (e) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSearchOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  return (
    <SidebarProvider>
      <style>{`
      :root {
        /* Main Primary Colors */
        --primary-rgb: ${parseInt(theme.primary.slice(1, 3), 16)} ${parseInt(theme.primary.slice(3, 5), 16)} ${parseInt(theme.primary.slice(5, 7), 16)};
        --primary-main: var(--primary-rgb);      

        /* Modern Spacing System */
        --spacing-xs: 0.25rem;
        --spacing-sm: 0.5rem;
        --spacing-md: 1rem;
        --spacing-lg: 1.5rem;
        --spacing-xl: 2rem;
        --spacing-2xl: 3rem;

        /* Border Radius System */
        --radius-sm: 0.5rem;
        --radius-md: 0.75rem;
        --radius-lg: 1rem;
        --radius-xl: 1.5rem;
        --radius-2xl: 2rem;

        /* Font Size Scaling */
        --base-font-size: ${theme.fontSize === 'small' ? '14px' : theme.fontSize === 'large' ? '18px' : '16px'};
        --scale-factor: ${theme.fontSize === 'small' ? '0.875' : theme.fontSize === 'large' ? '1.125' : '1'};

        /* Modern Shadow System */
        --shadow-xs: 0 1px 2px 0 rgb(0 0 0 / 0.05);
        --shadow-sm: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1);
        --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
        --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
        --shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1);
        --shadow-primary: 0 10px 25px -5px rgba(var(--primary-rgb), 0.3);

        /* Neutral/Background Colors */
        --bg-white: ${theme.darkMode ? '30 41 59' : '255 255 255'};
        --bg-grey-minimal: ${theme.darkMode ? '15 23 42' : '249 250 251'};
        --text-dark: ${theme.darkMode ? '241 245 249' : '34 34 34'};
        --text-muted: ${theme.darkMode ? '148 163 184' : '100 116 139'};

        /* Animation Timing */
        --transition-fast: 150ms cubic-bezier(0.4, 0, 0.2, 1);
        --transition-base: 250ms cubic-bezier(0.4, 0, 0.2, 1);
        --transition-slow: 350ms cubic-bezier(0.4, 0, 0.2, 1);

        /* Legacy Variables */
        --color-primary: var(--primary-main);
        --color-secondary: var(--text-dark);
        --slate-50: var(--bg-grey-minimal);
        --slate-900: var(--text-dark);
      }

      /* Global Overrides */
      * {
        transition-duration: var(--transition-fast);
      }

      body {
        color: rgb(var(--text-dark));
        background: ${theme.darkMode 
          ? 'linear-gradient(135deg, rgb(15 23 42) 0%, rgb(30 41 59) 100%)' 
          : 'linear-gradient(135deg, #fafbfc 0%, #f0f4f8 50%, #e8eef5 100%)'};
        font-size: var(--base-font-size);
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
      }

      /* Enhanced Scrollbar */
      ::-webkit-scrollbar {
        width: 8px;
        height: 8px;
      }
      ::-webkit-scrollbar-track {
        background: transparent;
      }
      ::-webkit-scrollbar-thumb {
        background: rgba(var(--primary-rgb), 0.3);
        border-radius: 10px;
        transition: background var(--transition-base);
      }
      ::-webkit-scrollbar-thumb:hover {
        background: rgba(var(--primary-rgb), 0.5);
      }

      /* Dark mode specific overrides */
      ${theme.darkMode ? `
        .bg-white { background-color: rgb(30 41 59) !important; }
        .bg-slate-50 { background-color: rgb(15 23 42) !important; }
        .bg-slate-100 { background-color: rgb(30 41 59) !important; }
        .text-slate-900 { color: rgb(241 245 249) !important; }
        .text-slate-700 { color: rgb(226 232 240) !important; }
        .text-slate-600 { color: rgb(203 213 225) !important; }
        .text-slate-500 { color: rgb(148 163 184) !important; }
        .border-slate-200 { border-color: rgb(51 65 85) !important; }
        .border-slate-100 { border-color: rgb(30 41 59) !important; }
        input, textarea, select { 
            background-color: rgb(30 41 59) !important; 
            color: rgb(241 245 249) !important;
            border-color: rgb(51 65 85) !important;
        }
      ` : ''}

      /* Override Blue/Purple classes to use our new Primary Tech Blue */
      .bg-blue-600, .bg-blue-500, .bg-purple-600 { background-color: rgb(var(--primary-main)) !important; }
      .text-blue-600, .text-blue-500, .text-purple-600 { color: rgb(var(--primary-main)) !important; }
      .border-blue-600, .border-purple-600 { border-color: rgb(var(--primary-main)) !important; }

      /* Hover states */
      .hover\\:bg-blue-700:hover { background-color: rgba(var(--primary-main), 0.8) !important; }

      /* Gradients - Primary */
      .bg-gradient-to-r.from-blue-500, 
      .bg-gradient-to-r.from-blue-600,
      .from-purple-500 { 
        background-image: linear-gradient(135deg, rgb(var(--primary-main)) 0%, rgba(var(--primary-main), 0.8) 100%) !important; 
      }

      .bg-gradient-to-br.from-blue-500 {
        background-image: linear-gradient(135deg, rgb(var(--primary-main)) 0%, rgba(var(--primary-main), 0.8) 100%) !important;
      }

      /* Secondary Accents (Red) where needed specifically */
      .text-red-500, .text-rose-500 { color: rgb(213, 73, 95) !important; }

      /* Soft Backgrounds */
      .bg-blue-50, .bg-purple-50 { background-color: rgba(var(--primary-main), 0.05) !important; }
      .bg-blue-100 { background-color: rgba(var(--primary-main), 0.1) !important; }
      `}</style>
        
        <AppSidebar setSearchOpen={setSearchOpen} setFeedbackOpen={setFeedbackOpen} />

        <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
        <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
        <main className="flex-1 flex flex-col bg-gradient-to-br from-[#f9fafb] via-[#f9fafb]/50 to-[#eef2f7]/30 relative w-full overflow-hidden">
          <FloatingAssistantButton />
          <header className="bg-white/90 backdrop-blur-2xl border-b border-slate-200/50 px-6 py-4 lg:hidden sticky top-0 z-20 shadow-sm">
            <div className="flex items-center gap-4">
              <SidebarTrigger className="hover:bg-gradient-to-r hover:from-slate-100 hover:to-slate-200 p-2.5 rounded-xl transition-all duration-300 hover:shadow-sm" />
              <h1 className="text-lg font-bold bg-gradient-to-r from-[#384877] via-[#3b5aa2] to-[#384877] bg-clip-text text-transparent">
                心灵存放站
              </h1>
            </div>
          </header>

          <div className="flex-1 overflow-auto relative">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-[#384877]/5 via-transparent to-transparent pointer-events-none" />
            {children}
          </div>
        </main>
    </SidebarProvider>
  );
}