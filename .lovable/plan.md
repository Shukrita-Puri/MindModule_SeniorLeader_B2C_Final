

## Redesign Stage 7 and Results Page

### 1. Stage 7: Remove Redundant Pressure Question

Remove "What's your biggest pressure point right now?" -- already covered earlier. Keep only "What would make the biggest difference in how you show up?"

Auto-derive `pressure_context_tag` from the selected goal:
- `regulation_composure` / `regulation_early` / `energy_endurance` / `mindset_reframe` -> `self_regulation`
- `recovery_resilience` / `focus_clarity` -> `cognitive_load`

**File:** `src/pages/onboarding/stages/Stage7GrowthIntention.tsx`

---

### 2. Results Page Redesign

**File:** `src/pages/onboarding/stages/Stage8Results.tsx`

#### 2a. Radar Chart: Relabel and Visual Depth

Rename axes:
- "Energy Regulation" -> **"Recalibration"**
- "Focus Recovery" -> **"Clarity"**
- "Energy Renewal" -> **"Renewal"**

Visual upgrades:
- Radial gradient fill on data polygon (rich centre, fading outward)
- SVG glow filter behind the polygon
- Thicker grid lines (0.8 stroke, 0.7 opacity)
- Larger data points (r=5) with white stroke ring
- Gradient card background

#### 2b. Meta-Skills Map Section

Below the chart, a "Your Self-Mastery Map" section connecting each dimension to the meta-skills:

| Dimension | Meta-Skills |
|-----------|-------------|
| Recalibration | Self-Regulation, Resilience, Confidence |
| Clarity | Thinking Clarity, Emotional Intelligence |
| Renewal | Adaptive Capacity, Influence, Presence |

Each meta-skill shown as subtle pill tags with scores visible.

#### 2c. Value Proposition -- New Copy

Replace the current 3 weak bullets with the user's specified copy:

**Title:** "Perform at your highest level. Consistently."

**Three lines:**
1. "Your baseline tells the system who you are -- how you regulate under pressure, where you recover, where you lead from strength."
2. "As your day shifts -- the calendar, the stakes, the load -- your practice moves with it. What you need at 7am is not what you need at 9pm."
3. "The result is not a programme you follow. It is a system that works around you."

#### 2d. CTA Button

Change to: **"Unlock My Practice"** (keeps navigation to `/onboarding/payment`).

---

### 3. Component Labels Update

**File:** `src/utils/innerWorldScoring.ts`

Update `COMPONENT_LABELS` to: Recalibration, Clarity, Renewal.

---

### Technical Details

**Stage 7 pressure derivation:**
```text
const GOAL_TO_PRESSURE = {
  regulation_composure: 'self_regulation',
  regulation_early: 'self_regulation',
  recovery_resilience: 'cognitive_load',
  energy_endurance: 'self_regulation',
  focus_clarity: 'cognitive_load',
  mindset_reframe: 'self_regulation',
};
```

**Meta-skills mapping:**
```text
const DIMENSION_META_SKILLS = {
  energyRegulation: ['Self-Regulation', 'Resilience', 'Confidence'],
  focusRecovery: ['Thinking Clarity', 'Emotional Intelligence'],
  energyRenewal: ['Adaptive Capacity', 'Influence', 'Presence'],
};
```

**SVG enhancements (inside the svg element):**
```text
<defs>
  <radialGradient id="radarFill" cx="50%" cy="50%" r="50%">
    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.3" />
    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.05" />
  </radialGradient>
  <filter id="glow">
    <feGaussianBlur stdDeviation="3" result="blur" />
    <feMerge>
      <feMergeNode in="blur" />
      <feMergeNode in="SourceGraphic" />
    </feMerge>
  </filter>
</defs>
```

