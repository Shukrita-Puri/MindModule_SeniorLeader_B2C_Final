

# Plan: Coach Page Visual, Copy & Mobile Layout Fixes

**Files**: `src/components/coach/CoachSplitView.tsx`, `src/pages/SelfMasteryCoach.tsx`

---

## Three Changes

### A. Replace Black Orb with Lady Visual (CoachSplitView.tsx)

**Empty state** (lines 248–253): Replace the `<CoachOrb size="lg">` with the same `coach-visual-calm.jpeg` image used on homepage coach cards. Render as a circular avatar (~120px) with subtle border styling consistent with the design system.

**Chat avatar** (lines 37–40): Replace `CoachAvatar` from `CoachOrb` to a small circular image using `coach-visual-calm.jpeg` (~32px round).

Import `coachVisual` from `@/assets/shared/coach-visual-calm.jpeg` at top of file. Remove the `CoachOrb` import entirely.

### B. Update Title & Subtitle Copy (CoachSplitView.tsx + SelfMasteryCoach.tsx)

**Title** (line 249): Keep "Mind Performance Coach" — confirmed still relevant per the new persona.

**Subtitle** (lines 259–264): Replace the current two paragraphs with copy aligned to the new "former operator" persona:
- "I'll challenge your thinking, surface what's holding you back..." → **"The one conversation that helps you understand what's in the way — before the moment that matters."** (single line, from the user's functional description)

**Default greeting** (SelfMasteryCoach.tsx line 582): Replace "I'm your mind performance coach. Share what's on your mind..." → **"What's on your mind?"** (matches the persona's "get in fast, no preamble" tone)

**Default subtitle** (SelfMasteryCoach.tsx line 282): "Your personal executive coach" → keep or simplify — no change needed since it's internal.

**Default prompts** (lines 328–332): Update to match the interior-leadership domain:
- "I'm feeling overwhelmed with my workload" → **"There's a conversation I've been avoiding"**
- "How can I be more present in meetings?" → **"I'm second-guessing a decision I've made"**
- "I'm struggling with a difficult conversation" → **"Something is off and I can't name it yet"**

### C. Mobile Layout — Input + Disclaimer in First Fold (CoachSplitView.tsx)

In the empty state (lines 242–272), reduce vertical spacing so the input bar and disclaimer are visible without scrolling on mobile:

- Reduce `space-y-4` → `space-y-3` on the centered content area
- Reduce padding above the coach visual area
- The `CoachOrb` (200px) being replaced by a ~100–120px circular image already recovers ~80px
- Ensure the disclaimer text (line 323–325) appears in the empty state too, below the InputBar

---

## What stays unchanged
- `CoachOrb.tsx` file (kept for potential future use)
- All conversation mechanics, flow types, streaming logic
- Homepage coach card visuals (already using the lady image)
- All Layer 1–7 prompt logic in the edge function

