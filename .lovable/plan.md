

## Plan: Reflection Corner — Plan-only surface, with Stoic Reflection inside it

### Refined behaviour

**Reflection Corner is NOT shown on `/executive-home` standalone.** It only appears when the user reaches it via the Plan's evening "Tiny Win and Reflection" priority. Stoic Reflection stays accessible independently in Reset Studio (already is), and is also embedded inside the Reflection Corner as an optional companion when invoked from the Plan.

### Where it lives

Single surface, two entry points, no new route:

1. **From the Plan's evening Integrate slot** (`Tiny Win and Reflection`) → opens an inline **Reflection Corner card on `/plan` itself** (above or replacing the priority detail panel for that slot). Not a redirect to the homepage.
2. **From `PostEventReflection`** (after a high-stakes calendar event) → routes to `/plan?expand=reflection&context=post-event&event=...` and the same inline card opens on `/plan`.

`/executive-home` shows nothing reflection-related. Reset Studio's Stoic Reflection card stays exactly as it is for independent use.

### What the Reflection Corner card contains

Inline frosted card on `/plan`, scoped to the evening Integrate slot:

```text
─────────────────────────────────────────
  REFLECTION CORNER
  Capture one thing you did right today
  [ textarea ]
                              [Save win]
─────────────────────────────────────────
  Optional companion:
  ◷ Stoic Evening Reflection · 10 min · 5 steps  →
─────────────────────────────────────────
```

- **Tiny Win**: textarea, 10-char minimum, Save → `supabase.functions.invoke('store-tiny-win', { winContent, source: 'reflection_corner' })`. On success → marks the Integrate slot complete via the existing `markPracticeComplete()` path so the Plan progress count advances.
- **Stoic Reflection companion link**: tap → `navigate('/practice/stoic-reflection', { state: { entryRoute: '/plan' } })`. Uses the existing `entryRoute` mechanism — completing it returns to `/plan`. This is *additive*, not required to mark the slot complete.
- **Post-event context**: when arriving with `?context=post-event&event=...`, the Tiny Win prompt becomes *"What did you take from {eventTitle}?"* — same Save flow, same `source`.
- **Confirmation**: after Save, the card collapses to *"✓ Win captured — see it in Insights →"* linking to `/insights`. Card stays in confirmation state for the rest of the evening (gated by today's `tiny_wins` row with `source IN ('reflection_corner','post_event_reflection')`).

### Files touched

| File | Change |
|---|---|
| `src/components/home/ReflectionCorner.tsx` | New inline card (~100 lines). Tiny Win capture + Stoic companion link + post-event context. |
| `src/components/home/TodayThreePriorities.tsx` | Integrate slot: instead of `/coach`, expand the inline Reflection Corner on `/plan` (set local state via URL `?expand=reflection`). Render `<ReflectionCorner />` inside the slot's expanded panel when `module.title === 'Tiny Win and Reflection'`. |
| `src/pages/PlanPage.tsx` | Read `?expand=reflection` / `?context=post-event` / `?event=...` query params and pass to `<TodayThreePriorities />` so the Integrate slot auto-opens the Reflection Corner. |
| `src/components/home/PostEventReflection.tsx` | Final navigate → `/plan?expand=reflection&context=post-event&event=...` instead of `/coach`. |

**Removed from previous plan:** no `<ReflectionCorner />` mount on `/executive-home`. No homepage entry. Reset Studio is untouched (Stoic stays independently reachable there as today).

No new route. No DB. No edge function changes. Coach stays suppressed.

### Verification

1. `/executive-home` evening: no Reflection Corner anywhere. Clean.
2. `/plan` evening: Integrate slot ("Tiny Win and Reflection") shows normally. Tap it → expanded panel renders the Reflection Corner inline (textarea + Stoic companion link). No navigation away from `/plan`.
3. Type 10+ chars → Save → `tiny_wins` row inserted with `source = 'reflection_corner'`; Integrate slot marked complete; Plan progress count advances; card flips to confirmation with link to `/insights`.
4. Tap the Stoic companion link → `/practice/stoic-reflection` (cards player). Complete → returns to `/plan` (via existing `entryRoute`). The Reflection Corner is still there in its current state.
5. End a high-stakes calendar event → `PostEventReflection` two-tap → lands on `/plan` with Reflection Corner auto-expanded and prompt referencing the event title. Save → same path as #3.
6. Reset Studio: Stoic Evening Reflection card still independently reachable and unchanged.
7. Refresh `/plan` after saving → Integrate slot stays complete; Reflection Corner stays in confirmation state.
8. Morning/afternoon: Integrate slot doesn't generate (existing `generate-mastery-plan` evening-only behaviour for this card). No Reflection Corner surfaces.

### Out of scope

- Any homepage reflection surface.
- Modifying Reset Studio's Stoic card.
- Free-form "carry into tomorrow / leave behind" prompts.
- Re-enabling the Coach.

