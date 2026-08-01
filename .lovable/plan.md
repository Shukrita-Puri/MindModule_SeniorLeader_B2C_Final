## Goal
Remove the competing MRS score source from the Performance Readiness Brief card so it reads score/tier/state from one place: the brief snapshot overlay (`useCurrentBriefSnapshot`), falling back to the live `outerBrief` payload.

## All six references — confirmed handled

1. **Remove the import** — delete `import { useMrsSnapshot } from '@/hooks/useMrsSnapshot';` (line 24). Verified `useMrsSnapshot` has no other use in this file.
2. **Remove the hook call + window const** — delete `const { data: mrsSnapshot } = useMrsSnapshot();` (line 1873) and `const currentWindowLocal = currentPeriodLocal();` (line 1874).
   Note: the `currentPeriodLocal` *import* on line 30 must stay — it is still used at lines 2075, 2130, and 2306. Only the unused local `currentWindowLocal` const is removed.
3. **Remove the `shouldPreferMrsSnapshot` boolean** (lines 1875-1878).
4. **Simplify the five canonical fields in the snapshot-overlay IIFE** (lines 1997-2011) to snapshot-then-live, with no `mrsSnapshot` branch:
   - `const canonicalMrsScore = snap.innerReadinessScore ?? base.innerReadinessScore ?? null;`
   - `const canonicalMrsTier = snap.innerReadinessTier ?? base.innerReadinessTier ?? null;`
   - `const canonicalMrsState = snap.innerReadinessState ?? base.innerReadinessState ?? null;`
   - `const canonicalMrsBaseline = snap.innerReadinessScoreBaseline ?? base.innerReadinessScoreBaseline ?? null;`
   - `const canonicalMrsRefined = snap.innerReadinessScoreRefined ?? base.innerReadinessScoreRefined ?? null;`
5. **Remove the override block** at lines 2190-2202 (`if (shouldPreferMrsSnapshot && mrsSnapshot) { ... score = mrsSnapshot.score; tier = mrsSnapshot.tier ?? tier; }`) including its `console.info('[decision-readiness-brief] mrs_override', ...)`. Convert the now-immutable `let score` / `let tier` (lines 2183-2184) to `const`.
6. **Simplify `canonicalReadinessState`** (lines 2218-2221) to:
   `const canonicalReadinessState = (outerBrief as any)?.innerReadinessState;`
   This drops the last `shouldPreferMrsSnapshot` / `mrsSnapshot` reference that would otherwise be a TypeScript error.

`hasCurrentPeriodSignal` gating is preserved, so the score still renders `--` when the current period has no signal.

## Test update

`src/hooks/__tests__/snapshotContractGuards.test.ts` line 85 asserts the old dual-source contract:
- Remove `expect(BRIEF_SRC).toContain('shouldPreferMrsSnapshot && mrsSnapshot?.readinessState');`
- Add regression guards: `expect(BRIEF_SRC).not.toContain('shouldPreferMrsSnapshot');` and `expect(BRIEF_SRC).not.toContain('useMrsSnapshot');`
- Keep the existing `canonicalReadinessState` / `'refined'` / `'awaiting' || score == null` assertions — they remain valid.

## Verification (before marking complete)
- TypeScript build passes (`tsgo`) with zero errors — explicitly confirming no orphaned `mrsSnapshot` / `shouldPreferMrsSnapshot` references.
- `rg -n "shouldPreferMrsSnapshot|useMrsSnapshot" src/components/home/DecisionReadinessBrief.tsx` returns no matches.
- Vitest: `snapshotContractGuards.test.ts`, `briefFlickerGuard.test.ts`, `useOuterReadiness.test.ts`.

## Out of scope
- `useMrsSnapshot.ts` itself, `useCurrentBriefSnapshot.ts`, `MrsPage.tsx`, and all backend Edge Functions are untouched.
