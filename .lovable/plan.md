

## Coach Page Redesign + Fix 3 Completion

### Issue Summary

Six issues identified from the screenshots and feedback:

1. **Coach response appearing in user section** -- "Take your time..." text shows in the bottom user area because the split-view layout (70/30) is fundamentally broken for conversation flow
2. **Submit button blocked** -- the 30% user area overflows, preventing interaction
3. **Coach photo placement** -- currently used as full background; should be a small circle avatar next to "Self Mastery Coach" header
4. **Layout ratio** -- 70/30 split is unworkable; user requests a single-page chat layout (WhatsApp/ChatGPT style)
5. **Fix 3 incomplete** -- "Evening Flow" still appears in `performancePlanEngine.ts`, `planReconstruction.ts`, and one path in the edge function (pre-event integrate cards)
6. **Landing page prompts** -- should be white text overlaid on the coach visual background, not in a separate white panel

---

### Change 1: Rewrite CoachSplitView to Single-Page Chat Layout

Replace the broken 70/30 split with a standard messaging layout:

**Empty state (no messages):**
- Full-screen coach visual background (keep existing)
- "Self Mastery Coach" title, tagline, and description in white text overlaid on the visual
- Coach avatar as a small circle (using the coach-visual-calm.jpeg cropped into a round avatar) with "Hello, [Name]" below
- Prompt suggestion buttons styled with semi-transparent dark backgrounds and white text, overlaid on the visual (not in a separate white panel)
- Input bar pinned at the bottom with a subtle frosted glass background

**Active conversation (has messages):**
- Standard vertical chat flow (like WhatsApp/ChatGPT)
- Top bar: small circle coach avatar + "Self Mastery Coach" label + session context subtitle
- Messages scroll vertically in a single column:
  - User messages: right-aligned bubbles with primary background
  - Coach messages: left-aligned, preceded by small coach avatar, white/light background bubbles
  - Protocol cards and wisdom cards render inline within coach messages
- Input bar pinned at bottom with voice toggle and send button
- "End session" link below input
- No split, no 70/30, no separate sections for coach vs user

**Technical approach:**
- Remove the `h-[70%]` / `h-[30%]` split entirely
- Remove the full-bleed background image from the active conversation state
- Messages rendered in a single scrollable container
- Coach avatar: a 36px circle with the coach-visual-calm.jpeg as `object-cover` background
- Auto-scroll to bottom on new messages (existing logic preserved)

---

### Change 2: Fix "Evening Flow" References (Fix 3 Completion)

Three files still contain "Evening Flow" instead of "Tiny Win and Reflection":

**A. `src/utils/performancePlanEngine.ts` (line 906):**
- Change `title: 'Evening Flow'` to `title: 'Tiny Win and Reflection'`

**B. `src/utils/planReconstruction.ts` (line 37):**
- Change `title: 'Evening Flow'` to `title: 'Tiny Win and Reflection'`

**C. `supabase/functions/generate-mastery-plan/index.ts` (line 950):**
- The pre-event integrate card still falls back to `'Evening Flow'`. Change to `'Tiny Win and Reflection'`

---

### Change 3: DailyRitual Badge Logic Fix

The badge logic on line 613 of `DailyRitual.tsx` checks `module.title === 'Tiny Win and Reflection'` which is correct, but the client-side fallback engines were still producing "Evening Flow" titles. Once Change 2 is applied, the badge will render correctly as "Tiny Win and Reflection" for all evening coach cards.

---

### Files Modified

1. `src/components/coach/CoachSplitView.tsx` -- Complete rewrite from split-view to single-page chat layout
2. `src/utils/performancePlanEngine.ts` -- "Evening Flow" to "Tiny Win and Reflection" (line 906)
3. `src/utils/planReconstruction.ts` -- "Evening Flow" to "Tiny Win and Reflection" (line 37)
4. `supabase/functions/generate-mastery-plan/index.ts` -- "Evening Flow" to "Tiny Win and Reflection" (line 950)

### Edge Function Deployed

- `generate-mastery-plan`
