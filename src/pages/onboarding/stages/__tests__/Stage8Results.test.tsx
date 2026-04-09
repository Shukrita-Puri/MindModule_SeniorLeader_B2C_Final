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

// Import supabase mock for controlling responses
import { supabase } from "@/integrations/supabase/client";

const mockInvoke = supabase.functions.invoke as ReturnType<typeof vi.fn>;

// Helper: set localStorage onboarding responses
function seedResponses(overrides: Record<string, string> = {}) {
  const defaults = {
    emotional_awareness_response: "I notice tension in my shoulders",
    stress_response_response: "I power through under stress",
    recovery_patterns_response: "Exercise helps but I rarely make time",
    mental_clarity_response: "Thinking gets scattered under pressure",
    practice_priority_tag: "regulation_composure",
    pressure_context_tag: "high_stakes_decisions",
    identity_role: "CEO",
    biggest_pressure: "Board meetings",
  };
  localStorage.setItem("onboarding_responses", JSON.stringify({ ...defaults, ...overrides }));
  localStorage.setItem("onboarding_session", JSON.stringify({ sessionId: "test-1", startedAt: new Date().toISOString() }));
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

  it("renders all sections with valid data", async () => {
    seedResponses();
    mockInvoke.mockResolvedValueOnce(makeResult());
    renderResults();

    await waitFor(() => {
      // Header
      expect(screen.getByText(/Your Performance Baseline/i)).toBeInTheDocument();
      expect(screen.getByText(/The Adaptive Navigator/i)).toBeInTheDocument();
      // First sentence only
      expect(screen.getByText(/You read the field and adjust in real time\./i)).toBeInTheDocument();
    });

    // Dimension bars
    expect(screen.getByText("Recalibration")).toBeInTheDocument();
    expect(screen.getByText("Clarity")).toBeInTheDocument();
    expect(screen.getByText("Renewal")).toBeInTheDocument();
    expect(screen.getByText("68")).toBeInTheDocument();
    expect(screen.getByText("57")).toBeInTheDocument();
    expect(screen.getByText("54")).toBeInTheDocument();

    // Tooltip trigger
    expect(screen.getByText(/What do these dimensions measure/i)).toBeInTheDocument();

    // AI insight (truncated)
    expect(screen.getByText(/Read full analysis/i)).toBeInTheDocument();

    // Strengths (highest = energyRegulation → Self-Regulation, Resilience, Confidence)
    expect(screen.getByText("Self-Regulation")).toBeInTheDocument();
    expect(screen.getByText("Resilience")).toBeInTheDocument();
    expect(screen.getByText("Confidence")).toBeInTheDocument();

    // Development Area (lowest = energyRenewal → Adaptive Capacity, Influence, Presence)
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
      // Strengths from focusRecovery
      expect(screen.getByText("Thinking Clarity")).toBeInTheDocument();
      expect(screen.getByText("Emotional Intelligence")).toBeInTheDocument();
    });

    // Development from energyRegulation (lowest)
    expect(screen.getByText("Self-Regulation")).toBeInTheDocument();

    // Practice modality for focus_clarity
    expect(screen.getByText("Cognitive Sharpening")).toBeInTheDocument();
  });

  it("renders correct strengths/dev when energyRenewal is highest", async () => {
    seedResponses({ practice_priority_tag: "energy_endurance" });
    mockInvoke.mockResolvedValueOnce(makeResult({
      componentScores: { energyRegulation: 50, focusRecovery: 40, energyRenewal: 85 },
    }));
    renderResults();

    await waitFor(() => {
      // Strengths from energyRenewal
      expect(screen.getByText("Adaptive Capacity")).toBeInTheDocument();
      expect(screen.getByText("Influence")).toBeInTheDocument();
      expect(screen.getByText("Presence")).toBeInTheDocument();
    });

    // Development from focusRecovery (lowest)
    expect(screen.getByText("Thinking Clarity")).toBeInTheDocument();

    // Practice modality for energy_endurance
    expect(screen.getByText("Energy Management")).toBeInTheDocument();
  });

  it("handles short insight without truncation", async () => {
    seedResponses();
    mockInvoke.mockResolvedValueOnce(makeResult({
      insight: "Short insight text.",
    }));
    renderResults();

    await waitFor(() => {
      expect(screen.getByText(/"Short insight text."/)).toBeInTheDocument();
    });
    // No "Read full analysis" button
    expect(screen.queryByText(/Read full analysis/i)).not.toBeInTheDocument();
  });

  it("handles all practice_priority_tag permutations", async () => {
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
      });

      unmount();
    }
  });

  it("falls back to 'Targeted Protocols' for unknown practice tag", async () => {
    seedResponses({ practice_priority_tag: "unknown_tag" });
    mockInvoke.mockResolvedValueOnce(makeResult());
    renderResults();

    await waitFor(() => {
      expect(screen.getByText("Targeted Protocols")).toBeInTheDocument();
    });
  });

  it("handles equal dimension scores", async () => {
    seedResponses();
    mockInvoke.mockResolvedValueOnce(makeResult({
      componentScores: { energyRegulation: 60, focusRecovery: 60, energyRenewal: 60 },
    }));
    renderResults();

    await waitFor(() => {
      // All scores render
      const sixties = screen.getAllByText("60");
      expect(sixties).toHaveLength(3);
    });

    // Strengths and development should still render (first/last of sort)
    expect(screen.getByText(/Strengths/i)).toBeInTheDocument();
    expect(screen.getByText(/Development Area/i)).toBeInTheDocument();
  });

  it("renders CTA and navigates to payment on click", async () => {
    seedResponses();
    mockInvoke.mockResolvedValueOnce(makeResult());
    renderResults();

    await waitFor(() => {
      expect(screen.getByText("Activate My System")).toBeInTheDocument();
    });

    screen.getByText("Activate My System").closest("button")?.click();
    expect(mockNavigate).toHaveBeenCalledWith("/onboarding/payment");
  });
});
