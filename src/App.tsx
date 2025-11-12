import { lazy, Suspense } from "react";
import {
  createBrowserRouter,
  RouterProvider,
  Outlet,
  useLocation,
} from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ErrorBoundary from "./components/ErrorBoundary";
import ProtectedRoute from "./components/ProtectedRoute";
import GlobalHeader from "./components/GlobalHeader";

// Lazy load pages for code splitting
const Front = lazy(() => import("./pages/Front"));
const Signup = lazy(() => import("./pages/Signup"));
const DailyCheckIn = lazy(() => import("./pages/DailyCheckIn"));
const ExecutiveHome = lazy(() => import("./pages/ExecutiveHome"));
const FlowSession = lazy(() => import("./pages/FlowSession"));
const NudgeSettings = lazy(() => import("./pages/NudgeSettings"));
const NudgeSimulator = lazy(() => import("./pages/NudgeSimulator"));
const RecalibrateMode = lazy(() => import("./pages/RecalibrateMode"));
const Soundscapes = lazy(() => import("./pages/Soundscapes"));
const SoundscapePlayer = lazy(() => import("./pages/SoundscapePlayer"));
const GuidedPracticesLibrary = lazy(() => import("./pages/GuidedPracticesLibrary"));
const GuidedPracticePlayer = lazy(() => import("./pages/GuidedPracticePlayer"));
const MicroPracticesLibrary = lazy(() => import("./pages/MicroPracticesLibrary"));
const MicroPracticePlayer = lazy(() => import("./pages/MicroPracticePlayer"));
const InsightsDashboard = lazy(() => import("./pages/InsightsDashboard"));
const HRVInsightsDashboard = lazy(() => import("./pages/HRVInsightsDashboard"));

// Recalibrate outcome pages
const PowerUpOutcomePage = lazy(() => import("./pages/recalibrate/PowerUpOutcomePage"));
const PauseOutcomePage = lazy(() => import("./pages/recalibrate/PauseOutcomePage"));
const PresenceOutcomePage = lazy(() => import("./pages/recalibrate/PresenceOutcomePage"));

// Onboarding pages
const OnboardingFlow = lazy(() => import("./pages/onboarding/OnboardingFlow"));
const Stage1Welcome = lazy(() => import("./pages/onboarding/stages/Stage1Welcome"));
const Stage2Identity = lazy(() => import("./pages/onboarding/stages/Stage2Identity"));
const Stage3Behavioral = lazy(() => import("./pages/onboarding/stages/Stage3Behavioral"));
const Stage4SelfAssessment = lazy(() => import("./pages/onboarding/stages/Stage4SelfAssessment"));
const Stage5Results = lazy(() => import("./pages/onboarding/stages/Stage5Results"));
const Stage6Payment = lazy(() => import("./pages/onboarding/stages/Stage6Payment"));
const Stage7ContextConnection = lazy(() => import("./pages/onboarding/stages/Stage7ContextConnection"));

// Loading fallback component
const LoadingFallback = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="text-center">
      <div className="w-16 h-16 border-4 border-gold border-t-transparent rounded-full animate-spin mx-auto mb-4" />
      <p className="text-muted-foreground">Loading...</p>
    </div>
  </div>
);

// Layout component that conditionally includes GlobalHeader
const Layout = () => {
  const location = useLocation();
  
  // Pages that should show the sidebar/GlobalHeader (signed-in pages)
  const pagesWithSidebar = [
    '/',
    '/signup',
    '/executive-home',
    '/daily-check-in',
    '/recalibrate',
    '/recalibrate/power-up',
    '/recalibrate/pause',
    '/recalibrate/presence',
    '/nudge-settings',
    '/nudge-simulator'
  ];
  
  // Exclude specific pages from showing the 3-line button/GlobalHeader
  const excludedPages = [
    '/',
    '/signup',
    '/executive-home',
    '/daily-check-in',
    '/recalibrate',
    '/recalibrate/power-up',
    '/recalibrate/pause',
    '/recalibrate/presence',
    '/practice',
    '/practice/configure',
    '/practice/simulation'
  ];
  
  // Also check if we're in a simulation practice
  const isInSimulation = location.pathname.includes('/practice/simulation');
  
  const shouldShowSidebar = pagesWithSidebar.includes(location.pathname) && 
    !excludedPages.includes(location.pathname) && 
    !isInSimulation;

  return (
    <>
      {shouldShowSidebar && <GlobalHeader />}
      <Outlet />
    </>
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
        path: "daily-check-in",
        element: <Suspense fallback={<LoadingFallback />}><ProtectedRoute><DailyCheckIn /></ProtectedRoute></Suspense>,
      },
      {
        path: "executive-home",
        element: <Suspense fallback={<LoadingFallback />}><ProtectedRoute><ExecutiveHome /></ProtectedRoute></Suspense>,
      },
      {
        path: "flow-session",
        element: <Suspense fallback={<LoadingFallback />}><ProtectedRoute><FlowSession /></ProtectedRoute></Suspense>,
      },
      {
        path: "recalibrate",
        element: <Suspense fallback={<LoadingFallback />}><ProtectedRoute><RecalibrateMode /></ProtectedRoute></Suspense>,
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
        element: <Suspense fallback={<LoadingFallback />}><ProtectedRoute><NudgeSettings /></ProtectedRoute></Suspense>,
      },
      {
        path: "nudge-simulator",
        element: <Suspense fallback={<LoadingFallback />}><ProtectedRoute><NudgeSimulator /></ProtectedRoute></Suspense>,
      },
      {
        path: "soundscapes",
        element: <Suspense fallback={<LoadingFallback />}><ProtectedRoute><Soundscapes /></ProtectedRoute></Suspense>,
      },
      {
        path: "soundscapes/:id",
        element: <Suspense fallback={<LoadingFallback />}><ProtectedRoute><SoundscapePlayer /></ProtectedRoute></Suspense>,
      },
      {
        path: "guided-practices",
        element: <Suspense fallback={<LoadingFallback />}><ProtectedRoute><GuidedPracticesLibrary /></ProtectedRoute></Suspense>,
      },
      {
        path: "guided-practices/:id",
        element: <Suspense fallback={<LoadingFallback />}><ProtectedRoute><GuidedPracticePlayer /></ProtectedRoute></Suspense>,
      },
      {
        path: "micro-practices",
        element: <Suspense fallback={<LoadingFallback />}><ProtectedRoute><MicroPracticesLibrary /></ProtectedRoute></Suspense>,
      },
      {
        path: "micro-practice/:id",
        element: <Suspense fallback={<LoadingFallback />}><ProtectedRoute><MicroPracticePlayer /></ProtectedRoute></Suspense>,
      },
      {
        path: "insights-dashboard",
        element: <Suspense fallback={<LoadingFallback />}><ProtectedRoute><InsightsDashboard /></ProtectedRoute></Suspense>,
      },
      {
        path: "hrv-insights",
        element: <Suspense fallback={<LoadingFallback />}><ProtectedRoute><HRVInsightsDashboard /></ProtectedRoute></Suspense>,
      },
      {
        path: "onboarding",
        element: <Suspense fallback={<LoadingFallback />}><OnboardingFlow /></Suspense>,
        children: [
          { index: true, element: <Suspense fallback={<LoadingFallback />}><Stage1Welcome /></Suspense> },
          { path: "identity", element: <Suspense fallback={<LoadingFallback />}><Stage2Identity /></Suspense> },
          { path: "behavioral", element: <Suspense fallback={<LoadingFallback />}><Stage3Behavioral /></Suspense> },
          { path: "self-assessment", element: <Suspense fallback={<LoadingFallback />}><Stage4SelfAssessment /></Suspense> },
          { path: "signup-step", element: <Suspense fallback={<LoadingFallback />}><Signup /></Suspense> },
          { path: "results", element: <Suspense fallback={<LoadingFallback />}><Stage5Results /></Suspense> },
          { path: "payment", element: <Suspense fallback={<LoadingFallback />}><Stage6Payment /></Suspense> },
          { path: "context-connection", element: <Suspense fallback={<LoadingFallback />}><Stage7ContextConnection /></Suspense> },
        ],
      },
      // ARCHIVED ROUTES - V2 Features
      // {
      //   path: "flow-state-lab",
      //   element: <FlowStateLab />,
      // },
      // {
      //   path: "mentor-chat",
      //   element: <MentorChat />,
      // },
      // {
      //   path: "mentor",
      //   element: <MentorMode />,
      // },
      // {
      //   path: "clarity",
      //   element: <ClarityMode />,
      //   children: [
      //     {
      //       path: "conversation",
      //       element: <ClarityConversation />,
      //     },
      //     {
      //       path: "journal",
      //       element: <ClarityJournal />,
      //     },
      //     {
      //       path: "summary",
      //       element: <ClaritySummary />,
      //     },
      //   ],
      // },
      // {
      //   path: "futurescape",
      //   element: <FuturescapeMode />,
      // },
      // {
      //   path: "mind-vault",
      //   element: <MindVault />,
      // },
      // {
      //   path: "mentor-insights", 
      //   element: <MentorInsights />,
      // },
    ],
  },
]);

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="App">
        <RouterProvider router={router} />
      </div>
    </QueryClientProvider>
  );
}

export default App;
