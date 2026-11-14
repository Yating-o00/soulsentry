import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { LayoutDashboard, ListTodo, Calendar, User, Bell, StickyNote, Users, Languages, Heart, ChevronLeft, BarChart3, Store } from "lucide-react";
// 旧版右下角助手已移除：统一由 App.jsx 的 AssistantWidget（机器人形象）提供入口
import { TranslationProvider, useTranslation } from "@/components/TranslationContext";
import MobileNavigation from "./components/mobile/MobileNavigation";
import { useOfflineManager } from "./components/offline/OfflineManager";
import PWAInstallPrompt from "./components/pwa/PWAInstallPrompt";
import PWAUpdateNotification from "./components/pwa/PWAUpdateNotification";
import NotificationManager from "./components/notifications/NotificationManager";
import PushNotificationPrompt from "./components/notifications/PushNotificationPrompt";
import GlobalTextTranslator from "@/components/GlobalTextTranslator";
import GeofenceTracker from "./components/location/GeofenceTracker";
import SentinelGeoWatcher from "./components/location/SentinelGeoWatcher";
import OnTheWayReminderHost from "./components/location/OnTheWayReminderHost";
import OverdueFeedbackHost from "./components/feedback/OverdueFeedbackHost";
import DeviceHeartbeat from "./components/devices/DeviceHeartbeat";
import { base44 } from "@/api/base44Client";
import { getCachedUser } from "@/lib/userCache";
import { useAuth } from "@/lib/AuthContext";
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
import { Trash2, MessageSquarePlus, Search, WifiOff } from "lucide-react";
import FeedbackDialog from "@/components/feedback/FeedbackDialog";
import GlobalSearch from "@/components/search/GlobalSearch";
import CreditsBadge from "@/components/credits/CreditsBadge";
import xinzhanLogo from "./assets/xinzhan-logo.png";

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
    title: "搭子Store",
    url: createPageUrl("BuddyStore"),
    icon: Store,
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
  {
    title: "数据看板",
    url: createPageUrl("AdminStats"),
    icon: BarChart3,
  },
];

function AppSidebar({ setSearchOpen, setFeedbackOpen }) {
  const location = useLocation();
  const { setOpenMobile } = useSidebar();
  const { t, language, toggleLanguage, isAIMode, toggleAIMode } = useTranslation();
  const { user } = useAuth();
  const navigationItems = getNavigationItems(t).filter(
    (item) => item.title !== "数据看板" || user?.role === "admin"
  );

  const handleMobileClick = () => {
    setOpenMobile(false);
  };

  return (
    <Sidebar className="border-r border-stone-200/60 bg-white">
      <SidebarHeader className="border-b border-stone-200/60 p-6">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="h-10 w-10 rounded-xl bg-[#384877] flex items-center justify-center flex-shrink-0 overflow-hidden">
              <img
                src={xinzhanLogo}
                alt={t('soulSentry')}
                className="w-full h-full object-cover mix-blend-screen"
              />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold text-lg text-stone-900 whitespace-nowrap">
                {t('soulSentry')}
              </h2>
              <p className="text-xs text-stone-400 truncate">{t('tagline')}</p>
            </div>
          </div>

          <button
            onClick={toggleLanguage}
            className="relative h-7 w-7 rounded-full bg-white border border-stone-200 hover:border-stone-300 flex items-center justify-center transition-colors flex-shrink-0"
            title={language === 'zh' ? '切换到英文 / Switch to English' : '切换到中文 / Switch to Chinese'}
          >
            <Languages className="w-3.5 h-3.5 text-stone-500" />
            <span className="absolute -bottom-1 -right-1 text-[8px] font-bold px-1 py-0 rounded-full bg-[#384877] text-white leading-tight">
              {language === 'zh' ? '中' : 'EN'}
            </span>
          </button>
        </div>
      </SidebarHeader>

      <SidebarContent className="p-3">
        <div className="px-2 mb-3">
          <button 
            onClick={() => {
              setSearchOpen(true);
              handleMobileClick();
            }}
            className="w-full flex items-center gap-2 px-3 py-2.5 bg-stone-100/70 hover:bg-stone-100 rounded-xl text-stone-500 text-sm transition-colors border border-stone-200/60"
          >
            <Search className="w-4 h-4" />
            <span>搜索...</span>
            <div className="ml-auto flex items-center gap-1">
              <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-stone-300 bg-white px-1.5 font-mono text-[10px] font-medium text-stone-500 opacity-100">
                <span className="text-xs">⌘</span>K
              </kbd>
            </div>
          </button>
        </div>
        <div className="px-2 mb-3">
          <CreditsBadge />
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
                      className={`transition-colors duration-200 rounded-xl mb-1 ${
                        isActive 
                          ? 'bg-stone-100 text-stone-900' 
                          : 'hover:bg-stone-100/70 text-stone-600'
                      }`}
                    >
                      <Link 
                        to={item.url} 
                        onClick={handleMobileClick}
                        className="flex items-center gap-3 px-4 py-3"
                      >
                        <item.icon className={`w-5 h-5 ${
                          isActive ? 'text-[#384877]' : 'text-stone-400'
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
      <SidebarFooter className="p-3 border-t border-stone-200/60">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton 
              onClick={() => {
                setFeedbackOpen(true);
                handleMobileClick();
              }}
              className="transition-colors duration-200 rounded-xl mb-1 hover:bg-stone-100/70 text-stone-600 cursor-pointer"
            >
              <div className="flex items-center gap-3 px-4 py-3 w-full">
                <MessageSquarePlus className="w-5 h-5 text-stone-400" />
                <span className="font-medium">{t('feedback')}</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>

          <SidebarMenuItem>
            <SidebarMenuButton 
              asChild 
              className={`transition-colors duration-200 rounded-xl mb-1 ${
                location.pathname === createPageUrl("Trash") 
                  ? 'bg-stone-100 text-stone-900' 
                  : 'hover:bg-stone-100/70 text-stone-600'
              }`}
            >
              <Link 
                to={createPageUrl("Trash")} 
                onClick={handleMobileClick}
                className="flex items-center gap-3 px-4 py-3"
              >
                <Trash2 className={`w-5 h-5 ${
                  location.pathname === createPageUrl("Trash") ? 'text-stone-900' : 'text-stone-400'
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

function MobileHeader() {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();

  // 主导航页面：显示侧边栏按钮；其它子页面显示返回按钮
  const mainPaths = [
    createPageUrl("Dashboard"),
    createPageUrl("Tasks"),
    createPageUrl("Notes"),
    "/"
  ];
  const isMainPage = mainPaths.indexOf(location.pathname) !== -1;

  return (
    <header className="bg-white border-b border-slate-200 px-4 py-3 lg:hidden sticky top-0 z-10 min-h-[56px]">
      {/* 不用 backdrop-blur：sticky 头 + 背景模糊会让 iOS 滚动时每帧重绘整个视口,是移动端滚动卡顿的主要来源 */}
      <div className="flex items-center gap-3">
        {isMainPage ? (
          <SidebarTrigger className="hover:bg-slate-100 p-2.5 rounded-xl transition-all duration-200 min-w-[44px] min-h-[44px] flex items-center justify-center" />
        ) : (
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="返回"
            className="hover:bg-slate-100 p-2.5 rounded-xl transition-all duration-200 min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            <ChevronLeft className="w-5 h-5 text-slate-700" />
          </button>
        )}
        <h1 className="text-base font-semibold text-stone-900">
          {t('soulSentry')}
        </h1>
      </div>
    </header>
  );
}

function LayoutContent({ children }) {
  const location = useLocation();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const { t } = useTranslation();
  const { isOnline, pendingSync } = useOfflineManager();
  
  // Fetch user theme preferences (深色模式已移除，仅保留主色与字号)
  const [theme, setTheme] = useState({
    primary: "#384877",
    fontSize: "medium"
  });

  React.useEffect(function() {
    var fetchTheme = function() {
        getCachedUser().then(function(user) {
            var prefs = (user && user.theme_preferences) || {};
            setTheme({
                primary: prefs.primary_color || "#384877",
                fontSize: prefs.font_size || "medium"
            });
        }).catch(function(e) {
            console.error("Failed to load theme", e);
        });
    };
    fetchTheme();
    var handleThemeChange = function(e) {
        if (e.detail) setTheme(function(prev) { return Object.assign({}, prev, e.detail); });
    };
    window.addEventListener('theme-change', handleThemeChange);
    return function() { window.removeEventListener('theme-change', handleThemeChange); };
  }, []);

  React.useEffect(function() {
    var down = function(e) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSearchOpen(function(open) { return !open; });
      }
    };
    document.addEventListener("keydown", down);
    return function() { document.removeEventListener("keydown", down); };
  }, []);

  return (
    <SidebarProvider>
      <style>{`
      :root {
        /* Main Primary Colors - Tech Blue */
        --primary-rgb: ${(theme.primary && typeof theme.primary === 'string' && theme.primary.length >= 7) ? parseInt(theme.primary.substring(1, 3), 16) : 56} ${(theme.primary && typeof theme.primary === 'string' && theme.primary.length >= 7) ? parseInt(theme.primary.substring(3, 5), 16) : 72} ${(theme.primary && typeof theme.primary === 'string' && theme.primary.length >= 7) ? parseInt(theme.primary.substring(5, 7), 16) : 119};
        --primary-main: var(--primary-rgb);      

        /* Font Size Scaling */
        --base-font-size: ${theme.fontSize === 'small' ? '14px' : theme.fontSize === 'large' ? '18px' : '16px'};
        --scale-factor: ${theme.fontSize === 'small' ? '0.875' : theme.fontSize === 'large' ? '1.125' : '1'};

        /* Neutral/Background Colors */
        --bg-white: 255 255 255;
        --bg-grey-minimal: 249 250 251;
        --text-dark: 34 34 34;
        --text-muted: 100 116 139;

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
        <PWAInstallPrompt />
        <PWAUpdateNotification />
        <NotificationManager />
        <PushNotificationPrompt />
        <GlobalTextTranslator />
        <GeofenceTracker />
        <SentinelGeoWatcher />
        <OnTheWayReminderHost />
        <DeviceHeartbeat />
        {/* <OverdueFeedbackHost />  暂时禁用：避免反馈窗口打扰用户 */}

        {/* 离线状态提示 */}
        {!isOnline && (
          <div className="md:hidden fixed top-0 inset-x-0 z-50 bg-amber-500 text-white text-center py-3 text-base font-medium flex items-center justify-center gap-2">
            <WifiOff className="w-4 h-4" /> 离线模式 {pendingSync > 0 && `· ${pendingSync} 项待同步`}
          </div>
        )}

        {/* 背景必须是纯色:半透明渐变做滚动容器底色会让 iOS 每帧重合成整个视口,造成滚动卡顿 */}
        <main className="flex-1 flex flex-col bg-[#FAF9F7] relative w-full overflow-hidden pb-20 md:pb-0">
          <MobileHeader />

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
  const location = useLocation();
  const isStandalonePricingPage = [createPageUrl("Pricing"), "/Pricing"].includes(location.pathname);

      return (
        <TranslationProvider>
      {isStandalonePricingPage ? (
        children
      ) : (
        <LayoutContent>{children}</LayoutContent>
      )}
        </TranslationProvider>
      );
    }
