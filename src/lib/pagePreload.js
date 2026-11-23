// 页面模块预加载：侧边栏 hover/focus 时提前拉取对应路由的代码块，
// 点击后立刻进入渲染，避免首次点击要等 1 秒以上才看到页面变化。
// 这里的 import 路径与 pages.config.js 中的 React.lazy 保持一致，Vite 会自动复用同一 chunk。
const LOADERS = {
  Dashboard: () => import("@/pages/Dashboard"),
  Tasks: () => import("@/pages/Tasks"),
  BuddyStore: () => import("@/pages/BuddyStore"),
  Notes: () => import("@/pages/Notes"),
  Teams: () => import("@/pages/Teams"),
  Account: () => import("@/pages/Account"),
  Notifications: () => import("@/pages/Notifications"),
  NotificationSettings: () => import("@/pages/NotificationSettings"),
  AdminStats: () => import("@/pages/AdminStats"),
  Trash: () => import("@/pages/Trash"),
  KnowledgeBase: () => import("@/pages/KnowledgeBase"),
};

const warmed = new Set();

export function preloadPage(page) {
  if (!page || warmed.has(page)) return;
  const loader = LOADERS[page];
  if (!loader) return;
  warmed.add(page);
  loader().catch(() => {
    // 预加载失败不影响正常点击时的懒加载
    warmed.delete(page);
  });
}
