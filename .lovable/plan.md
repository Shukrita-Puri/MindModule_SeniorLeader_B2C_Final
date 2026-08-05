# Brief must show "Awaiting signals" — never deterministic prose — when there is no current personal signal

## What the audit found (verified live, shukrita@mindmodule.me, Wed 5 Aug)

- Latest wearable row: `2026-08-04`. Latest non-skipped check-in: `2026-08-01`. Calendar events today: `3`.
- Latest stored brief row: `local_date 2026-08-05`, `time_window evening`, `brief_source deterministic`, phrase "Holding steady", body "Signal is thin this evening - no wearable and no check-in yet…" — exactly the text in the screenshot.

Why the earlier fix did not produce the intended result: the freshness work stopped the brief from *inventing* HRV/check-in claims (correct), but it did not stop the brief from rendering at all. In `compute-outer-readiness`:

- `awaitingSignals = !(hasFreshWearable || hasCalendarSignal)`. Calendar alone satisfies the contract, so with 3 events today `awaitingSignals` is false.
- `briefMustAwait` is additionally suppressed whenever a deterministic brief exists or a canonical MRS score exists.

Result: no wearable, no check-in, all three pills `unread` — and the brief still ships deterministic "thin signal" prose.

## The change

### 1. Personal-signal gate for the Brief only (server)

In `compute-outer-readiness/index.ts`, add a single derived flag off the existing freshness resolver:

```text
briefHasCurrentPersonalSignal = wearableCurrentForWindow || checkInCurrentForWindow
```

When it is false:
- The Brief is `awaiting`: `brief_source = 'awaiting'`, `phrase`, `body_text`, `lean_on`, `watch_for` all null in the response.
- No deterministic brief is built or adopted, no LLM brief is adopted, and a cached `llm`/`deterministic` snapshot for the same window is not re-served.
- Calendar presence alone never satisfies this gate (calendar keeps its own pill and keeps feeding MRS/Plan unchanged).

This gate is scoped strictly to the Brief. MRS scoring, gating, tiers, pills, Plan and Nudges are untouched — the MRS score continues to display exactly as today.

### 2. Retire the thin-signal deterministic copy

In `_shared/brief/deterministic-brief.ts`, remove the "Signal is thin this {window} - no wearable and no check-in yet." phrase/body path and the paired "Neither Mind nor body has a current read today…" read. With no current personal signal the builder returns `null` rather than prose, so the awaiting state is the only possible outcome.

### 3. Stale rows must not keep rendering

- Overwrite the existing `2026-08-05` deterministic rows for this user to the awaiting shape (null copy, `brief_source='awaiting'`) so the cache path cannot re-serve them.
- Confirm the client-side `persistentBriefCache` / last-good retention in `DecisionReadinessBrief` does not resurrect a previously cached deterministic body once the server returns awaiting for the same `localDate + timeWindow`; clear last-good on an awaiting payload for the same key.

### 4. One awaiting copy, matching Plan and MRS

The Brief's awaiting state renders the existing shared string and nothing else:

```text
AWAITING SIGNALS
Connect your wearable and calendar to get an early read, then check in to sharpen it.
```

That is `READINESS_AWAITING_MESSAGE` (`src/constants/awaitingSignals.ts`). For the Brief card, use it verbatim instead of the reason-specific variants from `getReadinessAwaitingCopy` (today a calendar-connected user would get "Calendar signal received — sync wearable for a fuller read."). No new copy, no new UI — the existing awaiting presentation and `EngravedLoader` are reused.

## Verification before declaring done

- Live re-run of `compute-outer-readiness` for shukrita (evening, 5 Aug): response has `awaitingSignals: true`, null phrase/body, `brief_source='awaiting'`; DB row for 5 Aug evening rewritten to awaiting.
- Reload the app: Brief card shows only the awaiting line above; pills stay Mind/Body/Reserve unread; MRS still renders its score.
- Positive control: with a current-window check-in or a same-day wearable row, the Brief renders prose as before.
- New tests: gate matrix (wearable-only / check-in-only / calendar-only / neither), deterministic builder returns null with no current personal signal.
- Existing Deno + Vitest + `tsgo` suites re-run.