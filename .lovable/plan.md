

# Merge Heart Metrics into One Pill + Refine Sleep Pill

## What Changes

### 1. Merge HRV + RHR into a single "Heart" pill

Currently HRV and RHR are separate pills. Merge them into one combined pill:

**Front (analysis):** Derived from worst-of HRV + RHR state:
- `Heart steady` (both green)
- `Heart elevated` (RHR amber/red)
- `Heart strained` (HRV red)
- `Heart dipped` (HRV amber)
- `Heart recovering` (HRV improving trend)
- Plus inline pattern (e.g., `· trend declining`)

**Back (evidence):** Combined raw metrics:
- `HRV 43ms · -18% vs baseline · RHR 62bpm`
- If only HRV: `HRV 43ms · -18% vs 52ms baseline`
- If only RHR: `RHR 62bpm · +12% vs 55bpm baseline`

### 2. Refine Sleep pill front labels

Remove raw durations/scores from front labels. Front is always analysis only:
- `Well-rested body` (green — at/above baseline)
- `Solid sleep` (green — above baseline by >10%)
- `Sleep slightly short` (amber)
- `Short sleep` (red — <6h hard floor)
- `Sleep below baseline` (red)
- `Poor sleep` (red — score <60)
- `Fair sleep` (amber — score 60-70)

**Back:** `Sleep score 78 · 7h 12m` or `6h 48m · -8% vs 7h 24m baseline`

### Files Modified

**`src/components/home/DecisionReadinessBrief.tsx`** (lines 224-393):
- Remove standalone HRV pill block (lines 224-287)
- Remove standalone RHR pill block (lines 357-393)
- Add new combined Heart pill block that reads both `hrvVal`/`hrvDev` and `rhrVal`/`rhrDev`, derives a single front label from worst-of state, and builds a combined back label with all raw metrics
- Update Sleep pill front labels to remove `fmtSleepDur()` from front — move duration to back only. Replace front with pure analysis words (e.g., `Well-rested body` instead of `Sleep at baseline · 7h 12m`)
- Update Sleep pill back label to include both score and duration when available

**`docs/PERFORMANCE_READINESS_BRIEF_LOGIC.md`**:
- Update §7 pill contract: HRV + RHR merged into "Heart" pill; Sleep front is analysis-only

### No other files change

