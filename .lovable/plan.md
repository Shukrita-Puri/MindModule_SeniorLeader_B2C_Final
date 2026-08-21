# Hide the reliability audit + close the remaining spec gaps

The audit panel is showing because it auto-enables for the founder account ID. Spec section 10 says it must be default off and never user-visible. Fixing that, plus the parts of the redesign that are not yet implemented.

## 1. Reliability audit panel — hide it

- Remove the founder-account auto-enable. The panel renders only when `localStorage.patternDebug = '1'` is set manually (dev/support escape hatch), never for a signed-in user by default.
- Keep the panel code and the debug row itself, so a debug run can still be done on demand.

## 2. Suppress negative lift lines (spec 3)

Currently the physiology/demand section prints drain lines such as "Travel cost you the most — -5.9% on readiness." Card scope is positive-only, so:

- Drop the `draining` category-lift block entirely.
- Keep only lift signals with a positive delta; drop sleep-to-peak / recovery-window lines when their delta is not positive.

## 3. Observation guard with gap thresholds (spec 4)

Today the guard only checks observation count (n>=3 emerging, n>=5 strong) plus a 50% floor. Add the gap requirement:

- Strong: peak-day / peak-window n>=6 and gap >= 30pp; cell-peak n>=5 and gap >= 30pp; streaks of 3; lift signals n>=5 and delta >= 15%.
- Emerging: same shapes at n>=3 with 20pp / 20pp / 15pp; streaks of 2; lift signals n>=3 and delta >= 10%.
- Anything below emerging is dropped silently (no line, no label).

## 4. Card-only ranking overrides (spec 6)

Apply a per-kind weight inside the card's section builder only (shared backend ranking untouched): cell-peak 1.00, consecutive-pos 0.95, positive event lift 0.92, peak-day 0.85, RHR recovery 0.82, sleep-to-peak 0.80, peak-window 0.78, recovery streak 0.75, positive category lift 0.72. Strong tier still outranks emerging; ties break on the override, then on backend priority score.

## 5. Caps (spec 7)

Hard cap 3 per section, including the lift lines in section 2 (currently the lift lines are appended on top of 3 findings, so section 2 can exceed the cap). Max 6 sentences on the card.

## 6. Empty states and the early-pattern line (spec 9)

Replace the current copy with the spec wording:

- No data yet: Section 1 "Patterns surface after a few check-ins. Keep going — your first signals are forming." / Section 2 "Wearable and calendar patterns will appear here once your data builds."
- Data exists but nothing clears the guard: Section 1 "No clear positive check-in patterns yet for this window — your data is building." / Section 2 "No clear performance signals yet for this window — patterns will surface as your data grows."
- Only emerging findings present: a muted "Early patterns — building confidence with each check-in." line above them.

## 7. Sentence copy (spec 8)

Remove the trailing `(n=5)` from user-facing sentences — observation counts stay in the debug panel only. Strong tier reads definitively; emerging tier stays hedged ("early signal", "trending"). One idea per sentence, no semicolons.

## Technical notes

Files: `src/lib/insights/patternSentences.ts` (guard with gap thresholds, ranking overrides, cap, empty-state copy, drop `n=` suffix) and `src/components/insights/PerformanceRhythmCard.tsx` (debug gating, positive-only lift lines, cap including lift lines, early-pattern line). No backend, scoring, or data-source changes — the backend already emits `stats`, polarity, RHR and HR findings.

Verification: extend `src/lib/insights/__tests__/patternSentences.test.ts` for the guard tiers, ranking overrides, cap and each template/tier pair; `tsgo` typecheck; iPhone-width visual pass across all four tabs confirming no audit panel is visible.
