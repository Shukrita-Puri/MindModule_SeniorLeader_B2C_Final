

# Self-Mastery Coach -- Three Co-Equal Roles + Probing Infrastructure

## Overview

Two-part upgrade: (1) restructure the LLM prompt to establish three co-equal roles instead of a single "primary role," and (2) add database tables and a post-session edge function to track probing effectiveness and breakthrough moments.

---

## Part 1: LLM Prompt Restructure

### File: `supabase/functions/self-mastery-coach/index.ts`

**What changes:** Replace lines 26-137 (the "YOUR PRIMARY ROLE: THOUGHT ORGANIZER" section) with the new "YOUR THREE ROLES (CO-EQUAL)" section containing:

- **Introduction** framing all three roles as co-equal and interlocking
- **Role 1: Organize Their Thinking** -- condensed version of the existing thought organizer content (extract signal, separate layers, surface real question, create cognitive space)
- **Role 2: Probe to Surface Their Own Solutions** -- entirely new section covering why probing matters at C-suite level, the probe structure (name what you notice, ask for hypothesis, test knowing, reflect wisdom, trust silence), probe-before-you-solve protocol, key probing questions
- **Role 3: Hold Them Accountable** -- expanded from the current 4-bullet accountability section into a full role with explicit behaviors (track commitments, name patterns, call out avoidance, reference past performance, hold the standard), memory usage guidance, and the accountability balance
- **How the Three Roles Work Together** -- example showing all three roles in one exchange
- **When Each Role Takes Priority** -- context-dependent prioritization table
- **Critical Boundaries** -- updated "What You Don't Do" reflecting all three roles

**Also update:**
- Lines 103-107 ("What You Are" list) to reflect all three roles
- Lines 418-468 ("Conversation Style" subsection) to reference all three roles equally instead of just organizing
- Lines 488-496 ("Accountability" section) -- removed since it's now covered in Role 3
- Lines 595-644 ("Example Exchanges" and "When You've Done Your Job Well") -- add 2 new examples for probing and accountability
- Lines 648-657 ("Final Principles") -- add principles for probing and accountability

### Prompt size impact
Net addition of approximately 200 lines. The thought organizer content is condensed (not duplicated). Well within model context limits.

---

## Part 2: Database Additions

### New Table: `coach_probing_effectiveness`

Tracks which probing questions lead to user insight vs which fall flat.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | Auto-generated |
| user_id | text (NOT NULL) | Matches existing pattern (profiles.id is TEXT) |
| session_id | uuid (NOT NULL) | FK to dialogue_sessions |
| probe_question | text | The question the coach asked |
| probe_type | text | surface_question, test_knowing, reflect_wisdom, reframe_constraint, name_pattern |
| user_response | text | What the user said next |
| led_to_insight | boolean | Did this probe lead to clarity? |
| insight_markers | text[] | Detected marker phrases |
| effectiveness_score | integer | 1-10 |
| why_effective | text | Analysis of what worked |
| user_state_at_time | text | depleted/managing/strong/peak |
| topic_area | text | What they were discussing |
| pattern_area | text | recalibration/clarity/renewal |
| created_at | timestamptz | Default now() |

RLS: Service-role-only (matching existing coach tables pattern).

### New Table: `coach_breakthrough_moments`

Captures moments of genuine user insight.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | Auto-generated |
| user_id | text (NOT NULL) | Matches existing pattern |
| session_id | uuid (NOT NULL) | FK to dialogue_sessions |
| breakthrough_content | text | What the user realized |
| breakthrough_type | text | pattern_recognition, decision_clarity, reframe, self_awareness |
| preceded_by_probe | boolean | Was this sparked by a coach question? |
| probe_question | text | The question that sparked it |
| was_acted_on | boolean | Did they follow through? |
| action_taken | text | What they did with it |
| checked_at | timestamptz | When coach checked back |
| impact_score | integer | 1-10 |
| pattern_area | text | recalibration/clarity/renewal |
| meta_skill | text | Which meta-skill was activated |
| created_at | timestamptz | Default now() |

RLS: Service-role-only.

### Important schema note

The user's original proposal used `uuid` for `user_id` with foreign keys to `profiles(id)`. However, `profiles.id` is TEXT in this project (Auth0 sub strings, not UUIDs). All existing tables use `text` for `user_id` with no FK to profiles. The new tables will follow this established pattern -- `user_id text NOT NULL`, no FK to profiles, FK only to `dialogue_sessions(id)`.

The original proposal also included FK to `dialogue_messages(id)` with a `message_id` column. This will be included as optional (nullable) since not every probing record will map to a single message.

---

## Part 3: New Edge Function

### `analyze-probing-effectiveness`

Post-session analysis that:
1. Takes a completed session's messages
2. Uses Lovable AI (Gemini 2.5 Flash) to identify coach probing questions and evaluate user responses
3. Detects breakthrough markers in user messages
4. Stores results in `coach_probing_effectiveness` and `coach_breakthrough_moments`

Called after session ends (same pattern as existing post-session pipeline).

### Updated: `self-mastery-coach`

Add retrieval of past breakthroughs and effective probes to the `buildSystemPrompt()` context injection:
- Query `coach_probing_effectiveness` for probe types that worked (avg score >= 7)
- Query `coach_breakthrough_moments` for recent breakthroughs (especially un-acted-on ones)
- Inject both into the system prompt as additional context sections

---

## What Stays the Same

- Edge function handler, streaming, tiny win extraction, error handling
- Flow-specific prompts (prepare/integrate/guided-reflection)
- Pattern-area conditional prompts (recalibration/clarity/renewal)
- CoachContext interface structure (extended, not replaced)
- All frontend code
- Model: google/gemini-3-flash-preview

## Implementation Order

1. Database migration (create 2 new tables with RLS)
2. LLM prompt restructure in `self-mastery-coach/index.ts`
3. Create `analyze-probing-effectiveness` edge function
4. Update `buildSystemPrompt()` to retrieve and inject probing/breakthrough data
5. Deploy both edge functions
