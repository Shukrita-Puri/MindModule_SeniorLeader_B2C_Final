
# App Tour — Three Isolated Fixes (Mobile-First, Final)

Scope: `src/components/onboarding/FirstSessionGuide.tsx`, tour anchors, mock-data scaffolding, and `Profile.tsx` retake flow. No backend or scoring changes.

Platform framing: primary surface is **iOS / Android**. Tour copy must **never** reference a "sidebar", "side menu" or "hamburger" — refer only to the **Reset button** and **Insight button**.

---

## 1. Extend tour 3 → 5 steps: add Reset + Insight as discovery surfaces

`STEPS` in `FirstSessionGuide.tsx`:

```
1. YOUR DAILY LOOP        → Assessment   (existing)
2. YOUR DAILY LOOP        → Brief        (existing)
3. YOUR DAILY LOOP        → Plan         (existing)
4. EXPLORE WHEN YOU NEED  → Reset        (NEW)
5. EXPLORE WHEN YOU NEED  → Insight      (NEW)
```

### Step 4 — Reset
- Title: **"Reset on demand"**
- Body (≤30 words, user-supplied): *"A library of short Pause, Flow, and Reenergise mindset and somatic protocols. Open the **Reset** button before a high-stakes moment to prepare — or after one to prevent stress carrying into the next."*
- Target: `[data-tour="sidebar-suite-4"]` (Reset entry in `LeftSidebar.tsx`; same anchor lives in the mobile sheet).

### Step 5 — Insight
- Title: **"See the patterns forming"**
- Body (≤30 words, user-supplied): *"Open the **Insight** button to see how your progress and patterns forming through the week and month — you can see the exact moments that could cause stress, burnout or clarity drain and prevent it from happening."*
- Target: `[data-tour="sidebar-suite-3"]`.

### Step mechanics (shared by steps 4 & 5)
- `page: 'home'` — stay on `/executive-home`, do not navigate to `/recalibrate` or `/insights`.
- Before spotlight: call existing `setSidebar(true)`; `waitForTargetThenCb` polls until the anchor is visible.
- `spotlightCircle: false`, `spotlightPad: 6`, `tooltipPosition: 'auto'`.
- On `finish()`: `setSidebar(false)` to close sheet/sidebar before unmount.

---

## 2. Spotlight covers the full card

Today the Plan spotlight targets the inner `data-tour="daily-plan"` div, leaving the header strip outside the cut-out.

- **`src/pages/PlanPage.tsx`** — move `data-tour="daily-plan"` from the inner div onto the outer glass-card wrapper that contains both the header row and `TodayThreePriorities`.
- **`src/pages/ExecutiveHome.tsx`** — verify `data-tour="today-state"` wraps the entire Brief card (header + body); hoist one level if not.
- In `FirstSessionGuide.tsx`, raise `spotlightPad` for Brief + Plan steps from `0` → `8` so the saffron ring breathes around the rounded corners.

---

## 3. First-time-user mock: best-in-class Brief + Plan during the tour

A brand-new user runs the tour *before* any check-in, so Brief and Plan render empty. We need populated demo content while the tour is on screen, without ever overwriting real data.

### Files (presentation only)

1. **`src/components/onboarding/tourMockData.ts`** (NEW)
   - `MOCK_BRIEF` — `OuterReadinessBrief`-shaped: tier `peak`, score 78, phrase *"Channel the peak."*, body referencing a sample event with HRV/sleep deltas, `leanOn` / `watchFor` populated, `awaitingSignals: false`.
   - `MOCK_PLAN_PRIORITIES` — 3 v2 JIT-shaped priorities with PREVENT / PREPARE titles, ≤25-word Why lines (Prevent / Prepare framing per CEO Self-Regulation Framework §1, §6), ≤6-word sub-lines, 2-step `practiceQueue` (reuse existing sanctuary content IDs).
   - All copy passes `forbiddenWords` filter in `supabase/functions/_shared/copy-vocabulary.ts`.

2. **`src/components/onboarding/TourMockContext.tsx`** (NEW)
   - Provider + `useTourMock()` returning `{ mockBrief, mockPlan, isTourMockActive, firstTimeUser }`.
   - Mounted by `FirstSessionGuide`; unmounts on `finish()` / `skipTourEntirely()`.

### Gating — strict triple AND

The mock renders only when **all three** are true:
- (a) `isTourMockActive` (tour mounted), AND
- (b) **genuine first-time user** (see resolver below), AND
- (c) underlying card has no real data: `outerBrief?.awaitingSignals === true` (Brief) / existing `prioritiesEmpty === true` (Plan).

**First-time-user resolver (layered):**
1. **Retake flag wins (negative signal):** if `isRetakeForUser(effectiveId)` from `firstSessionTour.ts` returns `true` → existing user → `firstTimeUser = false`. The "Retake Tour" entry is only visible to existing users in Profile, so its presence is a deterministic "not first-time" signal. Add a one-line comment in `firstSessionTour.ts` documenting this contract.
2. **Tour-source flag:** persist `source` from `startFirstSessionTour({ source })` into sessionStorage (`FST_KEYS.source`). `source === 'retake'` → existing user. Expose `getTourSource()`.
3. **Account-age fallback:** if `user.created_at` older than ~10 minutes OR `user.onboarding_completed_at` exists and any prior check-in / brief snapshot is recorded → existing user.
4. Only if all three say "fresh" → `firstTimeUser = true`.

### Consumer wiring (minimal)
- `src/hooks/useOuterReadiness.ts` — short-circuit to `MOCK_BRIEF` when gate passes.
- `src/components/home/TodayThreePriorities.tsx` — render `MOCK_PLAN_PRIORITIES` read-only; Start buttons are no-ops during tour (no DB writes, no analytics).
- Small "Demo preview" pill in the corner of mocked cards.
- On tour end, provider unmounts → both consumers revert to real state.

---

## 4. Mobile retake: auto-close side panel before showing intro modal

**Behaviour today:** On iOS, user opens side panel → Profile → "Retake Tour". `Profile.handleRetakeTour` calls `startFirstSessionTour({ source: 'retake' })` and `navigate('/daily-check-in?tour=1')`. The native sheet/panel can remain visually open on top, partially obscuring the *"Let's show you around — A quick 3-step tour…"* intro modal.

**Fix:**
1. In `src/pages/Profile.tsx` → `handleRetakeTour`:
   - Call `setSidebar(false)` (via `useSidebarSafe()` — same hook `FirstSessionGuide` already uses) **before** `navigate(...)`. Works for both desktop sidebar and mobile bottom sheet.
   - Dispatch an existing close event if no provider is mounted at `Profile` route; otherwise add a tiny `closeAppPanels()` util that sets `sidebar=false` and emits `window.dispatchEvent(new Event('mm:close-panels'))`. `LeftSidebar` already listens for sidebar state; mobile sheet honours the same flag.
2. In `FirstSessionGuide.tsx`, when mounting and detecting `source === 'retake'`, defensively call `setSidebar(false)` once on mount so the intro modal is always the topmost element.
3. Update intro modal copy step count from "3-step tour" → **"5-step tour"** to match the new step count (one-line edit in the existing intro card body).

Acceptance: tapping "Retake Tour" on iOS closes the side panel and lands the user on `/daily-check-in?tour=1` with the *"Let's show you around"* card as the first visible surface — nothing else on top.

---

## Body-copy guardrails (all 5 steps)
- Never say "side menu", "sidebar", "hamburger", "navigation drawer".
- Refer to entries as **Reset button** and **Insight button**.
- Prevent / Prepare framing per CEO Self-Regulation Framework §1, §6.
- ≤30 words per body; passes `forbiddenWords` filter.
- Sentence-case, Chief-of-Staff voice, no wellness verbs.

---

## Files Touched
- `src/components/onboarding/FirstSessionGuide.tsx` — +2 steps, padding, sidebar open/close, mount `TourMockContext`, intro copy "5-step", retake auto-close.
- `src/utils/firstSessionTour.ts` — persist `source`; expose `getTourSource()`; document retake contract.
- `src/pages/Profile.tsx` — `handleRetakeTour` closes side panel before navigate.
- `src/pages/PlanPage.tsx` — move `data-tour="daily-plan"` to outer card.
- `src/pages/ExecutiveHome.tsx` — verify Brief anchor wraps full card.
- `src/components/onboarding/tourMockData.ts` — NEW.
- `src/components/onboarding/TourMockContext.tsx` — NEW (provider, hook, resolver).
- `src/hooks/useOuterReadiness.ts` — gated mock short-circuit.
- `src/components/home/TodayThreePriorities.tsx` — gated mock render, read-only Start.
- `mem://features/onboarding/app-tour` — update: 5 steps, no sidebar wording, triple-AND mock gating, mobile retake auto-closes panel.
