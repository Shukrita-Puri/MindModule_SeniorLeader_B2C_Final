

# Typography Audit & Simplification: All Remaining Pages

## Problem
The initial simplification only covered `DecisionReadinessBrief.tsx`, `ExecutiveHome.tsx`, and `index.css`. Across 44+ component files and 15+ page files, there are still **600+ instances** of sub-14px font sizes (`text-[9px]` through `text-[13px]`). This audit covers PLAN, RESET (Recalibrate), LEARN (Insights), and all supporting components.

## Rules Applied
- **Body/value text**: anything meant to be read → `text-sm` (14px) minimum
- **Uppercase labels** with wide tracking: `text-xs` (12px) acceptable — reads like 14px
- **Inline annotations** (source tags like "· From coach"): `text-[11px]` minimum
- **Bottom nav labels**: `text-[10px]` acceptable — standard iOS tab bar convention
- **Badges/pills** (PRO, Done, Step N): `text-xs` (12px) minimum

## Files & Changes

### PLAN Pages

| File | Current | Element | New |
|------|---------|---------|-----|
| `src/pages/PlanPage.tsx` | `text-[13px]` | Page subtitle | `text-sm` (14px) |
| `src/components/home/TodayThreePriorities.tsx` | `text-[11px]` ×3 | Time label, why line, count indicator | `text-xs` (12px) |
| | `text-[9px]` ×2 | Priority pill, Step indicator | `text-xs` (12px) |
| | `text-[10px]` ×2 | Type label, practice reasoning | `text-xs` (12px) |
| | `text-[13px]` | Practice title | `text-sm` (14px) |
| `src/components/home/DailyRitual.tsx` | `text-[13px]` ×2 | Plan brief text | `text-sm` (14px) |

### RESET (Recalibrate) Pages

| File | Current | Element | New |
|------|---------|---------|-----|
| `src/pages/RecalibrateMode.tsx` | `text-[11px]` | Tool card description | `text-xs` (12px) |
| `src/pages/recalibrate/PauseOutcomePage.tsx` | `text-[13px]` ×4 | Page subtitle, protocol descriptions | `text-sm` (14px) |
| | `text-[10px]` ×2 | Steps count | `text-xs` (12px) |
| `src/pages/recalibrate/PresenceOutcomePage.tsx` | `text-[13px]` ×4 | Page subtitle, protocol descriptions | `text-sm` (14px) |
| | `text-[10px]` ×2 | Steps count | `text-xs` (12px) |
| `src/pages/recalibrate/PowerUpOutcomePage.tsx` | `text-[13px]` ×4 | Page subtitle, protocol descriptions | `text-sm` (14px) |
| | `text-[10px]` ×2 | Steps count | `text-xs` (12px) |

### LEARN (Insights) Page

| File | Current | Element | New |
|------|---------|---------|-----|
| `src/pages/Insights.tsx` | `text-[10px]` ×4 | Stat labels, tag pills, date text | `text-xs` (12px) |
| `src/components/insights/PerformanceRhythmCard.tsx` | `text-[9px]` | Day label | `text-xs` (12px) |
| | `text-[10px]` ×3 | Row labels, scroll hint, data source | `text-xs` (12px) |
| | `text-[11px]` ×4 | Section headers, date number | `text-xs` (12px) |
| `src/components/insights/CalendarStateCorrelations.tsx` | `text-[10px]` ×2 | Occurrence count, data source | `text-xs` (12px) |
| `src/components/insights/EnergyRhythmCurve.tsx` | `text-[13px]` ×2 | Empty state, window labels | `text-sm` (14px) |
| `src/components/insights/LockedInsightSection.tsx` | `text-[10px]` ×3 | PRO badge, feature list | `text-xs` (12px) |

### Check-In Pages

| File | Current | Element | New |
|------|---------|---------|-----|
| `src/pages/DailyCheckIn.tsx` | `text-[13px]` ×3 | Subtitle, instruction, outcome text | `text-sm` (14px) |
| `src/pages/CheckInDetail.tsx` | `text-[13px]` | Subtitle | `text-sm` (14px) |

### Coach

| File | Current | Element | New |
|------|---------|---------|-----|
| `src/components/coach/CoachSplitView.tsx` | `text-[12px]` | Subtitle | `text-sm` (14px) |
| | `text-[10px]` ×2 | Disclaimer | `text-xs` (12px) |
| `src/components/coach/CoachSurfaceMessage.tsx` | `text-[12px]` | Message text | `text-sm` (14px) |

### JIT & Home Components

| File | Current | Element | New |
|------|---------|---------|-----|
| `src/components/home/JitCarousel.tsx` | `text-[11px]` ×2 | JIT label, step count | `text-xs` (12px) |
| | `text-[10px]` ×3 | Time pill, type pill, HRV note | `text-xs` (12px) |
| | `text-[9px]` ×2 | Done badge, step label | `text-xs` (12px) |
| `src/components/home/PostEventReflection.tsx` | `text-[10px]` | Helper text | `text-xs` (12px) |
| `src/components/home/GreetingBanner.tsx` | `text-[13px]` | Subtitle | `text-sm` (14px) |

### Navigation & Misc

| File | Current | Element | New |
|------|---------|---------|-----|
| `src/components/navigation/LeftSidebar.tsx` | `text-[10px]` | "Executive Edition" | `text-xs` (12px) |
| `src/components/navigation/RecentActivity.tsx` | `text-[10px]` | Group date label | `text-xs` (12px) |
| `src/components/navigation/FloatingPillNav.tsx` | `text-[9px]` | Tab labels | Keep — iOS tab bar convention |
| `src/components/chat/WisdomCard.tsx` | `text-[10px]` | Context line | `text-xs` (12px) |
| `src/pages/Front.tsx` | `text-[9px]`, `text-[10px]` ×2 | Edition label, privacy/AI links | `text-xs` (12px) |

### Onboarding (Results)

| File | Current | Element | New |
|------|---------|---------|-----|
| `src/pages/onboarding/stages/Stage8Results.tsx` | `text-[13px]` ×2 | Dimension labels/values | `text-sm` (14px) |
| | `text-[10px]`, `text-[11px]`, `text-[9px]` | Tooltip button, skill labels, skill chips | `text-xs` (12px) |
| | `text-[12px]` ×2 | CTA button, skill pills | `text-sm` (14px) |

### Micro Practice Player

| File | Current | Element | New |
|------|---------|---------|-----|
| `src/pages/MicroPracticePlayerCards.tsx` | `text-[13px]` | Card subtitle | `text-sm` (14px) |

### Simulation Components

| File | Current | Element | New |
|------|---------|---------|-----|
| Various simulation components | `text-[10px]`–`text-[12px]` | Labels, annotations | `text-xs`–`text-sm` per rule |

## Exceptions (No Change)
- `FloatingPillNav.tsx` — `text-[9px]` tab labels follow iOS native convention
- `DecisionReadinessBrief.tsx` — already fixed in prior pass
- `src/index.css` — already fixed in prior pass

## Scope
~30 files, ~600 class replacements. No logic, database, or edge function changes. Pure CSS class swaps.

