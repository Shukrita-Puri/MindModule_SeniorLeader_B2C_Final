---
name: shadow-domain-wiring
description: Layer 0-5 domain engines run in shadow beside legacy paths via _shared/shadow/domain-shadow.ts; each domain gated by its own env flag (=shadow); parity logged via runInShadow, never user-facing
type: architecture
---

# Shadow domain wiring (Spine Stage 1-2)

- Helper: `supabase/functions/_shared/shadow/domain-shadow.ts` —
  `isDomainShadowEnabled(flag)` (true only when env value is exactly
  `shadow`), `runDomainShadow(options)` (wraps `runInShadow`, scheduled via
  `EdgeRuntime.waitUntil` with fire-and-forget fallback, never throws).
- Wired flags:
  - `smart-nudges`: `L5_SIGNALS` (domain behaviour signals vs legacy
    behaviour-wiring flags, after the prompt-block build), `L5_VOICE` and
    `L5_GUARDRAILS` (at the final post-CTA send/skip gate per notification).
  - `compute-outer-readiness`: `SPINE_READ` + `SPINE_DAY_PROFILE` (one
    combined shadow run after the window-context block; timeout relaxed to
    5s because `assembleContext` does its own DB reads), `L5_VOICE` (after
    `validateV61Output` on the LLM path and after `validateBrief` on the
    deterministic path).
  - `generate-mastery-plan`: `L3_SELECTOR` (after the legacy slot loop,
    only when slots exist; runs `recommendInterventions` from
    `domains/interventions` with the same enriched catalogue via
    `PracticeAdapter.adapt`, comparing per-slot legacy practice IDs vs
    shadow chosen IDs as `slotIndex:id` joined strings).
  - `sync-oura`: `L0_PARSERS_DOMAIN` (domains/wearable
    `ouraSleepEfficiencyFromSession` vs legacy inline efficiency logic in
    `buildDailyRows`; shadow context passed in from the handler).
  - `sync-apple-calendar` / `sync-calendar`: `L0_PARSERS_DOMAIN`
    (domains/calendar `mergeCalendarEvents` vs legacy collapse + dedupe;
    compared as `events:<count>` categories per sync batch).
- Env flags set to `shadow` in the backend: AH_ENGINE_MODE,
  L0_PARSERS_DOMAIN, SPINE_DAY_PROFILE, SPINE_READ, L5_SIGNALS,
  L5_GUARDRAILS, L5_VOICE, L3_SELECTOR. All 8 are read by live code.
- Invariants: legacy output is always returned to the client; shadow runs
  are non-blocking; parity logs carry hashed IDs and reason codes only —
  never titles, names, or personal content.
- Operational rules (2026-10-23):
  - `runInShadow` must clear its guard timer after the race settles
    (leak fix).
  - Service-role Supabase clients in shared modules must use
    `auth: { persistSession: false, autoRefreshToken: false }` — otherwise
    auth-js starts an interval that leaks in tests and isolates.
  - `collapseAppleMultiSource` lives in
    `_shared/rules/apple-source-collapse.ts` (implementation + re-export
    shim); domains/calendar does NOT contain it. Mirrored to
    src/utils/rules/apple-source-collapse.ts.
  - LLM fallback: `callAIText` in `_shared/anthropic.ts` falls back to the
    Lovable gateway on Anthropic 400/401/402/429, credit-balance errors,
    timeouts/aborts, network errors, and 5xx. No customer request may die
    on an unhandled Anthropic exception; deterministic template banks are
    the last resort.
- Tests: `supabase/functions/_shared/shadow/domain-shadow.test.ts`,
  `supabase/functions/_shared/anthropic-fallback.test.ts`.
