# Signal Pills — Fallback Signals for No-Sleep / HRV-Late Wearables

Scope: Question 3 of the Six-Question Audit only. No new pills, no change to pill shape, structure or primary logic, no DB migration. HRV + Sleep stay the primary signals; RHR, HR-elevation and check-in only step in when the primaries are absent.

## Verified current state

- `derive-pills.ts` builds Decision Readiness from HRV + sleep + clarity; the sleep block is gated on `sleepDuration != null || sleepScoreVal != null`, so an old Apple Watch contributes nothing there.
- Resilience Capacity's only wearable anchor is `sleepEfficiency`; null on no-sleep watches.
- `rhrValue`, `rhrDeviation`, `hrValue`, `hrDeviation` are already passed into `derivePills` and are currently consumed only by Physical Reserves.
- The V4 gate forces every pill to `neutral` / "Unread" whenever `wearableFreshForGate` is false, even when a same-day check-in exists.
- The frontend tooltip (`PillTooltip.tsx`) and the live-vs-snapshot richness comparison (`DecisionReadinessBrief.tsx`) both use per-pill contributor allow-lists, so any new contributor must be added there or it stays invisible.

## Changes

### 1. Backend — `supabase/functions/_shared/signal-pills/derive-pills.ts`

**Fallback A — RHR as cognitive proxy (Decision Readiness).** Fires only when `hrvValue == null && sleepDuration == null && sleepScoreVal == null` and no wearable tier was pushed:
- with deviation: `> 25 → red`, `> 15 → amber`, else `green` (ordered worst-first; the ordering in the audit snippet leaves `red` unreachable, corrected here)
- without deviation: `> 90 → red`, `> 80 → amber`, else `green`

**Fallback B — HR elevation as resilience proxy.** Fires only when `sleepEfficiency == null` and Resilience has no wearable-derived tier: `rhrDeviation > 10` → amber, else `rhrValue > 80` → amber, else no push (stays check-in/pattern driven).

Both fallbacks add `rhrValue` to that pill's `contributors` **only when they fire**, so normal HRV+sleep days keep today's tooltip byte-identical. Each also sets `fallbackUsed: 'rhr_proxy' | 'hr_elevated_proxy'` for provenance and includes `wearable` in `sourceTypes`.

**Fallback C — check-in-only read instead of "Unread".** When `wearableFreshForGate === false` but `checkInFreshForGate === true` and the pill has a `checkin` source (Decision Readiness via clarity; Resilience via emotion/regulation/pressure), keep the check-in-derived tier instead of forcing neutral, and mark it `freshness: 'checkin_only'` (new value on the `PillFreshness` union), `isScoreBearing: false`, `hiddenReason: null`, with detail copy "Check-in read only. Wearable data hasn't synced yet." Physical Reserves has no check-in source, so it correctly stays "Body Unread".

### 2. Backend — invariant mirror
`supabase/functions/_shared/signal-pills-v4.ts` (`annotatePill` / `enforcePillInvariants`) gets the same `checkin_only` carve-out, otherwise the defensive normaliser re-forces neutral and undoes Fallback C. No logic change in `compute-outer-readiness/index.ts` — it already supplies every input; it just needs redeploying because it bundles the shared module.

### 3. Frontend — so the backend fallback is actually visible
- `src/components/home/PillTooltip.tsx`: allow `rhrValue` under `decision_readiness` and `resilience_capacity`; show the RHR row only when present (no new "No RHR data available" placeholder on normal days); render a one-line basis note when `fallbackUsed` is set, e.g. "RHR proxy — no HRV or sleep today".
- `src/components/home/DecisionReadinessBrief.tsx`: add `rhrValue` to `DISPLAYABLE_KEYS` for those two pills so fallback evidence counts in the live-vs-snapshot richness comparison; render `checkin_only` pills with the muted state treatment rather than the "Unread" copy.
- `src/components/home/__tests__/pillSourcePreference.test.ts`: mirror the same key list.

### 4. Database / Cloud
No schema change. Pills are already stored as JSON in `refined_signal_pills` / `baseline_signal_pills`; the added keys are additive and old snapshots keep rendering unchanged.

### 5. Deploy / repo
Redeploy `compute-outer-readiness`. Changes land in the connected GitHub repo on commit — no separate action.

## Verification

- Deno tests in `derive-pills.test.ts`: RHR proxy fires only with no HRV and no sleep; does not fire when HRV present; deviation thresholds ordered correctly; HR-elevated proxy fires only when sleep efficiency is null; check-in-only pill keeps its tier, is not score-bearing, and Physical Reserves stays neutral in the same state.
- Frontend vitest: tooltip shows RHR under Decision Readiness only when the fallback key is present; a `checkin_only` pill is not labelled "Unread".
- `tsgo --noEmit` clean; full vitest suite green.

## Risk note

Fallback C is the one change existing users will see: pills that read "MIND UNREAD" before the watch syncs will now show a check-in-based state. It is explicitly labelled check-in-only, never becomes score-bearing, and MRS scoring is untouched.