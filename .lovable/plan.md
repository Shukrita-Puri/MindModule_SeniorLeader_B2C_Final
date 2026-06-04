## Goal
Pure UI: visually mirror the Performance Readiness Brief card on two surfaces (Today's Priorities, MRS) and lighten the dark fill behind the MRS score circle. No logic, data, copy, or routing changes.

## Changes

### 1. Today's Performance Priorities — wrap in brief-style card with eyebrow
File: `src/pages/ExecutiveHome.tsx` (around line 287–291, the `plan` tab node)

Wrap `<TodayThreePriorities />` in the same `rounded-xl card-hero p-4` shell the brief uses, and prepend an eyebrow row identical in markup/typography to the brief's eyebrow (lines 1892–1900 in `DecisionReadinessBrief.tsx`):

- Left: `Today's Performance Priorities` (text-eyebrow, muted-foreground-v2)
- Right: `{getTimeLabel()} · {getDateLabel()}` (text-caption, muted-foreground-v2), imported from `@/components/home/timeLabel`

The existing `<TodayThreePriorities />` renders unchanged inside the new wrapper. No props, no logic touched.

### 2. MRS page — wrap in matching card
File: `src/components/home/mrs/MrsPage.tsx`

Wrap the inner `<div className="max-w-md mx-auto">…</div>` block in a `rounded-xl card-hero p-4` container so the score sits on the same card surface as the brief. Outer `<section>` (scroll + padding) stays as-is. Score, gauge, tier label, take-assessment tab, and weekly dial all render unchanged. The existing top eyebrow `"Mental Readiness Score"` stays — we are only adding a card behind it, not duplicating headers.

### 3. Remove dark gradient behind the MRS score circle
File: `src/components/home/mrs/MrsGauge.tsx`

The "dark gradient" is the orb body + shadow + drop-shadow stack that paints a dark sphere behind the number. Soften to white/card surface:

- Drop the `drop-shadow-[0_18px_40px_rgba(0,0,0,0.28)]` on the `<svg>`.
- Remove the `<circle … fill="url(#mrs-orb-shadow)" />` (the dark inner shadow ellipse).
- Replace the `mrs-orb` radial-gradient stops so the sphere body reads as white/card rather than tier-tinted: pure white at the centre fading to fully transparent (no tier-color tinting in the body fill). This keeps the tier color only on the outer halo + progress arc.
- Keep the specular highlight, halo, track, and progress arc untouched so the gauge still reads as an orb, just light-filled.

## Out of scope
- No changes to scoring, data fetching, hooks, routes, copy, tier logic, or weekly-delta dial.
- No restyling of the brief itself, the swipe shell, or any other page.
- Card token (`card-hero`), `--background`, Saffron, and time/date helpers reused verbatim.

## Validation
Open `/` in mobile preview and step through the three swipe tabs:
1. MRS tab — score sits on a light card, no dark sphere behind the number, orb still readable.
2. Brief tab — unchanged.
3. Plan tab — Today's Priorities now sits on a brief-style card with `Today's Performance Priorities` on the left and `Afternoon · Wed 4 Jun` (or current bucket) on the right of the eyebrow row.
