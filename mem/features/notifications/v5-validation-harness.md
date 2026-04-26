---
name: Smart Nudges v5 validation harness
description: Deno test harness in supabase/functions/smart-nudges/v5_validation_test.ts that statically audits the v5 fallback strings, invokes the live tick, and audits notification_log rows for the 08:00 local floor, 60-min cool-down, deep-link presence, CTA experiment stamp, and weekend rules.
type: feature
---
**Where**: `supabase/functions/smart-nudges/v5_validation_test.ts`

**Run**: `supabase--test_edge_functions {functions:["smart-nudges"]}`

**What it asserts** (each is a separate Deno.test):
1. **Source audit** — no v4 forbidden vocabulary (`intent`, `set the tone`, `productivity`, `loaded day`, …) appears in any active MVP fallback (`getFallbackNudge*` block). Every fallback body contains a CTA verb (`open your brief / plan`, `see your readiness / prep`, `recalibrate now`, `lock in your prep`, `tap to prep`).
2. **Constants** — `GLOBAL_EARLIEST_LOCAL = 8.0`, `APP_OPEN_COOLDOWN_MS = 60 min`, `INTRA_TICK_MAX = 1`, payload stamps `architecture: 'cos-mind-v5'` and `cta_experiment: 'cta-action-verb-v1'`.
3. **CTA distribution** — `assignCtaVariant` is uniform (20–30% per arm over 4,000 synthetic IDs) and stable per user.
4. **Live tick** — POSTs to the deployed `smart-nudges` function and asserts every emission has a valid deep_link, a CTA verb, no forbidden words, and a `::A|B|C|D` variant_id suffix.
5. **DB audit (24h)** — every row stamped `architecture: 'cos-mind-v5'` respects the 08:00 local floor, 21:30 ceiling, and 60-min per-user cool-down. Required payload fields (`cta_variant`, `cta_experiment`, `deep_link_route`) are present.
6. **Weekend audit (7d)** — Saturday/Sunday morning `nudge_one` only fires anchored variants (`*-sat-anchored`, `*-stakes`, `*-hrv`, `*-recovery`, `*-JIT`).

**Notes**:
- DB audit tests use `sanitizeOps: false` because `@supabase/supabase-js` opens a long-lived realtime interval.
- Tests skip gracefully when `SUPABASE_SERVICE_ROLE_KEY` is missing — falls back to anon key for live-tick only.
- Re-run after every smart-nudges edit to block v4 regressions.
