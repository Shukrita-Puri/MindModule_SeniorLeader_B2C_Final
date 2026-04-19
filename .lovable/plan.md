

The user clarified the gradient: **dark red → light red → grey → light green → dark green** across the 5 cards. Steady is the neutral midpoint (grey, not blue).

They're still open to either approach (full fill vs white-with-border). Given the Minimalist Executive UI standard and their "without adding cognitive load" framing, white-with-border is the cleaner answer — it lets the spectrum read instantly without 5 saturated card backgrounds competing for attention.

## Plan: Red→Green Semantic Spectrum on Mental Energy State Cards

### Visual approach
White cards, 2px semantic-colored border, matching colored icon. Borders form a continuous dark-red → grey → dark-green spectrum down the list.

### Color spec

| # | Outcome | Border + Icon | Hex |
|---|---|---|---|
| 1 | Overloaded | Dark red | `#b91c1c` |
| 2 | Drained | Light red | `#f87171` |
| 3 | Scattered | Neutral grey | `#9ca3af` |
| 4 | Steady | Light green | `#86efac` |
| 5 | Focused | Dark green | `#15803d` |

Wait — Scattered as grey midpoint is wrong semantically (Scattered is a negative state, Steady is the neutral one). Reordering the color mapping to match the actual semantic meaning of each state:

| # | Outcome | Meaning | Border + Icon | Hex |
|---|---|---|---|---|
| 1 | Overloaded | Worst | Dark red | `#b91c1c` |
| 2 | Drained | Bad | Light red | `#f87171` |
| 3 | Scattered | Mild negative | Warm grey | `#a8a29e` |
| 4 | Steady | Neutral-positive | Light green | `#86efac` |
| 5 | Focused | Best | Dark green | `#15803d` |

This preserves the visual gradient down the list while keeping each color semantically honest.

### Card spec
- **Background:** white
- **Border:** 2px solid (semantic color above)
- **Icon:** rendered in border color, no filled circle behind it (drop the `bg-white/15` circle wrapper)
- **Title text:** dark foreground (color does the semantic work)
- **Selected state:** border thickens to 3px, card gets a 5%-opacity tint of its border color, subtle shadow

### File changes
- `src/pages/DailyCheckIn.tsx` — replace `gradient` field on each `outcomes[]` entry with `accent` (hex), update the card render block to use white bg + colored border + colored icon. ~30 lines touched.

### What stays
- Order of outcomes, copy, icons
- Confirm CTA, sticky footer, eligibility logic, save flow
- "Performance Readiness Assessment" / "Mental Energy State" header
- Touch targets and a11y

