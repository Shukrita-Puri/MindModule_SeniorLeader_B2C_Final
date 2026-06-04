## Root cause audit

Three independent problems block the gradient from showing across the app:

**1. `background-attachment: fixed` is unreliable on iOS Safari / Capacitor WebView.**
`body { .bg-app-surface }` uses `background-attachment: fixed`. On iOS the fixed attachment frequently fails to paint, so the body's `--background` (warm white `#FAFAF8`) shows through. That is why **Recalibrate now looks white** — we removed its strong inline gradient and left it relying on the body, which silently fails.

**2. shadcn `SidebarInset` hardcodes `bg-background`.**
`src/components/ui/sidebar.tsx` (line 325) bakes `bg-background` into `<SidebarInset>`. Any page that wraps content in `SidebarProvider` + `SidebarInset` without explicitly passing `bg-transparent` paints opaque warm-white over the body — completely hiding any global gradient. **`ExecutiveHome.tsx`** (line 243) does exactly this. Recalibrate happens to pass `bg-transparent`, but ExecutiveHome and any other sidebar-using page do not.

**3. Insights pages have their own hardcoded green inline gradient.**
- `src/pages/Insights.tsx` line 923 — full green `bg-[radial-gradient(...hsl(122_22%_...))]` on the outer wrapper.
- `src/pages/InsightDetail.tsx` line 54 — same green gradient.
These were never swept in the previous pass, so Insights stays green regardless of body.

## Fix

### A. Make the global surface bullet-proof (`src/index.css`)
Stop relying on `background-attachment: fixed` on `body`. Apply the gradient to `html`, `body`, and `#root` together, drop `background-attachment: fixed`, and let the gradient repeat naturally with `min-height: 100%`. Keep the existing `--taupe-*` token recipe identical so the visual identity (the Recalibrate parchment/taupe blend) is preserved:

```text
html, body, #root      → .bg-app-surface
.bg-app-surface        → same radial+linear gradient, NO background-attachment:fixed
                         add background-repeat:no-repeat, background-size: 100% 100%
```

This guarantees the gradient renders on every route, on iOS Safari, in Capacitor, and behind any transparent wrapper.

### B. Stop `SidebarInset` from masking the body
Two surgical edits, no API change:

1. `src/components/ui/sidebar.tsx` line 325 — replace `bg-background` with `bg-transparent` in `SidebarInset`'s base classes. Any page that genuinely needs an opaque surface can pass its own `bg-*` via `className` (tailwind-merge already supports the override).
2. `src/pages/ExecutiveHome.tsx` line 243-245 — explicitly add `bg-transparent` to the `<SidebarInset>` (belt-and-braces, matches Recalibrate's pattern).

### C. Strip hardcoded green gradients from Insights
1. `src/pages/Insights.tsx` line 923 — replace the long inline `bg-[radial-gradient(...)]` with `bg-transparent`.
2. `src/pages/InsightDetail.tsx` line 54 — same swap to `bg-transparent`. Keep the sticky header's `bg-background/40` (translucent) as-is so blur still reads.

### D. Sweep any remaining opaque `bg-background` outer wrappers
Quick repo scan after A–C to catch any other `min-h-screen … bg-background` outer containers that weren't in the previous sweep and convert them to `bg-transparent`. Targets to re-verify: `ExecutiveHome`, `PlanPage`, `CheckInDetail`, `Profile`, `NudgeSettings`, `NudgeSimulator`, `SelfMasteryCoach`, `Login`, `Refer`, any layout/route skeleton that wraps a sidebar.

## Explicitly NOT touched
- Card / modal / sticky-header backgrounds (`bg-card`, `bg-background/40`, `bg-muted/*`) — they intentionally sit on top of the gradient.
- `--background` token value, Saffron token, `bg-app-surface` color recipe.
- Any onboarding V8 file already converted.
- Recalibrate outcome pages (Pause / Presence / Power-Up) — already on `bg-transparent`.
- Full-bleed player pages (Soundscape, Guided Practice, Micro Practice) — keep their visuals.
- Logic, routes, copy, components.

## Validation (end-to-end, post-build)
Walk these routes in preview at mobile viewport and confirm the **same taupe Recalibrate gradient** is visible behind cards (not warm-white, not green):

1. `/` (ExecutiveHome) — gradient behind hero + brief + priorities.
2. `/recalibrate` — gradient (no longer white).
3. `/recalibrate/pause`, `/recalibrate/presence`, `/recalibrate/power-up` — gradient.
4. `/insights` — gradient (no longer green).
5. `/insights/:id` (InsightDetail) — gradient.
6. `/plan`, `/daily-check-in`, `/check-in/:id`, `/profile`, `/refer`, `/connected-data`, `/powered-by-ai`, `/privacy`, `/terms`.
7. `/nudge-settings`, `/nudge-simulator`, `/coach`.
8. `/onboarding/app-intro` and every V8 onboarding stage — gradient still visible (already wired).
9. Full-bleed players (`/soundscapes/:id`, `/guided-practices/:id`, `/micro-practice/:id`) — visuals untouched.
10. Confirm cards, modals, sticky headers retain their existing fills and contrast.

If any page still reads warm-white or green, grep for residual `bg-background` / `bg-[radial-gradient` on its outermost wrapper and convert to `bg-transparent` before declaring done.
