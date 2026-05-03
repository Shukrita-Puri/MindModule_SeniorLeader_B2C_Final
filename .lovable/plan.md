## Goal

Make Step 1 (Assessment + Detail), Step 2 (Brief), and Step 3 (Plan) look like one flow:
1. Same hero video at the top of all pages (the one already used on `/executive-home`).
2. Remove the large centered `<h1>` from each page and present that title as the **eyebrow** above the page's card (same style as the brief card eyebrow).

Pure presentational change. No routing, hooks, scoring, or backend touched.

---

## What changes visually

```text
 ┌──────────────────────────────────────────┐
 │       Hero video (tier + time of day)    │  ← same on all 3 steps
 │                                          │
 │   ●─────○─────○                          │  ← TodayStepper (unchanged)
 │  Step1 Step2 Step3                       │
 │                                          │
 │  ┌────────────────────────────────────┐  │
 │  │ PERFORMANCE READINESS ASSESSMENT   │  │ ← eyebrow (was the H1)
 │  │ Mental Energy State                │  │ ← existing subline
 │  │  …existing card body…              │  │
 │  └────────────────────────────────────┘  │
 └──────────────────────────────────────────┘
```

Eyebrows per step (taken verbatim from each page's current H1):
- Step 1 (`/daily-check-in`) → `PERFORMANCE READINESS ASSESSMENT`
- Step 1 detail (`/check-in-detail`) → `PERFORMANCE READINESS ASSESSMENT`
- Step 2 (`/executive-home`) → `PERFORMANCE READINESS BRIEF`
- Step 3 (`/plan`) → `MENTAL PERFORMANCE PLAN`

---

## Implementation (1 new file, 4 edits)

### 1. NEW `src/components/today/TodayHero.tsx`

Extract the hero block already in `ExecutiveHome.tsx` (lines ~327–355) into a shared, presentational component:

- Picks `heroEnergyTier` + `heroDivergenceMode` from `useOuterReadiness()` (read-only — same hook ExecutiveHome already calls; cached via React Query so other pages reuse the cache, no extra network call when the cache is warm).
- Computes `heroVideoUrl` exactly as ExecutiveHome does today.
- Renders gradient + `<video autoplay muted loop playsInline>` + bottom fade overlay. No greeting text, no CTAs.
- Optional prop `heightClass` (default `h-[180px]`) so Step 1/3 can render a slightly shorter version than Step 2 if needed (Step 2 keeps current full size by passing its existing wrapper).

Zero side-effects beyond what ExecutiveHome already does.

### 2. EDIT `src/pages/ExecutiveHome.tsx`

- Replace the inline hero block + `getGreeting()` H1 with `<TodayHero />` (keep the existing header bar with `SidebarDiscoveryPulse` on top of it, same layering as today).
- Remove the `Ready, {firstName}` H1. Add an eyebrow line **above** `<PerformanceReadinessBrief />` reading `PERFORMANCE READINESS BRIEF` using the same uppercase/tracked style the brief card already uses.
- Keep `TodayStepper current={2}`, `useOuterReadiness`, brief tracking, all hooks untouched.

### 3. EDIT `src/pages/DailyCheckIn.tsx`

- Insert `<TodayHero />` directly under the header (above `<TodayStepper current={1} />`).
- Remove the centered `<h1>Performance Readiness Assessment</h1>` block (lines ~406–413). Keep it as `sr-only` for tour selectors / a11y.
- Add eyebrow row above the radiogroup card:
  - `PERFORMANCE READINESS ASSESSMENT` (uppercase, tracked, muted) on top
  - `MENTAL ENERGY STATE` underneath (already exists — just relocated as the subline below the eyebrow).

No changes to outcomes, save logic, tour, or navigation.

### 4. EDIT `src/pages/CheckInDetail.tsx`

- Insert `<TodayHero />` under the header.
- Remove the centered H1 block (lines ~158–165).
- Place eyebrow `PERFORMANCE READINESS ASSESSMENT` + subline `MENTAL PERFORMANCE SIGNALS` directly above the glass slider card (or as the card's first line).

Sliders, save handler, sticky CTA — untouched.

### 5. EDIT `src/pages/PlanPage.tsx`

- Insert `<TodayHero />` under the header (above `<TodayStepper current={3} />`).
- Remove the centered `<h1>Mental Performance Plan</h1>` + descriptive `<p>`.
- Add an eyebrow `MENTAL PERFORMANCE PLAN` + the existing description as a subline directly above `<TodayThreePriorities />`.

`TodayThreePriorities`, `DailyRitual`, sidebar, tour — untouched.

---

## Eyebrow markup (single shared style)

```tsx
<div className="px-4 max-w-lg mx-auto pt-1 pb-3 text-center">
  <p className="text-[11px] tracking-[0.18em] uppercase text-muted-foreground/70 font-body">
    {eyebrow}
  </p>
  {subline && (
    <p className="text-sm text-muted-foreground mt-1 font-body">{subline}</p>
  )}
</div>
```

Reused on all 4 page wraps so the visual rhythm matches the brief card today.

---

## Safety guarantees

- No route, guard, RLS, edge function, scoring, or hook changes.
- `useOuterReadiness` is already called by `/executive-home`; using it on Step 1 / Step 3 hits the same React Query cache — no new write paths.
- Hero is rendered behind the existing header (z-layering preserved).
- All existing buttons, tour selectors (`data-tour="check-in-carousel"`, `data-tour="today-state"`, `data-tour="daily-plan"`), save flows, and CheckInDetail tests remain intact (H1 preserved as `sr-only`).
- Stepper unchanged.

---

## Files touched

```text
NEW  src/components/today/TodayHero.tsx
EDIT src/pages/ExecutiveHome.tsx     (use TodayHero, drop greeting H1, add eyebrow)
EDIT src/pages/DailyCheckIn.tsx      (insert TodayHero, demote H1 to sr-only, eyebrow)
EDIT src/pages/CheckInDetail.tsx     (insert TodayHero, demote H1 to sr-only, eyebrow)
EDIT src/pages/PlanPage.tsx          (insert TodayHero, drop H1, eyebrow)
```

No new dependencies, no migrations, no edge function deploys.