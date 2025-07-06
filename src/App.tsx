import {
  createBrowserRouter,
  RouterProvider,
  Outlet,
  useLocation,
} from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ErrorBoundary from "./components/ErrorBoundary";
import Front from "./pages/Front";
import Landing from "./pages/Landing";
import Signup from "./pages/Signup";
import DailyCheckIn from "./pages/DailyCheckIn";
import AppRouter from "./components/AppRouter";
import ExecutiveHome from "./pages/ExecutiveHome";
import ScenarioLab from "./pages/ScenarioLab";
import SocialIntelligenceLab from "./pages/SocialIntelligenceLab";
import FlowStateLab from "./pages/FlowStateLab";
import MentorChat from "./pages/MentorChat";
import MindVault from "./pages/MindVault";
import Index from "./pages/Index";
import GlobalHeader from "./components/GlobalHeader";
import NudgeSettings from "./pages/NudgeSettings";
import NudgeSimulator from "./pages/NudgeSimulator";
import MentorMode from "./pages/MentorMode";
import MemoryArchive from "./pages/MemoryArchive";
import Simulation from "./pages/Simulation";
import Breathwork from "./pages/Breathwork";
// Import existing pages that should be available
import ClarityMode from "./pages/ClarityMode";
import RecalibrateMode from "./pages/RecalibrateMode";
import FuturescapeMode from "./pages/FuturescapeMode";
import SimulationInsights from "./pages/SimulationInsights";
import MentorInsights from "./pages/MentorInsights";
import ClaritySummary from "./pages/ClaritySummary";

// Layout component that conditionally includes GlobalHeader
const Layout = () => {
  const location = useLocation();
  
  // Pages that should show the sidebar/GlobalHeader (signed-in pages)
  const pagesWithSidebar = [
    '/executive-home',
    '/index',
    '/inner-architect',
    '/mind-vault',
    '/scenario-lab',
    '/simulation',
    '/mentor-chat',
    '/mentor',
    '/clarity',
    '/recalibrate',
    '/futurescape',
    '/nudge-settings',
    '/memory-archive'
  ];
  
  const shouldShowSidebar = pagesWithSidebar.includes(location.pathname);

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
        path: "landing",
        element: <Landing />,
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
        path: "app",
        element: <AppRouter />,
      },
      {
        path: "executive-home",
        element: <ExecutiveHome />,
      },
      {
        path: "index",
        element: <Index />,
      },
      {
        path: "inner-architect",
        element: <Index />,
      },
      {
        path: "scenario-lab",
        element: <ScenarioLab />,
      },
      {
        path: "social-intelligence-lab",
        element: <SocialIntelligenceLab />,
      },
      {
        path: "flow-state-lab",
        element: <FlowStateLab />,
      },
      {
        path: "simulation",
        element: <Simulation />,
      },
      {
        path: "mentor-chat",
        element: <MentorChat />,
      },
      {
        path: "mentor",
        element: <MentorMode />,
      },
      {
        path: "clarity",
        element: <ClarityMode />,
      },
      {
        path: "recalibrate",
        element: <RecalibrateMode />,
      },
      {
        path: "futurescape",
        element: <FuturescapeMode />,
      },
      {
        path: "mind-vault",
        element: <MindVault />,
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
      {
        path: "simulation-insights",
        element: <SimulationInsights />,
      },
      {
        path: "mentor-insights", 
        element: <MentorInsights />,
      },
      {
        path: "clarity-summary",
        element: <ClaritySummary />,
      },
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
