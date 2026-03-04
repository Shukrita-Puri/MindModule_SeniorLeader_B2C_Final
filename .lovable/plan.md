

## Plan: Create Complete Coach System Documentation + Audit

This is a documentation and audit task. I will create a comprehensive document at `.lovable/coach-feature-complete-reference.md` covering everything tied to the /coach feature, plus an audit of all DB connections, upstream inputs, and downstream consumers.

---

### What the Document Will Contain

**Section 1 — Architecture Overview**
- Two products: Self Mastery Coach (1:1 streaming) + Dialogue Room (scenario-based JSON)
- 14 Edge Functions total (listed with purpose)
- 7 client-side signal detection modules
- AI models used (gemini-3-flash-preview, gemini-2.5-flash, gemini-2.5-flash-lite)

**Section 2 — Full LLM System Prompt** (from `self-mastery-coach/index.ts`)
- BASE_SYSTEM_PROMPT (~700 lines): Identity, 3 co-equal roles (Organize/Probe/Accountable), STATE > STORY > STRATEGY, intervention levels, capabilities, wisdom library, recalibrate studio integration, meta-skills, safety guardrails, input quality awareness, tiny win extraction, response format/markers
- Flow-specific prompts: PREPARE_FLOW_PROMPT, INTEGRATE_FLOW_PROMPT, GUIDED_REFLECTION_PROMPT
- Pattern-area prompts: RECALIBRATION, CLARITY, RENEWAL
- Dynamic context injection via `buildSystemPrompt()` — all CoachContext fields documented

**Section 3 — Edge Functions (14 total)**

| # | Edge Function | Trigger | AI Model | Tables Read | Tables Written |
|---|---|---|---|---|---|
| 1 | `self-mastery-coach` | User sends message | gemini-3-flash-preview (streaming) + gemini-2.5-flash-lite (tiny wins) | None directly (context from client) | `tiny_wins` |
| 2 | `dialogue-engine` | User sends Dialogue Room message | gemini-2.5-flash | None directly (signals from client) | None directly |
| 3 | `dialogue-session-manage` | Session create/end/list | None | `dialogue_sessions`, `scenario_definitions`, `persona_definitions`, `dialogue_messages` | `dialogue_sessions` |
| 4 | `dialogue-data-persist` | Message sent/intervention created | None | `dialogue_sessions` | `dialogue_messages`, `detected_signals`, `dialogue_interventions` |
| 5 | `dialogue-session-debrief` | User opens debrief | None | `dialogue_sessions`, `dialogue_messages`, `dialogue_interventions`, `detected_signals` | None |
| 6 | `generate-debrief-insights` | Post-debrief | gemini-2.5-flash | None (data passed in body) | None (returns to client) |
| 7 | `extract-coach-insights` | Post-session (fire-and-forget) | gemini-2.5-flash | `dialogue_messages` | `user_coach_insights` |
| 8 | `generate-coach-summary` | Post-session (fire-and-forget) | gemini-2.5-flash | `dialogue_messages`, `coach_session_summaries` | `coach_session_summaries`, `coach_accountability_tracker` |
| 9 | `detect-recurring-patterns` | Post-session (fire-and-forget) | gemini-2.5-flash | `dialogue_messages`, `coach_pattern_observations` | `coach_pattern_observations` |
| 10 | `extract-session-memories` | Post-summary (chained) | None | `coach_session_summaries` | `coach_memory_index` |
| 11 | `analyze-probing-effectiveness` | Post-session (fire-and-forget) | gemini-2.5-flash | `dialogue_messages` | `coach_probing_effectiveness`, `coach_breakthrough_moments` |
| 12 | `check-pending-commitments` | Pre-session | None | `coach_accountability_tracker` | None |
| 13 | `update-commitment-status` | Coach checks commitment | None | `coach_accountability_tracker` | `coach_accountability_tracker` |
| 14 | `check-coach-access` | Pre-session | None | `profiles`, `dialogue_sessions` | None |
| 15 | `store-tiny-win` | Manual tiny win | None | None | `tiny_wins` |
| 16 | `insights-semantic-analysis` | Inner World Map | gemini-2.5-flash-lite | `daily_themes`, `dialogue_sessions`, `dialogue_messages`, `sanctuary_events`, `tiny_wins`, `daily_checkins` | None |

**Section 4 — Database Tables (17 tables)**

Core Session Tables:
- `dialogue_sessions` — Central session record
- `dialogue_messages` — All messages
- `dialogue_interventions` — Dialogue Room interventions
- `detected_signals` — Per-message signal analysis
- `dialogue_skill_events` — Skill gap/strength events

Coach Memory & Analytics Tables:
- `coach_session_summaries` — AI session summaries + topics
- `coach_memory_index` — Discrete memory entries (commitments, breakthroughs, summaries)
- `coach_accountability_tracker` — Commitment tracking with due dates
- `coach_pattern_observations` — Recurring behavioral patterns
- `coach_probing_effectiveness` — Probe quality scoring
- `coach_breakthrough_moments` — Genuine user realizations
- `user_coach_insights` — Extracted insights (strength, growth_area, preference, goal, etc.)
- `coach_scenarios_detected` — JIT scenario detection for calendar events

Reference Tables:
- `scenario_definitions` — Dialogue Room scenario metadata
- `persona_definitions` — AI persona configuration

Data Source Tables (read for context):
- `daily_checkins`, `profiles`, `calendar_events`, `tiny_wins`, `content_relevance_feedback`, `daily_ritual_completions`, `energy_snapshots`

**Section 5 — Upstream Input Data Sources**
All data fed INTO the coach system via `coachContextBuilder.ts`:
- `computeEnergyState()` → Inner Readiness score/tier/outcome
- `daily_checkins` → check-in data, state tags, clarity, confidence
- `profiles` → archetype, identity role, subscription tier
- `calendar_events` → upcoming events for JIT context
- `daily_ritual_completions` → completed practices today
- `energy_snapshots` → HRV data (current, baseline, delta, trend)
- `coach_session_summaries` → last session summary (continuity)
- `coach_accountability_tracker` → pending commitments
- `coach_pattern_observations` → patterns ready to name (3+ observations)
- `coach_memory_index` → recent memories ranked by importance
- `coach_probing_effectiveness` → effective probe types for personalization
- `coach_breakthrough_moments` → past breakthroughs for reference
- `user_coach_insights` → active LEAN ON / WATCH FOR insights
- `tiny_wins` → recent wins for confidence/evidence
- `content_relevance_feedback` → practice effectiveness data

**Section 6 — Downstream Consumers**
Where coach output data flows TO:
- `user_coach_insights` → Outer Readiness Brief (LEAN ON / WATCH FOR)
- `user_coach_insights` → Proactive Mastery Plan (+25 scoring boost for matching insights)
- `coach_session_summaries` → Inner World Map (theme extraction via `insights-semantic-analysis`)
- `coach_pattern_observations` → Inner World Map (pattern themes)
- `tiny_wins` → Insights page (Tiny Wins section), Mastery Plan (evening sessions)
- `coach_accountability_tracker` → Next session context (accountability check)
- `coach_scenarios_detected` → JIT event scoring (+15 coach boost in `generate-jit-events`)

**Section 7 — Scoring & Logic**
- Content scoring in `generate-mastery-plan`: +25 for coach insight match, +15 for pending tool match
- Coach context boost in `generate-jit-events`: +20 (mention+concern), +15 (scenario), +12 (pending tool), +8 (goal)
- Probing effectiveness scoring: 1-10 per probe, tracked longitudinally
- Pattern naming threshold: 3+ observations before naming allowed
- Insight replacement: only if different AND higher confidence (>= 0.7)
- Commitment check-in dates: 3 days (practice), 7 days (behavior change)

**Section 8 — Post-Session Pipeline (Execution Order)**
```
Session End
  ├── [parallel] extract-coach-insights → user_coach_insights
  ├── [parallel] analyze-probing-effectiveness → coach_probing_effectiveness, coach_breakthrough_moments
  ├── [parallel] detect-recurring-patterns → coach_pattern_observations
  └── [sequential] generate-coach-summary → coach_session_summaries, coach_accountability_tracker
       └── [chained] extract-session-memories → coach_memory_index
```

---

### Audit Results

**A. DB Connection Audit — Are All Tables Connected and Tracking?**

| Table | Written To? | Read From? | Status |
|-------|-------------|------------|--------|
| `dialogue_sessions` | Yes (session-manage) | Yes (debrief, progress, semantic-analysis, check-access) | **CONNECTED** |
| `dialogue_messages` | Yes (data-persist) | Yes (summary, patterns, insights, probing, session-manage) | **CONNECTED** |
| `dialogue_interventions` | Yes (data-persist) | Yes (debrief) | **CONNECTED** |
| `detected_signals` | Yes (data-persist) | Yes (debrief, progress-data) | **CONNECTED** |
| `dialogue_skill_events` | **NOT WRITTEN** | **NOT READ** | **GAP — table exists but no EF writes to it** |
| `coach_session_summaries` | Yes (generate-coach-summary) | Yes (extract-session-memories, coachContextBuilder, semantic-analysis) | **CONNECTED** |
| `coach_memory_index` | Yes (extract-session-memories) | Yes (coachContextBuilder) | **CONNECTED** |
| `coach_accountability_tracker` | Yes (generate-coach-summary, update-commitment-status) | Yes (check-pending-commitments, coachContextBuilder) | **CONNECTED** |
| `coach_pattern_observations` | Yes (detect-recurring-patterns) | Yes (coachContextBuilder) | **CONNECTED** |
| `coach_probing_effectiveness` | Yes (analyze-probing-effectiveness) | Yes (coachContextBuilder → effectiveProbes) | **CONNECTED** |
| `coach_breakthrough_moments` | Yes (analyze-probing-effectiveness) | Yes (coachContextBuilder → pastBreakthroughs) | **CONNECTED** |
| `user_coach_insights` | Yes (extract-coach-insights) | Yes (compute-outer-readiness, generate-mastery-plan, generate-jit-events) | **CONNECTED** |
| `coach_scenarios_detected` | **WRITTEN BY generate-jit-events only** | Yes (generate-jit-events) | **GAP — no coach EF writes scenarios; only JIT reads them** |
| `tiny_wins` | Yes (self-mastery-coach background, store-tiny-win) | Yes (coachContextBuilder, semantic-analysis, tiny-wins-insights) | **CONNECTED** |
| `coach_tools_offered` | **TABLE DOES NOT EXIST** | Referenced in generate-jit-events architecture doc | **GAP — table never created; generate-jit-events queries it but it doesn't exist** |

**B. Upstream Input Audit — Are All Data Sources Connected?**

| Data Source | Used By Coach? | Connection Method | Status |
|-------------|----------------|-------------------|--------|
| Inner Readiness (score/tier) | Yes | `computeEnergyState()` in coachContextBuilder | **CONNECTED** |
| Daily check-in (outcome, tags, clarity, confidence) | Yes | `getTodayCheckin()` in coachContextBuilder | **CONNECTED** |
| Profile (archetype, role, subscription) | Yes | Direct Supabase query in coachContextBuilder | **CONNECTED** |
| Calendar events (JIT context) | Yes | Via localStorage `calendarEvents` in coachContextBuilder | **CONNECTED** |
| HRV/Wearable data | Yes | Via `computeEnergyState()` | **CONNECTED** |
| Completed practices today | Yes | Via `daily_ritual_completions` in coachContextBuilder | **CONNECTED** |
| Recent practices (7 days) | Yes | Via `sanctuary_events` in coachContextBuilder | **CONNECTED** |
| Tiny Wins | Yes | Via `tiny_wins` query in coachContextBuilder | **CONNECTED** |
| Practice effectiveness | Yes | Via `content_relevance_feedback` in coachContextBuilder | **CONNECTED** |
| Pending commitments | Yes | Via `coach_accountability_tracker` in coachContextBuilder | **CONNECTED** |
| Session summaries (last session) | Yes | Via `coach_session_summaries` in coachContextBuilder | **CONNECTED** |
| Patterns to name | Yes | Via `coach_pattern_observations` in coachContextBuilder | **CONNECTED** |
| Recent memories | Yes | Via `coach_memory_index` in coachContextBuilder | **CONNECTED** |
| Effective probes | Yes | Via `coach_probing_effectiveness` in coachContextBuilder | **CONNECTED** |
| Past breakthroughs | Yes | Via `coach_breakthrough_moments` in coachContextBuilder | **CONNECTED** |
| LEAN ON / WATCH FOR insights | Yes | Via `user_coach_insights` injected into system prompt | **CONNECTED** |
| Dimension evolution | Yes | Via `computeEnergyState()` dimension scores | **CONNECTED** |
| Outer Readiness Brief theme | **PARTIAL** | Theme comes from mastery recommendation, not from `compute-outer-readiness` directly | **PARTIAL — uses energy state mastery recommendation, not the actual outer readiness theme phrase** |

**C. Downstream Consumer Audit — Are Outputs Consumed?**

| Coach Output | Consumer | Status |
|---|---|---|
| `user_coach_insights` (strength/growth_area) | `compute-outer-readiness` (LEAN ON / WATCH FOR) | **CONNECTED** |
| `user_coach_insights` (all types) | `generate-mastery-plan` (+25 scoring) | **CONNECTED** |
| `user_coach_insights` (goal) | `generate-jit-events` (coach boost) | **CONNECTED** |
| `coach_session_summaries` | `insights-semantic-analysis` (Inner World Map themes) | **CONNECTED** |
| `coach_session_summaries` | `coachContextBuilder` (last session continuity) | **CONNECTED** |
| `coach_scenarios_detected` | `generate-jit-events` (JIT scoring boost) | **GAP — no coach EF populates this; only JIT reads it. The detect-recurring-patterns EF should be writing scenario detections here.** |
| `coach_accountability_tracker` | `check-pending-commitments` + coachContextBuilder | **CONNECTED** |
| `coach_pattern_observations` | coachContextBuilder (patterns to name) | **CONNECTED** |
| `tiny_wins` | Insights page, semantic-analysis, coachContextBuilder | **CONNECTED** |
| `coach_tools_offered` | `generate-jit-events` (pending tool check) | **GAP — table does not exist** |
| `update-commitment-status` | **NOT CALLED by any client code** | **GAP — EF exists but nothing invokes it** |

---

### Summary of Gaps Found (5 issues)

| # | Issue | Severity | Detail |
|---|---|---|---|
| 1 | `coach_tools_offered` table does not exist | **HIGH** | `generate-jit-events` queries this table for pending tools. Table was never created in any migration. JIT coach boost scoring for pending tools is dead. |
| 2 | `coach_scenarios_detected` never populated by coach | **MEDIUM** | Table exists but no coach post-session EF writes to it. `detect-recurring-patterns` should write scenario detections with `event_types` array. Currently only JIT reads it — always empty. |
| 3 | `dialogue_skill_events` table is orphaned | **LOW** | Table exists in schema but no EF writes to it and no client reads it. Dead table. |
| 4 | `update-commitment-status` EF never called | **MEDIUM** | Edge function exists and works, but no client-side code invokes it. Commitments can never be marked completed/abandoned. |
| 5 | Outer Readiness theme not passed to coach | **LOW** | Coach receives mastery recommendation from `energyStateEngine` but not the actual outer readiness brief theme phrase. The full compass context (from `compute-outer-readiness`) is not wired into the coach context. |

---

### Implementation

Create a single comprehensive document at `.lovable/coach-feature-complete-reference.md` containing all of the above: full LLM prompts, edge function specifications, database schema, scoring logic, upstream/downstream maps, and audit findings. No code changes — documentation only.

