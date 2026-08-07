# Resilience Capacity — final hierarchy

Target hierarchy, exactly as you set it:

```text
1. Primary        sleep efficiency
2. Fallback       HR proxy (only when no sleep efficiency, wearable fresh)
3. Persistent     sustained deficit  (graded; absence never blocks the pill)
4. Overlays       emotion / regulation / pressure  (check-in)
```

Removed: Protected Goals, HRV x High-Demand.

Scope: `_shared/signal-pills/derive-pills.ts` plus one additive change in `_shared/signal-engine/pattern-engine.ts`, and the Resilience rows in `PillTooltip.tsx`. Nothing else — no other pill, no MRS/brief/plan/nudge logic, no edge-function behaviour change, no DB change.

## Verified current state

Resilience today pushes tiers from sleep efficiency, the HR fallback, the three check-in overlays, plus:

```text
sustainedDeficitFlag                   -> red
cooccurrence_count >= 3 -> red ; == 2  -> amber
protectionGoals.length > 0 AND (calendar high OR high-stakes) -> amber
```

`detectSustainedDeficit` in `pattern-engine.ts`: HRV at or below -20% of the **30-day** baseline for **2 consecutive samples**, walking back from the most recent, skipping days with no HRV.

Constraint confirmed by search: `sustained_deficit_flag` is **not** private to this pill. `compute-inner-readiness`, `generate-mastery-plan`, `smart-nudges` and `compute-outer-readiness` all read it, and `compute-outer-readiness` applies a -5 MRS penalty on it. Changing its value changes MRS and nudges.

## 1. Remove Protected Goals

- Delete the `protectionGoals.length > 0 && (calendarPressure === 'high' || hasStakesEarly)` amber push.
- Drop `protectionGoalsCount` from the pill's `contributors` and remove the tooltip row.
- `protectionGoals` stays in the function signature and stays available everywhere else; only Resilience stops reading it.

## 2. Remove HRV x High-Demand

- Delete both co-occurrence tier pushes from Resilience.
- Drop `hrvHighDemandCooccurrence7d` from `contributors` and remove the tooltip row.
- `computeHrvLoadCooccurrence` itself stays in `pattern-engine.ts`, unchanged and still exported, so any other consumer is untouched. Resilience simply no longer calls it.
- Consequence to note: the `resilienceSources.push('pattern')` condition currently ORs sustained deficit with the co-occurrence count. It becomes sustained-deficit-only, which is correct once co-occurrence is gone.

## 3. Sustained Deficit — same signal, graded and shorter-window

One signal, one name, one place in the pill — only its sensitivity changes:

```text
last 3 HRV samples within the trailing 5 calendar days
fewer than 2 samples          -> unknown, push nothing
avgDev vs the 14-day baseline:
  <= -15%  -> red
  <=  -7%  -> amber
  else     -> green
```

Averages instead of streaks, a 14-day baseline instead of 30, gap-tolerant within 5 days, and graded so amber exists. For shukrita, 6 Aug (-30%) and 4 Aug (-7%) average near -18% and read red, where today's rule reads "No".

**How this stays safe.** `detectSustainedDeficit` keeps its current 30-day / -20% / 2-consecutive rule and keeps returning the same boolean, so MRS, inner-readiness, plan, nudges and the Physical Reserves red push are all byte-identical. The graded severity is returned *alongside* it from the same detector — one function, one signal, an extra field — and only Resilience reads that field. There is no second algorithm competing for the same slot in the pill; the pill's Sustained Deficit line just reports a tier instead of yes/no.

**No data never blocks the pill.** When fewer than 2 samples exist the read is `unknown` and nothing is pushed, so sleep efficiency (or the HR fallback) and the check-in overlays still form the tier exactly as they do now. Absence is silent, never neutralising.

## Why the pill's calculation cannot break

Composition is unchanged: worst-tier-wins across whatever pushed, `neutral` only when nothing pushed. We are removing two pushes that on this data never fired, and converting one binary push into a graded one.

- Tiers can only stay the same or improve for the two removals; no new way to produce a worse tier.
- The graded deficit can now push amber or green where it previously pushed nothing — green never worsens a tier under worst-wins, and amber only fires at genuine strain.
- Freshness gate, `checkin_only` handling, score-bearing rules, cold-start label and the `regulationRiskPill` green-to-amber override are untouched.
- The pill remains non-score-bearing under exactly the same conditions, so no score anywhere moves.

## Tests

In `derive-pills.test.ts`:

- Protected goals present with high calendar pressure -> no amber from that path; `protectionGoalsCount` absent from contributors.
- Co-occurrence count 3 -> no red from that path; `hrvHighDemandCooccurrence7d` absent from contributors.
- Graded deficit: avg -18% -> red, -9% -> amber, -3% -> green, one sample -> no push and the pill still tiers from sleep efficiency alone.
- Same inputs leave `sustainedDeficitFlag` and the Physical Reserves tier identical to today.
- All existing resilience cases (including the FB-06 HR-proxy set) still pass.

## Deploy

Redeploy `compute-outer-readiness` only, because it bundles the two shared modules. Then confirm on the affected account that Resilience shows a graded read and the two removed rows are gone from the tooltip.

## Explicitly unchanged

- **Check-in refinement**: emotion, regulation and pressure keep their exact current role in the pill, and the baseline-then-refined behaviour is untouched.
- **Sustained Deficit's contribution to MRS**: the boolean flag keeps its current definition and value, so the -5 MRS penalty, inner-readiness, plan and nudges behave identically. Only the pill's own read of that signal becomes graded.
- **Non-blocking**: exactly as today, Sustained Deficit reading no / 0 / unknown blocks nothing — not the Resilience pill, not any downstream surface.