
# Plan — JIT v2 scoring stack rework (logic + minimal persistence to make sovereign tags real)

Scope unchanged from the previous plan except for **Section 1 (sovereign tag layer)**, which now wires the existing UI naming (`priorityTag` / `relationshipTag` / `customTags`) through to a place the scorer can actually read on every regeneration. This is the smallest schema touch that makes the override real and survives a plan regen.

## Confirmed against the codebase

| Concern | Status today | Action |
|---|---|---|
| Importance tag UI (`high`/`medium`/`low`) | Exists in `PriorityTagAffordance` | Reuse exact names — no rename |
| Relationship tag UI (board/boss/client/…) | Exists, same component | Reuse names; map → `ResolvedRole` |
| `event_priority_memory.signal` accepts graduated importance | No — only `priority` / `not_this_week` / `never` / `cancelled_*` | Extend (see §1) |
| `attendee_relationships.source` distinguishes user vs LLM | Yes (`source` column already exists) | Use `source='user_tag'` for sovereign relationship; weight unchanged from `RELATIONSHIP_WEIGHT` |
| Scorer reads sovereign tags | No — reads `calendar_events.tags`, UI never writes there | Read sovereign tags from `event_priority_memory` at plan-build time |
| `resolveTierWeights` terminal values | T3 = `{immediate 0.35, tactical 0.50, strategic 0.15}` — Tactical leads by weight but loses on raw points | Bump T2/T3 + raise Tactical pool |
| Late-resolving attendees | No re-read; one-shot events miss the signal | Add bounded re-read pass in `generate-mastery-plan` |

## 1. Sovereign user-tag layer — make it real (UPDATED)

**Persistence (smallest schema delta):** extend `record-event-priority-signal` accepted signals so the existing table carries the graduated importance and the relationship tag. No new table.

- Add to `VALID_SIGNALS`: `tag_importance_high`, `tag_importance_medium`, `tag_importance_low`, `tag_relationship`, `tag_custom`, plus `tag_cleared` (when the user removes a tag).
- For relationship/custom writes, include the value in `meta` (`meta.relationshipTag`, `meta.customTags`). Importance is encoded in the signal name itself so it's queryable without JSON ops.
- For `tag_relationship`, also upsert `attendee_relationships` rows with `source='user_tag'` when the event has resolvable attendee emails — but only when the user picked one of the canonical roles (`boss`/`board`/`client`/etc. mapping to `ResolvedRole`). The resolver already treats `source='user_tag'` as sovereign, so this gives "never decays".
- One row per (event_id, kind) — write a new row on each change; reader takes the most recent per kind via `created_at DESC`. No update churn on existing rows.

**Wire-through (no schema):** in `generate-mastery-plan/index.ts`, when constructing `SelectInputEvent.tags`, additionally fetch the latest `tag_importance_*` and `tag_custom` rows for each `event_id` in scope and prepend them onto `tags`:
- `tag_importance_high` → push `'high'`
- `tag_importance_medium` → push `'medium'`
- `tag_importance_low` → push `'low'`
- `tag_custom` → push each `meta.customTags[]` entry
A `tag_cleared` row newer than the importance row wipes that importance for the event.

**Scoring (the sovereign override):** in `select-jit.ts`, replace `userPriorityTagBoost` with a new helper:

```
sovereignTagAdjustment(tags) → { bonus: number, demote: boolean }
```

- `high` / `critical` / `must-prep` → bonus +45
- `medium` / `priority` → bonus +20
- `focus` → bonus +8 (kept as soft boost, not sovereign)
- `low` / `skip` → demote: true (force exclude with reason `user_tag_low`)

Final importance:
```
importance = tier.immediate*immediate + tier.tactical*tactical + tier.strategic*strategic*strategicGate + sovereign.bonus
if (sovereign.demote) exclude
```

The sovereign bonus sits **outside** the weighted sum so it dominates even at T3 weights.

**UI side:** when the user changes a tag in `PriorityTagAffordance`, `TodayThreePriorities` already calls back; add a fire-and-forget invoke of `record-event-priority-signal` with the new signal value alongside the existing plan-ledger write. Existing `signal='priority'` 5★ path stays untouched (backwards compatible).

## 2. Tactical ceiling raised — unchanged from prior plan
`patternHit` cap 25→35 (+ acute-RHR bonus when `rhrDeltaPct ≥ 15, n ≥ 3`), `followThroughBoost` cap 10→15. Maturity weights nudged: T2 → `0.35 / 0.50 / 0.15`, T3 → `0.30 / 0.55 / 0.15`. T0/T1 unchanged.

## 3. Onboarding multiplier — unchanged
`UserGoals.protectGoals?: string[]`; new mapping `PROTECT_GOAL_TO_CATEGORY` in `goal-alignment.ts`; in `select-jit.ts` apply `categoryBase *= 1.3` when the event category appears in `protectGoals`. Plumb `protectGoals` from `req.onboarding.protectGoals` (confirm exact path during build).

## 4. Proximity demoted to ±5 tiebreaker — unchanged
Clamp `proximityScore` output in `jit-candidates.ts` to ±5. `select-jit.ts` sort order untouched (already uses `minutesUntilStart` last).

## 5. Relationship-by-type leads Immediate when untagged
No code change — already true. Add diagnostic field `breakdown.relationshipLeads: boolean` (true when `tags` empty AND `rel ≥ 15`) so the team can verify the behaviour in `jit_event_context.shadow_v2_components`.

## 6. Late-resolving relationship re-read (Issue 9)
In `generate-mastery-plan/index.ts` immediately after the existing `attendee_relationships` query (lines 170–183):

1. Compute `unresolvedEmails = emails − roleByEmail.keys() − genericDomains`.
2. If `0 < unresolvedEmails.length ≤ 10`, invoke `resolve-attendee-relationship` once via `Promise.race` with a 1500 ms timeout (resolver already enforces daily-50 cap).
3. Re-query `attendee_relationships` for the same email set and merge.
4. Score with whatever's cached after the merge — falls back to today's behaviour on timeout/error.
5. Add diagnostic `roleResolutionPending: boolean` in `components.breakdown`.

## Files touched

- `supabase/functions/_shared/jit/select-jit.ts` — sovereign adjustment, importance formula, breakdown additions, new exclusion reason `user_tag_low`.
- `supabase/functions/_shared/jit/tactical-signals.ts` — patternHit cap 35 + acute-RHR bonus; followThroughBoost cap 15; `userPriorityTagBoost` reduced to focus-only (sovereign handled in new helper).
- `supabase/functions/_shared/jit/maturity-tier.ts` — T2/T3 weights.
- `supabase/functions/_shared/jit/goal-alignment.ts` — `protectGoals`, multiplier helper.
- `supabase/functions/_shared/events/jit-candidates.ts` — clamp `proximityScore` to ±5.
- `supabase/functions/generate-mastery-plan/index.ts` — late-resolution pass; `protectGoals` plumbing; **new:** fetch latest `event_priority_memory` rows by `event_id` for `tag_importance_*` / `tag_custom` and merge into `SelectInputEvent.tags`.
- `supabase/functions/record-event-priority-signal/index.ts` — extend `VALID_SIGNALS`; on `tag_relationship` with canonical role, upsert `attendee_relationships` row with `source='user_tag'`.
- `src/components/home/TodayThreePriorities.tsx` — invoke `record-event-priority-signal` from the existing `PriorityTagAffordance` `onChange` handler (write `tag_importance_*` / `tag_relationship` / `tag_custom` / `tag_cleared`).
- Tests: extend `select-jit.test.ts`, `jit-candidates.test.ts`; add unit for `applyProtectGoalMultiplier`; add a test for `record-event-priority-signal` accepting the new signals.

**No new tables, no new columns.** `event_priority_memory.signal` and `attendee_relationships.source` are repurposed within their existing text contracts.

## Open items needing your confirmation before build

1. **Onboarding payload field name** for `protect_goals` — confirm `req.onboarding.protectGoals` or point me at the right field on `onboarding_v8_responses`.
2. **1500 ms latency budget** for synchronous attendee re-resolution inside `generate-mastery-plan` — OK, or skip the wait and accept that single-occurrence events miss the signal until next sync run?
3. **Custom tags scoring** — confirm custom tags should NOT contribute to importance (kept as user-meaningful labels only). Current plan: free-text custom tags carry **no score**; only the importance + relationship channels score.
