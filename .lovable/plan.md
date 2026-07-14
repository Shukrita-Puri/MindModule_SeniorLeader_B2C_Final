
# Smart Nudges + Plan Audit — Status vs. July 10 Report

Verified against current `supabase/functions/smart-nudges/index.ts` (5,390 lines) and live `mastery_plan_snapshots` / `notification_log` rows.

## Already fixed (no action needed)

| Audit item | Where | Evidence |
|---|---|---|
| Blocker 1: `planSnapshotStatus === 'empty'` skipped user with `continue` | L4495–4513 | Now logs `[smart-nudges][plan-empty-fallback]` + trace `plan_snapshot_empty_fallback` and **falls through** to legacy cascade (guard at L4538–4541 matches `missing` OR `empty`). |
| Blocker 4 / Fix 3: disabled slot pref aborted whole user | L4515–4533 | Now writes trace `slot_projection_skipped` with `intentionally_skipped: true` and continues to legacy cascade / other evaluators. No `continue` on the user loop. |
| Plan-projected CTA routed to `/executive-home` instead of `/daily-check-in` | L3327 | `projectPlanSlotToNudge` returns `deepLinkRoute: '/daily-check-in'`. |
| Plan-projected copy reused Plan why-line (weak push copy) | L3284–3320 | `projectPlanSlotToNudge` now calls `generateNudgeCopy` (Claude → Gemini → validated static fallback) with JIT/state variants. |
| Fix B: implicit dry-run default | prior fix | Production Delivery is default; `force_dry` explicit. |
| Fix C: dry-run rows counted in suppression | prior fix | All 4 suppression queries filtered by `COUNTABLE_DELIVERY_STATES`. |

## Still relevant — HIGH priority

### 1. **Root cause: Plan pipeline is producing empty `horizon_modules`** (P0)
Live DB shows 17 of last 20 plan snapshots with `slots = 0`:

```
2026-07-14 morning     ready   slots=1
2026-07-13 evening     ready   slots=2, 0, 0, 0
2026-07-13 afternoon   ready   slots=0, 0, 0
2026-07-13 morning     ready   slots=1, 0, 0, 0
2026-07-12 *           ready   slots=0 (all)
```

Nudges now fail-open to the legacy cascade, but **the Plan card itself is empty for most users, most windows**. Recent nudge deliveries (last 2 days): 3 `accepted`, 27 `dry_run`, only `nudge_three` + `nudge_one` + `week_ahead` — no `nudge_two` at all. This confirms the Plan pipeline (audit Parts A/D/D1: merge-precedence, stakes-floor, full-arc gate) still needs fixing.

### 2. **`sentSlotsToday` mapping still keyed on notification_type family, not delivered slot** (P1)
`smart-nudges/index.ts` L4431–4441:
```ts
const slotForType = (t: string) => {
  if (t.startsWith('nudge_one'))   return 'morning';
  if (t.startsWith('nudge_two'))   return 'afternoon';
  if (t.startsWith('nudge_three')) return 'evening';
};
```
A travel pre-flight nudge or JIT variant tagged `nudge_one_*` while the user is actually in the afternoon window would still occupy the "morning" slot bucket. Should key on the actual `slot` returned by the evaluator (already present on `QualifiedNudge.slot`).

## Still relevant — MEDIUM

| # | Audit item | Status | Note |
|---|---|---|---|
| 3 | `travel-notifications` re-derives Pre/During/Post phases instead of reading Plan full-arc | Still open | Nudges and Plan card can disagree on travel days. |
| 4 | Quiet-window / DND evaluated in `effectiveTimezone` only, not `circadianTimezone` | Still open | Pre-dawn pushes possible ~2 days post long-haul. |
| 5 | `meetingPrepCliff` from `_shared/ceo-behaviour/back-to-back.ts` not imported by `evaluateNudgeTwo` | Still open | Duplicated cliff detection; drift risk. |
| 6 | Sync-your-wearable nudge when MRS is `awaiting` for 24h+ | Not implemented | Users with disconnected wearables get no nudge and no signal to reconnect. |

## Still relevant — LOW

| # | Audit item | Status |
|---|---|---|
| 7 | Monthly Insights nudge on second-last day of month | Not implemented |
| 8 | Onboarding cos_profile prefs (goals, archetype, communication style) fed into copy generation | Not implemented |
| 9 | First-sentence-is-meaning-not-metric for static fallbacks | Partial — LLM path clean; static fallbacks sometimes lead with a metric |

## Recommended next actions (in order)

1. **Fix the Plan pipeline** so `horizon_modules` populates for morning/afternoon/evening. This is the single change that unblocks 3 nudges/day for the plan-driven path AND fixes the empty Plan card. Requires re-running audit Parts A / D / D1 against `generate-mastery-plan`.
2. **Rekey `sentSlotsToday`** on `QualifiedNudge.slot` (already available) instead of parsing `notification_type` prefixes.
3. Wire `travel-notifications` to consume Plan `horizon_modules` full-arc entries.
4. Add a `sync_wearable` nudge type when `readinessState === 'awaiting'` for ≥24h and no active wearable connection.
5. Evaluate quiet-window in `circadianTimezone` when `isAway` and days-since-arrival ≤ 2.
6. Replace inline back-to-back detection in `evaluateNudgeTwo` with `meetingPrepCliff` from `_shared/ceo-behaviour/back-to-back.ts`.

No code changes made in this audit — findings only. Ready to implement any subset on approval.
