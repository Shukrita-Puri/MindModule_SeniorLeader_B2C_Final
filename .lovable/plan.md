

# Coach-to-Features Integration: Gap Analysis and Implementation Plan

## Current Connection Map

The coach system generates data that feeds into four downstream features. Here is the current status of each connection:

### 1. Coach -> Outer Readiness Brief (`compute-outer-readiness`)
**Status: CONNECTED -- working correctly**
- Queries `user_coach_insights` for `insight_type = 'strength'` and `insight_type = 'growth_area'` with `is_active = true`
- Uses coach-generated insights for "Lean On" and "Watch For" with proper cascade fallback (Coach -> C+C -> Archetype -> Tier)
- Uses shared auth module (`verifyAuth0JWT`)

### 2. Coach -> Proactive Mastery Plan (`generate-mastery-plan`)
**Status: CONNECTED -- working correctly**
- Receives `coachInsights` from client-side in request body
- Uses coach insights in content scoring (+25 boost for matching content)
- Coach cards (prepare/integrate) are generated based on tier, time-of-day, and pattern state
- No auth on this function (receives userId in body) -- matches pattern since client passes pre-fetched data

### 3. Coach -> Insights Cards

**Card 1: Your Self Mastery Patterns (`state-patterns-insights`)**
**Status: CONNECTED -- working correctly**
- Prioritizes explicit `insight_type = 'strength'/'growth_area'` queries
- Falls back to keyword regex matching for legacy data
- Uses shared auth module
- Scans `dialogue_messages` for behavioral keyword patterns (regulation, clarity, renewal)

**Card 2: Your Momentum (`tiny-wins-insights`)**
**Status: PARTIALLY CONNECTED -- auth gap**
- Correctly reads from `tiny_wins` table (coach stores wins via `store_tiny_win` tool call)
- AI-enriches wins with psychological dimensions (emotion, agency, regulation, growth)
- GAP: Uses old `/userinfo` auth pattern instead of shared module

**Card 3: Your Readiness Rhythm (`performance-rhythm-insights`)**
**Status: PARTIALLY CONNECTED -- auth gap**
- Reads `daily_checkins`, `calendar_events`, `wearable_data` for heatmap generation
- Does NOT directly query coach tables but indirectly benefits from coach-driven check-in behavior
- GAP: Uses old `/userinfo` auth pattern instead of shared module

**Card 4: Your Mind Map (`insights-semantic-analysis`)**
**Status: PARTIALLY CONNECTED -- auth gap + missing coach memory data**
- Fetches coach dialogue messages from `dialogue_sessions` + `dialogue_messages` for theme extraction
- Uses AI to extract themes from coach conversations
- GAP 1: Uses old `/userinfo` auth pattern
- GAP 2: Does NOT query `coach_session_summaries` (key_topics, recurring_themes) which would provide richer, pre-analyzed theme data
- GAP 3: Does NOT query `coach_pattern_observations` for named behavioral patterns

---

## Identified Gaps

### GAP 1: Auth -- 20+ functions still using old `/userinfo` pattern

The shared auth module (`_shared/auth.ts`) was created and adopted by coach-specific functions, but the broader function set still uses copy-pasted `/userinfo` calls. Functions with gaps relevant to this feature set:

| Function | Impact |
|----------|--------|
| `tiny-wins-insights` | Momentum card auth |
| `performance-rhythm-insights` | Readiness Rhythm card auth |
| `insights-semantic-analysis` | Mind Map card auth |
| `daily-rituals` | Ritual tracking |
| `user-favorites` | Content favoriting |
| `saved-debriefs` | Saved debriefs |
| `user-progress` | User progress |
| `dialogue-data-persist` | Coach message persistence |
| `dialogue-session-manage` | Session CRUD |
| `calendar-auth` | Calendar connection |
| `certificate-request-create` | Certificates |
| + others | Various |

### GAP 2: Mind Map missing coach memory enrichment

`insights-semantic-analysis` currently processes raw `dialogue_messages` content through AI to extract themes. It does NOT use:
- `coach_session_summaries.key_topics` -- pre-extracted topics from each session
- `coach_session_summaries.recurring_themes` -- cross-session recurring themes
- `coach_pattern_observations.pattern_description` -- named behavioral patterns

Adding these sources would make the Mind Map significantly richer without additional AI calls (the data is already structured).

### GAP 3: Mastery Plan not querying coach accountability

`generate-mastery-plan` receives `coachInsights` from the client but does NOT check:
- Pending commitments from `coach_accountability_tracker` -- could influence content selection (e.g., if user committed to "try box breathing before meetings," prioritize breathing practices)
- Active pattern observations from `coach_pattern_observations` -- could boost content matching specific pattern areas

This is a minor enhancement since the plan already uses coach insights for content scoring.

---

## Implementation Plan

### Phase 1: Auth migration for insights-related functions (3 functions)

Migrate these three insight card functions to use the shared auth module:

1. **`tiny-wins-insights`** -- Replace inline `/userinfo` call (lines 164-188) with `import { verifyAuth0JWT } from "../_shared/auth.ts"`
2. **`performance-rhythm-insights`** -- Replace inline `verifyAuth0Token()` function (lines 16-26) with shared import
3. **`insights-semantic-analysis`** -- Replace inline `/userinfo` call (lines 113-131) with shared import

Each change is mechanical: remove the local auth function/call, import and call `verifyAuth0JWT(req.headers.get('authorization'))` instead.

### Phase 2: Enrich Mind Map with coach memory data

Update `insights-semantic-analysis` to query two additional data sources when building the unified theme map:

**2a. Add `coach_session_summaries` query**
- Fetch `key_topics` and `recurring_themes` arrays from the last 30 days of summaries
- Merge each topic into the unified theme map with source = 'coach'
- This replaces some of the raw message AI processing with pre-analyzed data

**2b. Add `coach_pattern_observations` query**
- Fetch active patterns (`is_active = true`) with `observation_count >= 2`
- Merge `pattern_description` keywords into the theme map with source = 'coach'
- Named patterns become nodes in the mind map, giving users visibility into what the coach has observed

This enrichment runs alongside the existing `dialogue_messages` AI extraction, not replacing it.

### Phase 3: (Optional) Mastery Plan commitment-aware content scoring

Update `generate-mastery-plan` to query `coach_accountability_tracker` for pending commitments and use `target_practice_id` to boost matching content by +15 points. This is a small enhancement that makes the plan reflect coaching work.

---

## Technical Details

### Phase 1: Auth migration pattern

For each of the 3 functions, the change follows this pattern:

Before:
```typescript
async function verifyAuth0Token(authHeader: string): Promise<string> {
  const token = authHeader.replace('Bearer ', '');
  const response = await fetch(`https://${AUTH0_DOMAIN}/userinfo`, { ... });
  // ... 15-20 lines
}
const userId = await verifyAuth0Token(authHeader);
```

After:
```typescript
import { verifyAuth0JWT } from "../_shared/auth.ts";
const userId = await verifyAuth0JWT(req.headers.get("authorization"));
```

### Phase 2: Mind Map enrichment queries

Add to `insights-semantic-analysis` after existing data fetches:

```typescript
// Fetch pre-analyzed coach topics
const { data: summaries } = await supabase
  .from('coach_session_summaries')
  .select('key_topics, recurring_themes')
  .eq('user_id', userId)
  .gte('created_at', startDate.toISOString());

// Merge summary topics into theme map
for (const summary of summaries || []) {
  for (const topic of summary.key_topics || []) {
    mergeTheme(topic, 'coach');
  }
  for (const theme of summary.recurring_themes || []) {
    mergeTheme(theme, 'coach', 2); // Weight recurring themes higher
  }
}

// Fetch active coach pattern observations
const { data: patterns } = await supabase
  .from('coach_pattern_observations')
  .select('pattern_description, observation_count, pattern_area')
  .eq('user_id', userId)
  .eq('is_active', true)
  .gte('observation_count', 2);

for (const pattern of patterns || []) {
  // Extract key phrases from pattern description
  const words = pattern.pattern_description.split(' ')
    .filter(w => w.length > 3)
    .slice(0, 3)
    .join(' ');
  mergeTheme(words, 'coach', pattern.observation_count);
}
```

### Files Modified

| File | Change |
|------|--------|
| `supabase/functions/tiny-wins-insights/index.ts` | Replace `/userinfo` auth with shared module |
| `supabase/functions/performance-rhythm-insights/index.ts` | Replace `verifyAuth0Token` with shared module |
| `supabase/functions/insights-semantic-analysis/index.ts` | Replace `/userinfo` auth with shared module + add coach memory queries |
| `supabase/functions/generate-mastery-plan/index.ts` | (Phase 3, optional) Add commitment-aware scoring |

### Deployment

All 3-4 updated edge functions will be deployed after changes.

### What stays the same

- All database tables -- no schema changes needed
- `compute-outer-readiness` -- already fully connected
- `state-patterns-insights` -- already fully connected
- `generate-mastery-plan` core logic -- coach card generation is already working
- All client-side code -- no changes needed
- Post-session pipeline -- already chains summary, patterns, memories correctly

