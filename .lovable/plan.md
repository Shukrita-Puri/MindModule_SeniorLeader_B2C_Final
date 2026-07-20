## Goal

Close the four launch-adjacent gaps surfaced in the WS6 audit:

1. Give `event_priority_memory.event_subcategory` (WS3 writer) a real reader so subcategory context flows into Insights + Plan without on-the-fly re-classification.
2. Make `findEventPattern`'s subcategory branch cite HR precisely instead of synthesising `rhrElevated: true`.
3. Repair the pre-existing failing source-assertion tests (`plan_fallback_test`, `force_user_isolation_test`) that drifted from the current `smart-nudges/index.ts`.
4. Lock the WS6 contract with a dedicated `smart-nudges` regression test.

Why this matters (plain English):
- WS3 today stamps a subcategory column that nothing reads, so the two downstream customers that care about A–H nuance — the weekly picker and the Insights Stress-Load card — keep re-deriving subcategory from titles every request. That is slower, and it also means user-authored tags (relationship, importance) never anchor to a subcategory the DB already knows. Adding a reader closes the loop and makes the cause-and-effect card honour subcategory-level differences (e.g. "Board Review" vs generic "Review").
- The nudge citation currently says "reserves elevated" for a subcategory pattern that actually only knows about a peak-HR delta. Passing the real bpm through lets copy stay honest without inventing HRV state.
- The two failing tests block a clean pre-launch green build and hide real regressions. They are string-assertion drift, not runtime bugs.
- A dedicated WS6 test prevents the A–H tag flow from silently regressing after future refactors.

## Workstreams

### WS-A · Subcategory reader for `event_priority_memory`

Files:
- `supabase/functions/_shared/plan/event-priority-memory.ts` — extend the shared loader to select `event_subcategory` alongside existing tag fields and return it on the row shape.
- `supabase/functions/list-week-ahead-priorities/index.ts` — when the persisted subcategory is present, use it in place of `enrichEvent(...).subcategoryId` for the meta payload. Fall back to `enrichEvent` when null (older rows).
- `supabase/functions/cause-effect-engine/index.ts` — during the `subcategory_lift` rollup, prefer the persisted `event_subcategory` for the (categoryId, subcategoryId) key when a matching `event_priority_memory` row exists for that event; keep `enrichEvent` as the fallback.
- `src/integrations/supabase/types.ts` — no change (column already present from WS3 migration).

Contract: reader is additive and null-safe. No writer changes. No UI changes.

### WS-B · Precise HR citation in `findEventPattern` subcategory branch

Files:
- `supabase/functions/smart-nudges/index.ts`
  - Extend the returned `EventPattern` shape (or the local return object of `findEventPattern`) with an optional `hrDeltaBpm: number | null`.
  - In the subcategory-hit branch, populate `hrDeltaBpm` from `subHit.hrDeltaBpm` instead of synthesising `rhrElevated: true`. Keep `rhrElevated` unset (or `false`) when only HR delta is known.
  - Update the one or two copy sites that read `rhrElevated` off the subcategory pattern to prefer `hrDeltaBpm` when present.

Contract: category-level branch behaviour unchanged. Ranking heuristic unchanged (composite lift still drives ordering). Only the semantic surfaced to copy is tightened.

### WS-C · Repair pre-existing failing tests

Files:
- `supabase/functions/smart-nudges/plan_fallback_test.ts` — re-align the string/regex assertions with the current `index.ts`. Specifically:
  - Update the `planSnapshotStatus === 'missing' || 'empty'` regex to whatever form the source now uses.
  - Update the `projectPlanSlotToNudge(...)` argument-list regex to match the current call signature.
  - Update the ready-morning fallback regex to match the current control-flow shape around `evaluateNudgeOne`.
  - Update the `.select('notification_type, variant_id, sent_at, event_reference, payload')` literal to the current column list.
- `supabase/functions/smart-nudges/force_user_isolation_test.ts` — re-align the `assertStringIncludes` payloads with the current import path and `if (forceUserId)` block wording.

Rule: fix by adjusting the assertion to the current implementation only where the current implementation still honours the underlying invariant. If any assertion protects an invariant the source no longer implements, flag it in the PR description and leave the test failing rather than papering over a real regression.

### WS-D · WS6 regression test

New file: `supabase/functions/smart-nudges/ws6_taxonomy_contract_test.ts`

Source-string assertions (mirrors the `plan_fallback_test` style, zero runtime cost):
- `generate-mastery-plan/index.ts` stamps `anchorSubcategory` and `anchorCategoryId` on ledger modules.
- `smart-nudges/index.ts` reads `anchorSubcategory` off the plan ledger when constructing `PlanNudgeSlot`.
- `smart-nudges/index.ts` includes `plan_ledger_subcategory` (and `plan_ledger_category`) in the `notification_log` metadata payload for qualified nudges.
- `findEventPattern` prefers `subcategory_lift` over category-level `hr_event_lift` when a subcategory match exists.

## Sequencing & risk

1. WS-C first (unblocks green CI, no runtime impact).
2. WS-D next (locks WS6, no runtime impact).
3. WS-B next (small, isolated typing + copy change in smart-nudges).
4. WS-A last (touches three edge functions; ship behind the existing null-safe fallback so older rows keep working).

All four are additive and reversible. No schema changes, no new secrets, no UI changes.

## Out of scope

- Any change to the WS6 nudge structure (Mind Module title + subtitle + Context+CTA body stays intact).
- Any change to the A–H taxonomy itself.
- Any change to `hrvDeltaPct` / `rhrDeviationPct` computation upstream.
- Backfill of `event_subcategory` for historic `event_priority_memory` rows — reader is null-safe and enrichEvent remains the fallback.
