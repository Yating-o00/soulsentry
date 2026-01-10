import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { LayoutDashboard, ListTodo, Calendar, User, Bell, StickyNote, Users, Languages, Brain } from "lucide-react";
import FloatingAssistantButton from "./components/assistant/FloatingAssistantButton";
import { TranslationProvider, useTranslation } from "./components/TranslationContext";
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
    title: "知识库",
    url: createPageUrl("KnowledgeBase"),
    icon: Brain,
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
    <Sidebar className="border-r border-slate-200/30 glass">
        <SidebarHeader className="border-b border-slate-200/30 p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-[#384877] to-[#3b5aa2] flex items-center justify-center shadow-md">
              <Bell className="w-6 h-6 text-white" strokeWidth={2} />
            </div>
            <div>
              <h2 className="font-semibold text-lg text-slate-900">
                {t('soulSentry')}
              </h2>
              <p className="text-xs text-slate-500 font-medium">{t('tagline')}</p>
            </div>
          </div>
          <button
            onClick={toggleLanguage}
            className="h-9 w-9 rounded-xl hover:bg-slate-100 flex items-center justify-center transition-all active:scale-95"
            title={language === 'zh' ? 'Switch to English' : '切换到中文'}
          >
            <Languages className="w-4.5 h-4.5 text-slate-500" strokeWidth={2} />
          </button>
        </div>
      </SidebarHeader>

      <SidebarContent className="p-3">
        <div className="px-3 mb-4">
          <button 
            onClick={() => {
              setSearchOpen(true);
              handleMobileClick();
            }}
            className="w-full flex items-center gap-2 px-4 py-3 bg-slate-100/80 hover:bg-slate-100 rounded-xl text-slate-500 text-sm transition-all active:scale-98"
          >
            <Search className="w-4 h-4" strokeWidth={2} />
            <span className="font-medium">搜索...</span>
            <div className="ml-auto flex items-center gap-1">
              <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded-md border border-slate-300/50 bg-white px-1.5 font-mono text-[10px] font-medium text-slate-400 shadow-sm">
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
                      className={`group relative overflow-hidden transition-all duration-200 rounded-xl mb-1.5 ${
                        isActive 
                          ? 'bg-gradient-to-r from-[#384877] to-[#3b5aa2] text-white shadow-md' 
                          : 'hover:bg-slate-100/80 text-slate-700 active:scale-98'
                      }`}
                    >
                      <Link 
                        to={item.url} 
                        onClick={handleMobileClick}
                        className="flex items-center gap-3 px-4 py-2.5"
                      >
                        <item.icon className={`w-5 h-5 transition-transform duration-200 ${
                          isActive ? 'scale-105' : 'group-hover:scale-105'
                        }`} strokeWidth={isActive ? 2.5 : 2} />
                        <span className="font-medium text-[15px]">{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-3 border-t border-slate-200/30">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton 
              onClick={() => {
                setFeedbackOpen(true);
                handleMobileClick();
              }}
              className="group relative overflow-hidden transition-all duration-200 rounded-xl mb-1.5 hover:bg-blue-50/80 text-slate-700 cursor-pointer active:scale-98"
            >
              <div className="flex items-center gap-3 px-4 py-2.5 w-full">
                <MessageSquarePlus className="w-5 h-5 text-slate-500 group-hover:text-blue-600 transition-colors" strokeWidth={2} />
                <span className="font-medium text-[15px] group-hover:text-blue-600 transition-colors">{t('feedback')}</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>

          <SidebarMenuItem>
            <SidebarMenuButton 
              asChild 
              className={`group relative overflow-hidden transition-all duration-200 rounded-xl mb-1.5 ${
                location.pathname === createPageUrl("Trash") 
                  ? 'bg-red-50/80 text-red-600 shadow-sm' 
                  : 'hover:bg-red-50/80 hover:text-red-600 text-slate-700 active:scale-98'
              }`}
            >
              <Link 
                to={createPageUrl("Trash")} 
                onClick={handleMobileClick}
                className="flex items-center gap-3 px-4 py-2.5"
              >
                <Trash2 className={`w-5 h-5 transition-transform duration-200 ${
                  location.pathname === createPageUrl("Trash") ? 'scale-105' : 'group-hover:scale-105'
                }`} strokeWidth={location.pathname === createPageUrl("Trash") ? 2.5 : 2} />
                <span className="font-medium text-[15px]">{t('trash')}</span>
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
        /* Apple-inspired Color System */
        --primary-rgb: ${parseInt(theme.primary.slice(1, 3), 16)} ${parseInt(theme.primary.slice(3, 5), 16)} ${parseInt(theme.primary.slice(5, 7), 16)};
        --primary-main: var(--primary-rgb);

        /* SF Pro inspired font stack */
        --font-system: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;

        /* Font Size - Apple style scaling */
        --base-font-size: ${theme.fontSize === 'small' ? '15px' : theme.fontSize === 'large' ? '17px' : '16px'};

        /* Refined Color Palette */
        --bg-primary: ${theme.darkMode ? '18 18 18' : '255 255 255'};
        --bg-secondary: ${theme.darkMode ? '28 28 30' : '247 247 247'};
        --bg-tertiary: ${theme.darkMode ? '44 44 46' : '242 242 247'};

        --text-primary: ${theme.darkMode ? '255 255 255' : '0 0 0'};
        --text-secondary: ${theme.darkMode ? '152 152 157' : '60 60 67'};
        --text-tertiary: ${theme.darkMode ? '99 99 102' : '142 142 147'};

        /* Semantic Colors - iOS style */
        --color-blue: 0 122 255;
        --color-green: 52 199 89;
        --color-orange: 255 149 0;
        --color-red: 255 59 48;
        --color-purple: 175 82 222;
        --color-pink: 255 45 85;

        /* Elevation & Shadows */
        --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04);
        --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.08), 0 2px 6px rgba(0, 0, 0, 0.04);
        --shadow-lg: 0 12px 28px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.08);

        /* Border Radius - Apple style */
        --radius-sm: 8px;
        --radius-md: 12px;
        --radius-lg: 16px;
        --radius-xl: 20px;
      }

      * {
        font-family: var(--font-system) !important;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
      }

      body {
        color: rgb(var(--text-primary));
        background-color: rgb(var(--bg-secondary));
        font-size: var(--base-font-size);
        letter-spacing: -0.01em;
      }

      /* Typography Refinements */
      h1, h2, h3, h4, h5, h6 {
        font-weight: 600;
        letter-spacing: -0.02em;
      }

      /* Button & Interactive Elements */
      button, .btn {
        font-weight: 500;
        letter-spacing: -0.01em;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      }

      /* Card Styling - Apple style */
      .card, [class*="Card"] {
        background-color: rgb(var(--bg-primary));
        border: 1px solid ${theme.darkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)'};
        box-shadow: var(--shadow-sm);
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      }

      .card:hover {
        box-shadow: var(--shadow-md);
        transform: translateY(-1px);
      }

      /* Input Styling */
      input, textarea, select {
        background-color: ${theme.darkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.03)'} !important;
        border: 1px solid ${theme.darkMode ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)'} !important;
        color: rgb(var(--text-primary)) !important;
        transition: all 0.2s ease;
      }

      input:focus, textarea:focus, select:focus {
        background-color: ${theme.darkMode ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.05)'} !important;
        border-color: rgb(var(--color-blue)) !important;
        box-shadow: 0 0 0 3px rgba(var(--color-blue), 0.1) !important;
      }

      /* Primary Color Overrides */
      .bg-blue-600, .bg-blue-500, .bg-purple-600 {
        background-color: rgb(var(--primary-main)) !important;
      }

      .text-blue-600, .text-blue-500, .text-purple-600 {
        color: rgb(var(--primary-main)) !important;
      }

      .border-blue-600, .border-purple-600 {
        border-color: rgb(var(--primary-main)) !important;
      }

      /* Gradient Refinements */
      .bg-gradient-to-r, .bg-gradient-to-br {
        background-image: linear-gradient(135deg, rgb(var(--primary-main)), rgba(var(--primary-main), 0.85)) !important;
      }

      /* Badge Styling */
      [class*="badge"], [class*="Badge"] {
        font-size: 0.75rem;
        font-weight: 500;
        letter-spacing: 0.02em;
        padding: 0.25rem 0.5rem;
        border-radius: var(--radius-sm);
      }

      /* Scrollbar Styling */
      ::-webkit-scrollbar {
        width: 8px;
        height: 8px;
      }

      ::-webkit-scrollbar-track {
        background: transparent;
      }

      ::-webkit-scrollbar-thumb {
        background: ${theme.darkMode ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)'};
        border-radius: 4px;
      }

      ::-webkit-scrollbar-thumb:hover {
        background: ${theme.darkMode ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.3)'};
      }

      /* Glass Effect */
      .glass {
        background: ${theme.darkMode ? 'rgba(28, 28, 30, 0.8)' : 'rgba(255, 255, 255, 0.8)'};
        backdrop-filter: blur(20px) saturate(180%);
        -webkit-backdrop-filter: blur(20px) saturate(180%);
      }

      /* Icon Refinements */
      svg {
        stroke-width: 1.5px;
      }
      `}</style>
        
        <AppSidebar setSearchOpen={setSearchOpen} setFeedbackOpen={setFeedbackOpen} />

        <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
        <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
        <main className="flex-1 flex flex-col bg-slate-50 relative w-full overflow-hidden">
          <FloatingAssistantButton />
          <header className="glass border-b border-slate-200/30 px-6 py-4 lg:hidden sticky top-0 z-10">
            <div className="flex items-center gap-4">
              <SidebarTrigger className="hover:bg-slate-100 p-2 rounded-xl transition-all active:scale-95" />
              <h1 className="text-lg font-semibold text-slate-900">
                {t('soulSentry')}
              </h1>
            </div>
          </header>

          <div className="flex-1 overflow-auto">
            {children}
          </div>
        </main>
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