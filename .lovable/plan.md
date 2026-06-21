# 20th June — Calendar & Wearable Health + Cross-Calendar Dedupe

## Findings from investigation (before any edits)

- **Part 1 (smart-nudges boot):** Already self-healed. `_shared/rules/calendarEvents.ts` was updated yesterday to use a direct `export { … } from './calendar-merge.ts'` re-export (lines 31–36), and current edge logs show `smart-nudges` booting and running ("Evaluating 11 users… Starting evaluation run v7"). Boot failure no longer reproduces. The brief still asks for the import to be hardened to a direct `calendar-merge.ts` import on the hot path — I'll do that as belt-and-suspenders so a future re-export regression cannot kill nudges.
- **Part 2 (sync-profile placeholder):** Confirmed root cause. `supabase/functions/sync-profile/index.ts` line 32 reads `Deno.env.get("VITE_AUTH0_DOMAIN")`, and that secret currently holds `placeholder_value_to_be_replaced`. The project also has a non-prefixed `AUTH0_DOMAIN` secret (already in the secret list). Per the existing "Edge Function Auth Secrets Priority" memory, edge functions should prefer the non-prefixed secret with the VITE_ one as fallback.
- **Part 3 (working systems):** Verify-only — no refactor planned.
- **Parts 4–5 (dedupe):** Already partially in place via `_shared/rules/calendar-merge.ts → mergeCalendarEvents` and `_shared/ceo-behaviour/calendar-dedupe.ts → dedupeForLoad`. Gaps to close: (a) ensure every consumer (Plan, Brief signal pills, JIT context, smart-nudges, load/density rules) reads through the shared merge layer, (b) make the canonical merge build a true canonical event (sourceCalendars[], union attendees, organiser-preferred metadata, status suppression), (c) ensure memory/HRV keys attach to canonical id, (d) add observability counters.

---

## Part 1 — smart-nudges hot-path import hardening

- Change `supabase/functions/smart-nudges/index.ts` line 20 from `../_shared/rules/calendarEvents.ts` to `../_shared/rules/calendar-merge.ts` (direct import, bypass re-export). No logic change.
- Redeploy `smart-nudges`. Confirm boot + one evaluation cycle in `supabase--edge_function_logs`.

## Part 2 — sync-profile Auth0 domain resolution

- Edit `supabase/functions/sync-profile/index.ts` to read domain as `Deno.env.get("AUTH0_DOMAIN") || Deno.env.get("VITE_AUTH0_DOMAIN")`, with placeholder guard (`domain && !domain.includes("placeholder")`) before fetching. No other behaviour change.
- Redeploy `sync-profile`. Verify next login no longer logs the placeholder DNS error.
- If `AUTH0_DOMAIN` secret value is itself placeholder, surface that and ask the user for the correct domain via `add_secret`. (Will inspect with `secrets--fetch_secrets` after the code change is in.)

## Part 3 — Working-systems verification (read-only)

For each system below, query logs / DB and report status only. No code changes unless verification surfaces a live failure:

1. **Google Calendar** — `register-calendar-watch` channel expiry, `sync-calendar-scheduled` last run, `refresh-calendar-tokens` outcomes, duplicate-row check on `(user_id, provider, external_id)` in `calendar_events`.
2. **Microsoft Outlook** — confirm webhook support inside `register-calendar-watch`. If absent, document as v1 limitation; do **not** implement Graph subscriptions in this pass.
3. **Apple iOS Calendar** — verify `AppleCalendarBackgroundSyncBridge.swift` + `NativeBackgroundSyncPlugin.swift` still register BGTask, EventKit observer, foreground/resume drain. Preserve false-disconnect protection.
4. **Apple Watch / HealthKit** — verify `WearableSyncBridge`/`processed_outbox_items` idempotency, `X-Outbox-Item-Id` header, distinct states preserved.
5. **Oura** — query `pg_cron` for any `oura-sync-*` schedule + recent invocation logs. If exactly one cron exists, do nothing. If missing, add a single hourly cron with documented job name. If duplicate cron, leave a note (no removal unless user approves).

Output a short status report per system at end of Part 3.

## Part 4 — Cross-calendar canonical dedupe (shared upstream layer)

Single canonical merge runs once; every consumer reads merged output.

### 4a. Strengthen `_shared/rules/calendar-merge.ts → mergeCalendarEvents`

Audit current implementation, then add (only what's missing):
- **Identity key:** `normalize(title) + startTimeBucketUTC(5-min) + durationBucket(±10-min)`. Use existing `normalizeForClassify` for title.
- **Title normalization:** ensure stripping of provider noise prefixes (`Accepted:|Tentative:|Declined:|Fwd:|[External]`), trailing `(GMT±N)` timezone text, collapse punctuation/whitespace.
- **Attendee corroboration:** if titles+time+duration match but attendees clearly disjoint, **do not merge** (bias to split).
- **Canonical event output:**
  - `canonicalId` (stable hash of identity key) + `providerIds: string[]`
  - `sourceCalendars: string[]`
  - unioned `attendees`
  - best-available `location`, `description`, `meetingUrl` (organiser copy first, then richest metadata, then provider precedence)
  - merged `status` (declined/cancelled on any copy → suppress unless newer accepted evidence)
  - `rawSources: []` for debugging
- **Busy-block rule:** suppress untitled/attendeeless Busy block when overlapping with titled real event; keep standalone Busy as soft-hold (returns flag, not removed).
- **Recurring:** match per-instance, never collapse the whole series.

### 4b. Conflict/overlap resolver (new, after dedupe)

Add `resolveOverlaps(canonicalEvents, ctx)` in `_shared/rules/calendar-merge.ts` (or sibling `calendar-overlaps.ts`):
- Group mutually overlapping events using `startA < endB && startB < endA`.
- Tie-break ladder: user tag → relationship weight → category priority → proximity.
- Anchor highest score, mark others `slotSuppressed: true` with `suppressionReason`.
- Emit a `chain` flag (not winner-takes-slot) when overlap looks like same-stakeholder sequence.
- Return load-signal payload for `decisionDensity` / `stackedStakes` consumption.

### 4c. Consumer wiring audit + fix

For each downstream consumer, confirm it reads the merged canonical set. Fix only those that re-fetch raw events:
- `generate-mastery-plan` + `_shared/jit/select-jit.ts` + `_shared/jit/load-jit-context.ts`
- `compute-outer-readiness` (Brief signal pills) + `_shared/brief-signal-coverage.ts`
- `list-week-ahead-priorities`
- `smart-nudges`
- `_shared/ceo-behaviour/multi-calendar.ts` + `calendar-dedupe.ts` (rebase on canonical output instead of re-deduping raw)
- `record-event-priority-signal` + `event_priority_memory` (key on canonical id; on lookup, also match legacy provider id for back-compat)
- HRV correlation path (search `causality_findings`/`physiological_events` consumers)

Specifically check whether Brief independently fetches raw calendar events; if so, route it through the same upstream merge call used by Plan.

### 4d. Memory / HRV key stability

- `event_priority_memory.event_id` and HRV correlation keys move to `canonicalId`.
- On read, fall back to provider-id match so historical tags survive.
- A meeting tagged on Apple stays tagged after merge with Google/MS copy.

### 4e. Load/density accounting

- All density rules count merged distinct events: `decisionDensity`, `backToBackLoad`, `multiCalendarLoad`, `stackedStakes`, Brief pills, Plan slots, smart nudges.
- `multiCalendarLoad` continues to read `sourceCalendars.length` from canonical events (already its contract).

### 4f. Observability

Add structured log line at the canonical merge call site:
```
[calendar-merge] user=… rawEventCount=… mergedEventCount=… dedupeCollapseCount=… conflictGroups=… suppressedBusyBlocks=… sourceCalendars=[…]
```
No new table — purely log output, low-cardinality.

## Part 5 — CEO-behaviour shared module ownership audit

Short markdown report appended to `mem/architecture/ceo-behaviour-shared-module-ownership.md` listing:
1. Where multi-calendar fetch is assembled (single entry point).
2. Where canonical dedupe + overlap resolver now run.
3. Each consumer + whether it reads merged set.
4. Whether Brief had an independent raw fetch + how it was corrected.
5. Memory/HRV key canonicalisation status.
6. Load/density before-vs-after raw/merged counting.

## Part 6 — Light monitoring (optional, scope-permitting)

Only if a monitoring pattern already exists. Otherwise document as follow-up in the report. No new tables.

---

## Files to touch (minimal set)

- **edit** `supabase/functions/smart-nudges/index.ts` (hot-path import only)
- **edit** `supabase/functions/sync-profile/index.ts` (AUTH0_DOMAIN priority + placeholder guard)
- **edit** `supabase/functions/_shared/rules/calendar-merge.ts` (canonical fields, busy-block rule, status suppression, identity-key hardening, observability log)
- **add or edit** `supabase/functions/_shared/rules/calendar-overlaps.ts` (`resolveOverlaps`)
- **edit** consumers that re-fetch raw events (only those proven to bypass the shared merge — list confirmed during 4c audit)
- **edit** `_shared/ceo-behaviour/calendar-dedupe.ts` to consume canonical output (no duplicate dedupe pass)
- **edit** `mem/architecture/ceo-behaviour-shared-module-ownership.md` (Part 5 report)

## Out of scope (explicitly preserved)

- MRS scoring, slot allocator, practice selector, why-line prompt, B4 resolver, Firecrawl, brief snapshot writes, frontend design, Plan composition logic, classifier rules, taxonomy, prompt contracts.
- No Microsoft Graph webhook implementation.
- No new monitoring tables.
- No Anthropic / LLM changes (yesterday's Phase 1 reliability fix stands).

## Acceptance verification (post-edit)

- `smart-nudges` boots; `[smart-nudges] Starting evaluation run` appears in next two cron ticks.
- `sync-profile` logs no longer reference `placeholder_value_to_be_replaced`.
- Manual sanity: pick one user with multiple providers, run the merge log line, confirm `mergedEventCount < rawEventCount`.
- Plan + Brief both show one row for a synthesised "Board Meeting" present on multiple providers.
- Declining on any provider suppresses the canonical event.
- Tagged-on-Apple event remains tagged after Google copy is merged in.

## Open questions for you (will not block if you say "proceed")

1. **Oura cron:** if I find a duplicate cron, should I remove the extra schedule or leave both and flag it?
2. **canonicalId scheme:** OK to use a stable SHA-1 of `(normalizedTitle | startBucketUTC | durationBucket)`? This keeps it deterministic across re-syncs without a DB column.
3. **Status field:** if `calendar_events` does not currently persist per-provider status, OK to derive at merge time from raw metadata (no migration), or do you want a new `status` column?
