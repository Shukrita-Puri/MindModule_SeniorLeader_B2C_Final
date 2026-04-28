---
name: JIT Horizon Promotions
description: Two safety nets in generate-jit-events that rescue meetings from the 6-24h silent gap so the nearest meaningful event always surfaces
type: feature
---

The base two-touch model surfaces events only at 0-6h (touch_2) or 24-48h (touch_1), leaving a 6-24h silent gap and a >48h selection-only zone. Two promotions in `supabase/functions/generate-jit-events/index.ts` prevent the silent gap from hiding the most relevant next event:

1. **Morning Promotion (#2):** The user's first meeting of the next local calendar day is promoted from the silent gap to `touch_1` if its `minutesUntil` falls in 6-24h. Computed once per request from `events` (already sorted ascending) using `localDayKey(date, timezoneOffset)`. Logged as `[JIT:Stage5] PROMOTED ... reason=next_day_first_meeting`.

2. **Recency Fallback (#3):** After normal selection, if `selectedEvents.length === 0`, surface the soonest silent-gap event (6-24h only — never selection-only >48h). Sets `jitUrgencyHorizon='touch_1'`, `isSurfaceable=true`, `recencyFallback=true`. Logged as `[JIT:Stage5] FALLBACK surfaced soonest silent-gap event`.

**Why both:** #2 covers the canonical case (8am tomorrow visible at 5pm today). #3 is the safety net for any other silent-gap-only scenario (e.g. only event today is in 8 hours).

**Never surface >48h events as fallback** — the selection-only zone exists to avoid noise for genuinely distant events.
