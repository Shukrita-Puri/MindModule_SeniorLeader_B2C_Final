

# Homepage Layout Restructure – Tabs + Vertical Practice List

## Overview
Replace the stacked vertical card layout with a three-tab navigation. Each tab shows one card. The practice carousel in the Action tab becomes a vertical list. No logic, data, or component internals change.

## Files Changed

### 1. `src/pages/ExecutiveHome.tsx` – Major restructure

**Remove:**
- The three stacked sections (TodayStateCard, StrategicIntentionCard, DailyRitual) with dashed connectors between them
- The StepLabel + MetricInfoModal header for the Action section (this moves into DailyRitual or stays inside the tab)

**Add:**
- `const [activeTab, setActiveTab] = useState<'state' | 'compass' | 'action'>('state')`
- A sticky tab bar (`Tabs` / `TabsList` / `TabsTrigger` from existing `src/components/ui/tabs.tsx`) positioned directly below the hero section
- Three tab triggers: **State**, **Compass**, **Action**
- Tab content area using CSS `display: none` / `display: block` (NOT conditional unmount) to preserve component state and avoid re-fetching

**Layout structure:**
```text
Hero (slightly taller: pb-20 instead of pb-16)
├── Sticky Tab Bar (sticky top-0 z-30, bg-background/95 backdrop-blur)
└── Tab Content (px-4 max-w-lg mx-auto)
    ├── [State]   → TodayStateCard (rendered always, hidden when inactive)
    ├── [Compass]  → StrategicIntentionCard (rendered always, hidden when inactive)
    └── [Action]   → StepLabel C + MetricInfoModal + JIT/DailyRitual (rendered always, hidden when inactive)
```

**Key implementation detail – no unmounting:**
All three content divs render simultaneously. Active tab: `style={{ display: 'block' }}`. Inactive tabs: `style={{ display: 'none' }}`. This preserves React state, query cache, and carousel API references.

**JIT logic preserved:**
The existing `jitPriority` conditional rendering (JitCarousel above/below DailyRitual) stays identical inside the Action tab content div.

**Pass jitEvent to Compass:**
Same as current – `StrategicIntentionCard` still receives `jitEvent` prop regardless of active tab.

### 2. `src/components/home/DailyRitual.tsx` – Carousel → Vertical List

**Change only the carousel rendering section (lines ~646-760):**

- Remove `<Carousel>`, `<CarouselContent>`, `<CarouselItem>` wrapper
- Remove carousel API state (`carouselApi`, `currentSlide`, `slideCount`, `isDragging`)
- Remove pagination dots
- Remove the right-edge gradient fade
- Replace with a vertical `<div className="flex flex-col gap-3 px-4 max-w-lg mx-auto">` containing the same card markup

**Each practice card becomes a full-width row:**
- Same internal structure (thumbnail left, content right, completed overlay, step badge, reasoning line, duration)
- Change from `basis-[80%]` constrained width to `w-full`
- Card height stays `h-44` (same as current carousel cards)
- The chevron connector `›` between cards is removed (vertical stacking replaces it)
- `mr-4` on last card removed (no longer needed)

**Preserved exactly:**
- `navigateToPractice()`, `handleMarkComplete()`, `handleStartRitual()`, `handleContinueRitual()`, `handleRestartRitual()` – zero changes
- Completion state tracking, confetti, toast
- Progress tracker header (label, step count, completed count)
- Plan brief / calendar message display
- Check-in prompt banner
- PostEventReflection component
- JIT collapsed state (`isCollapsedByJit`) with expand toggle
- Start/Continue/Completed buttons at bottom

### 3. `src/components/home/TodayStateCard.tsx` – No changes
Card renders identically. The StepLabel "A" header stays inside the card.

### 4. `src/components/home/StrategicIntentionCard.tsx` – No changes
Card renders identically. The StepLabel "B" header stays inside the card.

## Tab Bar Styling

Using the existing `Tabs` component from `src/components/ui/tabs.tsx`:
- `TabsList`: full-width, `bg-background/95 backdrop-blur-md`, sticky
- `TabsTrigger`: text-only labels ("State", "Compass", "Action"), active state uses existing `data-[state=active]` styling with primary underline
- Custom className on TabsList: `w-full grid grid-cols-3 h-12 bg-background/95 backdrop-blur-md border-b border-border/30 rounded-none`
- Since we use `display:none` instead of Radix TabsContent (to prevent unmounting), the tab triggers just set `activeTab` state via `onValueChange`

## What Is NOT Touched
- No edge functions, server logic, scoring, or data fetching
- No card component internals (TodayStateCard, StrategicIntentionCard internal markup)
- No copy, text strings, or context statements
- No hero image logic
- No navigation outside ExecutiveHome
- No database, auth, onboarding, payments
- No info modal behavior

## Verification Checklist
- Hero image displays correctly with slightly more height
- Tab bar appears immediately below hero, sticky on scroll
- Default tab on load is State
- All three tabs switch without data re-fetch
- State card content identical to before
- Compass card content identical to before
- Action tab shows vertical practice list with all cards
- Start/Continue Sequence button works
- JIT plan surfaces correctly in Action tab
- No horizontal scroll in practice section
- No console errors on tab switch

