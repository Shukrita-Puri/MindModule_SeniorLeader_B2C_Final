

# Three Fixes: Greeting Text, Lean On/Watch For Format, Feature Page Title Consistency

## 1. Revert Greeting Text to Black

The previous change made greeting text white with drop-shadow. Revert to dark/foreground text.

**File: `src/pages/ExecutiveHome.tsx` (lines 303-307)**
- `h1`: Change `text-white drop-shadow-[…]` back to `text-foreground`
- `p`: Change `text-white/80 drop-shadow-[…]` back to `text-muted-foreground/70`

## 2. Lean On / Watch For — Richer Signal Format

**What's happening now:** The LLM IS triggering successfully (confirmed in logs). The LLM returns `signal · Source` pairs, and the client renders them correctly. The issue is that the LLM signals are too terse (e.g., "Score 71 vs 42 yesterday · Readiness") — they lack the contextual richness the user wants.

**What the user wants:** Signals like:
- "Performance Readiness +18% than yesterday · Readiness Score"
- "Mental Toughness · Coach Conversations & Archetype"
- "Wilful Endurance · Archetype"

**The user also asked to evaluate a pill-shaped flip format** — front shows the analysis text, back shows the raw numbers. This is the same pattern already used for signal chips.

### Recommended approach: Flippable Lean On / Watch For pills

**File: `supabase/functions/compute-outer-readiness/index.ts`**
- Update the LLM prompt examples to produce richer, more descriptive signals with proper source labels (e.g., "Readiness Score", "Coach & Archetype", "Wearable", "Calendar", "Patterns")
- Update few-shot examples to show the desired format: contextual narrative signals (5-10 words) with human-friendly source labels
- Update deterministic fallbacks (`formatFallbackSignal`, evening/Sunday generators) to produce the same richer format with actual numbers where available

**File: `src/components/home/DecisionReadinessBrief.tsx`**
- Replace the current flat text rendering of Lean On / Watch For with flippable pill components (reusing `FlippableChip` pattern)
- Front: the signal analysis text (e.g., "Performance Readiness +69% vs yesterday")
- Back: raw numbers where applicable (e.g., "71 vs 42 · Score")
- Source shown as a subtle suffix on both sides
- Each lean-on/watch-for line becomes its own small pill, styled with existing taupe/amber palette

## 3. Feature Page Title Consistency (Mobile iOS Only)

Three feature pages have inconsistent title placement and sizing: Reset Studio (`RecalibrateMode.tsx`), Performance Intelligence (`Insights.tsx`), and Mind Performance Coach (`CoachSplitView.tsx`).

**Standardize to:**
- Title: `text-[24px] font-headline font-semibold text-foreground tracking-tight`
- Subtitle: `text-[12px] text-muted-foreground leading-relaxed mt-1`
- Position: Anchored at top of page, above content, with consistent `px-4 pt-4 pb-2 text-center`
- Apply via `sm:hidden` wrapper or equivalent to ensure these adjustments are mobile-only

**Files:**
- `src/pages/RecalibrateMode.tsx` (lines 101-107) — already correct, use as reference
- `src/pages/Insights.tsx` (lines 824-830) — change `text-[28px]` → `text-[24px]`, `text-[13px]` → `text-[12px]`, remove extra `mb-2`, add `context-clamp`
- `src/components/coach/CoachSplitView.tsx` (lines 242-244) — change `text-[20px]` → `text-[24px]`, add `font-semibold`, align subtitle styling

## Files Changed
1. `src/pages/ExecutiveHome.tsx` — Revert greeting to dark text
2. `supabase/functions/compute-outer-readiness/index.ts` — Richer LLM prompt signals + deterministic fallbacks
3. `src/components/home/DecisionReadinessBrief.tsx` — Flippable lean on/watch for pills
4. `src/pages/Insights.tsx` — Title consistency
5. `src/components/coach/CoachSplitView.tsx` — Title consistency

No database changes needed. Edge function redeploy required.

