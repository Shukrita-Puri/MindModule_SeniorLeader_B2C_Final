

## Plan: Layout Polish + Color Distinctness + Audit Confirmation

### Audit Findings (No code changes needed)

| Item | Status |
|---|---|
| Page 1 → `daily_checkins.outcome` (lowercase: `overwhelmed`/`drained`/`scattered`/`steady`/`focused`) | ✓ Correct |
| Page 2 → `clarity_level`, `confidence_level`, `mental_sharpness_score` (NOT `clarity_score`/`sharpness_score` as you wrote — those columns don't exist) | ✓ Writing to the correct existing columns |
| Single row per session (unique `user_id + checkin_date + time_window`) | ✓ Page 1 upserts, Page 2 updates same row |
| Sidebar shows "Executive Edition" + "Assessment" entry | ✓ Already in place |
| Edge functions / DB column names untouched | ✓ Frontend translation layer (display labels) bridges UI ↔ DB |
| Insights "Week at a Glance" using new labels + palette | ✓ Already updated previously — only Steady color change pending |

**Note**: Your prompt referenced `sharpness_score` / `clarity_score` / `confidence_score`. The actual DB columns are `mental_sharpness_score`, `clarity_level`, `confidence_level`. Sliders are correctly writing to these.

---

### 1. Page 1 Layout Fix (`src/pages/DailyCheckIn.tsx`)

- **Subtitle obscured** root cause: `pt-16` on the scroll container + `py-6` on hero leaves the subtitle vertically tight under the fixed header. Fix: increase top padding to `pt-20` (creates breathing room below the 56px header) and add hero `mt-2`.
- **Buttons too wide**: container is currently `max-w-lg` full-width. Change buttons to ~88% width via `w-[88%] mx-auto` on each card, keeping the container width unchanged (clean centered look, breathing room on both sides).
- **Cloud icon shape**: keep `lucide-react` `Cloud` but apply `strokeWidth={1.75}` and `className="w-5 h-5"` (currently `1.75` strokeWidth not set — Lucide default `2` makes the cloud look angular at small sizes). Use `strokeWidth={1.5}` for a softer, more recognizable cloud silhouette.

### 2. Page 2 Layout Fix (`src/pages/CheckInDetail.tsx`)

- **"Mental Performance Signals" subtitle obscured**: same root cause. Fix: change scroll container from `pt-16` to `pt-20`, and add `mt-2` on hero block. Also add `mt-6` on the slider card wrapper to push the glass card down further so the subtitle clears comfortably.
- **Slider width** already `max-w-lg` — confirmed adequate. No change needed beyond the top spacing fix.

### 3. Distinct "Steady" Color (Page 1 + Insights)

Steady currently uses `from-teal-800 to-teal-600`, which on small mobile screens reads close to Focused's `from-emerald-800 to-emerald-600`. 

**New Steady palette**: deep slate-blue → indigo (clearly distinct from both grey Scattered and green Focused, while staying in the "calm/stable" semiotic family).

`from-blue-900 to-blue-700` — deep navy-blue gradient. Glow: `rgba(30, 58, 138, 0.35)`.

Color separation map (visual distance verified):
- Scattered → cool grey (slate-700→500)
- **Steady → deep navy-blue (blue-900→700)** ← new
- Focused → emerald green (emerald-800→600)

Applied in 3 files:
- `src/pages/DailyCheckIn.tsx` — `outcomes[3].gradient`
- `src/components/insights/PerformanceRhythmCard.tsx` — `stateColors.steady`
- `src/components/insights/EnergyRhythm.tsx` — same

### 4. Mobile Responsiveness Sanity

Both pages already have:
- `pb-[200px]` → ample clearance for sticky CTA + 72px FloatingPillNav
- Sticky CTA `bottom: calc(env(safe-area-inset-bottom) + 88px)` → above pill nav
- Header uses `pt-[max(0.75rem,env(safe-area-inset-top))]` → safe area respected

Adding `pt-20` on the scroll container (up from `pt-16`) gives the title/subtitle the extra 16px of breathing room needed below the fixed header on small viewports (390–414px wide).

### 5. Files Touched

- `src/pages/DailyCheckIn.tsx` — `pt-20`, `mt-2`, button `w-[88%]`, Cloud `strokeWidth={1.5}`, Steady gradient.
- `src/pages/CheckInDetail.tsx` — `pt-20`, `mt-2` on hero, `mt-6` on card.
- `src/components/insights/PerformanceRhythmCard.tsx` — `stateColors.steady` gradient + glow.
- `src/components/insights/EnergyRhythm.tsx` — same.

### Out of Scope
No DB migration. No edge function changes. No column renames. No scoring/brief logic touched. Pure UI polish + 1 color swap.

