import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { LayoutDashboard, ListTodo, Calendar, User, Bell, StickyNote, Users, Languages, Heart, ChevronLeft, BarChart3, Store } from "lucide-react";
// 旧版右下角助手已移除：统一由 App.jsx 的 AssistantWidget（机器人形象）提供入口
import { TranslationProvider, useTranslation } from "@/components/TranslationContext";
import MobileNavigation from "./components/mobile/MobileNavigation";
import { useOfflineManager } from "./components/offline/OfflineManager";
import { base44 } from "@/api/base44Client";
import { httpRequest } from "@/api/httpClient";
import { useQuery } from "@tanstack/react-query";
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
import CreditsBadge from "@/components/credits/CreditsBadge";
import { preloadPage } from "@/lib/pagePreload";
import xinzhanLogo from "./assets/xinzhan-logo.png";

// 首屏只加载应用壳；后台能力/弹窗按需加载，避免主包过大被网络中间层卡住
const PWAInstallPrompt = React.lazy(() => import("./components/pwa/PWAInstallPrompt"));
const PWAUpdateNotification = React.lazy(() => import("./components/pwa/PWAUpdateNotification"));
const NotificationManager = React.lazy(() => import("./components/notifications/NotificationManager"));
const PushNotificationPrompt = React.lazy(() => import("./components/notifications/PushNotificationPrompt"));
const GlobalTextTranslator = React.lazy(() => import("@/components/GlobalTextTranslator"));
const GeofenceTracker = React.lazy(() => import("./components/location/GeofenceTracker"));
const SentinelGeoWatcher = React.lazy(() => import("./components/location/SentinelGeoWatcher"));
const OnTheWayReminderHost = React.lazy(() => import("./components/location/OnTheWayReminderHost"));
const DeviceHeartbeat = React.lazy(() => import("./components/devices/DeviceHeartbeat"));
const FeedbackDialog = React.lazy(() => import("@/components/feedback/FeedbackDialog"));
const GlobalSearch = React.lazy(() => import("@/components/search/GlobalSearch"));

const getNavigationItems = (t) => [
  {
    title: t('today'),
    url: createPageUrl("Dashboard"),
    icon: LayoutDashboard,
    page: "Dashboard",
  },
  {
    title: t('tasks'),
    url: createPageUrl("Tasks"),
    icon: ListTodo,
    page: "Tasks",
  },
  {
    title: "搭子Store",
    url: createPageUrl("BuddyStore"),
    icon: Store,
    page: "BuddyStore",
  },
  {
    title: t('notes'),
    url: createPageUrl("Notes"),
    icon: StickyNote,
    page: "Notes",
  },
  {
    title: t('teams'),
    url: createPageUrl("Teams"),
    icon: Users,
    page: "Teams",
  },
  {
    title: t('myAccount'),
    url: createPageUrl("Account"),
    icon: User,
    page: "Account",
  },
  {
    title: t('notifications'),
    url: createPageUrl("Notifications"),
    icon: Bell,
    page: "Notifications",
  },
  {
    title: "数据看板",
    url: createPageUrl("AdminStats"),
    icon: BarChart3,
    page: "AdminStats",
  },
];

function AppSidebar({ setSearchOpen, setFeedbackOpen, onNavigate }) {
  const location = useLocation();
  const { setOpenMobile } = useSidebar();
  const { t, language, toggleLanguage, isAIMode, toggleAIMode } = useTranslation();
  const { user } = useAuth();
  // 未读 @ 提醒：收到 @ 通知时在「消息通知」旁点亮红点，读掉后自动消失
  const { data: mentionStatus } = useQuery({
    queryKey: ["notifications", "mention-unread"],
    queryFn: () => httpRequest("/api/notifications/mention-unread"),
    enabled: !!user?.id,
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
    staleTime: 10000,
  });
  const hasUnreadMention = Boolean(mentionStatus?.has_unread);
  const notificationUrl = createPageUrl("Notifications");
  const navigationItems = getNavigationItems(t).filter(
    (item) => item.title !== "数据看板" || user?.role === "admin"
  );

  const currentPath = normalizedPath(location.pathname).replace(/\/+$/, "") || "/";

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
                const isActive =
                  currentPath === item.url.toLowerCase().replace(/\/+$/, "");
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      className={`group relative mb-1 rounded-xl transition-[color,transform] duration-150 active:scale-[0.99] ${
                        isActive
                          ? 'text-[#384877]'
                          : 'text-stone-600 hover:text-stone-900'
                      }`}
                    >
                      <Link
                        to={item.url}
                        onMouseEnter={() => preloadPage(item.page)}
                        onFocus={() => preloadPage(item.page)}
                        aria-current={isActive ? "page" : undefined}
                        onClick={() => {
                          onNavigate?.();
                          handleMobileClick();
                        }}
                        className="flex min-h-[40px] items-center gap-3 px-4 py-2.5"
                      >
                        {/* 轻量级激活标记：左侧品牌色短竖线，不占空间 */}
                        <span
                          className={`absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-[#384877] transition-opacity ${
                            isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-30'
                          }`}
                        />
                        <item.icon className={`w-5 h-5 shrink-0 ${
                          isActive ? 'text-[#384877]' : 'text-stone-400 group-hover:text-stone-500'
                        }`} />
                        <span className={isActive ? "font-semibold" : "font-medium"}>{item.title}</span>
                        {item.url === notificationUrl && hasUnreadMention && (
                          <span className="ml-auto flex items-center" title="有未读的@提醒">
                            <span className="h-2 w-2 rounded-full bg-red-500" />
                            <span className="sr-only">有未读的@提醒</span>
                          </span>
                        )}
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
              className="group relative mb-1 rounded-xl text-stone-600 transition-[color,transform] duration-150 hover:text-stone-900 active:scale-[0.99] cursor-pointer"
            >
              <div className="flex items-center gap-3 px-4 py-3 w-full">
                <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-[#384877] opacity-0 transition-opacity group-hover:opacity-30" />
                <MessageSquarePlus className="w-5 h-5 text-stone-400 group-hover:text-stone-500" />
                <span className="font-medium">{t('feedback')}</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>

          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className={`group relative mb-1 rounded-xl transition-[color,transform] duration-150 active:scale-[0.99] ${
                location.pathname === createPageUrl("Trash")
                  ? 'text-[#384877]'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <Link
                to={createPageUrl("Trash")}
                onMouseEnter={() => preloadPage("Trash")}
                onFocus={() => preloadPage("Trash")}
                onClick={() => {
                  onNavigate?.();
                  handleMobileClick();
                }}
                className="flex min-h-[40px] items-center gap-3 px-4 py-2.5"
              >
                <span
                  className={`absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-[#384877] transition-opacity ${
                    location.pathname === createPageUrl("Trash") ? 'opacity-100' : 'opacity-0 group-hover:opacity-30'
                  }`}
                />
                <Trash2 className={`w-5 h-5 shrink-0 ${
                  currentPath === createPageUrl("Trash") ? 'text-[#384877]' : 'text-stone-400 group-hover:text-stone-500'
                }`} />
                <span className={location.pathname === createPageUrl("Trash") ? "font-semibold" : "font-medium"}>{t('trash')}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

// 手机端页眉标题：直接显示当前页面的名字，避免每个页面重复品牌名
const MOBILE_PAGE_TITLES = {
  "/": "首页",
  "/dashboard": "首页",
  "/tasks": "约定",
  "/notes": "心签",
  "/notifications": "通知",
  "/notificationsettings": "提醒设置",
  "/account": "我的",
  "/buddystore": "搭子Store",
  "/buddyspace": "搭子空间",
  "/collabspace": "协同空间",
  "/teams": "团队",
  "/trash": "回收站",
  "/knowledgebase": "知识库",
  "/heartsign": "心签",
  "/agentintro": "心栈助手",
  "/buddyclaim": "认领搭子",
  "/lockscreentodo": "锁屏约定",
  "/onboarding": "开始使用",
  "/pricing": "会员",
  "/adminstats": "数据看板",
  "/invitecollabpreview": "协同邀请",
};

const normalizedPath = (pathname) => String(pathname || "/").toLowerCase();

function MobileHeader() {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const path = normalizedPath(location.pathname);

  // 主导航页面：显示侧边栏按钮；其它子页面显示返回按钮
  const mainPaths = [
    "/",
    "/dashboard",
    "/tasks",
    "/notes",
    "/notifications",
    "/account",
  ];
  const isMainPage = mainPaths.indexOf(path) !== -1;
  const isGuestBuddyCollab =
    path === "/buddyspace" &&
    new URLSearchParams(location.search).get("guest") === "1";
  const title = MOBILE_PAGE_TITLES[path] || t('soulSentry');

  return (
    <header className="lg:hidden sticky top-0 z-30 w-full border-b border-stone-200/70 bg-white">
      {/* 不用 backdrop-blur：sticky 头 + 背景模糊会让 iOS 滚动时每帧重绘整个视口,是移动端滚动卡顿的主要来源 */}
      <div className="flex w-full min-h-[52px] items-center gap-2 px-3">
        {isMainPage ? (
          <SidebarTrigger className="hover:bg-stone-100 rounded-xl transition-all duration-200 min-w-[44px] min-h-[44px] flex items-center justify-center shrink-0" />
        ) : (
          <button
            type="button"
            onClick={() => (isGuestBuddyCollab ? navigate(createPageUrl("Tasks")) : navigate(-1))}
            aria-label={isGuestBuddyCollab ? "返回约定列表" : "返回"}
            className="hover:bg-stone-100 rounded-xl transition-all duration-200 min-w-[44px] min-h-[44px] flex items-center justify-center shrink-0"
          >
            <ChevronLeft className="w-5 h-5 text-stone-700" />
          </button>
        )}
        <h1 className="min-w-0 flex-1 truncate text-[15px] font-semibold text-stone-900">
          {title}
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
  const contentScrollRef = React.useRef(null);
  const scrollContentToTop = React.useCallback(function () {
    const el = contentScrollRef.current;
    if (el) el.scrollTo({ top: 0, behavior: "auto" });
  }, []);

  // 切换页面时回到顶部：否则从长页面点侧边栏进入新页面会停在旧滚动位置，
  // 看起来像“第一次点击没反应”。
  React.useEffect(function () {
    scrollContentToTop();
  }, [location.pathname, scrollContentToTop]);
  // 自带页头/底部导航的独立页面（协同空间、公开分享、邀请落地）：
  // 不再叠加全局手机壳，避免双页眉、双页脚挡内容
  const currentPath = normalizedPath(location.pathname);
  const isBareMobilePage =
    currentPath === "/collabspace" ||
    currentPath.startsWith("/share/") ||
    currentPath.startsWith("/invite/");
  // 搭子空间在手机端使用自己的场景化底部标签（今日/解题/协同…），不再叠加全局底部导航
  const hideGlobalMobileNav = currentPath === "/buddyspace";
  
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
    <SidebarProvider className="h-[100dvh] overflow-hidden">
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
        
        <AppSidebar
          setSearchOpen={setSearchOpen}
          setFeedbackOpen={setFeedbackOpen}
          onNavigate={scrollContentToTop}
        />

        <React.Suspense fallback={null}>
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
        </React.Suspense>

        {/* 离线状态提示 */}
        {!isOnline && (
          <div className="md:hidden fixed top-[52px] inset-x-0 z-40 bg-amber-500 text-white text-center py-2.5 text-sm font-medium flex items-center justify-center gap-2">
            <WifiOff className="w-4 h-4" /> 离线模式 {pendingSync > 0 && `· ${pendingSync} 项待同步`}
          </div>
        )}

        {/* 背景必须是纯色:半透明渐变做滚动容器底色会让 iOS 每帧重合成整个视口,造成滚动卡顿 */}
        <main
          className={`flex-1 min-h-0 flex flex-col bg-[#FAF9F7] relative w-full min-w-0 overflow-hidden ${
            isBareMobilePage || hideGlobalMobileNav ? "pb-0" : "pb-[calc(5rem_+_env(safe-area-inset-bottom))] md:pb-0"
          }`}
        >
          {!isBareMobilePage && <MobileHeader />}

          <div
            ref={contentScrollRef}
            className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain min-w-0 [scrollbar-gutter:stable]"
          >
            {children}
          </div>
          </main>

          {/* 移动端底部导航：独立页面（协同空间/分享/邀请）或搭子空间自带导航，不重复渲染 */}
          {!isBareMobilePage && !hideGlobalMobileNav && <MobileNavigation />}
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
