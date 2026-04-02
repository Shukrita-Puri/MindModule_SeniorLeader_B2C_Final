

# Remove the blanket 6–24h silent window — make it dismissal-specific only

## What's happening now

The `getActionWindow()` function (line 995–999) applies a **blanket rule** to every calendar event:

```text
0–6h   → touch2 (visible)
6–24h  → silent (ALL events hidden, regardless of dismissal)
24–48h → touch1 (visible)
>48h   → selection_only (hidden)
```

This is NOT tied to whether a specific event was cancelled. It suppresses every event in that 6–24h window — even events the user has never seen or dismissed. This is the primary reason "many upcoming events" still produces no JIT plan when most fall in the 6–24h range.

## What the fix does

Change the 6–24h window from `silent` (blocked) to a valid surfacing window. The only events that should be suppressed are ones the user explicitly dismissed — which is already handled separately by the `dismissed_horizons` check and the `skippedTypes3Plus` filter.

## Changes

### File: `supabase/functions/generate-mastery-plan/index.ts`

**1. Update `getActionWindow()` (lines 995–999)**

Replace the 4-tier window with a 3-tier model:
- `0–6h` → `touch2` (immediate body prep, unchanged)
- `6–48h` → `touch1` (tactical prep — expanded from 24–48h to include 6–24h)
- `>48h` → `selection_only` (scored but not surfaced, unchanged)

This means events 6–24h away now surface with the same `touch1` (coach + thinking prep) module composition as current 24–48h events. The silent window is eliminated entirely.

**2. Remove stale comments referencing the silent gap**

Update the inline comments at lines 994, 1127, 1297, 2100–2102 that reference "silent gap 6–24h" so future developers understand the new model.

**3. Both pipelines affected**

The `getActionWindow()` function is shared — both the bridge pipeline (`getPreScoredEvents`, line 1128–1131) and legacy pipeline (`scoreCalendarEventsLegacy`, line 1321–1322) filter on it. Changing the function fixes both paths simultaneously.

## What stays the same

- The `dismissed_horizons` per-touch check (line 1134–1141) — already handles per-event suppression
- The `skippedTypes3Plus` filter (line 2086) — already handles repeated event-type suppression
- The `JIT_THRESHOLD_UNIFIED = 55` score gate — still applies to all windows
- The `>48h` selection_only cutoff — still applies
- The snooze/dismiss escalation logic in `track-jit-skip` and `JitCarousel.tsx` — unchanged

## Net effect

A leader with events 8h, 14h, or 20h away will now see JIT preparation plans for those events (assuming they pass the score threshold and haven't been dismissed). Previously these were invisible by design.

