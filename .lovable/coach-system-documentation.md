# Mind Module — Coach System: Complete Technical Documentation

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Edge Function #1: self-mastery-coach](#2-self-mastery-coach)
3. [Edge Function #2: dialogue-engine](#3-dialogue-engine)
4. [Edge Function #3: dialogue-session-manage](#4-dialogue-session-manage)
5. [Edge Function #4: dialogue-data-persist](#5-dialogue-data-persist)
6. [Edge Function #5: dialogue-session-debrief](#6-dialogue-session-debrief)
7. [Edge Function #6: generate-debrief-insights](#7-generate-debrief-insights)
8. [Edge Function #7: extract-coach-insights](#8-extract-coach-insights)
9. [Edge Function #8: dialogue-progress-data](#9-dialogue-progress-data)
10. [Edge Function #9: insights-semantic-analysis](#10-insights-semantic-analysis)
11. [Client-Side Signal Detection Pipeline](#11-client-side-signal-detection-pipeline)
12. [Meta-Skills Framework](#12-meta-skills-framework)
13. [Wisdom & Framework Library](#13-wisdom--framework-library)
14. [Safety & Guardrails](#14-safety--guardrails)
15. [Interdependency Map](#15-interdependency-map)
16. [Database Tables Used](#16-database-tables-used)
17. [AI Models Used](#17-ai-models-used)

---

## 1. Architecture Overview

The Coach system is split into two distinct products:

| Product | Purpose | AI Model | Response Format |
|---------|---------|----------|-----------------|
| **Self Mastery Coach** | 1:1 real-time AI coaching for inner state regulation | `google/gemini-3-flash-preview` | **Streaming** (SSE) |
| **Dialogue Room** | Scenario-based practice with AI persona + meta-skills coach | `google/gemini-2.5-flash` | **Structured JSON** |

**Total Edge Functions**: 9 (listed below)
**Client-Side Modules**: 7 detection modules + 1 safety module

---

## 2. Self Mastery Coach

**File**: `supabase/functions/self-mastery-coach/index.ts` (713 lines)
**Model**: `google/gemini-3-flash-preview` (streaming)
**Auth**: None (userId passed in body — relies on client-side Auth0)

### Purpose
Real-time inner state regulation for senior leaders. Not a productivity coach — exclusively focused on the inner world: body sensations, emotional states, thought patterns, nervous system regulation.

### Core Operating Principle
```
STATE > STORY > STRATEGY (never reverse this order)
```
- **STATE**: Help them notice and regulate their internal condition first
- **STORY**: Only then, reframe or clarify the narrative
- **STRATEGY**: Tactics come last, if at all

### Three Levels of Intervention
1. **PHYSIOLOGICAL** — Breath, posture, tension release
2. **PERCEPTUAL** — Reframe, zoom out, cognitive compression
3. **DECISIONAL** — Clarify the next clean action

Default to **smallest effective intervention**. A one-breath pause often beats a ten-minute framework.

### Flow Types (Context-Aware Initialization)
The coach supports multiple `flowType` values passed via router state:

| flowType | Behavior |
|----------|----------|
| `prepare` | Pre-performance mental rehearsal (JIT trigger) |
| `integrate` | Evening tiny win capture & reflection |
| `guided-reflection` | Walk user through specific `practiceSteps` conversationally |
| *(default)* | Open-ended coaching conversation |

### State-Aware Coaching Modes
| User State | Coach Behavior |
|------------|----------------|
| OVERWHELMED | Ground first, no strategy. Offer somatic protocol immediately |
| DRAINED | Validate, then restore. Suggest gentle, energy-conserving practices |
| SCATTERED | ONE anchor point. Do not give multiple options |
| URGENT | Slow the system, not the clock |
| FOCUSED | Go deeper. Challenge them strategically |
| STEADY | Leverage the state. Help them prepare for what matters |
| *Regulated & Clear* | Do not coach. Reflect and step back. |

### Recalibrate Protocols (Embedded Content)

**Somatic Protocols** (Pre-Cognitive):
| ID | Description |
|----|-------------|
| `box-breathing-calm` | 4-4-4-4 breath ratio, steadies nervous system |
| `bhramari-breath` | Humming exhale, vagal activation |
| `release-exhale` | Tension scan + release |
| `somatic-touch-grounding` | Physical grounding anchor |
| `presence-grounding` | Stance and posture reset |

**Mindset Protocols** (Perceptual):
| ID | Description |
|----|-------------|
| `fudoshin-immovable-mind` | Samurai equanimity under pressure |
| `clarity-eye-of-storm` | Find stillness in chaos |
| `detachment-observer` | Step back from reactivity |
| `stillness-gap` | Pause between stimulus and response |

**Marker Format**:
```
[PROTOCOL:somatic:box-breathing-calm]
[WISDOM:aviation:slow-is-smooth]
```
The app renders these as clickable practice cards with thumbnails.

### Wisdom Cards (Mental Models & Reframes)
| Category:Key | Quote |
|-------------|-------|
| `aviation:slow-is-smooth` | "Slow is smooth, smooth is fast" |
| `special-ops:control-dichotomy` | Focus only on controllables |
| `medicine:stabilize-first` | "First, stabilize — then act" |
| `diplomacy:role-not-emotion` | "Play the role, not the emotion" |
| `sport:one-clean-action` | "One clean action beats ten reactive" |
| `stoic:obstacle-is-way` | "The impediment becomes the way" |
| `leadership:intentional-over-reactional` | "Speed matters, direction matters more" |
| `neuro:pause-respond` | "Between stimulus and response is a space" |

### Recommendation Rules (Guardrails)
- **Frequency**: Do NOT recommend protocols with every exchange. Save for key inflection points or explicit requests.
- **Completed Practice Awareness**: Before recommending ANY protocol, check `planStatus.completedModules` and `recentPractices`. Never recommend a protocol the user has already completed in the current session.
- **Contextuality**: ALWAYS explain WHY a specific practice helps their current situation (1-2 sentences before the marker).

### Meta-Skills Trained (Subtly, Never Named)
1. **Self-Regulation** — Every grounding protocol trains regulation
2. **Resilience** — Acknowledge difficulty without solving it; reference past wins
3. **Emotional Intelligence** — Name emotions precisely; link feelings to decisions
4. **Confidence** — Evidence-based (reference `tiny_wins`); preparation-based
5. **Influence & Presence** — Posture and breath affect perception
6. **Learning Agility** — Pattern recognition; post-event reflection

### Input Quality Awareness
Detects and handles:
- Random characters or gibberish (`asdf`, `lkjh`, `fnfnf`)
- Single letters or very short nonsense (< 3 chars)
- Keyboard mashing or testing patterns
Response: Gentle redirect, not interpretation.

### Non-Performative Coaching Rules
- Responses: 2-4 sentences maximum unless guiding a practice
- One powerful question beats three good ones
- Fragments are permitted; full sentences not required
- End session early if they're regulated and clear

### Signature Techniques
1. **Somatic Check-In**: Before strategizing, ask what they notice in their body
2. **Zoom Out**: See the situation from 30,000 feet
3. **The Real Question**: Identify the question beneath their question
4. **Name the Pattern**: Surface recurring themes across conversations
5. **Future Self**: Connect today's regulation to tomorrow's leadership impact

### Self-Mastery Focus (Hard Boundary)
**NOT a productivity coach. Does NOT help with:**
- Task prioritization or time management
- Action planning or "first steps"
- Breaking down projects into tasks
- Calendar or schedule optimization

If user asks for task help, gently redirect: *"That's important, and you'll figure out the logistics. But first — what's going on inside you right now? That's where we work."*

### Dynamic Context (`CoachContext` Interface)
```typescript
interface CoachContext {
  todayState?: { score: number; tier: string; outcome?: string; contextStatement?: string };
  theme?: { phrase: string; context: string; driver?: string };
  jitContext?: { trigger: string; eventTitle?: string; minutesUntil?: number };
  consecutivePattern?: { days: number; state: string };
  userArchetype?: string;
  identityRole?: string;
  planStatus?: { completedModules: string[]; pendingModules: string[] };
  timeOfDay?: string;
  recentPractices?: string[];
  practiceSteps?: Array<{ title: string; instruction: string; duration?: number }>;
  practiceTitle?: string;
  insights?: {
    statePatterns?: { distribution: Record<string, number>; mostCommonState: string };
    tinyWinsThemes?: string[];
    practiceCount: number;
    checkInStreak: number;
  };
  predictivePatterns?: {
    todayPrediction?: { dayOfWeek: string; predictedState: string; triggerKeywords: string[]; confidence: number };
    calendarCorrelations?: Array<{ eventKeyword: string; typicalState: string; occurrences: number }>;
  };
}
```

### Tiny Win Extraction (Background, Non-Blocking)
For `integrate` and `guided-reflection` flows, the function fires a parallel AI call (`google/gemini-2.5-flash-lite`) using **tool calling** to detect genuine tiny wins from the conversation and store them in `tiny_wins` table.

**Blocklist**: Prevents storing coach prompt phrases as wins (e.g., "one thing I did right today").
**Validation**: Win content must be ≥ 10 chars, not match blocklist, and be a genuine personal achievement.

---

## 3. Dialogue Engine

**File**: `supabase/functions/dialogue-engine/index.ts` (1888 lines)
**Model**: `google/gemini-2.5-flash` (structured JSON)
**Auth**: None (context passed from client)

### Purpose
The brain of the Dialogue Room. Operates a **dual-entity dialogue system** with two distinct voices:
1. **AI PERSONA** — The conversation partner the user is practicing with
2. **META SKILLS COACH** — A feedback-focused coach providing guidance

### Input Validation
Full Zod schema validation for all inputs:
- `SignalsSchema` — Client-side detected signals
- `ContextSchema` — Persona, coach, scenario, session context
- `ConversationHistorySchema` — Max 100 messages, max 10,000 chars each
- `SafetyCheckSchema` — Crisis/safety flags
- `DialogueEngineInputSchema` — Top-level schema with `type` (opening/response)

### Two Modes

#### Opening Mode (`type: 'opening'`)
Generates the first message from the persona to start the conversation.

**Opening Rules**:
- Location-neutral (never assume physical presence)
- Match personality style exactly
- Challenging ≠ rude
- Full immersion — never reference "practice", "training", or "simulation"
- 1-3 sentences maximum

#### Response Mode (`type: 'response'`)
Processes user messages and generates dual-entity responses.

### Persona Configuration

**Personality Styles** (4 predefined + custom):

| Style | Behavior | Question Intensity | Meta-Skill Opportunities Created |
|-------|----------|-------------------|----------------------------------|
| `warm-supportive` | Encouraging, builds rapport | MODERATE | Over-sharing → Self-Regulation; too casual → Social Intelligence |
| `analytical-direct` | Precise, evidence-focused | HIGH | Defensiveness → EI; freezing → Emotional Resilience |
| `challenging-probing` | Devil's advocate, tests resilience | VERY HIGH | Defensive reactions → Self-Regulation; frustration → EI |
| `neutral-professional` | Balanced, formal, objective | MODERATE | Struggling to read room → Social Intelligence; anxiety → Self-Regulation |

**Voice Styles**: `masculine` (assertive, direct) | `feminine` (collaborative, empathetic) | `neutral`

**Conversation Dynamics**:
- **Initiative**: `persona_primary` | `user_primary` | `user_initiates` | `mutual`
- **Style**: `evaluative` | `conversational` | `collaborative` | `challenging` | `advisory` | `presentation` | `presentation_then_qa` | `balanced`
- **Intensity**: `low` | `moderate` | `high` | `very_high`
- **User Can Question**: boolean

### Coaching Style Modes

| Mode | Behavior |
|------|----------|
| `supportive` | Celebrate progress, frame gaps as growth opportunities |
| `challenging` | Push out of comfort zone, call out missed opportunities |
| `minimal` | Intervene only for significant gaps or breakthrough moments |
| `adaptive` | Dynamically choose tone based on conversation context |

### Intervention Trigger Conditions

#### MUST Intervene (Non-Negotiable)
| Trigger | Meta-Skill Teaching |
|---------|---------------------|
| Off-topic response | Social Intelligence: Context reading |
| Critical skill gap | Varies by gap type |
| User distress/frustration | Emotional Resilience: Stress management |
| Aggressive response | EI: Emotional Regulation |
| Response too short/evasive (< 15 words) | Social Intelligence: Appropriate elaboration |
| Over-explaining/rambling (> 200 words) | Self-Regulation: Discipline, Focus |
| User repeating themselves | Learning Agility: Adaptability to Feedback |

#### MUST Intervene — Questioning Failures
| Trigger | Meta-Skill Teaching |
|---------|---------------------|
| Accepted surface answer without probing | Learning Agility: Curiosity |
| Missed obvious opening | Social Intelligence: Conversational awareness |
| Asked closed question when open needed | Social Intelligence: Information gathering |
| Generic question asked | Learning Agility: Strategic thinking |
| Rapid-fire questions without listening | Self-Regulation: Patience |
| Leading question that assumes answer | Learning Agility: Open-minded inquiry |

#### DO NOT Intervene When (Strictly Enforced)
1. In breakthrough moment
2. Demonstrating mastery
3. Too soon after last intervention (wait ≥ 3 message exchanges)
4. Rate limit reached (max 3 interventions in last 6 messages)
5. User is in flow / performing well

### Intervention Gate Check (3-Gate System)

| Gate | Check | Pass Condition |
|------|-------|----------------|
| Gate 1 | Rate Limit | ≥ 3 messages since last intervention |
| Gate 2 | Performance Assessment | Skill gap or learning opportunity detected |
| Gate 3 | Framework Variety | Can use a different framework than previously used |

**If ANY gate fails → `should_intervene: false`**

### Questioning Behavior → Meta-Skill Mapping
| Behavior | Meta-Skill | Sub-Skill |
|----------|------------|-----------|
| Strategic question asked | Social Intelligence | Information Gathering |
| Probing after surface answer | Learning Agility | Not Accepting Face Value |
| Open vs. closed question choice | Social Intelligence | Communication Clarity |
| Building on persona's point | Learning Agility | Reflective Thinking |
| Challenging question respectfully | Social Intelligence | Influence |
| Asking about experience/perspective | Social Intelligence | Rapport Building |
| Listening before asking next question | Self-Regulation | Patience, Discipline |

### Question Opportunity Detection (Ripe Moments)
The engine detects when the user missed questioning opportunities:
- Surface answer given → should have probed deeper
- Interesting detail shared → should have followed up
- Open thread available → should have revisited
- Challenge opportunity → could have questioned
- Story cue given → should have asked for the story
- Contradiction detected → should have probed

### Output JSON Structure
```json
{
  "persona_response": {
    "content": "In-character response (25+ words for follow-ups)",
    "emotion": "The persona's emotional state",
    "internal_assessment": "What persona thinks of user's performance"
  },
  "coaching_intervention": {
    "should_intervene": true/false,
    "type": "skill_gap | positive_reinforcement | safety | system_recovery | off_topic",
    "observation": "What you observed (second person: 'You said...')",
    "gap_or_strength": "Specific skill identified",
    "meta_skill": "emotional_intelligence | self_regulation | learning_agility | emotional_resilience",
    "sub_skill": "Specific sub-skill",
    "framework_name": "From the 24+ framework library (EXACT name)",
    "framework_source": "ancient_wisdom | high_performer | psychology | practical",
    "framework_wisdom": "EXACT quote from library with author",
    "framework_application": "1-line (max 20 words) applying framework to THIS moment",
    "action_step": "Specific, concrete action for user's NEXT response",
    "tone": "supportive | challenging | direct"
  },
  "refined_analysis": {
    "sentiment_override": "Only if rule-based was wrong",
    "emotion_override": "Only if rule-based was wrong",
    "additional_gaps": [],
    "additional_strengths": []
  },
  "safety_response": {
    "is_safety_situation": true/false,
    "clarification_asked": "Question if context unclear",
    "resources_provided": [],
    "empathy_statement": "Supportive statement if needed"
  },
  "session_note": "Brief note for analytics"
}
```

### Anti-Reset Rule
For follow-up messages (not openings), the engine MUST:
- Continue the existing conversation thread naturally
- Reference specific points from the user's most recent response
- Ask a NEW substantive follow-up question
- NEVER repeat the opening message or use generic phrases

---

## 4. Dialogue Session Manage

**File**: `supabase/functions/dialogue-session-manage/index.ts` (320 lines)
**Auth**: Auth0 token verification (with 3x retry for rate limits)
**DB Access**: Service role (bypasses RLS)

### Purpose
Lifecycle management for all dialogue sessions (both Coach and Dialogue Room).

### Actions

| Action | Description | Tables |
|--------|-------------|--------|
| `create` | Create Dialogue Room session with scenario + persona | `dialogue_sessions`, `scenario_definitions`, `persona_definitions` |
| `end` | End session with duration, message count, intervention count | `dialogue_sessions` |
| `GET_LATEST` | Return most recent session ID for user | `dialogue_sessions` |
| `create_coach` | Create Self Mastery Coach session (context_type: "coach") | `dialogue_sessions` |
| `LIST_COACH_SESSIONS` | List recent coach sessions with first user message as title | `dialogue_sessions`, `dialogue_messages` |

### Session Data Stored
```sql
user_id, scenario_id, persona_id, context_type, scenario_context,
coach_personality, session_status, meta_data, started_at, ended_at,
duration_seconds, total_messages, total_interventions
```

---

## 5. Dialogue Data Persist

**File**: `supabase/functions/dialogue-data-persist/index.ts` (235 lines)
**Auth**: Auth0 token verification
**DB Access**: Service role (bypasses RLS)

### Purpose
Persistence layer for messages, signals, and interventions. Uses service role to bypass RLS for Auth0-authenticated users.

### Operations

| Type | What It Stores | Tables |
|------|----------------|--------|
| `message` | Message content, sender_type, emotion, timestamp + detected signals | `dialogue_messages`, `detected_signals` |
| `intervention-create` | Meta-skill target, observation, framework, action, wisdom source | `dialogue_interventions` |
| `intervention-update` | Dismissal timestamp, acknowledged status, view duration | `dialogue_interventions` |

### Session Ownership Verification
Every operation verifies the authenticated user owns the session via `dialogue_sessions.user_id`.

### Signal Storage
When a message is persisted, the following signal data is stored alongside it:
- `sentiment` — Polarity, intensity, confidence
- `emotions` — Primary/secondary emotions
- `ei_behaviors` — Empathy, self-regulation, perspective-taking
- `skill_gaps` — Self-mastery and social-mastery gaps
- `skill_strengths` — Demonstrated strengths
- `conversation_flow` — Response type, topic shift, questions asked
- `risk_assessment` — Escalation risk, intervention urgency
- `coaching_readiness` — Openness, breakthrough potential, mastery
- `raw_signals` — Complete raw signal object

---

## 6. Dialogue Session Debrief

**File**: `supabase/functions/dialogue-session-debrief/index.ts` (149 lines)
**Auth**: Auth0 token verification
**DB Access**: Service role

### Purpose
Fetches all data for a completed session to build the debrief/review screen.

### Data Returned
Fetches in parallel:
- `dialogue_sessions` — Full session record
- `dialogue_messages` — All messages ordered by `message_index`
- `dialogue_interventions` — All interventions ordered by `displayed_at`
- `detected_signals` — All detected signals for the session

---

## 7. Generate Debrief Insights

**File**: `supabase/functions/generate-debrief-insights/index.ts` (184 lines)
**Model**: `google/gemini-2.5-flash`
**Auth**: None (called internally)

### Purpose
Transforms raw skill data from a Dialogue Room session into crisp, human-readable feedback.

### LLM Prompt
```
System: You are an expert executive coach. Transform raw skill data into crisp, single-line feedback.
RULES:
- ONE sentence max (15 words or less) per item
- Maximum 3-4 strengths and 3-4 blind spots total
- Write in second person ("You...")
- Be specific and behavioral
- No jargon or fluff
```

### Input
```typescript
{
  strengths: Array<{ metaSkill: string; subSkill?: string; indicators?: string[] }>;
  developmentAreas: Array<{ metaSkill: string; subSkill?: string; observation: string; actionSuggested?: string }>;
  scenarioContext: { domain?: string; context?: string; duration?: number };
}
```

### Output
```json
{
  "enhancedStrengths": [{ "metaSkill": "", "subSkill": "", "description": "ONE sentence" }],
  "enhancedBlindSpots": [{ "metaSkill": "", "subSkill": "", "observation": "ONE sentence", "actionSuggested": "ONE phrase" }]
}
```

### Fallback
If AI parsing fails, returns original data formatted as-is.

---

## 8. Extract Coach Insights

**File**: `supabase/functions/extract-coach-insights/index.ts` (264 lines)
**Model**: `google/gemini-2.5-flash`
**Auth**: Auth0 token verification

### Purpose
Post-session processor that analyzes user messages from Self Mastery Coach sessions to extract:

| Insight Type | Examples |
|-------------|----------|
| `preference` | "I find breathing exercises helpful", "Box breathing works for me" |
| `goal` | "I want to stay calmer in meetings", "My focus is emotional regulation" |
| `feedback` | "That exercise really helped", "The meditation was too long" |
| `challenge` | "I have trouble focusing", "I get overwhelmed easily" |

### LLM Prompt
```
Analyze the following user messages from a coaching conversation and extract insights.
- type: preference | goal | feedback | challenge
- content: A concise 1-sentence summary
- confidence: 0.0 to 1.0
Only extract genuine, meaningful insights. Skip generic statements.
If a message references a specific practice, include it in the content.
```

### Filtering
- Only analyzes messages > 10 chars
- Only stores insights with confidence ≥ 0.6
- Validates insight type is one of the 4 categories

### Storage
Insights stored in `user_coach_insights` table with:
```sql
user_id, insight_type, insight_content, content_reference,
source_session_id, confidence_score, is_active
```

---

## 9. Dialogue Progress Data

**File**: `supabase/functions/dialogue-progress-data/index.ts` (125 lines)
**Auth**: Auth0 token verification
**DB Access**: Service role

### Purpose
Aggregates long-term skill progress data across all completed Dialogue Room sessions for a user.

### Data Returned
- All completed `dialogue_sessions` with joined `scenario_definitions.category`
- All `detected_signals` (skill_strengths, skill_gaps) for those sessions

Used by the Progress/Growth tracking UI to show skill development over time.

---

## 10. Insights Semantic Analysis

**File**: `supabase/functions/insights-semantic-analysis/index.ts` (691 lines)
**Model**: `google/gemini-2.5-flash-lite` (2 separate AI calls)
**Auth**: Auth0 token verification
**DB Access**: Service role

### Purpose
Generates the "Inner World Map" visualization by aggregating themes from ALL data sources.

### Data Sources Aggregated
1. **Daily Themes** (`daily_themes`) — Theme phrases and drivers
2. **Coach Dialogue** (`dialogue_messages` via `dialogue_sessions` where `context_type = 'coach'`) — AI-extracted keywords via Gemini
3. **Practice Events** (`sanctuary_events`) — Categorized into calm/focus/energy themes
4. **Tiny Wins** (`tiny_wins`) — Keyword matching against 21 predefined keywords
5. **Check-ins** (`daily_checkins`) — Outcome mapping + state tags

### AI Calls

**Call 1: Theme Extraction from Coach Conversations**
```
Model: google/gemini-2.5-flash-lite
Prompt: Extract 5-8 most important themes and 2-4 relationships between themes
Output: { keywords: [{keyword, count}], relationships: [{from, to, strength, type}] }
```

**Call 2: AI Observation (2-sentence synthesis)**
```
Model: google/gemini-2.5-flash-lite
Prompt: What do [top 5 themes] collectively reveal about this leader's inner world?
Two sentences maximum. Speak directly to the leader.
```

**Call 3 (on-demand): Node Summary**
```
Model: google/gemini-2.5-flash-lite
Prompt: Write 3-5 sentence synthesis of what theme "[keyword]" reveals about their inner world.
Be specific to their data — not generic. Name the pattern, its context, and what it signals.
```

### Theme Relationship Types
- `often co-occur`
- `tension between`
- `feeds into`
- `grounded by`

### Algorithmic Fallbacks
All AI calls have algorithmic fallbacks that generate observations from the data directly if AI is unavailable (rate limits, credits exhausted).

### Actions
| Action | Description |
|--------|-------------|
| `analyze` (default) | Full semantic analysis with themes, relationships, AI observation |
| `getBubbleDetails` | Legacy: get recent mentions for a specific keyword |
| `getNodeSummary` | V2: rich AI summary for a specific theme node |

---

## 11. Client-Side Signal Detection Pipeline

**File**: `src/utils/dialogue/signalDetectionPipeline.ts`
**Location**: Runs in browser before messages are sent to `dialogue-engine`

### Pipeline Modules

| Module | File | Purpose |
|--------|------|---------|
| Sentiment Analyzer | `detection/sentimentAnalyzer.ts` | Lexicon-based sentiment scoring (-1 to 1) with negation and intensifier handling |
| Emotion Detector | `detection/emotionDetector.ts` | Detects 13 emotion types: joy, sadness, anger, fear, surprise, disgust, frustration, anxiety, confidence, confusion, enthusiasm, defensiveness, openness |
| EI Behavior Markers | `detection/eiBehaviorMarkers.ts` | Detects empathy, self-regulation, perspective-taking, reflective statements, escalation patterns (0-10 scale) |
| Skill Gap Detector | `detection/skillGapDetector.ts` | Identifies gaps AND strengths across self_mastery and social_mastery clusters |
| Conversation Flow Analyzer | `detection/conversationFlowAnalyzer.ts` | Response type (elaborate/defensive/dismissive/curious/agreement/challenge), topic shift, questions asked, assumptions, acknowledgements |
| Coaching Readiness Engine | `detection/coachingReadinessEngine.ts` | Openness score (0-1), breakthrough potential, mastery demonstrated, rate-limited canIntervene flag |
| Lexicons | `detection/lexicons.ts` | Word lists: POSITIVE_WORDS, NEGATIVE_WORDS, INTENSIFIERS, NEGATORS |

### Risk Assessment (Calculated from Signals)
```typescript
interface RiskAssessment {
  escalationRisk: 'low' | 'medium' | 'high';    // score ≥5=high, ≥2=medium
  interventionUrgency: 'none' | 'low' | 'medium' | 'high';  // score ≥6=high, ≥3=medium
  riskFactors: string[];
}
```

Risk factors considered:
- High negative sentiment intensity (+2)
- Escalation pattern detected (+level/2)
- Defensive response pattern (+1)
- Dismissive response pattern (+1)

### Safety Module
**File**: `src/utils/dialogue/safety/safetyProtocols.ts`

Pre-screens all user messages before they reach the LLM for:
- Crisis indicators (self-harm, violence)
- Context classification (scenario vs personal)
- Severity assessment
- Resource provision (defaults to UK resources)

### Output Type
```typescript
interface DetectedSignals {
  sentiment: SentimentResult;
  emotions: EmotionResult[];
  eiBehaviors: EIBehaviors;
  skillGaps: SkillGap[];
  skillStrengths: SkillGap[];
  conversationFlow: ConversationFlow;
  riskAssessment: RiskAssessment;
  coachingReadiness: CoachingReadiness;
}
```

---

## 12. Meta-Skills Framework

### Cluster: SELF MASTERY
*Core Function: Managing the Inner World — cultivating awareness, resilience, and self-direction*

| Meta-Skill | Sub-Skills | Soft Skills |
|------------|------------|-------------|
| **Emotional Intelligence** | Emotional Regulation, Self-Awareness, Mindfulness, Emotional Mastery, Self-Compassion | Empathy, Active Listening, Compassion |
| **Self-Regulation** | Goal Setting, Purpose Alignment, Identity Alignment, Focus, Discipline | Self-Motivation, Integrity, Growth Mindset |
| **Learning Agility** | Self-Directed Learning, Reflective Thinking, Unlearning, Adaptability to Feedback, Continuous Improvement | Curiosity, Openness to Change |
| **Emotional Resilience** | Stress Management, Perseverance, Optimism, Emotional Recovery | Positivity, Self-Confidence, Empathy, Compassion |

### Cluster: SOCIAL MASTERY
*Core Function: Navigating Relationships — understanding and influencing others*

| Meta-Skill | Sub-Skills | Soft Skills |
|------------|------------|-------------|
| **Social Intelligence** | Perspective-Taking, Cultural Awareness, Value Clarification, Moral Reasoning, Ethical Judgment | Empathy, Trust-Building, Intercultural Sensitivity, Active Listening, Communication |
| **Social Awareness** | Empathy, Perspective Taking, Active Listening, Social Cue Reading | Compassion, Cultural Sensitivity |
| **Relationship Management** | Influence, Communication Clarity, Conflict Resolution, Rapport Building, Boundary Setting | Diplomacy, Trustworthiness, Collaboration |

---

## 13. Wisdom & Framework Library

### Ancient Wisdom (source: `ancient_wisdom`)
| Framework | Attribution | Quote |
|-----------|-------------|-------|
| Stoicism | Viktor Frankl | "Between stimulus and response there is a space. In that space is our power to choose our response." |
| Stoicism | Marcus Aurelius | "You have power over your mind, not outside events. Realize this, and you will find strength." |
| Stoicism | Epictetus | "It's not what happens to you, but how you react to it that matters." |
| Buddhism | Jon Kabat-Zinn | "You cannot control the waves, but you can learn to surf." |
| Buddhism | Thích Nhất Hạnh | "Feelings come and go like clouds in a windy sky. Conscious breathing is my anchor." |
| Samurai Bushido | Miyamoto Musashi | "Think lightly of yourself and deeply of the world." |
| Greek Philosophy | Socrates | "Know thyself." |
| Greek Philosophy | Aristotle | "We are what we repeatedly do. Excellence, then, is not an act, but a habit." |

### High Performer Wisdom (source: `high_performer`)
| Framework | Attribution | Quote/Technique |
|-----------|-------------|-----------------|
| Elite Athletes | Billie Jean King | "Pressure is a privilege." |
| Elite Athletes | Michael Jordan | "I've failed over and over and over again in my life. And that is why I succeed." |
| Navy SEALs | Tactical Breathing | Box breathing: inhale 4, hold 4, exhale 4, hold 4 |
| Surgeons | Medical Tradition | "Slow is smooth, smooth is fast." |
| Negotiators | Chris Voss | "Never split the difference. Tactical empathy means understanding the feelings behind what someone says." |
| Fighter Pilots | John Boyd | OODA Loop: Observe, Orient, Decide, Act |
| Active Listening | Stephen Covey | "Most people do not listen with the intent to understand; they listen with the intent to reply." |
| Mirroring | Chris Voss | Repeat the last 1-3 words to build rapport and encourage elaboration |
| Radical Candor | Kim Scott | "Care personally, challenge directly." |

### Questioning & Inquiry (source: `high_performer`)
| Framework | Attribution | Principle |
|-----------|-------------|-----------|
| Socratic Method | Socrates | "I cannot teach anybody anything. I can only make them think." |
| Five Whys | Toyota Production System | Ask "why" five times to get to root cause |
| Tactical Inquiry | Chris Voss | "What" and "How" questions give control without confrontation |
| Humble Inquiry | Edgar Schein | "The fine art of drawing someone out, of asking questions to which you do not already know the answer." |
| Appreciative Inquiry | David Cooperrider | Ask about what works, not just what's broken |
| Beautiful Questions | Warren Berger | Questions that reframe problems and open new possibilities |
| Diagnostic Questioning | Medical Tradition | Start broad, then narrow |

### Practical Frameworks (source: `practical`)
| Framework | Attribution | Technique |
|-----------|-------------|-----------|
| STOP Technique | Mindfulness | Stop, Take a breath, Observe, Proceed |
| Name It to Tame It | Dan Siegel | Labeling emotions activates prefrontal cortex, reduces amygdala reactivity |
| Perspective Ladder | — | Self → Other → Observer → Future Self |
| The 90-Second Rule | Jill Bolte Taylor | Emotional chemicals flush in 90 seconds if not re-triggered |
| RAIN | Tara Brach | Recognize, Allow, Investigate, Nurture |
| Centering | Sports Psychology | Focus on center of gravity before high-stakes moments |

### Psychology (source: `psychology`)
| Framework | Attribution | Principle |
|-----------|-------------|-----------|
| Emotional Granularity | Lisa Feldman Barrett | Specific emotion words → better regulation |
| Cognitive Reframing | Aaron Beck | Changing interpretation changes emotional response |
| Window of Tolerance | Dan Siegel | Optimal zone between hyper/hypoarousal |
| Growth Mindset | Carol Dweck | Abilities develop through dedication and hard work |
| Self-Distancing | Ethan Kross | Third person reduces emotional reactivity |
| Yerkes-Dodson Law | — | Optimal performance requires optimal arousal |

### Framework Deduplication Rules
- With 24+ frameworks available, the engine MUST use variety
- Previously used frameworks are tracked per session (`previousFrameworks`)
- If the "best fit" was already used, pick the next best option
- Only repeat if absolutely no other framework applies (wait ≥ 3 exchanges)

---

## 14. Safety & Guardrails

### Safety Protocols (Client-Side + LLM-Side)

**Client-Side** (`safetyProtocols.ts`):
- Pre-screens all messages before LLM call
- Crisis detection with keyword matching
- Context classification (scenario vs personal)
- Rate limiting for interventions

**LLM-Side** (embedded in dialogue-engine prompt):

**Core Safety Principles**:
1. Warm, calm, compassionate tone in all situations
2. Never make medical, legal, or diagnostic claims
3. Never promise to keep users safe — encourage professional help
4. Default to UK resources (user location: London)

**Context-Aware Handling**:
- Sensitive topics AS PART OF SCENARIO/DEBATE → Allow academic discussion
- Personal experience detected → Provide resources, express empathy
- Context unclear → Ask clarifying question before proceeding

**Absolute Blocks** (never generate regardless of context):
- Instructions for self-harm, violence, or illegal activity
- Child exploitation content
- Terrorism promotion or recruitment
- Malware/hacking instructions

### Coach-Specific Guardrails

| Guardrail | Self Mastery Coach | Dialogue Engine |
|-----------|-------------------|-----------------|
| Max response length | 2-4 sentences | No hard limit (persona) |
| Protocol frequency | Save for key inflection points | Rate limited (3-gate system) |
| Completed practice check | Yes — checks `completedModules` | N/A |
| Productivity boundary | Hard block — redirects to inner state | N/A |
| Framework repetition | N/A | Deduplication enforced per session |
| Intervention rate limit | N/A | ≥ 3 messages between interventions |
| Input quality check | Gibberish detection | N/A |

---

## 15. Interdependency Map

```
┌──────────────────────────────────────────────────────────────────┐
│                     CLIENT (Browser)                             │
│                                                                  │
│  ┌─────────────────────┐    ┌──────────────────────────────────┐ │
│  │ Signal Detection    │    │ Safety Protocols                 │ │
│  │ Pipeline            │    │ (safetyProtocols.ts)             │ │
│  │ - sentimentAnalyzer │    └──────────────────────────────────┘ │
│  │ - emotionDetector   │                                        │
│  │ - eiBehaviorMarkers │                                        │
│  │ - skillGapDetector  │                                        │
│  │ - conversationFlow  │                                        │
│  │ - coachingReadiness │                                        │
│  └────────┬────────────┘                                        │
│           │ DetectedSignals                                     │
│           ▼                                                     │
│  ┌────────────────────┐     ┌──────────────────────────┐        │
│  │ Self Mastery Coach │     │ Dialogue Room            │        │
│  │ (streaming SSE)    │     │ (structured JSON)        │        │
│  └────────┬───────────┘     └──────────┬───────────────┘        │
└───────────┼────────────────────────────┼────────────────────────┘
            │                            │
            ▼                            ▼
┌───────────────────────┐    ┌──────────────────────────┐
│ self-mastery-coach    │    │ dialogue-engine           │
│ (gemini-3-flash)      │    │ (gemini-2.5-flash)        │
│ Streaming response    │    │ JSON response             │
│                       │    │                            │
│ Background:           │    │ Input: signals, context,   │
│ extractAndStoreTinyWin│    │ history, safety            │
│ (gemini-2.5-flash-    │    │                            │
│  lite, tool calling)  │    │ Output: persona_response + │
│         │             │    │ coaching_intervention +     │
│         ▼             │    │ refined_analysis + safety   │
│   tiny_wins table     │    └────────────┬───────────────┘
└───────────────────────┘                 │
                                          │
                              ┌───────────▼──────────────┐
                              │ dialogue-data-persist     │
                              │ (service role, Auth0)     │
                              │                           │
                              │ Stores:                   │
                              │ - dialogue_messages       │
                              │ - detected_signals        │
                              │ - dialogue_interventions  │
                              └───────────────────────────┘
                                          │
                    ┌─────────────────────┼─────────────────────┐
                    │                     │                     │
                    ▼                     ▼                     ▼
          ┌─────────────────┐  ┌──────────────────┐  ┌──────────────────┐
          │ dialogue-       │  │ dialogue-session- │  │ dialogue-        │
          │ session-manage  │  │ debrief           │  │ progress-data    │
          │                 │  │                   │  │                  │
          │ create/end/list │  │ Fetch all session │  │ Aggregate long-  │
          │ sessions        │  │ data for review   │  │ term skill data  │
          └─────────────────┘  └────────┬──────────┘  └──────────────────┘
                                        │
                               ┌────────▼──────────┐
                               │ generate-debrief- │
                               │ insights          │
                               │ (gemini-2.5-flash) │
                               │                    │
                               │ Raw skills →       │
                               │ crisp feedback     │
                               └────────────────────┘

          ┌──────────────────────┐    ┌──────────────────────────┐
          │ extract-coach-       │    │ insights-semantic-        │
          │ insights             │    │ analysis                  │
          │ (gemini-2.5-flash)   │    │ (gemini-2.5-flash-lite)   │
          │                      │    │                           │
          │ Post-session:        │    │ Inner World Map:          │
          │ preferences, goals,  │    │ themes from ALL sources   │
          │ feedback, challenges │    │ (coach, practice, wins,   │
          │        │             │    │  check-ins, daily themes) │
          │        ▼             │    │                           │
          │ user_coach_insights  │    │ AI observation +          │
          │ table                │    │ theme relationships       │
          └──────────────────────┘    └──────────────────────────┘
```

---

## 16. Database Tables Used

### Core Session Tables
| Table | Used By | Purpose |
|-------|---------|---------|
| `dialogue_sessions` | session-manage, data-persist, debrief, progress-data, semantic-analysis | Central session record |
| `dialogue_messages` | data-persist, debrief, session-manage, semantic-analysis | All conversation messages |
| `dialogue_interventions` | data-persist, debrief | Coach intervention records |
| `detected_signals` | data-persist, debrief, progress-data | Per-message signal analysis |
| `dialogue_analytics` | (generated post-session) | AI-generated session summaries |
| `dialogue_skill_events` | (generated post-session) | Individual skill gap/strength events |

### Reference Tables
| Table | Used By | Purpose |
|-------|---------|---------|
| `scenario_definitions` | session-manage, progress-data | Scenario metadata + conversation dynamics |
| `persona_definitions` | session-manage | Persona configuration |
| `meta_skill_definitions` | (reference) | Meta-skill taxonomy |
| `meta_skill_progress` | (aggregated) | User's long-term skill scores |

### Data Sources for Context & Insights
| Table | Used By | Purpose |
|-------|---------|---------|
| `daily_checkins` | semantic-analysis, self-mastery-coach (context) | State outcomes + tags |
| `daily_themes` | semantic-analysis, self-mastery-coach (context) | Theme phrases + drivers |
| `tiny_wins` | self-mastery-coach (extraction), semantic-analysis | User achievements |
| `practice_sessions` | self-mastery-coach (context) | Practice history |
| `sanctuary_content` | self-mastery-coach (protocol cards) | Practice content library |
| `energy_snapshots` | self-mastery-coach (context) | Energy + HRV data |
| `calendar_events` | self-mastery-coach (JIT context) | Upcoming events |
| `calendar_event_classifications` | self-mastery-coach (context) | Event stakes classification |
| `user_coach_insights` | extract-coach-insights | Extracted preferences, goals |
| `profiles` | self-mastery-coach (context) | Archetype, streak, scores |
| `inner_readiness_scores` | self-mastery-coach (context) | Daily readiness score |
| `daily_ritual_completions` | self-mastery-coach (context) | Completed practices today |
| `coach_intervention_outcomes` | (feedback tracking) | Intervention effectiveness |

---

## 17. AI Models Used

| Model | Used By | Purpose | Response Format |
|-------|---------|---------|-----------------|
| `google/gemini-3-flash-preview` | self-mastery-coach | Real-time streaming coaching | SSE stream |
| `google/gemini-2.5-flash` | dialogue-engine, generate-debrief-insights, extract-coach-insights | Structured JSON responses | JSON |
| `google/gemini-2.5-flash-lite` | self-mastery-coach (tiny wins), insights-semantic-analysis | Lightweight extraction & summarization | JSON |

All models accessed via **Lovable AI Gateway** (`https://ai.gateway.lovable.dev/v1/chat/completions`) using `LOVABLE_API_KEY` — no external API keys required.

### Error Handling (All Functions)
| Status | Response |
|--------|----------|
| 429 | Rate limit exceeded — retry later |
| 402 | AI credits exhausted |
| 500 | Generic AI service failure |
| Parse error | Algorithmic fallback or graceful degradation |
