# Trip windows in Light Day, and an audit of the attendee-relationship loop

## Part 1 — trips array and August backfill

Checked against the live database first: the `trips` array already exists inside `travel_state.meta`, and August is already backfilled. Shukrita's row holds

```text
trips: [{ start: 2026-08-09, end: 2026-08-17, source: calendar,
          evidence: [flight, stay], confidence: high }]
```

and the hourly job refreshed every row at 13:00 today (two other people have trips too). So no migration and no new backfill are needed — that work landed in the previous change.

What is *not* finished is the second half of the sentence: Light Day classification does not see those windows everywhere.

- The plan generator and the home cards pass the trip window through, so they classify a holiday run correctly.
- The brief's Light Day call (`compute-outer-readiness`) builds its own inputs and passes no trip window and no shared availability — so on an interior holiday day the brief can still read the day as an ordinary quiet day.

### Fix

1. In `compute-outer-readiness`, pass the already-hydrated travel trip window and away distance into that `classifyLightDay` call, and reuse the availability result the run already computes instead of re-deriving one.
2. Confirm the plan generator's `availability` object is built with the trip window (it is passed in from the travel hydration; verify, and wire it if the field is missing).
3. Add tests covering an interior day of the 9–17 August window: brief, plan and nudges all return the same Light Day verdict and the same availability state.

No schema change, no UI change.

## Part 2 — audit of `attendee_resolver_log` / `attendee_relationships`

### The loop as designed

```text
sync-calendar / sync-apple-calendar
  → collectUnresolvedAttendeeEmails()   (drops self, generic domains, fresh cache)
  → detachResolverBatch()               (fire-and-forget, max 25, concurrency 3)
      → resolve-attendee-relationship
           cache hit → return
           generic domain → log "skipped_generic"
           >50 resolved logs in 24h → log "rate_limited"
           Gemini pass 1
           confidence < 0.5 → Firecrawl (cap 15/day) → Gemini pass 2
           domain fallback → peer
           upsert attendee_relationships (90-day TTL, user_tag never overwritten)
           log "resolved"
  → generate-mastery-plan / load-jit-context read attendee_relationships
      and turn the role into a JIT weight (boss 25, report 5, etc.)
```

`record-event-priority-signal` writes sovereign `user_tag` rows into the same table when the user tags a relationship by hand.

### What is actually happening

Both tables are empty: `attendee_relationships` = 0 rows, `attendee_resolver_log` = 0 rows. The resolver has never run once, even though 146 calendar events carry attendees and every one of them stores an `attendeeSignals` block.

Root cause found, and it is one line. `sync-calendar` writes `attendeeSignals` as an **object**:

```text
attendeeSignals: { organizer, attendees: [...], attendeeCount, responseSummary }
```

but `collectUnresolvedAttendeeEmails` (`_shared/attendeeResolverQueue.ts:55`) reads it as an **array**:

```text
const signals = ev?.event_metadata?.attendeeSignals;
if (!Array.isArray(signals)) continue;   // always true → zero candidates
```

Every sync therefore logs `resolver_candidates count=0` and detaches nothing. The lazy backstop inside `generate-mastery-plan` also never fires, because it reads `ev.attendees`, a field the mapped plan events do not carry (the emails live under `event_metadata.attendeeSignals.attendees`). `load-jit-context` reads the correct shape — it is the only reader that would work today, but it has an empty table to read from.

Consequence: every attendee falls to the domain heuristic (`peer` internally, `external_partner` externally, confidence 0.4–0.5), so no meeting is ever weighted as board, investor, client or boss.

### How it informs the brief

It does not. The brief reads `relationship_pattern` from `user_coach_insights`, which comes from coach sessions, not from this table. The attendee chain reaches the plan and JIT selection only. Worth stating plainly rather than implying a link that does not exist.

### Fix

1. `_shared/attendeeResolverQueue.ts` — replace the `Array.isArray` guard with a dual-shape reader: object with an `attendees` array → use it; plain array (legacy rows) → use as-is; anything else → skip. Add a unit test with a real Google-shaped metadata row.
2. `generate-mastery-plan` — fix the lazy backstop to collect emails from `event_metadata.attendeeSignals.attendees`, reusing the existing extractor in `load-jit-context.ts` rather than a second copy.
3. Trigger one calendar sync afterwards and confirm rows appear in both tables, and that at least one role resolves above the domain heuristic.
4. Untouched: resolver chain internals, the Firecrawl step (left in place exactly as-is pending a separate decision), caps, 90-day TTL, `user_tag` sovereignty, `record-event-priority-signal`.

## Technical notes

- Files touched: `supabase/functions/_shared/attendeeResolverQueue.ts`, `supabase/functions/generate-mastery-plan/index.ts`, `supabase/functions/compute-outer-readiness/index.ts`, plus existing test suites.
- No migration, no new table, no new module, no UI.
- Deploy order: `sync-calendar`, `sync-apple-calendar`, `generate-mastery-plan`, `compute-outer-readiness`. All server-side — identical on iOS and web.

