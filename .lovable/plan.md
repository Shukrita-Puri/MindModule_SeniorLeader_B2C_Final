

# Plan: Calendar-Aware Practice Selection in Mastery Plan

## Current State (Confirmed)
- `generate-mastery-plan` fetches calendar events and computes `calendarLoad` (low/medium/high) from next-4-hour meetings
- Practice selection is driven entirely by **Outer Readiness theme phrase → ThemeModuleMapping → selectContent()** — NO calendar density awareness
- `getDurationCeiling()` limits module count/duration by load, but doesn't change practice TYPE or FOCUS
- Morning with 8 meetings gets the same "focus activation" as morning with 0 meetings
- Evening with light day gets same "deep wind-down" as extreme day

## Approach: Calendar-Context Module Overrides
Rather than replacing the existing theme-driven architecture, we ADD a calendar-context layer that **adjusts module specs** after theme mapping but before content selection. This is minimally invasive.

## Changes (1 file)

### `supabase/functions/generate-mastery-plan/index.ts`

**1. Add `CalendarContext` interface + `calculateCalendarContext()` function (~60 lines)**
- Classifies today's full-day load and upcoming load into `light | moderate | heavy | extreme`
- Thresholds: extreme (8+ meetings OR 6+ hrs), heavy (6+/4+), moderate (3+/2+), light (<3/<2)
- Counts today's events vs upcoming (rest-of-day) events based on `timeOfDay`

**2. Add `applyCalendarOverrides()` function (~80 lines)**
- Takes the theme-derived `ThemeModuleMapping` + `CalendarContext` + `timeOfDay` + `tier`
- Returns modified `ThemeModuleMapping` with adjusted intensity/focus/priority:

```text
MORNING + heavy/extreme:
  - regulate: force required=true, focus='grounding', intensity='gentle', priority=9
  - align: focus='composure' (not 'confidence' or 'focus' — grounding over activation)

MORNING + light:
  - align: focus='focus', intensity='activating' (maximize deep work)
  - Add prepare if not present (strategic thinking)

AFTERNOON + heavy + depleted/managing:
  - regulate: force required=true, focus='restore', intensity='gentle'
  - Remove align if activating (prevent further depletion)

EVENING + extreme/heavy:
  - regulate: force focus='release', intensity='gentle', duration='standard'
  - align: force focus='release' (not 'focus')

EVENING + light:
  - regulate: reduce priority (brief wind-down sufficient)
  - align: focus='focus' or 'grounding' (strategic reflection OK)
```

**3. Add `generateCalendarMessage()` function (~30 lines)**
- Produces a short calendar-context string added to the plan label
- Morning: "Heavy Day Ahead (7 meetings, 5.5 hrs)" / "Open Day (2 meetings)"
- Evening: "Deep Recovery (9 meetings today)" / "Light Close (2 meetings today)"
- Stored in a new optional `calendarMessage` field on `timeOfDayPlan`

**4. Wire into main `generateMasteryPlan()` (~15 lines changed)**
- After line ~973 (where `calendarLoad`/`calendarPressure` are computed): call `calculateCalendarContext()` using `rawCalendarEvents` + `timeOfDay`
- After line ~1351 (where `moduleMapping` is derived from theme): call `applyCalendarOverrides(moduleMapping, calendarContext, timeOfDay, req.innerReadinessTier)`
- After line ~1497 (response assembly): add `calendarMessage` to response

**5. Update response type** — add optional fields:
- `timeOfDayPlan.calendarMessage?: string`
- `meta.calendarContext?: { todayLoad, upcomingLoad, todayMeetingCount, todayMeetingHours }`

### Client-side: `src/components/home/DailyRitual.tsx` (minimal)
- Read `calendarMessage` from plan response
- Display as subtitle under the period label (e.g., "Morning Practice — Heavy Day Ahead (7 meetings)")
- No structural UI changes needed

## What stays the same
- Theme-to-module mapping (still drives base selection)
- Content scoring algorithm (unchanged)
- JIT/pre-event plan (already calendar-aware)
- Duration ceiling logic (unchanged)
- Coach card inclusion rules (unchanged)
- Deduplication logic (unchanged)
- All DB schema (no migrations)

## Key Design Decision
Calendar overrides MODIFY the existing `ThemeModuleMapping` specs rather than replacing them. This means the Outer Readiness theme still controls the base recommendation, but calendar load adjusts intensity, focus, and priority. A "heavy day + depleted" morning will still get the theme's structure but with focus shifted from "confidence" to "grounding."

