

## Rewrite `docs/PERFORMANCE_READINESS_BRIEF_LOGIC.md` to v6 — full Signal Pills, Phrase, Body, Lean On, Watch For

### Goal

Replace the current doc (still pinned to v4 / 2026-04-13) with a complete v6 reference that matches what's actually shipping in `compute-outer-readiness/index.ts` (4087 lines) and `DecisionReadinessBrief.tsx` (3-pillar executive pills). The doc currently describes a 6-chip system with Heart / Sleep / Mind-Sharpness / C×C pills, but the code now ships **3 executive pillars: COGNITIVE / PHYSIOLOGY / RESILIENCE**, plus the v6.1 "Chief of Staff for the Mind" prompt with the Four-Role Contract. The doc must be rewritten so it can be used as the single source of truth in product reviews.

### What the new doc will contain

**Front matter**
- Update version to v6.1, date 2026-04-21
- Change-log entries for: 3-pillar executive pills, Four-Role Contract, pillar-vocabulary map, response-assembly try/catch + telemetry safeguards, snapshot cache + `briefSource` field.

**Section structure (kept where still accurate, rewritten where stale)**

1. Purpose & Architecture — keep, refresh diagram to show snapshot cache + telemetry fields.
2. Upstream Data Sources — keep tables, add `mental_sharpness_level` + `consecutiveLowClarity` + `mostEffectivePractice`.
3. Connected DB Tables — keep, add `brief_snapshots` (input_signature, payload_json, llmAttempts, llmFallbackReason, validatorRejections).
4. Inner Readiness Scoring — keep current 4.1–4.5.
5. Outer Readiness / Compass — keep calendar metrics + wearable context, refresh 4-tier calibration.
6. **NEW: LLM Synthesis — Chief of Staff for the Mind (v6.1)** — full system prompt walkthrough:
   - Persona, tagline, reasoning protocol (4 silent steps)
   - **§2.18.5 The Four-Role Contract** with the table:
     - PHRASE → Immediate · ORIENT (2–4 words)
     - BODY → Immediate + Tactical · ADVISE (3-part triangulation)
     - LEAN ON → Tactical + Strategic · RESOURCE (2–4 words + source)
     - WATCH FOR → Tactical + Strategic · RISK (2–4 words + source)
   - §2.19 3-Part Impact Mandate (Signal Evidence + Pillar + Stake)
   - §2.19.2 Pillar-Vocabulary Map (HRV-only → Cognitive; Sleep/RHR → Physiology; HRV+Mental Energy → Resilience)
   - §2.19.5 Body Copy Assessment Contract (RULE 1–5 + worked example)
   - §2.20 Elastic Lexicon (Cognition / Physiology / Resilience clusters)
   - §2.11–2.17 CEO Reality Engines (Veto Risk, Decision Leakage, Post-Peak, etc.)
   - Hard constraints (wellness blacklist, score-tier blacklist, day naming, JIT override)
   - Day-type overrides (Sunday eve, Monday AM, Friday/pre-rest, holiday, post-high-stakes PM, consecutive-low-3+)
   - Signal Synthesis patterns A–I
   - 5 few-shot examples
7. Signal Triage Rules (top 5) — keep, refresh.
8. Temporal Triangulation (Immediate / Tactical / Strategic) — keep, fix table.
9. **REWRITE: Section 7 — Signal Pills v6 (3 Executive Pillars)** — this is the critical rewrite the user asked for. Will include for each pill:
   - **Inputs** (raw fields from `outerBrief`)
   - **Per-input contribution function** with exact thresholds (e.g. `hrvCognitiveContrib`: dev ≤ -20% strong-red, < -15% mild-red, < -8% amber, else green)
   - **Composition rule** (`composePillar`: any strong-red forces RED, otherwise median-of-tiers, ties break upward to worse)
   - **Wearable Authority overrides** (Cognitive only): MASKED_HIGH caps green→amber, RECOVERY_UNDERWAY caps red→amber
   - **Signal-word vocabulary** per state (e.g. Cognitive green = STEADY/CALM, amber = HIGH LOAD/MASKED LOAD/RECOVERING, red = STRAINED)
   - **Display lines** shown on pill (top = wearable, bottom = self-report) with which qualifiers fire when
   - Three subsections — one each for COGNITIVE, PHYSIOLOGY, RESILIENCE — each ending with a worked example using real numbers (e.g. HRV 18ms, Confidence 4/5, drained → Resilience = STRAINED amber)
   - Outcome routing table: which `daily_checkins.outcome` values feed which pillar (cognitive: scattered/focused/thriving; resilience: overwhelmed/drained/steady/anxious/frustrated/calm/energised; physiology: none — body-only)
   - Why Sharpness qualifier currently reads "score trending down" (uses `scoreTrajectory7d`, not sharpness-specific) — flagged as known issue
   - Why Physiology can read RESTED with sleep null (only RHR contributes) — flagged as known issue
10. **REWRITE: Section 8 — Lean On / Watch For v6**:
    - Priority cascade P-1 → P5 (sustained deficit override → Sunday eve → late eve → coach recent → coach grace → C×C modifier → partial coach + archetype → archetype × tier → tier fallback)
    - C×C 8-pattern matrix (kept)
    - Archetype × tier matrix (5 archetypes × 4 tiers, kept)
    - **Source tag rules**: only ARCHETYPE / COACH / PATTERN allowed in LLM output; deterministic fallback adds Readiness / Check-in / Sunday / Evening
    - Forbidden generic traits list (Self-Honesty, Self-Awareness, Discernment, Alignment, Conviction Strength, Execution Confidence, Clear Direction) — explains why "Full Alignment" appears as fallback
    - Coach insight age tiers (recent / grace / contextual / historical / archived) + C×C contradiction suppression
11. **REWRITE: Section 9 — Phrase Logic v6**:
    - Source priority: LLM (Gemini Flash 10s → Sonnet 6s) → deterministic `getTheme()`
    - Hard rules: 2–4 words, no numbers, no "you/your/the" openers, no patterns/coach refs in phrase
    - Pillar Opacity Rule (§2.19.2): phrase + first body sentence must contain ≥1 pillar word
    - Template matrix (4 tiers × 3 times × 8 calendar combos), Sunday/Monday/Friday/holiday overrides
12. **REWRITE: Section 10 — Body Copy Logic v6**:
    - 3-Part Impact Mandate: Signal Evidence + Pillar Categorization + The Stake
    - 5 assessment rules (no score restate, pills own numbers, triangulate 3 layers, pick numbers that matter, directional tone)
    - Worked example (bad → good)
    - Why current outputs sound prose-y: deterministic fallback templates kick in when LLM fails any of 25+ validators; lists which ones fire most
13. **NEW: Section 11 — LLM Resilience & Snapshot Cache**:
    - Two-tier model strategy (Gemini 2.5 Flash → Claude Sonnet)
    - Snapshot cache (`brief_snapshots`): input_signature dedupes identical contexts; `briefSource: 'llm' | 'deterministic'`
    - Telemetry fields: `llmAttempts[]`, `llmFallbackReason`, `validatorRejections{}`
    - Response-assembly try/catch (soft 200 fallback)
14. Source labels (refreshed).
15. DB column audit (kept).
16. Known issues & gaps — refresh:
    - Sharpness pill qualifier uses `scoreTrajectory7d`, not sharpness-specific trend
    - Physiology defaults to RESTED when only RHR is available (sleep absent)
    - Resilience can render green/STEADY when outcome is `drained` if HRV+confidence are green (median tilts green) — `drained` is currently `mild` severity; user request to promote to `strong` not yet shipped
    - LLM fallback frequency: validators silently winning → generic deterministic copy
    - "Full Alignment / Rigidity from Conviction" stock pair = C×C high+high modifier when no coach/pattern data ≤7d

### Format

- ~900 lines, identical Markdown style to current doc (tables, code fences, ASCII diagram)
- Pull exact threshold numbers from `DecisionReadinessBrief.tsx` lines 587–690 and prompt strings from `index.ts` lines 3157–3340
- No invented thresholds — every number cited must come from the code
- No code changes in this task — documentation only

### File touched

- `docs/PERFORMANCE_READINESS_BRIEF_LOGIC.md` — full rewrite

### Out of scope

- No changes to `compute-outer-readiness/index.ts`, `DecisionReadinessBrief.tsx`, prompt, or any other code
- No memory file updates (the existing `mem://features/performance-readiness/brief-logic` already covers v5.0 persona; we'll refresh in a separate task if you want)
- The pill-scoring fixes (drained → strong, sharpness trend rename, physiology sleep-missing) discussed earlier remain a separate code task and will be referenced in §16 as "known issues"

