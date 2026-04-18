

## Plan: Rewire Glass-Box "Self-Declared" Rows + Bigger Mobile Type

### Mapping (current → target)

| Pill | Self-declared row source today | Target source |
|---|---|---|
| COGNITIVE / Sharpness | `Sharpness: {checkInOutcome}` (from /daily-check-in) | `Sharpness: {sharpnessLabel} [score X/5]` from `mental_sharpness_level` (slider 1 on /check-in-detail) |
| COGNITIVE / Clarity | `Clarity {x}/5` | `Clarity: {clarityLabel} [score X/5]` (slider on /check-in-detail) |
| PHYSIOLOGY / Energy | `Energy: {Drained/Fading/Strong/Mixed}` (derived word) | `Energy: {Overwhelmed/Drained/Scattered/Steady/Focused}` — verbatim Title-cased outcome from /daily-check-in |
| RESILIENCE / Confidence | `Confidence {x}/5` | `Confidence: {confidenceLabel} [score X/5]` (slider on /check-in-detail) |

Label maps come straight from `CheckInDetail.tsx`:
- `sharpnessLabels = ['Depleted', 'Dull', 'Stable', 'Acute', 'Peak']`
- `clarityLabels   = ['Clouded', 'Obscured', 'Neutral', 'Lucid', 'Crystal']`
- `confidenceLabels= ['Reactive', 'Uncertain', 'Poised', 'Certain', 'Unshakable']`

### Backend: expose `mental_sharpness_level`

`mentalSharpnessLevel` is not currently returned by `compute-outer-readiness`. To bind the Sharpness row to the slider value, plumb it through:

1. `supabase/functions/compute-outer-readiness/index.ts`
   - Extend the today-checkin row select to include `mental_sharpness_level`
   - Add `mentalSharpnessLevel: number | null` to the returned payload (alongside `clarityLevel` / `confidenceLevel`)
2. `src/hooks/useOuterReadiness.ts` — add `mentalSharpnessLevel?: number | null` to `OuterReadinessData`

Graceful fallback: if `mental_sharpness_level` is null (older check-ins, or user didn't complete /check-in-detail), the row falls back to current behaviour (`Sharpness: {checkInOutcome}`).

### Frontend: `src/components/home/DecisionReadinessBrief.tsx`

**1. Add label-formatting helpers** (top of file, near other helpers):
```ts
const SHARPNESS_LABELS = ['Depleted','Dull','Stable','Acute','Peak'];
const CLARITY_LABELS   = ['Clouded','Obscured','Neutral','Lucid','Crystal'];
const CONFIDENCE_LABELS= ['Reactive','Uncertain','Poised','Certain','Unshakable'];
const fmtScored = (label: string, score: number) => `${label} [score ${score}/5]`;
```

**2. `buildExecutivePills` — rewire bottom rows**

- COGNITIVE bottom (lines ~621-630): replace
  - First row: if `mentalSharpnessLevel != null` → `Sharpness: ${fmtScored(SHARPNESS_LABELS[m-1], m)}`. Else fallback to current Title-cased outcome.
  - Second row: if `clarity != null` → `Clarity: ${fmtScored(CLARITY_LABELS[c-1], c)}`.
- PHYSIOLOGY bottom (lines ~644-649): replace `energyLabel` derivation with verbatim Title-cased outcome. Row becomes `Energy: ${Title(checkInOutcome)}` for any of overwhelmed/drained/scattered/steady/focused (and others).
- RESILIENCE bottom (lines ~660-664): if `confidence != null` → `Confidence: ${fmtScored(CONFIDENCE_LABELS[co-1], co)}`. Keep the consec-low qualifier.

Tier color logic on these pills already keys off the numeric clarity/confidence and outcome — unchanged.

**3. Bigger glass-box type for mobile** (lines ~812-836)

Bump the size of every row inside the glass dropdown so leaders can read it on iOS without squinting:
- Main line: `text-xs` → `text-sm` (currently `text-xs font-medium text-foreground/85`)
- Qualifier line: `text-[11px]` → `text-xs` (currently `text-[11px] text-muted-foreground/65 italic`)
- Empty-state line: `text-[11px]` → `text-xs`

Apply identically to top rows and bottom rows so the box stays balanced.

### Untouched
- Pill front (icon, headline, signal word, badge color)
- All scoring, tier logic, calendar pills, lean-on / watch-for, brief copy
- Front-of-pill chips, FlippableChip variant, layout

### Files edited
1. `supabase/functions/compute-outer-readiness/index.ts` — add `mental_sharpness_level` to today-checkin select + payload
2. `src/hooks/useOuterReadiness.ts` — add `mentalSharpnessLevel` field to type
3. `src/components/home/DecisionReadinessBrief.tsx` — label maps, rewire bottom rows in `buildExecutivePills`, bump glass-box type sizes

