## Why Shukrita didn't get an evening nudge (2026-07-01)

Audit of `notification_evaluator_traces` + `notification_log` for `google-oauth2|111878424918915566691`:

- **18:30 UTC (19:30 London)** — `smart-nudges` generated `nudge_three` ("Evening recalibration"), but it was **suppressed pre-evaluator** with `suppression_reason: 'back_to_back'`, `largest_gap_min: 0`. Row exists in `notification_log` with `delivery_state = 'suppressed'` — no APNs push was ever sent.
- Every 15-min run after 19:30 → blocked by `two_hour_suppression` (referencing that 18:30 suppressed send as `last_sent_at`).
- After 22:30 local → `outside_global_window`.
- Same pattern on 30 June (`nudge_three` suppressed at 18:15 UTC with `back_to_back`).

## Root cause

`supabase/functions/smart-nudges/index.ts` lines 4322-4365 (v1.1 back-to-back guard):

```ts
const upcoming = ctx.todayEvents
  .filter(e => e.end > nowMs && e.start < horizonMs)   // ← includes in-progress
  .sort(...);
let cursor = nowMs;
for (const ev of upcoming) {
  const gap = Math.max(0, Math.round((ev.start - cursor) / 60000));  // ← clamps negatives to 0
  ...
}
```

Today's `calendar_events` for the user:

```
Robinhood Presents: The World is Flat  18:00–19:00 UTC   (duplicate row)
Robinhood Presents: The World is Flat  18:00–19:00 UTC
```

At 18:30 UTC: both events are **in progress** (started 30 min ago). The filter keeps them (`end > now`), then `Math.max(0, negative)` collapses the gap to `0`, so `largestGapMin = 0 < BACK_TO_BACK_MIN_GAP_MIN` → suppressed. Duplicate rows amplify the effect but the bug fires on any single in-progress event.

This is a regression from the new SSOT §1.4 back-to-back cliff design: the intent is "meeting-to-meeting gap < 30 min → send an in-body, no-CTA nudge." Instead the current code (a) misclassifies a single in-progress meeting as back-to-back, and (b) fully drops the nudge instead of downgrading it. It also poisons the rest of the evening via the 2h-suppression window.

## Fix

Scope: `supabase/functions/smart-nudges/index.ts` back-to-back guard only. No changes to Plan/Brief/MRS.

1. **Redefine "upcoming" as strictly future** — `e.start > nowMs && e.start < horizonMs`. In-progress meetings are not gaps to measure; they're the current event.
2. **Require ≥ 2 future events** before the back-to-back gate can trigger. With `< 2` future events there is no meeting-to-meeting gap to test; skip the gate.
3. **Dedupe events** (`start_time + end_time + normalized title`) before the gap walk, so duplicate calendar rows can't collapse the gap to 0.
4. **Do not write a `suppressed` `notification_log` row** in the back-to-back branch when we skip. Writing it triggers `two_hour_suppression` for the next ~2 hours and kills the whole evening. Emit only a `trace(...)` with outcome `back_to_back_skip` so we keep observability without poisoning the cooldown window. (Keeping the suppressed row is only correct for the "notification IS the product" in-body variant — which we're not sending yet.)
5. **Add a unit test** in `supabase/functions/smart-nudges/v1_1_headline_cta_test.ts` covering:
   - single in-progress event → not back-to-back
   - duplicate rows for same event → not back-to-back
   - two future events 10 min apart → back-to-back
   - one future event only → not back-to-back

## Verification after deploy

- Re-run `smart-nudges` manually for the user via `supabase--curl_edge_functions` at an evening slot; expect `nudge_three` `delivery_state = 'accepted'` in `notification_log`, APNs 200.
- Confirm no new `back_to_back` suppression rows in `notification_log` for users whose only "conflict" is a single in-progress meeting.
- Watch `notification_evaluator_traces` for `back_to_back_skip` outcomes: should be rare, only when ≥ 2 future meetings actually crowd the horizon.

## Out of scope (flag only)

- Duplicate Robinhood event rows in `calendar_events` — likely an Apple Calendar sync dedupe bug, tracked separately.
- Building the actual in-body "notification IS the product" back-to-back variant from SSOT §1.4 — separate feature, not required to unblock tonight's nudges.
