

## Your Mind Map — Visual Redesign

### Problem
The current node-and-line graph looks crowded. Nodes are packed into a small SVG area (360x300) with labels overlapping. The Mindsera reference shows a much more spacious layout: nodes spread vertically with generous whitespace, thin elegant curved lines, and labels positioned beside nodes rather than crammed above them.

### Design Changes (InnerWorldBubbles.tsx only)

The edge function already contains all the calculation, AI, and logic properly. No edge function changes needed.

**1. Expand the SVG canvas**
- Increase from 360x300 to 380x420 (taller, more vertical breathing room like Mindsera)
- Increase minHeight from 250px to 340px

**2. Rewrite node positioning for spacious vertical spread**
- Instead of packing nodes in a tight circular pattern, use a more organic vertical distribution
- The highest-weight node sits upper-center; others spread in a loose vertical cascade
- Much wider padding margins (80px horizontal, 40px vertical) to prevent label clipping
- Nodes spaced at least 70px apart vertically

**3. Label positioning — beside nodes, not above**
- Move labels to the RIGHT of each node (like Mindsera) instead of above
- For nodes on the right side of the canvas, labels go LEFT to avoid overflow
- Entry count sits directly below the label text, same side
- This eliminates the vertical crowding caused by label-above-node stacking

**4. Thinner, more elegant connection lines**
- Reduce stroke width from 1.5px to 1px
- Increase curve offset for more graceful arcs (like Mindsera's gentle curves)
- Slightly lower base opacity for subtlety

**5. Smaller, cleaner nodes**
- Node radius: keep the 4 + (weight * 8) formula (8-24px diameter range) which matches spec
- Use a softer fill: `hsl(var(--muted-foreground))` with lower opacity instead of `hsl(var(--primary))` — matching Mindsera's neutral gray dots
- Remove the hover glow circle (unnecessary visual noise)

**6. Remove entrance animation**
- The `nodeEntrance` keyframe animation with staggered delays adds visual clutter
- Replace with simple opacity: 1 (instant render)

### Files Modified

| File | Change |
|---|---|
| `src/components/insights/InnerWorldBubbles.tsx` | Visual redesign: larger canvas, spacious positioning, side labels, thinner lines, neutral node color |

No edge function changes — all calculation and AI logic is already properly server-side.

### Technical Details

**Node positioning algorithm**: Place nodes in a staggered vertical layout. For `n` nodes, divide the vertical space into `n` rows. Alternate horizontal placement left-center-right with jitter to create an organic feel. The heaviest node gets the most central position. This avoids the circular packing that causes overlap.

**Label collision avoidance**: Labels positioned to the right of nodes by default (x + radius + 8). For nodes in the right 40% of the canvas, labels go left (x - radius - 8, textAnchor="end"). This ensures labels never clip the SVG boundary.
