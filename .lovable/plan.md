## Scope

Visual-only changes across the v8 onboarding surface. No flow, route, button, validation, or business-logic changes.

App palette in use:
- Parchment bg `#f5f0e8`
- Ink/charcoal `#1a1712`
- Taupe `#7a7060`
- Saffron `#ba7517` (critical accent)
- Coral `#e8714a` (CTA)
- Cream surface `#ede8dc`, border `#cfc7b8`

## Changes

### 1. Top nav with back button on v8 pages

File: `src/pages/onboarding/OnboardingFlow.tsx`
- Remove v8 routes from the back-button exclusion so `UnifiedTopBar` renders on:
  `/onboarding/app-intro`, `/onboarding/leadership-context`, `/onboarding/cognitive-load`, `/onboarding/protect-goals`, `/onboarding/brief-prefs`, `/onboarding/permissions`.
  (Still excluded: `/onboarding/done` — terminal screen.)
- Extend `backMap` for the v8 chain:
  - `leadership-context → app-intro`
  - `cognitive-load → leadership-context`
  - `protect-goals → cognitive-load`
  - `brief-prefs → protect-goals`
  - `permissions → brief-prefs`

File: `src/components/navigation/UnifiedTopBar.tsx`
- Add an optional right-side brand lockup (small Mind Module circle logo + "MIND MODULE" wordmark + tiny "Executive" tag) shown when a new `showBrand` prop is true.
- Charcoal text on the existing white/blur bar so it reads against the new light v8 backgrounds.

`OnboardingFlow.tsx` passes `showBrand` only on v8 routes.

### 2. App-intro slides → parchment background, charcoal/taupe text

File: `src/pages/onboarding/stages/StageUSPIntro.tsx`
- Root `bg-[#1a1712] text-[#f5f0e8]` → `bg-[#f5f0e8] text-[#1a1712]`.
- Remove the dark "Mind Module" pill at top (now lives in the global top nav).
- Hero image bottom gradient overlay fades to `#f5f0e8` (not `#1a1712`).
- Title stays `#1a1712`; body copy `text-white/55` → `text-[#7a7060]`.
- Pagination dot inactive `bg-white/[0.18]` → `bg-[#cfc7b8]`; active stays coral.
- Skip link text → `text-[#7a7060]`.
- Add top padding so content clears the new fixed top nav.

### 3. Art-band behind step titles → app artwork (no saffron fill, no black gradient)

File: `src/pages/onboarding/stages/v8/ShellV8.tsx`
- Replace the solid `bg-[#1a1712]` art band in `ParchScreen` with an actual onboarding art image (reuse existing asset `src/assets/onboarding/usp-sunrise-engraved.jpg` — same engraved nature-true art family already used in app-intro and aligned with the Active Calm imagery memory).
- Image set as `object-cover` filling the band; subtle parchment tint overlay (`bg-[#f5f0e8]/25`) for cohesion with the page body.
- Bottom edge fades from `transparent` → `#f5f0e8` (existing gradient) so the band reads as woven into the parchment, not as a separate black strip.
- Eyebrow (`Step 1 of 3`) and title sit over a small bottom-anchored scrim (`bg-gradient-to-t from-[#f5f0e8] via-[#f5f0e8]/85 to-transparent`) so the type stays charcoal `#1a1712` and remains readable without any dark band or saffron fill.
- Add top padding so the band sits below the new fixed top nav.

This automatically updates all v8 step pages: `leadership-context`, `cognitive-load`, `protect-goals`, `brief-prefs`, `permissions`.

### 4. Replace green selection states with palette colors

Green is not in the palette. Selected states move to ink/charcoal (already used elsewhere in the v8 flow).

File: `src/pages/onboarding/stages/v8/StagePermissions.tsx`
- Selected toggle card border/bg: `#1a6b4a/40` and `#1a6b4a/[0.04]` → `#1a1712/35` and `#1a1712/[0.04]`.
- Toggle thumb "on" track stays coral `#e8714a` (in-palette CTA accent).

File: `src/pages/onboarding/stages/v8/StageDone.tsx`
- Green success circle (`bg-[#e1f0e8]`, stroke `#1a6b4a`, border `#1a6b4a/20`) → cream `bg-[#ede8dc]` with stroke `#1a1712` and border `#1a1712/15`.
- Tiny green dot in the "Mind Module" pill (`bg-[#2bc075]`) → saffron `#ba7517`.
- Inside the dark info card, the green row icon tint (`rgba(26,107,74,…)`) → saffron tint (`rgba(186,117,23,…)`); coral and amber rows stay.

### 5. Sweep of other onboarding pages

- `StageProtectGoals.tsx` — already uses saffron `#ba7517` for selected state. No change.
- `StageCognitiveLoad.tsx`, `StageBriefPrefs.tsx`, `StageLeadershipContext.tsx` — selection styling already on ink `#1a1712` / saffron; no green present. No change.
- Legacy questionnaire stages (`Stage2Identity` … `Stage8Results`, `Stage7ContextConnection`) — outside the revised v8 flow path; not touched. Verified no green leaks into the v8 journey.

## Acceptance

- All v8 pages show the fixed top nav with back button (left) and Mind Module brand lockup (right). `/onboarding/done` still has no back.
- The 4 app-intro carousel slides render on parchment with charcoal/taupe text.
- The step header band on every v8 step page uses app artwork (engraved nature-true image) fading into parchment — no solid black band, no saffron fill.
- No green appears anywhere in the v8 onboarding journey; selection states use ink or saffron from the app palette.
- No flow, route, or business-logic changes.