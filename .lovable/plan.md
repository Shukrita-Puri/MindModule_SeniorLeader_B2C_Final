## What's actually broken (evidence)

I read the schema and the live data. Two independent things are wrong; the visible bug (Chief AI ranked above EY despite a HIGH tag on EY) is a downstream symptom of the first.

### 1. Sovereign tag writes are silently rejected by the database

`event_priority_memory.signal` has a CHECK constraint that only allows the legacy 5 signals:

```
priority | not_this_week | never | cancelled_as_noise | cancelled_keep_surfacing
```

But the JIT-v2 rework added 6 new ones in code (`tag_importance_high/medium/low`, `tag_relationship`, `tag_custom`, `tag_cleared`) — listed in the edge function whitelist and read by `generate-mastery-plan`, but the DB still rejects the INSERT. Confirmed by query: zero rows with `signal LIKE 'tag_%'`, zero rows in `attendee_relationships` with `source='user_tag'`. **Nothing the user tags has ever been persisted.** That's why pressing HIGH on the EY card has no effect on ranking.

### 2. UI tag-naming already matches the spec — no rename needed

`PriorityTagAffordance.tsx` already uses Importance (high/medium/low) + Relationship (boss/board/client/...) + custom tags, and writes them through `record-event-priority-signal` with the correct `tag_*` signals. The only thing missing is that the DB won't accept them.

### 3. Relationship re-read (Issue 9 race)

`generate-mastery-plan/index.ts` re-queries `attendee_relationships` on every run (lines 174 & 208) and feeds `attendeeRoles` into `selectJitCandidates`. So "next run picks it up from cache" already works in principle — but because the resolver has produced no `user_tag` rows yet (constraint bug above) and the LLM resolver may not have run for these attendees, the EY interview attendees currently score with `role='unknown' → relationship=0`. Once writes start landing, re-read works. I'll add a small read-side assertion + log to make the race visible if it ever regresses.

### 4. Why Chief AI > EY today

With sovereign tags discarded and EY attendees still `unknown`:
- EY interview (cat C/G, no relationship roles cached, no tag honoured) → `immediate ≈ categoryBase + 0 + small stakesHint`.
- "Chief AI Thursday connects" — title contains "ai"/"chief" which often classifies as a higher-base category and may match a pattern bucket, so its `tactical` outscores EY's `immediate`-only profile.
That ordering is mechanically correct given the inputs; fixing it requires the tag write to land AND/OR the EY attendees to resolve a role.

---

## Plan

### Step 1 — Migration: allow the sovereign-tag signals (and align source list)

Single migration that drops and re-adds the CHECK constraint:

```sql
ALTER TABLE public.event_priority_memory
  DROP CONSTRAINT event_priority_memory_signal_chk;

ALTER TABLE public.event_priority_memory
  ADD CONSTRAINT event_priority_memory_signal_chk
  CHECK (signal = ANY (ARRAY[
    'priority','not_this_week','never',
    'cancelled_as_noise','cancelled_keep_surfacing',
    'tag_importance_high','tag_importance_medium','tag_importance_low',
    'tag_relationship','tag_custom','tag_cleared'
  ]));
```

(`source_chk` already includes `priority_tag` — no change needed there.)

### Step 2 — Make the silent failure loud

In `record-event-priority-signal/index.ts`: on insert error, log the Postgres error code/message and return it in the JSON body (currently it returns a generic `insert_failed` with the real reason only in the function log). Add one console.warn in `TodayThreePriorities.tsx` when the fire() promise rejects so future constraint drift is visible in the browser console.

### Step 3 — Verify the read path end-to-end

`generate-mastery-plan/index.ts` (lines ~224–290) already merges `tag_importance_*`, `tag_custom`, and `tag_cleared` into `ev.tags` per event, and `selectJitCandidates` already calls `sovereignTagAdjustment(ev.tags)` and `userPriorityTagBoost(ev.tags)`. Once Step 1 lands, this path activates with no code change. I'll add one Deno unit test in `select-jit.test.ts` that asserts:

- `tags=['high']` on EY pushes its `importance` above a higher-tactical Chief-AI event.
- `tags=['low']` excludes the event (already covered, but add an explicit Chief-AI-vs-EY scenario mirroring the screenshot).

### Step 4 — Confirm relationship re-read (Issue 9)

Add an assertion test against the loader in `generate-mastery-plan` that, given an event whose attendee has a freshly-inserted `attendee_relationships` row with `source='user_tag'`, the role surfaces in `attendeeRoles` for that event in the next call. No new trigger — just lock the existing re-read behaviour in a test so the race can't silently come back.

### Step 5 — Backfill the user's current state (one-shot)

Because the constraint was rejecting writes, the EY card's HIGH tag the user is staring at right now is NOT in the DB. After Step 1 ships, the user re-tapping HIGH will persist correctly. No data backfill is possible (we never received the rows). Call this out in the closing message.

---

## Files touched

- `supabase/migrations/<new>_event_priority_memory_allow_sovereign_tag_signals.sql` (new)
- `supabase/functions/record-event-priority-signal/index.ts` (better error surfacing only)
- `src/components/home/TodayThreePriorities.tsx` (warn on fire() rejection)
- `supabase/functions/_shared/jit/select-jit.test.ts` (Chief-AI-vs-EY HIGH/LOW assertions)
- `supabase/functions/generate-mastery-plan/__tests__/...` (attendee-relationship re-read assertion — add file if folder is empty)

## Explicitly NOT in scope

- No change to `CATEGORY_BASE`, `STAKES_KEYWORDS`, `MIN_IMMEDIATE`, `resolveTierWeights`, or proximity weights — the SSOT change you cited (Tactical ceiling, proximity demotion) is already implemented in the JIT-v2 files and is a separate workstream.
- No change to the UI of the tag popover — naming already matches the spec.
- No new edge function and no new trigger for relationship resolution; the re-read model already exists.

## Open question for you

One thing to confirm before I implement: when a user picks a **Relationship** tag in the popover (e.g. "Boss"), do you want the `attendee_relationships` upsert (source=`user_tag`, role=`boss`) to apply to **all attendees** on that event (current behaviour, capped at 25), or only when the event has a single non-self attendee? The current "all attendees" approach can over-tag a big meeting if a user just means "my boss is in this one".