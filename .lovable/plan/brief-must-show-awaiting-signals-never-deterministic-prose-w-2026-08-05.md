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

**Existing baseline/refined rule is preserved, not redefined.** Brief formation stays exactly as built today:

- **Baseline brief** — formed from wearable (+ calendar context) signals, no check-in. In `compute-outer-readiness` (lines 9054–9060), `hasFreshWearable = wearableContext && hasTodayWearableData`, and `briefMode` is `refined` only when a check-in exists; otherwise it is `baseline` whenever a Stage-1 signal is present. So a window-fresh wearable row plus calendar with no check-in forms a baseline brief today — that positive control matches current logic and the plan does not change it.
- **Refined brief** — baseline plus the current-window check-in.

The only thing this change adds is an entry condition: at least one *current* personal signal (a wearable row fresh for this window, or a check-in for today + this window) must exist before either mode may form. Calendar alone must NEVER make the Brief form. Calendar keeps feeding its own signal pill, MRS, Plan and Nudges exactly as before — no change there.

Explicitly out of scope this run: MRS week-over-week, and any MRS scoring, gate, tier, eligibility, redistribution or frontend suppression change.

### 2. Retire the thin-signal deterministic copy

In `_shared/brief/deterministic-brief.ts`, remove the "Signal is thin this {window} - no wearable and no check-in yet." phrase/body path and the paired "Neither Mind nor body has a current read today…" read. With no current personal signal the builder returns `null` rather than prose, so the awaiting state is the only possible outcome.

### 3. Stale rows must not keep rendering

- Overwrite the existing `2026-08-05` deterministic rows for this user to the awaiting shape (null copy, `brief_source='awaiting'`) so the cache path cannot re-serve them.
- **Frontend cache path — explicit verification and fix.** Trace every restore route in `DecisionReadinessBrief`: `persistentBriefCache.read(cacheKeys.brief(...))`, the `cacheKeys.briefAwaiting(...)` flag, in-memory last-good/previous-brief state, and any React Query cached payload. When the server returns an awaiting payload for the same `localDate + timeWindow`, all of them must yield awaiting:
  - `persistentBriefCache.clear()` the `prb-cache-v2:` key for that user/period/date and write the awaiting flag key instead.
  - Reset the last-good/previous-brief state rather than falling back to it when the incoming payload has null copy.
  - Never treat "server returned no prose" as "keep showing what we had".
  This is verified by reload, not by inspection alone.

### 4. One awaiting copy, matching Plan and MRS

The Brief's awaiting state renders the existing shared string and nothing else:

```text
AWAITING SIGNALS
Connect your wearable and calendar to get an early read, then check in to sharpen it.
```

That is `READINESS_AWAITING_MESSAGE` (`src/constants/awaitingSignals.ts`). For the Brief card, use it verbatim instead of the reason-specific variants from `getReadinessAwaitingCopy` (today a calendar-connected user would get "Calendar signal received — sync wearable for a fuller read."). No new copy, no new UI — the existing awaiting presentation and `EngravedLoader` are reused.

## Verification before declaring done

- Live re-run of `compute-outer-readiness` for shukrita (evening, 5 Aug): response has `awaitingSignals: true`, null phrase/body, `brief_source='awaiting'`; DB row for 5 Aug evening rewritten to awaiting.
- Cache/reload test: with the awaiting response in place, hard-reload with the pre-existing deterministic entry seeded in `localStorage`; the Brief card must show only the awaiting line — no resurrected LLM or deterministic body.
- Positive controls, respecting the existing formation rule:
  - Same-day (window-fresh) wearable row, no check-in → **baseline** brief forms exactly as before.
  - That plus a current-window check-in → **refined** brief forms exactly as before.
  - Calendar events only, no wearable, no check-in → awaiting (this is the corrected case), while the calendar pill, MRS, Plan and Nudges are unchanged.
- New tests: gate matrix (wearable-only → baseline / wearable+check-in → refined / check-in-only / calendar-only → awaiting / neither → awaiting), deterministic builder returns null with no current personal signal, and a frontend test that an awaiting payload clears the cached brief for the same key.
- Existing Deno + Vitest + `tsgo` suites re-run.
- Completion report: commit SHA and the exact list of files changed, alongside the results above. Not declared complete until every item passes.