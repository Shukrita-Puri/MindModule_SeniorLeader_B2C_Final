# Onboarding background + V8 saffron sweep

## Context check (no change needed here)
The global gradient is already wired in `src/index.css` (`.bg-app-surface` applied to `body`) and every in-app page wrapper (`ExecutiveHome`, `PlanPage`, `Profile`, `DailyCheckIn`, `CheckInDetail`, `Insights`, `Refer`, `Privacy`, etc.) already uses `bg-transparent` on its outer container. RecalibrateMode also reads from `body` now. If the in-app pages still look unchanged, that's the published build (`app.mindmodule.me`) — re-publish picks them up. No further file changes needed for that part.

## 1. `/onboarding/app-intro` background → Recalibrate gradient
`src/pages/onboarding/stages/StageUSPIntro.tsx` is full-bleed parchment (`bg-[#f5f0e8]`) with hero-image fades that also land on `#f5f0e8`.
- Outer wrapper: `bg-[#f5f0e8]` → `bg-app-surface`.
- Hero image: keep the engraved image and its layout exactly. Replace the parchment scrim/fade overlays (`bg-[#f5f0e8]/20`, `to-[#f5f0e8]` gradient) with transparent so the image blends into the new app gradient instead of clashing with leftover parchment.
- All copy, slide count, dot count, layout, CTA position, "Skip tour" unchanged.

## 2. V8 onboarding orange → Saffron token
Replace the legacy coral orange (`#e8714a` / hover `#c55a35`) with the project's Saffron token (`--saffron: 15 100% 68%` → `bg-saffron` / `text-saffron` / `hover:bg-saffron/90`). Pure color swap — no copy, no layout, no logic change.

Files and roles:
- `src/pages/onboarding/stages/v8/ShellV8.tsx` — `PrimaryCTA` `tone="coral"` branch.
- `src/pages/onboarding/stages/StageUSPIntro.tsx` — primary CTA button + active pagination dot.
- `src/pages/onboarding/stages/v8/StageDone.tsx` — CTA + error pill.
- `src/pages/onboarding/stages/v8/StageBriefPrefs.tsx` — error pill.
- `src/pages/onboarding/stages/v8/StageCognitiveLoad.tsx` — error text.
- `src/pages/onboarding/stages/v8/StageLeadershipContext.tsx` — error text (2 spots).
- `src/pages/onboarding/stages/v8/StagePermissions.tsx` — switch "on" fill, "Required" label highlights, error pills, selected-row border.
- `src/pages/onboarding/stages/v8/StageProtectGoals.tsx` — limit-warning text, error text.

Mapping rules:
- `bg-[#e8714a]` → `bg-saffron` (text stays white via existing `text-white` / Saffron's white foreground).
- `hover:bg-[#c55a35]` → `hover:bg-saffron/90`.
- `text-[#e8714a]` → `text-saffron`.
- `bg-[#e8714a]/[0.08]` → `bg-saffron/10`.
- `border-[#e8714a]/25` (and `/50`) → `border-saffron/25` (and `/50`).

## Explicitly NOT touched
- `bg-app-surface` definition and any in-app page wrappers.
- Onboarding copy, slide order, layouts, hero artwork, dot count, skip behaviour.
- `--saffron` token value or any other CTA elsewhere in the app.
- All neutral parchment text colours (`#1a1712`, `#7a7060`, `#cfc7b8`) stay as-is.

## Verification
After build, in preview: navigate to `/onboarding/app-intro` (gradient behind hero + saffron CTA/active dot), then walk through `/onboarding/leadership-context`, `/cognitive-load`, `/brief-prefs`, `/protect-goals`, `/permissions`, `/done` and confirm every CTA + active toggle + warning text reads as Saffron, not coral orange. Re-publish so `app.mindmodule.me` shows the new in-app gradient.
