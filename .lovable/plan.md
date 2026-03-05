

## Full End-to-End Audit: Coach Edge Functions vs DB Schema

### Methodology
Cross-referenced every table read/write in all 13 coach-related edge functions against the actual database columns returned by `information_schema.columns`.

---

### EDGE FUNCTION AUDIT RESULTS

#### 1. `self-mastery-coach/index.ts` (buildServerContext — 13 parallel queries)

| # | Table | Operation | Columns Used | Status |
|---|-------|-----------|-------------|--------|
| 1 | `profiles` | READ | `user_archetype, identity_role, full_name` | OK — all exist |
| 2 | `practice_sessions` | READ | `content_type` | OK — exists |
| 3 | `daily_checkins` | READ | `outcome, checkin_date` | OK |
| 4 | `sanctuary_events` | READ | `content_id, content_type, created_at, event_type` | OK |
| 5 | `tiny_wins` | READ | `win_content, win_date` | OK |
| 6 | `coach_session_summaries` | READ | `summary_text, key_topics, dominant_pattern, commitments_made, breakthrough_moment, created_at` | OK — all exist |
| 7 | `coach_accountability_tracker` | READ | `commitment_text, committed_at, pattern_area, status, check_in_due_date` | OK |
| 8 | `coach_pattern_observations` | READ | `pattern_description, pattern_type, observation_count, pattern_area, is_active, was_named_to_user` | OK |
| 9 | `coach_memory_index` | READ | `memory_type, memory_content, memory_context, key_themes, importance_score, created_at, access_count, pattern_area` | OK |
| 10 | `coach_probing_effectiveness` | READ | `probe_type, effectiveness_score, probe_question, led_to_insight` | OK |
| 11 | `coach_breakthrough_moments` | READ | `breakthrough_content, breakthrough_type, was_acted_on, created_at` | OK |
| 12 | `user_coach_insights` | READ | `insight_type, insight_content, is_active, confidence_score` | OK |
| 13 | `calendar_events` | READ | `title, start_time` | OK |

**Verdict: CLEAN** — No column mismatches.

---

#### 2. `extract-coach-insights/index.ts`

| Table | Operation | Columns Used | Status |
|-------|-----------|-------------|--------|
| `dialogue_messages` | READ | `content, session_id, sender_type, message_index` | OK |
| `user_coach_insights` | READ | `id, insight_content, confidence_score, is_active, insight_type` | OK |
| `user_coach_insights` | WRITE | `user_id, insight_type, insight_content, source_session_id, confidence_score, is_active, pattern_area, meta_skill, content_reference, check_in_date, resolution_status` | OK — all columns exist |

**Verdict: CLEAN**

---

#### 3. `detect-recurring-patterns/index.ts`

| Table | Operation | Columns Used | Status |
|-------|-----------|-------------|--------|
| `dialogue_messages` | READ | `content, session_id, sender_type, message_index` | OK |
| `coach_pattern_observations` | READ | `id, pattern_type, pattern_description, observation_count, was_named_to_user, is_active` | OK |
| `coach_pattern_observations` | WRITE (insert) | `user_id, session_id, pattern_type, pattern_description, pattern_context, pattern_area, first_observed_at, last_observed_at` | OK |
| `coach_pattern_observations` | RPC `increment_pattern_observation` | `p_pattern_id` | OK — function exists |

**Verdict: CLEAN**

---

#### 4. `analyze-probing-effectiveness/index.ts`

| Table | Operation | Columns Used | Status |
|-------|-----------|-------------|--------|
| `dialogue_messages` | READ | `id, sender_type, content, message_index` | OK |
| `coach_probing_effectiveness` | WRITE | `user_id, session_id, message_id, probe_question, probe_type, user_response, led_to_insight, insight_markers, effectiveness_score, why_effective, topic_area` | OK — all exist |
| `coach_breakthrough_moments` | WRITE | `user_id, session_id, message_id, breakthrough_content, breakthrough_type, preceded_by_probe, probe_question` | OK — all exist |

**Verdict: CLEAN**

---

#### 5. `generate-coach-summary/index.ts`

| Table | Operation | Columns Used | Status |
|-------|-----------|-------------|--------|
| `dialogue_messages` | READ | `sender_type, content, message_index` | OK |
| `coach_session_summaries` | READ | `key_topics` | OK |
| `coach_session_summaries` | WRITE (upsert) | `user_id, session_id, summary_text, key_topics, dominant_pattern, emotional_arc, commitments_made, practices_recommended, wisdom_referenced, breakthrough_moment, recurring_themes, new_themes, session_quality_score` | OK — all exist |
| `coach_accountability_tracker` | READ | `id, commitment_text, status` | OK |
| `coach_accountability_tracker` | WRITE (insert) | `user_id, session_id, commitment_text, commitment_type, check_in_due_date, status, pattern_area` | OK |
| `coach_accountability_tracker` | WRITE (update) | `status, times_checked, last_checked_at, completion_evidence` | OK |

**Verdict: CLEAN**

---

#### 6. `extract-session-memories/index.ts`

| Table | Operation | Columns Used | Status |
|-------|-----------|-------------|--------|
| `coach_session_summaries` | READ | `*` (all columns) | OK |
| `coach_memory_index` | WRITE | `user_id, session_id, memory_type, memory_content, memory_context, importance_score, pattern_area, key_themes` | OK — all exist |

**Verdict: CLEAN**

---

#### 7. `detect-coach-scenarios/index.ts`

| Table | Operation | Columns Used | Status |
|-------|-----------|-------------|--------|
| `dialogue_messages` | READ | `content, session_id, sender_type, message_index` | OK |
| `coach_scenarios_detected` | WRITE | `user_id, session_id, scenario, dimension, event_types, confidence_score, evidence, detected_at, resolved` | OK — all exist |

**Verdict: CLEAN**

---

#### 8. `extract-tool-commitments/index.ts`

| Table | Operation | Columns Used | Status |
|-------|-----------|-------------|--------|
| `dialogue_messages` | READ | `content, session_id, sender_type, message_index` | OK |
| `coach_tools_offered` | WRITE | `user_id, session_id, tool_name, tool_description, tool_type, commitment_timeframe, scenario, offered_at, check_in_at, status` | OK — all exist |

**Note**: Does NOT write `event_types[]` — the tool doesn't map scenarios to event types. This means `generate-jit-events` won't find these tools via event_type matching.

**ISSUE FOUND**: `extract-tool-commitments` writes `scenario` but not `event_types`. The `generate-jit-events` query on `coach_tools_offered` selects `event_types` and the event scoring loop checks `t.event_types && t.event_types.includes(eventType)`. If `event_types` is empty (default `'{}'::text[]`), the pending tool boost (+12) will never trigger.

---

#### 9. `resolve-session-commitments/index.ts`

| Table | Operation | Columns Used | Status |
|-------|-----------|-------------|--------|
| `coach_accountability_tracker` | READ | `id, commitment_text, commitment_type, committed_at, times_checked, pattern_area, status` | OK |
| `dialogue_messages` | READ | `content, sender_type, message_index` | OK |
| `coach_accountability_tracker` | WRITE (update) | `status, times_checked, last_checked_at, outcome_note, resolved_at` | OK — all exist |

**Verdict: CLEAN**

---

#### 10. `generate-jit-events/index.ts`

| Table | Operation | Columns Used | Status |
|-------|-----------|-------------|--------|
| `calendar_events` | READ | `id, title, start_time, end_time, is_organizer, attendees_count, is_recurring` | OK |
| `jit_preferences` | READ | `event_type, created_at` | OK |
| `coach_scenarios_detected` | READ | `scenario, dimension, event_types, detected_at, resolved` | OK |
| `coach_tools_offered` | READ | `tool_name, tool_type, event_types, scenario, status` | OK — fixed in prior iteration |
| `dialogue_messages` | READ | `content, sender_type, timestamp` | **ISSUE** — queries column `timestamp` but actual column name is `timestamp` (OK, exists) |
| `user_coach_insights` | READ | `insight_content, insight_type, is_active` | OK |
| `jit_event_context` | WRITE (upsert) | Multiple columns | OK — all exist |

**Verdict: Mostly clean**, but see `event_types` population issue above.

---

#### 11. `check-pending-commitments/index.ts`

| Table | Operation | Columns Used | Status |
|-------|-----------|-------------|--------|
| `coach_accountability_tracker` | READ | `id, commitment_text, commitment_type, committed_at, check_in_due_date, target_practice_id, times_checked, pattern_area, status` | OK |

**Verdict: CLEAN**

---

#### 12. `update-commitment-status/index.ts`

| Table | Operation | Columns Used | Status |
|-------|-----------|-------------|--------|
| `coach_accountability_tracker` | READ | `id, user_id, times_checked` | OK |
| `coach_accountability_tracker` | WRITE | `status, times_checked, last_checked_at, completion_evidence, was_helpful, outcome_note` | OK |

**Note**: Does NOT set `resolved_at` for `completed`/`abandoned` statuses (unlike `resolve-session-commitments` which does). Minor inconsistency.

---

#### 13. `store-tiny-win/index.ts`

| Table | Operation | Columns Used | Status |
|-------|-----------|-------------|--------|
| `tiny_wins` | WRITE | `user_id, win_content, win_date, detected_at, source, session_id, practice_id, practice_type` | OK — all exist |

**Note**: Does NOT write `category` column (added in last migration). The spec says the coach should extract category. The `extract-tool-commitments` AI prompt mentions category for tiny wins but `store-tiny-win` doesn't accept it.

---

#### 14. `generate-jit-carousel/index.ts`

| Table | Operation | Columns Used | Status |
|-------|-----------|-------------|--------|
| `jit_event_context` | READ | `*` (all) | OK |
| `sanctuary_content` | READ | `id, title, content_type, category, tags, duration, sub_type, is_active` | OK |
| `sanctuary_content_metadata` | READ | `content_id, structured_tags` | OK |
| `jit_carousel_cards` | WRITE | `user_id, event_id, card_type, card_position, practice_id, practice_category, coach_tool_name, coach_context_statement` | OK |

**Verdict: CLEAN**

---

#### 15. `track-jit-skip/index.ts`

| Table | Operation | Columns Used | Status |
|-------|-----------|-------------|--------|
| `jit_event_context` | WRITE (update) | `dismissed_by_user, updated_at` | OK |
| `jit_preferences` | WRITE | `user_id, event_type, action, event_title, dismissed, skipped_at` | OK |

**Verdict: CLEAN**

---

### CLIENT PIPELINE AUDIT (`useCoachConversation.ts`)

All 9 post-session calls are wired correctly:

| # | Function | Execution | Status |
|---|----------|-----------|--------|
| 1 | `dialogue-session-manage` (end) | Awaited | OK |
| 2 | `extract-coach-insights` | Fire-and-forget | OK |
| 3 | `analyze-probing-effectiveness` | Fire-and-forget | OK |
| 4 | `generate-coach-summary` | Fire-and-forget | OK |
| 5 | `detect-recurring-patterns` | Fire-and-forget, parallel | OK |
| 6 | `extract-session-memories` | Chained after #4 (`.then()`) | OK |
| 7 | `detect-coach-scenarios` | Fire-and-forget, parallel | OK |
| 8 | `extract-tool-commitments` | Fire-and-forget, parallel | OK |
| 9 | `resolve-session-commitments` | Fire-and-forget, parallel | OK |

**Verdict: CLEAN** — Summary→memories chain is correct. All 9 EFs triggered.

---

### ISSUES FOUND (2 real issues, 1 minor)

#### Issue 1: `event_types` never populated on `coach_tools_offered` (HIGH)

**Problem**: `extract-tool-commitments` writes `scenario` but NOT `event_types[]`. The `generate-jit-events` scoring loop checks `t.event_types && t.event_types.includes(eventType)` to match pending tools to calendar events. Since `event_types` defaults to `'{}'::text[]` (empty array), the pending tool boost (+12 points) is dead code — it will never match any event.

**Fix**: In `extract-tool-commitments`, after inserting a tool with a `scenario`, look up the scenario in `SCENARIO_EVENT_MAPPING` and populate `event_types`. Import or duplicate the mapping from `detect-coach-scenarios`.

#### Issue 2: `update-commitment-status` missing `resolved_at` (LOW)

**Problem**: When `update-commitment-status` sets status to `completed` or `abandoned`, it doesn't set `resolved_at`. But `resolve-session-commitments` does. Inconsistency means manually-resolved commitments via `update-commitment-status` won't have `resolved_at`.

**Fix**: Add `resolved_at` logic to `update-commitment-status` for terminal statuses.

#### Issue 3: `store-tiny-win` ignores `category` (LOW)

**Problem**: The `category` column was added to `tiny_wins` but `store-tiny-win` doesn't accept or write it. Coach-extracted wins lack categorization.

**Fix**: Accept `category` parameter in `store-tiny-win` and pass it through.

---

### IMPLEMENTATION PLAN

1. **Fix `extract-tool-commitments`** — Import `SCENARIO_EVENT_MAPPING`, look up `event_types` from scenario, write to DB alongside the tool record.

2. **Fix `update-commitment-status`** — Add `resolved_at: new Date().toISOString()` when status is `completed` or `abandoned`.

3. **Fix `store-tiny-win`** — Accept optional `category` parameter and write to DB.

### Files Changed

| File | Change |
|------|--------|
| `supabase/functions/extract-tool-commitments/index.ts` | Add `SCENARIO_EVENT_MAPPING` lookup, populate `event_types` on insert |
| `supabase/functions/update-commitment-status/index.ts` | Add `resolved_at` for terminal statuses |
| `supabase/functions/store-tiny-win/index.ts` | Accept and write `category` field |

