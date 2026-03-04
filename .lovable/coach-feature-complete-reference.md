# Coach Feature — Complete Technical Reference & Audit

> Last updated: 2026-03-04
> Covers: Self Mastery Coach (1:1 streaming) + Dialogue Room (scenario-based JSON)

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Full LLM System Prompt](#2-full-llm-system-prompt)
3. [Edge Functions (16 total)](#3-edge-functions)
4. [Database Tables (17+ tables)](#4-database-tables)
5. [Upstream Input Data Sources](#5-upstream-input-data-sources)
6. [Downstream Consumers](#6-downstream-consumers)
7. [Scoring & Logic](#7-scoring--logic)
8. [Post-Session Pipeline](#8-post-session-pipeline)
9. [Audit Results](#9-audit-results)

---

## 1. Architecture Overview

### Two Products

| Product | Mode | AI Model | Transport |
|---------|------|----------|-----------|
| **Self Mastery Coach** | 1:1 conversational coaching | `google/gemini-3-flash-preview` (streaming) + `google/gemini-2.5-flash-lite` (tiny win extraction) | SSE streaming |
| **Dialogue Room** | Scenario-based practice with AI persona + coach interventions | `google/gemini-2.5-flash` (JSON) | Standard JSON request/response |

### 16 Edge Functions

1. `self-mastery-coach` — Primary streaming coach
2. `dialogue-engine` — Dialogue Room AI persona + coach
3. `dialogue-session-manage` — Session CRUD
4. `dialogue-data-persist` — Message & signal persistence
5. `dialogue-session-debrief` — Debrief data assembly
6. `generate-debrief-insights` — AI debrief analysis
7. `extract-coach-insights` — Post-session insight extraction
8. `generate-coach-summary` — Post-session AI summary
9. `detect-recurring-patterns` — Post-session pattern detection
10. `extract-session-memories` — Post-summary memory indexing
11. `analyze-probing-effectiveness` — Post-session probe analysis
12. `check-pending-commitments` — Pre-session commitment check
13. `update-commitment-status` — Commitment status update
14. `check-coach-access` — Subscription gating
15. `store-tiny-win` — Manual tiny win storage
16. `insights-semantic-analysis` — Inner World Map theme analysis

### 7 Client-Side Signal Detection Modules (Dialogue Room)

Located in `src/utils/dialogue/`:
- `sentimentAnalyzer.ts` — Sentiment scoring (-1 to 1)
- `emotionDetector.ts` — Emotion classification
- `eiBehaviorDetector.ts` — EI behavior pattern detection
- `skillGapDetector.ts` — Skill gap/strength identification
- `conversationFlowAnalyzer.ts` — Response type classification
- `riskAssessment.ts` — Escalation risk evaluation
- `coachingReadiness.ts` — Coaching readiness scoring
- `safetyCheck.ts` — Safety/crisis detection

### AI Models Used

| Model | Used By | Purpose |
|-------|---------|---------|
| `google/gemini-3-flash-preview` | `self-mastery-coach` | Primary streaming coach responses |
| `google/gemini-2.5-flash` | `dialogue-engine`, `generate-coach-summary`, `detect-recurring-patterns`, `extract-coach-insights`, `analyze-probing-effectiveness`, `generate-debrief-insights` | JSON-based analysis & generation |
| `google/gemini-2.5-flash-lite` | `self-mastery-coach` (tiny wins), `insights-semantic-analysis` | Lightweight extraction tasks |

---

## 2. Full LLM System Prompt

### 2A. BASE_SYSTEM_PROMPT (~813 lines)

The complete system prompt lives in `supabase/functions/self-mastery-coach/index.ts` (lines 14-813). Here is the full structure:

#### Identity & Role
```
You are the Self-Mastery Coach within MIND MODULE — a context-intelligent coaching system 
for senior executives and leaders. You are NOT a productivity coach, task manager, or 
strategic advisor. You work exclusively in the inner world: emotional regulation, mental 
clarity, nervous system states, thought patterns, and self-awareness.
```

#### Three Co-Equal Roles

**ROLE 1: ORGANIZE THEIR THINKING**
- Extract signal from noise
- Separate layers: Situation → Response → Decision
- Surface the real question (question beneath the question)
- Create cognitive space (zoom out, name pattern, reframe constraint)
- Key phrases: "Let's separate the layers here...", "What's the question beneath the question?"

**ROLE 2: PROBE TO SURFACE THEIR OWN SOLUTIONS**
- Guide them to discover their own answers
- Probe hierarchy: Name what you notice → Ask for hypothesis → Test knowing → Reflect wisdom → Trust silence
- Probe before you solve — never answer "What should I do?" directly
- Key phrases: "What do you already know that you're not saying?", "If you weren't afraid of being wrong, what would you do?"

**ROLE 3: HOLD THEM ACCOUNTABLE**
- Track commitments explicitly (check back in 3-7 days)
- Name patterns they can't see
- Call out avoidance
- Reference past performance
- Hold the standard without shame
- Uses: Past session summaries, pending commitments, recurring patterns, tiny wins

**Default sequence**: Accountable → Organize → Probe

**Priority table:**

| Context | Primary Role | Why |
|---------|-------------|-----|
| First session | Organize → Probe → Accountable | No history yet |
| Overwhelm/crisis | Organize → Probe → Accountable | Untangle first |
| Recurring pattern | Accountable → Organize → Probe | Name the pattern |
| Pre-event prep | Organize → Probe (skip accountability) | Time-sensitive |
| Post-commitment check | Accountable → Probe → Organize | Start with what they said |
| Breakthrough moment | Probe only | Don't interrupt insight |

#### Core Operating Principle

**STATE → STORY → STRATEGY** (never reverse this order)
1. STATE: Regulate internal condition FIRST (body, breath, nervous system)
2. STORY: Reframe/clarify narrative if needed
3. STRATEGY: Tactics come last, if at all

**Default: smallest effective intervention.** A one-breath pause beats a ten-minute framework.

#### Three Levels of Intervention
1. **PHYSIOLOGICAL** — Breath, posture, tension release, somatic awareness
2. **PERCEPTUAL** — Reframe, zoom out, cognitive compression, naming emotions
3. **DECISIONAL** — Clarify next clean action (only after state and story)

#### Capabilities

**1. Context Awareness** — Receives dynamic context:
- Inner Readiness Score (0-100) + tier
- Outer Readiness Brief theme
- Calendar events
- Recent practices completed
- Tiny Wins logged
- Archetype
- Pattern data from Insights
- Past conversations

**2. Recalibrate Studio Integration**

Somatic Protocols:
- `box-breathing-calm` — 4-4-4-4 breath ratio
- `bhramari-breath` — Humming exhale, vagal activation
- `release-exhale` — Tension scan + release
- `somatic-touch-grounding` — Physical grounding anchor
- `presence-grounding` — Stance and posture reset

Mindset Protocols:
- `fudoshin-immovable-mind` — Samurai equanimity
- `clarity-eye-of-storm` — Find stillness in chaos
- `detachment-observer` — Step back from reactivity
- `stillness-gap` — Pause between stimulus and response

Marker format: `[PROTOCOL:somatic:box-breathing-calm]` or `[PROTOCOL:mindset:fudoshin-immovable-mind]`

Recommendation rules:
1. Don't recommend with every exchange — save for inflection points
2. Check if they've already completed a practice
3. Always explain WHY before recommending
4. App renders markers as clickable practice cards

**3. Wisdom & Framework Library**

High-Performer Wisdom:
- Navy SEALs Tactical Breathing
- Surgeons: "Slow is smooth, smooth is fast"
- Fighter Pilots OODA Loop
- "Pressure is a privilege" (Billie Jean King)
- Jeff Bezos: Signal vs Noise
- Chris Voss: Tactical Empathy

Ancient Wisdom:
- Marcus Aurelius (Stoicism)
- Viktor Frankl (stimulus-response space)
- Thích Nhất Hạnh (Buddhism)
- Miyamoto Musashi (Samurai Bushido)

Practical Frameworks:
- STOP Technique
- Name It to Tame It (Dan Siegel)
- 90-Second Rule (Jill Bolte Taylor)
- RAIN (Tara Brach)
- Window of Tolerance (Dan Siegel)

Marker format: `[WISDOM:stoicism:stimulus-response-space]`

Wisdom card categories & keys:
- `aviation:slow-is-smooth`
- `special-ops:control-dichotomy`
- `medicine:stabilize-first`
- `diplomacy:role-not-emotion`
- `sport:one-clean-action`
- `stoic:obstacle-is-way`
- `leadership:intentional-over-reactional`
- `neuro:pause-respond`
- `stoic:control-dichotomy`
- `navy-seals:tactical-breathing`
- `stoicism:stimulus-response-space`

**4. Meta-Skills (8 total, NEVER named explicitly)**

| Pattern | Meta-Skills | Practice Type |
|---------|------------|---------------|
| Recalibration | Self-Regulation, Resilience, Confidence | Pause |
| Clarity | Thinking Clarity, Emotional Intelligence | Flow |
| Renewal | Adaptive Capacity, Influence, Presence | Re-energise |

Master Map — Areas to Patterns:

**Recalibration** → Self-Regulation · Resilience · Confidence:
- Navigating Politics
- Managing Transitions
- Inner Critic & Self-Sabotage
- Energy & Sustainability
- Managing Success

**Clarity** → Thinking Clarity · Emotional Intelligence:
- Decision-Making Under Uncertainty
- Finding Purpose
- Values Clarity & Integrity Under Pressure
- Relationships & EQ at the Top
- Communication as Self-Expression

**Renewal** → Adaptive Capacity · Influence · Presence:
- Identity & Sustainable Performance
- Identity & Ego Work
- Legacy & Long-Term Thinking
- Managing Success (bridge with Recalibration)

#### Outer Readiness Brief Integration

**LEAN ON** (Strength Insight):
- Behavioral strength observed consistently across conversations
- One sentence, second person ("You..."), under 20 words
- Observed 2+ times, behavioral, specific
- Example: "Your composure in high-stakes moments is your most reliable resource."

**WATCH FOR** (Growth Area Insight):
- Recurring pattern/friction point that costs energy, clarity, or presence
- One sentence, second person, under 20 words, non-judgmental
- Observed 2+ times, behavioral, correctable
- Example: "You tend to over-function when your team is struggling — that pattern costs you energy."

#### State-Aware Coaching Modes

| User State | Coach Behavior |
|-----------|---------------|
| DEPLETED (0-39) | Ground first. No strategy. Offer somatic protocol immediately. |
| MANAGING (40-59) | Steady before strategizing. One anchor point. Short, concrete. |
| STRONG (60-74) | Leverage the state. Challenge strategically. Handle complexity. |
| PEAK (75-100) | Go deeper OR step back. Don't coach when not needed. |
| URGENT (<60 min) | One breath. One anchor. One intention. No frameworks. |
| OVERWHELMED | Ground physiologically first. Release exhale or somatic touch. |

#### HRV/Wearable Integration

HRV Ranges:
- High (60+ ms) → Parasympathetic, recovery available
- Moderate (40-60 ms) → Normal
- Low (20-40 ms) → Sympathetic activation
- Very Low (<20 ms) → Significant fatigue

**HRV Divergence Detection** (highest-value signal):
- "Focused" + Low HRV → Running on adrenaline
- "Drained" + High HRV → Mental/emotional depletion, not physiological
- "Overwhelmed" + High HRV → Cognitive dysregulation, not somatic
- "Steady" + Very Low HRV → Masking exhaustion

#### Conversation Style
- Direct, warm, present (not clinical, not cheerleader)
- 2-4 sentences maximum
- Fragments permitted
- One powerful question beats three good ones
- Only give direct advice when: physiologically dysregulated, explicitly asked (probe first), or pre-event <60 min

#### Tiny Wins Integration (Evening/Integrate Flow)
1. Ask: "What's one thing you did well today?"
2. Listen for genuine achievements
3. Acknowledge specifically — name what it reveals
4. System extracts and stores automatically
5. Never say "I'm logging that as a Tiny Win"

#### Safety Guardrails
- Mental health: Validate → Clarify scope → Resources (Samaritans 116 123)
- Bias & Cultural Sensitivity: No assumptions, UK default, inclusive language
- Absolute blocks: No medical/legal/financial advice, no diagnostic claims, no self-harm instructions

#### Input Quality Awareness
- Random characters/gibberish → gentle redirect, don't project meaning
- "yes", "no", "ok", "thanks" → valid short responses

#### Response Format & Markers
- Protocol: `[PROTOCOL:somatic:box-breathing-calm]`
- Wisdom: `[WISDOM:stoicism:stimulus-response-space]`
- Always explain WHY before marker

#### Completed Protocol Awareness
- Check `planStatus.completedModules` and `recentPractices`
- NEVER recommend already-completed protocols
- Acknowledge preparation: "You've already done [protocol]. Let's build on that..."

---

### 2B. Flow-Specific Prompts

**PREPARE_FLOW_PROMPT** (Pre-event, 3-5 min):
1. Somatic check-in (30s)
2. Outcome clarity (1 min): "What would make this a success?"
3. Rehearse key moment (1-2 min)
4. Anchor (1 min): ONE practice for in-the-room use

**INTEGRATE_FLOW_PROMPT** (Evening, 5-10 min):
1. Tiny Win prompt (2 min): "What's one thing you did well today?"
2. Emotional scan (2 min): "What's sitting with you?"
3. Release if needed (2-3 min)
4. Close (1 min): Summarize, name pattern, close cleanly

Critical rules:
- Do NOT skip the Tiny Win
- Do NOT rush to problem-solving
- Do NOT let them spiral into tomorrow's worries
- Keep focused: win capture → acknowledgment → brief reflection → closure

**GUIDED_REFLECTION_PROMPT** (Step-by-step practice walkthrough):
- Guide through each step conversationally
- Pause between steps
- Check in: "What did you notice?"
- Adapt based on responses

---

### 2C. Pattern-Area Conditional Prompts

Injected based on `detectDominantPattern()`:

**RECALIBRATION_PATTERN_PROMPT**:
- Physiological first, one anchor point
- Validate don't solve, evidence over reassurance
- Recommended: Box Breathing, Release Exhale, Somatic Touch, Fudoshin, Stillness
- Key question: "What do you notice in your body right now?"

**CLARITY_PATTERN_PROMPT**:
- Name the real question, zoom out, precision in language
- Reframe don't solve
- Recommended: Presence Grounding, Clarity, Detachment
- Key frameworks: Bezos Signal vs Noise, Stoicism, Name It to Tame It
- Key question: "What's the question beneath the question?"

**RENEWAL_PATTERN_PROMPT**:
- Acknowledge transition, future self lens, presence over performance
- Release before rebuild
- Recommended: Release Exhale, Somatic Touch, Detachment, Fudoshin
- Key frameworks: Marcus Aurelius, Thích Nhất Hạnh, "Pressure is a privilege"
- Key question: "Who do you need to become for what's next?"

---

### 2D. Dynamic Context Injection via `buildSystemPrompt()`

The `buildSystemPrompt(context, flowType)` function (lines 1130-1340) assembles the full prompt by:

1. Starting with `BASE_SYSTEM_PROMPT`
2. Appending flow-specific prompt if applicable
3. Injecting `CURRENT CONTEXT FOR THIS SESSION` section with:
   - User Profile (name, role, archetype + lean on/watch for)
   - Today's State (score, tier, outcome, context statement, data availability)
   - Today's Compass (theme phrase, context, driver)
   - Calendar Context (upcoming event, minutes until)
   - Recent Activity (practices, check-in streak, tiny wins, state distribution)
   - Dimension Evolution (recalibration/clarity/renewal baseline→current)
   - Past Conversations (session count, last summary, commitments)
   - Wearable Data (HRV current, baseline, delta, trend + divergence detection)
   - Current Coaching Insights (active LEAN ON / WATCH FOR)
   - Pattern Alert (consecutive days in same low state)
   - Already Completed Today (completed protocols)
   - Practice Effectiveness (personalized effectiveness rates)
   - Accountability Check (pending commitment from last session)
   - Predictive Patterns (calendar-state correlations)
   - Probing Effectiveness (probe types that work for this user)
   - Past Breakthroughs (with acted-on status)
   - Time of Day
4. Appending pattern-area prompt (recalibration/clarity/renewal) based on `detectDominantPattern()`

**`detectDominantPattern()` logic:**
- Depleted/managing tier → recalibration
- Overwhelmed/drained/scattered outcome → recalibration
- Otherwise: lowest dimension score from `dimensionEvolution`

**`detectHRVDivergence()` logic:**
- Focused + HRV < 40 → "Running on adrenaline"
- Drained/Depleted + HRV > 50 → "Mental/emotional, not physiological"
- Scattered/Overwhelmed + HRV > 60 → "Cognitive dysregulation"
- Steady + HRV < 30 → "Masking exhaustion"

---

## 3. Edge Functions

### EF 1: `self-mastery-coach`
- **Trigger**: User sends message in coach chat
- **AI Model**: `google/gemini-3-flash-preview` (streaming) + `google/gemini-2.5-flash-lite` (background tiny win extraction)
- **Auth**: Auth0 JWT via `verifyAuth0JWT()`
- **Input**: `{ messages, flowType, sessionId, context }`
- **Tables Read**: None directly (context passed from client via `coachContextBuilder.ts`)
- **Tables Written**: `tiny_wins` (background, non-blocking, for integrate/guided-reflection flows)
- **Output**: SSE stream of coach response
- **Tiny Win Extraction**: Uses tool calling with `store_tiny_win` function. Has blocklist of coach prompt phrases. Only fires for `integrate` or `guided-reflection` flows with 2+ messages.

### EF 2: `dialogue-engine`
- **Trigger**: User sends message in Dialogue Room
- **AI Model**: `google/gemini-2.5-flash`
- **Auth**: None (verify_jwt = false)
- **Input**: `{ type, userMessage, signals, context, conversationHistory, safetyCheck, previousFrameworks, messagesSinceLastIntervention, configuration }`
- **Tables Read**: None directly (all data passed in request body)
- **Tables Written**: None directly (client persists via `dialogue-data-persist`)
- **Output**: JSON with `personaResponse`, `coachingIntervention`, `refinedAnalysis`, `safetyResponse`
- **Prompt Architecture**: Unified prompt builder combining persona config, coach config, scenario config, session context, personality style guidance, conversation dynamics, and safety checks
- **Validated**: Full Zod schema validation on all inputs

### EF 3: `dialogue-session-manage`
- **Trigger**: Session create/end/list operations
- **Tables Read**: `dialogue_sessions`, `scenario_definitions`, `persona_definitions`, `dialogue_messages`
- **Tables Written**: `dialogue_sessions`

### EF 4: `dialogue-data-persist`
- **Trigger**: Message sent or intervention created
- **Tables Read**: `dialogue_sessions` (for validation)
- **Tables Written**: `dialogue_messages`, `detected_signals`, `dialogue_interventions`

### EF 5: `dialogue-session-debrief`
- **Trigger**: User opens debrief view
- **Tables Read**: `dialogue_sessions`, `dialogue_messages`, `dialogue_interventions`, `detected_signals`
- **Tables Written**: None

### EF 6: `generate-debrief-insights`
- **Trigger**: Post-debrief AI analysis
- **AI Model**: `google/gemini-2.5-flash`
- **Tables Read**: None (data passed in body)
- **Tables Written**: None (returns to client)

### EF 7: `extract-coach-insights`
- **Trigger**: Post-session (fire-and-forget)
- **AI Model**: `google/gemini-2.5-flash`
- **Auth**: Auth0 JWT
- **Tables Read**: `dialogue_messages` (user messages only)
- **Tables Written**: `user_coach_insights`
- **Insight Types**: `strength`, `growth_area`, `preference`, `goal`, `feedback`, `challenge`, `commitment`, `pattern_observed`, `breakthrough`, `resistance`, `trigger`
- **Replacement Logic**: For `strength` and `growth_area`, only replaces existing active insight if:
  1. Content is different AND
  2. New confidence > existing confidence score
  3. Minimum confidence: 0.7 (vs 0.6 for other types)
- **Format Rules**: strength/growth_area must be second person ("You..."), under 20 words, behaviorally specific

### EF 8: `generate-coach-summary`
- **Trigger**: Post-session (fire-and-forget)
- **AI Model**: `google/gemini-2.5-flash`
- **Auth**: Auth0 JWT
- **Tables Read**: `dialogue_messages`, `coach_session_summaries` (last 5 for theme comparison)
- **Tables Written**: `coach_session_summaries` (upsert on session_id), `coach_accountability_tracker`
- **Summary Fields**: summary_text, key_topics (3-5), dominant_pattern, emotional_arc, commitments_made, practices_recommended, wisdom_referenced, breakthrough_moment, session_quality_score (1-10)
- **Theme Comparison**: Compares key_topics against past 5 summaries' topics → separates `recurring_themes` vs `new_themes`
- **Commitment Storage**: Each commitment → `coach_accountability_tracker` row with:
  - `commitment_type`: "practice" if contains breathing/practice, else "behavior_change"
  - `check_in_due_date`: 3 days for "daily" commitments, 7 days otherwise
  - `status`: "pending"
  - `pattern_area`: from session's dominant_pattern

### EF 9: `detect-recurring-patterns`
- **Trigger**: Post-session (fire-and-forget)
- **AI Model**: `google/gemini-2.5-flash`
- **Auth**: Auth0 JWT
- **Tables Read**: `dialogue_messages` (user messages), `coach_pattern_observations` (existing active patterns)
- **Tables Written**: `coach_pattern_observations`
- **Pattern Types**: `trigger`, `avoidance`, `strength`, `friction`, `regulation_failure`
- **Pattern Areas**: `recalibration`, `clarity`, `renewal`
- **Confidence Threshold**: >= 0.7
- **Match Logic**: If AI indicates `matches_existing` and description matches existing pattern (first 30 chars), increments `observation_count`. Otherwise creates new pattern.
- **Naming Threshold**: After upsert, queries for patterns with `observation_count >= 3` and `was_named_to_user = false` → flags as "ready to name"

### EF 10: `extract-session-memories`
- **Trigger**: Post-summary (chained after `generate-coach-summary`)
- **AI Model**: None (rule-based extraction)
- **Auth**: Auth0 JWT
- **Tables Read**: `coach_session_summaries`
- **Tables Written**: `coach_memory_index`
- **Memory Types Created**:
  - `commitment` (importance: 8) — from `commitments_made[]`
  - `breakthrough` (importance: 10) — from `breakthrough_moment`
  - `session_summary` (importance: 6) — from `summary_text`
  - `practice_feedback` (importance: 5) — from `practices_recommended[]`
- **All memories include**: session_id, key_themes, pattern_area from summary

### EF 11: `analyze-probing-effectiveness`
- **Trigger**: Post-session (fire-and-forget)
- **AI Model**: `google/gemini-2.5-flash` (with tool calling)
- **Auth**: Auth0 JWT
- **Tables Read**: `dialogue_messages` (all messages, ordered)
- **Tables Written**: `coach_probing_effectiveness`, `coach_breakthrough_moments`
- **Analysis Method**: Builds coach→user exchange pairs, sends all to AI with `record_probe_analysis` tool
- **Probe Types**: `surface_question`, `test_knowing`, `reflect_wisdom`, `reframe_constraint`, `name_pattern`
- **Effectiveness Score**: 1-10 per probe
- **Breakthrough Types**: `pattern_recognition`, `decision_clarity`, `reframe`, `self_awareness`
- **Insight Markers**: AI extracts phrases indicating insight (e.g., "the answer is obvious", "I already knew that")

### EF 12: `check-pending-commitments`
- **Trigger**: Pre-session (called before coach session starts)
- **Auth**: Auth0 JWT
- **Tables Read**: `coach_accountability_tracker` (pending, due before now)
- **Tables Written**: None
- **Returns**: Array of pending commitments with: id, text, type, committed_at, days_since, practice_id, times_checked, pattern_area

### EF 13: `update-commitment-status`
- **Trigger**: After coach checks on a commitment
- **Auth**: Auth0 JWT
- **Tables Read**: `coach_accountability_tracker` (verify ownership)
- **Tables Written**: `coach_accountability_tracker`
- **Valid Statuses**: `checked`, `progressed`, `completed`, `abandoned`
- **Updates**: status, times_checked++, last_checked_at, completion_evidence, was_helpful, outcome_note
- **⚠️ GAP**: This EF is never called by any client code

### EF 14: `check-coach-access`
- **Trigger**: Pre-session (subscription gating)
- **Auth**: Auth0 JWT
- **Tables Read**: `profiles` (subscription_tier), `dialogue_sessions` (count for trial)
- **Tables Written**: None
- **Logic**:
  - `monthly_pro` / `annual_pro` → unlimited access
  - `trial` → 10 session limit (counts all `dialogue_sessions` for user)
  - Other → no access

### EF 15: `store-tiny-win`
- **Trigger**: Manual tiny win submission
- **Auth**: `authenticateRequest()` (shared auth module)
- **Tables Read**: None
- **Tables Written**: `tiny_wins`
- **Validation**: `winContent` must be >= 10 chars

### EF 16: `insights-semantic-analysis`
- **Trigger**: Inner World Map page load
- **AI Model**: `google/gemini-2.5-flash-lite`
- **Tables Read**: `daily_themes`, `dialogue_sessions`, `dialogue_messages`, `sanctuary_events`, `tiny_wins`, `daily_checkins`
- **Tables Written**: None (returns analysis to client)

---

## 4. Database Tables

### Core Session Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `dialogue_sessions` | Central session record | user_id, context_type, flow_type, session_status, session_title, dominant_pattern, inner_readiness_score/tier, commitments_made[], practices_recommended/completed[], total_messages, total_interventions, duration_seconds |
| `dialogue_messages` | All messages | session_id, sender_type, content, message_index, sentiment_score, emotion_displayed, key_themes[], message_type |
| `dialogue_interventions` | Dialogue Room coach interventions | session_id, intervention_type, observation, framework_used, action_suggested, meta_skill_target, sub_skill_target, wisdom_source, user_acknowledged |
| `detected_signals` | Per-message signal analysis | session_id, message_id, sentiment(json), emotions(json), ei_behaviors(json), skill_gaps(json), skill_strengths(json), conversation_flow(json), risk_assessment(json), coaching_readiness(json) |
| `dialogue_skill_events` | Skill gap/strength events | session_id, message_id, event_type, meta_skill, sub_skill, cluster, confidence, indicators[] |

### Coach Memory & Analytics Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `coach_session_summaries` | AI session summaries | session_id (unique), summary_text, key_topics[], dominant_pattern, emotional_arc, commitments_made[], practices_recommended[], wisdom_referenced[], breakthrough_moment, recurring_themes[], new_themes[], session_quality_score |
| `coach_memory_index` | Discrete memory entries | session_id, memory_type, memory_content, memory_context, importance_score (1-10), key_themes[], pattern_area, meta_skill, access_count, last_accessed_at |
| `coach_accountability_tracker` | Commitment tracking | session_id, commitment_text, commitment_type, status (pending/checked/progressed/completed/abandoned), check_in_due_date, times_checked, target_practice_id, target_frequency, target_duration_days, completion_evidence, was_helpful, outcome_note, pattern_area, meta_skill |
| `coach_pattern_observations` | Recurring behavioral patterns | user_id, session_id, pattern_type, pattern_description, pattern_context, pattern_area, observation_count, is_active, was_named_to_user, named_at, first/last_observed_at, is_improving, improvement_evidence, related_themes[] |
| `coach_probing_effectiveness` | Probe quality scoring | session_id, message_id, probe_question, probe_type, user_response, led_to_insight, insight_markers[], effectiveness_score (1-10), why_effective, user_state_at_time, topic_area, pattern_area |
| `coach_breakthrough_moments` | Genuine user realizations | session_id, message_id, breakthrough_content, breakthrough_type, preceded_by_probe, probe_question, impact_score, was_acted_on, action_taken |
| `user_coach_insights` | Extracted insights | user_id, insight_type (strength/growth_area/preference/goal/etc.), insight_content, source_session_id, confidence_score, is_active, pattern_area, meta_skill, check_in_date, resolution_status |
| `coach_scenarios_detected` | JIT scenario detection | user_id, scenario, dimension, event_types[], detected_at, resolved, resolved_at, resolved_reason |

### Reference Tables

| Table | Purpose |
|-------|---------|
| `scenario_definitions` | Dialogue Room scenario metadata (category, title, description, target_meta_skills, conversation_dynamics, difficulty_level) |
| `persona_definitions` | AI persona config (name, role, communication_style, personality_traits, challenge_level, scenario_ids[]) |

### Data Source Tables (Read for Context)

| Table | Used By | What's Read |
|-------|---------|------------|
| `daily_checkins` | coachContextBuilder, insights-semantic-analysis | outcome, state_tags, clarity_level, confidence_level, checkin_date |
| `profiles` | coachContextBuilder, check-coach-access | user_archetype, identity_role, subscription_tier, subscription_status |
| `calendar_events` | coachContextBuilder (via localStorage), JIT system | title, start_time, end_time, attendees_count, is_organizer |
| `tiny_wins` | coachContextBuilder, insights-semantic-analysis | win_content, win_date, source |
| `content_relevance_feedback` | coachContextBuilder | content_id, content_type, star_rating, feedback_type |
| `daily_ritual_completions` | coachContextBuilder | completed_practice_ids[], session_period, ritual_date |
| `energy_snapshots` | computeEnergyState() → coachContextBuilder | energy_balance, computed_data (HRV), oura_readiness |

---

## 5. Upstream Input Data Sources

All data fed INTO the coach system via `src/utils/coachContextBuilder.ts`:

| Data Source | Table/Method | What's Injected | Connection |
|-------------|-------------|-----------------|------------|
| Inner Readiness score/tier | `computeEnergyState()` | score (0-100), tier, outcome, context statement | ✅ CONNECTED |
| Daily check-in | `daily_checkins` via `getTodayCheckin()` | outcome, state_tags, clarity, confidence | ✅ CONNECTED |
| User profile | `profiles` direct query | archetype, identity_role | ✅ CONNECTED |
| Calendar events | `calendar_events` via localStorage | upcoming events for JIT | ✅ CONNECTED |
| HRV/Wearable data | `energy_snapshots` via `computeEnergyState()` | currentHRV, baselineHRV, delta, trend | ✅ CONNECTED |
| Completed practices today | `daily_ritual_completions` | completedModules for protocol awareness | ✅ CONNECTED |
| Recent practices (7 days) | `practice_sessions` | content_type list | ✅ CONNECTED |
| Tiny Wins (14 days) | `tiny_wins` | win_content themes | ✅ CONNECTED |
| Practice effectiveness | `content_relevance_feedback` | star_rating data | ✅ CONNECTED |
| Last session summary | `coach_session_summaries` | summary_text, key_topics, commitments, breakthrough | ✅ CONNECTED |
| Pending commitments | `coach_accountability_tracker` | pending + due commitments | ✅ CONNECTED |
| Patterns to name | `coach_pattern_observations` | active, not named, 3+ observations | ✅ CONNECTED |
| Recent memories | `coach_memory_index` | ranked by importance_score | ✅ CONNECTED |
| Effective probes | `coach_probing_effectiveness` | top probe types with effectiveness scores | ✅ CONNECTED |
| Past breakthroughs | `coach_breakthrough_moments` | content, type, was_acted_on | ✅ CONNECTED |
| LEAN ON / WATCH FOR | `user_coach_insights` | active strength/growth_area → `currentInsights` | ✅ CONNECTED |
| Dimension evolution | `computeEnergyState()` | recalibration/clarity/renewal baseline→current | ✅ CONNECTED |
| Calendar-state correlations | `daily_checkins` + `calendar_events` | predictive patterns (keyword → typical state) | ✅ CONNECTED |
| Consecutive pattern | `daily_checkins` (7 days) | days in same low-energy state | ✅ CONNECTED |
| Outer Readiness theme | `energyStateEngine` recommendation | mastery recommendation phrase | ⚠️ PARTIAL |

**Partial Connection Detail**: The coach receives the mastery recommendation from `energyStateEngine` but NOT the actual Outer Readiness Brief theme phrase from `compute-outer-readiness`. The full compass context is not wired into the coach context.

---

## 6. Downstream Consumers

Where coach output data flows TO other features:

| Coach Output | Consumer Feature | How It's Used | Status |
|---|---|---|---|
| `user_coach_insights` (strength) | Outer Readiness Brief (`compute-outer-readiness`) | "LEAN ON" guidance | ✅ CONNECTED |
| `user_coach_insights` (growth_area) | Outer Readiness Brief (`compute-outer-readiness`) | "WATCH FOR" guidance | ✅ CONNECTED |
| `user_coach_insights` (all types) | Proactive Mastery Plan (`generate-mastery-plan`) | +25 scoring boost for matching content | ✅ CONNECTED |
| `user_coach_insights` (goal) | JIT Events (`generate-jit-events`) | Coach boost scoring | ✅ CONNECTED |
| `coach_session_summaries` | Inner World Map (`insights-semantic-analysis`) | Theme extraction from topics | ✅ CONNECTED |
| `coach_session_summaries` | `coachContextBuilder` | Last session continuity | ✅ CONNECTED |
| `coach_pattern_observations` | `coachContextBuilder` | Patterns ready to name | ✅ CONNECTED |
| `coach_accountability_tracker` | `check-pending-commitments` + `coachContextBuilder` | Pending commitment check-ins | ✅ CONNECTED |
| `tiny_wins` | Insights page, `insights-semantic-analysis`, `coachContextBuilder` | Win themes and confidence evidence | ✅ CONNECTED |
| `coach_scenarios_detected` | `generate-jit-events` | JIT scoring boost (+15) | ⚠️ GAP |
| `coach_tools_offered` | `generate-jit-events` | Pending tool check (+12) | ❌ GAP |
| `update-commitment-status` | Client code | Commitment lifecycle management | ⚠️ GAP |

---

## 7. Scoring & Logic

### 7A. Mastery Plan Content Scoring (`generate-mastery-plan`)

| Signal | Boost | Condition |
|--------|-------|-----------|
| Coach insight keyword match | **+25** | Content title/tags match active `user_coach_insights` content |
| Pending coach tool match | **+15** | Content matches a tool the coach offered (via `coach_tools_offered`) |

### 7B. JIT Event Coach Boost Scoring (`generate-jit-events`)

| Signal | Boost | Condition |
|--------|-------|-----------|
| Coach mention + expressed concern | **+20** | User mentioned event type AND expressed concern in coach session |
| Scenario match | **+15** | Active `coach_scenarios_detected` matches event type |
| Pending tool | **+12** | Coach offered a tool for this event type (via `coach_tools_offered`) |
| Goal alignment | **+8** | User's coach-extracted goal relates to event type |

### 7C. Probing Effectiveness Scoring

- Each probe scored 1-10 by AI analysis
- Tracked longitudinally across sessions in `coach_probing_effectiveness`
- Aggregated by `probe_type` → avg_score, times_used
- Top 5 probe types (by avg_score) injected into coach context
- Minimum effectiveness_score >= 7 to be considered "effective" for context injection

### 7D. Pattern Naming Threshold

- Pattern requires **3+ observations** before it can be named to user
- Tracked via `observation_count` in `coach_pattern_observations`
- `was_named_to_user` flag prevents re-naming
- `detectDominantPattern()` considers: tier → outcome → dimension evolution scores

### 7E. Insight Replacement Logic

For `strength` and `growth_area` insights:
1. Only ONE active insight per type per user
2. New insight replaces existing ONLY IF:
   - Content is **different** from existing
   - Confidence is **higher** than existing (minimum 0.7)
3. Old insight deactivated (`is_active = false`), new one inserted active

### 7F. Commitment Check-in Dates

| Commitment Type | Check-in Due |
|----------------|-------------|
| Practice-based (contains "breathing", "practice", "daily") | **3 days** |
| Behavior change (all others) | **7 days** |

### 7G. Memory Importance Scoring

| Memory Type | Importance Score |
|------------|-----------------|
| Breakthrough | **10** (highest) |
| Commitment | **8** |
| Session Summary | **6** |
| Practice Feedback | **5** (lowest) |

### 7H. Memory Retrieval Scoring (Semantic Search)

```
Relevance = (Vector Similarity) × (Importance Score / 10) × (Recency Decay)
```
- Recency Decay: Linear decay over 30 days
- Fallback: Keyword/theme-based matching via GIN indexes when pgvector unavailable

### 7I. Calendar-State Correlations

- Analyzes 30 days of `daily_checkins` + `calendar_events`
- High-value keywords: board, quarterly, investor, all-hands, performance, review, presentation, pitch, interview, negotiation
- Requires 2+ occurrences per keyword
- Correlation threshold: 60%+ consistency
- Injected as predictive pattern if today's calendar matches

### 7J. HRV Divergence Detection

| Felt State | HRV Reading | Divergence Signal |
|-----------|-------------|-------------------|
| Focused | < 40ms | Running on adrenaline |
| Drained/Depleted | > 50ms | Mental/emotional, not physiological |
| Scattered/Overwhelmed | > 60ms | Cognitive dysregulation |
| Steady | < 30ms | Masking exhaustion |

---

## 8. Post-Session Pipeline

### Execution Order

```
Session End (client calls all in parallel/sequential)
  ├── [parallel] extract-coach-insights → user_coach_insights
  ├── [parallel] analyze-probing-effectiveness → coach_probing_effectiveness, coach_breakthrough_moments
  ├── [parallel] detect-recurring-patterns → coach_pattern_observations
  └── [sequential] generate-coach-summary → coach_session_summaries, coach_accountability_tracker
       └── [chained] extract-session-memories → coach_memory_index
```

### Pipeline Detail

1. **extract-coach-insights**: Reads user messages → AI extracts strength/growth_area/goal/commitment/etc → upserts `user_coach_insights` with replacement logic
2. **analyze-probing-effectiveness**: Builds coach→user exchange pairs → AI scores each probe → stores in `coach_probing_effectiveness` + `coach_breakthrough_moments`
3. **detect-recurring-patterns**: Reads user messages + existing patterns → AI identifies new/matching patterns → upserts `coach_pattern_observations`
4. **generate-coach-summary**: Reads all messages + last 5 summaries → AI generates summary → upserts `coach_session_summaries` + inserts `coach_accountability_tracker` rows
5. **extract-session-memories**: Reads the just-created summary → creates discrete memory entries in `coach_memory_index` (commitments at importance 8, breakthroughs at 10, summaries at 6, practices at 5)

---

## 9. Audit Results

### A. DB Connection Audit

| Table | Written To? | Read From? | Status |
|-------|-------------|------------|--------|
| `dialogue_sessions` | ✅ session-manage | ✅ debrief, progress, semantic-analysis, check-access | **CONNECTED** |
| `dialogue_messages` | ✅ data-persist | ✅ summary, patterns, insights, probing, session-manage | **CONNECTED** |
| `dialogue_interventions` | ✅ data-persist | ✅ debrief | **CONNECTED** |
| `detected_signals` | ✅ data-persist | ✅ debrief, progress-data | **CONNECTED** |
| `dialogue_skill_events` | ❌ NOT WRITTEN | ❌ NOT READ | **GAP — orphaned table** |
| `coach_session_summaries` | ✅ generate-coach-summary | ✅ extract-session-memories, coachContextBuilder, semantic-analysis | **CONNECTED** |
| `coach_memory_index` | ✅ extract-session-memories | ✅ coachContextBuilder | **CONNECTED** |
| `coach_accountability_tracker` | ✅ generate-coach-summary, update-commitment-status | ✅ check-pending-commitments, coachContextBuilder | **CONNECTED** |
| `coach_pattern_observations` | ✅ detect-recurring-patterns | ✅ coachContextBuilder | **CONNECTED** |
| `coach_probing_effectiveness` | ✅ analyze-probing-effectiveness | ✅ coachContextBuilder | **CONNECTED** |
| `coach_breakthrough_moments` | ✅ analyze-probing-effectiveness | ✅ coachContextBuilder | **CONNECTED** |
| `user_coach_insights` | ✅ extract-coach-insights | ✅ compute-outer-readiness, generate-mastery-plan, generate-jit-events | **CONNECTED** |
| `coach_scenarios_detected` | ❌ No coach EF writes | ✅ generate-jit-events reads | **GAP — always empty** |
| `tiny_wins` | ✅ self-mastery-coach, store-tiny-win | ✅ coachContextBuilder, semantic-analysis, tiny-wins-insights | **CONNECTED** |
| `coach_tools_offered` | ❌ TABLE DOES NOT EXIST | Referenced in generate-jit-events | **GAP — table never created** |

### B. Upstream Input Audit

| Data Source | Connected? | Status |
|-------------|-----------|--------|
| Inner Readiness (score/tier) | ✅ via `computeEnergyState()` | **CONNECTED** |
| Daily check-in | ✅ via `getTodayCheckin()` | **CONNECTED** |
| Profile (archetype, role) | ✅ direct query | **CONNECTED** |
| Calendar events | ✅ via localStorage | **CONNECTED** |
| HRV/Wearable data | ✅ via `computeEnergyState()` | **CONNECTED** |
| Completed practices | ✅ via `daily_ritual_completions` | **CONNECTED** |
| Recent practices (7 days) | ✅ via `practice_sessions` | **CONNECTED** |
| Tiny Wins | ✅ via `tiny_wins` query | **CONNECTED** |
| Practice effectiveness | ✅ via `content_relevance_feedback` | **CONNECTED** |
| Pending commitments | ✅ via `coach_accountability_tracker` | **CONNECTED** |
| Session summaries | ✅ via `coach_session_summaries` | **CONNECTED** |
| Patterns to name | ✅ via `coach_pattern_observations` | **CONNECTED** |
| Recent memories | ✅ via `coach_memory_index` | **CONNECTED** |
| Effective probes | ✅ via `coach_probing_effectiveness` | **CONNECTED** |
| Past breakthroughs | ✅ via `coach_breakthrough_moments` | **CONNECTED** |
| LEAN ON / WATCH FOR | ✅ via `user_coach_insights` | **CONNECTED** |
| Dimension evolution | ✅ via `computeEnergyState()` | **CONNECTED** |
| Outer Readiness theme | ⚠️ Uses mastery recommendation, not actual OR theme | **PARTIAL** |

### C. Downstream Consumer Audit

| Coach Output | Consumer | Status |
|---|---|---|
| `user_coach_insights` → Outer Readiness Brief | ✅ CONNECTED |
| `user_coach_insights` → Mastery Plan (+25) | ✅ CONNECTED |
| `user_coach_insights` → JIT Events (+8 goal) | ✅ CONNECTED |
| `coach_session_summaries` → Inner World Map | ✅ CONNECTED |
| `coach_session_summaries` → coachContextBuilder | ✅ CONNECTED |
| `coach_scenarios_detected` → JIT (+15) | ⚠️ GAP — never populated |
| `coach_tools_offered` → JIT (+12) | ❌ GAP — table doesn't exist |
| `update-commitment-status` → client | ⚠️ GAP — EF never called |

### D. Summary of Gaps (5 Issues)

| # | Issue | Severity | Detail |
|---|---|---|---|
| 1 | `coach_tools_offered` table does not exist | **HIGH** | `generate-jit-events` queries this table for pending tools (+12 boost). Table never created. JIT coach boost for pending tools is dead code. |
| 2 | `coach_scenarios_detected` never populated by coach | **MEDIUM** | Table exists but no coach post-session EF writes to it. `detect-recurring-patterns` should write scenario detections with `event_types[]`. Currently only JIT reads it — always empty. |
| 3 | `update-commitment-status` EF never called | **MEDIUM** | Edge function exists and works, but no client-side code invokes it. Commitments can never be marked completed/abandoned. |
| 4 | `dialogue_skill_events` table is orphaned | **LOW** | Table exists in schema but no EF writes to it and no client reads it. Dead table. |
| 5 | Outer Readiness theme not passed to coach | **LOW** | Coach receives mastery recommendation from `energyStateEngine` but not the actual outer readiness brief theme phrase from `compute-outer-readiness`. |

---

*End of document*
