# Mind Module — End-to-End Production Readiness Audit
**Date:** 30 July 2026 · **Method:** executed build, typecheck, full test suite, headless browser route sweep, live DB queries, Supabase linter, security scan, secret inventory, slow-query stats. No code changes made.

---

## 1. Executive Summary

**Overall health score: 72 / 100**
**Production ready: NO — conditional.** The system is architecturally sound and the *native iOS* path is close. Two hard blockers (live Stripe credentials, Anthropic billing) and three silent data-path defects must clear first.

| Severity | Count |
|---|---|
| Critical | 3 |
| High | 5 |
| Medium | 7 |
| Low | 6 |

### What is genuinely verified working
- `vite build` succeeds in 17.3s, zero errors. `tsgo --noEmit` clean (0 type errors).
- 46/50 test files pass (3 failed, 1 skipped).
- All 9 sampled routes render; no uncaught console errors on public or protected shells.
- Deny-by-default RLS holds: only 1 anon-readable table (`beta_invites`), 7 tables RLS-on/policy-zero and **none** of them touched from `src/` — service-role only, as designed.
- 130 edge functions present; 48h 5xx count = 2. Not an error-storm situation.

---

## 2. Critical Issues

### C-1 — No live Stripe credentials exist. Web checkout cannot work in production.
- **Severity:** Critical
- **Root cause:** `supabase/functions/_shared/stripe-config.ts:27` selects env prefix `STRIPE_` when `APP_ENV=production`. The secret store contains **only** `STRIPE_TEST_SECRET_KEY`, `STRIPE_TEST_WEBHOOK_SECRET`, `STRIPE_TEST_PRICE_*`. No `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, or live price IDs are configured.
- **Behaviour:** in production mode `secretKey` resolves to `''`. Checkout, portal, and webhook verification all fail. There is no startup guard — the function logs `Mode: LIVE` and proceeds with an empty key.
- **Evidence:** `secrets--fetch_secrets` (34 secrets, zero live Stripe entries); `profiles`: 37 rows, 9 with `stripe_customer_id`, **0 with `subscription_status='active'`**.
- **Files:** `supabase/functions/_shared/stripe-config.ts`
- **Fix:** add the four live price IDs + live secret + live webhook secret, and add a fail-fast throw in `getStripeConfig()` when `isLiveMode && !secretKey`.

### C-2 — `inner_readiness_scores` has zero writers. Two Insights cards read a permanently empty table.
- **Severity:** Critical (silent feature failure)
- **Root cause:** the table is read by `performance-rhythm-insights`, `state-patterns-insights`, `PerformanceRhythmCard.tsx`, `LeadershipPatternsCard.tsx`. Repo-wide search finds **no insert/upsert path anywhere**. Live count: **0 rows**.
- **Impact:** Performance Rhythm and Leadership Patterns render empty/degraded for every user, permanently — and will never self-heal with time or usage.
- **Fix:** either wire `compute-inner-readiness` to persist into it, or delete the table and the four read sites.

### C-3 — Anthropic account credit exhausted; LLM narrative layer is down.
- **Severity:** Critical (business), Low (stability)
- **Root cause:** account-level billing, not code. `_shared/anthropic.ts:18` already pins both SONNET and HAIKU to `claude-haiku-4-5-20251001`, and `compute-outer-readiness` has a deterministic-MRS fallback so scores still render.
- **Impact:** briefs/insights degrade to numeric-only output. Not a crash, but the product's core differentiator is silently off.
- **Fix:** top up Anthropic, or promote the existing `google/gemini-2.5-flash` path (`anthropic.ts:405`) to primary.

---

## 3. High Priority

### H-1 — `notification_preferences` is empty (0 rows) while `smart-nudges` reads it.
`complete-onboarding` references the table but no user row has ever landed. Every nudge decision therefore runs on hardcoded defaults; user quiet hours / channel prefs are unenforceable. **Files:** `supabase/functions/complete-onboarding/index.ts`, `supabase/functions/smart-nudges/index.ts`.

### H-2 — Notification delivery rate is 18%, and telemetry outweighs delivery 158:1.
Last 7 days: 68 notifications sent, **12 delivered**, 13 device tokens registered — against **10,765** `notification_evaluator_traces` rows. That trace insert is the single most expensive statement in the database: 3,537 calls, **222.3s total**, 62.9ms mean, 806ms max. **Fix:** sample or batch traces (they are debug-tier), and investigate the 82% non-delivery.

### H-3 — `user_roles` is empty, so `has_role()` is always false — 13 RLS policies are dead.
Policies on `sanctuary_content` (INSERT/UPDATE/DELETE), `sanctuary_content_metadata`, `sanctuary_content_steps`, `checkin_tag_definitions`, `meta_skill_definitions`, `soft_skill_definitions`, `sub_skill_definitions`, `usage_occasion_definitions`, and `user_roles` itself all gate on `has_role(...,'admin')` and can never pass. Admin authority actually lives in a two-email hardcoded allowlist (`src/config/adminAllowlist.ts` + `_shared/admin-guard.ts`, duplicated verbatim). **This fails closed, so it is not an exposure — but it is unmanageable and the two lists will drift.**

### H-4 — Storage `content-assets` bucket is PUBLIC, and its admin policies use the wrong identity function.
Bucket `content-assets` is `public: true` (52MB limit). Its write policies call `has_role(auth.uid(), 'admin')`, but this app authenticates via **Auth0** — the user id lives at `auth.jwt() ->> 'sub'` (text), so `auth.uid()` never matches. Confirmed independently by the platform scanner (`storage_admin_policies_auth_uid_mismatch`). Currently fails closed; dangerous if someone "fixes" it by loosening.

### H-5 — Three test failures are being carried.
1. `calendarEventsRawReadGuard` — 2 unauthorized raw readers: `scripts/backfill-event-tags.ts`, `supabase/functions/travel-state-sync/index.ts`. The dedupe guard is now red, so it no longer protects anything.
2. `CheckInDetail.test.tsx` (×2) — `Unable to find button /continue to today's performance/i`. Either the CTA label changed or the save refactor altered render order. This is the check-in save path — the app's highest-frequency write.
3. `signalPillsBackendContract` — asserts on literal source strings in `compute-outer-readiness/index.ts` that no longer exist.

---

## 4. Medium Priority

| ID | Finding | Evidence |
|---|---|---|
| M-1 | **34 of 130 edge functions are never referenced from `src/`.** Many are legitimately cron/webhook-driven (`calendar-webhook`, `apple-notifications`, `sync-calendar-scheduled`, `oura-sync-fanout`), but `generate-jit-carousel`, `generate-energy-insight`, `generate-dashboard-insight`, `infer-current-state`, `detect-coach-scenarios`, `user-preferences` look orphaned. Each is a deployed, billable, auth-surfaced endpoint. | function-vs-src cross reference |
| M-2 | **45 public tables hold zero rows**, incl. `energy_snapshots`, `evening_checkins`, `jit_event_context`, `jit_carousel_cards`, `detected_signals`, `inferred_states`, `mastery_plan_completions`, `user_achievements`, `readiness_baselines`, `session_feedback`, `saved_debriefs`. Some are pre-launch-normal; several back shipped UI. | `pg_stat_user_tables` |
| M-3 | **Plan generation runs ~60× less than Brief generation.** 7-day counts: `brief_snapshots` 314, `mastery_plan_snapshots` **5**, `daily_checkins` **3**, `mental_fitness_scores` **0**. Either engagement is near-zero or the plan write path is failing quietly. | live counts |
| M-4 | `notification_log` is queried 62,378 + 54,978 times (both by `user_id` + `sent_at` range). ~350s combined. Confirm a composite `(user_id, sent_at DESC)` index exists and is used. | `pg_stat_statements` |
| M-5 | Main JS chunk is **710.69 kB (216 kB gzip)**; Vite emits the >500kB warning. 46 routes are already lazy — the weight is in the shared vendor chunk. | build output |
| M-6 | **`dist/` is 88 MB.** Multiple >300kB uncompressed assets: `soundscapes/*.mp3`, `all-visuals/images/hero-*.jpg`, `lovable-uploads/*.jpg`. Audio is shipped in the web bundle rather than streamed from storage/CDN. | `du -sh dist` |
| M-7 | `.env` is **committed to the repository**. It contains only publishable/anon keys plus a stale second Supabase project (`jdyfqzlfvfsbpoifjzvz` at lines 1-2 vs the live `iyilcpvercoywaweybpc`). No secret leak, but the dead project reference is a footgun. | `git ls-files` |

---

## 5. Low Priority

- **L-1** — 276 `console.log` / `console.debug` calls remain in `src/`. The `[itel]` queue drains a no-op every 60s into the browser console indefinitely.
- **L-2** — 4 files carry `TODO`/`FIXME`/`HACK` markers.
- **L-3** — Supabase linter: extension installed in `public` schema (WARN).
- **L-4** — 4 `SECURITY DEFINER` functions remain executable by `anon`/`authenticated` (WARN ×4). Previously triaged; `has_role` grant was intentional.
- **L-5** — Root-level dev artefacts committed: `delete_functions.cjs`, `fix_errors.cjs`, `fix_errors2.cjs`, `test-classify.ts`.
- **L-6** — `/week-ahead` is not a registered route; it resolves to the 404 boundary (`RouteErrorBoundary`). Verify no link, push payload, or deep link points at that path.

---

## 6. Validation Matrix

| Area | Result | Evidence |
|---|---|---|
| Build | ✅ Pass | `vite build` clean, 17.31s |
| TypeScript | ✅ Pass | `tsgo --noEmit`, 0 errors |
| Test suite | ⚠️ Partial | 46 pass / 3 fail / 1 skip (H-5) |
| Routing & navigation | ✅ Pass | 9 routes swept; 404 boundary works |
| Console errors | ✅ Pass | none on any sampled route |
| Mobile render (390×844) | ✅ Pass | all routes render in viewport |
| Auth — provider wiring | ✅ Pass | Auth0 + Apple/Google/LinkedIn buttons present on `/` and `/login` |
| Auth — protected routes | ⚠️ Partial | guard logic verified by inspection; **no signed-in E2E run possible** (Auth0, not managed Supabase auth) |
| Role-based access | ⚠️ Partial | fails closed, but via hardcoded email allowlist duplicated in 2 files; `user_roles` empty (H-3) |
| RLS — user isolation | ✅ Pass | 1 anon-readable table, no broad `USING(true)` selects for anon |
| RLS — admin policies | ❌ Fail | 13 `has_role` policies unreachable (H-3); storage policies use wrong identity fn (H-4) |
| Database schema | ✅ Pass | no broken FKs surfaced; migrations applied |
| Schema utilisation | ⚠️ Partial | 45 empty tables, 1 table with no writer (C-2) |
| Edge function health | ✅ Pass | only 2 × 5xx in 48h |
| Edge function coverage | ⚠️ Partial | 34 unreferenced from frontend (M-1) |
| Storage | ⚠️ Partial | single bucket, **public**, broken admin write policies (H-4) |
| Payments — Apple IAP | ✅ Pass | 47 IAP tests green; StoreKit-driven pricing; no hardcoded amounts |
| Payments — Stripe (web) | ❌ Fail | no live credentials (C-1); 0 active subscriptions |
| AI / LLM integrations | ❌ Fail | Anthropic credits exhausted (C-3); fallback holds |
| Push notifications | ❌ Fail | 18% delivery rate, 158:1 telemetry ratio (H-2) |
| Secrets management | ✅ Pass | 34 secrets, none in source; `.env` holds publishable keys only |
| Performance — DB | ⚠️ Partial | trace insert is 222s of total time (H-2) |
| Performance — bundle | ⚠️ Partial | 710kB main chunk, 88MB dist (M-5, M-6) |
| Error handling | ✅ Pass | route error boundary, deterministic MRS fallback, LLM fallback all present |
| Deployment freshness | ✅ Pass | migrations applied; functions deployed this session |

---

## 7. Final Recommendation

**Do not ship the web/Stripe purchase path.** The iOS/Apple IAP path is materially closer to ready and is well covered by tests.

Ordered pre-launch queue:
1. **C-1** — configure live Stripe secrets + add a fail-fast guard. *(blocker)*
2. **C-3** — restore Anthropic credit or promote Gemini to primary. *(blocker)*
3. **C-2** — decide `inner_readiness_scores`: wire the writer, or delete the table and its four read sites. *(blocker for Insights)*
4. **H-5** — repair or consciously retire the 3 red tests; a red guard protects nothing.
5. **H-2** — throttle evaluator traces and diagnose 82% non-delivery.
6. **H-1 / H-3 / H-4** — seed `notification_preferences`, migrate admin authority off the duplicated email allowlist into `user_roles`, and rewrite storage policies onto `auth.jwt() ->> 'sub'`.
7. **M-3** — confirm whether the 3 check-ins / 5 plans in 7 days reflect real usage or a broken write path. This is the single most important unknown in the report.

Everything above M-3 is measurable today. Items M-5, M-6, and all L-items are post-launch hygiene.
