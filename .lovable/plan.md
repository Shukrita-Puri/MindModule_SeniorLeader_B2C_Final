

## Problem Summary

Three interconnected issues with the Proactive Mastery Plan:

1. **Mobile vs Web parity**: The `calendarMessage` line (e.g., "Deep Recovery (8 meetings today, 6 hrs)") renders below "Evening Close" on web but is cut off or invisible on mobile native because it's `text-[11px] italic` with no padding protection and sits in a flex-column that collapses on small viewports.

2. **Calendar message is descriptive, not prescriptive**: Current messages like "Deep Recovery (8 meetings today, 6 hrs)" tell the user about density but don't explain *why* these specific practices were chosen or why they matter right now. Beta testers say "I don't know what this plan is meant to do."

3. **Per-card reasoning is invisible**: `getModuleReasoning()` returns generic strings like "Restore calm and emotional regulation" in `text-[11px] italic` - practically invisible and not connected to the user's actual state or context.

---

## Root Causes

**A. `calendarMessage` is a density label, not a contextual brief**
- `generateCalendarMessage()` (line 678) outputs strings like "Deep Recovery (8 meetings, 6 hrs)" - pure data, zero directive connection.
- It doesn't reference the user's readiness tier, check-in state, wearable data, or the Outer Readiness phrase.

**B. `getModuleReasoning()` is a static lookup**
- Line 2333: Maps `focus` to generic strings. No user state, no calendar context, no "why this practice right now for you."
- The reasoning is the most valuable piece of text for a C-suite user and it's buried at 11px italic.

**C. Mobile visibility**
- The `calendarMessage` span is `text-[11px]` with `mt-0.5` - too small and too close to the header on mobile.
- No minimum height or padding protection for the plan header area.

---

## Plan

### Change 1: Replace `calendarMessage` with a Contextual Plan Brief

**File:** `supabase/functions/generate-mastery-plan/index.ts`

Replace `generateCalendarMessage()` with a new `generatePlanBrief()` function that produces a 1-2 sentence contextual statement connecting:
- User's readiness tier (depleted/managing/strong/peak)
- Time of day
- Calendar density (meeting count)
- The Outer Readiness phrase (what was recommended)
- Why these practices matter right now

**Examples by tier x time:**

| Tier | Time | Current Output | New Output |
|------|------|----------------|------------|
| depleted | evening | "Deep Recovery (8 meetings, 6 hrs)" | "You checked in as drained after 8 meetings. This sequence is designed to release what you carried today and protect tomorrow's capacity." |
| managing | morning | "Heavy Day Ahead (6 meetings, 5 hrs)" | "Your readiness is steady but 6 meetings lie ahead. These practices build the composure and focus to sustain you through a dense day." |
| strong | afternoon | "Moderate Day (4 meetings)" | "Your readiness is above baseline with 2 meetings still ahead. This sequence sharpens your edge for the stretch that remains." |
| peak | morning | "Open Day (2 meetings)" | "You're at peak readiness with a light day ahead. These practices channel that clarity into deliberate intention." |
| any | evening (no calendar) | null | "This evening sequence helps you close the day with intention and prepare your mind for tomorrow." |

The function signature: `generatePlanBrief(ctx, timeOfDay, innerReadinessTier, innerReadinessScore, checkInOutcome, outerReadinessPhrase)`.

Pass the readiness tier and score (already available in `req`) through to this function.

### Change 2: Upgrade `getModuleReasoning()` to context-aware reasoning

**File:** `supabase/functions/generate-mastery-plan/index.ts`

Replace the static lookup with `getContextualReasoning(moduleType, focus, innerReadinessTier, checkInOutcome, calendarLoad, timeOfDay)`.

**Examples:**

| Module | Focus | Current | New |
|--------|-------|---------|-----|
| regulate | composure | "Restore calm and emotional regulation" | "Your check-in flagged tension - this settles your nervous system before what's ahead" |
| regulate | release | "Let go of tension and mental clutter" | "After a heavy day, this practice helps discharge accumulated stress so it doesn't carry into tomorrow" |
| align | confidence | "Build presence and self-assurance" | "Your readiness is steady - this practice anchors that into confident presence for what remains" |
| align | focus | "Sharpen concentration and clarity" | "With a dense calendar, this practice narrows your attention to what genuinely matters next" |
| integrate (evening) | release | "Evening reflection and tiny wins capture" | "Capture what went well today and close with intention - this prevents rumination overnight" |

The key principle: every reasoning string answers "why this practice, right now, for you."

### Change 3: Improve plan brief visibility on mobile

**File:** `src/components/home/DailyRitual.tsx`

- Increase the plan brief from `text-[11px]` to `text-[13px]` with `leading-relaxed`
- Add `min-h-[20px]` to the brief container to prevent collapse
- Change from `italic` to `font-medium` for better readability at small sizes
- Wrap the plan brief in a subtle container (`bg-muted/20 rounded-lg px-3 py-2 mt-1.5`) to give it visual weight - similar to the Outer Readiness Brief's context line

The header section becomes:
```
Evening Close    [Evening]    0 of 3 completed
┌──────────────────────────────────────────────┐
│ You checked in as drained after 8 meetings.  │
│ This sequence releases what you carried      │
│ today and protects tomorrow's capacity.      │
└──────────────────────────────────────────────┘
[Practice Cards...]
```

### Change 4: Increase reasoning text visibility on practice cards

**File:** `src/components/home/DailyRitual.tsx`

- Change reasoning from `text-[11px] text-muted-foreground/90 italic` to `text-[12px] text-muted-foreground font-medium`
- Remove `line-clamp-2` constraint (let reasoning breathe - it's the most important text)
- Keep `line-clamp-3` as a safety net to prevent overflow

### Change 5: Write comprehensive Proactive Mastery Plan documentation

**File:** `docs/PROACTIVE_MASTERY_PLAN_LOGIC.md`

Full documentation covering:
- Purpose and philosophy (prescription, not menu)
- Signal architecture (all 11 inputs)
- Plan Brief role (why these practices, now, for you)
- Module reasoning role (per-card contextual justification)
- Theme-to-module mapping logic
- Content selection scoring weights
- Duration ceiling rules
- Coach card inclusion logic
- JIT pipeline and how it connects to ToD plan
- Executive scenarios
- Connection to Outer Readiness Brief

---

## What This Does NOT Change

- Content selection scoring (unchanged - already well-connected)
- Theme-to-module mapping (unchanged)
- Duration ceilings (unchanged)
- Coach card logic (unchanged)
- JIT pipeline (unchanged)
- Outer Readiness Brief (unchanged - already fixed)

