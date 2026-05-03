## Problem

`FloatingPillNav` (the bottom pill) keeps the same dark pill chrome everywhere it's mounted, but the **Today** tab's "active" highlight (`bg-white/15` + full-opacity label) only lights up when `pathname === '/executive-home'`. On the Assessment (`/daily-check-in`) and Plan (`/plan`) pages no tab matches, so the pill *looks* different — there's no active chip — and the user reads that as "the nav changed colour".

We want: across all three Today-flow pages (Assessment, Brief, Plan) the pill renders identically and the **Today** tab is the highlighted one. No routing, no side-panel changes.

## Change (one file)

`src/components/navigation/FloatingPillNav.tsx`

Add a small set of "extra paths" that count as the Today tab being active, so the highlight follows the user across the stepper:

```ts
const TODAY_FLOW_PATHS = ['/executive-home', '/daily-check-in', '/plan', '/check-in-detail'];

const isTodayFlow = TODAY_FLOW_PATHS.some(
  (p) => pathname === p || pathname.startsWith(p + '/'),
);

// inside the map:
const isActive =
  tab.path === '/executive-home'
    ? isTodayFlow
    : pathname === tab.path || pathname.startsWith(tab.path + '/');
```

That's the entire behavioural change. Tapping Today still navigates to `/executive-home` (its existing `path`), so routing is untouched. Reset and Insight tabs keep their current matching rules.

## Why this also fixes the "colour changing" perception

The pill container styling (`bg-black/70 backdrop-blur-2xl`, border, padding, radius) is already constant — there is no per-route override anywhere. The visual delta the user is seeing is purely the missing active-chip on Assessment/Plan. Once Today stays highlighted on those routes, the pill looks identical to the Brief page.

No CSS edits needed; no other components touched.

## Out of scope (explicit)

- No changes to `App.tsx` mount logic for the pill.
- No changes to `TodayStepper`, side panel, routes, guards, or page chrome.
- Reset / Insight tabs unchanged.
- No accessibility changes beyond the existing active state, which already drives the visual highlight.

## Files touched

- `src/components/navigation/FloatingPillNav.tsx` — only the `isActive` derivation.
