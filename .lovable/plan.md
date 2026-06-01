
# Fix: Brief + Signal Pills not honoring MRS v3

## What's broken on screen

Screenshots from `/executive-home` show three regressions:

1. Score row reads `--  NOT YET ASSESSED` even though the user has a connected calendar and a submitted Mind check-in (Clarity 5/5 visible).
2. Pills display legacy taxonomy: `HIDDEN DRAG`, `NO READ`, `PULLING WEIGHT` — these strings are **pre-MRS v3** vocabulary (driven by `cogAuthorityFlag === 'masked-high'`, `checkInOutcome`, `confidence`, `sharpness`), none of which are MRS v3 inputs (`clarity / emotion / pressure / regulation`). The MRS v3 spec §8 + the `Signal Pill System v3` memory require the visible tier label to come from the server-built `signalPills`.
3. HRV value renders as raw float `15.6868476867…` instead of `16 ms`.

## Root causes

- **`DecisionReadinessBrief.tsx` → `ExecutivePillCapsule`** binds `pill.signalWord` from the **local legacy** `buildExecutivePills(outerBrief)` engine (`cognitiveWord / physWord / emoWord` at lines 948–995). The server-built `signalPills` payload (MRS v3) is wired only into the hover tooltip — never into the headline word.
- **`awaitingSignals`** is computed server-side as `!(hasFreshWearable || calendarResult.state === 'active')`. A connected calendar with zero events today reports `state !== 'active'`, and the Mind check-in alone never satisfies the gate, so the whole brief collapses to the cold-start view and `score = null`.
- **HRV** at line 1005 uses `\`HRV ${hrvVal}ms\`` with no rounding; `outerBrief.hrvValue` is a raw float from `wearable_data`.

## Fix plan (frontend + thin backend gate adjustment)

### 1. Pills read the MRS v3 server payload (frontend)
- `buildExecutivePills` keeps producing the expanded-box body lines (top/bottom signal lines + qualifiers), but the **`signalWord`** and **`state` (tier)** of each pill must be overridden by the matching server `signalPills[*]` entry when present.
  - Map server `tierLabel` → `signalWord`.
  - Map server `tier` (`green|amber|red|neutral`) → pill `state`.
  - Keep local words only as fallback when `signalPills` is `null` (true cold-start).
- Remove all `cogAuthorityFlag === 'masked-high'` branches from `cognitiveWord` (MRS v3 §5 marks `MASKED_HIGH` legacy/read-only, never written by v3).
- Drop legacy `confidence / sharpness / checkInOutcome` from the v3 word taxonomy paths so they cannot reappear once the server payload is the SSOT.

### 2. Refined / Baseline badge stays per-pill
Per MRS v3 §8: Cognitive refines on `clarity`, Resilience refines on `emotion/regulation/pressure`, Physiology never refines. The existing `cogRefined / resRefined` flags are correct — just surface them as a small `(Refined)` / `(Baseline)` suffix on each pill capsule, matching the global score-row badge already in place.

### 3. HRV rounding
At every HRV display site in `DecisionReadinessBrief.tsx` (`cogTop`, `emoTop`, plus the `chips` builder), render `Math.round(hrvVal)` ms. Same for `rhrVal`, `sleepDur` minutes (already minute-rounded), and the bracketed `vsBaselinePct` so qualifiers never show floats.

### 4. Brief renders off State 1 OR a Mind check-in
`compute-outer-readiness` (`hasState1Input`) should consider the user *not* in cold-start when **any** of the following is true:
- `hasFreshWearable`, OR
- `calendarResult.state === 'active'`, OR
- the calendar integration is **connected** (even with zero events today — `calendarResult.state in ('active','empty','connected')`), OR
- `hasTodayCheckIn === true` (Mind check-in alone is enough to produce a refined-only brief; baseline path falls back to a neutral 50 anchor that the check-in then refines ±15 per §3.3).

When the gate passes only on the check-in, set `readinessState = 'refined'` and compute `readiness_score_refined` from a neutral baseline of 50 (existing helper). The `signalPills` server builder already handles the "wearable-absent" path — confirm it returns Cognitive/Resilience tiers when only Mind dims are present.

### 5. Awaiting copy only on true cold-start
Keep the `Awaiting today's signal` block, but only when **all four** inputs above are missing. This matches the §4b comment that already exists in the file but doesn't match runtime behaviour.

## Files to edit

- `src/components/home/DecisionReadinessBrief.tsx`
  - `buildExecutivePills`: strip legacy `masked-high` / `confidence` / `sharpness` / `checkInOutcome` branches from word maps; add `Math.round` everywhere HRV/RHR are stringified.
  - `ExecutivePillRow` / `ExecutivePillCapsule`: accept and prefer `serverPill.tier` + `serverPill.tierLabel` for the headline; add per-pill `(Refined)/(Baseline)` badge.
- `supabase/functions/compute-outer-readiness/index.ts`
  - Extend `hasState1Input` (around line 4216) to include "calendar connected" + "today check-in".
  - In the refined-only branch, ensure `signalPills` and `pillQualifiers` are still populated (re-use existing builders with neutral baseline = 50).
- No DB / RLS changes.

## Out of scope

- No changes to the Insights "Performance Patterns" surface — that already runs off the shared `checkin-pattern-aggregator` and matches the spec.
- No copy changes to the bracketed qualifier strings — only their numeric formatting (rounding).
- No changes to the score-tier color tokens or the global score-row layout.

## Validation

1. Reproduce in browser at `/executive-home` with calendar connected + Mind check-in submitted; confirm:
   - Score row shows numeric value (not `--`).
   - Pills render MRS v3 vocab (`Clear Head / Buffer Thin / Holding Up` etc. from server payload).
   - HRV line reads `HRV 16 ms (-33% vs 24 ms baseline)`.
2. Disconnect calendar + delete today's check-in → cold-start `Awaiting today's signal` copy reappears.
3. Submit check-in only, no wearable, no calendar events → brief renders with `(Refined)` badge and Cognitive/Resilience pills tiered from the 4 Mind dims.
