

# Fix: Lean On/Watch For Signal Quality + Feature Page Title Consistency

## Problem 1: Lean On / Watch For Pills — Signal Quality

**Current state**: Pills show terse signals like "Score +69% vs yesterday" or "Focused state with 4/5 clarity" — these are raw numbers without contextual analysis. The user sees numbers they can't interpret without context (what score? what does 4/5 mean here when signal pills already show that?).

**What the user wants**: Rich analysis-style signals like:
- "Performance Readiness +18% than yesterday · Readiness Score"
- "Mental Toughness · Coach Conversations & Archetype"
- "Wilful Endurance · Archetype"

**Root cause**: Both the LLM prompt few-shot examples and deterministic fallbacks produce some good signals but also produce terse number-only signals. The pill rendering is correct structurally but the content fed into it lacks analytical richness.

**Fix approach — simplified non-flip pill with inline source**:
- Remove the flip mechanic from `FlippableLeanOnPill` — it adds complexity without value here
- Render each signal as a static pill: **analysis text** followed by **· Source** in grey
- The source is inline at the end of the pill in muted text, not on the back

**File: `src/components/home/DecisionReadinessBrief.tsx`**
- Simplify `FlippableLeanOnPill` to a static pill showing `signal` text with `· source` appended in grey
- Remove flip state, auto-reset, 3D transform

**File: `supabase/functions/compute-outer-readiness/index.ts`**
- Update LLM few-shot examples to enforce analytical language — no raw "Score X vs Y" or "Clarity N/5"
- Examples should show contextual analysis: "Performance Readiness +18% vs yesterday", "Mental Toughness surfacing", "Wilful Endurance pattern"
- Update deterministic `formatFallbackSignal` to pass through more of the original text (up to 10 words) since the archetype/tier matrix already has good analytical phrasing like "Your stillness instinct", "Performing resilience"
- Redeploy edge function

## Problem 2: Feature Page Titles — Position and Size Inconsistency

**Current state**:
- Reset Studio: title at top, `text-[24px]`, `px-4 pt-4 pb-2 text-center`
- Performance Intelligence: title at top inside `py-8` wrapper — too much vertical padding
- Mind Performance Coach: title centered in the **middle** of the page (inside flex `items-center justify-center`) — completely different position

**Fix — standardize all three to top-anchored, 26px**:

**File: `src/pages/RecalibrateMode.tsx`**
- Change `text-[24px]` → `text-[26px]`

**File: `src/pages/Insights.tsx`**
- Remove the `py-8` wrapper, use `px-4 pt-4 pb-2 text-center` directly (matching Reset Studio)
- Change `text-[24px]` → `text-[26px]`

**File: `src/components/coach/CoachSplitView.tsx`**
- Move the title+subtitle OUT of the vertically centered flex container
- Place it at the top of the empty state, anchored like the other pages: `px-4 pt-4 pb-2 text-center`
- Change `text-[24px]` → `text-[26px]`
- Keep the coach avatar, greeting, and prompts in the centered flex area below

## Files Changed
1. `src/components/home/DecisionReadinessBrief.tsx` — Static pill with inline source
2. `supabase/functions/compute-outer-readiness/index.ts` — Richer LLM examples, wider deterministic text
3. `src/pages/RecalibrateMode.tsx` — Title 26px
4. `src/pages/Insights.tsx` — Title 26px, remove excess padding
5. `src/components/coach/CoachSplitView.tsx` — Title to top, 26px

Edge function redeploy required. No database changes.

