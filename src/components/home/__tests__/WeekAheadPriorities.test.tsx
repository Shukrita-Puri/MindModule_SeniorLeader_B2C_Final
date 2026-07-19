import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

// ── Module mocks (must be hoisted before importing the component) ──
const invokeMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invokeMock(...args) } },
}));
vi.mock("@/services/authTokenService", () => ({
  getAuthToken: vi.fn(async () => null),
}));
vi.mock("@/config/devMode", () => ({
  DEV_MODE: false,
  DEV_USER: { id: "dev-user" },
}));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));

import WeekAheadPriorities from "../WeekAheadPriorities";

describe("WeekAheadPriorities", () => {
  beforeEach(() => invokeMock.mockReset());

  it("renders a valid populated response", async () => {
    invokeMock.mockResolvedValue({
      data: {
        weekAheadMode: { active: true, reason: "weekly_planning" },
        priorities: [
          {
            eventId: "e1",
            title: "Board Review",
            startTime: "2026-06-22T09:00:00Z",
            endTime: "2026-06-22T10:00:00Z",
            localDay: "2026-06-22",
            period: "morning",
            category: "Board",
            typeKey: "board",
            stakesLevel: "board",
            score: 82,
            scoreReasons: ["high stakes", "known relationship"],
            tags: ["high_stakes", "known_relationship"],
            isOrganizer: true,
          },
        ],
      },
      error: null,
    });

    render(<WeekAheadPriorities reason="weekly_planning" manualOverride={false} />);

    await waitFor(() => {
      expect(screen.getByText("Board Review")).toBeInTheDocument();
    });
    expect(screen.getAllByText(/Board/).length).toBeGreaterThan(0);
    // Tag chips render from `tags` (advisory only).
    expect(screen.getByText(/High stakes/)).toBeInTheDocument();
    expect(screen.getByText(/Known relationship/)).toBeInTheDocument();
  });

  it("renders a safe empty state when the response has no priorities", async () => {
    invokeMock.mockResolvedValue({
      data: { weekAheadMode: { active: true, reason: "weekly_planning" }, priorities: [] },
      error: null,
    });

    render(<WeekAheadPriorities reason="weekly_planning" manualOverride={false} />);

    await waitFor(() => {
      expect(
        screen.getByText(/No significant events on your calendar/i),
      ).toBeInTheDocument();
    });
  });

  it("does not crash when optional fields are missing on items", async () => {
    invokeMock.mockResolvedValue({
      data: {
        weekAheadMode: { active: true, reason: "weekly_planning" },
        // No scoreReasons / category / period / stakesLevel / score / times
        priorities: [
          { eventId: "e1", title: "Mystery Event" },
          { eventId: "e2", title: "Another", startTime: "2026-06-22T14:00:00Z" },
          { /* dropped — no id/title */ scoreReasons: null },
        ],
      },
      error: null,
    });

    render(<WeekAheadPriorities reason={null} manualOverride={false} />);

    await waitFor(() => {
      expect(screen.getByText("Mystery Event")).toBeInTheDocument();
      expect(screen.getByText("Another")).toBeInTheDocument();
    });
    // Default category fallback rendered, no crash on null scoreReasons.
    expect(screen.getAllByText(/Meeting/).length).toBeGreaterThan(0);
  });

  it("renders a recoverable error state when the invoke fails", async () => {
    invokeMock.mockResolvedValue({ data: null, error: new Error("boom") });

    render(<WeekAheadPriorities reason="weekly_planning" manualOverride={false} />);
    await waitFor(() => {
      expect(screen.getByText(/Couldn't load your upcoming week/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/Retry/i)).toBeInTheDocument();
  });

  it("shows a confirmation banner after clicking Save with a selection", async () => {
    invokeMock.mockImplementation((fn: string) => {
      if (fn === "list-week-ahead-priorities") {
        return Promise.resolve({
          data: {
            weekAheadMode: { active: true, reason: "weekly_planning" },
            priorities: [
              {
                eventId: "e1",
                title: "Board Review",
                startTime: "2026-06-22T09:00:00Z",
                endTime: "2026-06-22T10:00:00Z",
                localDay: "2026-06-22",
                period: "morning",
                category: "Board",
                typeKey: "board",
                score: 82,
                scoreReasons: [],
                tags: [],
              },
            ],
          },
          error: null,
        });
      }
      return Promise.resolve({ data: { ok: true }, error: null });
    });

    render(<WeekAheadPriorities reason="weekly_planning" manualOverride={false} />);
    await waitFor(() => expect(screen.getByText("Board Review")).toBeInTheDocument());

    const saveBtn = screen.getByRole("button", { name: /Save Week Ahead Priorities/i });
    expect(saveBtn).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /^Priority$/i }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Save Week Ahead Priorities/i })).not.toBeDisabled(),
    );

    fireEvent.click(screen.getByRole("button", { name: /Save Week Ahead Priorities/i }));
    await waitFor(() =>
      expect(
        screen.getByText(/Your Week Ahead priorities have been recorded/i),
      ).toBeInTheDocument(),
    );
  });
});