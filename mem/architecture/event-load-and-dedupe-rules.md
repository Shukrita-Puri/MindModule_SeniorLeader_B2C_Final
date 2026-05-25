---
name: Event Load & Dedupe Rules
description: Canonical cross-app rules for collapsing duplicate calendar events, counting load units, and ranking importance. Lives in src/utils/rules/calendarEvents.ts (mirrored in supabase/functions/_shared/rules/calendarEvents.ts).
type: feature
---

## Rules (one source of truth)

- **Display dedupe** — same event in multiple calendars (same normalised title + same start/end minute) collapses to 1 row. Winner = best provider per platform (iOS: apple>google>ms, Web: google>ms>apple).
- **Load units** — overlapping distinct meetings in the same slot count as **1 load unit** (used by nudges, brief load reasoning, plan event chips). Touching back-to-back (=) stays separate.
- **Display in Plan / picker** — show every distinct meeting, even if overlapping. Only cross-calendar duplicates collapse.
- **Importance score** — `scoreImportance(event, ctx)` returns `{score, reason}`. Order: user `priorityTag` (high/med/low) > historical relationship weight from `causality_findings.signal_summary.priority_tag_observation` > heuristics (high-stakes keywords, organizer, ≥5 attendees, recurring penalty).
- **Next Up pill** — `pickNextUp()` picks the highest-importance event in the next overlapping slot. Ties break by earliest start.

## Wiring

| Surface | Helper used |
|---|---|
| Replacement picker | `collapseDuplicateEvents` |
| Plan event count chip | `countLoadUnits` |
| Brief "Next Up" pill | `pickNextUp` |
| Mastery plan scorer | `rankByImportance` |
| Smart nudges (dense day, target event) | `countLoadUnits` + `pickNextUp` |

## How to add new cross-cutting rules

Add sibling files in `src/utils/rules/` + mirror in `supabase/functions/_shared/rules/`. Never dump unrelated rules into the same file.

## Calendar window standard

`list-replacement-calendar-events` returns events from **start of local Today → end of local Tomorrow** (not rolling 24h). Each event carries `dayBucket: 'today' | 'tomorrow'` and `period: 'morning' | 'afternoon' | 'evening'` (windows: 05–12, 12–18, 18–05). The picker no longer offers a By day / By period toggle; it always groups Today/Tomorrow with a Period chip on each row.