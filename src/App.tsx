import { lazy, Suspense, useEffect } from "react";
import {
  createBrowserRouter,
  RouterProvider,
  Outlet,
  useLocation,
} from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import ErrorBoundary from "./components/ErrorBoundary";
import ProtectedRoute from "./components/ProtectedRoute";
import { OnboardingGuard, OnboardingBlockGuard } from "./components/OnboardingGuard";
import { SubscriptionGuard } from "./components/SubscriptionGuard";
import { PushNotificationProvider, PushNotificationActionHandler } from "./components/PushNotificationProvider";
import { AuthProvider } from "./hooks/useAuth";
// Lazy load pages for code splitting
const Front = lazy(() => import("./pages/Front"));
const Signup = lazy(() => import("./pages/Signup"));
const Login = lazy(() => import("./pages/Login"));
const DailyCheckIn = lazy(() => import("./pages/DailyCheckIn"));
const ExecutiveHome = lazy(() => import("./pages/ExecutiveHome"));
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
const Profile = lazy(() => import("./pages/Profile"));
const ConnectedData = lazy(() => import("./pages/ConnectedData"));
const Refer = lazy(() => import("./pages/Refer"));
const JoinPage = lazy(() => import("./pages/JoinPage"));
const CheckInDetail = lazy(() => import("./pages/CheckInDetail"));

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

// Loading fallback component
const LoadingFallback = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="text-center">
      <div className="w-16 h-16 border-4 border-gold border-t-transparent rounded-full animate-spin mx-auto mb-4" />
      <p className="text-muted-foreground">Loading...</p>
    </div>
  </div>
);

// Global scroll-to-top on every route change
const ScrollToTop = () => {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname]);
  return null;
};

import FloatingPillNav from "./components/navigation/FloatingPillNav";
import FloatingCoachButton from "./components/navigation/FloatingCoachButton";

// Pages where coach FAB should be hidden (check-in flow)
const COACH_HIDDEN_ROUTES = ['/daily-check-in', '/check-in-detail', '/onboarding', '/signup', '/login', '/callback', '/join'];

// Bottom pill nav is only shown on core app destinations after the executive home entry point.
const PILL_NAV_VISIBLE_ROUTES = [
  '/executive-home',
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
  const hideCoach = COACH_HIDDEN_ROUTES.some((route) => matchesRoutePrefix(pathname, route));
  const showPillNav = PILL_NAV_VISIBLE_ROUTES.some((route) => matchesRoutePrefix(pathname, route));

  return (
    <AuthProvider>
      <ScrollToTop />
      <PushNotificationProvider />
      <PushNotificationActionHandler />
      {showPillNav && <FloatingPillNav />}
      {!hideCoach && <FloatingCoachButton />}
      <Outlet />
    </AuthProvider>
  );
};

const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    errorElement: <ErrorBoundary><div /></ErrorBoundary>,
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
        element: <Suspense fallback={<LoadingFallback />}><ProtectedRoute><OnboardingGuard><SubscriptionGuard><DailyCheckIn /></SubscriptionGuard></OnboardingGuard></ProtectedRoute></Suspense>,
      },
      {
        path: "executive-home",
        element: <Suspense fallback={<LoadingFallback />}><ProtectedRoute><OnboardingGuard><SubscriptionGuard><ExecutiveHome /></SubscriptionGuard></OnboardingGuard></ProtectedRoute></Suspense>,
      },
      {
        path: "coach",
        element: <Suspense fallback={<LoadingFallback />}><ProtectedRoute><OnboardingGuard><SubscriptionGuard><SelfMasteryCoach /></SubscriptionGuard></OnboardingGuard></ProtectedRoute></Suspense>,
      },
      {
        path: "insights",
        element: <Suspense fallback={<LoadingFallback />}><ProtectedRoute><OnboardingGuard><SubscriptionGuard><Insights /></SubscriptionGuard></OnboardingGuard></ProtectedRoute></Suspense>,
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
        element: <Suspense fallback={<LoadingFallback />}><ProtectedRoute><OnboardingGuard><SubscriptionGuard><CheckInDetail /></SubscriptionGuard></OnboardingGuard></ProtectedRoute></Suspense>,
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
        element: <Suspense fallback={<LoadingFallback />}><ProtectedRoute><OnboardingGuard><SubscriptionGuard><SoundscapePlayer /></SubscriptionGuard></OnboardingGuard></ProtectedRoute></Suspense>,
      },
      {
        path: "guided-practices/:id",
        element: <Suspense fallback={<LoadingFallback />}><ProtectedRoute><OnboardingGuard><SubscriptionGuard><GuidedPracticePlayer /></SubscriptionGuard></OnboardingGuard></ProtectedRoute></Suspense>,
      },
      {
        path: "micro-practice/:id",
        element: <Suspense fallback={<LoadingFallback />}><ProtectedRoute><OnboardingGuard><SubscriptionGuard><MicroPracticePlayer /></SubscriptionGuard></OnboardingGuard></ProtectedRoute></Suspense>,
      },
      {
        path: "micro-practice/:id/cards",
        element: <Suspense fallback={<LoadingFallback />}><ProtectedRoute><OnboardingGuard><SubscriptionGuard><MicroPracticePlayerCards /></SubscriptionGuard></OnboardingGuard></ProtectedRoute></Suspense>,
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
          { path: "results", element: <Suspense fallback={<LoadingFallback />}><Stage8Results /></Suspense> },
          { path: "payment", element: <Suspense fallback={<LoadingFallback />}><Stage6Payment /></Suspense> },
          { path: "app-intro", element: <Suspense fallback={<LoadingFallback />}><StageUSPIntro /></Suspense> },
          { path: "context-connection", element: <Suspense fallback={<LoadingFallback />}><Stage7ContextConnection /></Suspense> },
        ],
      },
    ],
  },
]);

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <div className="App">
          <RouterProvider router={router} />
        </div>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
