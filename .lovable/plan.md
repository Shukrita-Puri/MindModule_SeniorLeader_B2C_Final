# Resilience Capacity — Make the HR-Elevation Fallback Actually Produce a Read

Isolated to the Resilience Capacity pill. No change to Decision Readiness, Physical Reserves, the brief, plan, MRS, or any edge-function logic outside the resilience fallback block.

## Verified current state

Confirmed in `supabase/functions/_shared/signal-pills/derive-pills.ts` (lines ~344-355) and against live data for shukrita@mindmodule.me.

The fallback code exists and is wired: `hrValue` and `hrDeviation` are computed in `compute-outer-readiness` (HR baseline from a 30-day window, `hrDeviation = (today - avg)/avg`) and passed into `derivePills`. Today's row has `heart_rate = 82`, `sleep_efficiency = null`, no check-in — exactly the state the fallback was designed for.

It does not fire because the fallback is written as an *elevation detector only*:

```text
if (no sleep efficiency && wearable fresh):
    hrDeviation > 10        -> amber
    else if hrDeviation == null && hrValue > 80 -> amber
    else                    -> push nothing
```

The user's 30-day average HR sits around the high 80s, so today's 82 bpm gives a negative deviation. Not elevated means nothing is pushed, `resTiers` stays empty, and the pill renders "RESERVE UNREAD" — the very state the fallback was meant to remove. The second branch is also unreachable whenever a baseline exists, since it requires `hrDeviation == null`.

So the proxy is "working" in the sense that it correctly detects no elevation; it just has no way to say "not elevated = fine".

## Change

One block in `derive-pills.ts` — the Resilience fallback becomes a full tier assignment rather than an amber-only push. Conditions to enter are unchanged (fresh wearable, `sleepEfficiency == null`, no wearable-derived resilience tier yet, HR present):

- `hrDeviation != null`: `> 20` red, `> 10` amber, otherwise green
- `hrDeviation == null` (no baseline yet): `hrValue > 90` red, `> 80` amber, otherwise green

`fallbackUsed = 'hr_elevated_proxy'` and the `hrValue` contributor are stamped whenever the fallback assigns a tier (not only when elevated), so the tooltip shows the basis for a green read too. Everything downstream — the freshness gate, `checkin_only` handling, `sourceTypes`, score-bearing rules, the `resilienceSources.push('wearable')` condition — is untouched, and the check-in / pattern overlays still stack on top exactly as today.

Nothing changes when sleep efficiency is present, when the wearable is stale, or for any other pill.

## Tests

In `derive-pills.test.ts`, extend the existing resilience-proxy cases:
- HR below baseline with no sleep efficiency → resilience is green, not neutral, `fallbackUsed = 'hr_elevated_proxy'`, `hrValue` in contributors
- `hrDeviation > 10` → amber; `> 20` → red
- no baseline: `hrValue` 75 → green, 85 → amber, 95 → red
- stale wearable → still no fallback, pill stays Unread
- sleep efficiency present → fallback does not fire

## Deploy

Redeploy `compute-outer-readiness` (bundles the shared module). No schema change, no frontend change — `hrValue` is already in the Resilience allow-lists in `PillTooltip.tsx` and `DecisionReadinessBrief.tsx`.

## Verification

Full Deno suite for `derive-pills.test.ts` green, `tsgo --noEmit` clean, and a live check that the Resilience pill for the affected account reads a tier instead of "RESERVE UNREAD".
