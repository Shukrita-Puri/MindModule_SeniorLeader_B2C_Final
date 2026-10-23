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
- Env flags set to `shadow` in the backend: AH_ENGINE_MODE,
  L0_PARSERS_DOMAIN, SPINE_DAY_PROFILE, SPINE_READ, L5_SIGNALS,
  L5_GUARDRAILS, L5_VOICE, L3_SELECTOR. Only AH_ENGINE_MODE and the five
  wired flags above are read by code today; L0_PARSERS_DOMAIN and
  L3_SELECTOR are inert until wired.
- Invariants: legacy output is always returned to the client; shadow runs
  are non-blocking; parity logs carry hashed IDs and reason codes only —
  never titles, names, or personal content.
- Tests: `supabase/functions/_shared/shadow/domain-shadow.test.ts`.
