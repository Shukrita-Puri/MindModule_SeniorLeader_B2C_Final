# Align wearable freshness gating with the window-aware rule

Right now the Executive Brief already treats a morning wearable row from yesterday as "current", but the Signal Pills, MRS score gate and Plan use a stricter same-day-only check. That mismatch is why a morning read can show a brief built on wearable data while the pills say "unread". This change makes all of them use the one canonical rule.

## Canonical rule (unchanged, just reused)
- Morning: wearable row is current when it is 0 or 1 day old.
- Afternoon and Evening: wearable row must be same-day (0 days old).

No scoring logic, thresholds, prompts or rules change — only which freshness flag the pills/score/plan path reads.

## Changes

### 1. `supabase/functions/compute-outer-readiness/index.ts`
- Remove the same-day-only `wearableFreshForGate` declaration (line 4041) and the two gate lines that sit beside it (`calendarUsableForGate`, `stageOneSignalForGate`, lines 4042-4044).
- Re-declare all three immediately after `signalFreshness` is resolved (after line ~4088), with `wearableFreshForGate = signalFreshness.wearableCurrent`. `calendarUsableForGate` and `stageOneSignalForGate` keep their exact existing expressions.
- Moving the block is required because the gate consts must be declared after `signalFreshness` exists; nothing reads them between the old and new positions (verified: all reads are at line 4125 and later).
- `resolveSignalFreshness` is already imported; no new imports.

### 2. `supabase/functions/build-executive-home-cards/index.ts`
- Add import of `maxWearableAgeDaysForWindow` from `../_shared/signal-engine/signal-freshness.ts`.
- Replace the same-day-only `hasFreshWearable` (line 681) with an age-based check using `maxWearableAgeDaysForWindow(window)` and the day difference between `localDate` and `latest.summary_date`. The local `window` value is the same three-value morning/afternoon/evening union, cast where needed for the helper's parameter type.

## Verification
- Run `tsgo`.
- Deploy `compute-outer-readiness` and `build-executive-home-cards`.
- Report exact lines changed.
