

# Coach Memory & Database Architecture — Implementation Status

## ✅ COMPLETED

### Phase 1: Shared Auth Module
- Created `supabase/functions/_shared/auth.ts` with local JWT verification via `jose` + Auth0 JWKS
- Includes `/userinfo` fallback with retry for opaque tokens
- `authenticateRequest()` helper for standardized error responses

### Phase 2: Database Migrations — DONE
- pgvector extension enabled
- Added columns to `dialogue_sessions`, `dialogue_messages`, `user_coach_insights`, `tiny_wins`
- Created 4 new tables: `coach_session_summaries`, `coach_memory_index`, `coach_accountability_tracker`, `coach_pattern_observations`
- All new tables use service-role-only RLS

### Phase 3: New Edge Functions — DONE
- `generate-coach-summary` — AI session summary + commitment extraction + theme comparison
- `detect-recurring-patterns` — Pattern detection + upsert + 3+ observation flagging
- `extract-session-memories` — Creates memory index entries from summary data
- `check-pending-commitments` — Queries due commitments for context injection
- `update-commitment-status` — Updates commitment status after coach check-in

### Phase 4: Updated extract-coach-insights — DONE
- Expanded from 4 to 11 insight types (commitment, pattern_observed, breakthrough, resistance, trigger, strength, growth_area)
- Now uses shared auth module
- Sets `check_in_date` and `resolution_status` for commitments

### Phase 5: Updated Post-Session Pipeline — DONE
- `endSession()` now triggers: extract-coach-insights → analyze-probing-effectiveness → generate-coach-summary → detect-recurring-patterns → extract-session-memories (chained after summary)

### Phase 6: Updated Context Builder — DONE
- `CoachContext` interface extended with `lastSessionSummary`, `pendingCommitments`, `patternsToName`, `recentMemories`
- `buildCoachContext()` fetches all 4 new data sources in parallel
- `formatContextForPrompt()` injects PENDING COMMITMENTS, PATTERNS TO NAME, LAST SESSION SUMMARY, RELEVANT MEMORIES sections

## 🔲 REMAINING

### Phase 7: Fix Auth on Existing Coach Functions
- `self-mastery-coach`: Still has NO auth verification — needs shared auth module
- `analyze-probing-effectiveness`: Still has NO auth — needs shared auth module
- Both accept raw JSON without verifying the caller

### Phase 8: Inject Memory Context into self-mastery-coach buildSystemPrompt()
- The `self-mastery-coach` edge function receives context from the client but does NOT yet use the new memory fields in its `buildSystemPrompt()` function
- Need to add sections for pending commitments, patterns to name, last session summary, and memories into the system prompt construction

### Phase 9: pgvector Embeddings (Enhancement)
- Add `message_embedding vector(1536)` column to `dialogue_messages`
- Add `memory_embedding vector(1536)` column to `coach_memory_index`
- Create `search_coach_memories` RPC function for semantic search
- Update `extract-session-memories` to generate embeddings
- Create `retrieve-coach-memories` edge function for semantic retrieval
