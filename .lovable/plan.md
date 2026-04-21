

## Refinement: The Four-Role Contract for the Performance Readiness Card

This is a **prompt-only** refinement. No UI, no scoring, no signals, no data inputs change. We sharpen the role definition of the four LLM-generated text elements so they stop overlapping.

### What's wrong today (in the current prompt)

| Element | Current rule location | Current drift |
|---|---|---|
| Phrase | §2.18 (length only) | Often doubles as a mini-explanation; no ban on explaining/numbers |
| Body | §2.19 / §2.19.5 | Good — already triangulates, no score, no data list |
| Lean On | §3009 (long-term memory rule) | Falls back to generic ("Self-Honesty · CHECK-IN"); no rule that it must add something the body didn't say |
| Watch For | §3009 | Same — drifts into restating today's red signal that body already named |

### What changes (one file, prompt-only)

**`supabase/functions/compute-outer-readiness/index.ts`** — two edits inside the system prompt block:

#### 1. Replace §3009 with §2.18.5 — THE FOUR-ROLE CONTRACT

This becomes the master rule the LLM reads before every output. It defines four jobs, four data layers, four time horizons.

```
§2.18.5 THE FOUR-ROLE CONTRACT (read before every output)

The card has four text elements. Each has a distinct JOB, DATA LAYER, TIME HORIZON.
They must NEVER repeat each other. If two elements say the same thing in different words, REWRITE.

  PHRASE     → Immediate · ORIENT      → "What kind of day is this?"
  BODY       → Immediate + Tactical · ADVISE     → "What shape, what move?"
  LEAN ON    → Tactical + Strategic · RESOURCE   → "What history says you can deploy"
  WATCH FOR  → Tactical + Strategic · RISK       → "The recurring trap this state activates"

PHRASE
  Job: Orient in one crisp directive. The frame, the lens.
  Length: 2–4 words. 5 only if word #5 is load-bearing. 6+ = reject.
  Allowed: a posture, a pillar word, a directive verb.
  FORBIDDEN: explanation, numbers, "you/your/the" openers, references to patterns/coach/archetype, instructions ("front-load…", "sequence…").
  ✅ "Pace from the start." / "Let physiology lead." / "Protect the morning window." / "Rest is the work."
  ❌ "HRV is down today." / "Pace yourself before the board meeting at 2pm."

BODY (already governed by §2.19 / §2.19.5 — the contract below tightens the sentence shape)
  Job: Name the tension between today's GREEN pillar and today's RED pillar, then end with ONE directional move.
  Length: ONE sentence, max 25 words. Two sentences allowed only when a JIT event <90min requires the second sentence.
  Required structure: "[Green resource], [red constraint] — [directional move]."
  Allowed inputs: today's green pillar, today's red pillar, calendar load/pressure/named JIT event, time-of-day, tactical reason (HRV×event correlation, score trajectory, back-to-back, tomorrow load on evenings).
  FORBIDDEN: restating phrase, restating score/tier, listing data points, drifting into LEAN ON territory (archetype traits, weekly patterns as the subject), drifting into WATCH FOR territory (recurring traps).
  Numbers are qualifiers inside an assessment sentence — never the subject. Pills own the numbers.

LEAN ON
  Job: Name the strategic RESOURCE — drawn from history, archetype, or development — that makes the body's move possible.
  Length: 2–4 words. Named noun phrase. Source tag after " · ".
  MUST: add information the body did not already say. If body said "use rested physiology", LEAN ON does NOT say "Rested Physiology" — it says WHY that resource matters over time, e.g. "Post-rest decision window · PATTERN".
  Sources allowed: PATTERN (7–30d DOW outcome, HRV×event correlation, post-coach-session lift, score trajectory, consecutive streak), ARCHETYPE (the leader's archetype strength), COACH (insight ≤7 days old).
  FORBIDDEN: today's green pillar restated, today's score, today's calendar event names, today's wearable values, generic trait words ("Self-Honesty", "Self-Awareness", "Self-Discernment", "Discernment", "Alignment") UNLESS a coach insight ≤7d explicitly named that trait.
  No-data fallback: archetype trait specific to this leader (NEVER generic).
  ✅ "Post-rest decision window · PATTERN" / "Recovery Intelligence · ARCHETYPE" / "Pre-board composure track · PATTERN" / "Sunday composure · PATTERN"
  ❌ "Self-Honesty · CHECK-IN" / "Rested Physiology · PHYSIOLOGY" (repeats body)

WATCH FOR
  Job: Name the recurring TRAP that today's state or pattern activates — the failure mode that makes today's risk worse than it appears.
  Length: 2–4 words. Named noun phrase. Source tag after " · ".
  MUST: add information the body did not already say. If body said "mind under strain", WATCH FOR does NOT say "Cognitive Load" — it says the recurring trap, e.g. "Forcing clarity · PATTERN" or "Spending surplus early · PATTERN".
  Sources allowed: PATTERN (recurring failure mode with ≥3 observations, HRV×event failure mode, friction trend, consecutive low streak), ARCHETYPE (the leader's archetype shadow), COACH (growth area ≤7d).
  FORBIDDEN: today's red pillar restated, today's score, today's wearable values, generic trait words.
  ✅ "Forcing clarity · PATTERN" / "Performing Resilience · ARCHETYPE" / "Spending surplus early · PATTERN" / "Over-adapting · ARCHETYPE" / "Back-to-back compounding · PATTERN"
  ❌ "Body Under Load · PHYSIOLOGY" (repeats body) / "Self-Honesty · CHECK-IN" (generic)

NON-REDUNDANCY TEST (run silently before emitting):
  1. Phrase orients without explaining? If it explains, shorten.
  2. Body names BOTH green AND red and ends with a move? If not, rewrite.
  3. LEAN ON adds something body did not say? If it repeats body's green, rewrite.
  4. WATCH FOR names a pattern/trap, not today's red signal? If it repeats body's red, rewrite.
  5. Could any element be removed without losing information? If yes, that element is redundant — rewrite.
```

#### 2. Update §2.18 to remove the soft-ceiling overlap and point to §2.18.5

Replace the current §2.18 phrase block with a one-line pointer: *"§2.18 PHRASE — see §2.18.5 (PHRASE row). 2–4 words; orient only; never explain; never number; never instruct."*

#### 3. Update the 5 few-shot examples (§3117–3130)

Rewrite leanOn/watchFor in all 5 examples to match the new contract — none may restate the body's green/red, none may use generic trait words. Source tags stay {ARCHETYPE, COACH, PATTERN}; **DATA and CHECK-IN are removed** from the allowed set (they were the source labels that produced "Self-Honesty · CHECK-IN" outputs).

Example rewrite (Example 4 — MASKED_HIGH):
- Body already says: *"Operational Drive is borrowed, not earned. Board prep at 11am: protect the 2 hours before."*
- Old leanOn/watchFor: `Recovery Intelligence · ARCHETYPE` / `Forcing Empty Intensity · ARCHETYPE` ✅ already pattern-correct, keep.
- Example 3 (Town Hall) old watchFor: `Late-Session Reactivity · DATA` → rewrite to `Late-session reactivity · PATTERN`.
- Example 1 (Day 1) old: keep — already archetype-only and non-redundant.

### Light validator additions (same file, ~12 lines in `validateV61Output`)

- Reject any leanOn/watchFor `signal` that contains a generic trait word from the blocklist `{Self-Honesty, Self-Awareness, Self-Discernment, Discernment, Alignment, Conviction Strength, Execution Confidence, Clear Direction}` UNLESS source is `COACH`.
- Reject any leanOn/watchFor `source` outside the new allowed set `{ARCHETYPE, COACH, PATTERN}`.
- Reject when leanOn `signal` (lowercased, normalized) appears as a substring of `body` — i.e. it literally repeats the body.
- Same substring check for watchFor.

These are guards. The deterministic fallback (lines 1252–1340) stays as-is for safety, but its source labels in the deterministic-source map already point to ARCHETYPE/PATTERN/COACH after our prior edit; the C×C generic outputs ("Self-Honesty", etc.) will only render when the LLM brief is rejected entirely — preserving the safety net without exposing generic outputs as the first answer.

### What stays untouched

- §2.19, §2.19.1, §2.19.2, §2.19.5 (body copy contract — already aligned with the new BODY row)
- §2.20 Elastic Lexicon, §2.11–2.17 CEO Reality engines, §2.22 Anti-Fallback
- All scoring, all signal pills, all client rendering, atomic brief contract
- Deterministic fallback cascade (priority cascade in §8 doc) — kept as the safety net
- Data inputs to the LLM — unchanged

### Why this fixes the user's feedback

- **Phrase now has its own job**: orient only. No more phrases that double as mini-explanations.
- **Body is unchanged in tone but bounded**: the green-×-red-→-move structure is now explicit, so the body never drifts into archetype/pattern territory that belongs to LEAN ON.
- **Lean On adds value over body**: the non-redundancy test forces it to bring history/archetype/coach intelligence the body did not state. Generic words are blocked.
- **Watch For names the recurring trap**, not today's red signal. The validator + non-redundancy test enforces it.
- **2–4 word ceiling** is hard-coded. No prose, no noise.

### Confirmation

Approve → I edit the system prompt block (§2.18 + new §2.18.5 + 5 few-shot rewrites) and add 4 validator rules in `compute-outer-readiness/index.ts`. One file. No DB, no UI, no client changes.

