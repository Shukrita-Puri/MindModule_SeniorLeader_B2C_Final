

# Plan: Rewrite Coach Layer 1 — Former Operator Persona

**Single file**: `supabase/functions/self-mastery-coach/index.ts` — lines 15–1644 (BASE_SYSTEM_PROMPT only)

---

## What This Does

Replaces the current identity shell (Six Coaching Roles, "mirror/witness/guide" labels, Inner Mastery Framework table, Performance Psychology 8-domain list) with the user's new persona: **a former CEO and senior operator who coaches the interior dimension of high-stakes leadership**. The product name stays "Mind Performance Coach". All operational mechanics (Layers 2–7) remain untouched.

---

## What Gets CUT from Layer 1

| Current Section | Lines | Reason |
|---|---|---|
| "Six Coaching Roles" (Role 1–6 named list, priority table, how they work together) | 36–463 | Absorbed into new identity, tone, and examples |
| "What it IS / IS NOT" lists | 447–463 | Replaced by ROLE BOUNDARIES |
| Inner Mastery Framework labelled table | 487–517 | R/C/N logic stays in Layers 2–3, table removed from Layer 1 |
| Three Levels of Intervention section | 479–484 | Absorbed into STATE → STORY → STRATEGY |
| Performance Psychology 8-domain list | 837–959 | Coach operates from these implicitly — doesn't need to name them |
| "Your Six Roles in Conversation" recap | 1324–1357 | Redundant with new persona voice |
| "Example Exchanges — Six Roles in Action" | 1499–1534 | Replaced by new scenario examples |
| "Final Principles" sparring partner framing | 1628–1641 | Replaced by new tone section |

## What Gets KEPT (unchanged)

| Section | Lines | Status |
|---|---|---|
| Reset Studio Integration (protocol IDs, rules, limits) | 520–600 | Keep exactly |
| Wisdom & Framework Library | 603–636 | Keep exactly |
| Portable Questions | 639–650 | Keep exactly |
| Scenario-Specific Question Tools (R1–N4) | 653–834 | Keep exactly |
| Lean On / Watch For insights | 1083–1123 | Keep exactly |
| State-Aware Coaching Modes table | 1126–1138 | Keep exactly |
| Emotional Tracking | 1141–1181 | Keep exactly |
| Venting vs Processing | 1184–1213 | Keep exactly |
| HRV Integration | 1216–1269 | Keep exactly |
| Conversation Style (tone, cadence, question rules) | 1272–1314 | Keep exactly |
| Tiny Wins Integration | 1370–1387 | Keep exactly |
| Safety Guardrails & Boundaries | 1399–1471 | Keep exactly |
| Response Format & Markers | 1474–1497 | Keep exactly |
| Session Closure / Exit Protocol | 1537–1544 | Keep exactly |
| Crisis Boundary | 1548–1554 | Keep exactly |
| Cultural & Power Sensitivity | 1558–1563 | Keep exactly |
| Somatic Language Calibration | 1566–1571 | Keep exactly |
| Power of Short Response | 1575–1581 | Keep exactly |
| Narrating Growth | 1585–1596 | Keep exactly |
| Re-engagement After Absence | 1599–1606 | Keep exactly |
| Anti-Patterns Register | 1609–1624 | Keep (update "sparring partner" to "coach" in line 1630) |
| All flow-specific prompts (PREPARE, INDEPENDENT, INTEGRATE, GUIDED_REFLECTION) | 1650–1779 | Keep exactly (Layers 2+) |
| Pattern-area conditional prompts | 1785+ | Keep exactly (Layers 2+) |

## What Gets ADDED (new Layer 1 content)

The following sections replace lines 15–517 and 837–959 and 1324–1357 and 1499–1534 and 1628–1641:

### 1. IDENTITY (replaces current identity block)
The user's exact text: "You are a former CEO and senior operator, now a performance coach..." through "This is not wellness. This is performance."

### 2. ROLE BOUNDARIES — WHAT YOU ARE NOT (replaces IS/IS NOT lists)
The user's exact text defining four boundaries: not the Chief of Staff, not the Recalibration tool, not the Analyst, not a rehearsal/roleplay tool, not a therapist.

### 3. THE VAULT
New section about confidentiality. "This may be the one conversation they can have that is not going anywhere." First-session surfacing rule.

### 4. WHAT YOU WORK ON
The user's exact taxonomy: hard conversations, board dynamics, relationships under strain, decision paralysis, self-doubt, identity under pressure, running on empty.

### 5. TONE AND VOICE
The user's exact tone rules: peer who has been in the room, no coaching jargon, no affirmations, 2–4 sentences, one question max, warmth through precision. Specific challenge/pattern/depletion examples.

### 6. STATE → STORY → STRATEGY (retained, using user's version)
Same principle, user's tighter wording.

### 7. CONTEXT AWARENESS — HOW YOU USE WHAT YOU KNOW (replaces current capabilities intro)
User's exact text on using state, calendar, patterns, commitments, profile, plan context. Key rule: "You do not narrate the data back. You use it to ask a sharper question."

### 8. FIRST SESSION
User's exact rules: no onboarding, open with something that shows you've read the room. State/calendar/neither options. The Vault introduction.

### 9. PRESENTING PROBLEM TAXONOMY
User's 13-item mapping from presenting sentence to where the work actually lives (e.g., "I have a conversation I have been avoiding" → Reactive Pattern).

### 10. REGULATION PRACTICES
User's exact rules: one per session, at open if not present or at close as anchor. Protocol markers follow existing rules.

### 11. EXAMPLE EXCHANGES (replaces old "Six Roles in Action")
User's 5 examples: directed by homepage (board), independent visit (avoidance pattern), identity pressure (first C-suite), relationship strain (co-founder), ambitious senior leader.

### 12. WHAT YOU DO NOT DO (replaces old anti-patterns)
User's crisp list: no summarising at length, no strategic/operational advice, no data reports, no multi-question exchanges, no praising awareness, no explaining methodology, no over-warmth, no scripting/rehearsal.

### 13. Updated FINAL PRINCIPLES
Remove "sparring partner" framing. Keep core principles but align with new persona voice.

---

## What stays unchanged (Layers 2–7)

- All flow-specific prompts (PREPARE, INDEPENDENT, INTEGRATE, GUIDED_REFLECTION)
- All pattern-area conditional prompts (Recalibration, Clarity, Renewal)
- All server context building logic
- All dynamic prompt builder functions
- All tiny win extraction logic
- HTTP handler and streaming logic
- Client-side components (CoachConversationCard, CoachSplitView, SelfMasteryCoach page)

## Expected Outcome

- Coach identity shifts from "context-intelligent coaching system" to "former CEO who coaches the interior dimension of leadership"
- Six named roles dissolved into natural persona behavior
- Performance Psychology domains operate implicitly (removed from prompt text, reducing token load)
- Inner Mastery Framework table removed from Layer 1 (R/C/N logic stays in Layers 2–3)
- Presenting Problem Taxonomy gives the LLM a precise mapping from surface statements to real work
- The Vault establishes confidentiality frame on first session
- All operational mechanics (protocols, wisdom, questions, HRV, safety) preserved exactly

