

# Refactor: Lean On / Watch For → "Chief of Staff Memory"

## Summary

Replace the current `getLeanOnWatchFor()` cascade (which mixes immediate calendar/wearable/recovery data with personal signals) with a tenure-gated, pattern-only system. The Phrase/Body/Pills continue to handle "Now" data unchanged.

## Scope Boundary

**DO NOT TOUCH**: phrase, bodyText, signal pills, calendar pills, state statement, compass logic, score row, or any rendering outside the lean on/watch for section.

**ONLY CHANGE**: The `getLeanOnWatchFor()` function, the archetype/tier/CC matrices it references, `formatFallbackSignal()`, the LLM prompt's lean on/watch for instructions + few-shot examples, and the `LeanOnPill` UI component styling.

---

## 1. Edge Function: `supabase/functions/compute-outer-readiness/index.ts`

### A. Rewrite `getLeanOnWatchFor()` — Tenure-Gated Ladder

Replace the current P-1 → P5 cascade with three branches based on `checkInCountTotal` (pass as new parameter):

**Day 1 (`checkInCountTotal === 0`)**:
- Source: Archetype × Tier only (or tier fallback if no archetype)
- No coach, no C×C, no calendar, no wearable

**Days 2–6 (`checkInCountTotal` 1–6)**:
- Priority 1: Coach insights (recent or grace tier) → `SIGNAL · COACH`
- Priority 2: C×C modifier → `SIGNAL · CHECK-IN`
- Priority 3: Archetype × Tier fallback → `SIGNAL · ARCHETYPE`

**Day 7+ (`checkInCountTotal` ≥ 7)**:
- Priority 1: Coach insights (recent/grace) → `SIGNAL · COACH`
- Priority 2: DOW pattern (if `typicalDOWOutcome` exists) → `SIGNAL · PATTERN`
- Priority 3: HRV event correlation (if `hrvEventCorrelation` exists) → `SIGNAL · DATA`
- Priority 4: Score trajectory (if `scoreTrajectory7d` declining 3+ days) → `SIGNAL · PATTERN`
- Priority 5: Pending coach commitment → `SIGNAL · COACH`
- Priority 6: C×C modifier → `SIGNAL · CHECK-IN`
- Priority 7: Archetype × Tier fallback → `SIGNAL · ARCHETYPE`
- Priority 8: Tier fallback → `SIGNAL · READINESS`

New parameters needed: `checkInCountTotal`, `typicalDOWOutcome`, `typicalDOWScore`, `hrvEventCorrelation`, `scoreTrajectory7d`, `pendingCommitment`, `dayName`.

### B. Delete "Immediate" Functions

Remove from lean on/watch for usage (these still exist for phrase/body if needed elsewhere, but their results no longer feed into `getLeanOnWatchFor`):
- `getEveningInsights()` — delete function entirely
- `getSundayEveningInsights()` — delete function entirely
- `buildDaytimeLeanOnSuffix()` — delete function entirely
- `buildDaytimeWatchForSuffix()` — delete function entirely
- Remove the wearable recovery override (P-1 block) from `getLeanOnWatchFor` — wearable recovery stays in phrase/body

### C. Rewrite Archetype × Tier Matrix — 2–4 Word Signals

Strip "Your" prefix, cap at 2–4 words:

```typescript
const archetypeMatrix = {
  'grounded-leader': {
    depleted: { leanOn: "Stillness Instinct", watchFor: "Absorbing Others' Load" },
    managing: { leanOn: "Grounded Stability", watchFor: "Quiet Drain Pattern" },
    strong:   { leanOn: "Natural Authority", watchFor: "Maintenance Mode Trap" },
    peak:     { leanOn: "Grounded Precision", watchFor: "Tunnel Focus Risk" },
  },
  'resilient-performer': {
    depleted: { leanOn: "Recovery Intelligence", watchFor: "Performing Resilience" },
    managing: { leanOn: "Baseline Resilience", watchFor: "Settling Operational" },
    strong:   { leanOn: "Performance Window", watchFor: "Burning Early" },
    peak:     { leanOn: "Competitive Edge", watchFor: "Peak Spent Fast" },
  },
  'clear-thinker': {
    depleted: { leanOn: "Economy of Thought", watchFor: "Over-Processing" },
    managing: { leanOn: "Analytical Clarity", watchFor: "Cognitive Over-Investment" },
    strong:   { leanOn: "Sharpest Insights", watchFor: "Analysis Past Insight" },
    peak:     { leanOn: "Analytical Precision", watchFor: "Complexity Addiction" },
  },
  'intensity-driver': {
    depleted: { leanOn: "Rest-as-Fuel Wisdom", watchFor: "Forcing Empty Intensity" },
    managing: { leanOn: "Directed Drive", watchFor: "Pace Impatience" },
    strong:   { leanOn: "Sustainable Intensity", watchFor: "Outpacing the Day" },
    peak:     { leanOn: "Full-Force Capability", watchFor: "Opening Full Intensity" },
  },
  'adaptive-navigator': {
    depleted: { leanOn: "Situational Awareness", watchFor: "Adapting to Demands" },
    managing: { leanOn: "Strategic Flexibility", watchFor: "Adaptive vs Firm" },
    strong:   { leanOn: "Strategic Read", watchFor: "Over-Navigating" },
    peak:     { leanOn: "Strategic Agility", watchFor: "Complexity Over Decision" },
  },
};
```

Legacy IDs mirror the same values. Same treatment for tier fallbacks and C×C modifiers — all stripped to 2–4 word signals.

### D. Rewrite C×C Modifier — 2–4 Words

```typescript
// Both low → leanOn: "Self-Honesty", watchFor: "Premature Commitments"
// Both high → leanOn: "Full Alignment", watchFor: "Rigidity from Conviction"
// High clarity + low confidence → leanOn: "Clear Direction", watchFor: "Delaying Action"
// Low clarity + high confidence → leanOn: "Execution Confidence", watchFor: "Moving Without Direction"
// etc.
```

Remove the evening-specific variants (evening is no longer special for these fields).

### E. Rewrite Tier Fallbacks — 2–4 Words

```typescript
depleted: { leanOn: "State Awareness", watchFor: "Over-Committing" },
managing: { leanOn: "Operational Steadiness", watchFor: "Over-Extending" },
strong:   { leanOn: "Above-Baseline Capacity", watchFor: "Diffusing Capacity" },
peak:     { leanOn: "Full Capacity", watchFor: "Peak Spent Unchecked" },
```

### F. New Day 7+ Pattern Sources

Add new pattern-based signal generators using enrichment data already fetched:

- **DOW Pattern**: `typicalDOWOutcome` + current outcome divergence → e.g. `Strong Monday Clarity · PATTERN`
- **HRV Correlation**: `hrvEventCorrelation` → e.g. `Board Meeting HRV Drop · DATA`
- **Score Trajectory**: `scoreTrajectory7d === 'declining'` → e.g. `Declining Week Trajectory · PATTERN`
- **Pending Commitment**: `pendingCommitment` → e.g. `Pre-Board Centering · COACH`

### G. Update `formatFallbackSignal()`

- Strip "Your " prefix from signal text
- Cap at 4 words (not 8)
- SOURCE labels in uppercase: `ARCHETYPE`, `COACH`, `PATTERN`, `DATA`, `CHECK-IN`, `READINESS`

### H. Update LLM System Prompt — Lean On/Watch For Section Only

Replace the current instruction (line ~3215):

```
leanOn and watchFor are your LONG-TERM MEMORY of this leader — patterns observed over weeks, NOT today's data.

NEVER reference in leanOn/watchFor: today's calendar, today's readiness score, today's wearable metrics, today's felt state. Those belong in phrase/body/pills.

ALLOWED SOURCES ONLY: Coach-identified patterns, Archetype traits, DOW trends, HRV correlations, score trajectories, behavioural streaks.

FORMAT: Each item = {"signal": "2-4 WORD SIGNAL", "source": "SINGLE UPPERCASE WORD"}
SOURCE must be one of: ARCHETYPE, COACH, PATTERN, DATA, CHECK-IN
SIGNAL must be an analytical insight label, not a data point or sentence.

EXAMPLES:
✓ {"signal":"Stillness Instinct","source":"ARCHETYPE"}
✓ {"signal":"Monday Energy Dip","source":"PATTERN"}  
✓ {"signal":"Board HRV Correlation","source":"DATA"}
✓ {"signal":"Decision Speed","source":"COACH"}
✗ {"signal":"HRV down 22% from baseline","source":"Wearable"} ← belongs in body
✗ {"signal":"Heavy afternoon ahead","source":"Calendar"} ← belongs in body
✗ {"signal":"Your readiness score improved","source":"Score"} ← belongs in phrase

If no pattern/archetype data exists, return empty arrays for leanOn/watchFor rather than generic statements.
```

Update few-shot examples to use 2–4 word signals with uppercase single-word sources. Remove calendar/wearable/score references from leanOn/watchFor in all examples.

### I. Null Handling

If `getLeanOnWatchFor` returns null (no valid pattern data), the response should set `leanOn: null` and `watchFor: null` so the UI hides the section cleanly.

---

## 2. Frontend: `src/components/home/DecisionReadinessBrief.tsx`

### A. Update `parseSignalSourcePairs()` — Reduce Word Cap

Change max words from 10 to 5 (matching 2–4 word signals + buffer).

### B. Update `LeanOnPill` — Uppercase SOURCE

```tsx
function LeanOnPill({ signal, source }: { signal: string; source: string }) {
  return (
    <span className="text-[11px] font-body text-foreground/80 leading-relaxed">
      {signal}
      {source && (
        <span className="text-muted-foreground/45 ml-1 uppercase tracking-wider text-[9px]">
          · {source}
        </span>
      )}
    </span>
  );
}
```

### C. Null Guard

If `outerBrief?.leanOn` is null/empty, hide the entire "How to show up" section (already handled by `{outerBrief?.leanOn && ...}`).

---

## Files Changed

1. `supabase/functions/compute-outer-readiness/index.ts` — Major refactor of lean on/watch for logic only
2. `src/components/home/DecisionReadinessBrief.tsx` — Minor UI update (uppercase source, word cap)

Edge function redeploy required. No database changes. No changes to phrase/body/pills logic.

