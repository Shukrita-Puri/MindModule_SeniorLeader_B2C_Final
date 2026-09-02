# iOS clock/resume fix for Executive Home awaiting parity

Presentation and data-freshness wiring only. No scoring, brief copy, plan selection, edge function or database changes.

## What the audit found

Web and iOS run the same gating code (`isMrsVisible`, shared awaiting copy). The divergence is not in the gate — it is in **when the iOS shell re-evaluates it**. Web reloads on every visit; the iOS WKWebView is mounted once and stays alive for days.

1. **No window/day rollover.** Date and window are computed during render (`localISODate()`, `currentPeriod()`) and feed the query keys for MRS snapshot, brief and plan. Nothing re-renders when the clock crosses 12:00 / 18:00 / 00:00, so the app keeps serving an earlier window's keys, score and brief.
2. **Resume does not refresh the cards that matter.** `mrs-snapshot`, the brief snapshot and the mastery-plan snapshot are never invalidated on foreground.
3. **Sticky last-good state survives forever.** `lastGoodBriefRef`, the in-memory `lastGoodMrsSnapshots` map and the localStorage brief/plan caches assume a page lifecycle the native shell never has.

## The fix

### 1. `useHomeClock` — shared, mid-lifecycle safe

A single source emitting `{ dateISO, window }` for the user's local clock. Every home card reads date/window from it instead of calling `localISODate()` / `currentPeriod()` at render time.

- Initial state is computed from `new Date()` on first mount, not from a launch-time constant — a JS update delivered into a shell alive for days is correct immediately, with no restart.
- Initialisation is gated behind `typeof window !== 'undefined'`; SSR/non-browser renders get a safe computed value and no timers.

### 2. Boundary tick via scheduled `setTimeout`

Schedule one `setTimeout` for the exact millis until the next boundary (12:00, 18:00, 00:00 local, reusing the existing `msUntilWindowEnd` shape), fire the transition, then reschedule from the new "now". Never `setInterval`. The resume handler is an additional safety net, not a replacement for this tick.

### 3. Resume via `visibilitychange`

`document.addEventListener('visibilitychange')`, acting only when `document.visibilityState === 'visible'`, debounced at 800ms. This is the only event WKWebView fires reliably on foreground — no `pageshow`, no `focus`, no native bridge.

### 4. Missed-tick recovery

iOS suspends timers while backgrounded, so the boundary tick usually does not fire when the user was not on screen. On every visible resume the handler compares the current computed `{ dateISO, window }` against the stored clock state. If they differ, it forces the boundary transition immediately rather than waiting for the next scheduled tick, and reschedules the timer.

### 5. Atomic transition

The boundary transition is one synchronous operation: flush the in-memory last-good caches (`lastGoodMrsSnapshots` via the existing reset export, the brief's last-good ref), evict the leaving window's localStorage keys, cancel/invalidate the executive-home queries, and set the new clock state — all inside a single React state update path. There must be no render frame in which components see the new window while still reading an already-cleared old-window cache, and none in which they see the old window after the flush.

### 6. localStorage eviction scope

Evict only keys for the window just left, addressed by `{date}:{window}` through the existing `cacheKeys` builders (brief, briefAwaiting, plan data/loaded/force-refresh). Current-window entries and other cached windows are left untouched.

### 7. In-flight queries

Rollover cancels in-flight fetches for the leaving window immediately; it does not wait for them to settle. Their results are discarded and the cards fall through to the new window's awaiting state.

### 8. Offline behaviour on rollover

Once caches are flushed, a failed refetch (no connection) must resolve to the clean awaiting/offline state, exactly like a cold load with no data. No infinite spinner, no indefinite "Writing your read". The anti-flicker devices prevent flicker; they must never block the UI once their cache is legitimately gone. Each of the three cards gets an explicit terminal error/empty path for this case.

## Technical notes

- New `src/hooks/useHomeClock.ts` (hook + provider or module-level store with subscription) owning state, the scheduled timeout, the visibilitychange listener and the atomic transition routine.
- Consumers switched off render-time clock calls: `useMrsSnapshot`, the brief snapshot hook, the mastery-plan snapshot hook, `DecisionReadinessBrief`, `TodayThreePriorities`, MRS card.
- Transition invalidates/cancels `mrs-snapshot`, `outer-readiness`, brief snapshot and mastery-plan snapshot query keys; clears `__resetLastGoodMrsSnapshots()` and the brief last-good ref; evicts leaving-window localStorage keys.
- Eyebrow labels in `src/components/home/timeLabel.ts` also read from the clock so the header cannot disagree with the cards.

## Verification (all four required)

1. **Update into live shell** — simulate a JS update into a webview alive 24h+: first mount shows the correct date and window with no restart.
2. **Missed-tick background** — background before a boundary, resume after: the visibilitychange handler catches the missed rollover and all three cards flip together to the new window's awaiting state.
3. **Offline rollover** — cross a boundary with no network after the flush: UI reaches a clean awaiting/offline state, never a hanging spinner.
4. **Atomic transition** — no render frame reads the cleared old-window cache before the new-window state is set.

Plus: web behaviour unchanged, and existing awaiting-parity / MRS-gate tests still pass, with new tests for the clock transition, missed-tick recovery and eviction scope.

## Out of scope

No scoring, brief copy, plan selection, edge function or database changes.
