## Goal
Make it obvious that Step 3 (Plan) is the next tap after the Brief, without adding a redundant "Tap to generate plan" link below the brief card.

## Approach
Remove the standalone `GenerateTodaysPlanLink` from the Brief page and instead draw the user's eye to the **Step 3 dot in the TodayStepper** with a quiet pulsing affordance + an animated dotted connector flowing from Step 2 → Step 3.

This keeps the navigation model consistent (the stepper is the canonical way to move between Assessment → Brief → Plan) and removes the duplicated CTA.

## Changes (UI only, no behavior changes)

### 1. `src/pages/ExecutiveHome.tsx`
- Remove the `GenerateTodaysPlanLink` block (and its import) that currently renders below the brief once `briefCtaReady` is true.
- Pass a new prop to `TodayStepper`, e.g. `nextHint={3}`, only when `briefCtaReady` is true, so the stepper knows to highlight Step 3.

### 2. `src/components/today/TodayStepper.tsx`
- Accept optional `nextHint?: 1 | 2 | 3` prop.
- When `nextHint === 3` (and Step 3 is not the current step):
  - Render the connector line between Step 2 and Step 3 as a **dashed/dotted line** with a subtle left-to-right shimmer animation (CSS `background-size` + `background-position` keyframes on a repeating linear-gradient).
  - Add a soft **breathing pulse ring** around the Step 3 dot (existing `animate-breathe-arrow` style or a new `animate-pulse-ring` using Tailwind `animate-ping` on an absolutely-positioned ring + the dot itself unchanged). Use saffron at low opacity to stay within the executive aesthetic.
  - Step 3 label color shifts from muted to `text-foreground` so it reads as "next".
- All other states (no hint, past, active) render exactly as today.

### 3. No changes to:
- Routing, navigation handlers, `briefCtaReady` logic, or the Plan page itself.
- The Assessment page or Check-in detail page stepper rendering (they pass `current={1}` with no hint, so behavior is unchanged).
- The bottom floating nav.

## Visual spec
- Dotted connector: 1px dashed line, `hsl(var(--saffron) / 0.5)`, 6px dash / 4px gap, shimmer cycle ~2.4s ease-in-out.
- Step 3 pulse ring: 2px ring, saffron at 40% opacity, scale 1 → 1.35, opacity 0.6 → 0, 1.8s loop.
- Respects `prefers-reduced-motion`: animations disabled, dotted line stays static, ring becomes a steady soft halo.

## Result
- Brief page no longer shows the redundant "TAP TO GENERATE TODAY'S PLAN" link.
- Once the brief is ready, the eye is drawn up to Step 3 via the shimmering dotted line + pulsing dot.
- Tapping Step 3 (already wired) navigates to `/plan`.
