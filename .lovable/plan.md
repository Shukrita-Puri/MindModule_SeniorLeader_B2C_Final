

## Your Mind Map V2 — Node-and-Line Graph Redesign

### Overview

Replace the current filled SVG bubble chart with a clean node-and-line graph inspired by the Mindsera thought pattern map. Nodes are small circles (8-24px) with labels beside them. Connection lines are thin, curved, and labeled on hover. Tapping a node opens a rich AI-generated summary panel instead of the current basic modal.

### Visual Changes

**Current**: Large filled gradient bubbles (64-96px) arranged in a flex-wrap layout with source indicator dots inside.

**New**: Small solid circles (8-24px) positioned in a force-like layout within an SVG canvas. Each node has:
- Circle sized by weight: `8 + (weight * 16)` px diameter
- Theme label text next to the circle, sized 12-16px
- Entry count beneath the label in muted text (e.g., "7 entries")
- No fill gradients, no source dots inside the circle — clean, minimal

**Connection lines**:
- Thin quadratic Bezier curves (1-2px stroke)
- Single muted color (no color coding)
- Opacity: `0.3 + (strength * 0.4)`
- On hover: label appears showing relationship type ("often co-occur", "tension between", "feeds into", "grounded by")
- Max 8 lines (up from 6)

### Node Click — Rich Summary Panel

Replaces the current simple modal. New panel structure:

1. **Header**: Theme name, source breakdown line ("Appears in: X check-ins, Y coach sessions, Z practices"), most recent mention date
2. **"What this theme reveals"**: AI-generated 3-5 sentence synthesis specific to this leader's data (not generic)
3. **"Where it shows up most"**: Source breakdown with counts
4. **"Connected to"**: List of 1-3 connected themes with relationship type labels
5. **"Explore with Coach"** button

### Edge Function Changes

Add a new action `getNodeSummary` to `insights-semantic-analysis` that:
1. Gathers all source text mentioning the theme (check-in notes, coach excerpts, practice notes)
2. Calls Lovable AI Gateway with the synthesis prompt
3. Returns pre-computed summary string + connected themes with relationship types
4. Algorithmic fallback if AI fails

Update relationship data to include a `type` field: "often co-occur" | "tension between" | "feeds into" | "grounded by"

### Technical Details

#### 1. Edge Function: `supabase/functions/insights-semantic-analysis/index.ts`

**New action handler** — `getNodeSummary`:
- Input: `keyword` (theme name)
- Gathers all source excerpts mentioning this theme (reuses existing `getBubbleDetails` logic)
- Calls Lovable AI Gateway with prompt: "Based on the following data points about this leader, write a 3-5 sentence synthesis of what the theme '[theme name]' reveals about their inner world. Speak directly to the leader. Be specific to their data. Name the pattern, its context, and what it signals. No soft language."
- Falls back to template: "[Theme] has appeared [N] times across your [top source], most recently on [date]. It tends to surface alongside [co-occurring theme]."
- Returns: `{ keyword, totalCount, sources, recentDate, aiSummary, connectedThemes: [{theme, relationshipType}] }`

**Relationship type assignment** — Update the AI extraction prompt to also return relationship types. For hardcoded pairs, assign types:
- stress/grounding, overwhelm/calm, anxiety/calm = "grounded by"
- energy drain/energy renewal, scattered/focus = "tension between"  
- stress/calm, decision fatigue/clarity = "feeds into"
- Default for AI-extracted relationships without type = "often co-occur"

**Response shape update** — `themeRelationships` gains a `type` field

#### 2. Component: `src/components/insights/InnerWorldBubbles.tsx`

Complete rewrite of the visual approach:

**Layout**: Use a deterministic positioning algorithm (not CSS flex-wrap). Place nodes in a roughly circular/organic spread within a fixed-height SVG container (~300px). Positions computed from index and weight to create a natural graph feel without physics simulation.

**Node rendering**: Each node is an SVG group containing:
- `<circle>` with radius `4 + (weight * 8)` (gives 8-24px diameter)
- `<text>` label positioned to the right or below, font-size `12 + (weight * 4)`
- `<text>` count label beneath in muted color, font-size 11

**Connection lines**: SVG paths rendered behind nodes. On hover (via SVG `<title>` or React state), show relationship type label at midpoint.

**Click handler**: Instead of opening a basic modal, calls new `onNodeClick` prop that fetches AI summary and opens the rich panel.

**Rich Summary Panel**: Full-screen modal (like current) but with the new structure:
- Loading state with spinner while AI generates
- Header with theme name + source line + date
- "What this theme reveals" section with AI paragraph
- "Where it shows up most" with source breakdown
- "Connected to" list with relationship labels
- "Explore with Coach" button

**Props update**:
```
interface ThemeRelationship {
  from: string;
  to: string;
  strength: number;
  type?: string; // "often co-occur" | "tension between" | "feeds into" | "grounded by"
}

onBubbleClick renamed to onNodeClick
New prop: onNodeSummary?: (keyword: string) => Promise<NodeSummary | null>
```

#### 3. Page: `src/pages/Insights.tsx`

- Add `fetchNodeSummary` function that calls edge function with `action: 'getNodeSummary'`
- Pass it to `InnerWorldBubbles` as `onNodeSummary` prop
- Update `SemanticAnalysis` interface to include `type` on relationships
- DEV_MODE: add relationship types to dev data

#### 4. Files Modified

| File | Change |
|---|---|
| `supabase/functions/insights-semantic-analysis/index.ts` | Add `getNodeSummary` action, add relationship types to extraction + hardcoded pairs |
| `src/components/insights/InnerWorldBubbles.tsx` | Full rewrite: node-and-line graph, rich summary panel |
| `src/pages/Insights.tsx` | Add `fetchNodeSummary`, update interfaces, pass new props |

