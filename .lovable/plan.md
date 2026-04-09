

# Fix Text Readability, USP Visual Hierarchy, and Context-Connection Consistency

## Overview

Three changes: (1) glass cards for text readability on welcome/intro screens with "Executive Edition" kept as brand subtitle, (2) USP slides switch to contained image on light/white background to differentiate from intro and match app aesthetic, (3) context-connection page gets light theme with contained accent image to visually tie it to USP section.

## Changes

### 1. Glass card for body text (Stage1Welcome + StageUSPIntro intro)

Both pages keep the B&W woodcut full-bleed background. "Executive Edition" stays directly under "MIND MODULE" as a brand subtitle (not inside the glass card). The glass card wraps only the body/descriptive text below:

**Stage1Welcome** (lines 37-47): Wrap the 3 body paragraphs in a glass container:
```
<div className="bg-white/10 backdrop-blur-2xl border border-white/15 rounded-3xl p-6 mt-8 max-w-sm mx-auto">
  <div className="space-y-4">...3 paragraphs...</div>
</div>
```

**StageUSPIntro intro** (lines 132-137): Wrap the "A new era..." heading and subtitle in the same glass treatment:
```
<div className="bg-white/10 backdrop-blur-2xl border border-white/15 rounded-3xl p-6 mt-8 max-w-sm mx-auto">
  <h2>...</h2>
  <p>...</p>
</div>
```

### 2. USP slides — contained image on white/light background

Replace full-bleed dark image treatment with a light layout:
- Background: `bg-background` (white/light, matching the rest of the app)
- Image in a contained rounded window (~45vh) in the upper portion with `rounded-2xl overflow-hidden` and a subtle vignette/fade at the bottom edge
- Text below in dark foreground colors (`text-foreground`, `text-muted-foreground`)
- Top bar switches to light theme for USP slides: `bg-white/85 backdrop-blur-[30px] border-black/[0.08]`
- Dots: active `bg-saffron`, inactive `bg-muted-foreground/30`
- Buttons: Skip gets light outline styling, Continue stays `variant="critical"`

### 3. Context-connection — light theme with subtle accent image

Keep the existing light/white theme (it already matches the app). Add visual continuity with the USP section:
- Add a subtle background accent: one of the USP images (e.g., `usp-constellation.jpg`) at very low opacity (`opacity-10`) positioned in the upper portion, with a white gradient fade over it
- Integration cards keep their current light glass styling (`bg-white/65`)
- Top bar stays light (already is)
- Dots: change inactive from `bg-muted-foreground/30` to match USP slides styling

This keeps the page functional and readable while tying it visually to the USP flow.

## Files Modified

| File | Change |
|------|--------|
| `src/pages/onboarding/stages/Stage1Welcome.tsx` | Glass card around body paragraphs only |
| `src/pages/onboarding/stages/StageUSPIntro.tsx` | Glass card on intro text; USP slides: contained image + light bg; top bar light on slides |
| `src/pages/onboarding/stages/Stage7ContextConnection.tsx` | Add subtle background accent image, align dot styling |

