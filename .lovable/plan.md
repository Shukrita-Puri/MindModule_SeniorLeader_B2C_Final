

## Diagnosis: Insights Page Performance Issues

### Root Cause

The Insights page fires **4 parallel edge function calls** on load, each requiring a cold-start:

1. `state-patterns-insights` (from `Insights.tsx` → `fetchStatePatterns`)
2. `tiny-wins-insights` (from `Insights.tsx` → `fetchTinyWinsInsights`)
3. `insights-semantic-analysis` (from `Insights.tsx` → `fetchSemanticAnalysis`)
4. `performance-rhythm-insights` (from `PerformanceRhythmCard` component, independently)

Each edge function has a cold-start of ~35-50ms server-side, but from mobile web with slower network, the total waterfall (auth token acquisition + 4 HTTPS round-trips to separate Deno isolates) can easily exceed 10-15 seconds. On poor mobile connections, functions can timeout entirely, leaving the page stuck on the `<Loader2>` spinner forever.

Additionally:
- The main `loading` state blocks the **entire page** behind a full-screen spinner — nothing renders until `fetchStatePatterns` completes
- Each auth token call (`getAuthToken()`) is called independently in each fetch function rather than being acquired once
- `PerformanceRhythmCard` in DEV_MODE makes **8 sequential/parallel DB queries** including a follow-up query for dialogue messages

### Plan

#### 1. Progressive rendering — remove full-screen loading gate (`Insights.tsx`)

**Current**: Lines 750-756 show a full-screen `Loader2` spinner until `loading` (tied to `fetchStatePatterns`) resolves. Nothing is visible.

**Fix**: Remove the top-level loading gate. Let each card show its own loading state independently (they already have internal spinners). Render the page shell, header, and card containers immediately. Each card loads progressively as its data arrives.

- Remove `const [loading, setLoading] = useState(true)` and the full-screen spinner block (lines 750-756)
- Remove `setLoading(true)` / `setLoading(false)` from `fetchStatePatterns`
- Each section already handles its own `winsLoading`, `patternsLoading`, `semanticLoading` states

#### 2. Single auth token acquisition (`Insights.tsx`)

**Current**: `getAuthToken()` is called 3 times independently (once per edge function call), plus once more in `PerformanceRhythmCard`.

**Fix**: Acquire the token once at the start of `useEffect`, then pass it to each fetch function. This eliminates 3 redundant token checks.

#### 3. Lazy-load below-fold cards (`Insights.tsx`)

**Current**: All 4 edge functions fire simultaneously on mount.

**Fix**: 
- Fire `state-patterns-insights` and `tiny-wins-insights` immediately (above-fold cards)
- Defer `insights-semantic-analysis` (Mind Map, bottom of page) — only fetch when user scrolls near it, using `IntersectionObserver`
- `PerformanceRhythmCard` already loads independently — add a small delay or intersection trigger

#### 4. Add timeout + error handling for edge functions

**Current**: No timeout on edge function calls. If a function hangs, the card spinner spins forever.

**Fix**: Wrap each `supabase.functions.invoke` in a `Promise.race` with a 15-second timeout. On timeout, show a "Could not load" message instead of infinite spinner.

### Files to Change

- `src/pages/Insights.tsx` — Remove loading gate, single token, lazy-load Mind Map
- `src/components/insights/PerformanceRhythmCard.tsx` — Add timeout wrapper

### Impact

- **Desktop**: Page shell visible immediately; cards load progressively in ~1-3s
- **Mobile web**: Page visible instantly; cards load as connections complete; timeout prevents infinite hang

