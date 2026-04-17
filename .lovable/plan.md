

## Plan: Unify Calendar Pills into "Based on your signals"

### Scope
Single file: `src/components/home/DecisionReadinessBrief.tsx`. UI-only — calendar logic, scoring, data pipeline all untouched.

### What changes

**1. Move location**
- Remove `<CalendarPills outerBrief={outerBrief} />` from line 1082 (right after the Score row).
- Render it inside the "Based on your signals" section (below `<ExecutivePillRow>`), so all 3 executive pills + calendar pills live together under one heading.

**2. Match the executive pill UI style (capsule + icon badge + state color)**
Refactor `CalendarPills` to render as **horizontal capsule pills** matching the executive pill aesthetic:
- Same rounded-full capsule shape, padding, and height (`pl-2 pr-3 py-2 rounded-full`)
- Same circular gradient icon badge (radial gradient + inset shadow, matching state color)
- Same text stack: small uppercase headline (top) + bold signal word (bottom)
- Same `PILL_COLORS` palette (green/amber/red/neutral) — reuse the existing object
- No expansion/chevron (calendar pills stay non-collapsible to preserve current behaviour)
- No borders (consistent with executive pills)

**3. Pill mapping (logic unchanged — only presentation)**

| Pill | Icon | Headline | Signal word | State color |
|---|---|---|---|---|
| Calendar load | `CalendarDays` (lucide) | `CALENDAR` | `LIGHT` / `MODERATE` / `HEAVY` (existing `loadLabel`) | green / amber / red (from existing `calLoad`) |
| Next high-stakes event (when present) | `Clock` (lucide) | `NEXT UP` | `{event title} · {time}` (existing logic preserved for "now" / "in X mins" / formatted clock time) | neutral (taupe-equivalent) — use `neutral` palette |
| Connect calendar (when not connected) | `CalendarPlus` (lucide) | `CALENDAR` | `CONNECT` | neutral, clickable → `/connected-data` |

The meeting count (`X meetings ahead / done`) becomes a small qualifier line below the signal word in the same capsule (matches the secondary text treatment used for executive pill qualifiers).

**4. Layout**
- Update the grid in "Based on your signals" so executive pills + calendar pills flow in the same `grid-cols-1 sm:grid-cols-3 gap-2` container, with calendar pills appearing after the 3 executive pills (wrapping on mobile, fitting alongside on desktop).

### Logic preserved (verbatim)
- All conditions in `CalendarPills` (not connected → connect prompt; no meetings → render nothing; high-stakes within 90 mins → urgent display; otherwise regular load + remaining HS event)
- `calendarLoadPillStyle`, `eventPillStyle`, `formatEventTime`, all `outerBrief` field reads
- Calendar data flow from `useOuterReadiness` / `compute-outer-readiness`

### Untouched
Score, tier, phrase, body, executive pills, "How to show up", lean on / watch for, raw numbers, navigation, hero, scoring, edge functions.

### Files edited
- `src/components/home/DecisionReadinessBrief.tsx` (refactor `CalendarPills` render output + relocate one JSX line)

