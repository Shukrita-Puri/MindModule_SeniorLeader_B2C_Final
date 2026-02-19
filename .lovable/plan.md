

# Implement Self-Mastery Patterns v4.0: Multi-Signal Evolved Scoring

## Summary

This is a major upgrade to the `state-patterns-insights` edge function and `LeadershipPatternsCard` frontend. The evolved dimension scores will now draw from multiple behavioral signals (practices, coach dialogue, wearable data, ritual completions, tiny wins) with dynamic weight redistribution when data sources are missing. The card structure changes to four sections: AI Observation, Your Dimensions, What Your Patterns Reveal, and Data Source Note.

## Data Source Validation

After checking the database, here is the mapping between spec references and actual tables/columns:

| Spec Reference | Actual Table | Actual Column(s) | Status |
|---|---|---|---|
| `profiles.component_scores` | `profiles` | `component_scores` (JSONB) | Exists |
| `daily_checkins` | `daily_checkins` | `outcome, energy_balance, clarity_level, confidence_level, checkin_date` | Exists |
| `inner_readiness_scores` | Does NOT exist | N/A | Will use `daily_checkins` outcome as tier proxy |
| `daily_themes` | `daily_themes` | `theme_phrase, theme_driver, theme_date` | Exists |
| `user_coach_insights` | `user_coach_insights` | `insight_content, insight_type, created_at` | Exists |
| `dialogue_messages` | `dialogue_messages` | `content` (not `message_content`), `sender_type`, `session_id`, `timestamp` | Exists - column name differs from spec |
| `dialogue_sessions` | `dialogue_sessions` | `user_id, context_type, started_at` | Exists |
| `sanctuary_events` | `sanctuary_events` | `category, event_type, content_id, timestamp, context_data` | Exists |
| `daily_ritual_completions` | `daily_ritual_completions` | `session_period, completion_status, ritual_date` | Exists |
| `tiny_wins` | `tiny_wins` | `win_date, created_at` | Exists |
| `wearable_data` | Does NOT exist | N/A | Use `oura_daily_data.hrv` instead |
| `calendar_events` | `calendar_events` | `start_time, end_time, attendees_count` | Exists |
| `behavior_logs` | `behavior_logs` | `behavior_type, created_at` | Exists |
| `oura_connections` | `oura_connections` | `user_id, is_active` | Exists (for `hasWearable` check) |
| `calendar_connections` | `calendar_connections` | `user_id, is_active` | Exists (for `hasCalendar` check) |

Key corrections to the spec:
- `dialogue_messages.content` not `message_content`
- `oura_daily_data` not `wearable_data` for HRV
- No `inner_readiness_scores` table -- tier will be derived from `daily_checkins.outcome` mapping (focused/steady = "strong"/"peak", scattered = "managing", drained/overwhelmed = "depleted")
- `sanctuary_events` does not have an `innerReadinessTier` column -- will cross-reference with same-day `daily_checkins.outcome` to determine if practice was done in a low state
- Coach session count derived from `dialogue_sessions` where `context_type = 'scenario'` or by counting distinct sessions in `dialogue_messages`

## Changes

### File 1: Edge Function (`supabase/functions/state-patterns-insights/index.ts`)

Complete rewrite of the scoring logic. The function will:

**New parallel queries (added to existing ones):**
- `sanctuary_events` (last 30 days): category, event_type, timestamp, context_data
- `daily_ritual_completions` (last 30 days): session_period, completion_status, ritual_date
- `tiny_wins` (last 30 days): win_date
- `oura_daily_data` (last 30 days): hrv, summary_date
- `dialogue_sessions` + `dialogue_messages` (last 30 days): for coach dialogue mining
- `calendar_connections` and `oura_connections`: for hasWearable/hasCalendar flags
- `behavior_logs` (last 30 days): for scattered penalty detection

**New evolved score calculation for each dimension:**

Each dimension uses a multi-signal model with dynamic weight redistribution:
- Baseline weight: 30% (always present from `profiles.component_scores`)
- Behavioral signals: variable weights, only included when minimum data thresholds are met
- Weights of unavailable signals redistribute proportionally to available signals

Recalibration signals: baseline (30%), pause practices in low state (15%), pre-event sessions (10%), HRV trend (10%), coach regulation observations from `dialogue_messages` (15%), felt state from `energy_balance` (20%). Consecutive low penalty: -10 if 3+ consecutive depleted/managing days.

Clarity signals: baseline (30%), flow practices under load (15%), coach clarity observations (15%), clarity theme recurrence penalty (10%), scattered cause-effect penalty (-10), felt state from `clarity_level` (30%).

Renewal signals: baseline (30%), renergise practices in depleted state (15%), evening session completion rate (15%), tiny wins frequency (10%), HRV recovery rate (10%), coach renewal observations (10%), felt state from `confidence_level` (10%).

**Coach dialogue mining:**
- Query `dialogue_sessions` for the user's sessions in last 30 days
- Query `dialogue_messages` for those sessions
- Scan message `content` for regulation/clarity/renewal keywords (both positive and negative)
- Score: (positive count x 5) - (negative count x 5), capped at +/-15

**Updated AI observation prompt:**
- Now includes dimension deltas and archetype evolution in the prompt
- Updated tone: "self-mastery work -- regulation, clarity, and renewal matter in leadership and in life"
- Fallback uses largest dimension delta instead of generic trend

**Updated response payload:**
- Remove: `compositeAvg30`, `distribution`, `strengthArea`, `growthArea`
- Add: `baselineArchetypeId`, `currentArchetypeId`, `archetypeLeanOn`, `archetypeWatchFor`, `coachSessionCount`, `hasWearable`, `hasCalendar`, `dataSourceNote`
- Lean On / Watch For now come as full sentences from the archetype cascade (not just dimension labels)

**Updated archetype cascade:**
- Same 5 archetypes, same priority order
- Each now returns `leanOn` and `watchFor` as full human-readable sentences per the spec

**Friction frequency:**
- Add trend direction: compare friction % last 7 days vs days 8-14, +/-10% threshold
- Add 76-100% "Sustained friction" label

### File 2: Frontend (`src/components/insights/LeadershipPatternsCard.tsx`)

**Updated interface:**
- Replace `strengthArea`/`growthArea` with `archetypeLeanOn`/`archetypeWatchFor`
- Add `coachSessionCount`, `hasWearable`, `hasCalendar`, `dataSourceNote`
- Remove `compositeAvg30`, `distribution`

**Layout restructured to four sections:**

1. AI Observation (unchanged styling)
2. YOUR DIMENSIONS section:
   - Archetype with evolution display (kept as-is)
   - Three dimension rows with trend icons added (up/stable/down arrows based on 7-day comparison)
3. WHAT YOUR PATTERNS REVEAL section:
   - Friction frequency with trend direction indicator
   - Recurring compass themes (unchanged)
   - Lean On / Watch For (updated to use `archetypeLeanOn`/`archetypeWatchFor` full sentences)
4. Data source note (updated to include coach sessions, wearable, calendar)

**Removed from this card:**
- 30-day Inner Readiness avg + trend (moved to Performance Rhythm)
- Most frequent state / "How You Show Up" (moved to Performance Rhythm)

**DEV_MODE path:**
- Updated to match new interface, computing simplified evolved scores from available local data

### File 3: Documentation (`docs/self-mastery-patterns-card.md`)

Full rewrite with:
- All signal definitions, weights, minimum data thresholds
- Weight redistribution formula
- Keyword lists for coach dialogue mining
- Archetype cascade with full Lean On / Watch For sentences
- Progressive unlock thresholds
- Response payload schema
- Data source mapping table

## Implementation Sequence

1. Update edge function with all new queries and multi-signal scoring
2. Update frontend interface and layout
3. Update DEV_MODE fallback
4. Update documentation
5. Deploy edge function

