
# Plan: JIT Mastery Plan — Two-Touch Action Model (Phase 7)

## Status: IMPLEMENTED

All gaps from the Phase 7 audit have been implemented:

### Changes Implemented

| Gap | Fix | Status |
|-----|-----|--------|
| Gap A: No horizon-based plan depth differentiation | Two-touch action model: Touch 1 (24-48h) = coach primary + framework; Touch 2 (0-6h) = somatic primary + focus. Silent gap (6-24h) and selection-only (>48h) produce no plan. | ✅ DONE |
| Gap B: Legacy fallback uses old gate (≥50) | Legacy now uses JIT_THRESHOLD_UNIFIED=55 with Dim A≥10 and Dim B≥8 floor guards + action window filtering | ✅ DONE |
| Gap C: Bridge threshold mismatch | Single `JIT_THRESHOLD_UNIFIED = 55` constant used across all paths | ✅ DONE |
| Cleanup: Remove `strategic` horizon | `determineUrgencyHorizon` returns `immediate | tactical | null`. No `strategic` references. | ✅ DONE |
| Cleanup: Remove `score >= 50` in JIT paths | All JIT paths use 55. Only non-JIT presence label uses 50. | ✅ DONE |
| Cleanup: Action window in bridge path | Bridge path now filters by `getActionWindow()` — silent/selection-only events excluded | ✅ DONE |

### Two-Touch Action Model

- **Touch 2 (0-6h)**: Body prep — somatic practice primary (gentle, micro), focus/grounding exercise, coach as secondary CTA. 3-5 min.
- **Silent gap (6-24h)**: Nothing surfaces. Event is scored and stored but not shown.
- **Touch 1 (24-48h)**: Think prep — coach CTA primary ("Prepare with Your Coach"), one framework/reframe practice, optional focus. 5-8 min.
- **Selection-only (>48h)**: Event is scored by `generate-jit-events` and stored in `jit_event_context` but no plan surfaces. Waits for 48h window.

### Files Changed

| File | Change |
|------|--------|
| `generate-mastery-plan/index.ts` | `JIT_THRESHOLD_UNIFIED=55`, `getActionWindow()`, `computeLegacyDimA/B()`, two-touch plan composition, bridge action window filter, legacy fallback with A/B floors |
| `generate-jit-events/index.ts` | `determineUrgencyHorizon()` returns `immediate|tactical|null`, non-surfaceable events stored with `shown_in_jit: false`, two-touch deduplication |

### Definition of Done ✅

- [x] Event 3h away → Touch 2 (somatic-first, 3-5 min, coach secondary)
- [x] Event 36h away → Touch 1 (coach primary, one framework, 5-8 min)
- [x] Event 10h away → nothing surfaced (silent gap)
- [x] Event 5 days away → nothing surfaced (selection-only)
- [x] Same event at both Touch 1 and Touch 2 → both appear in `jit_horizons_surfaced`
- [x] Dismiss Touch 1 → Touch 2 still fires (tracked independently)
- [x] Legacy fallback → ≥55 gate with A≥10, B≥8 floors
- [x] One `JIT_THRESHOLD` definition in codebase
- [x] No plan composition path ignores `minutesUntil`
- [x] No references to `strategic` horizon or `score >= 50` in JIT paths
