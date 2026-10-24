// [KIND: engine] [LAYER: 4] [TIERS: 0-3] [AUDIENCE: universal]
// Theme Tagging Engine (E-L4-7).
// Fixed vocabulary executive theme clustering.
// Source: Part 2 Layer 4 (Section 4C, E-L4-7).

import type { History } from "../types.ts";

export const CANONICAL_THEMES = [
  "focus_fragmentation",
  "meeting_overload",
  "leadership_presence",
  "recovery_deficit",
  "strategic_clarity",
  "stakeholder_alignment",
  "boundary_setting",
  "decision_fatigue",
] as const;

export type CanonicalTheme = (typeof CANONICAL_THEMES)[number];

export interface ThemeOccurrence {
  theme: CanonicalTheme;
  count: number;
  recentDates: string[];
}

export function extractThemes(history: History): ThemeOccurrence[] {
  const counts = new Map<CanonicalTheme, string[]>();

  for (const c of history.checkins) {
    if (c.tags && c.tags.length > 0) {
      for (const t of c.tags) {
        if (CANONICAL_THEMES.includes(t as CanonicalTheme)) {
          const list = counts.get(t as CanonicalTheme) ?? [];
          list.push(c.date);
          counts.set(t as CanonicalTheme, list);
        }
      }
    }
  }

  const results: ThemeOccurrence[] = [];
  for (const [theme, dates] of counts.entries()) {
    results.push({
      theme,
      count: dates.length,
      recentDates: dates.slice(-5),
    });
  }

  return results.sort((a, b) => b.count - a.count);
}
