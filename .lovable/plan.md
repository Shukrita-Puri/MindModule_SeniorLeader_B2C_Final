

## Plan: Apply the refined cross-hatch to the slider rail (matches Daily Check-In buttons)

### What's actually happening

Both the Daily Check-In state buttons AND the Performance Readiness slider rails currently use the **same** `EngravedFill` overlay — but with **different variants**:

- **Daily Check-In buttons** → `variant="refined"` → clean diagonal cross-hatch (matches your reference)
- **Slider rail (`/check-in-detail`)** → default `variant="sketched"` → heavy zig-zag + turbulence-displaced scribble

The user wants the slider rail to use the same clean refined hatch as the buttons. Single small change.

### What changes

**File: `src/components/ui/slider.tsx`** — switch the two `EngravedFill` calls inside the luxury slider to `variant="refined"`.

```text
- <EngravedFill density={3} opacity={0.3} />
+ <EngravedFill variant="refined" density={3} opacity={0.3} />

- <EngravedFill density={3} opacity={0.18} crossHatch />
+ <EngravedFill variant="refined" density={3} opacity={0.22} />
```

(The `refined` variant already includes a perpendicular cross-hatch by default, so the `crossHatch` prop is dropped and opacity is nudged from `0.18` → `0.22` so the traversed range still reads as slightly denser than the unfilled tail.)

### What stays exactly the same

- `LuxuryThumb` — white disc with diagonal hatch fill, dark hand-drawn ring, soft drop shadow. **Unchanged.**
- Coral → amber → ochre → sage → cobalt full-rail gradient. **Unchanged.**
- Five tick notches at the 1–5 stops. **Unchanged.**
- Rail height (18px), thumb size (22×22), shadows. **Unchanged.**
- Daily Check-In buttons (already on `refined`). **Unchanged.**
- "Continue to Today's Performance" CTA. **Unchanged.**
- `EngravedFill` API. **Unchanged** — just toggling an existing prop on two call sites.

### Verification

1. `/check-in-detail`: each slider's rail shows the **clean diagonal cross-hatch** (same fine pencil hatching as the buttons), not zig-zag scribble. White-disc hatched thumb still moves along the rail. Tick notches still visible.
2. `/daily-check-in`: state buttons unchanged — still show the clean refined hatch.
3. "Continue to Today's Performance" CTA visually identical.
4. No other component uses the luxury slider variant, so no collateral changes.

### Out of scope

- Thumb design, gradient, ticks, or layout.
- Daily Check-In buttons.
- Any CTA, copy, or routing.
- DB, edge functions, or downstream logic.

