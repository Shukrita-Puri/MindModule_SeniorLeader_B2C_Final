# Why a travel pattern reminder was sent on a non-travel day

## What actually happened (verified on the live account)

The 09:30 reminder on 22 Sep was `pattern_alert` (`FB-PATTERN::B`), body:
"Travel → resting HR +27% — an early observation in your data, not a conclusion yet."

The stored finding behind it (`causality_findings`, 21 Sep, `cause_effect_v2`):

```text
event_to_rhr: [{ event_type: "Travel", rhrDeltaPct: 27.3, n: 2, lastSeen: "2026-08-17", confidence: "emerging" }]
```

So the claim is built from **two travel days, both five weeks old**, and it was sent
on a day with no travel at all. The same finding also fired on 16 Sep (+26%) and
23 Aug (+23%) — it keeps resurfacing.

Four separate gaps let it through:

1. **Two samples is enough for RHR.** `cause-effect-engine/index.ts:955` lowers the
   minimum from 3 to 2 for `resting_heart_rate` only, so this became "emerging".
2. **No sample floor on the consumer side.** In `smart-nudges/index.ts`,
   the in-context branch requires `n >= 3`, but `extractTopPattern`
   (the `causality_findings` branch) accepts any finding stamped strong/emerging —
   no `n`, no `lastSeen`.
3. **No recency gate.** The query only requires the finding row to be computed this
   month; the underlying evidence (`lastSeen`) is never checked. 17 Aug passed.
4. **No relevance gate.** Nothing asks whether today is a travel day, and the copy
   is present tense, so a historical association reads as a statement about today.

## The fix

### 1. Sample + recency floor on pattern reminders
In `smart-nudges/index.ts`, `extractTopPattern` also returns `event_type` and
`lastSeen`, and candidates are dropped unless `n >= 3` and `lastSeen` is within
21 days. Ranking gains recency and magnitude tiebreaks so a stale row can no
longer outrank a fresh one. Result: this Travel row stops qualifying.

### 2. Context-dependent patterns only fire in context
Travel is only meaningful while travelling. A small allow-list of
context-bound event types (Travel first) requires today's context to match,
read from the existing travel SSOT (`_shared/travel/travel-day.ts`
`isTravelDayFromDistance`, plus a resolved travel event on today's calendar).
If it doesn't match, that candidate is skipped and the next eligible pattern is
used — no new reminder type, no new copy branch.

### 3. Historical framing
When a pattern is cited outside its context, the sentence states it as history,
matching the wording already used in the plan's why-lines:
"Across your past travel days your resting heart rate ran ~27% higher."
Present-tense phrasing is reserved for the day the context is actually live.
Stays inside the existing copy gate (word/char limits, forbidden words, CTA verb).

### 4. Engine floor (recommended, one line)
Remove the `resting_heart_rate` exemption at `cause-effect-engine/index.ts:955`
so RHR needs the same 3 occurrences as every other signal. This stops n=2
findings being written at all, rather than only filtering them at send time.
Insights reads the same store, so this also removes the two-day travel claim
from the causality screen.

## Safety and co-dependencies

- Isolated to the four points above. No schema change, no frontend change.
- `smart-nudges` — only the pattern-alert branch changes. Windows, quiet hours,
  daily cap, 2h spacing, silent-sync exclusion, week-ahead, light-day, JIT and all
  other reminder rules untouched.
- `cause-effect-engine` — only the RHR minimum-occurrence constant. All other
  lenses, deltas and confidence rules unchanged. Read by Insights and the plan's
  why-lines: the effect there is that a 2-sample RHR claim disappears; no
  existing 3+ sample finding changes.
- `_shared/travel/travel-day.ts` is read only, not modified, so Brief, Plan and
  week-ahead travel behaviour is unaffected.
- Every new read is failure-tolerant: if travel state or `lastSeen` is missing,
  the candidate is skipped rather than erroring, so a missing value can only make
  the reminder quieter, never wrong.

## Verification

- Deno unit tests for the new gate: n=2 rejected, 36-day-old `lastSeen` rejected,
  Travel rejected on a non-travel day and accepted on a travel day, historical
  phrasing passes the copy gate.
- Forced dry-run of `smart-nudges` for this account, confirming the Travel
  pattern no longer qualifies and the suppression reason is logged.
- Full backend suite; deploy `smart-nudges` and `cause-effect-engine` separately,
  verifying each on the live account before the next.
