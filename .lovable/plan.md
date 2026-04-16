

## Mental Performance OS Refactor — Plan

### Critical Architectural Decision

The prompt has an internal conflict:
- **Rule 1 (DB)**: "Rename column 'Sharpness/Energy' to `mental_energy_state`" + "Update allowable strings to `Overloaded | Depleted | Scattered | Steady | Focused`"
- **Guardrail 5**: "Do not modify the logic of the Performance Brief... Do not update Edge Functions or scoring formulas... Ensure the string is passed correctly to avoid breaking existing data row entries"

The current column is `daily_checkins.outcome` (text), with values `overwhelmed | drained | scattered | steady | focused` consumed by **16+ files including 6+ Edge Functions** (`generate-mastery-plan`, `infer-current-state`, `compute-outer-readiness`, `learn-checkin-patterns`, `state-patterns-insights`, `daily-checkins`). Renaming the column AND changing the value casing/vocabulary would break every one of these — directly violating Guardrail 5 and the existing data.

### Recommended Approach: Semantic Rename Only (Strict Scope honored)

1. **Keep DB column name `outcome`** (treat it semantically as `mental_energy_state` in UI/comments only). All edge functions stay untouched.
2. **Keep the value strings lowercase** (`overwhelmed | drained | scattered | steady | focused`) — these map 1:1 to the new display labels (`Overloaded | Depleted | Scattered | Steady | Focused`). A pure UI label change. No data migration needed, no edge functions touched, no broken historical rows.
3. **Add new column** `daily_checkins.mental_sharpness_score INTEGER` (1–5, nullable) via migration.
4. **Reuse existing columns** `clarity_level` (1–5) and `confidence_level` (1–5) for Mental Clarity and Confidence — only display labels change.

This satisfies the user's intent (new vocabulary, new score column, three sliders) while honoring every guardrail.

---

### 1. Database Migration

```sql
ALTER TABLE public.daily_checkins
  ADD COLUMN IF NOT EXISTS mental_sharpness_score INTEGER
  CHECK (mental_sharpness_score IS NULL OR mental_sharpness_score BETWEEN 1 AND 5);
```

No rename. No value migration. No edge function changes.

---

### 2. Page 1 — `/daily-check-in` Refactor

File: `src/pages/DailyCheckIn.tsx`

- **Subtitle**: change `"Mental Sharpness State"` → `"Mental Energy State"`
- **Reorder + restyle outcomes array** (value strings unchanged, only display + colors + icons):

| value (DB) | Display label | Icon | Gradient |
|---|---|---|---|
| `overwhelmed` | OVERLOADED | `AlertTriangle` | `from-red-700 to-rose-500` (Deep Crimson) |
| `drained` | DEPLETED | `BatteryLow` | `from-amber-600 to-orange-400` (Amber/Orange) |
| `scattered` | SCATTERED | `Cloud` | `from-slate-500 to-zinc-400` (Muted Grey) |
| `steady` | STEADY | `Minus` (level/bed icon) | `from-teal-600 to-cyan-400` (Soft Teal) |
| `focused` | FOCUSED | `ArrowUp` | `from-emerald-700 to-green-400` (Emerald) |

- Remove sub-text (already done).
- Keep current sidebar header + `FloatingPillNav` + sticky CTA layout untouched.

---

### 3. Page 2 — `/check-in-detail` Refactor

File: `src/pages/CheckInDetail.tsx`

- **Title subtitle**: change `"Clarity & Confidence State"` → `"Mental Performance Signals"`
- **Add a 3rd slider** above the existing two: **Mental Sharpness (Renewal)** with state `mentalSharpness`, `mentalSharpnessTouched`.
- **Update all three slider labels**:
  - **Mental Sharpness (Renewal)**: `Depleted, Dull, Stable, Acute, Peak`
  - **Mental Clarity (Resolve)**: `Clouded, Obscured, Neutral, Lucid, Crystal` (replaces current "Foggy/Hazy/Neutral/Clear/Sharp")
  - **Confidence (Recalibration)**: `Reactive, Uncertain, Poised, Certain, Unshakable` (replaces current "Uncertain/Hesitant/Neutral/Steady/Certain")
- **Save logic**: `bothTouched` → `allThreeTouched`. Persist `mental_sharpness_score` in addition to `clarity_level` and `confidence_level`.
  - DEV_MODE: extend the existing `.update({ clarity_level, confidence_level, mental_sharpness_score })` call directly on the table.
  - Production: extend the existing `UPDATE_CLARITY_CONFIDENCE` invocation body with `mentalSharpness` (the edge function will need a tiny additive change — see §5).
- Keep all existing styling (luxury glass card, slider variant, layout, sidebar, FloatingPillNav).

---

### 4. Edge Function — Minimal Additive Change (NOT a logic change)

File: `supabase/functions/daily-checkins/index.ts`

Single additive change in the `UPDATE_CLARITY_CONFIDENCE` action: accept optional `mentalSharpness` in the body and include `mental_sharpness_score` in the UPDATE payload when provided. No scoring logic touched, no other actions touched, no read-side functions touched. Zero downstream impact (existing consumers don't read this column).

This is the minimum required to persist the new score from production. It does not modify any "Performance Brief" calculations or scoring formulas.

---

### 5. Insights Page — `Your Week at a Glance` Recolor

File: `src/components/insights/PerformanceRhythmCard.tsx` (the actual "Week at a Glance" widget; `EnergyRhythm.tsx` is unused/legacy here but will be updated for consistency).

Update the `stateColors` map only — gradients + glow + legend labels:

| value | Legend label | New gradient |
|---|---|---|
| `overwhelmed` | Overloaded | `from-red-700 to-rose-500` |
| `drained` | Depleted | `from-amber-600 to-orange-400` |
| `scattered` | Scattered | `from-slate-500 to-zinc-400` |
| `steady` | Steady | `from-teal-600 to-cyan-400` |
| `focused` | Focused | `from-emerald-700 to-green-400` |

The legend currently uses `capitalize` on the raw value. Switch to a `displayLabel` map so `overwhelmed → Overloaded` and `drained → Depleted`. All other UI, layout, dot sizing, scroll behaviour, info modal copy — unchanged.

Apply the same color/label map to `src/components/insights/EnergyRhythm.tsx` so any other surface stays consistent.

---

### 6. Files Touched (summary)

- **Migration**: add `mental_sharpness_score` column.
- **`src/pages/DailyCheckIn.tsx`**: outcomes array (icons, gradients, labels), subtitle.
- **`src/pages/CheckInDetail.tsx`**: add 3rd slider, relabel all three, persist new score, title subtitle.
- **`supabase/functions/daily-checkins/index.ts`**: single additive field in `UPDATE_CLARITY_CONFIDENCE` (the only edge-function touch — required to write the new column).
- **`src/components/insights/PerformanceRhythmCard.tsx`**: `stateColors` palette + legend labels.
- **`src/components/insights/EnergyRhythm.tsx`**: same palette/labels for consistency.

Out of scope: no changes to `generate-mastery-plan`, `infer-current-state`, `compute-outer-readiness`, `learn-checkin-patterns`, `state-patterns-insights`, scoring weights, brief logic, mastery plan derivation, RLS, or any read paths.

