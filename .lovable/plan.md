

# Typography Hierarchy Fix + Reset Studio Mobile Optimization

## Problems Identified

1. **No clear size hierarchy** – Page titles (22px), section headers (17px), and card titles (`text-lg` = 18px) are nearly the same size. Headlines don't feel prominent. "Reset Studio" at 22px looks insignificant.
2. **Reset Studio cards too large for mobile** – `aspect-square` images on 390px screen means each card is ~340px tall. User must scroll 3x screen heights to see all 3 tools.
3. **Remaining `text-lg`, `text-base`, `text-2xl`, `text-3xl` violations** across Profile, ConnectedData, GreetingBanner, insight cards, recalibrate outcome pages, SmartNudge, and others.

## Revised Typography Hierarchy (Mobile)

```text
Level 1 – Page Title:     28px  font-headline  font-semibold
Level 2 – Section Header: 20px  font-headline  font-medium
Level 3 – Card Title:     15px  font-body      font-medium
Level 4 – Body/Context:   13px  font-body      font-normal
Level 5 – Supporting:     12px  font-body
Level 6 – Label:          11px  uppercase tracking
```

Key change: Page titles go UP from 22px → 28px to create dominance. Card titles come DOWN from 18px → 15px. This creates clear visual separation at every level.

## Changes

### 1. RecalibrateMode.tsx – Reset Studio page
- Page title: `text-[22px]` → `text-[28px]` for mobile prominence
- Card images: `aspect-square` → `aspect-[4/3]` (shorter, mobile-native ratio)
- Card padding: `p-8` → `p-5` (tighter)
- Grid gap: `gap-8` → `gap-5`
- Container padding: `pt-8 px-6` → `pt-4 px-4`
- Hero padding: `py-8` → `py-6`
- Description: keep `text-sm` (14px) – correct for card body

### 2. All 3 Recalibrate Outcome Pages (Pause/Flow/Recharge)
- Page title h1: `text-[22px]` → `text-[28px]`
- Section header h2 ("Mindset Protocol"): keep `text-[17px]` → bump to `text-[20px]` for clear separation from card titles
- Card titles: `text-lg` (18px) → `text-[15px]` font-body
- Protocol description: `text-sm italic` → `text-[13px] font-body italic`
- Card image height: `h-48` → `h-36` (mobile-native)

### 3. GreetingBanner.tsx
- Greeting h1: `text-3xl` (30px) → `text-[28px]` (consistent page title)

### 4. Profile.tsx
- Page title: `text-xl` → `text-[28px]`
- User name h2: `text-2xl` → `text-[20px]`
- Avatar fallback: `text-2xl` → `text-xl` (fine for initials)
- Card titles ("Account Details", "Settings"): `text-lg` → `text-[15px]`

### 5. ConnectedData.tsx
- Page title: `text-xl` → `text-[28px]`

### 6. DailyCheckIn.tsx
- Page title: `text-[22px]` → `text-[28px]`

### 7. Insights components (EnergyRhythmCurve, WeeklyRhythmHeatmap, BaselineReferenceCard)
- Section titles: `text-base md:text-lg` → `text-[15px]`
- Body text: `text-base` → `text-[13px]`

### 8. SmartNudge.tsx + SmartNudgeNotification.tsx
- Titles: `text-base` → `text-[15px]`

### 9. LeftSidebar.tsx
- Brand name: `text-base` → `text-[15px]`

### 10. SoundscapePlayer.tsx
- Title on loading: `text-3xl` → `text-[28px]`
- Title on playing: `text-xl` → `text-[20px]`

### 11. MicroPracticePlayerCards.tsx
- Subtitle: `text-base` → `text-[13px]`

### 12. simulation/ScheduleFollowupModal.tsx
- Button text: `text-base` → `text-[15px]`

### 13. simulation/SessionContextCard.tsx
- Context text: `text-base` → `text-[13px]`

## Files Changed (18 files)

| File | Key change |
|------|-----------|
| RecalibrateMode.tsx | Title 28px, card images 4:3, tighter spacing |
| PauseOutcomePage.tsx | Title 28px, h2 20px, card titles 15px, images h-36 |
| PresenceOutcomePage.tsx | Same as Pause |
| PowerUpOutcomePage.tsx | Same as Pause |
| GreetingBanner.tsx | Title 28px |
| Profile.tsx | Title 28px, name 20px, card titles 15px |
| ConnectedData.tsx | Title 28px |
| DailyCheckIn.tsx | Title 28px |
| EnergyRhythmCurve.tsx | Section title 15px |
| WeeklyRhythmHeatmap.tsx | Section title 15px |
| BaselineReferenceCard.tsx | Text 15px |
| SmartNudge.tsx | Title 15px |
| SmartNudgeNotification.tsx | Title 15px |
| LeftSidebar.tsx | Brand 15px |
| SoundscapePlayer.tsx | Titles 28px/20px |
| MicroPracticePlayerCards.tsx | Subtitle 13px |
| ScheduleFollowupModal.tsx | Buttons 15px |
| SessionContextCard.tsx | Text 13px |

## What Does NOT Change
- Logic, data, routing, copy content
- Desktop scaling (all `sm:`/`md:` breakpoints preserved)
- Color palette, font families
- `font-headline` stays on all headlines; `font-body` on all functional text

