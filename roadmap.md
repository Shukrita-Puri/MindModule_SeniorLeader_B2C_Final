# Roadmap

## In progress
1. Harden Anthropic fallback: try/catch around Claude calls in `_shared/anthropic.ts` + call sites in smart-nudges, compute-outer-readiness, generate-mastery-plan; catch 400/401/402/429/timeouts; fall back to deterministic template bank; no unhandled exceptions.
2. Wire `L0_PARSERS_DOMAIN` shadow in calendar + wearable sync pipelines (domains/calendar mergeCalendarEvents, domains/wearable deriveSleepEfficiency/mergeCanonicalWearableDay) via runInShadow, hashed IDs, legacy rows still persisted.

## Done
- Home relocation popup (replaces banner) across surfaces.
- Shadow wiring: smart-nudges (L5_SIGNALS/L5_VOICE/L5_GUARDRAILS), compute-outer-readiness (SPINE_READ/SPINE_DAY_PROFILE/L5_VOICE), generate-mastery-plan (L3_SELECTOR).
- All 8 shadow switches set to `shadow` in backend.
