
# Plan: JIT Mastery Plan — Two-Touch Action Model (Phase 8)

## Status: IMPLEMENTED

All gaps from Phase 7 audit + Phase 8 hardening have been implemented.

### Phase 8 Changes (Per-Touch Dismissal, DEV_MODE, Staleness, Horizon Renaming)

| Gap | Fix | Status |
|-----|-----|--------|
| CRITICAL: Touch 1 dismiss blocks Touch 2 | Per-touch `dismissed_horizons text[]` column. Dismiss appends specific touch label. Bridge filters per-touch, not globally. | ✅ DONE |
| `generate-jit-events` missing DEV_MODE bypass | Standard `x-dev-user-id` fallback added | ✅ DONE |
| Bridge staleness window too tight (60 min) | Widened to 4 hours — Touch 1 data valid for hours | ✅ DONE |
| Horizon labels conflate selection/action | Action layer uses `touch_1`/`touch_2`. Selection layer unchanged (`determineUrgencyHorizon` returns `touch_1`/`touch_2`/`null`). `jit_urgency_horizon` stores selection-time classification for insights attribution. | ✅ DONE |
| Client dismiss missing eventId/horizon | `PreEventPlan` now includes `eventId` and `horizon`. Dismiss payload sends both. | ✅ DONE |
| `eventId` missing from mastery plan response | Added `eventId: topEvent.event.id` to `preEventPlan` response | ✅ DONE |

### Phase 7 Changes (Two-Touch Action Model) — Previously Implemented

| Gap | Fix | Status |
|-----|-----|--------|
| Gap A: No horizon-based plan depth differentiation | Two-touch action model: Touch 1 (24-48h) = coach primary + framework; Touch 2 (0-6h) = somatic primary + focus. Silent gap (6-24h) and selection-only (>48h) produce no plan. | ✅ DONE |
| Gap B: Legacy fallback uses old gate (≥50) | Legacy now uses JIT_THRESHOLD_UNIFIED=55 with Dim A≥10 and Dim B≥8 floor guards + action window filtering | ✅ DONE |
| Gap C: Bridge threshold mismatch | Single `JIT_THRESHOLD_UNIFIED = 55` constant used across all paths | ✅ DONE |
| Cleanup: Remove `strategic` horizon | `determineUrgencyHorizon` returns `touch_1 | touch_2 | null`. No `strategic` references. | ✅ DONE |
| Cleanup: Remove `score >= 50` in JIT paths | All JIT paths use 55. Only non-JIT presence label uses 50. | ✅ DONE |
| Cleanup: Action window in bridge path | Bridge path now filters by `getActionWindow()` — silent/selection-only events excluded | ✅ DONE |

### Two-Touch Action Model

- **Touch 2 (0-6h)**: Body prep — somatic practice primary (gentle, micro), focus/grounding exercise, coach as secondary CTA. 3-5 min.
- **Silent gap (6-24h)**: Nothing surfaces. Event is scored and stored but not shown.
- **Touch 1 (24-48h)**: Think prep — coach CTA primary ("Prepare with Your Coach"), one framework/reframe practice, optional focus. 5-8 min.
- **Selection-only (>48h)**: Event is scored by `generate-jit-events` and stored in `jit_event_context` but no plan surfaces. Waits for 48h window.

### Per-Touch Dismissal Logic

- `dismissed_horizons text[]` on `jit_event_context` tracks which touches were dismissed (e.g., `['touch_1']`)
- Dismissing Touch 1 does NOT block Touch 2 — each is checked independently
- `dismissed_by_user` boolean kept for backward compat — only set `true` when BOTH touches dismissed
- Client sends `horizon` and `eventId` with dismiss action

### Selection vs Action Layer Distinction

- **Selection layer** (`generate-jit-events`): Scores events up to 28 days out. Stores `jit_urgency_horizon` as metadata. This is a classification label, not an action signal.
- **Action layer** (`generate-mastery-plan`): Uses live `minutesUntil` to determine which plan to build. Never reads the stored horizon for plan composition.
- **`jit_horizons_surfaced`**: Tracks which action touches have fired (`touch_1`, `touch_2`). Used for deduplication.

### Files Changed (Phase 8)

| File | Change |
|------|--------|
| New migration | Add `dismissed_horizons text[] DEFAULT '{}'` to `jit_event_context` |
| `track-jit-skip/index.ts` | Accept `horizon` param, append to `dismissed_horizons` array, per-touch logic |
| `generate-mastery-plan/index.ts` | Remove `dismissed_by_user` filter, add per-touch horizon check, widen staleness to 4h, rename horizon labels to `touch_1`/`touch_2`, add `eventId` to response |
| `generate-jit-events/index.ts` | DEV_MODE auth bypass, rename horizon values to `touch_1`/`touch_2` |
| `src/components/home/JitCarousel.tsx` | Add `horizon` and `eventId` to `PreEventPlan` interface and dismiss payload |

### Definition of Done ✅

- [x] Dismiss Touch 1 → Touch 2 still fires (per-touch `dismissed_horizons`)
- [x] `generate-jit-events` works in DEV_MODE (`x-dev-user-id` bypass)
- [x] Bridge doesn't fall back unnecessarily (4h staleness window)
- [x] All action-layer horizon values are `touch_1`/`touch_2`
- [x] No `dismissed_by_user` filtering blocks Touch 2
- [x] Client sends `eventId` and `horizon` on dismiss
- [x] `eventId` included in mastery plan response
