

## Plan: Polish Executive Pills + Tighten Top Spacing

### Scope (isolated)
Two files touched, minimal changes:
1. `src/pages/ExecutiveHome.tsx` — tighten vertical spacing above greeting + above Brief card (2-3px pull-up)
2. `src/components/home/DecisionReadinessBrief.tsx` — rename pill titles, upgrade icons to premium 3D style, remove pill borders

---

### Change 1 — Tighten top spacing (`ExecutiveHome.tsx`)

Pull the greeting and Brief card up by ~2-3px:
- Hero greeting block: reduce `pt-6 pb-16` → `pt-4 pb-12` (saves ~4px top, ~16px bottom so Brief sits closer)
- Brief wrapper: reduce `pt-4` → `pt-2`

Net effect: greeting sits ~2-3px higher, Brief card rises ~4-6px closer to the hero.

### Change 2 — Rename pill titles

In `buildExecutivePills()` helper inside `DecisionReadinessBrief.tsx`:
- `COGNITIVE LOAD` → **COGNITIVE**
- `PHYSIOLOGICAL` → **PHYSIOLOGY**
- `EMOTIONAL` → **RESILIENCE**

Only the small top-label string changes. Signal phrase logic, colors, glass box content all untouched.

### Change 3 — Premium 3D icons

Current icons use flat `lucide-react` line glyphs (`Brain`, `BatteryMedium`, `ShieldCheck`). Upgrade visual weight:

- Wrap each icon in a **circular gradient badge** with soft inner shadow + outer glow matching pill state color (green/amber/red)
- Use **filled duotone treatment**: icon in white/near-white on a tinted gradient disc (e.g. `radial-gradient` from pill color 40% → pill color 10%)
- Add `drop-shadow-[0_2px_4px_rgba(...)]` using the state color for subtle 3D lift
- Keep same lucide components (no new library) — the premium feel comes from the badge treatment, not a new icon set
- Icon size bumped slightly (20px → 22px) with `strokeWidth={1.75}` for more refined line weight

Result: icons feel like embossed/raised badges rather than flat line glyphs — consistent with the executive glass aesthetic.

### Change 4 — Remove pill borders

In `ExecutivePillCapsule`:
- Remove the `border border-[color]/30` (or equivalent) on the collapsed capsule
- Remove the `border-t` divider inside the glass box expansion between top/bottom halves — replace with a subtle gradient hairline (`bg-gradient-to-r from-transparent via-white/10 to-transparent`) so the split is still readable without a hard line
- Keep the frosted glass background + backdrop blur — depth comes from shadow + gradient, not borders

### Files edited
- `src/pages/ExecutiveHome.tsx` (2 className tweaks)
- `src/components/home/DecisionReadinessBrief.tsx` (3 title strings, icon badge wrapper, border removal)

### Untouched
All readiness logic, scoring, LLM brief, pattern mapping, glass box content, calendar pills, "How to show up", raw numbers, navigation, hero video.

