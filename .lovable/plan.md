

# Coach Memory & Database Architecture -- Gap Analysis and Implementation Plan

## Current State vs. Required State

### TABLES: What Exists vs. What's Missing

| Table | Status | Notes |
|-------|--------|-------|
| `dialogue_sessions` | EXISTS | Missing: `session_title`, `dominant_pattern`, `flow_type`, `inner_readiness_score`, `inner_readiness_tier`, `calendar_event_id`, `practices_recommended`, `practices_completed`, `commitments_made` |
| `dialogue_messages` | EXISTS | Missing: `message_type`, `referenced_practice_id`, `sentiment_score`, `key_themes`. **No `vector` extension** -- `message_embedding` cannot be added yet. |
| `user_coach_insights` | EXISTS | Missing: `pattern_area`, `meta_skill`, `check_in_date`, `resolution_status`, `resolution_note`. Needs expanded `insight_type` values. |
| `tiny_wins` | EXISTS | Missing: `coach_acknowledgment`, `meta_skill_demonstrated`, `pattern_area`. Already has `session_id`. |
| `coach_probing_effectiveness` | EXISTS | Created in previous step. Functional. |
| `coach_breakthrough_moments` | EXISTS | Created in previous step. Functional. |
| `coach_intervention_outcomes` | EXISTS | Pre-existing. Tracks intervention effectiveness. |
| `coach_session_summaries` | MISSING | Needs creation. |
| `coach_memory_index` | MISSING | Needs creation. **pgvector extension NOT installed** -- must enable it first, or defer embedding column. |
| `coach_accountability_tracker` | MISSING | Needs creation. |
| `coach_pattern_observations` | MISSING | Needs creation. |

### EDGE FUNCTIONS: What Exists vs. What's Missing

| Function | Status | Notes |
|----------|--------|-------|
| `self-mastery-coach` | EXISTS | Streams responses. Currently receives context from client-side `buildCoachContext()`. Does NOT do server-side memory retrieval. No auth verification (accepts raw JSON). |
| `extract-coach-insights` | EXISTS | Post-session. Uses Auth0 `/userinfo` for auth (old pattern). Extracts 4 insight types only. |
| `analyze-probing-effectiveness` | EXISTS | Post-session. **No auth at all** -- accepts any request with sessionId/userId. |
| `dialogue-session-manage` | EXISTS | Session CRUD. Uses Auth0 `/userinfo` for auth (old pattern with retry). |
| `generate-coach-summary` | MISSING | Needs creation. |
| `retrieve-coach-memories` | MISSING | Needs creation. Blocked by pgvector absence for semantic search. |
| `check-pending-commitments` | MISSING | Needs creation. |
| `update-commitment-status` | MISSING | Needs creation. |
| `extract-session-memories` | MISSING | Needs creation. Blocked by pgvector for embeddings. |
| `detect-recurring-patterns` | MISSING | Needs creation. |

### AUTH PATTERN RISK: Duplicated, Inconsistent Auth Verification

**Current problem**: Each edge function independently implements `verifyAuth0Token()` -- 22 functions each copy-paste their own version. Some use the old `/userinfo` endpoint pattern (rate-limit-prone), while `self-mastery-coach` and `analyze-probing-effectiveness` have **no auth at all**.

**Solution**: Create a shared auth utility file that all functions import from.

---

## Implementation Plan

### Phase 1: Shared Auth Module

Create `supabase/functions/_shared/auth.ts` -- a shared Deno module that all edge functions import:

- Local JWT verification using `jose` library and Auth0 JWKS (as documented in project memory)
- Single implementation, imported by all functions
- Eliminates `/userinfo` rate limiting
- Eliminates copy-paste inconsistency
- Update all new functions to use this shared module

**Note**: Existing functions will continue working with their current auth. The shared module will be adopted by all new functions first, then existing ones can be migrated incrementally.

### Phase 2: Database Migrations

**Migration 1**: Enable pgvector extension

```sql
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;
```

**Migration 2**: Add missing columns to existing tables

- `dialogue_sessions`: Add `session_title`, `dominant_pattern`, `flow_type`, `inner_readiness_score`, `inner_readiness_tier`, `practices_recommended` (text[]), `practices_completed` (text[]), `commitments_made` (text[])
- `dialogue_messages`: Add `message_type`, `referenced_practice_id`, `sentiment_score`, `key_themes` (text[])
- `user_coach_insights`: Add `pattern_area`, `meta_skill`, `check_in_date`, `resolution_status`, `resolution_note`
- `tiny_wins`: Add `coach_acknowledgment`, `meta_skill_demonstrated`, `pattern_area`

Note: `message_embedding` will be added only after confirming pgvector is available. If pgvector cannot be enabled on this plan, semantic search will use keyword/theme-based retrieval instead.

**Migration 3**: Create 4 new tables

1. **`coach_session_summaries`**: `id`, `user_id` (text), `session_id` (uuid FK), `summary_text`, `key_topics` (text[]), `dominant_pattern`, `emotional_arc`, `commitments_made` (text[]), `practices_recommended` (text[]), `wisdom_referenced` (text[]), `breakthrough_moment`, `recurring_themes` (text[]), `new_themes` (text[]), `session_quality_score`, `created_at`. UNIQUE on `session_id`. Service-role-only RLS.

2. **`coach_memory_index`**: `id`, `user_id` (text), `session_id` (uuid FK), `message_id` (uuid, nullable), `memory_type`, `memory_content`, `memory_context`, `importance_score` (default 5), `access_count` (default 0), `last_accessed_at`, `pattern_area`, `meta_skill`, `key_themes` (text[]), `created_at`. Service-role-only RLS. Embedding column deferred until pgvector confirmed.

3. **`coach_accountability_tracker`**: `id`, `user_id` (text), `session_id` (uuid FK), `commitment_text`, `commitment_type`, `target_practice_id`, `target_frequency`, `target_duration_days`, `committed_at`, `check_in_due_date`, `status` (default 'pending'), `times_checked` (default 0), `last_checked_at`, `completion_evidence`, `was_helpful`, `outcome_note`, `pattern_area`, `meta_skill`, `created_at`. Service-role-only RLS.

4. **`coach_pattern_observations`**: `id`, `user_id` (text), `session_id` (uuid FK for first_observed), `pattern_type`, `pattern_description`, `pattern_context`, `first_observed_at`, `last_observed_at`, `observation_count` (default 1), `is_improving`, `improvement_evidence`, `pattern_area`, `meta_skill`, `related_themes` (text[]), `was_named_to_user` (default false), `named_at`, `user_acknowledged`, `is_active` (default true), `resolved_at`, `created_at`. Service-role-only RLS.

**Schema note**: All `user_id` columns are `text` (Auth0 sub strings). No FK to `profiles`. FKs only to `dialogue_sessions(id)`.

### Phase 3: New Edge Functions (all use shared auth module)

**1. `generate-coach-summary`**
- Triggered post-session (after `extract-coach-insights`)
- Uses Gemini 2.5 Flash to generate structured session summary
- Stores in `coach_session_summaries`
- Also compares key_topics against last 5 summaries to identify recurring vs new themes

**2. `detect-recurring-patterns`**
- Triggered post-session (parallel with summary)
- Analyzes user messages for behavioral patterns (triggers, avoidance, strengths, friction)
- Queries existing `coach_pattern_observations` for this user
- Upserts: increment count if pattern exists, create new if not
- Flags patterns at 3+ observations that haven't been named to user

**3. `extract-session-memories`**
- Triggered after `generate-coach-summary` completes (needs summary data)
- Creates discrete memory entries in `coach_memory_index` from summary
- One entry per commitment, breakthrough, pattern, practice feedback
- Uses keyword themes for retrieval (vector embeddings deferred)

**4. `check-pending-commitments`**
- Called by `self-mastery-coach` (or client-side context builder) before each session
- Queries `coach_accountability_tracker` for `status = 'pending'` and `check_in_due_date <= now()`
- Returns commitments due for follow-up

**5. `update-commitment-status`**
- Called after coach checks on a commitment during conversation
- Updates status, evidence, outcome in `coach_accountability_tracker`

### Phase 4: Update Post-Session Pipeline

Current pipeline in `useCoachConversation.ts` `endSession()`:
1. `dialogue-session-manage` (end session)
2. `extract-coach-insights` (fire-and-forget)
3. `analyze-probing-effectiveness` (fire-and-forget)

Updated pipeline:
1. `dialogue-session-manage` (end session)
2. `extract-coach-insights` (fire-and-forget -- expanded insight types)
3. `analyze-probing-effectiveness` (fire-and-forget)
4. `generate-coach-summary` (fire-and-forget) -- NEW
5. `detect-recurring-patterns` (fire-and-forget) -- NEW
6. `extract-session-memories` (fire-and-forget, chained after summary) -- NEW

### Phase 5: Update Context Builder

Update `src/utils/coachContextBuilder.ts` and/or `self-mastery-coach` to retrieve:
- Last session summary from `coach_session_summaries`
- Pending commitments from `coach_accountability_tracker`
- Patterns flagged for naming from `coach_pattern_observations`
- Relevant memories from `coach_memory_index` (keyword-based until pgvector)
- Inject all into the system prompt context sections

### Phase 6: Fix Auth on Existing Coach Functions

- `self-mastery-coach`: Currently has NO auth verification. Add shared auth module import.
- `analyze-probing-effectiveness`: Currently has NO auth. Add shared auth module import.
- `extract-coach-insights`: Uses old `/userinfo` pattern. Migrate to shared JWT verification.

---

## pgvector Decision Point

The `vector` extension is **not currently enabled**. Two options:

**Option A (Recommended)**: Enable pgvector and add embedding columns. This enables true semantic search ("find all times we discussed board pressure" even if exact phrase doesn't match). Requires the extension to be available on the database plan.

**Option B (Fallback)**: Skip embeddings entirely. Use keyword/theme-based retrieval from `key_themes` arrays via GIN indexes and `@>` (array contains) queries. Less powerful but zero infrastructure dependency.

The plan proceeds with Option B by default, with pgvector as an enhancement if the extension can be enabled.

---

## Implementation Order

1. Create shared auth module (`_shared/auth.ts`)
2. Database migration: add columns to existing tables + create 4 new tables
3. Create `generate-coach-summary` edge function
4. Create `detect-recurring-patterns` edge function
5. Create `extract-session-memories` edge function
6. Create `check-pending-commitments` + `update-commitment-status` edge functions
7. Update `extract-coach-insights` to handle expanded insight types + commitments
8. Update `endSession()` pipeline to trigger new functions
9. Update `coachContextBuilder.ts` to retrieve summaries, commitments, patterns, memories
10. Update `buildSystemPrompt()` in `self-mastery-coach` to inject new context sections
11. Add auth to `self-mastery-coach` and `analyze-probing-effectiveness`

