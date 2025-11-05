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
import FlowSession from "./pages/FlowSession";
import GlobalHeader from "./components/GlobalHeader";
import NudgeSettings from "./pages/NudgeSettings";
import NudgeSimulator from "./pages/NudgeSimulator";
import MemoryArchive from "./pages/MemoryArchive";
import RecalibrateMode from "./pages/RecalibrateMode";
import Soundscapes from "./pages/Soundscapes";
import SoundscapePlayer from "./pages/SoundscapePlayer";
import GuidedPracticesLibrary from "./pages/GuidedPracticesLibrary";
import GuidedPracticePlayer from "./pages/GuidedPracticePlayer";

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
    '/nudge-simulator',
    '/memory-archive'
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
        element: <DailyCheckIn />,
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
        path: "recalibrate",
        element: <RecalibrateMode />,
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
        path: "soundscapes",
        element: <Soundscapes />,
      },
      {
        path: "soundscapes/:id",
        element: <SoundscapePlayer />,
      },
      {
        path: "guided-practices",
        element: <GuidedPracticesLibrary />,
      },
      {
        path: "guided-practices/:id",
        element: <GuidedPracticePlayer />,
      },
      {
        path: "micro-practices",
        element: <div>Coming soon</div>, // Placeholder for MicroPracticesLibrary
      },
      {
        path: "micro-practice/:id",
        element: <div>Coming soon</div>, // Placeholder for MicroPracticePlayer
      },
      {
        path: "onboarding",
        element: <OnboardingFlow />,
        children: [
          { index: true, element: <Stage1Welcome /> },
          { path: "identity", element: <Stage2Identity /> },
          { path: "behavioral", element: <Stage3Behavioral /> },
          { path: "self-assessment", element: <Stage4SelfAssessment /> },
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
