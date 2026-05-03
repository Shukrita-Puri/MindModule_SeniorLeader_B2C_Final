## Goal

Four small, isolated UI fixes across the Today flow (Assessment / Detail / Brief / Plan). No scoring, save handlers, routing, tour selectors, or CTA logic semantics change. Only what's listed below is touched.

---

## 1. Assessment (`DailyCheckIn.tsx`) — fit content + CTA inside the white card

Problem: The five state buttons + sticky `Confirm` CTA overflow on iOS (CTA gets pushed under the pill nav).

Fix (purely presentational + one tiny behaviour tweak the user explicitly asked for):

- **Auto-advance on selection**: clicking a state button now triggers `handleOutcomeSelect(outcome.value)` directly (the same function `handleConfirm` already calls). The state still updates visually first, then advances. This removes the need for the Confirm CTA on this page.
- Remove the sticky bottom CTA block (the fixed-position Confirm button) entirely. Removing the bottom bar also reclaims ~80px of vertical space, so all five state buttons + eyebrow + instruction sit comfortably inside the white card on a 375×812 iPhone viewport.
- Tighten the state buttons so they fit without the CTA being needed at all:
  - reduce `min-h-[58px]` → `min-h-[52px]`
  - reduce `w-[84%]` → `w-full` (card padding already provides the inset)
  - reduce vertical gap `gap-2.5` → `gap-2`
- Remove the centered "Select your current state" instruction line (redundant once the eyebrow lives inside the card and selection auto-advances).
- Keep the radiogroup `data-tour="check-in-carousel"`, ARIA roles, roving tabindex, keyboard handling, EngravedFill, accent colours and FirstSessionGuide hook untouched.

No change to `handleOutcomeSelect`, `saveCheckin`, cache-clearing, navigation target (`/check-in-detail`), or tour key handling.

---

## 2. CheckInDetail (`CheckInDetail.tsx`) — bring sticky CTA inside the white card

Move the existing `Continue to Today's Performance` button out of the fixed bottom bar and into the bottom of the existing glass card (still full-width, same colour, same disabled state, same `handleSave` call). Removes the iOS gap between the card and the floating CTA.

- Delete the `fixed left-0 right-0 z-30 …` wrapper.
- Render the same `<button>` as the last child inside the white card, with `mt-2` spacing.
- `pb-[calc(env(safe-area-inset-bottom,0px)+8.75rem)]` on the page can drop to `+5.75rem` since the bar is gone, leaving room for the FloatingPillNav.

No change to `handleSave`, `allThreeTouched` gating, slider logic, cache invalidation, or routing.

---

## 3. Greeting above the hero — visible on all 3 pages

Currently the greeting only exists on `ExecutiveHome` and is rendered as `sr-only`. The user wants a small visible greeting line at the very top of the hero, on Assessment / Brief / Plan.

Add a presentational `TodayGreeting` element rendered as the first child inside the `<div className="relative">` hero block (before `<TodayHero />`), absolutely positioned over the hero so it doesn't push layout:

```tsx
<div className="absolute top-[calc(env(safe-area-inset-top,0px)+0.85rem)] right-4 z-30 pointer-events-none">
  <p className="text-[12px] tracking-wide font-body text-white/85 drop-shadow-sm">
    {greeting}
  </p>
</div>
```

`greeting` is computed locally on each page using the same rotation rule already in `ExecutiveHome` (`Ready, {firstName}` etc.), reading `useAuth().user`. The header (sidebar pulse) stays at top-left; greeting sits at top-right so they don't collide.

No new shared component is required; same 3-line snippet duplicated on the four pages keeps it isolated and avoids touching `TodayHero` internals. (If preferred during implementation we extract to `TodayGreeting.tsx`, but the diff is identical.)

---

## 4. Brief page (`ExecutiveHome.tsx`) — remove duplicated eyebrow + match Assessment treatment

- Delete the centered `Performance Readiness Brief` paragraph block (lines 347–353 wrapper around the `<p>` + `sr-only` h1). The `sr-only` h1 with the greeting is preserved by moving it to a hidden `h1` inside the brief section.
- The Brief card itself (`PerformanceReadinessBrief`) already contains its own eyebrow internally, so this removes the duplication the user pointed out.

### Eyebrow font consistency (Brief vs Assessment)

Standardize the eyebrow row used inside the white card on Assessment, CheckInDetail, and Plan to match the Brief card's eyebrow exactly:

```tsx
<p className="text-[11px] tracking-[0.18em] uppercase text-muted-foreground/70 font-body">
  {EYEBROW}
</p>
```

This is already the class string in use; the only inconsistency is `Plan` page using `font-body` body weight without the same letter-spacing on its subline. Align by:

- On the Plan card: keep the eyebrow paragraph as above, change subline to `text-[12px] text-muted-foreground/80 font-body mt-1` (same family/treatment as Brief subline).
- On the Assessment card: drop the `Mental Energy State` right-side subline (it's redundant once the centered instruction is removed and the eyebrow is the only label).
- On CheckInDetail card: drop the `Mental Performance Signals` right-side subline for the same reason; eyebrow alone reads cleanly.

Result: every card across Assessment → Brief → Plan opens with one identically-styled eyebrow line at top-left.

---

## Files touched

```text
EDIT src/pages/DailyCheckIn.tsx     (auto-advance, remove sticky CTA, shrink buttons, drop instruction, single eyebrow, add greeting overlay)
EDIT src/pages/CheckInDetail.tsx    (move CTA inside card, drop right subline, add greeting overlay)
EDIT src/pages/ExecutiveHome.tsx    (delete duplicated eyebrow block, add visible greeting overlay)
EDIT src/pages/PlanPage.tsx         (align subline class with Brief, add greeting overlay)
```

No new components, hooks, routes, migrations, or edge function deploys. All `data-tour` selectors, save flows, scoring, navigation targets, and FirstSessionGuide wiring preserved.
