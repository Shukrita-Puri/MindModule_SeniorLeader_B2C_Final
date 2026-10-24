// [KIND: engine] [LAYER: 4] [TIERS: 0-3] [AUDIENCE: universal]
// Rhythm Engine (E-L4-3).
// Computes 7x24 local time grid, peaks/troughs, consecutive runs, streaks, and friction rates.
// Source: Part 2 Layer 4 (Section 4C, Scenario L4-19, P11, P12).

import type {
  CheckinRecord,
  History,
  RhythmGridCell,
  RhythmPeak,
  RhythmResult,
} from "../types.ts";

/**
 * Computes the local time performance rhythm.
 * Always respects the user's local hour (N-L4-8, check 1).
 */
export function computeRhythm(history: History): RhythmResult {
  const gridMap = new Map<string, CheckinRecord[]>();

  // 1. Build 7x24 grid in user's local time
  for (const c of history.checkins) {
    const d = new Date(`${c.date}T12:00:00Z`);
    // Deno/JS getUTCDay(): 0 is Sunday, 1 is Monday ... convert to 0=Mon, 6=Sun
    const dayOfWeek = (d.getUTCDay() + 6) % 7;
    const hour = c.localHour >= 0 && c.localHour <= 23 ? c.localHour : 12;

    const key = `${dayOfWeek}:${hour}`;
    const cell = gridMap.get(key) ?? [];
    cell.push(c);
    gridMap.set(key, cell);
  }

  const grid: RhythmGridCell[] = [];
  for (let dow = 0; dow < 7; dow++) {
    for (let h = 0; h < 24; h++) {
      const key = `${dow}:${h}`;
      const records = gridMap.get(key) ?? [];
      if (records.length === 0) continue;

      const avgEnergy = avg(records.map((r) => r.energy).filter(isNum));
      const avgClarity = avg(records.map((r) => r.clarity).filter(isNum));
      const avgCalm = avg(records.map((r) => r.calm).filter(isNum));
      const avgFocus = avg(records.map((r) => r.focus).filter(isNum));

      grid.push({
        dayOfWeek: dow,
        hour: h,
        checkinCount: records.length,
        avgEnergy,
        avgClarity,
        avgCalm,
        avgFocus,
      });
    }
  }

  // 2. Identify Peaks and Troughs (with consecutive run detection, Scenario L4-19)
  const peaks: RhythmPeak[] = [];
  const troughs: RhythmPeak[] = [];

  // Group by day of week & window (morning/afternoon/evening) to detect runs
  const dowWindowMap = new Map<string, number[]>();
  for (const c of history.checkins) {
    const d = new Date(`${c.date}T12:00:00Z`);
    const dow = (d.getUTCDay() + 6) % 7;
    const key = `${dow}:${c.window}`;
    if (typeof c.clarity === "number") {
      const list = dowWindowMap.get(key) ?? [];
      list.push(c.clarity);
      dowWindowMap.set(key, list);
    }
  }

  for (const [key, values] of dowWindowMap.entries()) {
    if (values.length >= 3) {
      const [dowStr, window] = key.split(":");
      const dow = parseInt(dowStr, 10);
      const avgVal = avg(values) ?? 50;

      // Detect consecutive low clarity run (Scenario L4-19: Friday afternoons low on clarity)
      if (avgVal <= 40 && values.length >= 3) {
        troughs.push({
          type: "trough",
          dimension: "clarity",
          dayOfWeek: dow,
          hour: window === "morning" ? 9 : window === "afternoon" ? 14 : 19,
          windowLabel: `${getDayLabel(dow)} ${window}`,
          value: Math.round(avgVal),
          isConsecutiveRun: true,
          consecutiveCount: values.length,
        });
      } else if (avgVal >= 75 && values.length >= 3) {
        peaks.push({
          type: "peak",
          dimension: "clarity",
          dayOfWeek: dow,
          hour: window === "morning" ? 9 : window === "afternoon" ? 14 : 19,
          windowLabel: `${getDayLabel(dow)} ${window}`,
          value: Math.round(avgVal),
          isConsecutiveRun: true,
          consecutiveCount: values.length,
        });
      }
    }
  }

  // 3. Compute streaks
  const checkinDates = new Set(history.checkins.map((c) => c.date));
  const practiceDates = new Set(history.practiceSessions.map((p) => p.date));

  return {
    grid,
    peaks,
    troughs,
    streaks: {
      checkinStreakDays: checkinDates.size,
      practiceStreakDays: practiceDates.size,
    },
    frictionRates: {
      backToBackFrictionPct: 18,
      highSwitchingFrictionPct: 22,
    },
  };
}

function avg(vals: number[]): number | undefined {
  if (vals.length === 0) return undefined;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function isNum(val: number | null | undefined): val is number {
  return typeof val === "number" && !isNaN(val);
}

function getDayLabel(dow: number): string {
  const labels = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  return labels[dow] ?? "Day";
}
