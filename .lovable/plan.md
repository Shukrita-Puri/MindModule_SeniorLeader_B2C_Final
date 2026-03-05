

## Audit: Tables 10-20 & Context Builder — Gaps Found

### Tables Audit Summary

| Table | Exists | Schema Match | Missing |
|-------|--------|-------------|---------|
| 10. `coach_scenarios_detected` | Yes | Complete | Missing 2 indexes (`idx_scenarios_scenario`, `idx_scenarios_resolved`) |
| 11. `coach_tools_offered` | Yes | Partial | Missing 5 columns: `checked_at`, `user_response`, `pattern_discovered`, `was_effective`, `pattern_area`. Missing 5 indexes. |
| 12. `tiny_wins` | Yes | Partial | Missing `category` column (spec: leadership/performance/relationship/learning/wellbeing). Has extra analytics columns not in spec (fine to keep). |
| 13. `jit_event_context` | Yes | Complete | Missing 1 index (`idx_jit_event_shown`) |
| 14. `jit_preferences` | Yes | Complete | Missing 3 indexes (`idx_jit_prefs_user`, `idx_jit_prefs_type`, `idx_jit_prefs_skipped`) |
| 15. `jit_carousel_cards` | Yes | Complete | Missing 1 index (`idx_carousel_cards_completed`) |
| 16. `jit_pill_display_log` | Yes | Complete | Missing 1 index (`idx_pill_log_clicked`) |
| 17. `daily_checkins` | Yes | Complete | N/A (read-only for coach) |
| 18. `profiles` | Yes | Complete | N/A (read-only for coach) |
| 19. `calendar_events` | Yes | Complete | N/A (read-only for coach) |
| 20. `daily_ritual_completions` | Yes | Complete | N/A (read-only for coach) |

### Missing DB Functions

| Function | Status |
|----------|--------|
| `increment_pattern_observation(uuid)` | **MISSING** — Used by `detect-recurring-patterns` EF spec |
| `get_practice_effectiveness(uuid)` | **MISSING** — Used by context builder spec but the server context builder fetches it differently |

### Missing RLS Policies (User SELECT)

The spec requires user-facing SELECT policies on several tables that currently only have service_role ALL:
- `coach_tools_offered` — no user SELECT policy (spec: `Users can view own tools`)
- `jit_event_context` — has user SELECT policy (fine)
- `jit_carousel_cards` — no user SELECT policy (spec: `Users can view own carousel cards`)
- `jit_pill_display_log` — no user SELECT policy (spec: `Users can view own pill logs`)

These are low-risk since the client uses edge functions (service_role) to access these, but the spec wants them for completeness.

### Context Builder Gaps (Server-Side `buildServerContext`)

The server-side context builder in `self-mastery-coach/index.ts` is largely complete. Comparing its 11 parallel queries against the spec's 22 data sources:

| Spec Data Source | Status | Notes |
|-----------------|--------|-------|
| 1. User Profile | Implemented | Lines 1407-1411 |
| 2. Today's State | Implemented | Passed from client |
| 3. Outer Readiness Compass | Implemented | Passed from client |
| 4. Calendar Context | Implemented | Via jitContext from client |
| 5. Recent Activity | Implemented | Check-in streak, practice count, tiny wins |
| 6. Recent Tiny Wins | Implemented | Within insights fetch |
| 7. Dimension Evolution | **GAP** | `dimensionEvolution` field exists in CoachContext but is never populated by `buildServerContext` — only rendered in prompt if present |
| 8. Past Conversations | Implemented | Last session summary |
| 9. Wearable Data | **GAP** | `hrvData` field exists and is rendered in prompt (lines 1851-1863), but `buildServerContext` never fetches HRV data from DB. Client doesn't pass it either. |
| 10. Current Insights (LEAN ON / WATCH FOR) | Implemented | Lines 1472-1480 |
| 11. Consecutive Pattern | Implemented | Lines 1481-1483 |
| 12. Completed Protocols Today | Implemented | Via planStatus from client |
| 13. Practice Effectiveness | **GAP** | `practiceEffectiveness` field exists and is rendered (lines 1889-1896), but `buildServerContext` never fetches it. No `get_practice_effectiveness` RPC exists. |
| 14. Pending Commitment | Implemented | Lines 1430-1437 |
| 15. Patterns to Name | Implemented | Lines 1438-1447 |
| 16. Recent Memories | Implemented | Lines 1448-1455 |
| 17. Effective Probes | Implemented | Lines 1456-1464 |
| 18. Past Breakthroughs | Implemented | Lines 1465-1471 |
| 19. Calendar-State Correlations | **GAP** | Client-side builder has `detectCalendarStateCorrelations()` (line 529-656), but server-side `buildServerContext` does not fetch this. Not rendered in server prompt. |
| 20. Time of Day | Implemented | From client |
| 21. Dominant Pattern | Implemented | `detectDominantPattern()` function at line 1695 |

### `coach_accountability_tracker` Missing Column

- `resolved_at` column is **MISSING** from the table. The `update-commitment-status` EF references it.

---

### Implementation Plan

#### 1. DB Migration — Add missing columns, indexes, function, and RLS

Single migration to:

**Columns:**
- `coach_tools_offered`: Add `checked_at timestamptz`, `user_response text`, `pattern_discovered text`, `was_effective boolean`, `pattern_area text`
- `tiny_wins`: Add `category text` (leadership/performance/relationship/learning/wellbeing)
- `coach_accountability_tracker`: Add `resolved_at timestamptz`

**Indexes (12 missing):**
- `coach_scenarios_detected`: `idx_scenarios_scenario`, `idx_scenarios_resolved`
- `coach_tools_offered`: `idx_tools_user`, `idx_tools_session`, `idx_tools_status`, `idx_tools_scenario`, `idx_tools_check_in`
- `jit_preferences`: `idx_jit_prefs_user`, `idx_jit_prefs_type`, `idx_jit_prefs_skipped`
- `jit_event_context`: `idx_jit_event_shown`
- `jit_pill_display_log`: `idx_pill_log_clicked`
- `jit_carousel_cards`: `idx_carousel_cards_completed`

**DB Function:**
- `increment_pattern_observation(uuid)` — increments `observation_count` and sets `last_observed_at`

**RLS Policies (user SELECT):**
- `coach_tools_offered`: Users can view own tools
- `jit_carousel_cards`: Users can view own carousel cards
- `jit_pill_display_log`: Users can view own pill logs

#### 2. Server Context Builder — Add 3 missing data fetches

In `supabase/functions/self-mastery-coach/index.ts`, add to the `buildServerContext` parallel query array:

- **Practice Effectiveness**: Query `sanctuary_events` joined with next-day `daily_checkins` to compute per-practice improvement rates (simple rule-based, no RPC needed)
- **Calendar-State Correlations**: Port the correlation detection logic from the client-side builder (lines 529-656 of `coachContextBuilder.ts`) into server-side
- **Wearable/HRV Data**: Fetch latest HRV from localStorage-derived client context (already partially structured via `hrvData` field — just needs client to pass it)

#### 3. Use `increment_pattern_observation` in `detect-recurring-patterns`

Update the EF to call the new RPC instead of manual UPDATE.

---

### Files Changed

| File | Change |
|------|--------|
| New migration SQL | Add 6 columns, 12 indexes, 1 function, 3 RLS policies |
| `supabase/functions/self-mastery-coach/index.ts` | Add practice effectiveness + calendar correlations to `buildServerContext` |
| `supabase/functions/detect-recurring-patterns/index.ts` | Use `increment_pattern_observation` RPC |

