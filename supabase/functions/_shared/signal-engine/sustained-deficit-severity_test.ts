// Graded sustained-deficit read (Resilience Capacity pill only).
// The boolean flag consumed by MRS / plan / nudges is unchanged; these
// tests cover the additive severity read.

import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { computeSustainedDeficitSeverity } from "./pattern-engine.ts";

const day = (n: number) => {
  const d = new Date(Date.UTC(2026, 7, 7));
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().split("T")[0];
};

Deno.test("SDS-01: no samples -> unknown", () => {
  assertEquals(computeSustainedDeficitSeverity([]), "unknown");
});

Deno.test("SDS-02: single recent sample -> unknown (never blocks)", () => {
  assertEquals(
    computeSustainedDeficitSeverity([{ date: day(0), hrv: 20 }], day(0)),
    "unknown",
  );
});

Deno.test("SDS-03: marked strain across two recent days -> red", () => {
  const rows = [
    { date: day(0), hrv: 18 },
    { date: day(1), hrv: 19 },
    ...[6, 7, 8, 9, 10, 11, 12].map((n) => ({ date: day(n), hrv: 30 })),
  ];
  assertEquals(computeSustainedDeficitSeverity(rows, day(0)), "red");
});

Deno.test("SDS-04: mild strain -> amber", () => {
  const rows = [
    { date: day(0), hrv: 27 },
    { date: day(1), hrv: 27 },
    ...[6, 7, 8, 9, 10].map((n) => ({ date: day(n), hrv: 30 })),
  ];
  assertEquals(computeSustainedDeficitSeverity(rows, day(0)), "amber");
});

Deno.test("SDS-05: at baseline -> green", () => {
  const rows = [
    { date: day(0), hrv: 30 },
    { date: day(1), hrv: 31 },
    ...[6, 7, 8].map((n) => ({ date: day(n), hrv: 30 })),
  ];
  assertEquals(computeSustainedDeficitSeverity(rows, day(0)), "green");
});

Deno.test("SDS-06: averages, not streaks -- one good day does not erase strain", () => {
  const rows = [
    { date: day(0), hrv: 18 },   // -deep
    { date: day(2), hrv: 26 },   // near baseline, would break a streak
    ...[6, 7, 8, 9, 10].map((n) => ({ date: day(n), hrv: 30 })),
  ];
  assertEquals(computeSustainedDeficitSeverity(rows, day(0)), "amber");
});

Deno.test("SDS-07: samples older than the 5-day lookback are ignored", () => {
  const rows = [
    { date: day(8), hrv: 10 },
    { date: day(9), hrv: 10 },
    { date: day(10), hrv: 30 },
  ];
  assertEquals(computeSustainedDeficitSeverity(rows, day(0)), "unknown");
});

Deno.test("SDS-08: null / non-finite HRV rows are skipped safely", () => {
  const rows = [
    { date: day(0), hrv: null },
    { date: day(1), hrv: undefined },
    { date: day(2), hrv: 0 },
  ];
  assertEquals(computeSustainedDeficitSeverity(rows as any, day(0)), "unknown");
});
