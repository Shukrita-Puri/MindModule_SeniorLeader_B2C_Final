

# LLM Prompt Upgrade: Full Context Enrichment

## Correction from user feedback
- **Friday evening** is NOT a "week ahead" brief — it's a **wind-down/rollback** brief (heading into weekend). Week Ahead is Sunday evening only.
- Same wind-down framing applies to eve of public holidays or personal holidays (detected from calendar).
- Implement the HRV correlation for event types (lightweight version).

## Scope
Single file: `supabase/functions/compute-outer-readiness/index.ts`, replacing lines 2472–2657 (the LLM synthesis block) and adding ~13 new data queries before it.

---

## New Data Queries (inserted before LLM synthesis, parallel where possible)

All wrapped in `try/catch`, return `null` on failure.

### Batch 1 — Parallel with existing queries

| # | Query | Source Table | Output |
|---|-------|-------------|--------|
| 1 | Yesterday's score | `daily_checkins` (yesterday's date, latest `energy_balance`) | `yesterdayScore`, `scoreTrend` (improving/declining/stable) |
| 2 | Back-to-back detection | Existing `calendarResult` events (iterate sorted, gap < 10min) | `hasBackToBack`, `longestBackToBackHrs` |
| 3 | Next event (any) | `calendar_events` where `start_time > now`, limit 1 | `nextEvent: { title, minutesUntil }` |
| 4 | Practice completion this week | `sanctuary_events` where `event_type = 'completed'`, last 7 days | `practicesCompletedThisWeek`, `practiceCompletionRate` |
| 5 | Coach session recency + impact | `coach_session_summaries` most recent + next-day `daily_checkins` delta | `daysSinceCoachSession`, `coachSessionImpactDelta` |
| 6 | 7-day avg score + trajectory | Existing `recentCheckIns` — compute avg, split first/second half | `avgScore7d`, `scoreTrajectory7d` |
| 7 | Wearable trend this week | `wearable_data` last 7 days, first 3 vs last 3 HRV avg | `wearableTrend7d` |
| 8 | DOW typical score | Existing `dowCheckins` — also compute avg `energy_balance` | `typicalDOWScore` |
| 9 | Tomorrow enhanced | Existing `tomorrowResult` — add `tomorrowVsTodayLoad`, `tomorrowFirstEventTime`, `tomorrowHighStakesTitles` | Multiple fields |
| 10 | Week-ahead (Sunday evening only) | `calendar_events` next 7 days grouped by date, only when `dayOfWeek === 0 && hour >= 17` | `weekAheadShape` object |
| 11 | State shift detection | Already computed (lines 2094-2111) — pass existing values | `stateShiftToday`, `stateShiftDirection` |
| 12 | Wearable divergence mode | Derive: compare wearable strain vs felt state tier | `divergenceMode`: ALIGNED / MASKED_HIGH / RECOVERY_UNDERWAY |
| 13 | Holiday + rest-day-eve detection | Static JSON lookup (UK/US/UAE/SG/AU 2025-2026) + calendar scan for tomorrow personal blocks | `isPublicHoliday`, `holidayName`, `isDayBeforeRestDay` |
| 14 | HRV correlation for event type | `wearable_data` + `calendar_events` cross-ref: for today's HS event type keyword, find avg HRV delta on similar past days (30d) | `hrvEventCorrelation` string or null |
| 15 | Most effective practice | `sanctuary_events` where `effectiveness_rating` is not null, top by avg rating | `mostEffectivePractice` |

### Key design decisions

**Friday evening = wind-down, not week-ahead.** The `TOMORROW CONTEXT` section fires on all evenings. The `WEEK AHEAD` section fires ONLY on Sunday evenings (`dayOfWeek === 0 && hour >= 17`). Friday gets a special flag `isFridayEvening` with wind-down framing rules.

**Day-before-rest-day detection.** `isDayBeforeRestDay = true` when:
- Friday (day before Saturday)
- Day before a detected public holiday
- Tomorrow's calendar shows an all-day "Holiday/OOO/PTO/Leave/Day Off" event (personal holiday detection from user's own calendar)

**HRV correlation (lightweight).** For each high-stakes event title today, extract the first significant keyword. Query last 30 days of `calendar_events` with similar keywords. For those dates, pull `wearable_data.hrv`. Compare avg HRV on event-days vs non-event-days. If >= 3 occurrences and deviation > 10%, produce string like "HRV drops avg 18% before board meetings — 4 occurrences". Otherwise null.

---

## Updated System Prompt

```text
You are a performance intelligence system writing a morning/afternoon/evening brief for a C-suite leader.

Your voice: a trusted chief of staff who has watched this person's data for weeks and speaks with precision, never fluff.

Your job: produce two things.

1. PHRASE: 3-6 words. A crisp directive. Active, specific, earned by their data.
   Examples: 'Pace from the start.' 'Use the edge now.' 'Protect what you have.' 'Ground before the board.' 'This is your window.'

2. BODY: One sentence. Maximum 15 words. References something specific to them. Bolds the key action with **double asterisks**. Never generic. Never a template.

Hard rules — no exceptions:
- No wellness words ever: relax, mindful, breathe, calm, wellness, self-care, journey, practice, routine, nourish, recharge
- No affirmations or encouragement
- No softening language
- C-suite register only: direct, precise, data-referenced
- Wearable data > felt state when both exist and diverge
- Coach memory > generic patterns when available
- If a field is NULL: ignore it entirely, never reference it, never fabricate
- If you cannot produce something specific and non-generic: output null for that field
- JIT event within 90 mins: the brief MUST orient around it
- Never repeat the phrase in the body
- Never use the word 'readiness'
- If calendar load is 'none': user has no calendar connected — do not reference meetings, calendar density, or scheduling

SUNDAY EVENING RULE:
When Is Sunday evening = yes:
  This is the highest-value brief of the week. The leader is mentally preparing to re-enter.
  Do NOT write a reflection brief. Do NOT summarise the weekend. Write a forward brief.
  Orient around: (1) What Monday looks like (specific), (2) The week's pressure point (heaviest day / first high-stakes event), (3) One thing to carry in vs leave behind.
  If Monday is heavy: directive phrase. If Monday is light: spacious phrase.
  Never write: 'Reflect on your week' or 'Prepare for tomorrow' (too generic).
  Always write toward the specific shape of what's coming.

FRIDAY/PRE-REST-DAY EVENING RULE:
When Is day before a rest day = yes (Friday evening, eve of public holiday, eve of personal holiday):
  This is a transition brief. The leader is closing out and heading into recovery.
  Frame as closure and release — not planning.
  If tomorrow has high-stakes (e.g. Monday board meeting visible from Friday): "Don't fully unplug — [event] needs mental space this weekend."
  If no upcoming pressure: "Disconnect fully. You have runway."
  Never write operational preparation language for the next workday.
```

## Updated User Prompt (structured, conditional sections)

```text
Write a brief for this leader. Use only AVAILABLE data. Ignore and never reference NULL fields.

=== TIME CONTEXT ===
Current time: [HH:MM] local
Time of day: [morning/afternoon/evening]
Day: [dayName]
Is weekend: [yes/no]
Is day before a rest day: [yes/no] (Friday, eve of holiday, eve of personal day off)
Hour of day: [N]
Hours remaining in workday: [N] or NULL (NULL if after 19:00)

=== TODAY'S READINESS ===
Score today: [score]/100 ([tier])
Score yesterday: [score]/100 or NULL
Score trend: [improving/declining/stable] vs yesterday
Score vs typical [dayName]: [better/worse/consistent] or NULL (only if >= 4 historical occurrences)
Felt state: [checkInOutcome] or NULL
Clarity: [N]/5 or NULL
Confidence: [N]/5 or NULL

=== WEARABLE === [omit entire section if no wearable]
HRV vs 30-day baseline: [+/-N]% or NULL
  Is this unusual for them: [yes/no] or NULL (yes = worst/best 10%)
Sleep vs 30-day baseline: [+/-N]% or NULL
  Hard floor breach (<6hrs): [yes/no]
RHR vs 30-day baseline: [+/-N]% or NULL
Wearable divergence mode: [ALIGNED/MASKED_HIGH/RECOVERY_UNDERWAY] or NULL
  MASKED_HIGH = wearable much worse than felt state — body under load the leader hasn't registered
  RECOVERY_UNDERWAY = wearable much better than felt state — body recovering faster than perceived
Wearable confidence: [high/medium/low]

=== CALENDAR TODAY === [omit if no calendar connected]
Load: [none/low/medium/high]
Total meetings: [N]
Meetings remaining today: [N]
Back-to-back meetings: [yes/no]
  If yes: longest back-to-back block: [N hrs]
High-stakes events today: [titles] or NONE
Next event title: [title] or NULL
Next event in: [N] minutes or NULL
Next high-stakes event title: [title] or NULL
Next high-stakes event in: [N] minutes or NULL
  < 30 mins: orient entirely around this event
  30-90 mins: surface preparation angle
  > 90 mins: context only, mention but don't dominate

=== TOMORROW CONTEXT === [include on evenings, Friday, Sunday]
Tomorrow is: [dayName]
Tomorrow load: [none/low/medium/high]
Tomorrow first event: [HH:MM] or NULL (flag if before 8am)
Tomorrow has high-stakes events: [yes/no]
Tomorrow high-stakes titles: [titles] or NULL
Tomorrow vs today load: [heavier/lighter/similar]

=== WEEK AHEAD === [Sunday evening only, omit all other days]
Heaviest day next week: [day] ([load])
First high-stakes event: [title] · [day] · [time] or NULL
Total high-stakes events next week: [N]
Light days next week: [days] or NONE
Monday load: [none/low/medium/high]
Monday first event: [title] · [HH:MM] or NULL
Monday has high-stakes: [yes/no]

=== SHORT-TERM PATTERNS === [omit if checkInCount < 3]
Dominant state this week: [outcome] or NULL
7-day average score: [N]/100 or NULL
Score trajectory this week: [improving/declining/stable] or NULL
Wearable trend this week: [improving/declining/stable] or NULL
Practices completed this week: [N]
Practice completion rate this week: [N]%
Coach session this week: [yes/no]
Coach session readiness impact: [+/-N points next-day delta] or NULL
Days since last coach session: [N] or NULL

=== MID-TERM PATTERNS === [omit if checkInCount < 7]
Typical [dayName] outcome: [outcome] or NULL
Typical [dayName] score: [N]/100 or NULL
Friction trend (30 days): [improving/stable/declining] or NULL
HRV correlation for today's event type: [text] or NULL
Most effective practice for this user: [name] or NULL
Coach-identified strength: [text] or NULL
Coach-identified growth area: [text] or NULL
Pending coach commitment: [text] or NULL
Recent coach-noted pattern: [text] or NULL

=== LONG-TERM === [omit if checkInCount < 30]
Archetype: [title] or NULL
Archetype lean on: [text] or NULL
Archetype watch for: [text] or NULL

=== SPECIAL CONTEXT FLAGS ===
Is Monday morning: [yes/no]
Is Friday evening: [yes/no]
Is Sunday evening: [yes/no]
Is public holiday: [yes/no] · [holidayName] or NULL
Is day after poor sleep: [yes/no]
Is consecutive low day: [yes/no] · consecutive_count = [N] days
State shift today: [yes/no] · direction = [improving/declining]

Output ONLY valid JSON:
{"phrase": "3-6 word directive or null", "bodyText": "one sentence **bold action** or null"}
```

---

## Response payload additions

New fields added to the result object for frontend consumption:

- `yesterdayScore` (number | null)
- `scoreTrend` (string | null)
- `hasBackToBack` (boolean)
- `longestBackToBackHrs` (number | null)
- `nextEvent` ({ title, minutesUntil } | null)
- `practicesCompletedThisWeek` (number)
- `practiceCompletionRate` (number)
- `daysSinceCoachSession` (number | null)
- `coachSessionImpactDelta` (number | null)
- `avgScore7d` (number | null)
- `scoreTrajectory7d` (string | null)
- `wearableTrend7d` (string | null)
- `typicalDOWScore` (number | null)
- `divergenceMode` (string | null)
- `weekAheadShape` (object | null) — Sunday only
- `hrvEventCorrelation` (string | null)
- `mostEffectivePractice` (string | null)

---

## What is preserved

- The deterministic fallback system (`getTheme`, `buildMorningTheme`, `buildWeekdayEveningTheme`, etc.) remains completely untouched
- `finalPhrase` and `finalContext` from templates are still the fallback when LLM returns null
- `stateStatement` and `compassAlreadyUsed` logic unchanged
- All existing auth (Auth0 JWT + dev mode `userId` body param) unchanged

## Implementation approach

1. Add the ~15 new queries as a `Promise.all` batch after the existing baseline computation (line ~2416) and before the LLM synthesis block
2. Replace lines 2472-2657 with the new system prompt, user prompt construction (conditional sections based on `dataCompleteness` and time-of-day), and the same LLM call mechanics
3. Add new fields to the response payload (lines 2676-2717)
4. Add static holiday lookup as a const at the top of the file

