---
name: Mastery Plan Temporal Gating
description: Reflection Corner / "Tiny Win and Reflection" only renders 18:00–22:59 local; outside that window the server substitutes a forward-looking Sleep Prep & Tomorrow Framing practice.
type: feature
---

## Rule
- The integrate slot's "Tiny Win and Reflection" prompt asks the user "what did you do right TODAY". This is only coherent during the late-evening window.
- Window: local hour ∈ [18, 23). Outside the window — including the Early Hours tail of the Evening time window (00:00–04:59) — the prompt is suppressed.

## Server behaviour
- `applyV51Enrichment` in `supabase/functions/generate-mastery-plan/index.ts` computes the viewer's local hour from `req.timezoneOffset`. When the hour is outside [18, 23) it rewrites every integrate practice titled `Tiny Win and Reflection` to:
  - title: `Sleep Prep & Tomorrow Framing`
  - prompt: forward-looking two-line framing ("what tomorrow needs you ready for + cleanest way to land tonight").
- The substitution is in-place on the merged module — the practice card still renders, but the Reflection capture UI does not.

## Client behaviour
- `src/components/home/TodayThreePriorities.tsx` independently checks `new Date().getHours()` and only mounts `<ReflectionCorner />` when `hour ∈ [18, 23)`.
- Outside the window the integrate slot renders the normal practice card with its Start button (so the substituted Sleep Prep practice is actionable).

## Practice spec hook (future)
- Practice specs may opt into a `hoursOfDay: [startHourLocal, endHourLocalExclusive]` filter handled by the same gate. The current implementation hard-codes the Reflection Corner gate; the field is reserved for additional practices.