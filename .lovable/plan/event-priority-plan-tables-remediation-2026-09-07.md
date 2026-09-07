# Event priority & plan tables — remediation

Isolated fix of four empty/broken data paths. Two days from launch, so this is deliberately narrow.

## Safety constraints (enforced throughout)

- No new files — every change is an in-place edit to an existing file, marked with a version comment at the change point.
- No UI, copy, screen or visual changes. All server-side; no iOS or web build needed.
- Nothing outside the four items below is touched: Light Day rules, week-ahead rules, notification send times and volume, travel and conference day logic, availability classification, brief generation, the attendee resolver chain, `calendar_event_classifications` (R3 dropped), `daily_ritual_completions` (stays the primary ledger, untouched), existing RLS policies, existing API shapes.
- One migration only (adjusting `jit_carousel_cards` columns). No other table altered.
- One backfill only (`day_kind`). No other historical data rewritten.
- If a change would reach outside this list, stop and flag it rather than proceed.

## 1. Fix the empty `day_kind` column (R1)

The save writes `meta.dayKind`, which the plan object never sets — the real value is `meta.dayShape`. All 272 saved plans have a blank day type.

- `generate-mastery-plan/index.ts` (~line 9660): read `meta.dayShape` first, fall back to `meta.dayKind`.
- Backfill existing rows from the stored plan payload.
- One test added to the existing suite: a generated plan saves a non-null day type. No new test file.

## 2. Record actual slot completions (R2)

`mastery_plan_completions` is empty; nothing writes it.

- In `daily-rituals/index.ts` only: alongside the existing ritual completion upsert, write a companion row keyed to the active plan snapshot for that user/date/window, the slot index / priority id from the snapshot's priorities, the practice id and completion time.
- Unique on (snapshot id, slot index) — repeating a completion updates the same row.
- `daily_ritual_completions` untouched; this is an additional per-slot projection only.
- No backfill; collection starts at go-live.
- One test: writing the same completion twice produces one row.

## 3. Smart Nudges reads real event priority (R5)

Nudges currently only check whether the week-ahead picker was used.

- In `smart-nudges/index.ts` only: reuse the Plan's existing priority-memory and derived-map helpers — no duplication.
- When choosing which upcoming event a nudge anchors to: events marked "never" are never used as an anchor; events with positive importance are preferred.
- No change to send times, volume, Light Day rules, week-ahead rules, or any other nudge logic.
- One test: a "never"-marked event is not selected as an anchor.

## 4. JIT v2 prioritisation gets persisted (R6)

`jit_carousel_cards` is empty because its only writer, `generate-jit-carousel`, has no caller — a pre-v2 leftover. The ranking JIT v2 produces is discarded after each run, so A–H categorisation is stored but prioritisation is not.

- Delete the orphaned `generate-jit-carousel` function (no callers).
- Repurpose `jit_carousel_cards` as the JIT v2 selection record: ranked events with final score, tier, score components (category base, relationship, pattern, priority tag, skip penalty, follow-through, goal alignment), the chosen slot (Immediate / Tactical / Strategic), and exclusion reasons for dropped events.
- Write from the caller in `generate-mastery-plan/index.ts` after selection, using `SelectResult` (`ranked[].scoreBreakdown`, `tier`, `excluded[]`) directly.
- One row set per user per run; each run replaces that user's previous rows, so the table shows current truth and does not grow unbounded.
- RLS unchanged (owner-read, service-role write).
- One test: a run writes rows, a second run replaces them, count stays constant.

## Deploy order

1. Run the `jit_carousel_cards` migration.
2. Run the `day_kind` backfill.
3. Deploy `generate-mastery-plan`, `daily-rituals`, `smart-nudges`.
4. Delete `generate-jit-carousel`.
5. Trigger a test plan generation and confirm: day type is non-null, JIT rows exist, and a ritual completion writes a slot completion row.

## Technical notes

- `day_kind: planObj?.meta?.dayShape ?? planObj?.meta?.dayKind ?? null`; backfill `UPDATE mastery_plan_snapshots SET day_kind = plan_json->'meta'->>'dayShape' WHERE day_kind IS NULL;`
- Completion writer sits beside the existing upserts in `daily-rituals/index.ts`; resolves snapshot id from `mastery_plan_snapshots` for that user/date/window and slot index from `priorities[]`. Unique key `(mastery_plan_snapshot_id, slot_index)`.
- Nudges: existing priority read at `smart-nudges/index.ts:5102` widens to consume `event_priority_derived` as well as `event_priority_memory`.
- JIT persistence migration alters `jit_carousel_cards` columns only.

## Out of scope

R3 (`calendar_event_classifications`), Light Day rules, week-ahead rules, notification send times and volume, travel logic, conference day logic, availability classification, brief generation, attendee resolver chain, `daily_ritual_completions`, and anything not named above.
