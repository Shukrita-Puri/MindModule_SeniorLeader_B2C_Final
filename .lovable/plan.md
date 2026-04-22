

## Plan: Gate page content behind the engraved loader's full step sequence

Today the loader cycles through its scripted steps, but the actual content reveals as soon as the data arrives — which can happen before the loader has finished narrating. Result: the steps look decorative instead of informative, and content can pop in mid-script.

This change makes the loader **the single source of "ready"**: content waits until **both** (a) the data has arrived AND (b) the loader has played every step at least once, in order. No jumbled reveals.

### Behavior

For each of the four surfaces (Brief, Plan, Insights, Onboarding Results):

1. The loader plays its scripted steps in fixed order, one after the other.
2. The last step holds on screen (it does not loop back to step 1).
3. The page content stays hidden — the loader card stays mounted — until the loader signals "all steps done" AND the underlying fetch is complete.
4. Once both conditions are true, the loader fades out and the content fades in as one block (no half-rendered cards).
5. If the data is slower than the script, the loader sits on its final step (e.g. "Drafting your brief…") until data lands.
6. If the data is faster than the script, content still waits for the script to finish — the user sees the full mixture narration.

### Step durations & sequences (locked, in order)

| Surface | Steps (in order) | Per-step | Total min wait |
|---|---|---|---|
| **Brief** (`DecisionReadinessBrief.tsx`) | Reading your signals… → Assessing your day… → Mapping patterns & context… → Drafting your brief… | 1400ms | ~5.6s |
| **Plan** (`TodayThreePriorities.tsx`) | Reading today's brief… → Scanning your demands… → Matching practices to your state… → Sequencing your 3 priorities… | 1400ms | ~5.6s |
| **Onboarding Results** (`Stage8Results.tsx`) | Reading your responses… → Mapping your performance dimensions… → Identifying your archetype… → Calibrating your baseline… → Drafting your report… | 1400ms | ~7s |
| **Insights** (`Insights.tsx`) | Reading your leadership patterns… → Connecting wins & themes… → Synthesising your insights… | 1400ms | ~4.2s |

(Per-step duration is tunable via the existing `stepDurationMs` prop. 1400ms keeps each line readable without feeling slow.)

### Implementation

**1. Extend `EngravedLoader` (`src/components/ui/engraved-loader.tsx`)**

Add two props:
- `onAllStepsComplete?: () => void` — fires once, when the last step has been displayed for one full `stepDurationMs` interval.
- The existing cycling logic already stops at the last step (it does not wrap). After the final step's interval elapses, fire `onAllStepsComplete()` from inside the same `setInterval` tick that would have advanced beyond the end. The interval is then cleared.

No visual change. Backwards-compatible — existing callers without the callback continue to work.

**2. Add a "ready gate" pattern in each consumer**

Each of the four files gets the same small pattern:

```tsx
const [scriptDone, setScriptDone] = useState(false);
const dataReady = /* existing condition: data present + not loading */;
const showContent = scriptDone && dataReady;
```

Render rule:
- If `!showContent` → render the loader card only, with `onAllStepsComplete={() => setScriptDone(true)}`.
- If `showContent` → render the actual content (existing JSX), wrapped in `animate-fade-in`.

This means the loader card stays mounted (and continues to display its final step) until the data lands, even after the script ends. As soon as data lands, the swap happens.

**3. Per-file specifics**

- **`src/components/home/DecisionReadinessBrief.tsx`** (loader at lines ~1493–1514):  
  `dataReady = !outerBriefLoading && !!outerBrief`. Gate the entire `return (...)` (lines 1516+) behind `showContent`.

- **`src/components/home/TodayThreePriorities.tsx`** (loader at lines ~613–620):  
  `dataReady = !loading && horizonModules && horizonModules.length > 0`. Empty/error state (lines 627+) is **not** gated — those still appear immediately if the fetch finishes empty (they are not "content arriving in random order", they are an alternate terminal state).

- **`src/pages/onboarding/stages/Stage8Results.tsx`** (loader at lines ~196–211):  
  `dataReady = !loading && !!results && !error`. Error state still bypasses the gate. Five-step script means a min ~7s narration before the report renders — appropriate given onboarding is a one-time moment.

- **`src/pages/Insights.tsx`** (loader at lines ~838–850):  
  Currently the loader sits **above** the tabs while tabs render below in parallel — that's the "jumbled" reveal you're seeing. Fix: move the gate so the **tab bar + tab content block** (lines ~852 to the close of the tab content area) is hidden until `scriptDone && !patternsLoading && !winsLoading && !semanticLoading`. The page header ("Mental Performance Insights" + subtitle) stays visible above the loader so the user has page context. The two inline card-level loaders (`Loading momentum…`, `Loading mind map…`) stay as-is — they're scoped to their card and won't fire until the parent reveals.

**4. No changes to**

- Edge functions, data flow, fetch logic.
- Loader visual / SVG / animation.
- Empty-state and error-state handling (those bypass the gate intentionally).
- Other pages already using the loader without scripted steps (`/connected-data`, route-level `Suspense`, guards) — they have no script to wait on.
- React Query `placeholderData` behavior (refetches still keep previous data visible; the script-gate only applies to true cold loads where there's no prior data).

### Files touched

| File | Change |
|---|---|
| `src/components/ui/engraved-loader.tsx` | Add `onAllStepsComplete` prop; fire once after the final step has held for one interval. |
| `src/components/home/DecisionReadinessBrief.tsx` | Add `scriptDone` gate; render brief content only when script done AND data ready. |
| `src/components/home/TodayThreePriorities.tsx` | Same gate around the priorities content (not the empty/error state). |
| `src/pages/onboarding/stages/Stage8Results.tsx` | Same gate around the results report (not the error state). |
| `src/pages/Insights.tsx` | Move the loader to gate the tab bar + tab content; keep page header always visible. |

### Verification

1. **Brief**: Hard-refresh `/executive-home`. Loader narrates all 4 steps in order; even if the edge function returns in 1s, the brief card does not appear until "Drafting your brief…" has been shown. Then the full brief fades in as one piece.
2. **Plan**: Navigate to `/plan`. All 4 steps narrate in order; the 3 priority cards appear together, never one-by-one mid-script.
3. **Insights**: Open `/insights`. Header stays visible; loader narrates all 3 steps; the tabs and cards reveal together, not while the loader is still mid-script.
4. **Onboarding Results**: Complete onboarding stage 7 → land on results. All 5 steps narrate in order; the report appears only after "Drafting your report…".
5. **Slow data**: Throttle to Slow 3G — loader sits on its final step until data arrives, never loops back to step 1.
6. **Cached/refetch**: Returning to a page with already-cached data → no loader (existing `placeholderData` behavior preserved).
7. **Errors**: Force an error response → error state appears immediately (not gated).
8. **Mobile 375px**: All loaders stay centered; no layout jump when content reveals.

### Out of scope

- Changing the step copy or order (using exactly what the user specified).
- Looping animations or progress bars beyond what `EngravedLoader` already does.
- Adding per-step real backend phase tracking (this is scripted narration, not live phase events — appropriate for the "show the mixture" intent).
- Other surfaces (route-level Suspense, guards, ConnectedData) — they have no scripted steps to gate against.

