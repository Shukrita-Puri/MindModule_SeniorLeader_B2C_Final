

# Replace Onboarding Background Images with Active Calm B&W Woodcuts

## Problem
- `/onboarding` and `/onboarding/app-intro` use a photographic golden-hour grassland (`onboarding-hero-calm.jpg`) — passive, "Headspace" energy
- The main page `/` uses a B&W woodcut engraving (`usp-sky-light.jpeg`) — authoritative, premium
- These two onboarding pages are visually inconsistent with the main page

## Approach
Generate 2 new B&W woodcut/engraving illustrations using AI image generation, each distinct but sharing the same visual language as the Front page. Images should convey "active calm" — commanding perspective, forward momentum, elevated vantage — not passive relaxation. Keep compositions clean (not busy) so text remains the focal point.

### Image 1 — Stage1Welcome (`/onboarding`)
**Prompt concept**: A lone figure standing at the edge of a high cliff or promontory, looking out over a vast landscape at dawn. B&W stipple engraving. Clean composition with open sky in the upper half. Conveys readiness, command, forward vision.
- Save as `src/assets/onboarding/onboarding-welcome-active.jpg`

### Image 2 — StageUSPIntro intro (`/onboarding/app-intro`)
**Prompt concept**: An expansive aerial view of a river cutting through a mountain valley, seen from a high summit. B&W line engraving. Horizon in the lower third. Conveys clarity, flow, and strategic overview — the "seeing the whole board" metaphor.
- Save as `src/assets/onboarding/onboarding-intro-active.jpg`

## Code Changes

### `src/pages/onboarding/stages/Stage1Welcome.tsx`
- Change import from `onboarding-hero-calm.jpg` → `onboarding-welcome-active.jpg`

### `src/pages/onboarding/stages/StageUSPIntro.tsx`
- Change import of `heroBg` from `onboarding-hero-calm.jpg` → `onboarding-intro-active.jpg` (used only on the intro screen, not the USP slides)

### No changes to
- Front page (`/`) — untouched
- USP slide images (sunrise-engraved, constellation, pulse-signal) — untouched

## Files Modified
| File | Change |
|------|--------|
| `src/assets/onboarding/onboarding-welcome-active.jpg` | New AI-generated B&W woodcut |
| `src/assets/onboarding/onboarding-intro-active.jpg` | New AI-generated B&W woodcut |
| `src/pages/onboarding/stages/Stage1Welcome.tsx` | Update image import |
| `src/pages/onboarding/stages/StageUSPIntro.tsx` | Update image import |

