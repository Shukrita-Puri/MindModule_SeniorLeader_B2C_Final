import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { useWeekAheadMode } from "../useWeekAheadMode";

function wrapper(initialEntries: string[] = ["/"]) {
  return ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
  );
}

describe("useWeekAheadMode", () => {
  afterEach(() => vi.useRealTimers());

  it("server decision active=true overrides local heuristic (Saturday clock)", () => {
    // Sat 20 Jun 2026 18:00 UTC
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-20T18:00:00Z"));
    const { result } = renderHook(
      () => useWeekAheadMode({ active: true, reason: "manual_override" }),
      { wrapper: wrapper() },
    );
    expect(result.current.active).toBe(true);
    expect(result.current.reason).toBe("manual_override");
  });

  it("server decision active=false overrides local Sunday assumption", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-21T12:00:00Z")); // Sun
    const { result } = renderHook(
      () => useWeekAheadMode({ active: false, reason: null }),
      { wrapper: wrapper() },
    );
    expect(result.current.active).toBe(false);
  });

  it("Saturday defaults to inactive when no server decision available", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-20T18:00:00Z")); // Sat
    const { result } = renderHook(() => useWeekAheadMode(null), { wrapper: wrapper() });
    expect(result.current.active).toBe(false);
  });

  it("Sunday defaults to active weekly_planning when no server decision", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-21T12:00:00Z")); // Sun
    const { result } = renderHook(() => useWeekAheadMode(null), { wrapper: wrapper() });
    expect(result.current.active).toBe(true);
    expect(result.current.reason).toBe("weekly_planning");
  });

  it("Saturday defaults to active weekly_planning for SA (Sunday-start country)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-20T18:00:00Z")); // Sat
    const { result } = renderHook(
      () => useWeekAheadMode(null, "SA"),
      { wrapper: wrapper() },
    );
    expect(result.current.active).toBe(true);
    expect(result.current.reason).toBe("weekly_planning");
  });

  it("manual override (?mode=week-ahead) wins over server inactive", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-20T18:00:00Z")); // Sat
    const { result } = renderHook(
      () => useWeekAheadMode({ active: false, reason: null }),
      { wrapper: wrapper(["/plan?mode=week-ahead"]) },
    );
    expect(result.current.active).toBe(true);
    expect(result.current.manualOverride).toBe(true);
  });
});