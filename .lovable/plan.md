## Goal

Two purely-presentational fixes across the Today flow (Assessment / Detail / Brief / Plan). No logic, scoring, routing, hooks, save handlers, tour selectors, or button behaviour change.

---

## 1. Hero layering — restore Brief-page behaviour on every step

Today the header sits **above** `<TodayHero />` in the DOM on Assessment / Detail / Plan, so it consumes vertical space and pushes the hero down. On the Brief page the hero sits at the very top and the sidebar pulse button floats over it. We replicate that on all four pages.

### Pattern applied identically to `ExecutiveHome.tsx`, `DailyCheckIn.tsx`, `CheckInDetail.tsx`, `PlanPage.tsx`

```text
[ SidebarInset ] (relative)
  [ TodayHero ]               ← first child, full-width, flush to top
  [ header ]                  ← absolute top-0 left-0 right-0 z-40
    SidebarDiscoveryPulse     ← floats on top of the hero, same as Brief today
  [ TodayStepper ]
  [ content / cards ]
```

Concrete change per page: render `<TodayHero />` as the first child of `<SidebarInset>`, then render the existing header with `className="absolute top-0 left-0 right-0 z-40 …"` keeping its current safe-area top padding and inner content. Hero height, video logic, gradients, and `useOuterReadiness` calls are untouched.

ExecutiveHome already had this layering historically; the recent edit reordered header → hero. We restore hero-first + overlayed header so all four pages match the Brief behaviour exactly.

---

## 2. White card packaging (Assessment, Detail, Plan)

Wrap the content in the same white glass card the Brief uses, with the eyebrow inside the card top-left.

### Shared eyebrow row (inside card)
```tsx
<div className="flex items-baseline justify-between mb-4">
  <p className="text-[11px] tracking-[0.18em] uppercase text-muted-foreground/70 font-body">
    {eyebrow}
  </p>
  {rightSlot /* optional small subline like "Mental Energy State" */}
</div>
```

### Card surface (matches existing CheckInDetail glass card)
```tsx
<div className="relative overflow-hidden rounded-2xl p-5
  bg-white/65 backdrop-blur-[30px] backdrop-saturate-150
  border border-black/[0.08]
  shadow-[0_8px_32px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.9)]">
  …eyebrow row…
  …existing content…
</div>
```

### Step 1 — `DailyCheckIn.tsx`
- Remove the centered eyebrow block above the radiogroup.
- Wrap `<div role="radiogroup" data-tour="check-in-carousel">` (and the "Select your current state" instruction) in the white card.
- Inside the card, top-left: `PERFORMANCE READINESS ASSESSMENT` with `MENTAL ENERGY STATE` as a small subline.
- Outcomes data, save flow, sticky Confirm CTA, tour selectors — untouched.

### Step 1 detail — `CheckInDetail.tsx`
- The existing glass slider card stays. Move the eyebrow + `MENTAL PERFORMANCE SIGNALS` subline **inside** that card top-left; remove the centered text block above it.
- Sliders, save handler, sticky CTA — untouched.

### Step 3 — `PlanPage.tsx`
- Wrap `<TodayThreePriorities />` (and `DailyRitual` fallback) in the white card.
- Inside the card top-left: `MENTAL PERFORMANCE PLAN` with the existing "Your priorities mapped based on your brief and for your day" line as the subline.
- `TodayThreePriorities` props, completion logic, reflection deeplinks, tour — untouched.

### Step 2 — `ExecutiveHome.tsx`
- No card change (Brief owns its own card). Only the §1 hero layering fix applies. Greeting / brief content stay exactly where they are today.

---

## Files touched

```text
EDIT src/pages/ExecutiveHome.tsx     (header overlay; no card change)
EDIT src/pages/DailyCheckIn.tsx      (header overlay; wrap radiogroup in card with eyebrow inside)
EDIT src/pages/CheckInDetail.tsx     (header overlay; move eyebrow inside existing slider card)
EDIT src/pages/PlanPage.tsx          (header overlay; wrap priorities in card with eyebrow inside)
```

No new components, hooks, routes, migrations, or edge function deploys. `sr-only` H1s and all `data-tour` selectors preserved.
