

# Fix: Calendar Pills — Label + Past Event Bug

## Two issues

1. **"high day" label** — the raw `calendarLoad` string ('high'/'medium'/'low') is rendered directly. "High day" is not natural language. Should be "Heavy day" / "Moderate day" / "Light day".

2. **Past high-stakes events shown** — `highStakesEvents` includes ALL today's events regardless of time. The pill shows "Board Meeting · today" at 4pm for a 6am meeting. Should use `remainingHighStakes` instead, and hide the pill entirely if no remaining high-stakes events exist.

## Changes

### File: `src/components/home/DecisionReadinessBrief.tsx`

**Label fix (line 443):**
Replace raw `calLoad` with a mapped label:
```tsx
const loadLabel = calLoad === 'high' ? 'Heavy' : calLoad === 'medium' ? 'Moderate' : 'Light';
// render: {loadLabel} day · {meetingCount} meetings
```

**Past event fix (lines 447-453):**
Use `outerBrief.remainingHighStakes` (already computed server-side) instead of `outerBrief.highStakesEvents`. If `remainingHighStakes` is empty, skip the high-stakes pill entirely. The data is already available in the response — just not wired to the UI.

### No edge function changes needed
`remainingHighStakes` is already computed and returned by `compute-outer-readiness` (line 255). The fix is purely client-side.

