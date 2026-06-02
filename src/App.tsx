import { lazy, Suspense, useEffect, useState } from "react";
import {
  createBrowserRouter,
  Navigate,
  RouterProvider,
  Outlet,
  useLocation,
  useParams,
} from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import ErrorBoundary from "./components/ErrorBoundary";
import RouteErrorBoundary from "./components/RouteErrorBoundary";
import PlayerErrorBoundary from "./components/PlayerErrorBoundary";
import ProtectedRoute from "./components/ProtectedRoute";
import { OnboardingGuard, OnboardingBlockGuard } from "./components/OnboardingGuard";
import { SubscriptionGuard } from "./components/SubscriptionGuard";
import { CheckInVisibilityGuard } from "./components/CheckInVisibilityGuard";
import { PushNotificationProvider, PushNotificationActionHandler } from "./components/PushNotificationProvider";
import { AuthProvider } from "./hooks/useAuth";
import {
  ensureTravelMonitoringIfAuthorized,
  startTimezoneWatcher,
  persistPermissionStatus,
} from "./services/travelStateService";
import DelayedFallback from "./components/ui/delayed-fallback";
import RouteSkeleton from "./components/ui/route-skeleton";
import { PAYMENT_PAGE_SUPPRESSED } from "./config/payments";
// Lazy load pages for code splitting
const Front = lazy(() => import("./pages/Front"));
const Signup = lazy(() => import("./pages/Signup"));
const Login = lazy(() => import("./pages/Login"));
const DailyCheckIn = lazy(() => import("./pages/DailyCheckIn"));
const ExecutiveHome = lazy(() => import("./pages/ExecutiveHome"));
const PlanPage = lazy(() => import("./pages/PlanPage"));
const NudgeSettings = lazy(() => import("./pages/NudgeSettings"));
const TravelSettings = lazy(() => import("./pages/TravelSettings"));
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
const Stage1Welcome = lazy(() => import("./pages/onboarding/stages/Stage1Welcome"));
const Stage2Identity = lazy(() => import("./pages/onboarding/stages/Stage2Identity"));
const Stage3EmotionalAwareness = lazy(() => import("./pages/onboarding/stages/Stage3EmotionalAwareness"));
const Stage4StressResponse = lazy(() => import("./pages/onboarding/stages/Stage4StressResponse"));
const Stage5RecoveryPatterns = lazy(() => import("./pages/onboarding/stages/Stage5RecoveryPatterns"));
const Stage6MentalClarity = lazy(() => import("./pages/onboarding/stages/Stage6MentalClarity"));
const Stage7GrowthIntention = lazy(() => import("./pages/onboarding/stages/Stage7GrowthIntention"));
const Stage8Results = lazy(() => import("./pages/onboarding/stages/Stage8Results"));
const Stage8SignupStep = lazy(() => import("./pages/onboarding/stages/Stage8SignupStep"));
const Stage6Payment = lazy(() => import("./pages/onboarding/stages/Stage6Payment"));
const StageUSPIntro = lazy(() => import("./pages/onboarding/stages/StageUSPIntro"));
const Stage7ContextConnection = lazy(() => import("./pages/onboarding/stages/Stage7ContextConnection"));
const AuthCallback = lazy(() => import("./pages/AuthCallback"));

// v8 onboarding flow (replaces legacy questionnaire for new users)
const StageLeadershipContext = lazy(() => import("./pages/onboarding/stages/v8/StageLeadershipContext"));
const StageCognitiveLoad = lazy(() => import("./pages/onboarding/stages/v8/StageCognitiveLoad"));
const StageProtectGoals = lazy(() => import("./pages/onboarding/stages/v8/StageProtectGoals"));
const StageBriefPrefs = lazy(() => import("./pages/onboarding/stages/v8/StageBriefPrefs"));
const StagePermissions = lazy(() => import("./pages/onboarding/stages/v8/StagePermissions"));
const StageDone = lazy(() => import("./pages/onboarding/stages/v8/StageDone"));
const StageConnections = lazy(() => import("./pages/onboarding/stages/v8/StageConnections"));

// Loading fallback — silent for fast (<3s) lazy-load transitions, then falls
// back to a single generic loader. Page-specific loaders (Brief, Plan,
// Insights, Onboarding Results) own their own visible loading UI.
const LoadingFallback = () => <DelayedFallback />;

// Global scroll-to-top on every route change
const ScrollToTop = () => {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    // Also reset any overflow-scrolled containers (e.g. SidebarInset on iOS native)
    document.querySelectorAll('[data-scroll-container], [data-sidebar-inset]').forEach((el) => {
      el.scrollTop = 0;
    });
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
    const stopTz = startTimezoneWatcher();

    let removeAppListener: (() => void) | undefined;
    void (async () => {
      try {
        const { App } = await import('@capacitor/app');
        const handle = await App.addListener('appStateChange', ({ isActive }) => {
          if (isActive) sync();
        });
        removeAppListener = () => { void handle.remove(); };
      } catch { /* web: no-op */ }
    })();

    return () => { stopTz(); removeAppListener?.(); };
  }, []);
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

  // Hide floating nav elements during the onboarding tour
  const [tourActive, setTourActive] = useState(() => sessionStorage.getItem('first_session_guide_active') === '1');
  useEffect(() => {
    const check = () => setTourActive(sessionStorage.getItem('first_session_guide_active') === '1');
    // Listen for storage changes from the tour component
    window.addEventListener('storage', check);
    // Also poll briefly since sessionStorage events don't fire in same tab
    const interval = setInterval(check, 500);
    return () => { window.removeEventListener('storage', check); clearInterval(interval); };
  }, []);

  return (
    <AuthProvider>
      <ScrollToTop />
      <TravelWatcher />
      <PushNotificationProvider />
      <PushNotificationActionHandler />
      {showPillNav && !tourActive && <FloatingPillNav />}
      <Outlet />
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
        path: "travel-settings",
        element: <Suspense fallback={<LoadingFallback />}><ProtectedRoute><OnboardingGuard><SubscriptionGuard><TravelSettings /></SubscriptionGuard></OnboardingGuard></ProtectedRoute></Suspense>,
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
        path: "onboarding",
        element: <Suspense fallback={<LoadingFallback />}><OnboardingBlockGuard><OnboardingFlow /></OnboardingBlockGuard></Suspense>,
        children: [
          { index: true, element: <Suspense fallback={<LoadingFallback />}><Stage1Welcome /></Suspense> },
          { path: "identity", element: <Suspense fallback={<LoadingFallback />}><Stage2Identity /></Suspense> },
          { path: "emotional-awareness", element: <Suspense fallback={<LoadingFallback />}><Stage3EmotionalAwareness /></Suspense> },
          { path: "stress-response", element: <Suspense fallback={<LoadingFallback />}><Stage4StressResponse /></Suspense> },
          { path: "recovery-patterns", element: <Suspense fallback={<LoadingFallback />}><Stage5RecoveryPatterns /></Suspense> },
          { path: "mental-clarity", element: <Suspense fallback={<LoadingFallback />}><Stage6MentalClarity /></Suspense> },
          { path: "growth-intention", element: <Suspense fallback={<LoadingFallback />}><Stage7GrowthIntention /></Suspense> },
          { path: "signup-step", element: <Suspense fallback={<LoadingFallback />}><Stage8SignupStep /></Suspense> },
          { path: "results", element: <Suspense fallback={<RouteSkeleton />}><Stage8Results /></Suspense> },
          { path: "payment", element: PAYMENT_PAGE_SUPPRESSED ? <Navigate to="/onboarding/app-intro" replace /> : <Suspense fallback={<LoadingFallback />}><Stage6Payment /></Suspense> },
          { path: "app-intro", element: <Suspense fallback={<LoadingFallback />}><StageUSPIntro /></Suspense> },
          { path: "context-connection", element: <Suspense fallback={<LoadingFallback />}><Stage7ContextConnection /></Suspense> },
          { path: "leadership-context", element: <Suspense fallback={<LoadingFallback />}><StageLeadershipContext /></Suspense> },
          { path: "cognitive-load", element: <Suspense fallback={<LoadingFallback />}><StageCognitiveLoad /></Suspense> },
          { path: "protect-goals", element: <Suspense fallback={<LoadingFallback />}><StageProtectGoals /></Suspense> },
          { path: "brief-prefs", element: <Suspense fallback={<LoadingFallback />}><StageBriefPrefs /></Suspense> },
          { path: "permissions", element: <Suspense fallback={<LoadingFallback />}><StagePermissions /></Suspense> },
          { path: "connect", element: <Suspense fallback={<LoadingFallback />}><StageConnections /></Suspense> },
          { path: "done", element: <Suspense fallback={<LoadingFallback />}><StageDone /></Suspense> },
        ],
      },
    ],
  },
]);

const queryClient = new QueryClient();

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <div className="App">
            <RouterProvider router={router} />
          </div>
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
