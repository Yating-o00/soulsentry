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
    <Sidebar className="border-r border-slate-200/30 bg-white/95 backdrop-blur-xl">
        <SidebarHeader className="border-b border-slate-200/30 p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-[18px] bg-gradient-to-br from-[rgb(var(--primary))] to-[rgb(var(--primary-dark))] flex items-center justify-center shadow-lg shadow-blue-500/20">
                <Bell className="w-5 h-5 text-white" strokeWidth={2.5} />
              </div>
              <div>
                <h2 className="font-semibold text-[17px] text-slate-900 -tracking-[0.02em]">
                  {t('soulSentry')}
                </h2>
                <p className="text-[11px] text-slate-500 -tracking-[0.01em] mt-0.5">{t('tagline')}</p>
              </div>
            </div>
            <button
              onClick={toggleLanguage}
              className="h-8 w-8 rounded-full hover:bg-slate-100 flex items-center justify-center transition-all group active:scale-95"
              title={language === 'zh' ? 'Switch to English' : '切换到中文'}
            >
              <Languages className="w-4 h-4 text-slate-400 group-hover:text-blue-600" strokeWidth={2} />
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
            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 bg-slate-50/80 hover:bg-slate-100 rounded-[12px] text-slate-500 text-[13px] transition-all border border-slate-200/50 hover:border-slate-300/50 font-medium"
          >
            <Search className="w-4 h-4" strokeWidth={2} />
            <span>搜索...</span>
            <div className="ml-auto flex items-center gap-1">
              <kbd className="inline-flex h-5 select-none items-center gap-0.5 rounded-md border border-slate-200 bg-white px-1.5 font-sans text-[10px] font-medium text-slate-500 shadow-sm">
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
                      className={`group relative transition-all duration-200 rounded-[12px] mb-1.5 ${
                        isActive 
                          ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/20' 
                          : 'hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <Link 
                        to={item.url} 
                        onClick={handleMobileClick}
                        className="flex items-center gap-3 px-3 py-2.5"
                      >
                        <item.icon 
                          className={`w-[18px] h-[18px] transition-transform duration-200 ${
                            isActive ? '' : 'text-slate-500'
                          }`}
                          strokeWidth={isActive ? 2.5 : 2}
                        />
                        <span className="font-medium text-[14px] -tracking-[0.01em]">{item.title}</span>
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
              className="group transition-all duration-200 rounded-[12px] mb-1.5 hover:bg-blue-50 text-slate-700 cursor-pointer"
            >
              <div className="flex items-center gap-3 px-3 py-2.5 w-full">
                <MessageSquarePlus className="w-[18px] h-[18px] text-slate-500 group-hover:text-blue-600 transition-colors" strokeWidth={2} />
                <span className="font-medium text-[14px] group-hover:text-blue-600 transition-colors -tracking-[0.01em]">{t('feedback')}</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>

          <SidebarMenuItem>
            <SidebarMenuButton 
              asChild 
              className={`group transition-all duration-200 rounded-[12px] mb-1.5 ${
                location.pathname === createPageUrl("Trash") 
                  ? 'bg-red-50 text-red-600' 
                  : 'hover:bg-red-50 hover:text-red-600 text-slate-700'
              }`}
            >
              <Link 
                to={createPageUrl("Trash")} 
                onClick={handleMobileClick}
                className="flex items-center gap-3 px-3 py-2.5"
              >
                <Trash2 className={`w-[18px] h-[18px] transition-colors ${
                  location.pathname === createPageUrl("Trash") ? '' : 'text-slate-500 group-hover:text-red-600'
                }`} strokeWidth={2} />
                <span className="font-medium text-[14px] -tracking-[0.01em]">{t('trash')}</span>
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
        /* Apple-Style Design System */
        --primary: 0 122 255;
        --primary-dark: 10 88 202;
        --text-primary: 29 29 31;
        --text-secondary: 99 99 102;
        --text-tertiary: 142 142 147;
        --bg-primary: 255 255 255;
        --bg-secondary: 247 247 247;
        --bg-tertiary: 242 242 247;
        --border-light: 229 229 234;
        --success: 52 199 89;
        --warning: 255 149 0;
        --error: 255 59 48;
        --accent: 88 86 214;

        /* Font Size Scaling */
        --base-font-size: ${theme.fontSize === 'small' ? '14px' : theme.fontSize === 'large' ? '18px' : '16px'};

        /* Dark Mode */
        ${theme.darkMode ? `
        --text-primary: 255 255 255;
        --text-secondary: 174 174 178;
        --text-tertiary: 142 142 147;
        --bg-primary: 0 0 0;
        --bg-secondary: 28 28 30;
        --bg-tertiary: 44 44 46;
        --border-light: 58 58 60;
        ` : ''}
      }

      /* Apple-Style Global Styles */
      * {
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
      }

      body {
        color: rgb(var(--text-primary));
        background-color: rgb(var(--bg-secondary));
        font-size: var(--base-font-size);
        font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
        letter-spacing: -0.01em;
      }

      /* Typography Hierarchy */
      h1, h2, h3, h4, h5, h6 {
        color: rgb(var(--text-primary));
        font-weight: 600;
        letter-spacing: -0.02em;
      }

      /* Button Styles */
      button {
        font-weight: 500;
        letter-spacing: -0.01em;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      }

      /* Card & Container Styles */
      .bg-white {
        background-color: rgb(var(--bg-primary)) !important;
        border: 1px solid rgb(var(--border-light));
      }

      /* Text Colors with Better Contrast */
      .text-slate-900 { color: rgb(var(--text-primary)) !important; }
      .text-slate-700 { color: rgb(var(--text-primary)) !important; opacity: 0.85; }
      .text-slate-600 { color: rgb(var(--text-secondary)) !important; }
      .text-slate-500 { color: rgb(var(--text-tertiary)) !important; }

      /* Primary Color System */
      .bg-blue-600, .bg-blue-500 { 
        background: linear-gradient(135deg, rgb(var(--primary)) 0%, rgb(var(--primary-dark)) 100%) !important;
        box-shadow: 0 2px 12px rgba(var(--primary), 0.2);
      }
      .text-blue-600, .text-blue-500 { color: rgb(var(--primary)) !important; }
      .border-blue-600 { border-color: rgb(var(--primary)) !important; }

      /* Subtle Shadows */
      .shadow-sm { box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.02); }
      .shadow { box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06), 0 2px 4px rgba(0, 0, 0, 0.03); }
      .shadow-lg { box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08), 0 4px 8px rgba(0, 0, 0, 0.04); }
      .shadow-xl { box-shadow: 0 16px 48px rgba(0, 0, 0, 0.1), 0 8px 16px rgba(0, 0, 0, 0.06); }

      /* Borders */
      .border-slate-200 { border-color: rgb(var(--border-light)) !important; }
      .border-slate-100 { border-color: rgb(var(--border-light)) !important; opacity: 0.5; }

      /* Backgrounds */
      .bg-slate-50 { background-color: rgb(var(--bg-secondary)) !important; }
      .bg-slate-100 { background-color: rgb(var(--bg-tertiary)) !important; }

      /* Status Colors */
      .text-green-600 { color: rgb(var(--success)) !important; }
      .text-red-600, .text-red-500 { color: rgb(var(--error)) !important; }
      .text-orange-600 { color: rgb(var(--warning)) !important; }
      .text-purple-600 { color: rgb(var(--accent)) !important; }

      /* Inputs */
      input, textarea, select {
        background-color: rgb(var(--bg-primary)) !important;
        color: rgb(var(--text-primary)) !important;
        border-color: rgb(var(--border-light)) !important;
      }

      input:focus, textarea:focus, select:focus {
        border-color: rgb(var(--primary)) !important;
        box-shadow: 0 0 0 3px rgba(var(--primary), 0.1) !important;
      }
      `}</style>
        
        <AppSidebar setSearchOpen={setSearchOpen} setFeedbackOpen={setFeedbackOpen} />

        <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
        <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
        <main className="flex-1 flex flex-col bg-slate-50 relative w-full overflow-hidden">
          <FloatingAssistantButton />
          <header className="bg-white/95 backdrop-blur-xl border-b border-slate-200/30 px-5 py-3.5 lg:hidden sticky top-0 z-10">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="hover:bg-slate-100 p-2 rounded-full transition-all active:scale-95" />
              <h1 className="text-[17px] font-semibold text-slate-900 -tracking-[0.02em]">
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