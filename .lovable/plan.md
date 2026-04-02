

# Title + Hero Height Changes

## Changes

### 1. Card Titles — Remove step letters, simplify to just the subtitle text

**`src/components/home/TodayStateCard.tsx` (line 76):**
- Change `<StepLabel letter="A" title="Your State" subtitle="Decision Readiness" />` → just render "Decision Readiness" as a heading (no StepLabel)

**`src/components/home/StrategicIntentionCard.tsx` (line 60):**
- Change `<StepLabel letter="B" title="Your Compass" subtitle="Outer Readiness Brief" />` → just render "Outer Readiness Brief"

**`src/pages/ExecutiveHome.tsx` (line 269):**
- Change `<StepLabel letter="C" title="Your Action" subtitle="Performance Readiness Plan" />` → just render "Performance Readiness Plan"

Each will become a simple `<h2>` with matching styling (e.g. `text-lg font-headline text-foreground`), replacing the two-line StepLabel component. The MetricInfoModal (ⓘ) stays next to each title.

### 2. Hero Visual — Extend height so it peeks behind tabs

**`src/pages/ExecutiveHome.tsx` (line 210):**
- Increase greeting section bottom padding from `pb-20` to `pb-32` — this pushes the hero visual taller so it extends behind the sticky tab bar, creating a layered visual effect where the dynamic gradient/video is visible behind the semi-transparent tab bar.

The tab bar already has `bg-background/95 backdrop-blur-md`, so the hero visual will subtly show through.

### Files touched
- `src/components/home/TodayStateCard.tsx` — 1 line
- `src/components/home/StrategicIntentionCard.tsx` — 1 line
- `src/pages/ExecutiveHome.tsx` — 2 lines

No logic, data, or component behavior changes.

