

## Plan: Context-Rich Outer Readiness Brief — All Day Periods

### Problem

The brief's theme, context, leanOn, and watchFor are **generic during mornings and afternoons**. Calendar event names and wearable signals only enrich evening copy. The user sees "Light demands on a managing state. A genuine opportunity to invest rather than spend today" — with no mention of their actual meetings, sleep quality, or body state. The intelligence exists server-side but isn't surfaced.

### Root Cause (3 gaps)

1. **Today's high-stakes event titles are never passed to `getTheme()`** — `calendarResult.highStakesEvents` is computed but not forwarded. Only `tomorrowHighStakes` is used (evenings only).
2. **The tier × load × pressure matrix returns static strings** — 48 hardcoded entries that never reference event count, event names, or wearable state for morning/afternoon.
3. **`getLeanOnWatchFor()` only routes to context-rich insights for `lateEvening`** — during daytime it falls through to coach/archetype/tier fallbacks that have zero calendar or wearable awareness.

### Single file changed: `supabase/functions/compute-outer-readiness/index.ts`

---

### 1. Pass Today's High-Stakes Events into Theme

In `main()` (~line 1301), pass `calendarResult.highStakesEvents` as a new parameter `todayHighStakes` to `getTheme()`.

Update `getTheme()` signature to accept `todayHighStakes?: string[]`.

---

### 2. Enrich Tier × Load × Pressure Context Strings

For each of the ~48 tier/load/pressure matrix entries, append **dynamic context suffixes** based on available data:

**Calendar suffix** (when `todayHighStakes` has entries):
- Reference up to 2 event names: e.g. `"Your calendar includes [Board Review] and [1:1 with CEO]."`
- For high load without named events: reference event count: `"${eventCount} meetings today with tight gaps between them."`

**Wearable suffix** (when wearable data is present):
- Poor sleep: `"Your recovery overnight was incomplete (sleep score: ${score})."`
- HR elevated: `"Your heart rate ran high recently — your body is carrying more than your calendar shows."`
- HRV low: `"Your HRV is signalling accumulated strain."`
- Good state: `"Your body is well-recovered and ready for what's ahead."`

Implementation: Create a **`buildContextSuffix()`** helper that generates a 1–2 sentence suffix from `todayHighStakes`, `eventCount`, and `wearableContext`. Append this to each matrix entry's `context` string rather than rewriting all 48 entries individually.

---

### 3. Enrich `buildMorningTheme()` with Calendar

Expand signature to accept `todayHighStakes?: string[]`, `eventCount?: number`.

When today has high-stakes events + poor sleep/HRV strain:
- e.g. "Recovery overnight was incomplete (sleep score: 52), and you have [Board Meeting] this morning. Pace the opening — you'll need to deploy carefully."

When today has high-stakes events + good recovery:
- e.g. "Well-recovered and [Strategy Session] is ahead. Your readiness is genuine — protect it through the morning's first demands."

---

### 4. Add Afternoon Awareness

Create `buildAfternoonContext()` that appends:
- Remaining high-stakes events (if any haven't passed yet based on hour)
- Wearable strain accumulated through the day
- e.g. "Your heart rate has been elevated through a dense morning. The afternoon's demands — including [Client Presentation] — need a leader who paces, not pushes."

Call this from each afternoon branch in `getTheme()`.

---

### 5. Enrich Daytime Lean On / Watch For

In `getLeanOnWatchFor()`, add a new priority level between P0b (evening) and P1a (coach insights):

**P0c: Daytime calendar + wearable enrichment** (morning/afternoon only)

When today has high-stakes events OR wearable shows strain, append a contextual sentence to whichever leanOn/watchFor source wins (coach, archetype, or tier):

- LeanOn suffix: `"Your body carried a heavy morning — elevated heart rate through back-to-back demands."` or `"[Strategy Offsite] is ahead — your readiness for it is genuine."`
- WatchFor suffix: `"Spending your recovery advantage before [Board Meeting] this afternoon."` or `"Pushing through the volume when your HR is already signalling strain."`

This is additive — it enriches the existing source rather than replacing it.

---

### 6. Wire Today's Event Count into Context

Pass `calendarResult.eventCount` through to `getTheme()` and `buildContextSuffix()` so density references are concrete: "5 meetings today" rather than "high load."

---

### 7. Tone Rules (preserved)

- Morning: directive, forward-looking, reference what's ahead
- Afternoon: acknowledges what's happened + orients remaining energy
- Evening: permission to stop, restoration-first (unchanged)
- All periods: banned words remain (wellness, mindfulness, relax, well done)
- Wearable language: clinical-precise, not alarming ("your HRV is signalling" not "your HRV is dangerously low")

---

### Summary of What Changes

| Area | Current | After |
|------|---------|-------|
| Today's event names | Computed but unused | Referenced in theme context for all periods |
| Morning themes | Sleep-only or generic | Sleep + today's calendar events by name |
| Afternoon themes | Same as morning (no afternoon awareness) | References remaining events + accumulated body strain |
| Tier×load×pressure context | 48 static strings | Dynamic suffix with event names, count, wearable state |
| Daytime leanOn/watchFor | Coach/archetype/tier only | Enriched with calendar + wearable context |
| Event count | Not surfaced | "5 meetings today with tight gaps" |

