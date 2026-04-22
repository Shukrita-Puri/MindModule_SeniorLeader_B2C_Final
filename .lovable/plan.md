

## Plan: Real hand-drawn engraved-pencil aesthetic + fixed-rail spectrum slider

Two genuine craft fixes. The current overlay is too faint to read as "engraved pencil." The current slider's filled-gradient also confuses what the user is choosing. Both are addressed below as a Senior UX call.

---

### 1. Make the engraved-pencil texture actually *look* hand-drawn

**Problem:** the current `EngravedFill` is a single rotated SVG `<line>` pattern at 12-18% opacity. From a few inches away it just reads as "slightly textured color" — not the inked, scribbled, woodcut feel the rest of the app uses (Reset Studio, EngravedLoader, onboarding hero). Reference images show **dense zig-zag scribbles + irregular hatch lines**, not a clean diagonal screen.

**Fix — rewrite `EngravedFill` as a layered hand-drawn pattern:**

- Replace the single straight-line pattern with a **multi-stroke SVG `<pattern>` tile** (~24×24px) that contains:
  - 4-5 short irregular **zig-zag strokes** at varying angles (45° base, ±5° jitter), `strokeLinecap="round"` for a pencil tip feel.
  - A second sparser cross-hatch layer at -45° with 1-2 wandering lines per tile.
  - Slight stroke-width variation (0.6px → 1.1px) so the marks read as a human hand, not a printer.
  - Subtle `filter: url(#pencilRoughen)` using `<feTurbulence baseFrequency="0.9" numOctaves="2"/>` + `<feDisplacementMap scale="1.2"/>` to break the geometric regularity → the strokes look "sketched."
- Bump the overall blend opacity to **~0.32** (track) / **~0.45** (filled state) so the texture is *visible* — not whispered. With `mix-blend-mode: multiply` on color, this still preserves the underlying hex within WCAG AA for white icon/label.
- Add a thin **2px hand-drawn outline rect** inside the same SVG (slightly wavy via the same turbulence filter) so each surface reads as a *drawn shape*, not a CSS rectangle. Sits inside the existing `rounded-2xl` clip — the button shape itself stays perfectly even (per your constraint).

This single component change cascades to the 5 state buttons and to the slider track/range, so the look is consistent across the check-in flow without touching any layout.

**Files touched (this part):** `src/components/ui/engraved-fill.tsx` (rewrite, ~80 lines), no API change — same `density` / `opacity` / `crossHatch` props, drop-in.

---

### 2. Fix the slider: fixed colour rail, moving thumb (Senior UX recommendation)

**Problem:** today the `luxury` slider paints the gradient *only on the filled (Range) portion*. So as the user drags from 1→5:
- At value 1, only a sliver of coral is visible — they don't even see what colors are available.
- At value 3, the gradient gets compressed into the left half — colors look wrong.
- At value 5, the full spectrum shows but only because they happened to land at the end.
This is the opposite of how a spectrum picker should work — the user can't *see what they're choosing* until they've already chosen it.

**Best-practice fix: paint the full warm→cool spectrum on the *track* (always visible), and let only the thumb move along it.** The "filled" range becomes a transparent / very subtle pencil hatch — not a competing gradient. This mirrors how Apple's Photos color sliders, Figma's hue picker, and every professional color/intensity ramp work: the rail is the reference, the thumb is the choice.

**Concrete slider rewrite (`luxury` variant only):**

- **Track**: full coral→amber→ochre→sage→cobalt gradient (`#d8553f → #e88a52 → #d4b75a → #7ba87a → #3d6fa8`), height 18px, with the new engraved-pencil hatch overlay at ~30% opacity painted *across the entire rail*. Always visible regardless of value.
- **Range** (the filled portion): becomes a **subtle dark inner shadow + slightly denser hatch** (~+10% opacity) over the same gradient — reads as "this much of the rail has been traversed" without recoloring the spectrum. No second gradient, no compression artifacts.
- **Thumb**: enlarged to a 22×22px **drawn pencil disc** — white fill, 2px hand-drawn black ring (using the same turbulence-displaced SVG), and a small inner cross-hatch dot. Casts a soft drop shadow so it reads as a marker *on top of* the rail.
- **5 tick marks** on the rail (faint 1px vertical pencil notches at 0/25/50/75/100%) so the user sees the discrete 1-5 stops. Matches the existing 5-step `step={1}` semantics.
- The right-side label (`sharpnessLabels[mentalSharpness - 1]`) keeps updating as the user drags — that text + the thumb position are the source of truth for "what did I pick," not the color fill.

**Why this is the correct choice over the alternative ("only show one color at a time"):**
1. The spectrum communicates *meaning* (warm = depleted, cool = peak). Hiding it removes the cognitive anchor.
2. Users learn the mapping after one use ("oh, blue = peak"). Hiding/showing breaks that mental model every interaction.
3. Discoverability: a first-time user dragging the thumb sees the whole journey ahead — Hick's Law and Fitts's Law both favor visible rails.
4. Symmetry across all 3 sliders (Sharpness / Clarity / Confidence) — the same rail acts as a shared visual key.

**Files touched (this part):** `src/components/ui/slider.tsx` (`luxury` variant only), no API change — `value`, `onValueChange`, `min/max/step` all unchanged.

---

### What does NOT change

- Hex values (`#d8553f` … `#3d6fa8`) — same 5 stops as approved.
- Button shape (still perfectly even `rounded-2xl` with no wavy edge — you specifically asked for this).
- Page layouts, headings, instruction copy, sticky CTA, routing, save handlers.
- DB schema, RLS, edge functions, caching, downstream consumers (`outcome` enum, brief/plan).
- `default` slider variant — anything outside `/check-in-detail` is untouched.
- The `EngravedFill` public API — same props, same import path, drop-in upgrade.

### Verification

1. `/daily-check-in`: 5 buttons show **visibly hand-drawn** scribble + cross-hatch over each color (not a faint screen). White icon + "Overloaded" / "Drained" / "Scattered" / "Steady" / "Focused" label still pass WCAG AA contrast on the new ~32% multiply hatch.
2. Selected state: the same button gets a denser hatch + the existing scale/shadow — clearly reads as "pressed in."
3. `/check-in-detail`: each slider shows the **full coral→cobalt rail** at all times. Drag from 1→5: only the thumb + the right-side word label change; the colors do not move/compress. 5 faint tick notches visible on the rail.
4. Thumb reads as a hand-drawn pencil marker (wavy ring, hatch dot), not a glossy plastic circle.
5. No regression on any other slider in the app.
6. Mobile 375px and current 1094px: both render correctly, no overflow, no jitter.

### Out of scope

- Re-introducing the merged single-page version (already decided against).
- Animating the pencil strokes (static; performance-safe).
- Replacing the `EngravedFill` API or adding new variants — same surface area, better internals.
- Touching downstream pages or any non-check-in slider.

### Files touched

| File | Change |
|---|---|
| `src/components/ui/engraved-fill.tsx` | Rewrite internals: zig-zag + cross-hatch SVG pattern, turbulence/displacement filter, drawn outline. Same props. |
| `src/components/ui/slider.tsx` | `luxury` variant: full-spectrum gradient on the *track* (not the range), denser hatch on traversed range, hand-drawn 22px thumb, 5 tick notches. Same API. |

