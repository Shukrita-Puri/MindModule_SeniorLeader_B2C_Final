# Roadmap

## Done
- Home relocation popup (replaces banner) across surfaces.
- Shadow wiring: smart-nudges (L5_SIGNALS/L5_VOICE/L5_GUARDRAILS), compute-outer-readiness (SPINE_READ/SPINE_DAY_PROFILE/L5_VOICE), generate-mastery-plan (L3_SELECTOR).
- All 8 shadow switches set to `shadow` in backend.
- Anthropic fallback hardening: callAIText now falls back to gateway on 400/401/402/429, timeouts/aborts, network errors, 5xx; fetchImpl forwarded for testability; 5 tests.
- L0_PARSERS_DOMAIN wired: sync-oura (sleep efficiency vs domains/wearable), sync-apple-calendar + sync-calendar (mergeCalendarEvents vs legacy dedupe). Legacy rows still persisted.
- Fixed shadow runner timer leak (cleared guard timeout) and auth-js autoRefreshToken interval leak in event shadow modules.
- Restored collapseAppleMultiSource implementation (shadow-arch commit had reduced the shim to a re-export of a non-existent member).

## Open
- No live shadow comparison recorded yet for L0/L3 — needs real sync/plan traffic.
