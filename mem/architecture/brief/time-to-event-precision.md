---
name: brief-time-to-event-precision
description: All deterministic Brief copy expresses time-to-event through _shared/brief/time-phrase.ts buckets; never hardcode "within 24 hours", "soon", or "today".
type: architecture
---

# Time-to-event precision (Brief)

- SSOT: `supabase/functions/_shared/brief/time-phrase.ts` — `timeUntilPhrase()` and `withTiming()`.
- Buckets: `starting now` (≤5m) · `in under 15 minutes` · `in N minutes` (5-min rounding, <60m) ·
  `in about an hour` (<90m) · `in about N hours` (<5h) · `later today` (<12h) · `tomorrow` (≤24h) · null beyond.
- `null` means the copy omits the timing clause entirely — never invent timing.
- `BriefCopyContext.anchorEvent.minutesUntil` carries timing into the CEO copy pack
  (`_shared/personas/ceo/behaviour-copy.ts`, helpers `anchorTimed` / `anchorWhen`).
- `DeterministicBriefFallbackOpts.highStakesTiming` carries it into
  `_shared/brief/deterministic-brief.ts` (helper `shortRefTimed`).
- Source of the minutes: `nextHighStakesEvent` in `compute-outer-readiness`, already
  gated by the event subtype's JIT lead-time window.
- The thin-signal deterministic line ("Signal is thin this {window}…") is retired;
  no current personal signal → `buildDeterministicBriefFallback` returns null → awaiting.
