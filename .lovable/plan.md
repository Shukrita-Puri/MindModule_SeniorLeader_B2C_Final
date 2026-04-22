

## Plan: App-wide engraved loader

Replace the generic gold spinner with the existing `EngravedLoader` so every "page is still loading" moment uses the same hand-drawn pencil/woodcut indicator already used on the Brief and Plan.

### Where it applies

Two layers cover ~all "page is loading" cases:

**1. Route-level (code-split page chunks loading)** — `src/App.tsx`
- Replace the existing `LoadingFallback` (gold border-spinner) used by every `<Suspense fallback={...}>` in the router with a full-screen version of `EngravedLoader`.
- Single change, applies to ~30 routes automatically.
- Label: `"Loading…"` (default).

**2. Auth/guard gates (waiting before page even mounts)**
- `src/components/ProtectedRoute.tsx` — replace the centered `Loader2` spinner with `EngravedLoader` (label: `"Verifying session…"`).
- `src/components/OnboardingGuard.tsx` — both spinner blocks (lines ~97 and ~185) → `EngravedLoader` (label: `"Loading…"`).
- `src/components/SubscriptionGuard.tsx` — same swap if a spinner exists there.

**3. In-page content loaders for the heaviest screens** (where data fetch, not the route chunk, is the wait):
- `src/pages/ExecutiveHome.tsx` — initial state where `energyState`/`outerBrief` are both still loading and the hero hasn't resolved → show `EngravedLoader` inside the main content area instead of empty space (label: `"Reading your signals…"`). Skip if the hero video is already painting (no double indicator).
- `src/pages/Insights.tsx` — top-level loading state (if it has one) → `EngravedLoader` (label: `"Loading insights…"`).
- `src/pages/ConnectedData.tsx` — the existing centered spinner block → `EngravedLoader` (label: `"Loading connections…"`).
- `src/pages/SelfMasteryCoach.tsx` — initial session-restore spinner → `EngravedLoader` (label: `"Loading…"`).

### What stays unchanged

- **Inline component skeletons** that are already replaced or intentionally minimal (e.g. `TodayStateCard` skeleton, `RecommendedPlan` skeleton, `InsightsSnapshot` skeleton, individual chart bars). These are fast (<400ms) and a full engraved loader inside a small card would be visually heavy.
- **Brief card** and **Plan priorities** — already use `EngravedLoader` from the previous change.
- **Button-level spinners** (e.g. "Saving…" inside CTAs) — still use small inline Loader2; engraved loader is for *page/section-level* waits only.
- **Practice players** (Soundscape/Guided/Micro) — their splash/preview UI is already the loading state; no spinner change needed.

### How `EngravedLoader` is used at full-screen

Add a thin wrapper inside `App.tsx` (and reuse the same pattern in guards):

```tsx
const FullPageEngravedLoader = ({ label }: { label?: string }) => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <EngravedLoader label={label ?? "Loading…"} />
  </div>
);
```

Then `<Suspense fallback={<FullPageEngravedLoader />}>` everywhere in the router (no per-route label — keep it uniform).

### Files touched

| File | Change |
|---|---|
| `src/App.tsx` | Replace `LoadingFallback` body with `FullPageEngravedLoader` wrapping `<EngravedLoader />`. Delete gold border-spinner JSX. |
| `src/components/ProtectedRoute.tsx` | Swap `Loader2` block for `EngravedLoader` in a centered full-screen container. |
| `src/components/OnboardingGuard.tsx` | Replace both `Loader2` spinner blocks with `EngravedLoader`. |
| `src/components/SubscriptionGuard.tsx` | Same swap if a spinner exists. |
| `src/pages/ExecutiveHome.tsx` | Cold-load state (no `energyState` and no `outerBrief` yet) → render `EngravedLoader` in the main content slot. |
| `src/pages/Insights.tsx` | Top-level cold-load → `EngravedLoader`. |
| `src/pages/ConnectedData.tsx` | Replace centered loading spinner with `EngravedLoader`. |
| `src/pages/SelfMasteryCoach.tsx` | Replace initial spinner with `EngravedLoader`. |

No new components beyond an inline `FullPageEngravedLoader` wrapper. No DB / no edge function changes. The existing `EngravedLoader` SVG is reused as-is.

### Verification

1. Hard-refresh on any route while throttled to "Slow 3G" → engraved bar with `Loading…` label appears full-screen until the page chunk + guards resolve. No more gold ring spinner anywhere.
2. Navigate `/executive-home → /plan` for the first time in the session → engraved loader replaces blank space until `PlanPage` mounts and its priorities engraved loader takes over.
3. `/coach` cold load → engraved loader during session restore, then the coach UI fades in.
4. `/connected-data` cold load → engraved loader instead of the previous spinner.
5. Brief card and Plan priorities continue to show the in-card engraved loader (no duplication with full-page one).
6. Saving a check-in / submitting feedback still shows the small inline button spinner (unchanged).
7. Mobile (375px): full-screen loader is centered, label legible, no overflow.

### Out of scope

- Replacing inline button spinners or tiny per-card skeletons.
- Animating route transitions.
- Changing the engraved loader visual itself.
- Hero video / Remotion loading states (handled separately by the hero pipeline).

