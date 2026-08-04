# Audit — Signal Pill Baseline/Refine Rule and Fallback Wiring

## 1. Is the rule correct?

Your stated rule — **wearable forms the baseline, check-in refines it** — is exactly what the code does, with one deliberate exception.

- Wearable is the gate. `wearableFreshForGate` (same-day wearable row only) decides whether a pill is score-bearing. No fresh wearable → no baseline.
- Check-in refines, never creates. `contributedByCheckIn` is set only when wearable **and** check-in are both fresh. This mirrors MRS v3's two-state model (baseline, then refined ±15).
- Per-pill primaries stay wearable-first: Decision Readiness = HRV + sleep (+ clarity as refinement), Physical Reserves = RHR/HR only, Resilience = sleep efficiency (+ emotion/regulation/pressure as refinement).
- Exception (intentional, Fallback C): with no fresh wearable but a fresh check-in, the pill keeps its check-in tier as `freshness: 'checkin_only'`, `isScoreBearing: false` — a read, never a baseline, and never fed to MRS. Physical Reserves has no check-in source, so it correctly stays "Body Unread".

So: correct as stated, with the refinement that check-in alone can produce a *displayed* read but never a *scored* baseline.

## 2. Is the fallback change wired end to end?

Verified in the current tree:

- Backend derivation — `supabase/functions/_shared/signal-pills/derive-pills.ts`: `rhr_proxy` (fires only when HRV, sleep duration and sleep score are all null), `hr_elevated_proxy` (fires only when sleep efficiency is null), `checkin_only` freshness, `fallbackUsed` on the payload, `rhrValue` added to contributors only when a fallback fires, and `wearable` added to `sourceTypes`.
- Backend invariant mirror — `supabase/functions/_shared/signal-pills-v4.ts`: `checkin_only` carve-out in both `annotatePill` and `enforcePillInvariants`, so the defensive normaliser no longer re-forces neutral.
- Orchestrator — `compute-outer-readiness/index.ts` calls `derivePills` + `finalizePills` and persists the finalized array into `refined_signal_pills` / `baseline_signal_pills`; the added keys are additive JSON, so old snapshots still render. Function was redeployed.
- Frontend — `PillTooltip.tsx` types `checkin_only` and `fallbackUsed`, allows `rhrValue` for Decision Readiness and Resilience, and renders the basis note ("RHR proxy — no HRV or sleep today"). `DecisionReadinessBrief.tsx` includes `rhrValue` in `DISPLAYABLE_KEYS` for those two pills, and `showReadinessBadge` correctly suppresses the Baseline/Refined badge for non-score-bearing (check-in-only) pills.
- Tests — 8 new Deno tests in `derive-pills.test.ts` (51 pass), 310 vitests green, `tsgo` clean.
- Repo — working tree clean; the change is committed (`b809cc0a8`), so it is on GitHub as well as in Lovable. No DB migration needed or made.

## 3. One residual observation (no fix applied)

`sanitizeSignalPillsForCheckInFreshness` in `src/hooks/useCurrentBriefSnapshot.ts` strips check-in contributors and forces `contributedByCheckIn: false` whenever the client sees no current check-in. If a `checkin_only` pill is ever rendered from a snapshot while the client's check-in query has not resolved yet, the tooltip briefly loses its check-in evidence (the tier still renders). This is a transient display detail, not a scoring path — flagging it only so it is a known behaviour rather than a surprise.

## Recommendation

No changes required. If you want the residual in section 3 closed, the fix is to have the sanitizer skip pills whose `freshness === 'checkin_only'`, which is a one-line frontend guard plus a unit test.
