

# Plan: Layer HRV Data into Coach Intelligence

## The Gap

The coach already has **all the scaffolding** for HRV intelligence — the type (`hrvData`), the rendering code, the divergence detection function, and detailed system prompt instructions on how to use HRV. But **`buildServerContext` never queries `wearable_data`**. The `hrvData` field is always `undefined`. All the HRV logic is dead code.

Additionally, the `physiological_events` table already stores HRV correlated with specific calendar events (e.g., "board meeting" + HRV 34ms), but the coach never reads it — so it can't say "last time you had a board meeting your HRV spiked."

## What to Add

### 1. Fetch HRV data in `buildServerContext` (wire up existing dead code)

Add a 14th parallel query to the existing `Promise.all` block that fetches from `wearable_data`:
- **Today's HRV** (latest row for today or yesterday)
- **30-day baseline** (average HRV across last 30 days)
- **7-day trend** (daily HRV values to detect rising/falling)

Then populate `context.hrvData` with `currentHRV`, `baselineHRV`, `hrvDelta`, `hrvDeltaPct`, and `hrvTrend` (rising/falling/stable based on 7-day linear direction).

This immediately activates all the existing divergence detection, rendering, and system prompt logic.

### 2. Fetch upcoming calendar + historical HRV correlation from `physiological_events`

Add a 15th parallel query that:
- Gets today's upcoming calendar events (next 12 hours) from `calendar_events`
- Cross-references with `physiological_events` to find past HRV readings for similar event types
- Produces a structure like: `{ eventTitle: "Board Meeting", minutesUntil: 90, pastHRV: { avg: 38, count: 4, trend: "elevated" } }`

This enables the coach to proactively say: *"You have a board meeting in 90 minutes. Across your last 4 board meetings, your HRV averaged 38ms — that's sympathetic activation. Want to prepare for that?"*

### 3. Add to dynamic prompt builder

Extend the context rendering (the `buildDynamicPrompt` function) to include the new event-HRV correlation section:
```
## Upcoming Event HRV Pattern
- "Board Meeting" in 90 minutes
- Past HRV for similar events: avg 38ms across 4 occurrences (elevated stress)
- Consider proactively offering preparation support.
```

### 4. Enhance system prompt with proactive opener guidance

Add a small section to the system prompt (after the existing WEARABLE DATA section) instructing the coach to use HRV + calendar correlation data for **conversation openers** — not just mid-conversation references. Something like:

> When upcoming event HRV patterns are available, you may open with a proactive observation: "I noticed you have [event] coming up in [time]. In past sessions around similar events, your HRV has been [pattern]. Would it be helpful to [prepare/unpack/ground] before that?"

## Files to Change

1. **`supabase/functions/self-mastery-coach/index.ts`**
   - Add `wearable_data` query (today + 30-day baseline + 7-day trend) to `Promise.all` in `buildServerContext`
   - Add `fetchUpcomingEventHRV` helper that joins `calendar_events` + `physiological_events`
   - Populate `context.hrvData` from query results
   - Add new `upcomingEventHRV` field to `CoachContext` type
   - Extend `buildDynamicPrompt` to render the event-HRV correlation section
   - Add proactive opener guidance to system prompt

No other files need changing — all client-side and downstream plumbing already exists.

## Outcome

- The coach will reference actual HRV numbers in conversation (divergence detection, trends)
- The coach can proactively open conversations with HRV + calendar pattern observations
- All data comes from the DB (canonical source), no localStorage involved
- Users without wearable data are unaffected (all sections are conditional on data presence)

