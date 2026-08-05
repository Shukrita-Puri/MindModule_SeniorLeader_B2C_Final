# Current-Signal Integrity: Brief must obey the same freshness contract as the signal pills

## What is confirmed today (verified against code + live data)

For `shukrita@mindmodule.me` (Wed 5 Aug, afternoon):

- Latest wearable row is `summary_date = 2026-08-04` (HRV 19.9, RHR 66, HR 81). There is **no** row for 2026-08-05.
- Latest check-in is `checkin_date = 2026-08-01` (clarity 5, outcome `focused`). There is **no** check-in on 2026-08-05.
- The stored brief snapshot for 2026-08-05 / afternoon (`brief_source = llm`) still says "Your HRV is down 24% ... though you're feeling focused", and its `checkin_snapshot` holds `clarityLevel: 5, checkInOutcome: focused` while `wearable_snapshot.sourceRowDate = 2026-08-04`.

Root cause in code:

- `compute-outer-readiness/index.ts` derives two different freshness notions from the same wearable row:
  - `wearableFreshForGate = hasTodayWearableData` (row age must be 0 days) — this is what the **signal pills** use, so they correctly render "Body Unread".
  - `hasWearable = hasWearableData` (row of **any** age) — this is what the **brief** uses for both deterministic evidence and the LLM prompt facts. Yesterday's HRV therefore becomes today's afternoon physiological claim.
- Check-in values (`clarityLevel`, `checkInOutcome`) arrive from the **caller body**. The server never validates them against an actual `daily_checkins` row for (user, local_date, current window), so a caller carrying stale values makes them today's truth. The exact caller that supplied clarity 5 for 5 Aug is not yet identified — step 1 below identifies it, but the server-side validation fixes it regardless of source.

Not changing: MRS v4 scoring, gates, tiers, redistribution, zero-vs-null semantics, the deterministic-brief-during-LLM-outage behaviour, or the existing UI architecture.

## The change

### 1. One canonical window freshness contract (server)

Add `_shared/signal-engine/signal-freshness.ts` exporting a single resolver used by pills **and** brief:

```text
resolveSignalFreshness({ window, wearableSourceAgeDays, hasWearableData,
                         checkinRowForWindow, localDate })
 -> { wearableCurrent, wearableHistoricalAllowed, checkInCurrent,
      hrvUsableAsCurrent, sleepUsableAsCurrent, rhrUsableAsCurrent,
      clarityUsableAsCurrent }
```

Window rules (preserving the existing Morning design):

- Morning: `wearableCurrent` is true for age 0 **or** the overnight/prior-day row Morning already relies on (age <= 1). Morning semantics are untouched.
- Afternoon / Evening: `wearableCurrent` requires age 0. A stale row remains available for baselines and trends only.
- Check-in: `checkInCurrent` is true only when a `daily_checkins` row exists for today's `checkin_date` **and** the current `time_window`.

`wearableFreshForGate` and `checkInFreshForGate` become thin reads off this resolver so the pills keep behaving exactly as today.

### 2. Brief consumes the same contract

In `compute-outer-readiness`:

- Introduce `briefWearableUsable` (from the resolver) and use it — not `hasWearable` — everywhere brief prose or facts are built: `wearableFact`, the `hasWearable` argument passed to `buildDeterministicBriefFallback`, the LLM user-prompt physiological facts, and the pill tiers handed to the brief.
- Server-side check-in validation: before use, verify the supplied `clarityLevel` / `checkInOutcome` against the fetched window check-in row. If no row exists, force them to `null` and log `[brief][stale-checkin-dropped]`. Historical clarity may still feed explicitly labelled streak qualifiers, never a current claim.
- Extend the existing `=== DATA AVAILABILITY CONTRACT ===` prompt block with explicit "no current wearable for this window" / "no check-in for this window" lines so the LLM cannot invent HRV or "feeling focused".
- Existing brief validators reject any output containing an HRV/sleep/RHR number or a felt-state clause when the corresponding signal is not current; a rejection falls back to the deterministic brief (outage behaviour unchanged).

### 3. Deterministic brief must not read `unread` as a tier

In `_shared/brief/deterministic-brief.ts`:

- Add `hasCurrentWearable` / `hasCurrentCheckIn` to the options and gate the wearable-fact branches on them (today the branch keys off `hasWearable` alone).
- `buildRead`: when both cognitive and physical tiers are `unread`, do not emit "evenly matched" or band-based comparative copy — emit a thin-signal read. When exactly one is `unread`, skip any two-pillar comparison.
- Remove the implicit `readMap[opts.band] ?? readMap.steady` fallback for unread pillars.

### 4. Snapshot provenance

Persist on `brief_snapshots` (reusing `payload_json` where possible, otherwise a small provenance object): `wearableCurrentForWindow`, `checkInCurrentForWindow`, `wearableSourceAgeDays`, and the list of signals treated as current. This makes future drift diagnosable without re-deriving.

### 5. Frontend verification only (no new UI)

Audit `useMrsSnapshot`, `useCurrentBriefSnapshot`, `DecisionReadinessBrief` and `PillTooltip` for any mapping that converts unavailable to available, historical to current, or 0 to null. Fix only mappings found to misrepresent server state; do not mask a backend value in the UI. Existing awaiting/processing presentation is reused for the no-current-data states.

## Verification before declaring done

- Scenarios A–G from the request, run against `compute-outer-readiness` via live invocation (synthetic inputs where real data is absent), reporting actual `phrase`, `body`, pill tiers and freshness for each.
- Live re-run for `shukrita@mindmodule.me` (afternoon, 5 Aug) proving: no HRV claim, no "feeling focused", Clarity unread, Body Unread, and the brief still renders via the deterministic path.
- New Deno tests: freshness resolver window matrix, deterministic-brief unread-pillar cases, stale-check-in drop.
- Existing Deno + Vitest + `tsgo` suites re-run.
- Report: commit SHA, files changed, per-signal freshness contract table, and the Morning / Afternoon / Evening proofs.