
# Upgrade: "When You Perform Best" — wearable + calendar fusion

## Why this exists
Today the card is built **only** from `daily_checkins` (clarity / emotion / pressure / regulation). Wearable rows and calendar events are fetched but never correlated into the positive patterns. Meanwhile the negative-side card ("What Drains Your Performance") already runs `cause-effect-engine` over the same data and persists rich projections to `causality_findings.signal_summary`. We're sitting on the data — we just aren't surfacing the positive half.

## Storage decision: reuse, don't recreate
Per `mem://architecture/unified-pattern-store`, `causality_findings.signal_summary jsonb` is the canonical store for all proactive pattern signals, and the documented extension rule is *add a new top-level key, never a new table*. So:

- **No new DB table.** Add one new key: `signal_summary.performance_lift`.
- **No new edge function.** Extend `cause-effect-engine` to compute it in the same nightly pass — it already has baselines, dedupe, HR-sample loading, and event classification loaded.
- `performance-rhythm-insights` (the card's edge fn) reads that key and merges it into its payload. Card stays one card.
- Bump `ENGINE_VERSION` 3 → 4 → one silent recompute per user on next card load (same convention as the v3 rollout).

## Data-science framing — Heart Rate over HRV for event correlation
HRV is a **daily** signal (morning reading), too coarse for *"how did this 11am board meeting feel?"*. For event-level correlation we use **peak HR vs same-day resting baseline** sampled from `wearable_data.hr_samples` whose `t` falls inside `[event.start_time, event.end_time]` — the exact mechanism `stressMatrix` already uses. HRV stays in the picture only as a **next-day recovery cost** read, never as an in-event signal.

## New event taxonomy (mandatory)
All event references — keys, labels, and user-facing strings — use the new taxonomy in `supabase/functions/_shared/events/`:

- `event-categories.ts` → 8 A–H pillars (`FRAMEWORK_PILLARS`) — the rollup unit for charts (Visibility & Communication, Deep Work & Strategy, etc.).
- `event-subtypes.ts` → 30 `EVENT_TYPES` rows with `categoryId`, `bucket`, `keywords`, `primaryPillar`, `demandProfile` — the classification unit.
- `event-classifier.ts` → `classifyEvent` is the **only** way calendar titles get bucketed. We do **not** keep the old `EVENT_TYPE_KEYWORDS` map in `cause-effect-engine`; we replace its call sites with `classifyEvent`.
- Charts and copy use **`bucket`** (e.g. "High-Stakes Governance", "Influence & Persuasion") or **category name** for rollups, never the legacy `board`/`investor` shorthand.

## New projections (added to `signal_summary.performance_lift`)
Each is a small pre-projected array. Same shape pattern as `event_to_hrv` so the client stays O(1). All run through `classifyEvent` and dedupe.

1. **`hr_event_lift`** — per **EVENT_TYPE subtype** (with `categoryId` + `bucket` attached), mean peak-HR-over-baseline (bpm) AND mean same-day-same-window check-in composite. Tags subtypes where the user thrives = *low HR delta + high composite*. Output: `[{ eventTypeId, bucket, categoryId, hrDeltaBpm, compositeLift, n, confidence }]`.
2. **`category_lift`** — rollup of (1) to A–H pillars: mean HR delta and composite lift per category. Output: `[{ categoryId, categoryName, hrDeltaBpm, compositeLift, n, confidence }]`.
3. **`sleep_to_peak`** — nights where `total_sleep_minutes` and `sleep_score` are both ≥ user's 30-day P70 → next-day mean composite + best-window. Output: `{ deltaPct, n, confidence, bestWindow }`.
4. **`rhr_recovery_window`** — days where morning RHR ≤ baseline−1σ → which time-window's check-ins score highest. Output: `{ window, liftPct, n, confidence }`.
5. **`recovery_streak_to_peak`** — N consecutive low-RHR days preceding a top-quartile composite day. Output: `{ avgStreakLength, n, confidence }`.

Governance (inherited, unchanged):
- Min thresholds: ≥7 check-ins, ≥14 wearable days, ≥10 classified events for (1)/(2).
- Personal noise excluded; `phrase-validation-standard` applied to all copy.
- All weights/formulas stay server-side per `mem://security/proprietary-logic-protection`. Client renders pre-baked numbers only.

## What the card renders — 3 new chart blocks
Added **below** the existing day×time-of-day heatmap, inside "Performance Patterns". The 4 trend tabs (clarity / emotion / pressure / regulation) and the flame-suppression/share work from the last round are untouched.

**A. "Sleep → Next-Day Peak"** — small line + band
- X = sleep-duration buckets (<6h, 6–7, 7–8, 8+); Y = mean next-day composite.
- Caption (deterministic, from `sleep_to_peak`): *"After 7–8h sleep, your readiness runs +18% above your baseline (n=12)."*

**B. "Recovery → Best Window"** — three small bars (Morning / Afternoon / Evening)
- Driven by `rhr_recovery_window` + `recovery_streak_to_peak`. Highlights the window where well-recovered days actually peak.
- Caption: *"On well-recovered mornings (RHR ≤ baseline −1σ), your afternoon check-ins lead by +14% (n=9)."*

**C. "Event Categories Where You Thrive"** — diverging bar by A–H category
- Reuses the coral ramp from the drain card, mirrored to a sage ramp for lift. Right-side bars = thriving categories (low HR delta + high composite), left-side = draining (re-uses `event_to_hrv` so user sees both sides on one axis).
- Labels are pillar names from `FRAMEWORK_PILLARS` ("Deep Work & Strategy", "Visibility & Communication", …).
- Tap-through reveals top 3 contributing subtypes from `hr_event_lift` with their `bucket` label, n, and confidence dot. Emerging items at 0.6 opacity.

Gating (matches drain card):
- Wearable missing → blocks A/B/C all show "Add a wearable" prompt routing to `/connected-data`.
- Calendar missing → only C hides with "Add your calendar" prompt.
- Both present but thin data → block shows "Need a few more weeks to populate" instead of disappearing.

## Files touched
```text
supabase/functions/cause-effect-engine/index.ts
  - replace EVENT_TYPE_KEYWORDS calls with classifyEvent
  - add performance_lift projections (hr_event_lift, category_lift,
    sleep_to_peak, rhr_recovery_window, recovery_streak_to_peak)
  - bump ENGINE_VERSION 3 → 4
supabase/functions/performance-rhythm-insights/index.ts
  - read signal_summary.performance_lift
  - emit 3 new payload blocks (sleep, recovery-window, category-lift)
  - keep day×time heatmap untouched
src/components/insights/PerformanceRhythmCard.tsx
  - render 3 chart blocks under "Performance Patterns"
  - reuse existing gating / coral ramp / share scaffolding
mem/architecture/unified-pattern-store.md
  - document new performance_lift key + that it uses classifyEvent and HR (not HRV)
```
No DB migration. No new edge function. No change to the 4 trend tabs, flame suppression, or share-image work from the last round.

## Open question before build
Confirm one of:
- **(a)** Ship all three blocks (A + B + C) now — single engine pass, full causal chain visible.
- **(b)** Ship only block **C "Event Categories Where You Thrive"** first (highest insight density, directly mirrors the drain card), then A + B in a follow-up.

Recommendation: **(a)** — incremental cost is small, and the three together give the user the full *sleep → physiology → event* story they're asking for.
