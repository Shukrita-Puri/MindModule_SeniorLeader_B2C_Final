
# Week Ahead → Plan exclusion — canonical contract

Goal: a `not_this_week` action recorded on Sunday for the upcoming week must remove the event from every downstream surface (Week Ahead re-generation, daily context, JIT selection, LLM prompt, deterministic fallback, Today UI) for that target week only — never for the wrong week, wrong occurrence, or wrong category.

## 1. Schema — explicit target-week scope on the signal

New migration `20260722_event_priority_memory_scope.sql`:

- Add to `public.event_priority_memory`:
  - `scope text` — one of `permanent`, `target_week`, `occurrence`, `category_week`, `none`.
  - `effective_week_start date NULL` — user-local Monday of the target week.
  - `effective_week_end date NULL` — user-local Sunday of the target week.
  - `timezone text NULL` — IANA zone used to compute the week.
  - `resolved_event_id uuid NULL` — real `calendar_events.id` when unambiguously resolved.
  - `identity_confidence text NULL` — `resolved` | `ambiguous` | `unresolved`.
  - `meta jsonb` already exists — we add `clientCanonicalId`, `resolutionDiagnostic` inside it.
- Index: `(user_id, event_category, event_type_key, effective_week_start, occurred_at DESC)` and `(user_id, resolved_event_id, effective_week_start)`.
- CHECK enforced by trigger (not a bare CHECK — see below): `scope='target_week'` requires `effective_week_start` and `effective_week_end`; `permanent` requires both null. Use a trigger so `now()`-style expressions stay legal per project rules.
- No backfill of legacy `occurred_at`-derived weeks. Legacy rows keep `scope=NULL` and are handled by the compatibility rule in §6.

Grants and RLS on the table are unchanged.

## 2. Write path — `record-event-priority-signal`

Files: `supabase/functions/record-event-priority-signal/index.ts`, new helper `supabase/functions/_shared/plan/exclusion-scope.ts`.

- Accept in body: `targetWeekStart` (YYYY-MM-DD), `targetWeekEnd`, `timezone`, plus existing `eventId`, `eventTitle`, `signal`, `source`, `meta`.
- Server-authoritative fallback: if the client omits `targetWeekStart`, compute upcoming user-local Monday from `timezone` (or `profiles.timezone`) at write time; do NOT infer from `occurred_at`.
- Signal → scope table:
  - `never` → `scope='permanent'`, week fields null.
  - `not_this_week` → `scope='target_week'`, week fields required.
  - `priority`, `cancelled_*`, `tag_*` → unchanged behaviour, `scope='none'` or existing semantics.
- Identity resolution (only when client sends `canonical:<title>|<startMs>|<duration>`):
  - Parse title / startMs (ms epoch, UTC) / durationMinutes.
  - Query `calendar_events` by `user_id`, normalized-lowercase title, and `start_time BETWEEN startMs±1min`, and duration match ±1min.
  - Unique row → `resolved_event_id`, `identity_confidence='resolved'`.
  - 0 rows → `identity_confidence='unresolved'`, `meta.resolutionDiagnostic='no_match'`.
  - ≥2 rows → `identity_confidence='ambiguous'`, `meta.resolutionDiagnostic='multiple_matches'`. Never store an arbitrary UUID; keep semantic (category, type_key) fallback active.
- Always preserve original `canonical:...` value in `meta.clientCanonicalId`.
- Keep `event_priority_derived` writes exactly as today for `never` / `cancelled_*` / `tag_*`. Do NOT write derived rows for `not_this_week` — target-week exclusion is a scope decision, not a score decision.

## 3. Central decision helper (SSOT)

New file `supabase/functions/_shared/plan/exclusion-evaluator.ts`:

```ts
evaluateEventPriorityExclusion({
  memoryRows, candidate: { eventId, title, startTimeISO, category, typeKey },
  targetDate, timezone
}) → {
  excluded: boolean,
  scope: 'permanent'|'occurrence'|'category_week'|'none',
  reason: string,             // stable enum for logs + reasons[]
  matchedSignalId: string|null,
  matchedIdentity: 'resolved_event'|'category_type'|'title_specific',
  effectiveWeekStart: string|null,
  effectiveWeekEnd: string|null,
}
```

Precedence (top wins):

1. `never` on matching (category, type_key) or `title_specific` — `excluded=true`, `scope='permanent'`.
2. `not_this_week` with `resolved_event_id === candidate.eventId` and candidate's local date inside `[effective_week_start, effective_week_end]` — `scope='occurrence'`.
3. `not_this_week` on matching (category, type_key) with candidate's local date inside the persisted week — `scope='category_week'`.
4. Restore rules — a *later* row for the same **matchedIdentity + scope** supersedes: occurrence `priority`/`tag_cleared` clears only step 2; category `priority`/`tag_cleared` clears steps 2 and 3 for same (category, type_key) but never step 1. `never` can only be cleared by an explicit category-level `tag_cleared` newer than the `never` row.
5. Otherwise `excluded=false`.

All consumers below call this helper. No consumer re-implements `not_this_week`.

## 4. Consumer wiring — every path that can surface the event

- `supabase/functions/_shared/plan/event-priority-memory.ts` — keep the soft-score `applyEventPriorityMemory` for Week Ahead ranking (unchanged semantics), but stop treating `not_this_week` as a scoring penalty when the evaluator already returns `excluded=true` for that same target date — the caller drops the candidate before scoring.
- `supabase/functions/_shared/jit/select-jit.ts` — before the score gate, call the evaluator per candidate; if excluded push into `excluded[]` with reason `user_deprioritised_target_week` / `user_marked_never` and `continue`.
- `supabase/functions/generate-mastery-plan/index.ts`:
  - JIT path already covered via `select-jit`.
  - Deterministic fallback path (the non-JIT anchor selector) — same helper call before anchor selection; before LLM prompt assembly, strip excluded events from `sourceEvents` and from any `context.eventsToday` string list. Add a final assertion after prompt build that no excluded title appears in `promptContext` (guardrail).
  - `buildSharedContext.weeklyPlanSnapshot` remains advisory.
- `supabase/functions/list-week-ahead-priorities/index.ts` — filter excluded items before emitting priorities so the picker itself never re-surfaces a marked item in the same target week.
- `supabase/functions/build-executive-home-cards/*` daily-context builder — apply the same filter to calendar context feeding Brief / Nudges.

## 5. Snapshot invalidation via user-scoped memory revision

- Add helper `computeExclusionRevision(userId, targetDate)`:
  - Selects, for that user, memory rows where `signal IN ('never','not_this_week','priority','tag_cleared')` AND (`scope='permanent'` OR `effective_week_start <= targetDate <= effective_week_end` OR row lacks scope but `occurred_at` within last 21 days).
  - Orders by `occurred_at ASC, id ASC` and hashes `signal|category|typeKey|resolved_event_id|effective_week_start|meta.deleted` with SHA-256.
- Include this hex hash as a new field `exclusionRev` inside `input_signature` for `mastery_plan_snapshots`, and inside the daily-context signature for `daily_context_snapshot`, and inside the Week Ahead snapshot signature for `weekly_plan_snapshots`.
- On any new/changed/tombstoned relevant row, revision changes → signature changes → snapshot regenerates on next fetch.
- Add an idempotent "invalidate now" pass in the write path: after inserting the signal, delete `mastery_plan_snapshots` rows for this user whose `plan_date` falls inside `[effective_week_start, effective_week_end]` OR (for `never`) all future dates, and the matching `daily_context_snapshot` and `weekly_plan_snapshots`. This guarantees the Today UI cannot serve a pre-signal ready row on refresh.

## 6. Legacy compatibility (no destructive rewrite)

- Do not backfill `effective_week_start` for existing rows.
- Evaluator treats a legacy `not_this_week` row (scope null) as follows:
  - If the source is `week_ahead_picker` AND `occurred_at`'s local day is Sunday: treat as target week = the Monday–Sunday immediately after `occurred_at` (documented Sunday rule).
  - Otherwise: fall back to the ISO week of `occurred_at` and emit a `[exclusion.legacy_ambiguous]` diagnostic log with row id.
- Emit `[exclusion.legacy_backfilled]` counters so we can quantify how many legacy rows are being interpreted, without changing DB state.

## 7. Restore path

- Occurrence restore: writing `priority` (or `tag_cleared`) with the same `resolved_event_id` and a `targetWeekStart` inside the same window supersedes only the occurrence exclusion.
- Category restore: writing `priority`/`tag_cleared` with same (category, type_key) supersedes category-week exclusions but never `never`. Clearing `never` requires an explicit category-level `tag_cleared` newer than the `never` row.
- Enforced entirely in the evaluator's precedence order — no destructive updates to prior rows.

## 8. Regression tests (20 scenarios)

New Deno tests under `supabase/functions/_shared/plan/__tests__/exclusion-evaluator.test.ts` and additions to `supabase/functions/generate-mastery-plan/*.test.ts`, `supabase/functions/list-week-ahead-priorities/*.test.ts`, and Vitest tests under `src/__tests__/`. Scenarios:

1–10. Original list: one-off exclusion, occurrence-scoped recurring exclusion, calendar resync, week-ahead regeneration, three cron windows + manual refresh, forced LLM fallback, restore, timezone/week-boundary, older-snapshot-cannot-overwrite, unrelated events keep working.

11. Sunday `not_this_week` excludes the upcoming Mon–Sun week.
12. Same signal does not exclude the same event in the week after.
13. Midweek write with explicit `targetWeekStart` overrides any `occurred_at` heuristic.
14. Two same-title events resolve by `startMs`+duration; wrong occurrence not excluded.
15. Ambiguous canonical id → `identity_confidence='ambiguous'`, no UUID attached.
16. Occurrence restore does not clear category or permanent exclusion.
17. Category restore does not restore an unrelated occurrence.
18. Signal change invalidates only the affected user's snapshots (multi-user isolation test with two profiles).
19. LLM and deterministic paths produce no text derived from an excluded event — assertion on final prompt string and deterministic anchor output.
20. End-to-end replay of `shukrita@mindmodule.me` Sunday-19 → Tuesday-21 case using seeded fixtures.

## 9. Evidence to produce on completion

- Migration SQL diff + applied timestamp.
- List of changed files.
- Redacted `event_priority_memory` before/after rows for the repro user showing new scope columns populated.
- Old `mastery_plan_snapshots` row id + deletion/regeneration timestamp for 2026-07-21 window.
- Regenerated `input_signature` hex before vs after showing `exclusionRev` change.
- Final LLM prompt string for the Tuesday plan, with the "1 day liquid fast" title absent from `eventsToday` and anchor text.
- Deterministic fallback log line showing the candidate dropped with `reason='user_deprioritised_target_week'`.
- Test output for all 20 scenarios.
- Confirmation: Week Ahead ranking still uses `applyEventPriorityMemory` soft-score (unchanged); Insights `causality_findings` reads remain untouched.

## Technical details

- Files created:
  - `supabase/functions/_shared/plan/exclusion-evaluator.ts`
  - `supabase/functions/_shared/plan/exclusion-scope.ts`
  - `supabase/functions/_shared/plan/__tests__/exclusion-evaluator.test.ts`
  - Migration `supabase/migrations/20260722_event_priority_memory_scope.sql`
- Files modified:
  - `supabase/functions/record-event-priority-signal/index.ts` (write scope + safe identity resolution)
  - `supabase/functions/_shared/plan/event-priority-memory.ts` (expose evaluator; keep soft-score for ranking)
  - `supabase/functions/_shared/jit/select-jit.ts` (drop candidates via evaluator)
  - `supabase/functions/generate-mastery-plan/index.ts` (deterministic fallback + prompt guardrail + `exclusionRev` in `input_signature`)
  - `supabase/functions/list-week-ahead-priorities/index.ts` (filter picker output)
  - `supabase/functions/build-executive-home-cards/*` (daily context filter)
  - `src/components/home/WeekAheadPriorities.tsx` (send `targetWeekStart`, `targetWeekEnd`, `timezone` in the invoke body)
- Non-goals: no changes to Insights, Coach, Smart Nudges targeting rules, or Brief scoring beyond stripping excluded events from context strings.
