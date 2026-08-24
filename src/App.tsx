import { lazy, Suspense, useEffect } from "react";
import {
  createBrowserRouter,
  Navigate,
  RouterProvider,
  Outlet,
  useLocation,
  useParams,
} from "react-router-dom";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { HelmetProvider } from "react-helmet-async";
import ErrorBoundary from "./components/ErrorBoundary";
import RouteErrorBoundary from "./components/RouteErrorBoundary";
import PlayerErrorBoundary from "./components/PlayerErrorBoundary";
import ProtectedRoute from "./components/ProtectedRoute";
import { OnboardingGuard, OnboardingBlockGuard } from "./components/OnboardingGuard";
import { SubscriptionGuard } from "./components/SubscriptionGuard";
import { CheckInVisibilityGuard } from "./components/CheckInVisibilityGuard";
import { PushNotificationProvider, PushNotificationActionHandler } from "./components/PushNotificationProvider";
import { AuthProvider } from "./hooks/useAuth";
import RelocationPromptBanner from "./components/profile/RelocationPromptBanner";
import { ImpersonationProvider } from "./hooks/useImpersonation";
import ImpersonationBanner from "./components/admin/ImpersonationBanner";
import {
  ensureTravelMonitoringIfAuthorized,
  startTimezoneWatcher,
  persistPermissionStatus,
} from "./services/travelStateService";
import { useAuth } from "./hooks/useAuth";
import { isAppleCalendarSupported, onAppleCalendarStoreChanged, verifyAppleCalendarPermission } from "./utils/appleCalendar";
import { isIosNativeShell } from "./config/purchasePlatform";
import { syncAppleCalendarToBackend } from "./services/appleCalendarSync";
import { recordAppOpen } from "./services/appReview";
import DelayedFallback from "./components/ui/delayed-fallback";
import RouteSkeleton from "./components/ui/route-skeleton";
// Lazy load pages for code splitting
const Front = lazy(() => import("./pages/Front"));
const Signup = lazy(() => import("./pages/Signup"));
const Login = lazy(() => import("./pages/Login"));
const DailyCheckIn = lazy(() => import("./pages/DailyCheckIn"));
const ExecutiveHome = lazy(() => import("./pages/ExecutiveHome"));
const PlanPage = lazy(() => import("./pages/PlanPage"));
const NudgeSettings = lazy(() => import("./pages/NudgeSettings"));
const NudgeSimulator = lazy(() => import("./pages/NudgeSimulator"));
const RecalibrateMode = lazy(() => import("./pages/RecalibrateMode"));
const SoundscapePlayer = lazy(() => import("./pages/SoundscapePlayer"));
const GuidedPracticePlayer = lazy(() => import("./pages/GuidedPracticePlayer"));
const MicroPracticePlayer = lazy(() => import("./pages/MicroPracticePlayer"));
const MicroPracticePlayerCards = lazy(() => import("./pages/MicroPracticePlayerCards"));
const Privacy = lazy(() => import("./pages/Privacy"));
const Terms = lazy(() => import("./pages/Terms"));
const PoweredByAI = lazy(() => import("./pages/PoweredByAI"));
const SelfMasteryCoach = lazy(() => import("./pages/SelfMasteryCoach"));
const Insights = lazy(() => import("./pages/Insights"));
const InsightDetail = lazy(() => import("./pages/InsightDetail"));
const Profile = lazy(() => import("./pages/Profile"));
const ConnectedData = lazy(() => import("./pages/ConnectedData"));
const Refer = lazy(() => import("./pages/Refer"));
const JoinPage = lazy(() => import("./pages/JoinPage"));
const CheckInDetail = lazy(() => import("./pages/CheckInDetail"));

// Admin Console (desktop-only, allowlisted emails). Server enforcement lives
// in supabase/functions/_shared/admin-guard.ts.
const AdminRoute = lazy(() => import("./components/admin/AdminRoute"));
const AdminLayout = lazy(() => import("./components/admin/AdminLayout"));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const AdminUsers = lazy(() => import("./pages/admin/AdminUsers"));
const AdminUserDetail = lazy(() => import("./pages/admin/AdminUserDetail"));
const AdminJobs = lazy(() => import("./pages/admin/AdminJobs"));
const AdminExecutiveHomeAudit = lazy(() => import("./pages/admin/AdminExecutiveHomeAudit"));
const AdminErrorLogs = lazy(() => import("./pages/admin/AdminErrorLogs"));
const AdminNotifications = lazy(() => import("./pages/admin/AdminNotifications"));

// Force a full remount of player components when the :id param changes so per-practice
// state (carousel position, audio progress, view stage, etc.) NEVER leaks between
// practices in a multi-practice queue.
const KeyByParamId = ({ children }: { children: React.ReactNode }) => {
  const { id } = useParams<{ id: string }>();
  return <div key={id || "no-id"} className="contents">{children}</div>;
};

// Recalibrate outcome pages
const PowerUpOutcomePage = lazy(() => import("./pages/recalibrate/PowerUpOutcomePage"));
const PauseOutcomePage = lazy(() => import("./pages/recalibrate/PauseOutcomePage"));
const PresenceOutcomePage = lazy(() => import("./pages/recalibrate/PresenceOutcomePage"));

// Onboarding pages
const OnboardingFlow = lazy(() => import("./pages/onboarding/OnboardingFlow"));
const StageUSPIntro = lazy(() => import("./pages/onboarding/stages/StageUSPIntro"));
const Stage6Payment = lazy(() => import("./pages/onboarding/stages/Stage6Payment"));
const AuthCallback = lazy(() => import("./pages/AuthCallback"));
const OAuthDone = lazy(() => import("./pages/OAuthDone"));

// v8 onboarding flow (replaces legacy questionnaire for new users)
const StageLeadershipContext = lazy(() => import("./pages/onboarding/stages/v8/StageLeadershipContext"));
const StageCognitiveLoad = lazy(() => import("./pages/onboarding/stages/v8/StageCognitiveLoad"));
const StageProtectGoals = lazy(() => import("./pages/onboarding/stages/v8/StageProtectGoals"));
const StageBriefPrefs = lazy(() => import("./pages/onboarding/stages/v8/StageBriefPrefs"));
const StagePermissions = lazy(() => import("./pages/onboarding/stages/v8/StagePermissions"));
const StageDone = lazy(() => import("./pages/onboarding/stages/v8/StageDone"));

// Loading fallback — silent for fast (<3s) lazy-load transitions, then falls
// back to a single generic loader. Page-specific loaders (Brief, Plan,
// Insights, Onboarding Results) own their own visible loading UI.
const LoadingFallback = () => <DelayedFallback />;

// Global scroll-to-top on every route change
const ScrollToTop = () => {
  const { pathname } = useLocation();
  useEffect(() => {
    const resetScroll = () => {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      document.scrollingElement?.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
      document.querySelectorAll<HTMLElement>('[data-scroll-container], [data-sidebar-inset]').forEach((el) => {
        el.scrollTop = 0;
        el.scrollLeft = 0;
      });
    };

    resetScroll();
    const frame = requestAnimationFrame(() => {
      resetScroll();
      requestAnimationFrame(resetScroll);
    });
    const timeout = window.setTimeout(resetScroll, 250);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [pathname]);
  return null;
};

// App-wide travel watcher: starts the JS timezone watcher once, ensures
// native iOS monitoring is armed if already authorized, and re-syncs on
// Capacitor app resume so a Settings round-trip is reflected immediately.
const TravelWatcher = () => {
  useEffect(() => {
    const sync = () => {
      void ensureTravelMonitoringIfAuthorized();
      void persistPermissionStatus();
    };
    sync();
    // Track engagement sessions for the native in-app rating prompt.
    // Counted once per cold start and once per foreground resume (throttled
    // internally to at most one increment per 6h).
    recordAppOpen();
    const stopTz = startTimezoneWatcher();

    let removeAppListener: (() => void) | undefined;
    void (async () => {
      try {
        const { App } = await import('@capacitor/app');
        const handle = await App.addListener('appStateChange', ({ isActive }) => {
          if (isActive) {
            sync();
            recordAppOpen();
          }
        });
        removeAppListener = () => { void handle.remove(); };
      } catch { /* web: no-op */ }
    })();

    return () => { stopTz(); removeAppListener?.(); };
  }, []);
  return null;
};

const AppleCalendarWatcher = () => {
  return <AppleCalendarWatcherInner />;
};

/**
 * Apple IAP entitlement watcher.
 *
 * StoreKit entitlements are re-verified server-side on cold start and on every
 * foreground resume, so renewals, expirations, refunds and revocations
 * converge without the user doing anything. No-op on web and Android.
 */
const IapEntitlementWatcher = () => {
  const { user, refreshProfile } = useAuth();

  useEffect(() => {
    if (!user?.id || !isIosNativeShell()) return;

    let cancelled = false;
    const sync = async () => {
      const { refreshIapEntitlements } = await import('@/services/iap');
      const { entitled } = await refreshIapEntitlements();
      if (!cancelled && entitled) await refreshProfile().catch(() => {});
    };
    void sync();

    let removeAppListener: (() => void) | undefined;
    let removeTxListener: (() => void) | undefined;
    void (async () => {
      try {
        const { App } = await import('@capacitor/app');
        const handle = await App.addListener('appStateChange', ({ isActive }) => {
          if (isActive) void sync();
        });
        removeAppListener = () => { void handle.remove(); };
      } catch { /* web: no-op */ }
      try {
        const { onIapTransactionUpdate } = await import('@/services/iap');
        removeTxListener = await onIapTransactionUpdate(() => {
          void refreshProfile().catch(() => {});
        });
      } catch { /* no-op */ }
    })();

    return () => {
      cancelled = true;
      removeAppListener?.();
      removeTxListener?.();
    };
  }, [user?.id, refreshProfile]);

  return null;
};

const AppleCalendarWatcherInner = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!user?.id || !isAppleCalendarSupported()) return;

    let cancelled = false;
    let debounce: ReturnType<typeof setTimeout> | null = null;
    let removeStoreListener: (() => void) | null = null;
    let removeResumeListener: (() => void) | null = null;

    const invalidateAppleQueries = () => {
      queryClient.invalidateQueries({ queryKey: ['outer-readiness'] });
      queryClient.invalidateQueries({ queryKey: ['mrs-weekly-delta'] });
    };

    const syncNow = async (reason: string) => {
      if (cancelled) return;
      const permissionGranted = await verifyAppleCalendarPermission();
      console.log('[AppleCalendarWatcher] sync requested', { reason, permissionGranted });
      if (!permissionGranted || cancelled) return;
      const result = await syncAppleCalendarToBackend({ reason });
      console.log('[AppleCalendarWatcher] sync result', { reason, result });
      if (!cancelled && result.success) {
        invalidateAppleQueries();
      }
    };

    void syncNow('app_launch');

    void onAppleCalendarStoreChanged(() => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => { void syncNow('eventkit_change'); }, 1200);
    }).then((unsub) => {
      if (cancelled) {
        unsub();
      } else {
        removeStoreListener = unsub;
      }
    }).catch((err) => {
      console.warn('[AppleCalendarWatcher] store listener registration failed:', err);
    });

    void (async () => {
      try {
        const { App } = await import('@capacitor/app');
        const handle = await App.addListener('appStateChange', ({ isActive }) => {
          if (isActive) void syncNow('app_resume');
        });
        if (cancelled) {
          void handle.remove();
        } else {
          removeResumeListener = () => { void handle.remove(); };
        }
      } catch {
        // web/no-op
      }
    })();

    return () => {
      cancelled = true;
      if (debounce) clearTimeout(debounce);
      removeStoreListener?.();
      removeResumeListener?.();
    };
  }, [queryClient, user?.id]);

  return null;
};

import FloatingPillNav from "./components/navigation/FloatingPillNav";

// Bottom pill nav is only shown on core app destinations after the executive home entry point.
const PILL_NAV_VISIBLE_ROUTES = [
  '/executive-home',
  '/plan',
  '/daily-check-in',
  '/check-in-detail',
  '/recalibrate',
  '/insights',
  '/profile',
  '/connected-data',
  '/refer',
  '/nudge-settings',
  '/nudge-simulator',
];

const matchesRoutePrefix = (pathname: string, route: string) => (
  pathname === route || pathname.startsWith(`${route}/`)
);

// Simple layout wrapper with push notification handler
const Layout = () => {
  const { pathname } = useLocation();
  const showPillNav = PILL_NAV_VISIBLE_ROUTES.some((route) => matchesRoutePrefix(pathname, route));

  return (
    <AuthProvider>
      <ImpersonationProvider>
        <ImpersonationBanner />
        <RelocationPromptBanner />
        <ScrollToTop />
        <TravelWatcher />
        <AppleCalendarWatcher />
        <IapEntitlementWatcher />
        <PushNotificationProvider />
        <PushNotificationActionHandler />
        {showPillNav && <FloatingPillNav />}
        <Outlet />
      </ImpersonationProvider>
    </AuthProvider>
  );
};

const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        index: true,
        element: <Suspense fallback={<LoadingFallback />}><Front /></Suspense>,
      },
      {
        path: "signup",
        element: <Suspense fallback={<LoadingFallback />}><Signup /></Suspense>,
      },
      {
        path: "login",
        element: <Suspense fallback={<LoadingFallback />}><Login /></Suspense>,
      },
      {
        path: "callback",
        element: <Suspense fallback={<LoadingFallback />}><AuthCallback /></Suspense>,
      },
      {
        path: "daily-check-in",
        element: <Suspense fallback={<LoadingFallback />}><ProtectedRoute><OnboardingGuard><SubscriptionGuard><CheckInVisibilityGuard page="daily-check-in"><DailyCheckIn /></CheckInVisibilityGuard></SubscriptionGuard></OnboardingGuard></ProtectedRoute></Suspense>,
      },
      {
        path: "executive-home",
        element: <Suspense fallback={<RouteSkeleton />}><ProtectedRoute><OnboardingGuard><SubscriptionGuard><ExecutiveHome /></SubscriptionGuard></OnboardingGuard></ProtectedRoute></Suspense>,
      },
      {
        path: "coach",
        element: <Suspense fallback={<LoadingFallback />}><ProtectedRoute><OnboardingGuard><SubscriptionGuard><SelfMasteryCoach /></SubscriptionGuard></OnboardingGuard></ProtectedRoute></Suspense>,
      },
      {
        path: "plan",
        element: <Suspense fallback={<RouteSkeleton />}><ProtectedRoute><OnboardingGuard><SubscriptionGuard><PlanPage /></SubscriptionGuard></OnboardingGuard></ProtectedRoute></Suspense>,
      },
      {
        path: "week-ahead",
        element: <Navigate to="/plan" replace />,
      },
      {
        path: "insights",
        element: <Suspense fallback={<RouteSkeleton />}><ProtectedRoute><OnboardingGuard><SubscriptionGuard><Insights /></SubscriptionGuard></OnboardingGuard></ProtectedRoute></Suspense>,
      },
      {
        path: "insights/:cardId",
        element: <Suspense fallback={<RouteSkeleton />}><ProtectedRoute><OnboardingGuard><SubscriptionGuard><InsightDetail /></SubscriptionGuard></OnboardingGuard></ProtectedRoute></Suspense>,
      },
      {
        path: "profile",
        element: <Suspense fallback={<LoadingFallback />}><ProtectedRoute><OnboardingGuard><Profile /></OnboardingGuard></ProtectedRoute></Suspense>,
      },
      {
        path: "connected-data",
        element: <Suspense fallback={<LoadingFallback />}><ProtectedRoute><OnboardingGuard><SubscriptionGuard><ConnectedData /></SubscriptionGuard></OnboardingGuard></ProtectedRoute></Suspense>,
      },
      {
        path: "check-in-detail",
        element: <Suspense fallback={<LoadingFallback />}><ProtectedRoute><OnboardingGuard><SubscriptionGuard><CheckInVisibilityGuard page="check-in-detail"><CheckInDetail /></CheckInVisibilityGuard></SubscriptionGuard></OnboardingGuard></ProtectedRoute></Suspense>,
      },
      {
        path: "refer",
        element: <Suspense fallback={<LoadingFallback />}><ProtectedRoute><OnboardingGuard><SubscriptionGuard><Refer /></SubscriptionGuard></OnboardingGuard></ProtectedRoute></Suspense>,
      },
      {
        path: "join/:code",
        element: <Suspense fallback={<LoadingFallback />}><JoinPage /></Suspense>,
      },
      {
        path: "recalibrate",
        element: <Suspense fallback={<LoadingFallback />}><ProtectedRoute><OnboardingGuard><SubscriptionGuard><RecalibrateMode /></SubscriptionGuard></OnboardingGuard></ProtectedRoute></Suspense>,
        children: [
          {
            path: "power-up",
            element: <Suspense fallback={<LoadingFallback />}><PowerUpOutcomePage /></Suspense>,
          },
          {
            path: "pause",
            element: <Suspense fallback={<LoadingFallback />}><PauseOutcomePage /></Suspense>,
          },
          {
            path: "presence",
            element: <Suspense fallback={<LoadingFallback />}><PresenceOutcomePage /></Suspense>,
          },
        ],
      },
      {
        path: "nudge-settings",
        element: <Suspense fallback={<LoadingFallback />}><ProtectedRoute><OnboardingGuard><SubscriptionGuard><NudgeSettings /></SubscriptionGuard></OnboardingGuard></ProtectedRoute></Suspense>,
      },
      {
        path: "nudge-simulator",
        element: <Suspense fallback={<LoadingFallback />}><ProtectedRoute><OnboardingGuard><SubscriptionGuard><NudgeSimulator /></SubscriptionGuard></OnboardingGuard></ProtectedRoute></Suspense>,
      },
      {
        path: "soundscapes/:id",
        element: <Suspense fallback={<LoadingFallback />}><ProtectedRoute><OnboardingGuard><SubscriptionGuard><KeyByParamId><PlayerErrorBoundary returnPath="/recalibrate"><SoundscapePlayer /></PlayerErrorBoundary></KeyByParamId></SubscriptionGuard></OnboardingGuard></ProtectedRoute></Suspense>,
      },
      {
        path: "guided-practices/:id",
        element: <Suspense fallback={<LoadingFallback />}><ProtectedRoute><OnboardingGuard><SubscriptionGuard><KeyByParamId><PlayerErrorBoundary returnPath="/recalibrate"><GuidedPracticePlayer /></PlayerErrorBoundary></KeyByParamId></SubscriptionGuard></OnboardingGuard></ProtectedRoute></Suspense>,
      },
      {
        path: "micro-practice/:id",
        element: <Suspense fallback={<LoadingFallback />}><ProtectedRoute><OnboardingGuard><SubscriptionGuard><KeyByParamId><PlayerErrorBoundary returnPath="/recalibrate"><MicroPracticePlayer /></PlayerErrorBoundary></KeyByParamId></SubscriptionGuard></OnboardingGuard></ProtectedRoute></Suspense>,
      },
      {
        path: "micro-practice/:id/cards",
        element: <Suspense fallback={<LoadingFallback />}><ProtectedRoute><OnboardingGuard><SubscriptionGuard><KeyByParamId><PlayerErrorBoundary returnPath="/recalibrate"><MicroPracticePlayerCards /></PlayerErrorBoundary></KeyByParamId></SubscriptionGuard></OnboardingGuard></ProtectedRoute></Suspense>,
      },
      {
        path: "upgrade",
        element: <Suspense fallback={<LoadingFallback />}><ProtectedRoute><Stage6Payment /></ProtectedRoute></Suspense>,
      },
      {
        path: "privacy",
        element: <Suspense fallback={<LoadingFallback />}><Privacy /></Suspense>,
      },
      {
        path: "terms",
        element: <Suspense fallback={<LoadingFallback />}><Terms /></Suspense>,
      },
      {
        path: "powered-by-ai",
        element: <Suspense fallback={<LoadingFallback />}><PoweredByAI /></Suspense>,
      },
      {
        path: "oauth-done",
        element: <Suspense fallback={<LoadingFallback />}><OAuthDone /></Suspense>,
      },
      {
        path: "onboarding",
        element: <Suspense fallback={<LoadingFallback />}><OnboardingBlockGuard><OnboardingFlow /></OnboardingBlockGuard></Suspense>,
        children: [
          { index: true, element: <Navigate to="/onboarding/app-intro" replace /> },
          { path: "identity", element: <Navigate to="/onboarding/app-intro" replace /> },
          { path: "emotional-awareness", element: <Navigate to="/onboarding/app-intro" replace /> },
          { path: "stress-response", element: <Navigate to="/onboarding/app-intro" replace /> },
          { path: "recovery-patterns", element: <Navigate to="/onboarding/app-intro" replace /> },
          { path: "mental-clarity", element: <Navigate to="/onboarding/app-intro" replace /> },
          { path: "growth-intention", element: <Navigate to="/onboarding/app-intro" replace /> },
          { path: "signup-step", element: <Navigate to="/onboarding/app-intro" replace /> },
          { path: "results", element: <Navigate to="/onboarding/app-intro" replace /> },
          { path: "payment", element: <Navigate to="/upgrade" replace /> },
          { path: "app-intro", element: <Suspense fallback={<LoadingFallback />}><StageUSPIntro /></Suspense> },
          { path: "context-connection", element: <Navigate to="/onboarding/app-intro" replace /> },
          { path: "leadership-context", element: <Suspense fallback={<LoadingFallback />}><StageLeadershipContext /></Suspense> },
          { path: "cognitive-load", element: <Suspense fallback={<LoadingFallback />}><StageCognitiveLoad /></Suspense> },
          { path: "protect-goals", element: <Suspense fallback={<LoadingFallback />}><StageProtectGoals /></Suspense> },
          { path: "brief-prefs", element: <Suspense fallback={<LoadingFallback />}><StageBriefPrefs /></Suspense> },
          { path: "permissions", element: <Suspense fallback={<LoadingFallback />}><StagePermissions /></Suspense> },
          { path: "connect", element: <Navigate to="/onboarding/permissions" replace /> },
          { path: "done", element: <Suspense fallback={<LoadingFallback />}><StageDone /></Suspense> },
          { path: "*", element: <Navigate to="/onboarding/app-intro" replace /> },
        ],
      },
      {
        path: "admin",
        element: (
          <Suspense fallback={<LoadingFallback />}>
            <ProtectedRoute>
              <AdminRoute>
                <AdminLayout />
              </AdminRoute>
            </ProtectedRoute>
          </Suspense>
        ),
        children: [
          { index: true, element: <Suspense fallback={<LoadingFallback />}><AdminDashboard /></Suspense> },
          { path: "users", element: <Suspense fallback={<LoadingFallback />}><AdminUsers /></Suspense> },
          { path: "users/:userId", element: <Suspense fallback={<LoadingFallback />}><AdminUserDetail /></Suspense> },
          { path: "jobs", element: <Suspense fallback={<LoadingFallback />}><AdminJobs /></Suspense> },
          { path: "executive-home-audit", element: <Suspense fallback={<LoadingFallback />}><AdminExecutiveHomeAudit /></Suspense> },
          { path: "error-logs", element: <Suspense fallback={<LoadingFallback />}><AdminErrorLogs /></Suspense> },
          { path: "notifications", element: <Suspense fallback={<LoadingFallback />}><AdminNotifications /></Suspense> },
        ],
      },
    ],
  },
]);

const queryClient = new QueryClient();

function App() {
  return (
    <ErrorBoundary>
      <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <div className="App">
            <RouterProvider router={router} />
          </div>
        </TooltipProvider>
      </QueryClientProvider>
      </HelmetProvider>
    </ErrorBoundary>
  );
}

export default App;
