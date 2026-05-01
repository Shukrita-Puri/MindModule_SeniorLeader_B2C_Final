## Scope

Isolated change to **one card** on `/insights` → Patterns tab: `PerformanceCausalityCard`. Replace the current text-based lenses UI with a tabbed heatmap card matching the uploaded HTML. Show only **Stress Load** and **Burnout Risk** tabs; compute Sleep Disruption and Recovery Cost silently in the engine for later surfacing. Add a wearable+calendar gating prompt for users missing connections.

Two non-negotiables from feedback:
1. **No proprietary logic in the UI.** Formula footnotes, "How burnout risk is computed", "Where leading indicators fit here" — all stay server-side as edge-function comments + scoring code. The UI shows numbers, colors, and short headings only.
2. **True event-window causation.** Stress Load uses *peak HR during the event window* − *30-day resting HR baseline*, not a day-max proxy. Requires a small, additive schema + bridge change.

No other cards, pages, or downstream consumers (`smart-nudges`, coach context, mastery plan) are touched. The existing `signal_summary` projection in `causality_findings` is preserved exactly so `smart-nudges` keeps working.

---

## What ships

### 1. New card UI (`src/components/insights/PerformanceCausalityCard.tsx`, full replacement)

- Pill tab bar at top: **Stress Load** (default) · **Burnout Risk**. Same visual style as the uploaded HTML (rounded pill, active = filled background).
- **Stress Load tab**
  - Section label + sub-label ("Immediate signal · continuous · no check-in needed")
  - Coral dim-pill caption: "Heart rate spike during event window vs your resting HR"
  - 5×N heatmap: rows = Mon–Fri, columns = the user's actual top event types (max 7, ranked by frequency; column header truncates with `title` attr). Empty cells render as faintest coral stop.
  - Cell value: `+{X}bpm` rounded. Cell background = coral ramp from the HTML (`#FAECE7 → #F5C4B3 → #F0997B → #D85A30 → #993C1D → #712B13 → #4A1B0C`).
  - Coral legend row underneath (Calm / Moderate / High stress / Acute load).
  - 3-stat row: highest-cell event peak, lowest-cell event peak, highest-load weekday.
  - **No formula footnote.** No explainer text describing how the spike is computed.
- **Burnout Risk tab**
  - Section label + sub-label ("Weekly view")  ← short, non-revealing
  - 4-row × 5-week intensity matrix. Rows: Calendar load (`#D85A30`), RHR trend ↑ (`#EF9F27`), HRV trend ↓ (`#534AB7`), Sleep deficit (`#185FA5`). Each cell = solid color with `opacity = 0.1 + (intensity/5) * 0.9`.
  - Week labels under the grid: "4 wks ago … This week".
  - Risk-trajectory banner (color depends on direction: escalating = coral; stable = neutral; improving = sage). Banner copy is one-line, descriptive only ("Risk trajectory: escalating") with **no formula breakdown**.
  - **No "How burnout risk is computed" card. No "Where leading indicators fit here" card.** These are deleted from the UI entirely. The logic, weights, and contributing-signal list live exclusively in the edge function as code + comments.
- **Empty / gating state** (when both `!coverage.hasWearable && !coverage.hasCalendar`):
  - Headline: "Connect your wearable & calendar to unlock cause and effect"
  - Body: short paragraph explaining that this card maps how meeting types and load streaks affect HR, HRV, sleep, and burnout risk — and that **check-ins alone won't populate it** (sets honest expectation per spec). No formula language.
  - Two inline CTAs: "Connect wearable" → wearable settings route, "Connect calendar" → calendar settings route. Each CTA hides individually if that source is already connected.
  - When wearable is connected but calendar isn't (or vice versa), show a partial banner above the active tab: "Add {missing} to fill out this view."
- **Partial-data state**: if a tab has `< MIN_OCCURRENCES_EMERGING` data, render the heatmap shell greyed out with an inline note ("Need a few more {events|wearable days} to populate") — phrasing kept generic, no thresholds revealed.
- **Tooltips**: on cell hover, show event/day/value + `n=` + confidence pill ("strong" / "emerging") sourced from the engine. No random numbers, no formula reveal.
- Preview/mock path stays the same: when `shouldUsePreviewMock(false)` is true and there's no auth, render a mock matrix from `causalityMockData.ts`.

### 2. Engine changes (`supabase/functions/cause-effect-engine/index.ts`)

Bump `ENGINE_VERSION` from `2 → 3` so the client auto-recomputes stale rows (mechanism already exists). All proprietary logic, formulas, weights, and signal-combination rules live here as code + code comments — never echoed to the client. Additive projections inside the existing payload, existing fields untouched:

- **`stressMatrix`** — true event-window peak HR delta, NOT a day-max proxy:
  - For each calendar event in the 30-day window with a paired wearable day:
    - Read timestamped HR samples for `[event.start_time, event.end_time]` from the new `wearable_data.hr_samples` jsonb (see §3 below). Pick max value in that window = `peakHr`.
    - Resting baseline = trailing 30-day mean of `wearable_data.resting_heart_rate`.
    - Cell value = `peakHr − restingBaseline` (bpm).
  - Aggregate cells by `(weekday, event_type_bucket)` using the engine's existing keyword classifier (and `calendar_event_classifications` opportunistically when present).
  - Returned shape: `{ events: string[], days: ['Mon'..'Fri'], cells: number[][], n: number[][], maxObserved: number, confidence: ('strong'|'emerging'|null)[][] }`.
  - **Fallback rule (data-honest):** if `hr_samples` is empty for a given event window, the cell is omitted (not faked with day-max). Surfaces as "need more data" in the UI rather than a misleading number.
- **`burnoutMatrix`** — 4 dimensions × 5 weeks (week index 0 = 4 wks ago, 4 = this week):
  - `load` = z-scored sum of calendar minutes per week, mapped to 1–5.
  - `rhr` = slope of `resting_heart_rate` rolling 7-day mean, mapped to 1–5 (positive slope → higher).
  - `hrv` = slope of `hrv` rolling 7-day mean, inverted (negative slope → higher).
  - `sleep` = count of nights/week with `sleep_score` < user's 30-day baseline, mapped to 1–5.
  - Dimension `trajectory: 'escalating' | 'stable' | 'improving'` based on week-0 vs week-4 delta. Card-level trajectory = worst of the four.
  - Optional Resilience-pill modifier (from check-ins) is applied server-side as a multiplier on the final risk score only — never exposed in the payload as a separate field.
  - Returned shape: `{ weeks: ['4 wks ago'..'This week'], dims: [{ key, label, color, weekly: number[1..5], trajectory }], cardTrajectory, bannerCopy }`. `bannerCopy` is a short pre-baked sentence; no breakdown of weights or contributing signals is sent.
- **Silent computation for Sleep Disruption & Recovery Cost**: add `sleepDisruptionMatrix` and `recoveryCostTimeline` projections using the same data that already powers Lens C/D. They are written to the payload but **the new card simply does not render their tabs**. Satisfies "keep measuring, surface later" without a second backfill when the tabs are added.
- `signal_summary` (read by `smart-nudges`) is **not** modified — fully backward compatible.

### 3. Database changes — minimum required, additive only

Two migrations, both additive:

1. **Add `hr_samples jsonb DEFAULT '[]'` to `public.wearable_data`.** Mirrors the existing `hrv_samples` pattern. Stores `[{ t: ISO8601, v: bpm }, …]` for the day. Indexed via existing `(user_id, summary_date)` PK.
2. No other column or table is needed. Reuse:
   - `wearable_data.resting_heart_rate` (already present) for the baseline denominator.
   - `wearable_data.hrv`, `sleep_score`, `total_sleep_minutes` (already present) for burnout dims.
   - `calendar_events.start_time / end_time / title / attendees_count` (already present) for event windows + bucketing.
   - `calendar_event_classifications.event_type` (already present) opportunistically for higher-fidelity buckets.
   - `causality_findings.payload jsonb` (already present) as the single home for the new matrices.

### 4. iOS HealthKit bridge change (`ios/App/App/WearableSyncBridge.swift`)

Today the bridge reads `.heartRate` samples then collapses them to a daily average (`entry["heart_rate"] = Int(round(value))` at line 137). Update so that, in addition to the daily average, the bridge emits the per-sample array:

```swift
entry["hr_samples"] = samples.map { ["t": $0.startDate.iso8601, "v": Int(round($0.value))] }
```

`persist-wearable-data` edge function then writes this array into the new `hr_samples` column. JS-side equivalent in `src/utils/healthKitCapacitor.ts` to keep parity for users on the JS Capacitor health plugin path.

This is the single safe, complete fix for true event-window causation. Without it, day-max HR can't honestly be tied to a specific meeting (e.g. a 9am board call vs a 4pm gym workout would be conflated).

### 5. Connection-status detection

Already in the payload as `coverage.hasCalendar` and `coverage.hasWearable`. The card uses these directly to drive the gating prompt — no new query needed.

---

## Files touched

- `src/components/insights/PerformanceCausalityCard.tsx` — full rewrite (tabs + 2 heatmaps + gating prompt). No formula text, no explainer cards.
- `src/components/insights/causalityMockData.ts` — extend mock with `stressMatrix` and `burnoutMatrix` so preview/Lovable iframe still demos correctly.
- `supabase/functions/cause-effect-engine/index.ts` — bump `ENGINE_VERSION` to 3; add `stressMatrix` (event-window peak HR), `burnoutMatrix`, `sleepDisruptionMatrix`, `recoveryCostTimeline` projections. ~150 LOC added, no existing logic removed. All weights, formulas, modifier rules stay here.
- `supabase/functions/persist-wearable-data/index.ts` — accept and persist `hr_samples` array.
- `ios/App/App/WearableSyncBridge.swift` — emit per-sample HR array alongside daily average.
- `src/utils/healthKitCapacitor.ts` — emit per-sample HR array on the JS Capacitor health plugin path.
- One migration: `ALTER TABLE public.wearable_data ADD COLUMN hr_samples jsonb NOT NULL DEFAULT '[]'::jsonb;`
- `mem/features/insights/performance-causality.md` — update to note the new payload fields, the two new tabs, the silent-compute Sleep/Recovery contract, and the no-proprietary-text-in-UI rule.

## Files NOT touched

- `src/pages/Insights.tsx` — only consumes `PerformanceCausalityCard` as a black-box import; no API change.
- `supabase/functions/smart-nudges/*` — `signal_summary` is unchanged.
- `mem/architecture/unified-pattern-store.md` — `signal_summary` schema unchanged.
- All other insights cards, coach context builders, mastery-plan logic, brief logic.

## Safety / rollout

1. Engine changes are additive; old clients reading the old payload keep working.
2. `ENGINE_VERSION` bump triggers one-time silent recompute per user on next card load (mechanism already implemented).
3. New `hr_samples` column defaults to `'[]'` so existing rows are unaffected; engine treats empty `hr_samples` as "no event-window data yet" and shows the partial-data state for affected cells until the next iOS sync backfills samples for new days. Historical days never get retroactive samples — honest by design.
4. Card falls back to "no patterns yet" gating prompt if `stressMatrix`/`burnoutMatrix` are missing during the first request before recompute lands.
5. Mock data path preserved for Lovable preview / unauthenticated reviews.
6. Proprietary logic protection: every formula, weight, threshold, and modifier rule lives in the edge function source. The client receives only rendered numbers, colors, sample sizes, confidence tiers, and short pre-baked banner sentences.

Approve to implement.