
# Close WS-A / WS-B / WS-D gaps + FE consumption sweep across WS1–6

Goal: make persisted `event_priority_memory.event_subcategory` the single source of truth end-to-end (edge → FE), lock the contract with a regression test, take the first `hrDeltaBpm` citation step, **and confirm every FE surface for WS1–6 is wired to the A–H taxonomy fields it should be reading**.

---

## Part A — Backend + shared type work

### 1. Shared taxonomy type (unblocks FE + edge reuse)
- Add `supabase/functions/_shared/events/priority-types.ts` exporting `WeekAheadPriority` (mirrors edge `Scored` incl. `subcategoryId: string | null`) and `WeekAheadTag` union.
- Mirror as plain TS in `src/types/weekAhead.ts` for FE (Vite can't import Deno `npm:` specifiers). Keep the two in sync — single ~10-line struct.
- `list-week-ahead-priorities/index.ts` and `WeekAheadPriorities.tsx` both import the shared type instead of redeclaring `PriorityItem` / `Scored`.

### 2. Shared loader extension (WS-A gap #1)
Extend `supabase/functions/_shared/plan/event-priority-memory.ts`:
- Add `event_subcategory` (nullable) to `PriorityMemoryRow` and to the `select(...)` in `loadPriorityMemoryForUser`.
- Add helper `getSubcategoryForEvent(index, key): string | null` returning the most recent non-null value.
- `generate-mastery-plan` priority-memory reads use the helper first; `enrichEvent(title).subcategory` only as fallback. No behaviour change when memory absent.

### 3. cause-effect-engine consumption (WS-A gap #2)
`supabase/functions/cause-effect-engine/index.ts`:
- When building `subcategory_lift`, prefer persisted subcategory (via shared loader keyed by `event_id`) before falling back to `classifyEventCanonical(title)`.
- Deterministic classifier remains for events without a memory row. `hrDeltaBpm` emission unchanged.

### 4. hrDeltaBpm first citation (WS-B step 1, copy-only)
`supabase/functions/smart-nudges/index.ts`:
- In subcategory-branch nudge copy, when `hrDeltaBpm ≥ 3`, append parenthetical (e.g. `"(+4 bpm vs baseline)"`) after the existing context clause. Skip when null/<3 or when length clamp would be exceeded. No structural change — Mind Module title + Context+CTA body contract preserved.

### 5. WS-D regression test
Add `supabase/functions/list-week-ahead-priorities/subcategory_persistence_test.ts` (Deno, mirrors `selector-evidence.test.ts`):
- E1: memory row with `event_subcategory = 'C.interview_panel'` → response `subcategoryId === 'C.interview_panel'`.
- E2: no memory row, title matches an `enrichEvent` subcategory → falls back correctly.
- E3: no memory row, unrecognised title → `subcategoryId === null`.

---

## Part B — Frontend consumption sweep (WS1–6)

Purpose: prove every FE surface downstream of WS1–6 reads the correct backend field. For each, either confirm it's already wired or wire it in this PR.

### 6. Week Ahead picker — `WeekAheadPriorities.tsx` (WS1/WS3/WS-A)
- Adopt shared `WeekAheadPriority` type.
- Render `subcategoryId` as a subtle secondary chip after the primary category label when non-null; hidden when null. Existing 3-tag truncation unchanged (subcategory is a separate slot).

### 7. Plan slots — `TodayThreePriorities.tsx` (WS4)
- Verify slots surface `anchorSubcategory` / `anchorCategoryId` / `jitPhase` (incl. Travel Arc) already stamped in `plan_ledger`.
- If displayed anchor label re-derives from title anywhere, switch to the ledger fields. Otherwise: document as already-wired and skip.

### 8. Insights — `PerformanceCausalityCard.tsx` (WS5)
- Card already consumes `subcategory_lift[].subcategoryId` + `hrDeltaBpm` in the "top subcategories" row (confirmed lines 463–467). Action: confirm no title-based inference remains; if any fallback path still re-derives subcategory client-side, remove it and rely on the server field with a graceful empty state.

### 9. Insights — `PerformanceRhythmCard.tsx` (WS5 adjacent)
- Already reads `categoryId` + `hrDeltaBpm` from `hr_event_lift` (confirmed lines 120–371). Action: no code change; include in the validation checklist.

### 10. Notifications surface (WS6)
- `notification_log.metadata.plan_ledger_subcategory` and `anchor_category` are stamped server-side. FE currently doesn't render these (nudges are OS-level). Action: none — document as "backend-only telemetry, no FE surface required."

### 11. Sweep test — `src/components/home/__tests__/planSlotRendering.test.ts`
- Extend existing test with a case asserting a slot with `anchorSubcategory` renders and does not fall back to title-based inference. Locks WS4→FE contract.

---

## Part C — Hygiene

### 12. Migration
No backfill — historical `event_priority_memory` rows stay NULL; WS-A fallback (`enrichEvent`) handles them and is covered by the new test.

### 13. Out of scope
- Broader `hrDeltaBpm` surfacing (tooltips, Insights body copy).
- Rewriting cause-effect classifier to trust memory unconditionally.
- Historical backfill job.
- Any WS1–3 core taxonomy/writer changes (already shipped).

---

## Validation

- `deno test supabase/functions/list-week-ahead-priorities/subcategory_persistence_test.ts`
- `deno test supabase/functions/_shared/plan/event-priority-memory.test.ts` (extend for new field)
- `bunx vitest run src/components/home/__tests__ src/components/insights/__tests__`
- Manual: load Week Ahead picker, confirm subcategory chip appears where memory has one.
- Redeploy: `list-week-ahead-priorities`, `generate-mastery-plan`, `cause-effect-engine`, `smart-nudges`.

## FE consumption matrix (post-PR)

```text
WS  Backend field                          FE surface                        Status after PR
--  -------------------------------------  --------------------------------  ---------------
1   event category/subcategory taxonomy    (shared types)                    wired (shared type)
2   enrichEvent output                     Week Ahead, Plan                  wired
3   event_priority_memory.event_subcat.    Week Ahead subcategory chip       wired (new)
4   plan_ledger anchorSubcategory/Arc      TodayThreePriorities slot label   wired (verified)
5   cause_effect subcategory_lift          PerformanceCausalityCard          wired (verified)
6   nudge metadata (plan_ledger_subcat.)   n/a (OS notification only)        n/a — telemetry only
```
