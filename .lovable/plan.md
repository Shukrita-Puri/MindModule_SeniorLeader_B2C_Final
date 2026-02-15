

## Your Mind Map — Redesign Plan

### What's Changing

**Rename**: "Your Theme Map" becomes **"Your Mind Map"**

**Add AI Observation**: A personalized insight sentence appears **above** the bubble chart, generated via Lovable AI (replacing the broken direct Gemini API call that silently fails). Algorithmic fallback retained.

**Redesign Bubble Chart for Clarity**:
- Cap at **8 bubbles** (currently 12), sizes **64-96px** (currently 64-110px)
- Each bubble shows its **theme name + source icon row** (tiny dots for coach/practice/wins/checkins) so the user instantly sees where the theme comes from without clicking
- Connection lines become **labeled**: a small text label on hover or inline like "related" so dotted lines aren't mysterious
- Replace the generic bottom text with the AI observation above the map

**Redesign Click-Through Modal**:
- Remove the long generic insight paragraph (e.g., the "Communication themes reflect Emotional Intelligence development..." block)
- Replace with a **concise one-liner** tied to the user's actual data, e.g., "Appeared 7 times across your coach sessions this month"
- Keep: Theme name, mention count, source breakdown, most recent mention (date + source), "Explore with Coach" button
- Remove the "Got it" button — the X close button is sufficient

**Fix AI Pipeline**: The edge function currently calls the Google Generative AI API directly with `GEMINI_API_KEY` (which is not configured). This is the V1 bug mentioned in the spec. Migrate to Lovable AI Gateway so AI actually works.

---

### Technical Changes

#### 1. Edge Function: `insights-semantic-analysis/index.ts`

- **Add AI observation generation**: After computing `unifiedThemes`, take the top 5 weighted themes and call Lovable AI Gateway to generate a 2-sentence observation. Prompt: *"These are the five most recurring themes across this leader's check-ins, coaching sessions, and practices over the past 30 days. What do they collectively reveal about what is occupying this leader's inner world right now? Two sentences maximum. Speak directly to the leader. No generic language."*
- **Algorithmic fallback**: If AI fails or rate-limited, generate observation from top 2 themes and their source distribution (e.g., "Your inner world is currently shaped by [theme1] and [theme2], surfacing most in your coach conversations.")
- **Replace Gemini direct API call** (lines 151-212) with Lovable AI Gateway call for coach message theme extraction
- **Cap `unifiedThemes` to 8** (currently 15 on line 314)
- **Cap `themeRelationships` to 6** (currently 4 on line 364)
- **Return new field**: `aiObservation: string` in the response

#### 2. Component: `InnerWorldBubbles.tsx`

- **Bubble size range**: Change from 64-110px to 64-96px (line 112-114)
- **Max items**: Change `.slice(0, 12)` to `.slice(0, 8)` (line 119)
- **Add source indicator row** inside each bubble: 4 tiny dots below the theme name, colored/filled based on which sources contributed (coach = amber, practice = blue, wins = green, checkins = purple). This replaces the current `{item.totalCount}x` count display.
- **Connection line labels**: Add small text labels at the midpoint of each Bezier curve saying the relationship type or simply showing both connected theme names
- **Simplify modal**: Remove the long `THEME_INSIGHTS` paragraph. Replace with a concise data-driven line: "[N] mentions — mostly from [top source]". Keep source breakdown, recent mentions, and "Explore with Coach" button. Remove "Got it" button.

#### 3. Page: `Insights.tsx`

- **Rename** card header from "Your Theme Map" to "Your Mind Map"
- **Update tooltip** text to match the spec
- **Add `aiObservation` to `SemanticAnalysis` interface** and display it above the `InnerWorldBubbles` component inside the card
- **Replace** the generic bottom text ("These themes emerge from your coach conversations...") with the AI observation rendered above the map
- **DEV_MODE**: Generate a simple algorithmic observation from the dev data so the observation box always renders during development

#### 4. Files Modified

| File | Change |
|---|---|
| `supabase/functions/insights-semantic-analysis/index.ts` | Migrate AI to Lovable Gateway, add observation generation, cap themes to 8, cap relationships to 6 |
| `src/components/insights/InnerWorldBubbles.tsx` | Resize bubbles (64-96px), cap to 8, add source indicator dots, simplify modal, remove generic insights |
| `src/pages/Insights.tsx` | Rename to "Your Mind Map", add AI observation display above bubbles, update interface and DEV_MODE |

