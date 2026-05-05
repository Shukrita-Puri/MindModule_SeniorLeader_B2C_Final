## Goal

Three isolated UI-only tweaks across Today flow + Reset/Insights pages. No logic changes.

---

## 1. Shrink Today hero (Brief / Plan / Assessment pages)

The shared `TodayHero` currently defaults to `h-[140px]`, which on a ~870px mobile viewport eats ~16% but pushes the stepper + white card down so they only get the lower portion. The user wants the **visual ≈20–25%** and the **stepper + card ≈75–80%**.

The cleanest move is to reduce the hero band itself rather than re-layout each page (the stepper and card already flow directly under it, so shrinking the hero automatically pulls them up).

**Change:** `src/components/today/TodayHero.tsx`
- Default `heightClass` from `h-[140px]` → `h-[110px]` (mobile) with `md:h-[140px]` preserved for desktop.
  - Final: `heightClass = 'h-[110px] md:h-[140px]'`
- No callers pass an override, so this propagates to ExecutiveHome, PlanPage, and DailyCheckIn automatically.

This reclaims ~30px above the stepper on mobile, putting the hero at ~22% of a typical mobile viewport — matching the reference screenshot.

## 2. Shift the "Ready to roll, Shuk" greeting right (away from sidebar button)

`TodayGreeting` is centered absolutely across the full width. On mobile the sidebar button (top-left) overlaps the left edge of long greetings.

**Change:** `src/components/today/TodayGreeting.tsx`
- Add `pl-14 md:pl-0` to the absolute container (mirrors the existing pattern on Insights/Reset headlines).
- Keep `text-center` on desktop; the `pl-14` only nudges on mobile where overlap occurs.

## 3. Vertically center the greeting + Insights/Reset headlines with the sidebar button

Currently:
- Sidebar button sits in a header with `pt-[calc(env(safe-area-inset-top,0px)+0.75rem)]` and is a `size=sm` button (h-9 = 36px). Its **vertical center** is at `safe + 0.75rem + 18px`.
- Greeting/headlines use `top: calc(safe + 0.875rem)` — top-aligned with the button's top edge, not its center, so taller text (the 33px greeting / 26px headline) appears to start above center.

**Fix (applied to all three):**
Change the absolute container's top from `0.875rem` to a value that centers the text against the button center. Using a flex wrapper matched to the button container's height is the cleanest approach:

Replace the absolute-positioned text wrapper with one that mirrors the header's vertical box:
```tsx
<div
  className="absolute left-0 right-0 z-30 pointer-events-none flex items-center justify-center px-4"
  style={{
    top: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)',
    height: '2.75rem', // matches header py-2 + h-9 button
  }}
>
  …text…
</div>
```

This makes the greeting/headline's vertical mid-line equal to the sidebar button's mid-line on every page.

**Files:**
- `src/components/today/TodayGreeting.tsx` (greeting on Brief/Plan/Assessment)
- `src/pages/Insights.tsx` (lines ~938–950, the headline + subtext block)
- `src/pages/RecalibrateMode.tsx` (the headline + subtext block)

For Insights & Reset which have a headline **and** a subtext line, keep the same flex wrapper but stack `<h1>` + `<p>` inside; align the wrapper so the `<h1>` (first line) center matches the button center — i.e. anchor by `items-start` and adjust top so the h1 baseline area is centered on the button. Concretely: keep current absolute positioning but change `top` from `0.875rem` to `1.25rem` on mobile (and `0.875rem` on `md` where the headline is much larger). This shifts the headline down ~6px so its visual center aligns with the 36px sidebar button.

---

## Out of scope

- No changes to copy, colors, navigation, data, animations.
- TodayStepper internals untouched (the "+ / Click" hint stays as-is).
- White card content untouched — it just rides up because the hero shrank.
