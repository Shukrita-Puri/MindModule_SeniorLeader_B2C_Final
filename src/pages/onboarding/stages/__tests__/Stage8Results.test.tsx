import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Stage8Results from "../Stage8Results";

// Mock all external dependencies
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    isAuthenticated: false,
    user: null,
    loading: false,
  }),
}));

vi.mock("@/hooks/useOnboardingProgress", () => ({
  useOnboardingProgress: () => ({
    recordStep: vi.fn(),
  }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
  },
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

import { supabase } from "@/integrations/supabase/client";
const mockInvoke = supabase.functions.invoke as ReturnType<typeof vi.fn>;

const STORAGE_KEY = "mind_module_onboarding";

function seedResponses(overrides: Record<string, string> = {}) {
  const responses = {
    emotional_awareness_response: "I notice tension in my shoulders",
    stress_response_response: "I power through under stress",
    recovery_patterns_response: "Exercise helps but I rarely make time",
    mental_clarity_response: "Thinking gets scattered under pressure",
    practice_priority_tag: "regulation_composure",
    pressure_context_tag: "high_stakes_decisions",
    identity_role: "CEO",
    biggest_pressure: "Board meetings",
    ...overrides,
  };
  const session = {
    sessionId: "test-1",
    currentStage: 8,
    startedAt: new Date().toISOString(),
    responses,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

function makeResult(overrides: Record<string, any> = {}) {
  return {
    data: {
      baselineScore: 62,
      componentScores: { energyRegulation: 68, focusRecovery: 57, energyRenewal: 54 },
      archetype: "adaptive-navigator",
      archetypeTitle: "The Adaptive Navigator",
      archetypeDescription: "You read the field and adjust in real time. Strategic flexibility is your strength.",
      insight: "Your pattern reveals strong situational awareness but a tendency to over-adapt. Under sustained pressure, you may lose your own anchor point while managing the field around you. The data suggests building a personal recalibration protocol would add a layer of stability.",
      ...overrides,
    },
    error: null,
  };
}

function renderResults() {
  return render(
    <MemoryRouter initialEntries={["/onboarding/results"]}>
      <Stage8Results />
    </MemoryRouter>
  );
}

beforeEach(() => {
  localStorage.clear();
  mockInvoke.mockReset();
  mockNavigate.mockReset();
});

describe("Stage8Results — Layout Rendering", () => {
  it("shows error when no onboarding responses exist", async () => {
    renderResults();
    await waitFor(() => {
      expect(screen.getByText(/answers were not saved/i)).toBeInTheDocument();
    });
  });

  it("renders all sections with valid data (energyRegulation highest)", async () => {
    seedResponses();
    mockInvoke.mockResolvedValueOnce(makeResult());
    renderResults();

    await waitFor(() => {
      expect(screen.getByText(/Your Performance Baseline/i)).toBeInTheDocument();
      expect(screen.getByText(/The Adaptive Navigator/i)).toBeInTheDocument();
    }, { timeout: 3000 });

    // Dimension bars
    expect(screen.getByText("Recalibration")).toBeInTheDocument();
    expect(screen.getByText("Clarity")).toBeInTheDocument();
    expect(screen.getByText("Renewal")).toBeInTheDocument();
    expect(screen.getByText("68")).toBeInTheDocument();
    expect(screen.getByText("57")).toBeInTheDocument();
    expect(screen.getByText("54")).toBeInTheDocument();

    // Tooltip trigger
    expect(screen.getByText(/What do these dimensions measure/i)).toBeInTheDocument();

    // AI insight truncated
    expect(screen.getByText(/Read full analysis/i)).toBeInTheDocument();

    // Strengths (highest = energyRegulation)
    expect(screen.getByText("Self-Regulation")).toBeInTheDocument();
    expect(screen.getByText("Resilience")).toBeInTheDocument();
    expect(screen.getByText("Confidence")).toBeInTheDocument();

    // Development Area (lowest = energyRenewal)
    expect(screen.getByText("Adaptive Capacity")).toBeInTheDocument();
    expect(screen.getByText("Influence")).toBeInTheDocument();
    expect(screen.getByText("Presence")).toBeInTheDocument();

    // Development Path
    expect(screen.getByText("Goal Focus")).toBeInTheDocument();
    expect(screen.getByText("Composure under pressure")).toBeInTheDocument();
    expect(screen.getByText("Practice Focus")).toBeInTheDocument();
    expect(screen.getByText("Somatic Protocols")).toBeInTheDocument();

    // CTA
    expect(screen.getByText("Activate My System")).toBeInTheDocument();
  });

  it("renders correct strengths/dev when focusRecovery is highest", async () => {
    seedResponses({ practice_priority_tag: "focus_clarity" });
    mockInvoke.mockResolvedValueOnce(makeResult({
      componentScores: { energyRegulation: 45, focusRecovery: 78, energyRenewal: 60 },
    }));
    renderResults();

    await waitFor(() => {
      expect(screen.getByText("Thinking Clarity")).toBeInTheDocument();
      expect(screen.getByText("Emotional Intelligence")).toBeInTheDocument();
    }, { timeout: 3000 });

    // Development from energyRegulation (lowest)
    expect(screen.getByText("Self-Regulation")).toBeInTheDocument();
    expect(screen.getByText("Cognitive Sharpening")).toBeInTheDocument();
  });

  it("renders correct strengths/dev when energyRenewal is highest", async () => {
    seedResponses({ practice_priority_tag: "energy_endurance" });
    mockInvoke.mockResolvedValueOnce(makeResult({
      componentScores: { energyRegulation: 50, focusRecovery: 40, energyRenewal: 85 },
    }));
    renderResults();

    await waitFor(() => {
      expect(screen.getByText("Adaptive Capacity")).toBeInTheDocument();
      expect(screen.getByText("Influence")).toBeInTheDocument();
      expect(screen.getByText("Presence")).toBeInTheDocument();
    }, { timeout: 3000 });

    expect(screen.getByText("Thinking Clarity")).toBeInTheDocument();
    expect(screen.getByText("Energy Management")).toBeInTheDocument();
  });

  it("handles short insight without truncation", async () => {
    seedResponses();
    mockInvoke.mockResolvedValueOnce(makeResult({
      insight: "Short insight text.",
    }));
    renderResults();

    await waitFor(() => {
      expect(screen.getByText(/Short insight text/)).toBeInTheDocument();
    }, { timeout: 3000 });
    expect(screen.queryByText(/Read full analysis/i)).not.toBeInTheDocument();
  });

  it("handles all practice_priority_tag → modality permutations", async () => {
    const tags: Record<string, string> = {
      regulation_composure: "Somatic Protocols",
      regulation_early: "Early Signal Training",
      recovery_resilience: "Recovery Protocols",
      energy_endurance: "Energy Management",
      focus_clarity: "Cognitive Sharpening",
      mindset_reframe: "Mindset Reframes",
    };

    for (const [tag, expectedModality] of Object.entries(tags)) {
      localStorage.clear();
      mockInvoke.mockReset();
      seedResponses({ practice_priority_tag: tag });
      mockInvoke.mockResolvedValueOnce(makeResult());

      const { unmount } = renderResults();
      await waitFor(() => {
        expect(screen.getByText(expectedModality)).toBeInTheDocument();
      }, { timeout: 3000 });
      unmount();
    }
  });

  it("falls back to 'Targeted Protocols' for unknown practice tag", async () => {
    seedResponses({ practice_priority_tag: "unknown_tag" });
    mockInvoke.mockResolvedValueOnce(makeResult());
    renderResults();

    await waitFor(() => {
      expect(screen.getByText("Targeted Protocols")).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it("handles equal dimension scores gracefully", async () => {
    seedResponses();
    mockInvoke.mockResolvedValueOnce(makeResult({
      componentScores: { energyRegulation: 60, focusRecovery: 60, energyRenewal: 60 },
    }));
    renderResults();

    await waitFor(() => {
      const sixties = screen.getAllByText("60");
      expect(sixties).toHaveLength(3);
    }, { timeout: 3000 });
    expect(screen.getByText(/Strengths/i)).toBeInTheDocument();
    expect(screen.getByText(/Development Area/i)).toBeInTheDocument();
  });

  it("renders CTA and navigates to payment on click", async () => {
    seedResponses();
    mockInvoke.mockResolvedValueOnce(makeResult());
    renderResults();

    await waitFor(() => {
      expect(screen.getByText("Activate My System")).toBeInTheDocument();
    }, { timeout: 3000 });

    screen.getByText("Activate My System").closest("button")?.click();
    expect(mockNavigate).toHaveBeenCalledWith("/onboarding/payment");
  });

  it("shows loading state initially", () => {
    seedResponses();
    mockInvoke.mockReturnValue(new Promise(() => {})); // never resolves
    renderResults();

    expect(screen.getByText(/Analysing Your Pattern/i)).toBeInTheDocument();
    expect(screen.getByText(/Calibrating your performance profile/i)).toBeInTheDocument();
  });
});
