

## Merge Triangle and Self-Mastery Map into One Unified Section

### Recommendation: Keep the Triangle, Integrate the Details

The triangle chart is the stronger visual -- it gives C-suite leaders an immediate read on their pattern shape. The separate card list below it duplicates the same three dimensions with the same scores. The fix: merge the meta-skill pills and descriptors directly into the chart section, eliminating the separate "Self-Mastery Map" cards entirely.

**What the unified section looks like:**

1. Section title: **"Your Self-Mastery Map"** (moves up to wrap the chart)
2. The triangle chart with scores on the axis labels (as now)
3. Directly below the chart (inside the same card), three compact rows -- one per dimension -- showing:
   - Dimension name + score (bold)
   - Meta-skill pills inline (Self-Regulation, Resilience, Confidence, etc.)
   - No descriptor text (the pills themselves communicate what's underneath)

This gives leaders the visual shape (triangle) plus the drill-down (what each axis actually develops) in one cohesive block, without repeating the data.

### Additional Changes

**Development path line** -- added between the AI insight and the value proposition:
> "Your practice will prioritise [practice_priority_label] -- the highest-leverage area given your pattern."

**CTA button colour** -- changed to `#08d780` using inline style.

### File Changed

`src/pages/onboarding/stages/Stage8Results.tsx`

### Technical Details

- Remove the standalone "Self-Mastery Map" section (lines 237-261)
- Move the section title "Your Self-Mastery Map" to wrap the chart card
- Add a compact meta-skills breakdown below the SVG inside the same card: three rows, each with dimension name, score, and pill tags
- Add a development path line after the AI insight block
- Change the CTA Button to use `style={{ backgroundColor: '#08d780' }}` and remove the default primary class colouring

