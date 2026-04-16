

## Plan: Mature C-Suite Palette + Layout Polish

### 1. Color Palette — Mature Single-Hue Gradients

Replace bright dual-hue gradients with deeper, single-hue tonal gradients (light-to-dark within the same family), matching the previous luxury palette feel.

| State (DB value) | Display label | New gradient | Glow |
|---|---|---|---|
| `overwhelmed` | OVERLOADED | `from-red-900 to-red-700` | `rgba(127, 29, 29, 0.35)` |
| `drained` | **DRAINED** (revert from "Depleted") | `from-amber-800 to-amber-600` | `rgba(146, 64, 14, 0.35)` |
| `scattered` | SCATTERED | `from-slate-700 to-slate-500` | `rgba(51, 65, 85, 0.35)` |
| `steady` | STEADY | `from-teal-800 to-teal-600` | `rgba(17, 94, 89, 0.35)` |
| `focused` | FOCUSED | `from-emerald-800 to-emerald-600` | `rgba(6, 95, 70, 0.35)` |

Applied to:
- `src/pages/DailyCheckIn.tsx` — outcome buttons.
- `src/components/insights/PerformanceRhythmCard.tsx` — `stateColors` map + legend label `Depleted` → `Drained`.
- `src/components/insights/EnergyRhythm.tsx` — same map + label change.

DB value `drained` is unchanged. Only the displayed string flips back to "Drained".

### 2. Slider Label Updates (`CheckInDetail.tsx`)

- "Mental Sharpness" → **"Sharpness"**
- "Mental Clarity" → **"Clarity"**
- "Confidence" — unchanged.

### 3. Wider Sliders + Layout Anchoring (`DailyCheckIn.tsx` + `CheckInDetail.tsx`)

Both assessment pages need the same layout fix so the iOS feel is consistent:

```text
┌─────────────────────────────┐
│  Sidebar trigger (top)       │  ← anchored top, safe-area-inset-top
├─────────────────────────────┤
│  Title + subtitle            │
│                              │
│  Content (buttons / sliders) │  ← wider container on slider page
│                              │
├─────────────────────────────┤
│  CTA button                  │  ← sits ABOVE pill nav, not behind it
├─────────────────────────────┤
│  FloatingPillNav             │  ← bottom, safe-area-inset-bottom
└─────────────────────────────┘
```

Specific changes:

**`CheckInDetail.tsx`**
- Card max-width: `max-w-md` → `max-w-lg` (wider sliders for finer control).
- Sticky CTA `bottom`: change from `calc(env(safe-area-inset-bottom) + 16px)` to `calc(env(safe-area-inset-bottom) + 88px)` so it clears the 72px tall `FloatingPillNav` + 16px gap.
- Page padding-bottom: increase from `pb-[108px]` to `pb-[180px]` so the last slider isn't hidden behind the CTA.
- Top: ensure header uses `pt-[max(0.75rem,env(safe-area-inset-top))]` (already correct) — page anchored to top of safe area.

**`DailyCheckIn.tsx`**
- Same sticky CTA reposition (`bottom: calc(env(safe-area-inset-bottom) + 88px)`).
- Same page `pb-` increase to clear CTA + nav.
- Confirm top header uses safe-area-inset-top.

### 4. Out of Scope
No DB migration. No edge function changes. No scoring/brief logic touched. Pure UI refactor — palette, labels, spacing.

### Files Touched
- `src/pages/DailyCheckIn.tsx`
- `src/pages/CheckInDetail.tsx`
- `src/components/insights/PerformanceRhythmCard.tsx`
- `src/components/insights/EnergyRhythm.tsx`

