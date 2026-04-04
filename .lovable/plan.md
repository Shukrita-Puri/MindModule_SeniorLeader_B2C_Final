

# Fix Cursive Font Overuse – Replace with Inter for Readability

## Problem
`font-subheadline` maps to **Crimson Pro** (a serif/cursive font). It's currently applied to body descriptions, button labels, sub-section headers, onboarding option descriptions, legal page headings, and practice player text. At small sizes (11–15px) on mobile, this font is hard to read – especially for volume text that users need to scan quickly.

## Recommendation

**Keep Crimson Pro (`font-subheadline`) only for decorative accent text** – short italic phrases that convey tone, not information. Examples:
- Archetype descriptions on Stage8Results ("You are The Architect")
- Theme/intention quotes (short italic one-liners)

**Switch everything else to Inter (`font-body`)** – all body copy, descriptions, sub-headers, legal text, option descriptions, button labels, practice descriptions.

This follows Apple's HIG and Material Design guidance: use a single sans-serif for all functional text; reserve decorative fonts for brand moments only.

---

## Files Changed (16 files)

| File | What changes |
|------|-------------|
| `src/components/home/GreetingBanner.tsx` | Subtitle → `font-body` |
| `src/components/home/StrategicIntentionCard.tsx` | Lean on / Watch for values → `font-body` |
| `src/components/onboarding/QuestionCard.tsx` | Subtitle → `font-body` |
| `src/pages/DailyCheckIn.tsx` | Description paragraph → `font-body` |
| `src/pages/GuidedPracticePlayer.tsx` | Story hook, technique/benefits labels, full story label → `font-body` |
| `src/pages/PoweredByAI.tsx` | Body descriptions → `font-body` |
| `src/pages/Privacy.tsx` | All section headings + body → `font-body` |
| `src/pages/Terms.tsx` | All section headings + body → `font-body` |
| `src/pages/SoundscapePlayer.tsx` | Description text → `font-body` |
| `src/pages/onboarding/stages/Stage3EmotionalAwareness.tsx` | Option descriptions → `font-body` |
| `src/pages/onboarding/stages/Stage4StressResponse.tsx` | Option descriptions → `font-body` |
| `src/pages/onboarding/stages/Stage5RecoveryPatterns.tsx` | Option descriptions → `font-body` |
| `src/pages/onboarding/stages/Stage6MentalClarity.tsx` | Option descriptions → `font-body` |
| `src/pages/onboarding/stages/Stage6Payment.tsx` | ROI line → `font-body` |
| `src/pages/onboarding/stages/Stage8Results.tsx` | **KEEP** `font-subheadline italic` here – this is the archetype accent moment |
| `src/pages/onboarding/stages/StageUSPIntro.tsx` | Slide subtitles → `font-body` |

## Rule
Every instance of `font-subheadline` is replaced with `font-body`, **except** `Stage8Results.tsx` where the italic archetype description is an intentional brand moment. The `italic` modifier is kept where it adds appropriate tone (e.g., onboarding option hints), but paired with `font-body` for legibility.

## What Does NOT Change
- `font-headline` (Cormorant Garamond) usage – stays on all main titles and score numbers
- Any logic, data, routing, or component structure
- Desktop/iPad layouts
- Color palette

