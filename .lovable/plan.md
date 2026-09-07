# Event priority & plan tables — remediation

Implements the audit recommendations, minus R3 (dropped, `calendar_event_classifications` stays untouched).

## 1. Fix the empty `day_kind` column (R1)

The plan save writes `meta.dayKind`, which the plan object never sets — the real value lives in `meta.dayShape`. Every one of the 272 saved plans therefore has a blank day type.

- Change the snapshot save to read `meta.dayShape` first, falling back to `meta.dayKind`.
- Backfill all existing rows from the stored plan payload so history is complete.
- Add a small test asserting a generated plan saves a non-null day type.

## 2. Record what the user actually completed, per plan slot (R2)

`mastery_plan_completions` is empty; nothing writes it. Adopt it rather than drop it, so we can answer "which generated slot did they actually do".

- When a ritual completion is written (`daily-rituals`), also write a companion row keyed to the plan snapshot id, slot index/priority id, practice id and completion time.
- Idempotent: repeating a completion updates the same row instead of duplicating.
- Keep `daily_ritual_completions` exactly as it is — it stays the primary ledger; this is an additional per-slot projection.
- Backfill is not attempted (historic completions cannot be mapped back to slots reliably); we start collecting from go-live.

## 3. Smart Nudges reads real priority, not just "picker was opened" (R5)

Today nudges only check whether the week-ahead picker was used. They will instead read the same importance view the Plan uses:

- Load the durable per-event-type verdicts (`event_priority_derived`) and this week's signals (`event_priority_memory`).
- Events the user marked "never" are never anchored in a nudge.
- Events with positive importance are preferred when choosing which upcoming event a nudge anchors to.
- No change to send times, volume, or the light-day / week-ahead rules.

## 4. JIT v2 prioritisation gets persisted (R6)

The carousel table is empty because the only writer, `generate-jit-carousel`, has no caller — it is a leftover from the pre-v2 engine. A–H categorisation is stored, but the *ranking* JIT v2 produces is discarded after each run.

- Delete the orphaned `generate-jit-carousel` function.
- Repurpose `jit_carousel_cards` as the JIT v2 selection record: on each selection, persist the ranked events with their final score, tier, the score components (category base, relationship, pattern, priority tag, skip penalty, follow-through, goal alignment), the chosen slot (Immediate / Tactical / Strategic) and the exclusion reasons for events that were dropped.
- One row set per user per selection run, replacing that run's previous rows so the table shows current truth rather than growing unbounded.
- This makes the prioritisation auditable outside the engine and readable by Plan, Insights and any future surface.

## Technical notes

- `supabase/functions/generate-mastery-plan/index.ts:9660` — `day_kind: planObj?.meta?.dayShape ?? planObj?.meta?.dayKind ?? null`; backfill via `UPDATE ... SET day_kind = plan_json->'meta'->>'dayShape' WHERE day_kind IS NULL`.
- Completion writer lives beside the existing upserts in `supabase/functions/daily-rituals/index.ts`; needs the active snapshot id from `mastery_plan_snapshots` for that user/date/window, plus slot index resolved from the snapshot `priorities[]`. Unique key `(mastery_plan_snapshot_id, slot_index)`.
- Nudges: reuse the Plan's `loadPriorityMemoryForUser` / derived-map helpers in `supabase/functions/smart-nudges/index.ts` (currently only `event_priority_memory` presence at :5102).
- JIT persistence: `SelectResult` from `_shared/jit/select-jit.ts` already carries `ranked[].scoreBreakdown`, `tier`, and `excluded[]` — write it from the caller in `generate-mastery-plan` after selection. A migration will adjust `jit_carousel_cards` columns to hold score/tier/breakdown/exclusions; RLS stays owner-read, service-role write.
- Tests: day_kind projection, completion idempotency, nudge "never"-suppression, JIT persistence round-trip.
