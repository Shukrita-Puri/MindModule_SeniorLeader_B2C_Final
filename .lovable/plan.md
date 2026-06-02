## Goal
The current bottom nav pill on iOS feels oversized vs. reference apps (e.g. Gumtree screenshot). Tighten the pill, icons, and labels in `src/components/navigation/FloatingPillNav.tsx` only. No colour, text, icon, or behaviour changes.

## Changes (single file: `src/components/navigation/FloatingPillNav.tsx`)

Pill container:
- Padding: `10px 14px` → `6px 8px`
- Inner gap: `6` → `2`

Each tab button:
- `min-w-[86px]` → `min-w-[64px]`
- `px-4 py-2.5` → `px-3 py-1.5`
- `gap-1` → `gap-0.5`
- `minHeight: 56` → `44`

Icons:
- `size={24}` → `size={20}` (both Lucide and Phosphor)

Label:
- `text-[11px]` → `text-[10px]`

Also nudge `FloatingCoachButton` bottom offset (`bottom: 84`) down to `72` so it stays aligned with the smaller pill. No size change to the coach button itself.

## Out of scope
- Colours, tokens, icon set, labels, routing, active-state logic
- Desktop layout (component is `sm:hidden` already)
