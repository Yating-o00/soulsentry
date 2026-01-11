import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { LayoutDashboard, ListTodo, Calendar, User, Bell, StickyNote, Users, Languages, Brain } from "lucide-react";
import FloatingAssistantButton from "./components/assistant/FloatingAssistantButton";
import { TranslationProvider, useTranslation } from "./components/TranslationContext";
import MobileNavigation from "./components/mobile/MobileNavigation";
import { useOfflineManager } from "./components/offline/OfflineManager";
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

const getNavigationItems = (t) => [
  {
    title: t('today'),
    url: createPageUrl("Dashboard"),
    icon: LayoutDashboard,
  },
  {
    title: t('tasks'),
    url: createPageUrl("Tasks"),
    icon: ListTodo,
  },
  {
    title: t('notes'),
    url: createPageUrl("Notes"),
    icon: StickyNote,
  },
  {
    title: t('teams'),
    url: createPageUrl("Teams"),
    icon: Users,
  },
  {
    title: t('myAccount'),
    url: createPageUrl("Account"),
    icon: User,
  },
  {
    title: t('notifications'),
    url: createPageUrl("Notifications"),
    icon: Bell,
  },
];

function AppSidebar({ setSearchOpen, setFeedbackOpen }) {
  const location = useLocation();
  const { setOpenMobile } = useSidebar();
  const { t, language, toggleLanguage } = useTranslation();
  const navigationItems = getNavigationItems(t);

  const handleMobileClick = () => {
    setOpenMobile(false);
  };

  return (
    <Sidebar className="border-r border-slate-200/50 bg-gradient-to-b from-slate-50 to-white">
      <SidebarHeader className="border-b border-slate-200/50 p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-[#384877] to-[#3b5aa2] flex items-center justify-center shadow-lg shadow-[#384877]/20">
              <Bell className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-bold text-lg bg-gradient-to-r from-[#384877] to-[#3b5aa2] bg-clip-text text-transparent">
                {t('soulSentry')}
              </h2>
              <p className="text-xs text-slate-500">{t('tagline')}</p>
            </div>
          </div>
          <button
            onClick={toggleLanguage}
            className="h-8 w-8 rounded-lg hover:bg-slate-100 flex items-center justify-center transition-colors group"
            title={language === 'zh' ? 'Switch to English' : '切换到中文'}
          >
            <Languages className="w-4 h-4 text-slate-500 group-hover:text-[#384877]" />
          </button>
        </div>
      </SidebarHeader>

      <SidebarContent className="p-3">
        <div className="px-2 mb-4">
          <button 
            onClick={() => {
              setSearchOpen(true);
              handleMobileClick();
            }}
            className="w-full flex items-center gap-2 px-3 py-2.5 bg-slate-100 hover:bg-slate-200/70 rounded-xl text-slate-500 text-sm transition-colors border border-slate-200/50"
          >
            <Search className="w-4 h-4" />
            <span>搜索...</span>
            <div className="ml-auto flex items-center gap-1">
              <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-slate-300 bg-white px-1.5 font-mono text-[10px] font-medium text-slate-500 opacity-100">
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
                      className={`group relative overflow-hidden transition-all duration-300 rounded-xl mb-2 ${
                        isActive 
                          ? 'bg-gradient-to-r from-[#384877] to-[#3b5aa2] text-white shadow-lg shadow-[#384877]/25' 
                          : 'hover:bg-[#f9fafb] text-slate-700'
                      }`}
                    >
                      <Link 
                        to={item.url} 
                        onClick={handleMobileClick}
                        className="flex items-center gap-3 px-4 py-3"
                      >
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
              onClick={() => {
                setFeedbackOpen(true);
                handleMobileClick();
              }}
              className="group relative overflow-hidden transition-all duration-300 rounded-xl mb-2 hover:bg-[#f0f9ff] text-slate-700 cursor-pointer"
            >
              <div className="flex items-center gap-3 px-4 py-3 w-full">
                <MessageSquarePlus className="w-5 h-5 text-slate-500 group-hover:text-[#384877] group-hover:scale-110 transition-all duration-300" />
                <span className="font-medium group-hover:text-[#384877] transition-colors">{t('feedback')}</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>

          <SidebarMenuItem>
            <SidebarMenuButton 
              asChild 
              className={`group relative overflow-hidden transition-all duration-300 rounded-xl mb-2 ${
                location.pathname === createPageUrl("Trash") 
                  ? 'bg-[#fff1f2] text-[#d5495f] shadow-sm border border-[#e0919e]' 
                  : 'hover:bg-[#fff1f2] hover:text-[#d5495f] text-slate-700'
              }`}
            >
              <Link 
                to={createPageUrl("Trash")} 
                onClick={handleMobileClick}
                className="flex items-center gap-3 px-4 py-3"
              >
                <Trash2 className={`w-5 h-5 transition-transform duration-300 ${
                  location.pathname === createPageUrl("Trash") ? 'scale-110 text-[#d5495f]' : 'group-hover:scale-110 group-hover:text-[#d5495f] text-slate-500'
                }`} />
                <span className="font-medium">{t('trash')}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

function LayoutContent({ children }) {
  const location = useLocation();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const { t } = useTranslation();
  const { isOnline, pendingSync } = useOfflineManager();
  
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
        /* Main Primary Colors - Tech Blue */
        --primary-rgb: ${parseInt(theme.primary.slice(1, 3), 16)} ${parseInt(theme.primary.slice(3, 5), 16)} ${parseInt(theme.primary.slice(5, 7), 16)};
        --primary-main: var(--primary-rgb);      

        /* Font Size Scaling */
        --base-font-size: ${theme.fontSize === 'small' ? '14px' : theme.fontSize === 'large' ? '18px' : '16px'};
        --scale-factor: ${theme.fontSize === 'small' ? '0.875' : theme.fontSize === 'large' ? '1.125' : '1'};

        /* Neutral/Background Colors */
        --bg-white: ${theme.darkMode ? '30 41 59' : '255 255 255'};
        --bg-grey-minimal: ${theme.darkMode ? '15 23 42' : '249 250 251'};
        --text-dark: ${theme.darkMode ? '241 245 249' : '34 34 34'};
        --text-muted: ${theme.darkMode ? '148 163 184' : '100 116 139'};

        /* Legacy Variables Mapped to New System */
        --color-primary: var(--primary-main);
        --color-secondary: var(--text-dark);
        --slate-50: var(--bg-grey-minimal);
        --slate-900: var(--text-dark);
      }

      /* Global Overrides for Cinematic/Tech Feel */
      body {
        color: rgb(var(--text-dark));
        background-color: rgb(var(--bg-grey-minimal));
        font-size: var(--base-font-size);
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
        /* Ensure text visibility on colored backgrounds */
        .bg-amber-50 { background-color: rgb(55 48 28) !important; }
        .text-amber-600 { color: rgb(253 224 71) !important; }
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

        {/* 离线状态提示 */}
        {!isOnline && (
          <div className="md:hidden fixed top-0 inset-x-0 z-50 bg-amber-500 text-white text-center py-3 text-base font-medium">
            📡 离线模式 {pendingSync > 0 && `· ${pendingSync} 项待同步`}
          </div>
        )}

        <main className="flex-1 flex flex-col bg-gradient-to-br from-[#f9fafb] via-[#f9fafb]/50 to-[#eef2f7]/30 relative w-full overflow-hidden pb-20 md:pb-0">
          <FloatingAssistantButton />
          <header className="bg-white/80 backdrop-blur-lg border-b border-slate-200/50 px-4 py-3 lg:hidden sticky top-0 z-10 min-h-[56px]">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="hover:bg-slate-100 p-2.5 rounded-xl transition-all duration-200 min-w-[44px] min-h-[44px] flex items-center justify-center" />
              <h1 className="text-base font-semibold bg-gradient-to-r from-[#384877] to-[#3b5aa2] bg-clip-text text-transparent">
                {t('soulSentry')}
              </h1>
            </div>
          </header>

          <div className="flex-1 overflow-auto">
            {children}
          </div>
          </main>

          {/* 移动端底部导航 */}
          <MobileNavigation />
          </SidebarProvider>
    );
    }

    export default function Layout({ children }) {
    return (
    <TranslationProvider>
    <LayoutContent>{children}</LayoutContent>
    </TranslationProvider>
    );
    }