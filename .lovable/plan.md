## Goal
Redesign `/check-in-detail` (Page 2 — Body Performance Check-in) so it visually matches Page 1 (Mental Performance State Check) and uses one-word labels, the same luxury sliders, tooltip-driven explanations, and no icons or signal output. Persist all body fields into the existing `daily_checkins` table.

## Scope
- Replace the current Page 2 (Sharpness / Clarity / Confidence sliders) with a new Body Performance card.
- Remove the legacy Page 2 fields from this UI (the underlying columns stay in DB; brief logic untouched).
- Match Page 1 design exactly: same glass card, eyebrow row, font tokens, slider component, tooltip pattern, saffron CTA.

## Header (matches Page 1 eyebrow row)
- Left: eyebrow "Performance Readiness Assessment"
- Right: caption "Body Performance State Check"

## Sections (one-word labels, top → bottom)
Each section uses the same row layout as Page 1: label (with `InsightInfoModal` info icon) on the left, current state word on the right, then the slider, then end-labels.

1. **Sleep — Hours** — stepper (3.0–12.0, 0.5h step). Tooltip: "Sleep duration · combines with quality and wake type to triangulate sleep depth."
2. **Sleep — Quality** — 4-step luxury slider (Poor / OK / Good / Great). Tooltip: "Subjective sleep quality — how restorative the night actually felt."
3. **Sleep — Wake Type** — 3-step slider (Alarm groggy / Alarm / Natural). Tooltip: "How you woke up — natural waking signals deeper recovery; groggy alarm signals sleep debt."
4. **Tension** — 5-step luxury slider, ends Tight ↔ Loose. Tooltip: "Somatic stress signature — tight chest, jaw, shoulders. Earliest physical stress signal."
5. **Energy** — 5-step luxury slider, ends Depleted ↔ Peak. Tooltip: "Body fuel available right now · recovery readiness signal."
6. **Recovery** — 4-step luxury slider, ends None ↔ Active. Tooltip: "What you actually did yesterday — determines whether carry-over load is resilient or compounding."
7. **Carry** — 4-step luxury slider, ends Fresh ↔ Fumes. Tooltip: "Allostatic load — cumulative stress debt · primary burnout signal."

Removed from upload: signal output pills, readiness summary block, inline warnings, all icons, the per-section "why" subtitles (moved into tooltip text).

## CTA
Saffron button at bottom of card: "Continue to Today's Performance" — disabled until all 7 inputs touched. Same disabled/enabled styling as Page 1.

## DB strategy — recommendation
**Extend `daily_checkins`. Do NOT create a new table.**

Reasons:
- A single check-in (date + time_window) already represents one full readiness snapshot. Mental + body belong to the same row so the brief, scoring, energyState, RLS, and snapshot reads keep working unchanged (no joins, no new edge actions, no new caches).
- `daily_checkins` already grew this way (clarity / confidence / mental_sharpness / emotion / pressure / regulation are columns, not a sibling table).
- Per-row size is tiny; a separate `body_checkins` table would add an extra round-trip to every brief generation and every Insights query for zero benefit.

New columns to add (all nullable, ints unless noted):
- `sleep_hours numeric(3,1)` (3.0–12.0)
- `sleep_quality smallint` (1–4)
- `sleep_wake_type smallint` (1–3)
- `body_tension_level smallint` (1–5)
- `body_energy_level smallint` (1–5)
- `recovery_yesterday_level smallint` (1–4)
- `carry_load_level smallint` (1–4)

Validation via a small trigger (mirrors `validate_time_window`) — no CHECK constraints (per project convention).

Edge function `daily-checkins` gains a new action `UPDATE_BODY_CHECKIN` that accepts `{checkinId | (checkinDate+timeWindow), sleepHours, sleepQuality, sleepWakeType, tension, energy, recovery, carry}` and writes those columns. Page 2 calls it on Save (same auth/dev-mode branching as today). Cache invalidation (energy state, brief, plan, outer readiness) reuses the existing block from `CheckInDetail.handleSave`.

## Files to change
- `src/pages/CheckInDetail.tsx` — full rewrite of card body; reuse `Slider` (luxury variants), `InsightInfoModal`, glass-card classes, eyebrow row, saffron CTA from Page 1.
- `supabase/functions/daily-checkins/index.ts` — add `UPDATE_BODY_CHECKIN` action.
- One new migration — add the 7 columns + trigger.
- (Optional follow-up, not in this plan) `src/utils/dailyCheckins.ts` `CheckinData` typing extension once the columns exist.

## Out of scope
- Brief / scoring / Insights consumption of the new fields (separate task once data starts flowing).
- Removing the legacy `mental_sharpness_level` / `confidence_level` columns.
- Any change to Page 1.

Ready to implement on approval.