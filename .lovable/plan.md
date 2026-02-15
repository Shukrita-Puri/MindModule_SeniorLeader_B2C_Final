

## Fix "Your Momentum" Card — Close 3 Spec Gaps + Move IP Server-Side

### What's Changing

Three gaps exist between the current implementation and the spec, plus client-side code contains proprietary logic (dimension extraction, insight text) that must move server-side.

### Gap 1: Hide Sentiment Bubbles from UI

The spec says sentiment is "internal filter only -- not shown." Currently, sentiment bubbles (emerald-colored) appear in the bubble cluster.

**Edge function change:** Filter out `sentiment` dimension entries from the `dimensions` array before returning to client. Keep sentiment data in the database for internal analytics but exclude it from the response payload.

**Client change:** Remove sentiment color definitions, legend entry, and insight text from `PsychologicalDimensionBubbles.tsx`. Remove `sentiment` from the `DimensionData` type union.

---

### Gap 2: Elevated C-Suite Display Labels

Current labels: "Emotion", "Agency", "Regulation", "Growth Signal"
Required labels: "What you felt", "How you showed up", "How you led yourself", "What it built"

**Edge function change:** Add a `displayLabel` field to each dimension object in the response, mapped server-side:
- emotion -> "What you felt"
- agency -> "How you showed up"
- regulation -> "How you led yourself"
- growth -> "What it built"

**Client change:** Update `PsychologicalDimensionBubbles.tsx` to use `item.displayLabel` from the server response instead of the local `getDimensionLabel()` function. Update the color legend to use these labels.

---

### Gap 3: AI-Generated Momentum Observation

The edge function currently generates a template string. The spec requires an AI call with the specific prompt:

> "This leader's recent wins most reflect [emotion] and [growth dimension]. In one sentence, what does this pattern of wins reveal about their current momentum and how they are leading themselves? Speak directly to the leader. No generic language."

**Edge function change:** After aggregating dimensions, identify the top emotion and top growth signal. If LOVABLE_API_KEY is available, call Gemini with the exact prompt above (non-streaming). Use the AI response as the `observation` field. Fallback template: "Over the past two weeks your wins most reflect [top emotion] and [top growth dimension]."

**Response shape update:** Add two new fields:
- `observation`: The AI-generated one-sentence headline
- `patternLine`: "Your wins over the past 14 days most reflect [top emotion] and [top growth dimension]"

**Client change:** In `Insights.tsx`, render `observation` as the card headline (above bubbles) and `patternLine` below the bubble map.

---

### Gap 4: Move Proprietary Logic Server-Side

**Remove from client bundle:**
- `src/utils/dimensionExtraction.ts` -- keyword patterns and extraction logic (already duplicated in edge function)
- `DIMENSION_INSIGHTS` object from `PsychologicalDimensionBubbles.tsx` -- the per-dimension psychological insight text

**Move to edge function:**
- The `DIMENSION_INSIGHTS` text will be included in the edge function response as an `insight` field per dimension, computed server-side
- The client modal will simply render `item.insight` instead of calling a local function

**DEV_MODE path in Insights.tsx:**
- Remove client-side `extractDimensionsFromText()` calls
- DEV_MODE will call the edge function the same as production (the edge function handles auth via Auth0 token)
- If DEV_MODE needs to remain purely client-side, it will use the edge function with a mock/test path, or the dimension extraction stays in the edge function only

---

### Files Modified

| File | Change |
|---|---|
| `supabase/functions/tiny-wins-insights/index.ts` | Filter sentiment from response; add displayLabel + insight text per dimension; add AI observation call; add patternLine field |
| `src/components/insights/PsychologicalDimensionBubbles.tsx` | Remove sentiment styles/legend; use server displayLabel + insight; remove DIMENSION_INSIGHTS object |
| `src/pages/Insights.tsx` | Render observation headline + patternLine; remove client-side dimension extraction import; update DEV_MODE path |
| `src/utils/dimensionExtraction.ts` | Delete file (logic lives in edge function only) |

### Testing

After deployment, the edge function will be called to verify:
1. Existing wins get analyzed (analyzed_at populated)
2. Response excludes sentiment dimensions
3. Display labels use C-suite language
4. AI observation is generated
5. Pattern line follows the specified format

