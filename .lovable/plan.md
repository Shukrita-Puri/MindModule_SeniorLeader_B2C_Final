

## Audit: Two Root Problems Identified

### Problem 1: Only 3 of 8+ events synced to database

**Evidence from DB query:**

The `calendar_events` table for this user today contains only 3 entries:

| Event | Start (UTC) | Duration | Attendees |
|-------|-------------|----------|-----------|
| Pilot #1 — Dulwich College Singapore | 07:30 | **25 hours** | 0 |
| Global Town hall — Presenting | 18:15 | 1 hour | 1 |
| Meeting with leadership team | 19:30 | 1 hour | 2 |

**But Google Calendar shows 8+ events:**

Board Meeting (6-8am), Debrief LT (9:30-10:30), Coca-Cola Client meeting (11-12), New Business Pitch (12:30-1:30), Day Block (5-7pm), Global Town hall (7:15-8:15pm), Meeting with leadership team (8:30-9:30pm), Beta Testing (all day), Pilot #1 (multi-day).

**5 real meetings are missing from the DB entirely.** This is why the system says "navigated 2 meetings" — it literally only knows about 3 events, one of which is a 25-hour block. The outer-readiness code is working correctly with the data it has; the data itself is incomplete.

**Root cause: `sync-calendar` function.** This is a separate investigation — the sync is failing to capture most of the user's events. This plan addresses what can be fixed inside `compute-outer-readiness` now, but the calendar sync gap is the primary issue for accurate counts.

### Problem 2: "Pilot #1" (25h, 0 attendees) counted as a "meeting"

The system counts `eventCount = 3` including this multi-day block. When computing `pastEvents = eventCount - remainingEvents`, "Pilot #1" inflates the past meeting count. The all-day/block filter (`dur > 240 && att <= 1`) only applies to high-stakes detection, not to the user-facing meeting count.

### Problem 3: Context statement lost its directive role

The context has become purely descriptive ("You've navigated 2 meetings so far. 1 still ahead...") without connecting back to the phrase directive ("Close with care" / "Stay present"). The Outer Readiness Brief's purpose is: **phrase = what to do, context = why (connecting decision readiness + calendar + wearable + archetype to that recommendation)**.

---

## Plan (single file: `supabase/functions/compute-outer-readiness/index.ts`)

### Change 1: Add `meetingCount` / `remainingMeetings` to filter out non-meeting events

In `getServerCalendarMetrics()`, apply the same exclusion filters used for high-stakes detection to compute a **filtered meeting count** for user-facing text:

- Exclude events matching `personalBlockPatterns` (Day Block, Prep, Focus Time, etc.)
- Exclude events where `duration > 240 && attendees <= 1` (multi-day blocks, all-day holds)

New fields on `CalendarMetricsResult`:
- `meetingCount: number` — actual meetings only
- `remainingMeetings: number` — remaining actual meetings (filtered + future)

Keep raw `eventCount` for load/pressure scoring (density should still count all calendar entries).

Add a debug log listing any filtered-out events and the reason (helps diagnose count discrepancies).

### Change 2: Use `meetingCount` / `remainingMeetings` in all user-facing theme text

Replace all references to `pastEvents` (derived from `eventCount - remainingEvents`) with `pastMeetings` (from `meetingCount - remainingMeetings`) in:
- `buildWeekdayEveningTheme()` Branch A (all variants)
- `buildWeekdayEveningTheme()` Branch B `todaySummary` strings
- `buildContextSuffix()` evening branch

Pass `meetingCount` and `remainingMeetings` through the call chain alongside existing `eventCount`/`remainingEvents`.

### Change 3: Rewrite Branch A context strings — connect to the phrase directive

Every context string must follow: `[Acknowledge past] + [Frame remaining/situation] + [Why this directive matters given decision readiness + signals]`

**Branch A-1 (remaining high-stakes):**
- Depleted: "Protect what's left." → "You've navigated {pastMeetings} meetings today. With {HS event} still ahead and your reserves low, protecting what's left means deploying only where it genuinely matters — everything before it is cost, not investment."
- Managing: "Stay present for what's left." → "You've navigated {pastMeetings} meetings today. With {HS event} still ahead, your decision readiness is still operational — staying present for what remains is the highest-value move right now."
- Strong: "Carry your edge forward." → "You've navigated {pastMeetings} meetings today with above-baseline readiness. {HS event} is still ahead — carry that edge forward into the moment that matters most."
- Peak: "Finish at your best." → "..peak readiness through {pastMeetings} meetings. {HS event} is still ahead — this state is rare, finish at your best where it counts."

**Branch A-2 (body strain, no HS remaining):**
- "Pace the remaining hours." → "You've carried strain through {pastMeetings} meetings. With {remaining} still ahead, pacing the remaining hours protects the quality of your presence for what's left."

**Branch A-3 (no strain, no HS):**
- "Close with care." → "You've navigated {pastMeetings} meetings so far. {remaining} still ahead — closing with care means bringing the same quality of attention to what remains without borrowing from tomorrow."

**Branch B (day done) — also tighten directive connection:**
- Each `todaySummary` + tomorrow/body variant should end with *why* the phrase (e.g., "Ground before tomorrow") is the right move given the user's decision readiness tier and signals.

### Change 4: Investigate calendar sync gap (separate scope, flagged here)

The `sync-calendar` function is only syncing 3 of 8+ events. This needs a separate investigation into:
- Whether the Google Calendar API query window is correct
- Whether recurring event handling is filtering out too aggressively
- Whether there's a pagination issue
- Whether the user has multiple calendars and only the primary is synced

This is **the most impactful fix** for accuracy but lives outside `compute-outer-readiness`. Will investigate as a follow-up.

---

### Summary

| Change | Impact |
|--------|--------|
| `meetingCount` / `remainingMeetings` filter | "Pilot #1" (25h block) excluded from "meetings navigated" count |
| Use filtered counts in all user-facing text | Accurate meeting numbers (1 past meeting, 1 remaining — not "2 navigated") |
| Context strings reconnected to directive | "Close with care" explained by *why* given readiness + signals |
| Calendar sync investigation (follow-up) | Fix the 5 missing events — root cause of inaccurate data |

