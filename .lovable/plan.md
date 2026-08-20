# When You Perform Best — Full Pattern Section Redesign

Goal: every sentence on this card is a positive, traceable, correctly-worded performance pattern — never a drain, never a mis-polarised phrase, never an unverified claim.

## How it works today

- The backend rhythm function mines check-in dimensions (clarity, emotion, pressure, regulation) and wearable dimensions (HRV, sleep score, duration, efficiency) for `peak-window`, `peak-day`, `cell-peak`, `consecutive-pos` and their negative twins, then sends finished sentences to the app.
- The app receives only `kind`, `dimension`, `text`, `confidence`, `observations`, `priorityScore` — the underlying day names, percentages and gaps are not in the payload.
- Section 2 additionally uses the separate performance-lift payload (sleep-to-peak, RHR recovery window, recovery streak, event/category lift).
- Negative findings (low-day, low-window, consecutive-neg) can currently reach this card.

## What changes

### 1. Structured findings from the backend (additive only)

Each finding gains a `stats` block (day, window, best %, comparison %, gap in pp, run length, delta %, observation count, observation dates, data source), a `confidenceTier` of `strong` or `emerging`, and a `polarity` flag per dimension. Sentence assembly moves into the app so all templates live in one place. No change to scoring, shared ranking weights, thresholds used elsewhere, or data sources.

### 2. RHR and HR rhythm mining added

The miner is extended to resting heart rate and heart rate series so `rhr` and `hr` day/window patterns can surface, using the same pattern kinds and guards as HRV. RHR is treated as inverted (lower is better). HR is only ever surfaced paired with a readiness outcome.

### 3. Card scope filter (`perform-best`)

Applied after ranking, before render, in both sections.

Kept — Section 1 (check-in): `cell-peak`, `peak-day`, `peak-window`, `consecutive-pos`, scoped to the active tab's dimension only.

Kept — Section 2 (physiology and demand): the same four kinds on hrv, rhr, hr, sleep_score, sleep_duration, sleep_efficiency, plus positive-only event lift, positive-only category lift, RHR recovery window, sleep-to-peak and recovery-streak signals.

Suppressed everywhere on this card, and not counted toward the cap: `low-day`, `low-window`, `consecutive-neg`, any event or category lift with a non-positive delta, and any drain, travel or cost finding.

### 4. Observation guard

Two tiers, checked before anything renders:

- Strong: peak-day/peak-window n>=6 with a 30pp gap; cell-peak n>=5 with 30pp; per-bucket window n>=5 with 20pp; 3-in-a-row streaks; lift signals n>=5 with at least 15% delta.
- Emerging: the same shapes at n>=3 with 20pp / 20pp / 15pp; 2-in-a-row streaks; lift signals n>=3 with at least 10% delta.

Anything below emerging is dropped silently.

### 5. Dimension polarity

Each dimension carries its positive direction and its adjective: clearest (clarity), most balanced (emotion), lowest-pressure (pressure), most regulated (regulation), best-recovered (HRV), most recovered (RHR, inverted), highest engagement (HR, event-lift context only), best sleep quality / longest sleep / most efficient sleep. "Sharpest" and "strongest" are never used for inverted dimensions, and "lowest heart rate" is never printed.

### 6. Ranking overrides on this card only

cell-peak 1.00, consecutive-pos 0.95, positive event lift 0.92, peak-day 0.85, RHR recovery 0.82, sleep-to-peak 0.80, peak-window 0.78, recovery streak 0.75, positive category lift 0.72. Shared ranking weights are untouched.

### 7. Caps

Top 3 per section, hard cap 3, maximum 6 on the card. No padding with weaker findings.

### 8. Sentence templates

All templates from the brief are implemented verbatim per kind and tier, with numerals not words, no `n=` in user-facing copy, no semicolons joining two facts, one idea per sentence. Strong tier reads definitively ("your peak", "your best"); emerging tier reads directionally ("trending", "early signal", "pattern still forming"). HR lift is always paired with the readiness outcome.

### 9. Empty states

- Under 3 check-ins: Section 1 shows "Patterns surface after a few check-ins. Keep going — your first signals are forming."; Section 2 shows "Wearable and calendar patterns will appear here once your data builds."
- 3–6 check-ins with emerging findings only: a muted line "Early patterns — building confidence with each check-in." above the findings.
- Data exists but nothing clears the guard: Section 1 shows "No clear positive check-in patterns yet for this window — your data is building."; Section 2 shows "No clear performance signals yet for this window — patterns will surface as your data grows."
- "Awaiting data from Apple Health." is removed. A section label never renders without content or an empty-state line beneath it.

### 10. Reliability audit panel

A `SHOW_PATTERN_DEBUG` flag, default off and never user-visible, renders a collapsible panel listing for every finding: dimension, kind, pipeline, tier, kept/suppressed with reason, final score, observation count and dates, raw values, gap, data source, section assignment, and rank before and after filtering. It also logs totals before and after filtering, suppression reasons, truncation from the soft cap, and which empty-state rule fired. Every visible sentence must have a matching entry.

## Technical notes

- Backend: `supabase/functions/performance-rhythm-insights/index.ts` — additive `stats`, `confidenceTier`, `polarity` on each finding; RHR and HR series added to the miner. Existing fields stay for backward compatibility.
- Frontend: `src/components/insights/PerformanceRhythmCard.tsx` plus new modules under `src/components/insights/patterns/` for polarity map, observation guard, card-scope filter, reweighting, sentence templates, empty states and the debug panel.
- Existing layout (header above the tabs, chevron-only check-in analysis, divider, physiology section) is preserved.
- Verification: unit tests for the guard, scope filter, reweighting and every template/tier pair; `tsgo` typecheck; visual pass at iPhone width across all four tabs, including empty-state and debug-on runs.
