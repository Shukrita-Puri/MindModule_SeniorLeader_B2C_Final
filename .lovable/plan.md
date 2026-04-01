

## Plan: Context-Rich Brief with Relevance-First Enrichment + Evening Day-Acknowledgment

### Single file: `supabase/functions/compute-outer-readiness/index.ts`

---

### Core Principle: Relevance, Not Listing

The user's feedback is clear: **don't mention calendar events or wearable data for the sake of it**. Context must serve a purpose — connecting what the body shows to what the calendar demands. "Your calendar includes Day Block - Prepare for Interview" adds zero value. But "Steadiness through a high-density day with 3 high-stakes meetings, while your HR ran elevated throughout" connects the dots.

**Rules for context statements:**
- Never list event titles as standalone items
- Reference event names ONLY when paired with a body/strain signal or when characterizing the day's demands (e.g., "a day anchored by [Board Meeting]")
- For many events, use count: "5 meetings with tight gaps"
- For high-stakes, reference by name only when it contextualizes the challenge or recovery need

**Rules for LeanOn/WatchFor:**
- Crisp, 1-2 sentences max
- Lead with personal insight (Coach > Archetype > future LinkedIn/LLM data)
- Situational context (calendar/wearable) is layered subtly — NO event titles, NO HR numbers
- Example LeanOn: "Your capacity to navigate politics and pressure without absorbing it. A demanding day met that instinct." (personal + situational)
- Example WatchFor: "Replaying the day's demands instead of releasing them. Your body is signalling the need to stop." (personal + situational, no specifics)

---

### 1. Rewrite `buildContextSuffix()` — Relevance-First

Replace current implementation that blindly lists events. New logic:

- **When high-stakes events exist AND wearable shows strain**: "A day anchored by {eventName} while your body carried elevated strain throughout." (connects the two signals)
- **When high-stakes events exist AND wearable is fine**: Reference event only if load is also high: "Your most demanding conditions today, anchored by {eventName}."
- **When no high-stakes but dense calendar + strain**: "{N} meetings with tight gaps, and your heart rate reflected the density."
- **When dense calendar, no strain**: "{N} meetings today — pace the gaps."
- **When wearable strain only, light calendar**: "Your body is carrying more than your calendar suggests — accumulated strain from recent days."
- **Never**: "Your calendar includes {title1} and {title2}." as a standalone listing

---

### 2. Rewrite `buildAfternoonContext()` — Same Relevance Rule

Remove standalone event name references. Instead:
- Strain + remaining demands: "Your heart rate has been elevated through a dense morning. The afternoon needs a leader who paces, not pushes."
- No event titles listed. If high-stakes afternoon event exists, weave it: "With your most critical meeting still ahead, the pace of the next few hours matters."

---

### 3. Evening: Acknowledge Today First, Then Tomorrow

**Expand `buildWeekdayEveningTheme()` signature** to accept `todayHighStakes`, `eventCount`, `calendarLoad`, `calendarPressure`.

**New priority structure:**
- **P0: Build `todaySummary`** from today's load + events + body state:
  - Heavy day + body strain: "You carried a demanding day — {N} high-stakes meetings with your heart rate elevated throughout."
  - Heavy day + named event (only if high-stakes): "You navigated {eventName} and a full calendar today."
  - Heavy day no names: "You navigated a dense calendar — {N} meetings with tight gaps."
  - Poor sleep carried through: "You started today under-recovered and carried that through a full day."
- **P1: Layer tomorrow** as recovery motivation (NOT planning):
  - "Tomorrow has {eventName}. What you release tonight determines how sharp you arrive — restoration, not preparation."
  - Light today + heavy tomorrow: "A lighter day is behind you, but tomorrow is demanding. The recovery window tonight is genuine."
- **RHR in evening**: "Your resting heart rate is still elevated — tonight's recovery is especially important."

**Wire in `main()`**: Pass `todayHighStakes`, `calendarResult.eventCount`, `calendarLoad`, `calendarPressure` to all `buildWeekdayEveningTheme()` calls.

---

### 4. Add `rhrElevated` to `WearableContext`

- Add `rhrElevated: boolean` to interface (threshold: `rhr > 75`)
- Compute alongside existing flags in wearable fetch block
- Reference in morning: "Your resting heart rate is running above baseline — your system didn't fully reset overnight."
- Reference in evening: as above
- NOT in afternoon

---

### 5. Sleep in Morning + Evening (Not Afternoon)

- **Morning**: Already implemented — no change
- **Evening**: Add to `buildWeekdayEveningTheme()`: "You started today under-recovered and carried that through a full day. Tonight's sleep matters more than usual."
- **Afternoon**: No sleep reference — confirmed unchanged

---

### 6. Rewrite `buildDaytimeLeanOnSuffix()` — Crisp, No Titles/Numbers

Remove event name references and HR numbers. New approach — subtle situational acknowledgment that reinforces the personal insight:

- Morning + strain: "A demanding day ahead is meeting that instinct."
- Morning + good recovery: "Your readiness for today's demands is genuine."
- Afternoon + strain: "The morning tested that capacity — the afternoon will too."
- Evening (newly enabled): "Today tested that capacity. The day is done."
- No data: return empty (don't force it)

---

### 7. Rewrite `buildDaytimeWatchForSuffix()` — Crisp, No Titles/Numbers

Same principle — subtle, one sentence max, no specifics:

- Morning + strain: "Spending your advantage before the day's biggest moments."
- Afternoon + strain: "Pushing through when your body is already signalling the cost."
- Evening (newly enabled): "Replaying the day's demands instead of releasing them."
- No data: return empty

---

### 8. Enable Evening in `hasDaytimeContext` Guard

- Remove `timeOfDay !== 'evening'` from line 1300
- Rename to `hasContextEnrichment`
- Evening suffix content handled by steps 6-7 above

---

### 9. Enrich `getEveningInsights()` with Today's Context

Add `todayHighStakes` parameter. But per the relevance rule, don't list event names in leanOn/watchFor. Instead:
- Heavy day: "Your awareness that a demanding day is done. Permission to stop is itself leadership tonight."
- NOT: "You carried [Board Review] through a demanding day"

Same for `getSundayEveningInsights()`.

---

### 10. Future Data Source Hierarchy Comment

Add comment block in the cascade:
```
// Data source priority for LeanOn/WatchFor:
// 1. Coach conversations (strength/growth insights) — PERSONAL
// 2. Archetype (onboarding-derived behavioral profile) — PERSONAL
// 3. [Future] LinkedIn profile analysis — PERSONAL
// 4. [Future] LLM conversation data (Claude/ChatGPT patterns) — PERSONAL
// 5. Calendar + Wearable context — SITUATIONAL (layered as suffix, never standalone)
// 6. Tier fallback — GENERIC
//
// Rule: Personal sources always lead. Situational context enriches but never replaces.
// Suffixes must be crisp — no event titles, no metric numbers.
```

---

### Summary

| Change | What |
|--------|------|
| `buildContextSuffix()` | Relevance-first: connect body + calendar, never list events |
| `buildAfternoonContext()` | Remove standalone event listings |
| `buildWeekdayEveningTheme()` | Acknowledge today first, tomorrow as recovery motivation |
| `rhrElevated` | New flag + morning/evening references |
| Sleep in evening | Added to evening builder |
| LeanOn/WatchFor suffixes | Crisp, no titles/numbers, personal-first |
| `hasDaytimeContext` → `hasContextEnrichment` | Includes evening |
| `getEveningInsights()` | Today-aware but no event name listing |
| Future hierarchy | Documented for LinkedIn/LLM extensibility |

