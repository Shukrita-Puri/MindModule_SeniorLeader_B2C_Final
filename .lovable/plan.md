# B4 — Untagged Attendee Resolver Chain Fix

## Current State (audit)

- `resolve-attendee-relationship` exists and:
  - Reads cache (`attendee_relationships`, 90d TTL).
  - Blocks generic domains, logs lookups in `attendee_resolver_log`, enforces a daily cap of 50 resolved/user/24h.
  - Calls Gemini Flash via Lovable AI Gateway with grounding prompt; persists `source='llm'`.
  - **Header comment claims "called by calendar sync" — false.** Only `generate-mastery-plan` calls it lazily (lines ~253–289, capped at 10 emails per plan).
- `sync-calendar` (Google/Microsoft) and `sync-apple-calendar` extract `attendeeSignals` per event and persist into `calendar_events` — they never queue resolver work.
- `FIRECRAWL_API_KEY` is set in env, but **no JIT/relationship code path imports or calls Firecrawl**. Only `linkedin-profile-scrape` and `synthesize-cos-profile` (onboarding) use it.
- `attendee_relationships.source` CHECK constraint is open text — accepts new values like `enrichment_llm`, `domain_heuristic`, `memory_user_tag`.

## Changes

### 1. New shared module: `supabase/functions/_shared/attendeeResolverQueue.ts`
Pure helper used by both sync paths and (optionally) generate-mastery-plan:
- `collectUnresolvedAttendeeEmails(supabase, userId, syncedEvents)` — flatten attendee emails from synced events, exclude self/generic/already-fresh-cached, dedupe.
- `fireResolverBatch(userId, emails, opts)` — fan-out fetch to `resolve-attendee-relationship` with concurrency=3, per-email try/catch, returns `{queued, skipped, failed}` counts (no PII). Hard cap at 25 emails per sync call (resolver still self-enforces 50/day).

### 2. Calendar sync hook
At the end of `sync-calendar/index.ts` and `sync-apple-calendar/index.ts`, after events are persisted:
- Call `collectUnresolvedAttendeeEmails` + `fireResolverBatch` (fire-and-forget via `EdgeRuntime.waitUntil` where available, else detached promise).
- Wrap in try/catch so resolver failure cannot fail the sync response.
- Log only category: `resolver_queued count=N`, `resolver_skipped_generic count=N`, `resolver_failed reason=net`.

### 3. Upgrade `resolve-attendee-relationship/index.ts` to full resolver chain

Sequence inside the function (single attendee per call, as today):

1. **user_tag cache hit** (any TTL) → return immediately, `source='user_tag'`.
2. **memory_user_tag** — if cache has a fresh row from a *different* event for same `(user, attendee_email)` with `source='user_tag'`, treat as authoritative (already covered by #1; no extra work).
3. **Fresh non-user cache** → return, `source='cache'`.
4. **Generic domain** → log `skipped_generic`, return `unknown`.
5. **Daily cap** → log `rate_limited`, return `unknown`.
6. **Gemini pass 1** (unchanged prompt, existing call).
7. **Low-confidence branch** — only if `external domain && confidence < 0.5 && enrichmentCapAvailable && FIRECRAWL_API_KEY present`:
   - Call new helper `firecrawlEnrich(email, name, domain)` → scrapes top LinkedIn/company-page candidate via Firecrawl `search` (`limit:1`, `scrapeOptions.formats:['summary']`).
   - **Distill** result into structured evidence object `{name,title,company,seniority,profile_url,evidence_source,confidence,evidence_summary}` (truncate summary to 400 chars). Raw markdown never returned.
   - **Gemini pass 2** with the structured evidence in the prompt → new `role/seniority/confidence/evidence_url`.
   - If pass 2 confidence ≥ pass 1, persist with `source='enrichment_llm'`, store `evidence_url` + `evidence_summary`. Increment enrichment counter.
   - On Firecrawl/Gemini error → keep pass-1 result.
8. **Domain heuristic fallback** — if final confidence still null/very low and domain matches user's company (existing `user_company` field) → `peer`, `source='domain_heuristic'`, `confidence=0.4`. Otherwise leave `unknown`.
9. Upsert (skipping if existing row is `user_tag`), log `resolved`.

### 4. Enrichment daily cap
- Reuse `attendee_resolver_log` — add new status values `enrichment_attempt` and `enrichment_skipped_cap`.
- `dailyEnrichmentCount` query: count `status='enrichment_attempt'` for user in last 24h. Cap = **15/user/day** (per spec: "Firecrawl fires only for maybe 10–15 meaningful attendees/day").
- No new table needed.

### 5. Comment cleanup
- Fix stale header in `resolve-attendee-relationship` ("called by calendar sync" → now actually true).
- Fix stale comment in `generate-mastery-plan` memory-replay block.
- Add comment to sync paths describing the fire-and-forget hook.

### 6. No frontend, no scoring, no slot/practice/why-line changes
- No file under `src/` changes.
- `generate-mastery-plan` keeps its existing lazy resolver as backstop; only the comment is touched.

## Files Changed

- **New:** `supabase/functions/_shared/attendeeResolverQueue.ts`
- **Edit:** `supabase/functions/resolve-attendee-relationship/index.ts` (chain + Firecrawl branch + heuristic fallback + new log statuses)
- **Edit:** `supabase/functions/sync-calendar/index.ts` (post-sync fire)
- **Edit:** `supabase/functions/sync-apple-calendar/index.ts` (post-sync fire)
- **Edit:** `supabase/functions/generate-mastery-plan/index.ts` (comment only)

## Migrations
None. `attendee_relationships.source` CHECK is permissive; `attendee_resolver_log.status` is free text.

## Security
- `FIRECRAWL_API_KEY` read only via `Deno.env.get` inside edge function. No `VITE_` exposure.
- Logs emit category + counts only — no email values printed beyond existing per-row inserts, no scraped markdown, no API keys.
- Distilled evidence stored in `attendee_relationships.evidence_url` (already exists) + a short `evidence_summary` (text). Note: schema currently has no `evidence_summary` column — will store inside existing JSON-friendly field by **appending to `attendee_name` is wrong**; instead I'll **add a column `evidence_summary text` via migration**. (Single new column, no policy changes.)

→ **One small migration** after all: `ALTER TABLE public.attendee_relationships ADD COLUMN evidence_summary text;`

## Checks
- `tsc --noEmit` + `npm run build` (auto via harness).
- Manual: trace through resolver chain for (a) cached, (b) generic domain, (c) external low-conf with Firecrawl, (d) cap-exceeded.

## Not Doing
- No change to Plan scoring weights, slot allocator, practice selector, why-line prompt, or any `src/` frontend file.
- No new resolver table — reuse `attendee_resolver_log`.
- No per-call user-facing surface.

## Risks
- Firecrawl `search` cost: bounded by 15/user/day cap + only fires when Gemini pass-1 < 0.5 confidence + external domain.
- Sync latency: post-sync fire is fully detached; sync response returns immediately.
- TTL: enriched rows still use 90d cache TTL — acceptable per spec.
