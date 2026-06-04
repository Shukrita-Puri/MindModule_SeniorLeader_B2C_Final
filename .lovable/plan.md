## Goal

Make every card across the app match the cards on `/onboarding/leadership-context` — solid white surface, subtle taupe border, no backdrop blur / no glass tint — without touching logic, data, routes, or backend.

Reference recipe (from `StageLeadershipContext.tsx`):
```
rounded-[14px]  border border-[#cfc7b8]  bg-white
```
We'll standardise on the equivalent class set:
```
rounded-2xl  border border-[#cfc7b8]  bg-white  shadow-[0_1px_2px_rgba(0,0,0,0.04)]
```
(keeping `rounded-2xl` so existing layouts don't shift; dropping the glass shadow + inset highlight + backdrop blur entirely.)

## Strategy — fix at the source, then sweep stragglers

### 1. Card primitive (highest leverage — fixes ~37 call sites at once)
`src/components/ui/card.tsx`
- Replace the current glass classes:
  `border-black/[0.08] bg-white/65 backdrop-blur-[30px] backdrop-saturate-150 shadow-[0_8px_32px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.9)] hover:shadow-[0_12px_48px_rgba(0,0,0,0.1)] hover:-translate-y-0.5`
- With the solid recipe:
  `border border-[#cfc7b8] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]`
- Keep `rounded-2xl`, `text-card-foreground`, `transition-all duration-300`.

### 2. CSS utilities used as card surfaces
`src/index.css`
- `.card-standard` / `.card-hero`: change the body from `bg-white/65 backdrop-blur-[30px] backdrop-saturate-150 ... shadow ... inset highlight ... border 0` to `bg-white border border-[#cfc7b8] shadow-[0_1px_2px_rgba(0,0,0,0.04)]`. Keep size/padding/radius classes intact.
- Line 322 (the `@apply bg-white/65 backdrop-blur-[30px] backdrop-saturate-150 border border-black/[0.08]`): swap to `@apply bg-white border border-[#cfc7b8]`.

### 3. Shared wrappers that re-implement the glass recipe inline
- `src/components/onboarding/QuestionCard.tsx` — swap the inline `bg-white/65 backdrop-blur-[30px] backdrop-saturate-150 shadow-[…inset…]` for `bg-white border border-[#cfc7b8] shadow-[0_1px_2px_rgba(0,0,0,0.04)]`.
- `src/components/insights/InsightSummaryRow.tsx` — same swap (this row is the Insights "target look" the codebase currently inherits from).
- `src/components/insights/PerformanceStreaks.tsx` — same swap.
- `src/components/insights/InnerReadinessDial.tsx` (line 178) — same swap.

### 4. One-off inline glass cards (literal-class sweep)
For each file below, replace the literal substring
`bg-white/65 backdrop-blur-[30px] backdrop-saturate-150 border border-black/[0.08]` (and the `backdrop-blur-[20px]` variant) plus its trailing `shadow-[0_8px_32px_rgba(0,0,0,0.06)…]` with
`bg-white border border-[#cfc7b8] shadow-[0_1px_2px_rgba(0,0,0,0.04)]`:
- `src/pages/PlanPage.tsx` (l.60)
- `src/pages/CheckInDetail.tsx` (l.215)
- `src/pages/DailyCheckIn.tsx` (l.400)
- `src/pages/AuthCallback.tsx` (l.211)
- `src/pages/Signup.tsx` (l.134)
- `src/pages/onboarding/stages/Stage8SignupStep.tsx` (l.182, 203)
- `src/pages/onboarding/stages/Stage8Results.tsx` (l.300, 340, 362, 387)
- `src/pages/onboarding/stages/Stage7ContextConnection.tsx` (l.307, 329) — but NOT l.275 (that's the top bar, see exclusions)
- `src/components/connections/WearableProviderPicker.tsx` (l.140)
- `src/components/calendar/CalendarProviderPicker.tsx` (l.175)
- `src/components/home/JustInTimeIntervention.tsx` (l.465)
- `src/components/home/PostEventReflection.tsx` (l.152)
- `src/components/home/TodayStateCard.tsx` (l.86)
- `src/components/home/ReflectionCorner.tsx` (l.127, 145)
- `src/components/home/StrategicIntentionCard.tsx` (l.55)
- `src/components/chat/ProtocolCard.tsx` (l.83) — only the unselected branch.

## Explicit exclusions (do NOT touch)

- **Buttons** — `src/components/ui/button.tsx` glass variant stays as-is (user said boxes, not buttons; saffron/taupe CTAs unaffected).
- **Top navigation bars** — `UnifiedTopBar` and the inline top bar in `Stage7ContextConnection` keep `bg-white/85 backdrop-blur-[30px]` (those are chrome, not cards).
- **Front.tsx l.322** — that's a `text-white/65` text colour on the dark hero, not a card.
- `LuxuryInsightCard` (gradient luxury variant) — leave untouched; it's a separate aesthetic used in a few insight pages and its container is the shared `Card` primitive which already updates via step 1.
- Routes, data hooks, edge functions, scoring, copy — unchanged.

## Verification

- Walk: ExecutiveHome → MRS → Insights main + child pages → PlanPage → CheckInDetail → DailyCheckIn → RecalibrateMode → Profile / Privacy / Terms → Onboarding (Stage1 → leadership-context → cognitive-load → connections → Stage8 results/signup).
- Every card reads as solid white with the same hairline taupe border as the leadership-context cards. No frosted/glassy tint anywhere.
- Buttons, top bar, hero gradients, dial visuals, JIT/practice players — unchanged.
- No console errors; no edits to hooks, services, edge functions, supabase types, or `src/integrations/supabase/*`.

## Files touched

Core (2):
- `src/components/ui/card.tsx`
- `src/index.css`

Shared wrappers (4):
- `src/components/onboarding/QuestionCard.tsx`
- `src/components/insights/InsightSummaryRow.tsx`
- `src/components/insights/PerformanceStreaks.tsx`
- `src/components/insights/InnerReadinessDial.tsx`

Inline sweep (~16 files listed in §4). Pure class-string substitutions — no JSX, props, state, or imports change.
