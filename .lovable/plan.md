## Goal — two narrow UI tweaks, no logic/backend touched

1. Retune the page-background taupe to match the Robinhood pale-sand reference (~#D6CFC2 / hsl(36 12% 80%)), keeping the existing 3-layer gradient structure intact.
2. Make the B&W onboarding visuals (StageUSPIntro hero, ShellV8 art band) blend seamlessly into the taupe canvas — no hard cut-off line.

## 1. Taupe retune — surgical, scoped to the page canvas

Risk to avoid: `--taupe`, `--taupe-highlight`, `--taupe-rich` are also used by buttons, the assessment pill, primary tokens, etc. Globally repointing them would silently restyle CTAs. So we keep those tokens untouched and add three new canvas-only tokens, used only by `.bg-app-surface`.

Edit `src/index.css`:

```css
:root {
  /* Page canvas — Robinhood-style pale sand. Only consumed by .bg-app-surface. */
  --canvas-hi:   36 14% 86%;   /* light highlight stop */
  --canvas-mid:  34 12% 80%;   /* dominant pale sand (Robinhood reference) */
  --canvas-low:  28 10% 72%;   /* warmer shadow stop bottom-right */
}

.bg-app-surface {
  background:
    radial-gradient(ellipse 120% 80% at 15% -10%, hsl(0 0% 100% / 0.55) 0%, hsl(0 0% 100% / 0.16) 30%, transparent 58%),
    radial-gradient(ellipse 90% 60% at 110% 110%, hsl(var(--canvas-low) / 0.45) 0%, transparent 60%),
    linear-gradient(165deg, hsl(var(--canvas-hi)) 0%, hsl(var(--canvas-mid)) 55%, hsl(var(--canvas-low)) 100%);
  background-repeat: no-repeat;
  background-size: 100% 100%;
}
```

That is the entire color change. No JSX. No other token reassignments. Buttons, taupe pills, CTA shadows are unaffected.

## 2. Seamless transition under the B&W onboarding art

Both call sites need their bottom edge to fade into the same taupe canvas colour (`--canvas-hi`, since the gradient starts there at top). Today:
- `ShellV8.tsx` fades into hard `#f5f0e8` (parchment) — wrong hue vs. the new canvas.
- `StageUSPIntro.tsx` has an empty `to-transparent` scrim, so the image hits the canvas with a visible engraved edge.

Fix in two files only — purely visual:

**`src/pages/onboarding/stages/v8/ShellV8.tsx`** — replace the parchment scrim with a taupe-canvas scrim using the new token, and lengthen the fade so the engraving dissolves rather than crops:

```tsx
{/* Bottom scrim → fades engraving into the page canvas */}
<div
  className="absolute inset-x-0 bottom-0 h-[70%] pointer-events-none"
  style={{
    background:
      'linear-gradient(to top, hsl(var(--canvas-hi)) 0%, hsl(var(--canvas-hi) / 0.85) 35%, hsl(var(--canvas-hi) / 0) 100%)',
  }}
/>
```

Also drop the `bg-[#f5f0e8]/25` tint overlay (it muddies the B&W) and remove any explicit `from-[#f5f0e8]` stop.

**`src/pages/onboarding/stages/StageUSPIntro.tsx`** — same scrim, sized to its 34vh hero:

```tsx
<div
  className="absolute inset-x-0 bottom-0 h-[55%] pointer-events-none"
  style={{
    background:
      'linear-gradient(to top, hsl(var(--canvas-hi)) 0%, hsl(var(--canvas-hi) / 0.6) 50%, hsl(var(--canvas-hi) / 0) 100%)',
  }}
/>
```

Result: the engraved clouds/sun fade smoothly into the same warm-sand colour the rest of the page sits on, no hairline boundary.

## Verification

- Walk all routes (Onboarding → ExecutiveHome → Recalibrate → Insights → Profile/Privacy/Terms). Background reads as the pale Robinhood sand everywhere.
- Onboarding StageUSPIntro and any v8 stage (e.g. `/onboarding/leadership-context`): no visible line between art band and body; B&W art dissolves into the canvas.
- Buttons (Take Assessment saffron, taupe CTAs, Continue), Mastery pills, MRS dial colours — all unchanged.
- No console errors; no edits to hooks/services/edge functions/supabase types.

## Files touched

- `src/index.css` — add 3 `--canvas-*` tokens, repoint `.bg-app-surface` gradient stops.
- `src/pages/onboarding/stages/v8/ShellV8.tsx` — swap art-band scrim to canvas-tinted fade.
- `src/pages/onboarding/stages/StageUSPIntro.tsx` — add canvas-tinted bottom scrim under hero image.

Nothing else.
