

# Client-Side JIT Priority Implementation

## Overview
Three files need updates to complete the JIT-takes-priority behavior. The server already returns `jitPriority: boolean` in the mastery plan response.

## Changes

### 1. `src/components/home/DailyRitual.tsx`
- Add `jitPriority?: boolean` to `DailyRitualProps`
- Add `jitPriority` to `MasteryPlanResponse` interface
- When `jitPriority` is true AND the component receives it as a prop:
  - Replace the full carousel with a collapsed view: show header + plan label + status message ("Your Time-of-Day plan is available after your event")
  - Add a manual "Show plan" toggle (using Collapsible) so the user can still expand if they want
- Pass `jitPriority` from plan response up via `onPreEventPlanReady` callback (extend to also relay `jitPriority`) OR add a separate callback/state

### 2. `src/pages/ExecutiveHome.tsx`
- Add `jitPriority` to local state, populated from DailyRitual's plan response
- Modify `DailyRitualProps` or add a new callback `onJitPriorityChange` to receive the flag
- When `jitPriority` is true:
  - Render JitCarousel ABOVE the ToD section (swap order)
  - Pass `jitPriority={true}` to `DailyRitual` to trigger collapse mode
- Pass JIT event info to `StrategicIntentionCard` for Compass reorientation

### 3. `src/components/home/StrategicIntentionCard.tsx`
- Accept optional `jitEvent?: { title: string; minutesUntil: number }` prop
- When `jitEvent` is provided, show an additional JIT-context banner below the context line:
  - Italic event title + time pill (e.g., "*Board Meeting* in 38 minutes")
  - This reorients the Compass toward the immediate event without changing the underlying brief data (the server-side Compass already factors JIT when available)

### 4. `src/hooks/useOuterReadiness.ts` — no changes needed
The Compass data already comes from the server which now includes JIT-aware context when applicable.

## Data Flow
```text
generate-mastery-plan (server)
  └─ returns { ..., preEventPlan, jitPriority }
       │
DailyRitual (loads plan)
  ├─ onPreEventPlanReady(preEventPlan)
  ├─ onJitPriorityChange(jitPriority)  ← new callback
  └─ self-collapses when jitPriority prop is true
       │
ExecutiveHome
  ├─ jitPriority state
  ├─ Reorders: JitCarousel above DailyRitual when active
  ├─ Passes jitEvent to StrategicIntentionCard
  └─ Passes jitPriority to DailyRitual
       │
StrategicIntentionCard
  └─ Shows JIT event context banner when jitEvent provided
```

## Implementation Details

**DailyRitual collapse mode:**
- Uses `Collapsible` from radix (already in project)
- Collapsed state shows: period label, "X of Y completed" status, and a muted message: "Preparing for *{eventTitle}* — your Time-of-Day plan is available after"
- Toggle button: "Show plan" / "Hide plan" with ChevronDown rotation

**ExecutiveHome reorder:**
- When `jitPriority`, render JitCarousel div before the DailyRitual div inside the `data-tour="daily-plan"` wrapper
- Extract `preEventPlan.eventTitle` and `preEventPlan.minutesUntil` to pass as `jitEvent` to StrategicIntentionCard

**StrategicIntentionCard JIT banner:**
- Rendered between context line and coach insight label
- Small pill-style element: `"*{title}* in {minutes} min — your sequence is ready"`
- Uses existing `TextWithEventEmphasis` for italic event title formatting

**DEV_MODE compatibility:**
- `jitPriority` flows through the same plan response regardless of auth mode — no special handling needed since DailyRitual already supports DEV_MODE for plan loading

## Post-Implementation Audit
After changes, verify:
1. Edge function returns `jitPriority: true` when preEventPlan exists in touch_2 window
2. Homepage renders JIT above ToD when jitPriority is active
3. ToD carousel collapses with expand toggle
4. Compass shows JIT event context
5. Works in both authenticated and DEV_MODE
6. When no JIT event: layout unchanged, DailyRitual fully visible, no JIT banner on Compass

