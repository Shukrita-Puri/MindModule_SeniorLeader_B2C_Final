import {
  createBrowserRouter,
  RouterProvider,
  Outlet,
  useLocation,
} from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ErrorBoundary from "./components/ErrorBoundary";
import Front from "./pages/Front";
import Signup from "./pages/Signup";
import DailyCheckIn from "./pages/DailyCheckIn";
import ExecutiveHome from "./pages/ExecutiveHome";
import SocialIntelligenceLab from "./pages/SocialIntelligenceLab";
import FlowSession from "./pages/FlowSession";
import GlobalHeader from "./components/GlobalHeader";
import NudgeSettings from "./pages/NudgeSettings";
import NudgeSimulator from "./pages/NudgeSimulator";
import MemoryArchive from "./pages/MemoryArchive";
import Simulation from "./pages/Simulation";
import Breathwork from "./pages/Breathwork";
import RecalibrateMode from "./pages/RecalibrateMode";
import SimulationInsights from "./pages/SimulationInsights";

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

// Import recalibrate session pages
import PowerUpSession from "./pages/recalibrate/PowerUpSession";
import EmergencyResetSession from "./pages/recalibrate/EmergencyResetSession";
import BreathworkSession from "./pages/recalibrate/BreathworkSession";
import QuickResetSession from "./pages/recalibrate/QuickResetSession";
import FlowStateSession from "./pages/recalibrate/FlowStateSession";

// Layout component that conditionally includes GlobalHeader
const Layout = () => {
  const location = useLocation();
  
  // Pages that should show the sidebar/GlobalHeader (signed-in pages)
  const pagesWithSidebar = [
    '/',
    '/signup',
    '/executive-home',
    '/daily-check-in',
    '/practice',
    '/practice/simulation',
    '/practice/simulation-insights',
    '/recalibrate',
    '/recalibrate/breathing',
    '/recalibrate/power-up',
    '/recalibrate/emergency-reset',
    '/recalibrate/pause',
    '/recalibrate/flow-state',
    '/nudge-settings',
    '/nudge-simulator',
    '/memory-archive'
  ];
  
  // Exclude specific pages from showing the 3-line button/GlobalHeader
  const excludedPages = [
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
        element: <DailyCheckIn />,
      },
      {
        path: "breathwork",
        element: <Breathwork />,
      },
      {
        path: "executive-home",
        element: <ExecutiveHome />,
      },
      {
        path: "flow-session",
        element: <FlowSession />,
      },
      {
        path: "practice",
        element: <SocialIntelligenceLab />,
      },
      {
        path: "practice/simulation",
        element: <Simulation />,
      },
      {
        path: "practice/simulation-insights",
        element: <SimulationInsights />,
      },
      {
        path: "recalibrate",
        element: <RecalibrateMode />,
        children: [
          {
            path: "power-up",
            element: <PowerUpSession />,
          },
          {
            path: "emergency-reset", 
            element: <EmergencyResetSession />,
          },
          {
            path: "breathwork",
            element: <BreathworkSession />,
          },
          {
            path: "breathing", // Alias for breathwork
            element: <BreathworkSession />,
          },
          {
            path: "pause",
            element: <QuickResetSession />,
          },
          {
            path: "flow-state",
            element: <FlowStateSession />,
          },
        ],
      },
      {
        path: "nudge-settings",
        element: <NudgeSettings />,
      },
      {
        path: "nudge-simulator",
        element: <NudgeSimulator />,
      },
      {
        path: "memory-archive",
        element: <MemoryArchive />,
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
