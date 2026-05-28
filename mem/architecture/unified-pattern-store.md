---
name: Unified Pattern Store
description: causality_findings is the canonical store for cross-event correlations; cause-effect-engine writes signal_summary, smart-nudges reads it
type: feature
---
`public.causality_findings` is the single source of truth for proactive pattern signals (HRV-to-event, RHR-to-event, sleep-to-PRS, consecutive load).

**Schema contract:**
- Composite key: `(user_id, pattern_kind, computed_for_date)`.
- `pattern_kind` defaults to `'cause_effect_v2'`. Future pattern families add new kinds; readers filter by kind.
- `signal_summary jsonb` is a flat, pre-projected payload designed for O(1) edge-function reads. Shape:
```json
{
  "event_to_hrv": [{ "event_type": "Board / governance", "n": 4, "hrvDeltaPct": -22, "rhrElevated": true, "confidence": "strong", "lastSeen": "2026-04-27" }],
  "event_to_rhr": [{ "event_type": "...", "n": 3, "rhrDeltaPct": 8, "confidence": "emerging", "lastSeen": "..." }],
  "sleep_to_prs": { "lowSleepPrsDeltaPct": -14, "n": 6, "confidence": "strong" },
  "consecutive_load": { "tailDeltaPct": -11, "n": 5, "confidence": "emerging" }
}
```

**Writer:** `cause-effect-engine` projects `signal_summary` alongside its existing payload on each daily compute.

**Readers:** `smart-nudges` calls `loadPatternSummary(userId)` once per evaluation and uses `findEventPattern(pattern, eventTitle)` to cite a historical pattern when a JIT anchor matches a known event bucket.

**Bucket vocabulary** is kept in sync between writer and reader via `EVENT_TYPE_KEYWORDS` (cause-effect-engine) and `NUDGE_EVENT_TYPE_KEYWORDS` (smart-nudges). Both must update together.

**Extension rule:** new proactive pattern families (e.g. `meeting_density_to_recovery`) add new top-level keys to `signal_summary`, never new tables.

**v4 — `performance_lift` (positive-side correlations).** Powers the "When You Perform Best" card. Keys:
- `hr_event_lift[]` — per EVENT_TYPE subtype (id + bucket + categoryId from `events/event-subtypes.ts`): mean event-window peak HR vs resting baseline (bpm) + same-day PRS lift (%).
- `category_lift[]` — rollup to A–H pillars from `events/event-categories.ts`.
- `sleep_to_peak` — high-sleep nights (≥ user P70) → next-day PRS delta + best window.
- `rhr_recovery_window` — well-recovered days (RHR ≤ baseline − 1σ) → window with highest lift.
- `recovery_streak_to_peak` — mean consecutive low-RHR streak preceding top-quartile PRS days.

Event correlation uses **heart rate (peak HR within `[event.start, event.end]` from `wearable_data.hr_samples`)**, not HRV — HRV is a daily morning signal and is too coarse for per-event causation. Classification uses `classifyEvent` from `events/event-classifier.ts`; the legacy `EVENT_TYPE_KEYWORDS` map must not be re-introduced.