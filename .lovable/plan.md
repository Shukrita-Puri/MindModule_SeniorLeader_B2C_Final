

## Plan: Update Coach LLM Prompt — Tiny Wins Integration, Safety Guardrails, Flow Prompts, Pattern Prompts

### Current State vs Spec — Gaps Found

| Section | Current Location | Gap |
|---------|-----------------|-----|
| Tiny Wins (base prompt) | Lines 853-863 | Missing acknowledgment examples and "Do NOT use generic 'good job' language" in BASE prompt (only in integrate flow) |
| Safety Guardrails | Lines 875-905 | Missing "Avoid American-centric references" and "Language-neutral coaching — don't assume heteronormative relationships" |
| Response Format | Lines 924-932 | Missing explicit statement about input quality being part of response format |
| Prepare Flow | Lines 1022-1042 | Missing `eventType`, timing breakdowns (30s, 1min, 1-2min, 1min), and example opening |
| Integrate Flow | Lines 1044-1076 | Mostly complete — minor wording alignment |
| Guided Reflection | Lines 1078-1093 | Missing example opening with context-fit explanation |
| Recalibration Pattern | Lines 1099-1117 | Missing full common challenges list (managing success, energy sustainability detail) and meta-skills breakdown |
| Clarity Pattern | Lines 1119-1139 | Missing full common challenges (relationships & EQ, communication as self-expression detail) |
| Renewal Pattern | Lines 1141-1161 | Missing full common challenges (identity & ego, legacy detail) |

### Architecture Decision

All of these remain in the **same edge function** (`self-mastery-coach/index.ts`). They are conditional sections of one assembled prompt — not separate services. Flow prompts and pattern prompts are appended by `buildSystemPrompt()` based on `flowType` and `detectDominantPattern()`.

### Changes (all in `supabase/functions/self-mastery-coach/index.ts`)

#### 1. Update Tiny Wins section in BASE_SYSTEM_PROMPT (lines 853-863)

Add after "Just acknowledge it meaningfully.":
```
**Tiny Win acknowledgment examples:**
- "That took real composure — most leaders would have escalated there."
- "You showed up even when you didn't feel ready. That's resilience."
- "Naming that publicly took courage. That's presence."

**Do NOT use generic "good job" language** — be specific to what the win reveals about how they led themselves.
```

#### 2. Update Safety Guardrails in BASE_SYSTEM_PROMPT (lines 884-889)

Add two missing lines to Bias & Cultural Sensitivity:
- `- Avoid American-centric references unless contextually relevant`
- `- Language-neutral coaching — don't assume heteronormative relationships, traditional family structures, or Western-only frameworks`

#### 3. Update PREPARE_FLOW_PROMPT (lines 1022-1042)

Expand with:
- Timing breakdowns per step (30s somatic check-in, 1min outcome clarity, 1-2min rehearsal, 1min anchor)
- Example opening: `"{{eventTitle}} in {{minutesUntil}} minutes. Let's get you ready. First — take a breath. What do you notice right now?"`

#### 4. Update GUIDED_REFLECTION_PROMPT (lines 1078-1093)

Add example opening:
```
"We're doing {{practiceTitle}}. {{brief context on why this practice fits their current state}}. Let's start with step one: {{firstStepInstruction}}. Take a moment and try it now."
```

#### 5. Expand RECALIBRATION_PATTERN_PROMPT (lines 1099-1117)

Replace abbreviated version with full spec including:
- Full meta-skills detail (Self-Regulation, Resilience, Confidence with descriptions)
- Full common challenges list (navigating politics, managing transitions, inner critic & self-sabotage, energy & sustainability, managing success)
- Key question: "What do you notice in your body right now?"

#### 6. Expand CLARITY_PATTERN_PROMPT (lines 1119-1139)

Replace with full spec including:
- Full meta-skills (Thinking Clarity, Emotional Intelligence with descriptions)
- Full challenges (decision-making under uncertainty, finding purpose, values clarity, relationships & EQ at the top, communication as self-expression)
- Key question: "What's the question beneath the question?"

#### 7. Expand RENEWAL_PATTERN_PROMPT (lines 1141-1161)

Replace with full spec including:
- Full meta-skills (Adaptive Capacity, Influence, Presence with descriptions)
- Full challenges (identity & sustainable performance, identity & ego work, legacy & long-term thinking, managing success)
- Key question: "Who do you need to become for what's next?"

### No New Edge Functions Needed

The flow-specific prompts (prepare/integrate/guided-reflection) and pattern-area prompts (recalibration/clarity/renewal) are all conditional sections of the same streaming prompt. They do **not** need separate edge functions — they are assembled by `buildSystemPrompt()` and sent as one system message to the AI model.

### Files Changed

| File | Change |
|------|--------|
| `supabase/functions/self-mastery-coach/index.ts` | Update 7 prompt sections within the existing file |

