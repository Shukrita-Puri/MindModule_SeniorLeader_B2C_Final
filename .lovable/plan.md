

# Plan: Coach LLM Prompt Expansion + Mobile First-Fold Fix

## Overview

Two workstreams: (1) major prompt expansion in the edge function with content from both uploaded documents + the recommended additions, and (2) a CSS-only mobile fix to keep the coach page within the first fold.

---

## Part 1: Mobile First-Fold Fix (UI only)

**Problem**: On mobile, the empty-state coach page pushes the input below the fold due to large spacing, 24px avatar, and generous padding.

**File**: `src/components/coach/CoachSplitView.tsx`

**Changes**:
- Reduce empty-state vertical spacing: `space-y-5` → `space-y-3`
- Reduce title size on mobile: `text-3xl` → `text-2xl md:text-3xl`
- Reduce avatar size on mobile: `w-24 h-24` → `w-16 h-16 md:w-24 md:h-24`
- Reduce prompt suggestion padding: `py-2.5` → `py-2`
- Add `overflow-hidden` to the outer container to prevent scroll leak
- In SelfMasteryCoach.tsx: the Queue Progress and Performance Plan Indicator sections already have `messages.length === 0` guards, so no changes needed there

---

## Part 2: Prompt Expansion (Edge Function only)

**File**: `supabase/functions/self-mastery-coach/index.ts`

All changes are **append-only** to the `BASE_SYSTEM_PROMPT` string and to flow prompts. No structural code changes, no DB changes, no UI changes.

### 2A — Document 1 (IMC_Prompt_Additions.docx) — 9 Sections

Insert the following blocks into `BASE_SYSTEM_PROMPT` at their designated positions:

| # | Section | Insert After |
|---|---------|-------------|
| 1 | **Emotional Tracking Protocol** — 3-dimension tracking (Current State, Direction of Travel, Beneath the Surface), signal detection (language shift, sentence collapse, repetition, sudden topic change, hedging, absence), rules (never name before they do, hold lightly, track across sessions), session-level emotional arc (entry/pivot/exit) | State-Aware Coaching Modes |
| 2 | **Question Frequency & Cadence** — ratio rule table (1 per standard exchange, 0 after breakthrough/venting), question type rotation (STATE/BENEATH/PATTERN/FUTURE/CHALLENGE/SOMATIC), one-question rule, pause/pacing protocol | Conversation Style |
| 3 | **Protocol Recommendation Frequency Cap** — hard limits (1 per independent session, 1 pre-loaded for JIT/ToD, never repeat, never consecutive-session protocols), when to/not to surface, JIT special rule | Recalibrate Studio Integration |
| 4 | **Tiny Win Acknowledgment (Independent Sessions)** — 4-stage flow (Catch → Locate → Anchor → Log & Move), critical rules (no quick congratulations, never skip to next problem, log in memory, challenge self-dismissal) | Role 4 / Accountability |
| 5 | **Venting vs. Processing Distinction** — comparison table, redirect protocol (after 2-3 exchanges), transition language, colluding vs. holding space guard | After Emotional Tracking |
| 6 | **Portable Question Tools** — 6 categories (Self-Interrupt, Pre-Event Prime, Post-Event Reset, State Check-In, Assumption Probe, Pattern Interrupt), marker format `[QUESTION_TOOL]`, frequency cap (max 1/session, never alongside protocol), offering framing | After Wisdom & Framework Library |
| 7 | **Independent Session Flow Prompt** — 4-phase structure (Land → Deepen → Shift → Anchor), entry rules, state detection (Clarity/Recalibration/Renewal/Accountability), session close protocol, drift guard at 15+ exchanges | Added as `INDEPENDENT_FLOW_PROMPT` constant (new Layer 2 flow) |
| 8a | **Somatic Language Calibration** — incremental introduction, performance language first, don't push if resisted, build credibility over 4-6 sessions | Before Final Principles |
| 8b | **Power of the Short Response** — sub-25 words after breakthrough, resist filling space | Before Final Principles |
| 8c | **Multi-Week Progress Narration** — growth narration format, graduation naming, use at natural pivot points | Before Final Principles |
| 8d | **Anti-Patterns Register (Consolidated)** — 12 "never" rules in scannable list | Before Final Principles |

### 2B — Document 2 (IMC_PromptArch_Vol2.docx) — 2 Parts

| Part | Content | Insert Location |
|------|---------|-----------------|
| **A** | **Scenario-Specific Question Tools** — Full libraries for all 3 families: Recalibration (R1-R4: Acute Stress, Reactive Pattern, Sustained Pressure, Confidence Collapse), Clarity (C1-C5: Strategic Fog, Priority Overload, Team/Relationship, Values Conflict, Narrative Confusion), Renewal (N1-N4: Depletion, Meaning Erosion, Identity Transition, Influence Erosion) + 5 deployment rules | After Portable Question Tools section |
| **B** | **Performance Psychology Integration** — 8 domains: (1) Arousal Regulation & Activation Management, (2) Flow State & Peak Performance, (3) Mental Rehearsal & Cognitive Simulation, (4) Motivation Architecture & Self-Determination, (5) Cognitive Performance & Decision Quality, (6) Resilience Architecture & Stress Inoculation, (7) Identity & Self-Concept, (8) Attention Control & Present-Moment Performance + integration rules (never name model, state first, diagnosis before intervention, longitudinal application) | After Scenario Question Tools |

### 2C — Recommended High-Impact Additions (from prior conversation)

These are appended into `BASE_SYSTEM_PROMPT` at appropriate locations. Several overlap with document content (noted):

| Addition | Covered By Doc? | Implementation |
|----------|-----------------|----------------|
| **Session Closure / Exit Protocol** | Partially by Section 7 (Independent) | Add universal closure rules to BASE_SYSTEM_PROMPT after Response Length section: "If the user signals they're done or the conversation has reached natural resolution, close with a 1-sentence summary of what emerged and any commitment made. Never drag a session past its natural endpoint." |
| **Silence / Pacing** | Yes — Section 2 + 8b | Already covered by doc content above |
| **Crisis Boundary** | Partially by existing Safety Guardrails | Strengthen existing guardrail: add explicit suicidal ideation/self-harm boundary: "If the user expresses suicidal ideation, self-harm, or acute mental health crisis, acknowledge with warmth, hold space briefly, and gently suggest professional support. Do NOT attempt to coach through clinical territory." |
| **Multi-Session Arc Awareness** | Yes — Section 8c | Already covered |
| **Cultural / Power Sensitivity** | Not in docs | Add after Bias & Cultural Sensitivity: "These are people used to being the smartest person in the room. Your credibility comes from precision and pattern recognition, not from expertise or authority. Respect cultural differences in emotional expression. Some leaders won't name feelings — work with what they give you." |
| **Anti-Patterns** | Yes — Section 8d | Already covered |
| **Commitment Design Quality** | Not in docs | Add after Role 6: "Good commitments are: specific, time-bound, observable, and small enough to succeed. 'I'll try to be more present' is vague. 'Before my next 3 meetings, I'll do 60 seconds of box breathing' is actionable. Never let them commit to more than one thing per session." |
| **Re-engagement After Absence** | Not in docs | Add after Multi-Week Progress Narration: "If the last session was >14 days ago, acknowledge the gap without judgment. Don't assume they fell off — they may have been applying what they learned. Ask: 'It's been a while. What's been happening?'" |

### 2D — New INDEPENDENT_FLOW_PROMPT Integration

Add a new constant `INDEPENDENT_FLOW_PROMPT` (matching PREPARE/INTEGRATE/GUIDED_REFLECTION patterns) and wire it into the prompt builder so it's injected when `flowType` is null (independent session).

---

## Implementation Approach

- All prompt content is appended to the existing `BASE_SYSTEM_PROMPT` template literal string and new constants
- No database migrations needed
- No changes to the CoachContext interface or server context builder
- Edge function will be deployed after changes
- The prompt will grow significantly (~8-10K characters added) but remains well within LLM context limits

## Files Changed

| File | Type of Change |
|------|---------------|
| `supabase/functions/self-mastery-coach/index.ts` | Prompt text expansion (BASE_SYSTEM_PROMPT, new INDEPENDENT_FLOW_PROMPT, prompt builder wiring) |
| `src/components/coach/CoachSplitView.tsx` | Mobile responsive sizing adjustments (CSS only) |

## Risks

- Prompt size increase is substantial but all content is instructional (no data bloat)
- No code logic changes in the edge function beyond prompt text and one new constant + conditional injection
- UI changes are CSS-only, no behavioral changes

