

## Visual Refinements to Results Page

**File:** `src/pages/onboarding/stages/Stage8Results.tsx`

### Changes

1. **Triangle line colour** -- Change the data polygon stroke from `hsl(var(--primary))` to `#08d780`. Same for the data point dots and the radial gradient fill stops.

2. **Grid lines more visible** -- Increase grid line stroke width to `1.2` and opacity to `0.9`. Increase spoke line opacity to `0.6`.

3. **Bigger triangle** -- Reduce card padding from `p-6` to `p-3`, and increase the SVG max-width from `max-w-xs` to `max-w-sm` so the chart fills more space.

4. **Archetype description colour** -- Change the archetype description text (e.g. "composure under pressure") to `#08d780` via inline style.

5. **Meta-skills: bold dimension names, compact pills, single line** -- Make dimension labels bold (`font-semibold text-foreground`), reduce pill font to `text-[9px]` with tighter padding (`px-1.5 py-0.5`), and reduce the min-width on labels so everything fits on one line per dimension.

6. **Development path in a box** -- Wrap the "Your practice will prioritise..." line in a styled container: `bg-muted/20 border border-border rounded-lg p-4 text-center`.

7. **CTA button** -- Already has `style={{ backgroundColor: '#08d780' }}` but the Tailwind `bg-primary` class may override it. Will add explicit class removal to ensure the inline style wins.

### Technical Details

**Lines 151:** Card padding `p-6` to `p-3`

**Lines 153:** SVG `max-w-xs` to `max-w-sm`

**Lines 155-157:** Gradient stops change `hsl(var(--primary))` to `#08d780`

**Lines 174-177:** Grid lines: `strokeWidth="1.2"` and `opacity={0.9}`

**Line 182:** Spoke lines: `opacity={0.6}`

**Lines 190, 196:** Polygon stroke and dot fill: `#08d780`

**Lines 145-147:** Archetype description: add `style={{ color: '#08d780' }}`

**Lines 210-211:** Dimension label: `text-xs font-semibold text-foreground min-w-[70px]`

**Lines 213:** Pills: `text-[9px] px-1.5 py-0.5`

**Lines 231-234:** Wrap development path in a bordered box

**Line 254:** CTA: remove any bg class conflict, keep inline style

