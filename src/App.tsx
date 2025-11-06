import {
  createBrowserRouter,
  RouterProvider,
  Outlet,
  useLocation,
} from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ErrorBoundary from "./components/ErrorBoundary";
import ProtectedRoute from "./components/ProtectedRoute";
import Front from "./pages/Front";
import Signup from "./pages/Signup";
import DailyCheckIn from "./pages/DailyCheckIn";
import ExecutiveHome from "./pages/ExecutiveHome";
import FlowSession from "./pages/FlowSession";
import GlobalHeader from "./components/GlobalHeader";
import NudgeSettings from "./pages/NudgeSettings";
import NudgeSimulator from "./pages/NudgeSimulator";

import RecalibrateMode from "./pages/RecalibrateMode";
import Soundscapes from "./pages/Soundscapes";
import SoundscapePlayer from "./pages/SoundscapePlayer";
import GuidedPracticesLibrary from "./pages/GuidedPracticesLibrary";
import GuidedPracticePlayer from "./pages/GuidedPracticePlayer";
import MicroPracticesLibrary from "./pages/MicroPracticesLibrary";
import MicroPracticePlayer from "./pages/MicroPracticePlayer";
import InsightsDashboard from "./pages/InsightsDashboard";

// ARCHIVED - V2 Features (moved to src/pages/_archived/)
// import FlowStateLab from "./pages/FlowStateLab";
// import MentorChat from "./pages/MentorChat";
// import MindVault from "./pages/MindVault";
// import MentorMode from "./pages/MentorMode";
// import ClarityMode from "./pages/ClarityMode";
// import FuturescapeMode from "./pages/FuturescapeMode";
// import MentorInsights from "./pages/MentorInsights";
// import ClaritySummary from "./pages/ClaritySummary";
// import ClarityConversation from "./pages/clarity/ClarityConversation";
// import ClarityJournal from "./pages/clarity/ClarityJournal";

// Import recalibrate outcome pages
import PowerUpOutcomePage from "./pages/recalibrate/PowerUpOutcomePage";
import PauseOutcomePage from "./pages/recalibrate/PauseOutcomePage";
import PresenceOutcomePage from "./pages/recalibrate/PresenceOutcomePage";

// Onboarding pages
import OnboardingFlow from "./pages/onboarding/OnboardingFlow";
import Stage1Welcome from "./pages/onboarding/stages/Stage1Welcome";
import Stage2Identity from "./pages/onboarding/stages/Stage2Identity";
import Stage3Behavioral from "./pages/onboarding/stages/Stage3Behavioral";
import Stage4SelfAssessment from "./pages/onboarding/stages/Stage4SelfAssessment";
import Stage5Results from "./pages/onboarding/stages/Stage5Results";
import Stage6Payment from "./pages/onboarding/stages/Stage6Payment";
import Stage7ContextConnection from "./pages/onboarding/stages/Stage7ContextConnection";

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
        element: <Front />,
      },
      {
        path: "signup",
        element: <Signup />,
      },
      {
        path: "daily-check-in",
        element: <ProtectedRoute><DailyCheckIn /></ProtectedRoute>,
      },
      {
        path: "executive-home",
        element: <ProtectedRoute><ExecutiveHome /></ProtectedRoute>,
      },
      {
        path: "flow-session",
        element: <ProtectedRoute><FlowSession /></ProtectedRoute>,
      },
      {
        path: "recalibrate",
        element: <ProtectedRoute><RecalibrateMode /></ProtectedRoute>,
        children: [
          {
            path: "power-up",
            element: <PowerUpOutcomePage />,
          },
          {
            path: "pause",
            element: <PauseOutcomePage />,
          },
          {
            path: "presence",
            element: <PresenceOutcomePage />,
          },
        ],
      },
      {
        path: "nudge-settings",
        element: <ProtectedRoute><NudgeSettings /></ProtectedRoute>,
      },
      {
        path: "nudge-simulator",
        element: <ProtectedRoute><NudgeSimulator /></ProtectedRoute>,
      },
      {
        path: "soundscapes",
        element: <ProtectedRoute><Soundscapes /></ProtectedRoute>,
      },
      {
        path: "soundscapes/:id",
        element: <ProtectedRoute><SoundscapePlayer /></ProtectedRoute>,
      },
      {
        path: "guided-practices",
        element: <ProtectedRoute><GuidedPracticesLibrary /></ProtectedRoute>,
      },
      {
        path: "guided-practices/:id",
        element: <ProtectedRoute><GuidedPracticePlayer /></ProtectedRoute>,
      },
      {
        path: "micro-practices",
        element: <ProtectedRoute><MicroPracticesLibrary /></ProtectedRoute>,
      },
      {
        path: "micro-practice/:id",
        element: <ProtectedRoute><MicroPracticePlayer /></ProtectedRoute>,
      },
      {
        path: "insights-dashboard",
        element: <ProtectedRoute><InsightsDashboard /></ProtectedRoute>,
      },
      {
        path: "onboarding",
        element: <OnboardingFlow />,
        children: [
          { index: true, element: <Stage1Welcome /> },
          { path: "identity", element: <Stage2Identity /> },
          { path: "behavioral", element: <Stage3Behavioral /> },
          { path: "self-assessment", element: <Stage4SelfAssessment /> },
          { path: "signup-step", element: <Signup /> },
          { path: "results", element: <Stage5Results /> },
          { path: "payment", element: <Stage6Payment /> },
          { path: "context-connection", element: <Stage7ContextConnection /> },
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
