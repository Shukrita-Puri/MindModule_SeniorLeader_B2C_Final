

## Plan: Move "Activate Today's 3 Priorities" CTA out of Brief + wrap Plan content in taupe-bordered card

Two surgical, UI-only changes. No logic, prompts, calculations, routing, or downstream effects.

---

### 1) `/executive-home` — Move the CTA out of the Brief and recolor it taupe

**Current:** the saffron `Activate Today's 3 Priorities` button lives **inside** `PerformanceReadinessBrief` (DecisionReadinessBrief.tsx, lines 1699–1710), rendered as the last child of the brief card after a 3.5s reveal timer.

**Change:**
- **Remove** the `<Button>` block (lines 1699–1710) from inside `PerformanceReadinessBrief`. Keep all the surrounding logic (`showCta`, `setShowCta`, the 3.5s timer, the localStorage check, the `onFeedbackSubmitted` wiring) untouched — `setShowCta` will still be called, just no longer used inside the component.
- **Expose** the `showCta` state to the parent via a small contract change: add an optional `onCtaReadyChange?: (ready: boolean) => void` prop to `PerformanceReadinessBrief`. Inside the existing `useEffect` that already drives `setShowCta`, also call `onCtaReadyChange?.(...)`. Zero risk: prop is optional, default undefined = no-op, all existing call sites unaffected.
- **In `ExecutiveHome.tsx`**, immediately *after* the brief section's closing `</section>`, render the same CTA — but:
  - Outside the brief card (its own block in the same `max-w-lg mx-auto` container, with `mt-3` spacing).
  - Color: **taupe** instead of saffron. Use `bg-taupe text-white hover:bg-taupe/90` (matches the existing taupe Start button used in `TodayThreePriorities` line 928 — same component family, proven readable).
  - Visibility: gated by the new `onCtaReadyChange` callback so the same 3.5s read-window + post-feedback fast-path behavior is preserved exactly.
  - Same label, same icon (`ArrowRight`), same `navigate('/plan')` action, same `animate-in fade-in duration-300`, same `h-11 w-full`.

**Net effect:** The button moves from inside the white brief card to just below it, and changes color saffron → taupe. Reveal timing, feedback interaction, and navigation behavior are identical.

---

### 2) `/plan` — Wrap all plan content (header through priority 3, including expanded states) in a single white card with taupe left border

**Current:** in `PlanPage.tsx`, the header (`Today's 3 Mental Performance Priorities`), the subheading, and `<TodayThreePriorities />` (which contains the `0 of 3` counter, the 3 numbered slot rows, all expand/collapse content, practice cards, Start buttons, ReflectionCorner, and PostEventReflection) all sit directly on the page background with only `px-3 md:px-4` padding. On iOS this reads as edge-to-edge and tight.

**Change:** Wrap the entire content block in the same card surface used by the brief (`DecisionReadinessBrief.tsx` line 1522):

```
rounded-xl bg-white/65 backdrop-blur-[20px]
shadow-[0_4px_16px_rgba(0,0,0,0.04)]
p-4 border-l-2 border-l-taupe/40
```

**Concretely in `PlanPage.tsx`:**
- Add an outer wrapper with `max-w-lg mx-auto px-3 md:px-4` to give iOS-safe horizontal padding (matches `/executive-home`'s brief container exactly).
- Inside that, add the white card div with the styles above.
- Move the existing header (`<h1>` + subheading `<p>`), the `data-tour="daily-plan"` block (which contains `<TodayThreePriorities>` and the `prioritiesEmpty` `<DailyRitual />` fallback), all *inside* the card.
- Keep `<PrivacyFooter />` *outside* the card (footer should remain a page-level element, same as on `/executive-home`).

**Critical preservation rules:**
- `<TodayThreePriorities>` is rendered **as-is** — props, state, refs, `onEmpty`/`onLoaded` callbacks, `expandReflection`, `reflectionContext`, `reflectionEvent` all unchanged.
- The internal `max-w-lg mx-auto` containers inside `TodayThreePriorities` (lines 695, 700, 719) are kept — they will simply re-center within the card's available width, which already enforces `max-w-lg` outside, so they become effectively no-ops (no visual regression on mobile, where both maxes resolve to the same width).
- The internal `px-4` padding on the slot list (`TodayThreePriorities` line 719) stays — combined with the card's `p-4`, mobile inner content gets slightly more breathing room around the numbered rows, which is the desired iOS fix.
- All expand/collapse animation (`animate-in fade-in slide-in-from-top-1`), the horizontal scroll snap for multi-practice slots, the `EngravedLoader` skeleton, the empty-state "Check in to build your plan" CTA, the per-priority feedback modal, the celebration overlay — all render *inside* the card with no behavioral change. The card is a presentational frame; nothing inside it knows it has been wrapped.

---

### What does NOT change

| Concern | Status |
|---|---|
| Brief logic, scoring, LLM, prompts, validators, snapshot cache | Untouched |
| `useOuterReadiness` / `compute-outer-readiness` edge function | Untouched |
| `generate-mastery-plan` edge function, signals, scoring | Untouched |
| `TodayThreePriorities` internal logic (load, complete, navigate, JIT, reflection, celebration) | Untouched |
| `setShowCta` reveal timing (3.5s + feedback fast-path) | Preserved exactly |
| Routing, navigation handlers, save handlers | Untouched |
| DB, RLS, edge functions, caching | Untouched |
| Other consumers of `PerformanceReadinessBrief` (none — single use site) | N/A |
| Other consumers of `<TodayThreePriorities />` (only `PlanPage`) | N/A |
| `PrivacyFooter` placement | Stays outside card, unchanged |

---

### Files touched

| File | Change |
|---|---|
| `src/components/home/DecisionReadinessBrief.tsx` | Add optional `onCtaReadyChange?: (ready: boolean) => void` prop. Keep `showCta` state + effect; also notify parent. **Remove** the in-card `<Button>` JSX block (lines 1699–1710). |
| `src/pages/ExecutiveHome.tsx` | Pass `onCtaReadyChange` to `<PerformanceReadinessBrief />`. Below the brief section, render the new taupe CTA gated by that state, in the same `max-w-lg mx-auto` container. |
| `src/pages/PlanPage.tsx` | Wrap header + `data-tour="daily-plan"` block (containing `<TodayThreePriorities />` and `<DailyRitual />` fallback) in a single `rounded-xl bg-white/65 backdrop-blur p-4 border-l-2 border-l-taupe/40` card inside a `max-w-lg mx-auto px-3 md:px-4` container. Keep `<PrivacyFooter />` outside the card. |

---

### Verification

1. `/executive-home`: brief renders identically; **no** CTA appears inside the white brief card. After ~3.5s (or instantly if feedback already saved), a **taupe** `Activate Today's 3 Priorities →` button fades in *below* the brief card. Clicking it navigates to `/plan`.
2. `/plan` on mobile (375px iOS): all content from the page header through priority 3, including all expanded slot views, practice cards, Start buttons, and the reflection corner, sits inside a single white card with a taupe left border and iOS-safe outer padding. `PrivacyFooter` remains below, outside the card.
3. Expand/collapse on each priority works; multi-practice horizontal scroll works; Start button navigates correctly; per-priority feedback modal still opens.
4. Empty state ("Check in to build your plan") and loading skeleton (`EngravedLoader`) both render inside the card.
5. No regression on desktop (`max-w-lg` keeps the card width identical to the current centered column).

