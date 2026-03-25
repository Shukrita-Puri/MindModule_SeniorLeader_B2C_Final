

# Plan: JIT Mastery Plan — Six-Stage Pipeline Logic Evolution

This is a large, multi-step implementation that replaces the entire JIT scoring engine. Zero UI changes. The implementation follows the exact sequence specified in the spec document to avoid breaking intermediate states.

---

## Current State Summary

The existing `generate-jit-events` function uses a flat scoring model: urgency (0–40) + scenario keyword match (0/25) + organizer accountability (0/15) + scale (0–10) + context (0–10) + coach boost (0–20) − skip penalty. Gate threshold is ≥50. No noise filter, no HRV amplifier, no confidence scoring, no bucket classification, no multi-horizon surfacing.

---

## Implementation Steps (9 phases, exact order)

### Phase 1: DB Migration — Additive Fields Only

**New table: `jit_cancellation_memory`** (cleaner than embedding on user record)
- `user_id text`, `event_type text`, `cluster text`, `cancelled_at timestamptz`, `penalty_level integer`
- Service role RLS

**New table: `readiness_baselines`** (one row per user, upsert pattern)
- `user_id text PRIMARY KEY`, `baseline_hrv numeric`, `baseline_rhr numeric`, `baseline_established_at timestamptz`, `wearable_connected_at timestamptz`, `rolling_hrv_30d jsonb DEFAULT '[]'`, `rolling_rhr_3d jsonb DEFAULT '[]'`, `updated_at timestamptz`
- Service role + user SELECT RLS

**Add columns to `jit_event_context`:**
- `jit_bucket_primary text`, `jit_bucket_secondary text`, `jit_confidence_score integer`, `jit_dimension_scores jsonb`, `jit_urgency_horizon text`, `jit_horizons_surfaced text[] DEFAULT '{}'`

All nullable with safe defaults. No existing column changes.

### Phase 2: Noise Filter (Stage 0)

Add to `generate-jit-events/index.ts`:

```
NOISE_KEYWORDS: station, bus, train, flight, airport, departure, arrival,
boarding, layover, transit, coach station, platform, taxi, uber, cab,
delivery, pick up, dry cleaning, groceries, pharmacy, haircut, car service,
MOT, oil change, dentist, optician, reminder, auto-pay, subscription,
booking confirmation, ticket, reservation, out of office, blocked, hold,
placeholder, tentative
```

`NOISE_PATTERN`: regex `/\[\d{6,}\]/` for booking references.

`isNoiseEvent(title)` → boolean. Called first in the event loop; matching events `continue` immediately. DEV_MODE log: `[Stage 0] NOISE_BLOCKED: {title}`.

Also add `logistic` event type to `sync-calendar/index.ts` classification chain (before the generic `meeting` fallback) using the same keywords. Set `isHighStakes: false`.

Update `performance-rhythm-insights/index.ts` and `PerformanceRhythmCard.tsx` to skip `logistic` events in cause-effect paths.

### Phase 3: Cancellation Memory (Stage 1)

On JIT plan dismiss/cancel (in `track-jit-skip`): insert into `jit_cancellation_memory`.

In `generate-jit-events`: after noise filter passes, query `jit_cancellation_memory` for the user. Match by event_type or cluster. Apply −25 (1 cancel) or −40 (2+) penalty. Implement 30/60-day decay by filtering on `cancelled_at`.

### Phase 4: Five-Signal Scoring (Stage 2) + Composite Readiness Amplifier

**Replace** the current flat scoring with four dimensions:

- **Dim A (Interpersonal Stakes, 0–35):** Solo=0, 1–2 attendees=12, 3+=20. +15 bonus for pressure keywords (board, investor, performance, review, feedback, fire, difficult, press, media, interview). Floor: A ≥ 10 required at gate.

- **Dim B (Inner State Relevance, 0–35):** Cluster keyword matching → Pressure (30–35, Recalibrate), Relationship (22–28, Clarity), Decision (18–24, Clarity), Transition (15–22, Renewal), Coach signal (10–20, varies). No match = 0 → blocked at gate (B ≥ 8). Sets primary/secondary bucket.

- **Dim C (Urgency, 0–20):** 0–6h=20, 6–24h=14, tomorrow=8, 2–7d=4, 8d+=0. Capped — cannot independently push past threshold.

- **Dim D (Context, 0–10):** Non-recurring +4, self-created +3, high-stakes description keywords +3.

**Composite Readiness Amplifier** replaces current HRV-only logic:
- Query `wearable_data` for last 30 days + `readiness_baselines` for the user
- If `baseline_established_at` is null or < 14 days from `wearable_connected_at` → multiplier = ×1.0 (baseline lock-in)
- Otherwise: compute composite from HRV vs baseline (40%), current HR vs resting norm (35%), sleep duration (15%), 3-day RHR trend (10%)
- Map to: −20%+ below → ×1.4, −10–19% → ×1.2, ±9% → ×1.0, +10%+ above → ×0.9

**Final score** = (A + B + C + D) × amplifier − cancellation penalty

### Phase 5: Confidence Scoring (Stage 3) + New Gate (Stage 4)

Compute separately from JIT score:
- Title keyword hit: +40
- Coach session match: +30
- HRV confirmed ≥15% below baseline: +15
- Structural signals (attendees + non-recurring): +10
- Past plan completed for event type: +5

Bands: High (70+) → surface silently. Medium (40–69) → soft framing. Low (20–39) → confirmation prompt. Below 20 → no surface.

**Gate**: total ≥ 55 AND A ≥ 10 AND B ≥ 8. Fully replaces current ≥50 threshold.

### Phase 6: Three-Bucket Classification + Calendar Inference

Bucket assignment driven by Dim B cluster match:
- Pressure → Recalibrate (primary), secondary from next-highest cluster
- Relationship/Decision → Clarity
- Transition → Renewal
- Coach signal → varies by session theme

**Calendar inference (3 layers):**
1. Title keyword cluster match (+40 confidence)
2. Coach session memory: cross-ref attendee names against `dialogue_messages` and `coach_memory_index` (+30 confidence)
3. Structural: attendee count, recurrence, time, duration (+10 confidence)

First strong signal wins. If only structural and confidence < 20, do not surface.

### Phase 7: Urgency Multi-Surface (Stage 5)

Three plan depth modes per event:
- **Immediate** (0–6h): short somatic-first, 3–5 min
- **Tactical** (1–7d): medium plan with coach option
- **Strategic** (1–4 weeks): deep reflection + renewal

Same event can surface at multiple horizons as distinct plan types. Track surfaced horizons in `jit_horizons_surfaced` array on `jit_event_context`. Dismissal at one horizon does not cancel others.

Expand calendar query window from 48h to 4 weeks for strategic horizon.

### Phase 8: Insights Attribution

On plan completion (in `track-jit-skip` or a new completion handler):
- 70% attribution to primary bucket, 30% to secondary
- Weight multipliers: completion ×1.2, post-event reflection ×1.3, recurring improvement ×1.5
- Write to `behavior_logs` with bucket context for `performance-rhythm-insights` consumption

### Phase 9: DEV_MODE Logging

Add structured pipeline logging at each stage exit:
```
[JIT:Stage0] BLOCKED title="London Victoria..." reason=noise_keyword:station
[JIT:Stage2] SCORED title="Board Q2" A=35 B=35 C=8 D=7 amp=1.2 final=103
[JIT:Stage3] CONFIDENCE title="Board Q2" score=65 band=medium
[JIT:Stage4] GATE title="Board Q2" PASS (103≥55, A=35≥10, B=35≥8)
```

Only emit when `ENVIRONMENT !== 'production'`.

---

## Files Changed

| File | Change |
|---|---|
| New migration | `jit_cancellation_memory` table, `readiness_baselines` table, 6 new columns on `jit_event_context` |
| `generate-jit-events/index.ts` | Complete rewrite of scoring engine (Stages 0–5), noise filter, 4-dimension scoring, composite amplifier, confidence, new gate, bucket classification, calendar inference, multi-horizon |
| `track-jit-skip/index.ts` | Write to `jit_cancellation_memory` on dismiss; insights attribution on completion |
| `sync-calendar/index.ts` | Add `logistic` event type classification |
| `performance-rhythm-insights/index.ts` | Exclude `logistic` events from cause-effect paths |
| `PerformanceRhythmCard.tsx` | Mirror logistic exclusion in DEV_MODE |

No UI changes. No changes to existing column names/types. Historical JIT records are not retroactively re-scored.

