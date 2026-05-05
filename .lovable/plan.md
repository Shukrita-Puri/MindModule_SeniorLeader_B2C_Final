Isolated Plan-page change. Only `src/components/home/TodayThreePriorities.tsx` (UI) plus one additive field in `supabase/functions/generate-mastery-plan/index.ts` (`recommendedAction`). No other files, no logic changes.

## 1. New text hierarchy in each expanded priority

```text
1  Before you start — Cambridge Interview          ← collapsed/expanded header

   [ in 63 min ]  [ Priority event ]               ← pill row

   WHY THIS MATTERS                                ← small uppercase grey label
   Reserves low with 3 meetings ahead,             ← existing whyLine, normal weight
   regulate before the afternoon compounds.

   Enter optimal flow state ahead of               ← NEW recommendedAction line
   Cambridge Interview

   [ Practice card ]   [ Practice card ]           ← bigger, mobile-readable
   [ Start ]
```

Rules:
- Header stays "Before you start" (or existing variant). When the slot is JIT, append " — {jitEventTitle}" after an em-dash so the user immediately sees what the priority is for. Non-JIT morning/evening slots keep current header only.
- Pill row: `timeLabel` chip ("In 63 min", "4 days away") + existing `Priority event` pill when present. Hide the time pill if `timeLabel` is a generic word like "Morning"/"Evening" so it stays quiet.
- "WHY THIS MATTERS" eyebrow uses `text-eyebrow` muted, then `whyLine` rendered as normal foreground (not italic, not muted) so it actually reads as the reason.
- `recommendedAction` is the new short benefit line ("Enter optimal flow state ahead of Cambridge Interview", "Build resilience for high-demand days"). Rendered ~14–15px medium weight, foreground/80.
- `typeLabel` (e.g. "REGULATE · SOMATIC PROTOCOL") is removed from the expanded view per your spec — taxonomy no longer competes with reasoning. Still kept in the underlying data, just not displayed.
- `sequenceReasoning` (multi-practice helper) renders as a thin caption between recommendedAction and the cards, only when there is more than one practice.
- Collapsed view unchanged.

## 2. Source of `recommendedAction`

Added to `HorizonModule` in `supabase/functions/generate-mastery-plan/index.ts` next to the existing deterministic `whyLine` builder (~lines 2900–3090). One template per (module type × hasJitEvent), e.g.:
- regulate + JIT event → `Settle your nervous system before {event}`
- prepare + JIT event → `Enter optimal flow state ahead of {event}`
- align + JIT event → `Sharpen your thinking before {event}`
- regulate, no event → `Regulate before the {morning|afternoon|evening} compounds`
- align, no event → `Set your focus for the {time of day}`
- prepare, no event → `Build resilience for high-demand days`
- integrate (evening) → `Close the day with intention`

Deterministic, no LLM, no scoring change. Client falls back to a small lookup if an older cached plan lacks the field, so nothing breaks during rollout.

## 3. Bigger, mobile-readable practice cards (Plan page only)

Current: `h-40`, thumbnail `w-28`, title `text-[14px] line-clamp-2`, multi cards `w-[80%]`. On 360–414px viewports the text column collapses to ~140px.

Changes:
- Slot card container: widen to `max-w-xl` on mobile (was `max-w-lg`) and reduce horizontal page padding from `px-4` to `px-3` so each priority box uses more screen width.
- Practice card height: `h-40` → `h-44 md:h-40`.
- Thumbnail width: `w-28` → `w-24 md:w-28` (frees ~16px for copy on phones).
- Title: `text-[14px] line-clamp-2` → `text-[15px] md:text-[14px] line-clamp-3`.
- Multi-practice horizontal scroll card width: `w-[80%]` → `w-[88%] md:w-[80%]` so the visible card is wider; second card still peeks for affordance.
- `practice.reasoning` line: `line-clamp-2` → `line-clamp-3`, color bumped from `muted-foreground/60` to `muted-foreground/80` for legibility.

Single-practice slots (the common case) inherit the wider container automatically.

## 4. Files touched

- `src/components/home/TodayThreePriorities.tsx` — re-order expanded block (~lines 1030–1055), add header event suffix, add WHY-THIS-MATTERS label, add `recommendedAction` line with client fallback, drop `typeLabel` from expanded view, resize practice card classes (~lines 1086–1150), bump container width (~line 941).
- `supabase/functions/generate-mastery-plan/index.ts` — add `recommendedAction: string` to the `HorizonModule` shape (~line 2830) and populate it in the deterministic builder alongside `whyLine` (~lines 2900–3090).
- Nothing else. Brief, Today, Insights, Reset, stepper, scoring, JIT logic, ledger, feedback, completion tracking, navigation untouched.

## 5. Answer to your prompt question

The "Why this matters" / context copy on the **Plan** page is **not** LLM-generated. It comes from a deterministic builder in `supabase/functions/generate-mastery-plan/index.ts`. For each of the 3 slots it inspects the live context (jitEventTitle, jitMinutesUntil, hrvEventCorrelation, coachGrowthArea, pendingCommitment, patternInsight, archetypeWatchFor, consecutive-low-state counters, calendar load, time of day, day of week) and routes through a priority cascade that returns `{ situation, whyLine }`. Sample templates already in code:

- `Your HRV drops avg {pct}% before {eventType}, ground your nervous system before that pattern takes over.`
- `Reserves low with {meetings} meetings ahead, regulate {timeAnchor}.`
- `{count} {state} days running, this interrupts the pattern before it becomes your baseline.`
- `Your coach commitment: '{commitment}', this practice directly addresses it while your calendar allows.`

Strengthening these = editing those template strings (and adding the new `recommendedAction` next to them). The Brief itself does use an LLM via `compute-outer-readiness`, but per-priority "why" lines on the Plan page are template-driven for predictability and speed. Full template list documented in `docs/MASTERY_PLAN_CONTEXT_LOGIC.md` if you want to review/edit copy line-by-line before I implement.

## 6. Out of scope

Stepper, hero, greeting, completion ledger, slot selection, JIT scoring, ReflectionCorner, Brief page, Insights, Reset, scoring weights, content recommendation engine.
