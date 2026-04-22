

## Plan: Bigger CTA, suppress generic loaders on owned pages, instant return for cached briefs/plans

Three coordinated changes. No logic, scoring, prompts, or data flow touched.

---

### 1) `/executive-home` — Make "Generate Today's Plan" CTA bigger and more prominent

**Current** (`ExecutiveHome.tsx` lines 355–369): the CTA is `text-[11px] uppercase tracking-[0.08em]` — exact same size as the "Was this brief useful?" feedback row, so it doesn't read as the primary action.

**Change** the right-aligned button styles to:
- `text-sm` (14px, ~27% larger than the feedback row's 11px)
- Drop `uppercase` and tighten tracking → `tracking-[0.02em]`
- Bump weight → `font-semibold`
- Slightly larger arrow → `w-4 h-4`
- Keep the saffron color (`text-[hsl(var(--saffron))]`), the right alignment (`flex justify-end`), the hover translate-x animation, and the fade-in.

The feedback row remains untouched at its current small size, so the visual hierarchy reads: **brief content > CTA > feedback row**.

---

### 2) Owned-loader pages — suppress the generic Suspense `LoadingFallback` only for Brief / Plan / Learn / Onboarding Results

**Problem:** `App.tsx` wraps every lazy-loaded route in `<Suspense fallback={<LoadingFallback />}>`, which renders a generic `EngravedLoader` with the label "Loading…" while the page chunk downloads. On Brief / Plan / Learn / Onboarding Results — which already render their own scripted `EngravedLoader` with narration steps — this means the user sees **two loaders back-to-back** (generic → page-specific). The user wants only the page-specific one to ever show on these four routes.

**Change:** Replace the per-route `<Suspense fallback={<LoadingFallback />}>` for the four owned routes with `<Suspense fallback={null}>`. The page chunk download is small (< 200ms typically), and when it lands the page's own loader takes over instantly. No blank screen risk because the previous route's content keeps rendering during navigation transition (React Router keeps the previous tree alive until the new one is ready).

**Routes affected** (in `src/App.tsx`):
- `/executive-home` (ExecutiveHome — owns `DecisionReadinessBrief` loader)
- `/plan` (PlanPage → TodayThreePriorities owns its loader)
- `/insights` (Insights — "Learn" tab; each section owns its own loader, and the page-level skeleton handles the rest)
- `/onboarding/results` (Stage8Results owns its loader)

All other routes keep `LoadingFallback` (no regression elsewhere).

---

### 3) Instant return for cached Brief / Plan — no loader flash on revisit

**The user's actual complaint:** "If the user goes to other pages and comes back, no analysis or recreation needs to happen, so it should be instant — no loading sign should show."

#### 3a) Brief (`DecisionReadinessBrief.tsx`)

**Current behavior on revisit:**
- `useOuterReadiness` already has a 5-min `staleTime` and `placeholderData: (prev) => prev`, so the data is available instantly from cache.
- BUT the component's local `briefScriptDone` state is `useState(false)` — it resets to `false` on every mount. So even when `outerBrief` is already cached and `outerBriefLoading` is `false`, the loader gate `(!!outerBrief && !briefScriptDone)` re-triggers the full 4-step narration loader again. That's why it feels like it "loads" every revisit.

**Fix:** Make the script loader fire only on a true cold load — i.e., when there is no cached brief yet. When the React Query cache already has data on mount, `briefScriptDone` should initialize to `true` so the brief renders instantly.

Concretely:
- Read the cache eagerly: use `useQueryClient().getQueryData(['outer-readiness', effectiveUserId, period])` once at mount (via a `useState` initializer or a lazy ref) to detect whether cached data already exists.
- Initialize `useState(briefScriptDone)` to **`true`** when cache exists, **`false`** on cold load.
- Same for `showCta`: when the cache already exists on mount (revisit case), initialize `showCta` to `true` and skip the 5-second timer entirely. The user has already read the brief once; no point in re-gating the CTA.
- The `showLoader` derived gate (`(outerBriefLoading && !outerBrief) || (!!outerBrief && !briefScriptDone)`) is unchanged — both clauses now naturally evaluate `false` on cache-hit revisits.

**Cold load path is preserved exactly:** when there's no cache, `briefScriptDone=false` and `showCta=false` initialize as before; loader plays all 4 narration steps; CTA appears 5s later. No regression.

#### 3b) Plan (`TodayThreePriorities.tsx`)

**Current behavior on revisit:**
- `loadPlan()` runs on every mount. It does check `sessionStorage` for a cached plan and returns early if hit, but it still calls `setLoading(true)` at the top of the function before the cache check, then `setLoading(false)` only after the early-return. There's a brief moment where `loading=true` causes the skeleton + script loader to render.
- Also, `planScriptDone` resets to `false` on every mount, so even when `loadPlan` returns instantly from cache, the gate `(dataReady && !planScriptDone)` keeps the loader visible until the 4-step script completes (~5–6s).

**Fix:**
- Inline the cache check **before** `setLoading(true)`. If `sessionStorage` has a valid cached plan for today + current period AND the brief identity hash matches, hydrate `setPlan(parsed)` and `setCompletedPracticeIds(...)` synchronously and skip the loading dance entirely.
- Initialize `planScriptDone` to `true` when a cached plan is found at mount time (mirror of brief fix). Cold load (no cache) keeps the existing scripted loader behavior.
- Move the freshness checks (period change, check-in newer than plan, JIT cache stale, energy hash mismatch) to run **after** the instant render — those checks already exist and can trigger a silent background regeneration without blocking the UI. If regeneration is needed, swap the rendered plan when the new data arrives (no loader shown — same pattern as `placeholderData: (prev) => prev`).

#### 3c) Learn / Onboarding Results — already handled by item 2

- `Insights.tsx` ("Learn") already manages per-section loading independently — no page-level loading gate. Removing the Suspense fallback (item 2) is sufficient.
- `Stage8Results` loads once and persists; revisits are not a typical user path (it's an onboarding milestone), so no further change needed beyond item 2.

---

### Files touched

| File | Change |
|---|---|
| `src/pages/ExecutiveHome.tsx` | Bigger CTA: `text-sm font-semibold tracking-[0.02em]`, drop `uppercase`, arrow `w-4 h-4`. Lines 355–369 only. |
| `src/App.tsx` | Wrap `/executive-home`, `/plan`, `/insights`, `/onboarding/results` route elements with `<Suspense fallback={null}>` instead of the global `LoadingFallback`. All other routes unchanged. |
| `src/components/home/DecisionReadinessBrief.tsx` | Initialize `briefScriptDone` and `showCta` to `true` when `useOuterReadiness` query cache already has data at mount (revisit). Cold load behavior unchanged. Use `useQueryClient().getQueryData(...)` for the eager cache peek. |
| `src/components/home/TodayThreePriorities.tsx` | Synchronous `sessionStorage` cache hydration in a `useState` initializer (or pre-`setLoading` inline check) so revisits never enter the `loading=true` state. Initialize `planScriptDone` to `true` on cached hit. Background freshness re-fetch swaps data silently when needed. |

---

### What does NOT change

- LLM prompts, brief scoring, `compute-outer-readiness`, `generate-mastery-plan`, validators.
- The 4-step narration scripts themselves (still played on cold load).
- Cold-load timing (5s CTA delay still applies on first brief of the day).
- Feedback row, `BriefFeedbackRow.onFeedbackSubmitted`, navigation, routes.
- DB, RLS, edge functions, sessionStorage keys, brief identity hashing.
- Other consumers of `useOuterReadiness` (StrategicIntentionCard, TodayThreePriorities) — they share the same React Query cache and benefit automatically.
- Other Suspense fallbacks across the app.

---

### Verification

1. `/executive-home` cold load: loader plays all 4 narration steps → brief renders → 5s later, larger saffron "Generate Today's Plan →" appears (visibly bigger than the "Was this brief useful?" row below).
2. Navigate `/executive-home` → `/insights` → back to `/executive-home`: brief appears **instantly**, CTA visible immediately, **no** loader of any kind shown.
3. Navigate `/plan` cold load: 4-step plan loader plays → 3 priorities render. Navigate away and back: priorities render **instantly**, no loader, no skeleton.
4. `/insights` cold load: no generic "Loading…" flash before the page paints; section-level skeletons render as before.
5. `/onboarding/results` cold load: no generic "Loading…" flash before the page's "Analysing Your Pattern" loader appears.
6. If the user check-ins again or the brief regenerates (different `briefId`), the next visit shows the new brief — silently swapped in, no loader interrupting (cache replacement, not a cold load).
7. All other routes still show the `LoadingFallback` during chunk download (no regression).

