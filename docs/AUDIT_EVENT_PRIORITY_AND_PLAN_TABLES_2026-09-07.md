# Audit — event priority storage, plan persistence, completions (2026-09-07)

Audit only. No code changed.

## 1. Where a prioritised / A–H categorised event lives

| Table | Rows (live) | Purpose | Writer | Readers |
|---|---|---|---|---|
| `event_priority_memory` | 63 | Append-only ledger of every user signal on an event occurrence: Week-Ahead picker Star / Not-this-week / Never, cancellation feedback, sovereign tags (`tag_importance_*`, `tag_relationship`, `tag_custom`). Scoped by `scope`, `effective_week_start/end`. **This is the week-ahead persistence layer.** | `record-event-priority-signal/index.ts:258, :302, :536` | Plan `generate-mastery-plan/index.ts:480,510,581,617`; JIT v2 `_shared/jit/load-jit-context.ts:208`; Week Ahead `list-week-ahead-priorities/index.ts:483`; Nudges `smart-nudges/index.ts:5102` (picker-opened proxy) |
| `event_priority_derived` | 4 | Durable per-(user, category, type_key) aggregate: `net_importance`, `permanent_flag` ("never" hard block). Week-agnostic. | `record-event-priority-signal/index.ts:406` (`onConflict: user_id,event_category,event_type_key`) | Plan only — `generate-mastery-plan/index.ts:5954` |
| `event_category_confirmations` | 29 | Confirmed A–H category per normalised title (resolver layer 1 cache). | `_shared/events/learning-store.ts:197/219/229` | `primeLearningContext` → Brief `compute-outer-readiness/index.ts:3225` |
| `event_learned_tokens` | 1 | Nightly promoted tokens (`promote_learned_event_tokens()`), resolver layer 2. | Postgres cron function | same `loadLearningContext` path |
| `calendar_event_classifications` | 0 | **Dead schema.** No insert or select anywhere in `supabase/functions` or `src`. Only appears in the delete-preview manifest. | — | — |

Category resolution itself is not stored per-event as a first-class row: it is computed on demand by `resolveEvent()` (`_shared/events/resolve-event-category.ts`) with persisted layers coming from `calendar_events.event_category/_subcategory`, confirmations and learned tokens.

**Is this DB read by Plan, Brief and Nudges?** Partly:
- Plan: yes, both priority tables.
- JIT v2 and Week Ahead: yes, `event_priority_memory`.
- Smart Nudges: only a shallow existence check on `event_priority_memory` (did the picker get opened today). It does **not** consume `event_priority_derived` or the importance signals.
- Brief: reads only the classification-learning tables, **never** the priority tables — importance ("this meeting matters to you") does not reach the Brief.

## 2. Where formed plans are stored

`mastery_plan_snapshots` — one row per `(user_id, plan_date, mrs_window)`, upserted by `generate-mastery-plan/index.ts:9654-9678` (`persistMasteryPlanSnapshot`). Holds `plan_json`, `horizon_modules`, `priorities`, `recommended_practice_ids`, `plan_ledger`, `input_signature`, `status`, `horizon_iso`, `day_kind`. Read back through `get-mastery-plan-snapshot` → `useMasteryPlanSnapshot.ts`, and by `smart-nudges` (`horizon_modules`).

Week-level plans live separately in `weekly_plan_snapshots` (22 rows), written by `list-week-ahead-priorities`, read by `generate-mastery-plan` as advisory context.

Live state: 272 snapshot rows, 254 `ready`, 12 users, latest 2026-09-06.

## 3. `day_kind` is never populated — root cause

Query: `count(day_kind) = 0` of 272 rows.

The upsert reads
```ts
day_kind: planObj?.meta?.dayKind ?? planObj?.dayKind ?? null,   // index.ts:9660
```
but the plan object only ever writes `meta.dayShape` (`index.ts:6596, 6765, 9139, 9148, 9174, 9181`; the rest-day check at `:9489` also reads `meta.dayShape`). There is no `dayKind` key anywhere on `planObj`, so the coalesce always lands on `null`. A second error-path upsert (`:10038`) omits the column entirely, which is fine.

Effect: any consumer keying off `snapshot.day_kind` (hook field `dayKind`, `admin-executive-home-audit`) sees `null` and silently falls back. The real day classification still exists inside `plan_json.meta.dayShape`, and `daily_context_snapshot.day_kind` is populated separately, so this is a projection gap, not lost information.

## 4. `mastery_plan_completions` — not wired

0 rows. No `.insert`/`.upsert`/`.from("mastery_plan_completions")` exists in `supabase/functions` or `src`. It appears only in its creating migration (`20260305142944_…sql:129`), the generated types, and the user-delete manifest (`admin-user-delete-preview/index.ts:61`).

The live completion ledger is `daily_ritual_completions` (438 rows), written by `daily-rituals/index.ts:466,568` (`onConflict: user_id,ritual_date,session_period`) and read by Plan (`generate-mastery-plan:9628` for `plan_ledger`), insights, feedback and nudges.

So: `mastery_plan_completions` is superseded schema debt, not a broken feature. Nothing is currently missing because of it — but it also means there is no per-slot, per-plan completion record tied to `mastery_plan_snapshots.id`; completion is only known at ritual/date/period granularity.

Also empty and worth noting in the same family: `jit_carousel_cards` (0 rows) despite JIT v2 being live.

## Recommendations

**R1 — Fix the `day_kind` projection (low risk, 1 line).**
Change the upsert to source the canonical value: `planObj?.meta?.dayShape ?? planObj?.meta?.dayKind ?? null`, or rename at the source so plan and snapshot agree on one word. Prefer one vocabulary — `dayShape` inside plan_json, `day_kind` as the column — and document the mapping. Backfill is possible from `plan_json->'meta'->>'dayShape'` for the 272 existing rows.

**R2 — Decide `mastery_plan_completions`: adopt or drop.**
Either (a) drop the table and keep `daily_ritual_completions` as the single completion ledger, or (b) start writing it from the same code path that writes ritual completions, keyed to `mastery_plan_snapshots.id` + slot index, so per-slot plan adherence becomes measurable. Option (a) is cheaper; option (b) is the only way to answer "which generated slot did the user actually do". Do not leave it half-alive.

**R3 — Delete `calendar_event_classifications`.**
Zero readers, zero writers, zero rows. Its job is already done by `calendar_events.event_category/_subcategory` plus the learning tables. Keeping it invites a future writer that bypasses `resolveEvent()`.

**R4 — Let importance reach the Brief.**
The Brief resolves categories but never sees `event_priority_derived.permanent_flag` / `net_importance` or the sovereign tags. A user who marked a recurring meeting "never" can still have it named in the Brief. Feed the same `loadPriorityMemoryForUser` / derived map the Plan uses into the Brief's event-selection step so all surfaces suppress and elevate identically.

**R5 — Smart Nudges should read priority, not just presence.**
Currently only checks "did the picker get used today". Anchored high-stakes sends would be more accurate reading the same derived importance map.

**R6 — Investigate `jit_carousel_cards` = 0.**
JIT v2 is the sole ranking engine but the carousel table is empty; either the writer was removed with the engine switch-over or the surface is being served from `plan_json`. Worth confirming before it is assumed to be a data source.

**Priority:** R1 (immediate, trivial) → R2 decision → R4 (correctness of what users see) → R3/R5/R6 (cleanup).
