

# Gap Analysis: Coach Memory, Insight Extraction, and Auth Consolidation

## What Already Works

| Component | Status | Detail |
|-----------|--------|--------|
| Database tables (4 new) | DONE | `coach_session_summaries`, `coach_memory_index`, `coach_accountability_tracker`, `coach_pattern_observations` all exist |
| Shared auth module | DONE | `supabase/functions/_shared/auth.ts` exists with JWT verification + `/userinfo` fallback |
| `generate-coach-summary` | DONE | Uses shared auth, stores summaries + commitments to accountability tracker |
| `detect-recurring-patterns` | DONE | Uses shared auth, upserts pattern observations |
| `extract-session-memories` | DONE | Uses shared auth, indexes memories |
| `check-pending-commitments` | DONE | Uses shared auth |
| `update-commitment-status` | DONE | Uses shared auth |
| `extract-coach-insights` | DONE (partial) | Uses shared auth, extracts 11 insight types including `strength` and `growth_area` |
| Context builder retrieval | DONE | Client-side fetches last summary, pending commitments, patterns to name, recent memories |
| System prompt injection | DONE | `buildSystemPrompt()` injects memory, commitments, patterns, breakthroughs, HRV |
| Post-session pipeline | DONE | `endSession()` chains summary -> patterns -> memories |
| `compute-outer-readiness` Lean On/Watch For | DONE (partial) | Queries `insight_type IN ('strength', 'growth_area')` -- works with current data |
| Columns added to existing tables | DONE | `pattern_area`, `meta_skill`, `check_in_date`, `resolution_status`, `resolution_note` on `user_coach_insights`; `coach_acknowledgment`, `meta_skill_demonstrated`, `pattern_area` on `tiny_wins` |

## Gaps Found

### GAP 1: Auth -- 4 functions not using shared module

| Function | Current Auth | Risk |
|----------|-------------|------|
| `self-mastery-coach` | NONE -- accepts any request with userId in body | Anyone can impersonate any user |
| `analyze-probing-effectiveness` | NONE -- accepts any request | Anyone can trigger analysis for any user |
| `compute-outer-readiness` | Old `/userinfo` pattern (rate-limit-prone) | 429 errors under load |
| `state-patterns-insights` | Old `/userinfo` pattern (no retry) | Fails silently under load |

### GAP 2: `extract-coach-insights` missing replacement logic

Current behavior: Inserts ALL insights every session, including multiple `strength` and `growth_area` entries. This means users accumulate duplicate strength/growth_area insights rather than maintaining exactly one active of each type.

Missing: The "one active strength, one active growth_area" replacement logic where new insights only replace old ones if different AND higher confidence.

### GAP 3: `extract-coach-insights` extraction prompt too basic

Current prompt is generic (lines 29-57). Missing: the detailed format rules for `strength` and `growth_area` -- second person ("You..."), under 20 words, behaviorally specific, observed by coach not self-reported.

### GAP 4: `state-patterns-insights` uses keyword matching only

Lines 233-243 use regex keyword matching to find coach strength/friction insights. This misses explicit `insight_type = 'strength'/'growth_area'` records. Should prioritize explicit types and fall back to keyword matching for legacy data.

### GAP 5: `insight_type_v2` column never written to

The column was added in migration but no code writes to it. All code uses `insight_type`. Two options: (A) start writing to both columns, or (B) drop `insight_type_v2` and keep using `insight_type` since it already has the expanded types. Option B is cleaner.

### GAP 6: Missing database indexes for insight queries

No indexes exist on `user_coach_insights` for `insight_type + is_active` queries, which are now used by `compute-outer-readiness` and should be used by `state-patterns-insights`.

---

## Implementation Plan

### Phase 1: Database -- Add missing indexes

Add a migration with:
- Composite index on `user_coach_insights(user_id, insight_type, is_active)` for fast Lean On/Watch For lookups
- Index on `user_coach_insights(insight_type)` for type-based filtering

### Phase 2: Auth Migration (4 functions)

**2a. `self-mastery-coach`** -- Currently the trickiest because it's a streaming function called from the client with `VITE_SUPABASE_PUBLISHABLE_KEY` (anon key) in the Authorization header, NOT an Auth0 token. The client sends `userId` in the body with no verification.

Fix: The client (`useCoachConversation.ts`) already calls `getAccessToken()` for other functions. Update the `sendMessage` flow to pass the Auth0 token instead of the anon key. Then add shared auth verification in the edge function.

**2b. `analyze-probing-effectiveness`** -- Same pattern. Called from `endSession()` with the anon key. Update to use Auth0 token + shared auth.

**2c. `compute-outer-readiness`** -- Replace inline `verifyAuth0Token()` (50 lines) with `import { verifyAuth0JWT } from "../_shared/auth.ts"`.

**2d. `state-patterns-insights`** -- Replace inline `/userinfo` call with shared auth import.

### Phase 3: Enhanced `extract-coach-insights`

**3a. Upgrade extraction prompt** -- Replace the generic prompt with the detailed one that specifies:
- `strength`: second person, under 20 words, behaviorally specific, observed by coach
- `growth_area`: second person, under 20 words, non-judgmental, correctable pattern
- Include `pattern_area` and `meta_skill` in extraction format
- Threshold: confidence >= 0.7 for strength/growth_area (stricter than other types)

**3b. Add replacement logic** -- After extraction:
1. Check if an active `strength` insight exists for this user
2. If new strength is different AND higher confidence, deactivate old, insert new
3. Same for `growth_area`
4. All other types (commitment, pattern_observed, etc.) accumulate normally

### Phase 4: `state-patterns-insights` enhancement

Update the coach insights section (lines 233-243) to:
1. First query for explicit `insight_type IN ('strength', 'growth_area')` with `is_active = true`
2. If found, use those directly (no keyword matching needed)
3. Fall back to keyword matching only when no explicit types exist

### Phase 5: `self-mastery-coach` server-side HRV retrieval (optional enhancement)

The client already sends HRV data via the context object. For a server-side approach, the function would query `wearable_data` directly. This is an enhancement, not a gap fix -- the current client-side approach works but means HRV data traverses the network.

---

## Technical Details

### Auth change for `self-mastery-coach`

Current client code (useCoachConversation.ts line ~196):
```
Authorization: Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}
```

Updated to:
```
Authorization: Bearer ${accessToken}
```

And the edge function handler changes from:
```
const { messages, flowType, sessionId, userId, context } = await req.json();
```

To:
```
const verifiedUserId = await verifyAuth0JWT(req.headers.get('Authorization'));
const { messages, flowType, sessionId, context } = await req.json();
// userId is now verifiedUserId, not from body
```

### Replacement logic for strength/growth_area insights

After AI extraction, before bulk insert:
```
For each insight type in ['strength', 'growth_area']:
  1. Query existing active insight of this type
  2. If exists AND new insight is different AND confidence is higher:
     - UPDATE old: set is_active = false
     - INSERT new with is_active = true
  3. If no existing: INSERT new
  4. If exists but new is same or lower confidence: skip
```

### `state-patterns-insights` query update

Replace keyword regex scan with:
```
1. Query: SELECT insight_content FROM user_coach_insights
   WHERE user_id = $1 AND insight_type = 'strength' AND is_active = true
   ORDER BY created_at DESC LIMIT 1

2. Query: SELECT insight_content FROM user_coach_insights
   WHERE user_id = $1 AND insight_type = 'growth_area' AND is_active = true
   ORDER BY created_at DESC LIMIT 1

3. If either is null, fall back to keyword matching on all insights
```

## Implementation Order

1. Database migration (indexes)
2. Auth: `compute-outer-readiness` + `state-patterns-insights` (safe, just swapping auth implementation)
3. Auth: `analyze-probing-effectiveness` (add shared auth, update client call)
4. `extract-coach-insights` enhancement (prompt + replacement logic)
5. `state-patterns-insights` enhancement (prioritize explicit types)
6. Auth: `self-mastery-coach` + client update (most complex, do last)

