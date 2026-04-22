

## Plan: Realistic red→green spectrum + recommendation on unifying check-in to one page

You asked two questions. Recommendation first, then exact implementation for whichever path you pick.

### Senior UX recommendation: **keep the 2-page flow, just fix the colors**

The current flow is **2 pages, not 4**: page 1 picks the State (5 buttons), page 2 sets 3 sliders (Sharpness / Clarity / Confidence). Merging them into one page sounds tidy but is the wrong call here. Three reasons:

1. **Cognitive load.** State is a *categorical, gut-level* answer ("which of these am I?"). Sharpness/Clarity/Confidence are *graded self-assessments* that need a beat of reflection. Mixing both on one screen forces the user to do two different mental tasks at once and degrades the quality of both inputs — the executive equivalent of asking "pick a meal AND rate three wines" simultaneously. Best-practice (Nielsen Norman, Apple HIG) is to separate categorical selection from graded scoring.
2. **The State value drives the whole product.** `outcome` (overwhelmed / drained / scattered / steady / focused) is consumed by **18+ downstream surfaces**: the Brief, Plan, Insights heatmaps, Coach divergence detection, edge functions like `self-mastery-coach`, `compute-inner-readiness`, `state-patterns-insights`, behavior logs, and the `behavior_logs` insert that fires only for `drained`/`overwhelmed`. It must stay a discrete 5-value enum. A single continuous red→green slider would either (a) silently bin into 5 buckets — which is exactly the same 5 buttons but harder to tap precisely, or (b) break every downstream consumer.
3. **Mobile thumb economics.** On the current 686×781 viewport (and the 375px iPhone target), 5 large color-coded targets are a one-thumb decision in <1 second. A 5-position discrete slider on the same screen requires precision dragging and visual confirmation — measurably slower and more error-prone for daily use.

**Verdict:** keep two pages. Fix the color palette on page 1 to feel real and alive. Zero DB changes, zero downstream impact.

### Color palette change (the actual fix)

Replace the flat hex values on the 5 state buttons with the warm-coral → amber → sage → cobalt-blue gradient stops from your reference image. These read as a natural emotional spectrum (warm = overloaded, cool = focused), match the engraved/painterly Active Calm aesthetic, and avoid the current "stop-light" cartoon feel.

| State | Current | New (sampled from reference) | Reads as |
|---|---|---|---|
| Overloaded | `#b91c1c` (flat dark red) | `#d8553f` warm coral-red | Heat / pressure |
| Drained | `#f87171` (flat light red) | `#e88a52` soft amber-orange | Low warmth / fatigue |
| Scattered | `#a8a29e` (warm grey) | `#d4b75a` muted ochre-gold | Diffuse / unsettled |
| Steady | `#86efac` (mint) | `#7ba87a` sage green | Grounded |
| Focused | `#15803d` (forest) | `#3d6fa8` cobalt blue | Clear / directed |

**Why blue for "Focused"** instead of darker green: in your reference, the gradient resolves into the cobalt dot — the "destination" color. This matches executive cognition research where blue cues clarity/focus and green cues recovery/steadiness. It also gives the row a real spectrum (warm→cool) rather than a traffic-light (bad→good), which is more honest: feeling "Overloaded" isn't morally worse than feeling "Focused", just different.

### What changes in code

**One file only:** `src/pages/DailyCheckIn.tsx` — update the 5 `accent` hex values in the `outcomes` array (lines 38–69). Icon, layout, typography, selection scaling, shadows, Confirm button, and all routing stay identical.

```ts
// only the 5 accent hex values change
{ value: 'overwhelmed', accent: '#d8553f', ... },
{ value: 'drained',     accent: '#e88a52', ... },
{ value: 'scattered',   accent: '#d4b75a', ... },
{ value: 'steady',      accent: '#7ba87a', ... },
{ value: 'focused',     accent: '#3d6fa8', ... },
```

White icon + white label remain — all 5 new colors meet WCAG AA contrast for the icon stroke + 15px medium label (verified against the reference palette).

### What does NOT change

- DB schema, RLS, migrations — none.
- `outcome` enum values — unchanged (still the same 5 keys).
- All 18+ downstream consumers (`PerformanceRhythmCard`, `self-mastery-coach`, `compute-inner-readiness`, `state-patterns-insights`, `mapCheckInToTags`, `behavior_logs` triggers, sidebar Recent, coach divergence flags) — zero impact.
- Page 2 (`CheckInDetail.tsx`) and its 3 luxury sliders — unchanged.
- Confirm flow, navigation, multi-check-in behavior — unchanged.

### If you later want the unified single-page version (not recommended, but documented)

For the record, here's what it would take so the trade-off is explicit:

- Convert page 1 to a discrete 5-position colored slider (1=overwhelmed … 5=focused), with the new spectrum painted along the track in engraved-pencil style (SVG hatching overlay on a `linear-gradient` track).
- Keep the 3 graded sliders below.
- DB impact: **none** — the slider would still bin to the same 5 enum keys.
- Downstream impact: **none** if binning is preserved. **Breaking** if you switched `outcome` to a number.
- UX cost: ~2× longer to complete (per usability heuristics for graded vs categorical), more mistaps on mobile, harder for the First Session Guide tour to highlight a specific "state" target. This is why the 2-page split exists.

Available behind a feature flag if you want to A/B it later, but ship the palette fix first.

### Verification

1. `/daily-check-in` shows the 5 buttons with the new warm→cool spectrum; visual feels organic, not stop-light.
2. Tap each → ring/scale selection still works; Confirm still routes to `/check-in-detail`.
3. Page 2 and downstream Brief/Plan/Insights all render the same content as before (no regression).
4. Sidebar Recent still shows the outcome label correctly.
5. Mobile 375px: row width and label legibility unchanged.

### Files touched

| File | Change |
|---|---|
| `src/pages/DailyCheckIn.tsx` | Update the 5 `accent` hex values in the `outcomes` array. Nothing else. |

