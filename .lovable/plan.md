

## Plan: v6 Refined — Elastic Lexicon, Soft Phrase Ceiling, Evidence-First Anti-Fallback

Two-stage delivery, surgical scope. Doc only first → code only after approval.

---

### Stage 1 — `Decision_Readiness_Brief_LLM_Prompt_v2.docx`

**§2.18 Phrase Ceiling — softened to Priority Weight**
- 2–3 word target; 4 words allowed if the 4th is load-bearing
- Soft-reject at 4 words (retry once with stricter instruction)
- Hard-reject at 6+ words (fall through)
- Forbidden: "you", "your", "the" at sentence start; coaching imperatives
- Examples reframed as templates, not copy bank

**§2.19 The 3-Part Impact Mandate (replaces "occasional outcome framing")**
Every body copy synthesizes 3 elements in 2–3 scannable sentences:
1. **Signal Evidence** — cite a number ("HRV 110ms", "Sleep 6h12m") OR a named event ("the 2 PM Board")
2. **Pillar Categorization** — explicitly link to Cognition / Physiology / Resilience, triangulated with co-relating calendar events
3. **The Stake** — link to a Leadership Variable from the Elastic Lexicon

Triangulation contract preserved: internal (wearable + self-declared) × outer (calendar load/pressure/high-stakes) — unchanged from v5.

**§2.20 Elastic Lexicon — Thematic Clusters (replaces rigid lexicon)**

| Pillar | Core Theme | Strategic Synonyms (cluster) |
|---|---|---|
| Cognition | Intelligence | Decision Power, Strategic Accuracy, Mental Bandwidth, Processing Capacity, Solving Logic |
| Physiology | Energy | Operational Drive, Leadership Stamina, Hardware Recovery, System Output, Physical Runway |
| Resilience | Stability | Strategic Composure, Executive Presence, Diplomatic Shield, Reactive Risk, Internal Buffer |

Validation: body must contain ≥1 concept from one cluster — not verbatim, but strategic-synonym match. Regex/keyword set per cluster maintained server-side.

**§2.21 Generative, not verbatim** — examples are architectural templates; LLM synthesizes from data, not from the example pool.

**§2.22 Anti-Fallback Success Protocol (Data-First Mandate)**
> "Your priority is Evidence-Based Insight. If user data is thin (e.g., no calendar, no wearable), pivot to **Baseline Intelligence** — do not default to generic advice."

- Weak-data path: `"Physiology stable. Maintaining the base for future load."` ← still valid output
- Strong-data path: `"HRV down 18%. Resilience compressed. Risk of Decision Leakage in the Town Hall."`

**Safety Valve:** if no calendar events, "Stake" orients to **Base-Level Readiness** (e.g., "Stabilizing the base for future load") — never rejected for missing calendar.

**§2.11–2.17 — 7 CEO Reality Logic Engines (unchanged from prior plan)**
Veto Risk, Second Wind, Circadian Priority, Decision Leakage Guard, Post-Peak Hangover, Personal Friction Inference, Board-Level Outcome — all retained as logic engines, not copy banks.

**§3.12 Global & Environmental Load** — timezone-derived fields only (rest null until instrumented)

**§3.13 Strategic Context** — `postPeakWindow`, `isHighVisibilityToday` (derivable today)

**§Signal Coverage Matrix — UPDATED**
- **Heart Rate** added (now available via wearable HR column / HR-elevated proxy)
- **Mental Energy** = `/daily-check-in` outcome (renamed from "mental sharpness" at this surface)
- **Mental Sharpness** = `/check-in-detail` slider 1 (relocated)
- Clarity, Confidence sliders unchanged from v5
- HRV, RHR, Sleep unchanged

**Voice (refined persona)**
- CoS who knows the leader by data, not prose
- Sees the adrenaline mask and names it
- Authentic, not harsh, never sycophantic
- DO: "The data indicates…", "Observation:…", "Pattern: three consecutive…", "Signal: HRV down 18%…"
- DON'T: "You should…", "You need to…", "Try to…", "Consider…", wellness/clinical jargon
- Tagline: *"You do not report data. You provide Decision Intelligence."*

**Untouched in doc:** Reasoning protocol, output JSON contract, fallback architecture (Lovable AI → Claude → deterministic), pattern-building section, time context rules, Sun/Fri/holiday rules, day 1–30 progression tiers.

**Appendix:** v5 → v6 diff (one page).

Generated via `docx` skill, validated, page-checked as images.

---

### Stage 2 — Code (post-doc approval)

**File:** `supabase/functions/compute-outer-readiness/index.ts`
**Touch:** LLM system + user prompt strings + phrase/body validator. Nothing else.

**Adds:**
- 7 CEO Reality logic engines
- Strategic Register voice block + tagline
- Phrase Priority Weight (soft-reject at 4 words, hard-reject at 6+)
- 3-Part Impact Mandate instruction
- Elastic Lexicon clusters inline
- Data-First / Baseline Intelligence anti-fallback instruction
- Heart Rate field surfaced in `=== KEY SIGNALS ===` block
- Mental Energy / Mental Sharpness source labels updated
- `=== GLOBAL & ENVIRONMENTAL LOAD ===` (timezone-derived)
- `=== STRATEGIC CONTEXT ===` (`postPeakWindow`, `isHighVisibilityToday`)

**Validator changes:**
- Phrase: soft-reject 4 words → retry with stricter prompt; hard-reject 6+ → deterministic fallback
- Body: must contain ≥1 cluster-synonym (regex set across all 3 pillars) AND ≥1 number-or-named-event reference
- Calendar-empty path: "Base-Level Readiness" lexicon variants whitelisted (no event reference required)

**Untouched:** scoring, signal pills, calendar load/pressure math, deterministic `getTheme()`, hook, client component, output JSON shape, all other edge functions.

---

### Confirmation gate
Approve → I generate Stage 1 doc and deliver as artifact. After your sign-off on the doc, Stage 2 is the surgical prompt edit.

