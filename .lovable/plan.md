

## Plan: Soften Pill Colors to Taupe/White with Colored Icons

### Scope
Single file: `src/components/home/DecisionReadinessBrief.tsx`. Visual-only changes to `ExecutivePillCapsule` and `CalendarPillCapsule`.

### Changes

**1. Pill body → neutral taupe/white**
- Replace state-color gradient backgrounds on the capsule with a near-white/light-taupe surface (e.g. `bg-white/85` with subtle taupe tint)
- Add soft drop shadow (`shadow-[0_2px_8px_rgba(0,0,0,0.06)]` + subtle hover lift) so pills read as separated cards
- Remove state-colored glow on the capsule itself
- Keep no borders (per prior approval)

**2. Icon badge stays state-colored**
- The circular icon disc keeps its radial-gradient in the state color (green/amber/red/neutral)
- Icon glyph itself rendered in the matching state color (or white-on-color, whichever reads cleaner — match the reference left image which shows green icon on light-green disc)
- Icon badge gets the soft glow/lift, not the pill body

**3. Headline text → muted grey**
- Change small uppercase headline (`COGNITIVE`, `PHYSIOLOGY`, `RESILIENCE`, `CALENDAR`, `NEXT UP`) to the same muted grey used in the "BASED ON YOUR SIGNALS" section header (`text-muted-foreground` / taupe-grey)
- Signal word below stays bold and dark (`text-foreground`) for hierarchy — readable on the now-light pill background
- Chevron stays muted grey

**4. Calendar pill: inline meeting count**
- Move `1 meeting ahead` qualifier inline with the signal word (e.g. `LIGHT · 1 meeting ahead`) at the same font size/weight as the signal word, instead of stacked below
- Apply same to other calendar count qualifiers (`X meetings ahead`, `X done`)

### Untouched
All scoring logic, state-color mapping (good/ok/bad still drives icon color), expansion behavior, glass box content, layout, all other components.

### Files edited
- `src/components/home/DecisionReadinessBrief.tsx`

