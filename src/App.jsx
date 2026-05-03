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
          toastOptions={{
            classNames: {
              toast: "group rounded-2xl border shadow-lg shadow-black/5 backdrop-blur-md px-4 py-3 flex items-center gap-3",
              title: "text-sm font-semibold leading-tight",
              description: "text-xs opacity-80",
              closeButton:
                "!left-auto !right-2 !top-1/2 !-translate-y-1/2 !w-6 !h-6 !rounded-full !bg-white/70 hover:!bg-white !border !border-black/5 !text-slate-500 hover:!text-slate-700 transition-all",
              success:
                "!bg-emerald-50/95 !border-emerald-200/70 !text-emerald-900 [&_[data-icon]]:!text-emerald-600",
              error:
                "!bg-rose-50/95 !border-rose-200/70 !text-rose-900 [&_[data-icon]]:!text-rose-600",
              warning:
                "!bg-amber-50/95 !border-amber-200/70 !text-amber-900 [&_[data-icon]]:!text-amber-600",
              info:
                "!bg-sky-50/95 !border-sky-200/70 !text-sky-900 [&_[data-icon]]:!text-sky-600",
            },
          }}
        />
        <VisualEditAgent />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App