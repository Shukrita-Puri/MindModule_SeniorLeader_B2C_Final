# Correction — Resilience Fallback Must Read HR Elevation, Not RHR

Audit confirms all three findings against the code in Lovable, which is committed and therefore identical on GitHub (working tree clean at `b809cc0a8`).

## Verified current state

- `derive-pills.ts` line ~278: the cognitive RHR fallback condition is `cogTiers.length === 0 && hrvValue == null && sleepDuration == null && sleepScoreVal == null && rhrValue != null` — no `wearableFreshForGate` term, even though that variable is already destructured at line 235. The V4 gate at line ~506 does force `tier: 'neutral'` and `isScoreBearing: false` when the wearable is stale, so no wrong tier reaches the user, but `fallbackUsed: 'rhr_proxy'` is still stamped onto the payload from stale data.
- Lines 344–348: the Resilience fallback reads `rhrDeviation` / `rhrValue` while labelling itself `hr_elevated_proxy`. `hrValue` / `hrDeviation` are destructured at lines 218–219 and are genuinely populated upstream (`compute-outer-readiness/index.ts` lines 4268–4278 compute `hrDeviation` and set `wearableContext.hrElevated`), so the correct signal is available.
- Line 427: the Resilience contributor payload emits `rhrValue` under the `hr_elevated_proxy` fallback.
- RHR is already the primary Physical Reserves signal (lines 307–322), so feeding it into Resilience double-counts one signal across two pills.

## Changes

### 1. `supabase/functions/_shared/signal-pills/derive-pills.ts`

- **Cognitive fallback (~line 278):** add `wearableFreshForGate &&` to the condition so `rhr_proxy` cannot be stamped from stale wearable data.
- **Resilience fallback (~lines 343–349):** gate on `wearableFreshForGate` and switch the signal to active HR elevation:
  - `hrDeviation != null && hrDeviation > 10` → amber
  - else `hrDeviation == null && hrValue != null && hrValue > 80` → amber
  - otherwise no push (pill stays check-in / pattern driven)
- **Resilience contributors (~line 427):** emit `hrValue` instead of `rhrValue` when `hr_elevated_proxy` fired.
- The `resilienceSources.push('wearable')` condition at ~line 466 stays as-is (keyed off `resilienceFallbackUsed`), so provenance still reports correctly.

### 2. Frontend allow-lists — otherwise the corrected evidence is invisible

- `src/components/home/PillTooltip.tsx`: in `ALLOWED_CONTRIBUTORS.resilience_capacity`, replace `'rhrValue'` with `'hrValue'` (line ~143). `hrValue` already has a formatter at line 75, so no new row config is needed.
- `src/components/home/DecisionReadinessBrief.tsx`: in `DISPLAYABLE_KEYS.resilience_capacity`, replace `'rhrValue'` with `'hrValue'` (line ~1914) and update the neighbouring comment.
- `src/components/home/__tests__/pillSourcePreference.test.ts`: mirror the same key change so the test list stays in sync with the component.

### 3. Tests

- Update the Deno tests in `derive-pills.test.ts` that assert the Resilience proxy: it must now fire on `hrDeviation > 10` (or `hrValue > 80` with no deviation) and must **not** fire on RHR alone.
- Add: `rhr_proxy` does not fire when `wearableFreshForGate === false`; `hr_elevated_proxy` does not fire when `wearableFreshForGate === false`; the Resilience contributor payload carries `hrValue` and not `rhrValue` when the fallback fires.

### 4. Memory

`mem/ui/performance-readiness/signal-pill-fallbacks.md` currently documents Fallback B as RHR-based — rewrite that bullet to HR elevation and note that both fallbacks require a fresh same-day wearable.

### 5. Database / deploy

No schema change — pills remain additive JSON in `refined_signal_pills` / `baseline_signal_pills`, and older snapshots carrying `rhrValue` under Resilience simply stop being displayed (the tooltip ignores unlisted keys). Redeploy `compute-outer-readiness`, which bundles the shared module. The commit propagates to GitHub automatically.

## Verification

- Full Deno suite for `derive-pills.test.ts` green.
- `tsgo --noEmit` with zero TypeScript errors, full vitest suite green.
- Exact changed line numbers reported back after implementation.