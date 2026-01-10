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
    <Sidebar className="border-r border-slate-200/50 bg-gradient-to-b from-slate-50 to-white">
      <SidebarHeader className="border-b border-slate-200/50 p-6">
        <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center shadow-lg shadow-blue-500/30 backdrop-blur-sm">
                    <Bell className="w-5 h-5 text-white" strokeWidth={2.5} />
                  </div>
                  <div>
                    <h2 className="font-bold text-lg bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent tracking-tight">
                      {t('soulSentry')}
                    </h2>
                    <p className="text-[11px] text-gray-500 font-medium">{t('tagline')}</p>
                  </div>
                </div>
          <button
            onClick={toggleLanguage}
            className="h-9 w-9 rounded-xl hover:bg-gray-100 flex items-center justify-center transition-all group hover:scale-105"
            title={language === 'zh' ? 'Switch to English' : '切换到中文'}
          >
            <Languages className="w-4 h-4 text-gray-500 group-hover:text-blue-600 transition-colors" strokeWidth={2.5} />
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
            className="w-full flex items-center gap-3 px-4 py-3 bg-gray-100/80 hover:bg-gray-200/80 rounded-xl text-gray-600 text-sm transition-all border border-gray-200/60 backdrop-blur-sm group"
          >
            <Search className="w-4 h-4 group-hover:text-blue-600 transition-colors" strokeWidth={2.5} />
            <span className="font-medium">搜索...</span>
            <div className="ml-auto flex items-center gap-1">
              <kbd className="pointer-events-none inline-flex h-6 select-none items-center gap-1 rounded-lg border border-gray-300 bg-white px-2 font-mono text-[10px] font-semibold text-gray-500 shadow-sm">
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
                          ? 'bg-gradient-to-r from-blue-500 to-purple-500 text-white shadow-lg shadow-blue-500/30' 
                          : 'hover:bg-gray-100 text-gray-700'
                      }`}
                    >
                      <Link 
                        to={item.url} 
                        onClick={handleMobileClick}
                        className="flex items-center gap-3 px-4 py-3"
                      >
                        <item.icon 
                          className={`w-5 h-5 transition-all duration-200 ${
                            isActive ? 'scale-105' : 'group-hover:scale-105 group-hover:text-blue-600'
                          }`}
                          strokeWidth={isActive ? 2.5 : 2}
                        />
                        <span className={`font-medium ${isActive ? 'font-semibold' : ''}`}>{item.title}</span>
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
              className="group relative overflow-hidden transition-all duration-200 rounded-xl mb-1.5 hover:bg-blue-50 text-gray-700 cursor-pointer"
            >
              <div className="flex items-center gap-3 px-4 py-3 w-full">
                <MessageSquarePlus className="w-5 h-5 text-gray-500 group-hover:text-blue-600 group-hover:scale-105 transition-all duration-200" strokeWidth={2} />
                <span className="font-medium group-hover:text-blue-600 transition-colors">{t('feedback')}</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>

          <SidebarMenuItem>
            <SidebarMenuButton 
              asChild 
              className={`group relative overflow-hidden transition-all duration-200 rounded-xl mb-1.5 ${
                location.pathname === createPageUrl("Trash") 
                  ? 'bg-pink-50 text-pink-600 shadow-sm border border-pink-200' 
                  : 'hover:bg-pink-50 hover:text-pink-600 text-gray-700'
              }`}
            >
              <Link 
                to={createPageUrl("Trash")} 
                onClick={handleMobileClick}
                className="flex items-center gap-3 px-4 py-3"
              >
                <Trash2 className={`w-5 h-5 transition-all duration-200 ${
                  location.pathname === createPageUrl("Trash") ? 'scale-105 text-pink-600' : 'group-hover:scale-105 group-hover:text-pink-600 text-gray-500'
                }`} strokeWidth={location.pathname === createPageUrl("Trash") ? 2.5 : 2} />
                <span className={`font-medium ${location.pathname === createPageUrl("Trash") ? 'font-semibold' : ''}`}>{t('trash')}</span>
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
      /* Apple-inspired Design System */
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

      :root {
        /* Primary Brand Colors - Vibrant Blue */
        --primary-rgb: 59 130 246;
        --primary-dark: 37 99 235;
        --primary-light: 147 197 253;
        --primary-ultra-light: 219 234 254;

        /* Accent Colors */
        --accent-purple: 139 92 246;
        --accent-pink: 236 72 153;
        --accent-orange: 249 115 22;
        --accent-green: 34 197 94;

        /* Neutral Palette */
        --gray-50: 249 250 251;
        --gray-100: 243 244 246;
        --gray-200: 229 231 235;
        --gray-300: 209 213 219;
        --gray-400: 156 163 175;
        --gray-500: 107 114 128;
        --gray-600: 75 85 99;
        --gray-700: 55 65 81;
        --gray-800: 31 41 55;
        --gray-900: 17 24 39;

        /* Typography */
        --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
        --font-weight-normal: 400;
        --font-weight-medium: 500;
        --font-weight-semibold: 600;
        --font-weight-bold: 700;

        /* Spacing Scale (Apple-like) */
        --space-xs: 0.25rem;
        --space-sm: 0.5rem;
        --space-md: 1rem;
        --space-lg: 1.5rem;
        --space-xl: 2rem;
        --space-2xl: 3rem;

        /* Border Radius */
        --radius-sm: 0.5rem;
        --radius-md: 0.75rem;
        --radius-lg: 1rem;
        --radius-xl: 1.25rem;
        --radius-2xl: 1.5rem;

        /* Shadows */
        --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
        --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
        --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
        --shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1);
      }

      * {
        font-family: var(--font-sans) !important;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
      }

      body {
        background: linear-gradient(to bottom, rgb(var(--gray-50)), rgb(var(--gray-100)));
        color: rgb(var(--gray-900));
        font-weight: var(--font-weight-normal);
        letter-spacing: -0.01em;
      }

      /* Enhanced Text Contrast */
      .text-slate-900, .text-gray-900 { 
        color: rgb(var(--gray-900)) !important;
        font-weight: var(--font-weight-semibold);
      }
      .text-slate-800, .text-gray-800 { 
        color: rgb(var(--gray-800)) !important;
        font-weight: var(--font-weight-medium);
      }
      .text-slate-700, .text-gray-700 { 
        color: rgb(var(--gray-700)) !important;
      }
      .text-slate-600, .text-gray-600 { 
        color: rgb(var(--gray-600)) !important;
      }
      .text-slate-500, .text-gray-500 { 
        color: rgb(var(--gray-500)) !important;
      }

      /* Primary Color System */
      .bg-blue-600, .bg-blue-500, .bg-[#384877] { 
        background: linear-gradient(135deg, rgb(var(--primary-rgb)), rgb(var(--primary-dark))) !important;
        box-shadow: 0 4px 12px rgb(var(--primary-rgb) / 0.25);
      }
      .text-blue-600, .text-blue-500, .text-[#384877] { 
        color: rgb(var(--primary-rgb)) !important;
        font-weight: var(--font-weight-semibold);
      }
      .border-blue-500 {
        border-color: rgb(var(--primary-light)) !important;
      }

      /* Hover States */
      .hover\\:bg-blue-700:hover, .hover\\:bg-[#2c3b63]:hover {
        background: linear-gradient(135deg, rgb(var(--primary-dark)), rgb(37 99 235)) !important;
        box-shadow: 0 8px 16px rgb(var(--primary-rgb) / 0.3);
        transform: translateY(-1px);
        transition: all 0.2s ease;
      }

      /* Button Enhancements */
      button, .btn {
        font-weight: var(--font-weight-medium) !important;
        letter-spacing: -0.01em;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      }

      /* Card Enhancements */
      .bg-white {
        background: rgba(255, 255, 255, 0.95) !important;
        backdrop-filter: blur(10px);
        border: 1px solid rgb(var(--gray-200));
      }

      /* Accent Colors */
      .bg-purple-600, .bg-purple-500 {
        background: linear-gradient(135deg, rgb(var(--accent-purple)), rgb(124 58 237)) !important;
        box-shadow: 0 4px 12px rgb(var(--accent-purple) / 0.25);
      }
      .text-purple-600 {
        color: rgb(var(--accent-purple)) !important;
        font-weight: var(--font-weight-semibold);
      }

      /* Icon Enhancement */
      svg {
        stroke-width: 2;
        transition: all 0.2s ease;
      }

      /* Input Enhancements */
      input, textarea, select {
        font-weight: var(--font-weight-normal) !important;
        color: rgb(var(--gray-900)) !important;
        border-color: rgb(var(--gray-300)) !important;
      }
      input::placeholder, textarea::placeholder {
        color: rgb(var(--gray-400)) !important;
        font-weight: var(--font-weight-normal);
      }

      /* Badge Enhancements */
      .bg-blue-50 {
        background: rgb(var(--primary-ultra-light)) !important;
        border: 1px solid rgb(var(--primary-light));
      }
      .text-blue-700 {
        color: rgb(var(--primary-dark)) !important;
        font-weight: var(--font-weight-medium);
      }

      /* Soft Backgrounds with Better Contrast */
      .bg-slate-50, .bg-gray-50 {
        background: rgb(var(--gray-50)) !important;
      }
      .bg-slate-100, .bg-gray-100 {
        background: rgb(var(--gray-100)) !important;
      }

      /* Gradient Backgrounds */
      .bg-gradient-to-r, .bg-gradient-to-br {
        background: linear-gradient(135deg, rgb(var(--primary-rgb)), rgb(var(--accent-purple))) !important;
      }

      /* Shadow Utilities */
      .shadow-sm { box-shadow: var(--shadow-sm); }
      .shadow-md { box-shadow: var(--shadow-md); }
      .shadow-lg { box-shadow: var(--shadow-lg); }
      .shadow-xl { box-shadow: var(--shadow-xl); }

      /* Animation */
      @keyframes gentle-pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.8; }
      }

      /* Status Colors */
      .text-green-600 { color: rgb(var(--accent-green)) !important; }
      .text-orange-600 { color: rgb(var(--accent-orange)) !important; }
      .text-pink-600 { color: rgb(var(--accent-pink)) !important; }
      .bg-green-50 { background: rgb(220 252 231) !important; }
      .bg-orange-50 { background: rgb(255 247 237) !important; }
      .bg-pink-50 { background: rgb(253 242 248) !important; }
      `}</style>
        
        <AppSidebar setSearchOpen={setSearchOpen} setFeedbackOpen={setFeedbackOpen} />

        <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
        <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
        <main className="flex-1 flex flex-col bg-gradient-to-br from-gray-50 via-white to-gray-100/50 relative w-full overflow-hidden">
          <FloatingAssistantButton />
          <header className="bg-white/90 backdrop-blur-xl border-b border-gray-200/60 px-6 py-4 lg:hidden sticky top-0 z-10 shadow-sm">
            <div className="flex items-center gap-4">
              <SidebarTrigger className="hover:bg-gray-100 p-2 rounded-xl transition-all duration-200" />
              <h1 className="text-lg font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent tracking-tight">
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