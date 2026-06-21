import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// ─── Stub heavy children so we can assert routing only ───
vi.mock("@/components/home/TodayThreePriorities", () => ({
  default: () => <div data-testid="today-three">today-three-stub</div>,
}));
vi.mock("@/components/home/WeekAheadPriorities", () => ({
  default: () => <div data-testid="week-ahead">week-ahead-stub</div>,
}));
vi.mock("@/components/today/TodayHero", () => ({ default: () => null }));
vi.mock("@/components/today/TodayGreeting", () => ({ default: () => null }));
vi.mock("@/components/home/DailyRitual", () => ({ default: () => null }));
vi.mock("@/components/home/PrivacyFooter", () => ({ default: () => null }));
vi.mock("@/components/navigation/LeftSidebar", () => ({ default: () => null }));
vi.mock("@/components/navigation/SidebarDiscoveryPulse", () => ({ default: () => null }));
vi.mock("@/components/onboarding/FirstSessionGuide", () => ({ default: () => null }));
vi.mock("@/components/onboarding/TourMockPlan", () => ({ default: () => null }));
vi.mock("@/components/onboarding/useTourMock", () => ({
  useTourMock: () => ({ shouldRenderMock: false }),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/hooks/useOnboardingProgress", () => ({
  useOnboardingProgress: () => ({ recordStep: vi.fn() }),
}));
vi.mock("@/utils/firstSessionTour", () => ({
  isRetakeForUser: () => false,
  isTourActiveForUser: () => false,
}));
vi.mock("@/config/devMode", () => ({ DEV_MODE: false, DEV_USER: { id: "dev" } }));

// Controllable hook mock for server decision.
type SD = { active: boolean; reason: string | null } | null;
const serverDecisionMock: { current: SD } = { current: null };
vi.mock("@/hooks/useWeekAheadServerDecision", () => ({
  useWeekAheadServerDecision: () => serverDecisionMock.current,
}));

import PlanPage from "../PlanPage";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <PlanPage />
    </MemoryRouter>,
  );
}

describe("PlanPage routing", () => {
  it("Saturday / server inactive → renders TodayThreePriorities", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-20T18:00:00Z")); // Sat
    serverDecisionMock.current = { active: false, reason: null };
    renderAt("/plan");
    expect(screen.getByTestId("today-three")).toBeInTheDocument();
    expect(screen.queryByTestId("week-ahead")).toBeNull();
    expect(screen.getByText(/Today's Performance Priorities/i)).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("Sunday / server active → renders WeekAheadPriorities + correct eyebrow", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-21T12:00:00Z")); // Sun
    serverDecisionMock.current = { active: true, reason: "sunday" };
    renderAt("/plan");
    expect(screen.getByTestId("week-ahead")).toBeInTheDocument();
    expect(screen.queryByTestId("today-three")).toBeNull();
    expect(screen.getByText(/Week-Ahead Priorities/i)).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("Server inactive on Sunday overrides local Sunday heuristic", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-21T12:00:00Z")); // Sun
    serverDecisionMock.current = { active: false, reason: null };
    renderAt("/plan");
    expect(screen.getByTestId("today-three")).toBeInTheDocument();
    expect(screen.queryByTestId("week-ahead")).toBeNull();
    vi.useRealTimers();
  });
});