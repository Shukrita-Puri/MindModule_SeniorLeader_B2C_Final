## Goal

Make `/daily-check-in`, `/executive-home`, and `/plan` *feel* like one "Today" flow shown as **Step 1 → Step 2 → Step 3**, while keeping every route, button, hook, and backend call exactly as today.

Pure presentation change. No new logic, no scoring change, no behaviour change. `/check-in-detail` keeps the same wrapper since it is a Step 1 sub-view.

---

## What the user will see

Bottom nav: rename **Brief** → **Today** (target stays `/executive-home` → Step 2). From any of the three pages the user sees the same shell:

```text
 ┌──────────────────────────────────────────────┐
 │            Hero video / gradient             │   ← matches /executive-home
 │                                              │
 │   ●─────────○─────────○                      │
 │  Step 1   Step 2   Step 3                    │
 │ Assessment  Brief   Plan                     │   ← short stepper labels
 │                                              │
 │  ┌────────────────────────────────────────┐  │
 │  │  PERFORMANCE READINESS ASSESSMENT      │  │   ← eyebrow = page's own title
 │  │                                        │  │
 │  │  …existing page body, unchanged…       │  │
 │  └────────────────────────────────────────┘  │
 └──────────────────────────────────────────────┘
       [ Today ] [ Plan ] [ Insight ] [ Reset ]   ← existing pill nav
```

Eyebrow text per step (taken verbatim from each page's current heading, no "Today" word):

- Step 1 → `PERFORMANCE READINESS ASSESSMENT`
- Step 2 → `PERFORMANCE READINESS BRIEF`
- Step 3 → `MENTAL PERFORMANCE PLAN`

Stepper dots are clickable and just call `navigate('/daily-check-in' | '/executive-home' | '/plan')` — same routes the buttons already go to. Active dot highlighted; non-blocking (user can move freely between steps, mirroring today's behaviour).

---

## Implementation (2 new files, 4 light edits)

### 1. NEW `src/components/today/TodayShell.tsx`

Pure presentational wrapper. Props:

- `step: 1 | 2 | 3`
- `eyebrow: string`
- `children: ReactNode`

Renders, in order:
1. A static hero block (gradient + still image) — same visual language as `/executive-home`, but **without** importing any brief/energy hooks. This guarantees zero coupling to data pipelines on Step 1 and Step 3.
2. `<TodayStepper current={step} />`.
3. A white rounded card containing the eyebrow (uppercase, tracked, same classes used by the brief card today) and `{children}`.

No effects, no context, no fetch.

### 2. NEW `src/components/today/TodayStepper.tsx`

~50 lines. Three buttons: Assessment / Brief / Plan with a thin connecting line. Active step uses gold accent; inactive use muted-foreground. Clicking calls `navigate(...)` to the existing route. Reuses semantic tokens only.

### 3. EDIT `src/pages/DailyCheckIn.tsx`

Wrap the outermost return:

```tsx
<TodayShell step={1} eyebrow="PERFORMANCE READINESS ASSESSMENT">
  {/* existing JSX, unchanged */}
</TodayShell>
```

If the page currently renders its own visible H1 ("Daily Check-in" etc.), keep it as `sr-only` so any tour selectors still work. All hooks, scoring writes, navigation handlers — untouched.

### 4. EDIT `src/pages/CheckInDetail.tsx`

Same wrap with `step={1}` and the same eyebrow (it is a Step 1 detail view). No body changes.

### 5. EDIT `src/pages/PlanPage.tsx`

Replace the current centered `<h1>Mental Performance Plan</h1>` block with the shell wrap, eyebrow `"MENTAL PERFORMANCE PLAN"`. The descriptive subline ("Your priorities mapped…") stays inside the card, unchanged. `TodayThreePriorities`, `DailyRitual`, `FirstSessionGuide`, `LeftSidebar`, sidebar context — all untouched.

### 6. EDIT `src/pages/ExecutiveHome.tsx`

Minimal: insert `<TodayStepper current={2} />` directly above the existing brief white card. Do **not** change the existing dynamic hero video, brief data flow, or card markup. The page's own header text stays as-is and acts as the eyebrow naturally; if duplication looks off, only the existing visible H1 line is removed (display-only).

### 7. EDIT `src/components/navigation/FloatingPillNav.tsx`

One-line change: first tab `label: 'Brief'` → `label: 'Today'`. Path stays `/executive-home`.

### 8. EDIT `src/App.tsx`

Add `'/daily-check-in'` and `'/check-in-detail'` to `PILL_NAV_VISIBLE_ROUTES` so the bottom pill (and its "Today" tab) is visible on Step 1.

---

## Safety guarantees

- **No route changes.** All paths and `ProtectedRoute / OnboardingGuard / SubscriptionGuard` chains stay identical.
- **No backend, edge-function, DB, RLS, or scoring touches.**
- **No hook, context, or service edits.** `TodayShell` and `TodayStepper` are presentational only.
- **ExecutiveHome's brief pipeline is not modified** — only a stepper inserted above the existing card.
- **Stepper is non-gating.** It mirrors current free navigation; nothing depends on completion state.
- **Static hero on Steps 1 / 3** so we don't import `useOuterBrief` etc. into pages that don't already use them.
- **Existing tests** (`src/pages/__tests__/CheckInDetail.test.tsx`) keep passing — page body is wrapped, not rewritten.
- All page-internal CTAs ("Continue → Brief", "Open Plan", etc.) keep their current `navigate(...)` targets unchanged, so the flow Step 1 → 2 → 3 still happens via the same buttons.

## Files touched

```text
NEW  src/components/today/TodayShell.tsx
NEW  src/components/today/TodayStepper.tsx
EDIT src/pages/DailyCheckIn.tsx          (wrap return)
EDIT src/pages/CheckInDetail.tsx         (wrap return)
EDIT src/pages/PlanPage.tsx              (wrap return; replace centered h1 with shell eyebrow)
EDIT src/pages/ExecutiveHome.tsx         (insert <TodayStepper current={2}/> above brief card)
EDIT src/components/navigation/FloatingPillNav.tsx   (label 'Brief' → 'Today')
EDIT src/App.tsx                         (add /daily-check-in, /check-in-detail to PILL_NAV_VISIBLE_ROUTES)
```

No new dependencies, no migrations, no edge-function deploys.
