# Audit: "When You Perform Best" — Mental Performance Patterns

Verified against the current code (`src/components/insights/PerformanceRhythmCard.tsx`, `src/lib/insights/patternSentences.ts`).

## Already implemented (no work needed)

- Two visually separated sections with a single `h-px` divider, "A." check-in block (collapsible) and "B. Mental Performance Patterns / Based on physiology and demand data".
- Section 1 scoped to the active tab dimension, deduped by pattern shape.
- Positive-only card scope: only `peak-day`, `peak-window`, `cell-peak`, `consecutive-pos` survive; lows / negative deltas suppressed; `category_lift` filtered to `compositeLift > 0`.
- Hard cap of 3 per section (6 total), no padding.
- Observation guard with strong/emerging tiers and gap thresholds; below-emerging suppressed; 2-in-a-row = emerging, 3-in-a-row = strong.
- Polarity phrasing per dimension (pressure, RHR, HR read as inverted); no `n=` in user-facing copy; one idea per sentence.
- Empty states for no-data vs. below-threshold, per section; "Early patterns" note when all findings are emerging.
- Debug panel hidden behind `localStorage.patternDebug === '1'`, never user-visible.

## Gaps found

1. **`hr_event_lift` never renders.** The type exists and the backend returns it, but Section B only builds sentences from `sleep_to_peak`, `rhr_recovery_window`, `recovery_streak_to_peak` and `category_lift`. The spec's highest-weighted Pipeline B pattern (0.92) is missing entirely.
2. **Pipeline B has no observation guard.** Lift lines render off backend `confidence` only — the spec's n ≥ 5 / |Δ| ≥ 15 (strong) and n ≥ 3 / |Δ| ≥ 10 (emerging) thresholds are not applied, and there is no emerging-tier softened wording for these lines.
3. **Pipeline B is outside the reweighting.** `CARD_KIND_WEIGHT` covers only the four Pipeline A kinds. Lift lines are appended in fixed order (sleep → recovery → streak → categories) instead of ranked at 0.92 / 0.82 / 0.80 / 0.75 / 0.72 alongside Pipeline A wearable findings.
4. **Sentence templates for Pipeline B diverge from spec.** e.g. current "On well-recovered days your afternoon leads by +31%." vs. spec "Well-recovered mornings (RHR ≤ baseline): afternoon readiness lifts +31% vs non-recovered days — your best performance window." Same for sleep, streak, category.
5. **Two extra lines bypass the whole contract.** `Sharpest window: …` and `calendarInsight` are injected into Section B without a guard, tier, or ranking.
6. **Debug panel is partial.** It lists Pipeline A rows only, and omits: pipeline label (A/B), cardScope kept/suppressed with reason, final post-reweight `priorityScore`, section assignment, rank before/after filter, which empty-state rule fired, total check-in count, and the console summary block.
7. **Section labels differ from spec wording.** A reads "Mental Performance Patterns / Based on check-in data" (spec: "CHECK-IN PATTERNS / Based on your self-reported check-ins"). This was a later explicit request from you, so it is flagged, not changed.

## Proposed work (presentation layer only)

1. Extend `patternSentences.ts` with a Pipeline B finding type, tiering (`n`/`|Δ|` thresholds), spec sentence templates for `hr_event_lift`, `category_lift`, `rhr_recovery_window`, `sleep_to_peak`, `recovery_streak_to_peak`, plus emerging variants.
2. Add Pipeline B weights to the card-only weight table and rank Pipeline A wearable findings and Pipeline B lift lines in one list before the cap of 3.
3. Replace `buildBaselineLiftLines` with the new ranked builder; drop the ungated `Sharpest window` / `calendarInsight` lines from Section B (or route them through the same guard).
4. Enrich `PatternDebugRow` and the debug container with pipeline, tier, kept/suppressed + reason, final score, section, rank before/after, empty-state trigger, check-in count; add the equivalent `console.groupCollapsed` summary when debug is on.
5. Extend the existing unit tests to cover Pipeline B tiering, templates, ranking and caps.

## Constraints

No edge function, scoring, gating or data-source changes. No new network calls. Section A wording and the current header placement stay as-is unless you say otherwise.
