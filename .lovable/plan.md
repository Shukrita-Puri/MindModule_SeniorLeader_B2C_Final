

## Fix Gaps in `generate-mastery-plan` Edge Function

Five targeted fixes to align the edge function with the final architecture document.

---

### Fix 1: Correct Theme-to-Module Mapping (Gap 1)

The `THEME_MODULE_MAP` in the edge function has discrepancies compared to the corrected v2 mapping from `compute-outer-readiness`. Key differences to fix:

**DEPLETED TIER** (lines 292-329):
- "One thing at a time." -- current has `gentle/standard/composure` for regulate. Doc says `gentle/short/composure`. Change duration from `standard` to `short`.
- "Protect what matters." -- current has `grounding` for regulate focus. Doc says `restore`. Change focus. Also priority P8 not P8 (OK). Also align: doc says `○ P5 gentle/micro/composure` -- current has `gentle/short`. Change duration to `micro`.
- "Reserve for the moment." -- current has align module. Doc says no align. Remove align.
- "Navigate, don't absorb." -- doc says `○ P5 gentle/micro/restore` for align. Current has no align. Add optional align.
- "Move through gently." -- matches (regulate only). OK.
- "Pace and protect." -- current has `restore` for regulate, `grounding` for align. Doc says regulate `gentle/standard/restore` (current is `short` -- change to `standard`). Align `○ P5 gentle/short/grounding` -- current is `P4` -- change to `P5`.
- "Rest is the work." -- current regulate P8, doc says P9. Change. Current integrate P7, doc says P8. Change.
- "Begin with intention." -- current align `gentle/short/grounding`, doc says `○ P5 gentle/micro/restore`. Change focus from `grounding` to `restore`, duration from `short` to `micro`.
- "Close before tomorrow." -- current align `gentle/short/release` optional. Doc says `○ P5 gentle/short/release`. Add optional align P5. Also integrate: current P8 matches. OK.
- "Protect your reserves." -- current align `P4 gentle/short/composure`. Doc says `○ P4 gentle/micro/grounding`. Change duration to `micro`, focus to `grounding`.

**MANAGING TIER** (lines 331-368):
- "Hold your ground." -- current has regulate + align + prepare. Doc says regulate `✅ P8 gentle/short/composure` + align `○ P5 moderate/micro/focus`. Remove prepare. Change regulate: required=true, P8, gentle, short. Change align: P5, micro.
- "Steady into the stakes." -- current has regulate + align + prepare. Doc says `✅ P7 moderate/short/composure` regulate + `○ P6 moderate/short/confidence` align. Remove prepare. Fix regulate to P7, required=true, moderate, short. Fix align to P6, confidence.
- "Depth over breadth." -- current has align + prepare. Doc says `○ P4 gentle/micro/grounding` regulate + `✅ P7 moderate/short/focus` align. Remove prepare, add regulate.
- "Rhythm over intensity." -- current regulate `P4 gentle/short/grounding`, align `P4 gentle/short/grounding`. Doc says regulate `✅ P7 gentle/short/grounding` + align `○ P5 moderate/short/focus`. Fix both.
- "Ride the rhythm." -- current `align P4 moderate/short/focus`. Doc says `✅ P6 moderate/short/focus`. Fix to P6 required.
- "Steady execution." -- current `align P4 gentle/short/grounding`. Doc says `○ P4 gentle/micro/composure` regulate + `✅ P6 moderate/short/focus` align. Add regulate, fix align.
- "Build your reserves." -- current `regulate P4 gentle/short/restore`. Doc says `✅ P7 gentle/standard/restore` regulate + `○ P4 gentle/short/grounding` align. Fix regulate, add align.
- "Set a sustainable pace." -- current `regulate P4 moderate/micro/grounding` + `align P4 moderate/short/grounding`. Doc says `✅ P7 moderate/short/grounding` regulate + `○ P5 moderate/micro/focus` align. Fix both.
- "Close with care." -- current align `P4 gentle/short/release` + integrate `P6 gentle/short/release`. Doc says regulate `✅ P8 gentle/short/release` + align `○ P5 gentle/short/release`. Remove integrate, add regulate, fix align.
- "Maintain your rhythm." -- current `align P4 gentle/short/grounding`. Doc says regulate `○ P4 gentle/micro/composure` + align `✅ P6 moderate/short/focus`. Fix align, add regulate.

**STRONG TIER** (lines 370-408):
- "Lead from strength." -- current has regulate + align + prepare. Doc says regulate `○ P5 moderate/micro/composure` + align `✅ P8 activating/short/confidence`. Remove prepare. Fix regulate to P5, moderate, composure.
- "Execute with presence." -- doc says align `✅ P8 activating/short/confidence` + prepare `○ P6 moderate/short/focus`. Current has align P7 + prepare P7 both activating/confidence. Fix align P8, prepare P6 moderate/focus.
- "Bring your full weight." -- doc says regulate `○ P4 moderate/micro/grounding` + align `✅ P8 activating/short/confidence`. Current missing regulate, has align P7 + prepare P7. Remove prepare, add regulate, fix align P8.
- "Sustain the quality." -- doc says regulate `✅ P7 moderate/short/composure` + align `✅ P7 moderate/short/focus`. Current regulate P4 micro/focus, align P6. Fix both.
- "Move with confidence." -- doc says align `✅ P7 activating/short/confidence`. Current P6. Fix to P7.
- "Invest the advantage." -- doc says align `✅ P7 activating/short/focus` + prepare `○ P5 gentle/short/restore`. Current align P5 moderate, prepare P6 moderate/focus. Fix both.
- "Protect and build." -- doc says regulate `○ P5 gentle/short/grounding` + align `✅ P7 gentle/standard/restore` + prepare `○ P6 moderate/short/focus`. Current only has align P4 moderate/grounding. Add regulate, fix align, add prepare.
- "Protect the window." -- doc says regulate `○ P4 moderate/micro/composure` + align `✅ P7 activating/short/focus`. Current regulate P4 activating/focus, align P7 activating/focus. Fix regulate to moderate/composure.
- "Close strong." -- doc says regulate `○ P5 gentle/short/release` + align `✅ P7 gentle/short/release` + prepare `○ P5 moderate/short/confidence`. Current align P4 moderate/confidence + integrate P6. Remove integrate, add regulate, fix align, add prepare.
- "Leverage your position." -- doc says regulate `○ P4 moderate/micro/grounding` + align `✅ P7 activating/short/confidence`. Current align P5 moderate/focus + prepare P4 moderate/focus. Remove prepare, add regulate, fix align.

**PEAK TIER** (lines 410-450):
- "Peak performance day." -- doc says regulate `○ P5 moderate/micro/composure` + align `✅ P8 activating/short/confidence` + prepare `✅ P7 activating/short/confidence`. Current regulate P4 activating/confidence, align P7, prepare P8. Fix priorities and regulate intensity/focus.
- "Execute with precision." -- doc says regulate `○ P4 activating/micro/focus` + align `✅ P8 activating/short/focus` + prepare `○ P6 activating/micro/confidence`. Current align P7, prepare P7 short. Fix align P8, prepare P6 micro/confidence.
- "Seize the high ground." -- doc says align `✅ P8 activating/short/confidence` + prepare `✅ P7 activating/short/focus`. Current align P7 confidence, prepare P7 confidence. Fix align P8, prepare focus.
- "Channel the capacity." -- doc says regulate `○ P5 moderate/micro/grounding` + align `✅ P8 activating/short/focus`. Current regulate P4 activating/focus, align P6. Fix both.
- "Move with full confidence." -- doc says align `✅ P7 activating/short/confidence`. Current P6. Fix to P7.
- "Depth and precision." -- doc says align `✅ P8 activating/short/focus` + prepare `○ P6 moderate/short/confidence`. Current align P5 moderate, prepare P6 moderate/focus. Fix align P8/activating, prepare confidence.
- "Deep work window." -- doc says align `✅ P8 activating/standard/focus` + prepare `○ P5 gentle/short/restore`. Current align P4 moderate/short. Fix to P8 activating/standard, add prepare.
- "Protect the peak." -- doc says regulate `✅ P7 moderate/short/composure` + align `✅ P8 activating/short/confidence`. Current regulate P4 activating/micro/focus + align P7 activating/focus + prepare P7 activating/focus. Remove prepare, fix both.
- "Close with intention." -- doc says regulate `○ P5 gentle/short/composure` + align `✅ P7 gentle/short/release`. Current align P4 moderate/confidence + integrate P6 gentle/release. Remove integrate, add regulate, fix align.
- "Own your optimal state." -- doc says regulate `○ P4 moderate/micro/grounding` + align `✅ P7 activating/short/confidence` + prepare `○ P4 moderate/short/confidence`. Current align P4 moderate/confidence, prepare P4 moderate/confidence. Add regulate, fix align P7/activating.

The entire `THEME_MODULE_MAP` will be rewritten to match the doc exactly.

---

### Fix 2: Structured Coach Inclusion Logic (Gap 5)

Current state: Morning coach is suppressed for strong/peak tiers but doesn't account for `calendarPressure` or user coach-favourite preference. Afternoon coach is fully suppressed.

Changes to `getCoachPromptForContext` and the main plan assembly:

**Morning session coach decision tree:**
- IF tier is `depleted` or `managing` --> INCLUDE
- ELSE IF `consecutiveLowDays >= 3` (patternInsight) --> INCLUDE
- ELSE IF `calendarPressure === 'high'` --> INCLUDE
- ELSE IF user has marked coach as favourite --> INCLUDE
- ELSE --> EXCLUDE

**Afternoon session coach decision tree:**
- IF tier is `depleted` --> INCLUDE
- ELSE IF `calendarPressure === 'high'` AND pre-event within 4 hours --> INCLUDE
- ELSE --> EXCLUDE

**Evening session:** Always include (unchanged).

**Pre-event session:** Always include (unchanged).

This requires passing `calendarPressure` and `favorites` into `getCoachPromptForContext`. The function signature will be updated.

**File:** `supabase/functions/generate-mastery-plan/index.ts` -- update `getCoachPromptForContext` function and its call site.

---

### Fix 3: Evening Tiny Win + Reflection Coach Card Label (Gap 3)

Two changes:

**A. Coach card label on the carousel for evening sessions:**
- Currently shows "Today's Plan" badge on all coach cards
- For evening sessions, change the badge text to "Tiny Win and Reflection"
- Change the coach card `title` from "Evening Flow" to "Tiny Win and Reflection"

**B. Evening coach prompt explicitly triggers Tiny Win capture:**
- The evening coach prompt already says "what's one thing you did right today?" -- this is correct
- The coach AI (Self Mastery Coach) should be instructed to store the user's response as a tiny win via `store-tiny-win`. This is handled in the coach's system prompt/intervention logic, not in the plan generator. No edge function change needed for this part -- it's a coach-side concern.
- In the plan generator, update the evening coach card `title` to "Tiny Win and Reflection" so the carousel card renders the correct label.

**Files modified:**
- `supabase/functions/generate-mastery-plan/index.ts` -- evening coach card title/label
- `src/components/home/DailyRitual.tsx` -- conditionally render "Tiny Win and Reflection" badge instead of "Today's Plan" for evening coach cards

---

### Fix 4: Back-to-Back Event Scoring (Gap 4)

Add `+5` to `scoreCalendarEvents` when an event starts within 15 minutes of the previous event ending.

After sorting events by start time, iterate and check if `nextStart - currentEnd < 15 min`. If so, add +5 to the next event's score.

**File:** `supabase/functions/generate-mastery-plan/index.ts` -- `scoreCalendarEvents` function.

---

### Fix 5: Morning Label (Gap 6)

Change `periodLabels.morning` from `'Morning Start'` to `'Morning Practice'`.

**File:** `supabase/functions/generate-mastery-plan/index.ts` -- line 1061.

---

### Technical Summary

**Files modified:**
1. `supabase/functions/generate-mastery-plan/index.ts` -- All 5 fixes (theme map rewrite, coach logic, evening label, back-to-back scoring, morning label)
2. `src/components/home/DailyRitual.tsx` -- Evening coach card badge text change

**Edge function deployed:** `generate-mastery-plan`

