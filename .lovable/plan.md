

## Plan: Adjust Cognitive amber label to "PEAK STRAIN"

Single targeted change to the Cognitive pill vocabulary in the previously-approved plan.

### Change

In `src/components/home/DecisionReadinessBrief.tsx`, the new high-functioning amber Cognitive label will be `'PEAK STRAIN'` instead of `'HIGH OUTPUT'`.

Trigger conditions remain identical:
- amber cognitive state
- Sharpness ≥ 4 AND Clarity ≥ 4
- mental energy outcome not in {drained, overwhelmed}
- HRV deviation between -5% and -20%

Precedence order remains: `MASKED LOAD` → `RECOVERING` → `PEAK STRAIN` → `TAXED`.

### Everything else from the prior plan stays the same

- **Issue 1 (Physiology fallback):** RHR 0.6 / HR 0.4 weighted scoring when sleep is missing, allowing GREEN `'BODY STABLE'` for healthy heart signals, helper line `'Sleep not tracked · reading body via heart signals'`.
- **Issue 3 (Calendar copy):** evening `todaySummary` guard — never emit "dense calendar" or "tight gaps" phrasing when `meetingLabel < 3`; single-event high-pressure days read `"You carried one demanding session today."`

### Files touched

- `src/components/home/DecisionReadinessBrief.tsx` — Physiology fallback scoring, pill word map, Cognitive `PEAK STRAIN` label.
- `supabase/functions/compute-outer-readiness/index.ts` — evening `todaySummary` density guard.

### Verification

- HRV -10%, Sharpness 4, Clarity 4, Mental Energy steady → Cognitive pill reads `'PEAK STRAIN'`.
- HRV -10%, Sharpness 2, Clarity 2 → Cognitive pill still reads `'TAXED'`.
- Masked-high and recovery-underway flags still take precedence.
- 2-word rule preserved.

