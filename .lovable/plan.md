

# Progressive Unlock for Your Momentum Card

## Problem
Currently the Momentum card shows an empty state until a user has enough wins with extracted dimensions over a 14-day window. With only 1 win and no dimension data, the card feels hollow. Waiting 14 days for insights feels too long.

## Solution: Two Changes

### 1. Better Incentive Messaging (Insights.tsx)

Update `getWinsProgressMessage()` to be more specific about what unlocks at each threshold:

| Wins | Current Message | New Message |
|---|---|---|
| 0 | "Capture your first win..." | "Capture your first win during evening integration to start building your momentum map" |
| 1 | "First win captured!" | "First win captured! Log 2 more to start seeing what patterns emerge" |
| 2-4 | "X wins logged. Patterns emerge around 5+" | "X wins so far -- log {5-X} more and your momentum map will start to take shape" |
| 5-9 | (nothing) | "Your momentum map is building. At 10 wins, deeper patterns and an AI observation will appear" |
| 10+ | (nothing) | null (fully unlocked) |

### 2. Progressive Unlock: Show Partial Insights Earlier (Insights.tsx)

Instead of showing nothing until there are enough dimensions for a full bubble chart, progressively reveal content:

**3+ wins with dimensions:** Show a simple text summary of top dimensions (no bubbles yet). Example: "Your recent wins reflect pride and learning."

**5+ wins with dimensions:** Show the bubble chart (currently requires dimensions to exist, which is correct, but lower the "feels empty" threshold).

**10+ wins:** Show the full AI-generated observation headline.

This is achieved by adjusting the rendering logic in the Momentum card section (lines 761-806) to have intermediate states between "empty" and "full bubbles."

### 3. Show Partial Data Even With Few Wins

When `winsCount >= 1` but dimensions are empty (wins haven't been analyzed yet), show the win content itself as a simple list rather than an empty card. This gives the user something to see immediately.

Add a small win list display when dimensions are empty but wins exist:
- Show up to 3 recent win texts in a compact format
- Below them, the incentive message about logging more

## Files Changed

| File | Change |
|---|---|
| `src/pages/Insights.tsx` | Updated `getWinsProgressMessage()` with tiered incentive text; added intermediate rendering states showing win content when dimensions are empty; progressive bubble chart unlock at 5+ wins |

## No Edge Function Changes
The `tiny-wins-insights` edge function and `PsychologicalDimensionBubbles` component remain unchanged. This is purely a frontend display improvement.

