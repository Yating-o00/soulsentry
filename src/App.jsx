import './App.css'
import { Toaster } from "@/components/ui/toaster"
import { Toaster as SonnerToaster } from "sonner"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import VisualEditAgent from '@/lib/VisualEditAgent'
import NavigationTracker from '@/lib/NavigationTracker'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import { setupIframeMessaging } from './lib/iframe-messaging';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;

setupIframeMessaging();

const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, isAuthenticated, navigateToLogin } = useAuth();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Redirect to login automatically
      navigateToLogin();
      return null;
    }
  }

  // Render the main app
  return (
    <LayoutWrapper currentPageName={mainPageKey}>
      <Routes>
        <Route path="/" element={<MainPage />} />
        {Object.entries(Pages).map(([path, Page]) => (
          <Route key={path} path={`/${path}`} element={<Page />} />
        ))}
        <Route path="*" element={<PageNotFound />} />
      </Routes>
    </LayoutWrapper>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <NavigationTracker />
          <AuthenticatedApp />
        </Router>
        <Toaster />
        <SonnerToaster
          position="top-center"
          closeButton
          offset={20}
          gap={10}
          duration={3500}
          toastOptions={{
            unstyled: false,
            classNames: {
              toast:
                "group !w-auto !max-w-[440px] !rounded-2xl !border !shadow-[0_8px_30px_-8px_rgba(15,23,42,0.18),0_2px_6px_-2px_rgba(15,23,42,0.08)] !backdrop-blur-xl !px-3.5 !py-3 !pr-10 !flex !items-center !gap-3 !font-sans",
              title: "!text-[13.5px] !font-semibold !leading-snug !tracking-tight",
              description: "!text-[12px] !opacity-75 !leading-relaxed !mt-0.5",
              icon: "!w-8 !h-8 !rounded-xl !flex !items-center !justify-center !shrink-0 !shadow-sm [&>svg]:!w-4 [&>svg]:!h-4",
              closeButton:
                "!left-auto !right-2.5 !top-1/2 !-translate-y-1/2 !w-6 !h-6 !rounded-full !bg-white/80 hover:!bg-white !border !border-black/[0.06] !text-slate-400 hover:!text-slate-700 !shadow-sm hover:!shadow !transition-all hover:!scale-105 active:!scale-95",
              default:
                "!bg-white/95 !border-slate-200/80 !text-slate-900 [&_[data-icon]]:!bg-slate-100 [&_[data-icon]]:!text-slate-600",
              success:
                "!bg-gradient-to-br !from-emerald-50/98 !to-white/95 !border-emerald-200/60 !text-emerald-950 [&_[data-icon]]:!bg-emerald-100 [&_[data-icon]]:!text-emerald-600",
              error:
                "!bg-gradient-to-br !from-rose-50/98 !to-white/95 !border-rose-200/60 !text-rose-950 [&_[data-icon]]:!bg-rose-100 [&_[data-icon]]:!text-rose-600",
              warning:
                "!bg-gradient-to-br !from-amber-50/98 !to-white/95 !border-amber-200/60 !text-amber-950 [&_[data-icon]]:!bg-amber-100 [&_[data-icon]]:!text-amber-600",
              info:
                "!bg-gradient-to-br !from-sky-50/98 !to-white/95 !border-sky-200/60 !text-sky-950 [&_[data-icon]]:!bg-sky-100 [&_[data-icon]]:!text-sky-600",
              loading:
                "!bg-white/95 !border-slate-200/80 !text-slate-900 [&_[data-icon]]:!bg-slate-100 [&_[data-icon]]:!text-slate-600",
              actionButton:
                "!bg-slate-900 !text-white !rounded-lg !px-3 !py-1.5 !text-xs !font-medium hover:!bg-slate-700 !transition-colors",
              cancelButton:
                "!bg-slate-100 !text-slate-600 !rounded-lg !px-3 !py-1.5 !text-xs !font-medium hover:!bg-slate-200 !transition-colors",
            },
          }}
        />
        <VisualEditAgent />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App