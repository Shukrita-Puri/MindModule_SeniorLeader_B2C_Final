

## Plan: Greeting Polish + Collapse Signals by Default

### Scope
Two files, minimal changes.

### Changes

**1. `src/pages/ExecutiveHome.tsx` — Greeting box**
- Reduce hero padding: `pt-2 pb-4` → `pt-0 pb-2`
- Headline size + weight: `text-[22px] sm:text-3xl md:text-4xl font-headline` → `text-[28px] sm:text-3xl md:text-4xl font-headline font-bold`
- **Suppress duplicate "Evening" + remove subheadline italic line:**
  - Update `getGreeting()` to use Chief-of-Staff style salutations that do NOT repeat the time-of-day word (since the brief card already carries temporal context). New phrasing:
    - Morning: `Good morning, {firstName}`
    - Afternoon: `Good afternoon, {firstName}`
    - Evening: `Good evening, {firstName}`
  - Wait — user said "Remove the mention of Evening Twice". The duplicate is: greeting says "Evening, Name" AND the brief eyebrow says "Evening · Sun 17 Apr". To fix without touching the card, drop the time word from the greeting itself:
    - Morning: `Hello, {firstName}` 
    - Afternoon: `Hello, {firstName}`
    - Evening: `Hello, {firstName}`
  - More Chief-of-Staff voice options (pick one): `Welcome back, {firstName}` / `Ready when you are, {firstName}` / `Hello, {firstName}`
  - **Going with**: `Welcome back, {firstName}` (warm, executive, time-neutral, no duplication with the card)
- Wrap subheadline `<p>` with `{false && ...}` + `// TEMP_SUPPRESSED:` comment (preserves code for later reactivation)

**2. `src/components/home/DecisionReadinessBrief.tsx` — Collapse signals**
- Change `useState(true)` → `useState(false)` for `signalsOpen`
- Brief reading order becomes: Score → Phrase → Body → [tap "Based on your signals"] → [tap "How to show up"]

### Untouched
- The card eyebrow keeps "Evening · Sun 17 Apr" (preserved per user request — useful for regeneration context)
- All scoring, LLM brief, pill internals, calendar logic, "How to show up" content, navigation, hero video, edge functions

### Files edited
- `src/pages/ExecutiveHome.tsx` (3 tweaks: padding, headline class, greeting copy + suppress subheadline)
- `src/components/home/DecisionReadinessBrief.tsx` (1 tweak: signalsOpen default)

