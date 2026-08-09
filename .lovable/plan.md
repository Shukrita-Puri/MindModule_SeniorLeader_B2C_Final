# Resilience Pill — Restore Check-in Influence and the Refined Badge

Isolated to Resilience Capacity. Decision Readiness and Physical Reserves logic is untouched.

## What the audit found (verified against live data for shukrita@mindmodule.me, 9 Aug)

The morning brief snapshot for that account stores the Resilience pill as:

```text
tier: red   sourceTypes: [wearable, checkin, pattern]   contributedByCheckIn: true
contributors: hrValue 75, emotionLevel 4, regulationLevel 5, pressureLevel 5,
              sleepEfficiency null, sustainedDeficitSeverity "red"
```

So the check-in *is* reaching the pill. Three separate defects make it look like it isn't.

### 1. Pressure is read upside-down

The check-in slider labels are `1 Overloaded -> 5 Spacious`, so a high number is a *good* state. `derive-pills.ts` reads it as if high meant high pressure:

- line 375: `pressureLevel >= 4 ? "amber" : "green"`
- line 262 (`regulationRiskPill`): `pressureLevel >= 4` treated as risk

The user's best possible pressure score (5 = Spacious) therefore pushes the pill toward amber and arms the regulation-risk floor. This is the direct cause of "the check-in has no positive effect".

### 2. One red contributor pins the whole pill red

Resilience takes the worst tier across all contributors (`stateMax`). `sustainedDeficitSeverity: "red"` alone forces red, so emotion 4 / regulation 5 / pressure 5 can never move the tier — there is no proportional weighting at all.

### 3. The "(Refined)" badge reads a field the backend nulls out

`DecisionReadinessBrief.tsx` line 819 derives the badge from `outerBrief.emotionLevel | regulationLevel | pressureLevel`. In `compute-outer-readiness` (line ~10895) those three are emitted as `awaitingSignals ? null : ...`, while `clarityLevel` on the line above has **no** such gate. That asymmetry is exactly why Decision Readiness says "(Refined)" and Resilience says "(Baseline)" on the same screen, even though the pill payload has `contributedByCheckIn: true`.

## Changes

### A. Fix the pressure polarity — `_shared/signal-pills/derive-pills.ts`

- line 375: `pressureLevel <= 2 ? "amber" : "green"` (Overloaded/Elevated is the risk state)
- line 262: `regulationRiskPill` uses `pressureLevel <= 2`

### B. Give the check-in proportional influence over the Resilience tier

Keep worst-of for the physiological inputs (sleep efficiency / HR fallback / sustained deficit), then apply the check-in as a graded overlay instead of one more equal vote:

- Compute a check-in composite from the dimensions present: emotion, regulation, and polarity-corrected pressure, averaged on their 1-5 scale.
- Composite >= 4.0 (a clearly strong self-report) softens a physiological RED by one step to amber, and an AMBER to green — one step only, never two, and never past green.
- Composite <= 2.0 hardens one step in the other direction (green -> amber, amber -> red).
- Between 2.0 and 4.0 the physiological tier stands.
- The overlay only applies when at least two check-in dimensions are present, and only when the wearable is fresh (unchanged gate). `contributedByCheckIn` and `sourceTypes` are unchanged.

The tooltip's "why this tier" line gains the composite so the softening or hardening is visible rather than mysterious.

### C. Make the badge follow the pill, not a separately gated field

- `DecisionReadinessBrief.tsx` line 819: derive `resRefined` from the server pill first — `serverPill.contributedByCheckIn === true` (or any of `emotionLevel`/`regulationLevel`/`pressureLevel` present in its contributors) → `refined` — and fall back to the existing top-level-field check only when no server pill exists.
- `compute-outer-readiness` line ~10895: drop the asymmetric `awaitingSignals ? null :` wrapper on `emotionLevel` / `pressureLevel` / `regulationLevel` so they match `clarityLevel` on the line above. Awaiting-state suppression already happens downstream in the pill freshness gate.

## Isolation guarantees

No change to MRS scoring, weights, the brief prompt or copy, the plan, nudges, insights, or the other two pills. No schema change. Pressure polarity is corrected only inside the Resilience pill derivation — MRS reads pressure through its own path and is not edited here.

## Tests

In `derive-pills.test.ts`:
- pressure 5 (Spacious) → green, does not arm the regulation-risk floor; pressure 1 → amber
- sustained deficit red + strong check-in (4/5/5) → amber, not red
- sustained deficit red + weak check-in (2/2/2) → stays red
- green physiology + weak check-in → amber
- fewer than two check-in dimensions → no overlay
- stale wearable → unchanged behaviour

Frontend: a case asserting the Resilience badge renders "(Refined)" when the server pill has `contributedByCheckIn: true` and the top-level check-in fields are null.

## Deploy

Redeploy `compute-outer-readiness` (bundles the shared module). Then re-verify the live pill for the affected account: expect `(Refined)` and a tier that reflects the strong check-in.