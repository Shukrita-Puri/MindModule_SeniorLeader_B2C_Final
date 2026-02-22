

# Self-Mastery Coach -- Thought Organizer + Master Map Upgrade

## Overview

Add three major content blocks to the `BASE_SYSTEM_PROMPT` in `supabase/functions/self-mastery-coach/index.ts`. No frontend changes, no DB changes, no structural changes to the edge function.

## What Changes

### 1. Add "YOUR PRIMARY ROLE: THOUGHT ORGANIZER" Section

Insert immediately after the IDENTITY and ROLE section (after line 22) and before CORE OPERATING PRINCIPLE (line 26). This is a large new section covering:

- What "organizing thoughts" means (extract signal from noise, separate layers, surface the real question, create cognitive space, guide them to their own answer)
- What the coach is NOT (strategy consultant, therapist, productivity coach, cheerleader)
- What the coach IS (mirror, pattern-namer, question-asker, thought organizer)
- When to shift from organizing to regulating state (signs of physiological dysregulation)
- Practical examples of thought organization (6 examples: competing priorities, hidden assumptions, naming patterns, feeling vs fact, decision clarity, surface questions)

### 2. Add Complete Master Map to Meta-Skills Section

Expand the existing meta-skills section (lines 139-157) with the full Calibrate Studio mapping and master area map:

- Calibrate Studio mapping: which entry state each practice type creates and which pattern/meta-skills it activates
- Complete area-to-pattern-to-meta-skills map (13 areas across 3 patterns)
- Detailed rationale for each pattern cluster:
  - RECALIBRATION: 5 areas (politics, transitions, inner critic, energy, managing success)
  - CLARITY: 5 areas (decisions, purpose, values, relationships/EQ, communication)
  - RENEWAL: 4 areas (identity/performance, ego work, legacy, managing success as bridge)
- Note that Managing Success spans both Recalibration and Renewal
- Natural sequence insight: Recalibrate first, then Clarity, then Renewal

### 3. Update Conversation Style Section

Expand lines 246-268 to add:

- "Your Job Is Not to Solve -- It's to Organize" subsection with 5 questioning pattern categories:
  1. Surface the real question
  2. Separate layers
  3. Name patterns
  4. Reframe constraints
  5. Reflect their knowing back
- Rules for when direct advice IS appropriate (dysregulated state, explicit request with probe-first, urgent pre-event)

### 4. Update "What You DON'T Do" Section

Replace lines 261-268 with expanded version:

- Explicit list of what the coach is NOT (strategy consultant, therapist, productivity coach, problem-solver, cheerleader)
- Probe-first protocol when asked for advice directly
- Framing perspectives as questions, not statements

### 5. Add Example Exchanges

Insert before "FINAL PRINCIPLES" (before line 392) as training data:

- 6 example exchanges showing organizing vs solving:
  1. Competing priorities
  2. Decision paralysis
  3. Recurring crisis
  4. Overwhelm
  5. Self-doubt
  6. Surface question
- Each with a wrong (solving) and right (organizing) response
- Closing principle: "probe before you solve, organize before you advise"

### 6. Add "When You've Done Your Job Well" Signals

Include the success indicators:
- User says "Oh. I actually already knew that."
- They pause and shift direction mid-sentence
- They name their own pattern
- They move from "I don't know" to "Here's what I need to figure out"
- They leave with the right questions, not answers

## What Stays the Same

- Edge function handler, streaming, tiny win extraction, error handling
- Flow-specific prompts (prepare/integrate/guided-reflection)
- Pattern-area conditional prompts
- CoachContext interface and buildSystemPrompt()
- All frontend code
- Model: google/gemini-3-flash-preview

## Technical Details

### File Modified

- `supabase/functions/self-mastery-coach/index.ts` -- `BASE_SYSTEM_PROMPT` content only (lines 13-403)

### Key Phrases Added to Prompt

These signature phrases will appear naturally in coach responses:

- "What's the question beneath the question?"
- "Let's separate the layers here..."
- "That's the tactical question. What's the strategic one?"
- "You said 'I don't know' but I suspect you do."
- "What would have to be true for that to work?"
- "What are you optimizing for -- the right answer, or certainty?"

### Prompt Size

The BASE_SYSTEM_PROMPT will grow by approximately 400-500 lines. This is within acceptable limits for the Gemini 3 Flash context window.

