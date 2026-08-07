# Two isolated fixes: COACH source leak + Brief phrase typography

## 1. Lean On / Watch For still shows "COACH"

### What was actually implemented last time
The COACH block was disabled only on the **deterministic** path. In `compute-outer-readiness/index.ts` the helper `getLeanOnWatchFor()` sets `COACH_SOURCE_ENABLED = false` and nulls out `coachStrength` / `coachGrowth` / `coachInsightCreatedAt`, so the rule-based resolver can never return a `coach-*` source. Confirmed against the database: zero `brief_snapshots` rows carry a `lean_on_source` or `watch_for_source` starting with `coach`.

### What was missed
The **LLM path** was never touched. The Brief LLM writes Lean On / Watch For as `"signal · SOURCE"` pairs, and COACH is still an allowed source in three places:

- `_shared/brief/copy-vocabulary.ts` — the source vocabulary lists `ARCHETYPE, COACH, PATTERN, GOALS`, the preferred-source order includes COACH, a positive example is `Strategic patience · COACH`, and generic trait labels (including "Clear Direction") are explicitly permitted *when source = COACH*.
- `compute-outer-readiness/index.ts` prompt blocks (~6555, 6556, 6565, 6570, 6652) — same COACH allowance and the same generic-trait carve-out.
- `compute-outer-readiness/index.ts` validator (~8271–8287) — accepts `COACH` as a valid source and lets the generic-trait blocklist pass when the source is COACH.

That is exactly what produced the row behind the screenshot: `lean_on = "Clear Direction · COACH"` with `lean_on_source = 'llm-v4'`, on rows as recent as 7 Aug. The client renders the stored source word, so beta and pre-V8 users keep seeing COACH.

### Changes
- `_shared/brief/copy-vocabulary.ts`: reduce the allowed source set to `ARCHETYPE, PATTERN, GOALS` everywhere it appears (JSON schema line, rules, preferred order). Replace the `· COACH` example with a PATTERN example. Make the generic-trait labels ("Clear Direction", "Self-Awareness", "Self-Honesty", "Discernment", "Alignment", "Execution Confidence") unconditionally forbidden — remove the "unless source = COACH" escape.
- `compute-outer-readiness/index.ts` prompt blocks: the same three edits (source list, generic-trait carve-out removal, preferred-source line).
- `compute-outer-readiness/index.ts` validator: drop `COACH` from the accepted source array so a COACH pair is rejected, and remove the `sourceUpper !== "COACH"` exception on the generic-trait blocklist.
- Keep the deterministic `COACH_SOURCE_ENABLED` flag and the dormant `coach-*` → `COACH` label map in place so coach can be re-enabled later.
- Client safety net in `DecisionReadinessBrief.tsx`: when a stored pair's source is `COACH` (legacy rows already written), render the signal without the source suffix instead of printing "COACH". Display guard only.
- One-time data hygiene: strip the ` · COACH` suffix from existing `brief_snapshots.lean_on` / `watch_for` text so historical briefs stop showing it. No schema change.
- Bump `BRIEF_PROMPT_VERSION` so cached snapshots regenerate under the new contract, and redeploy `compute-outer-readiness`.

## 2. Brief Phrase typography

The phrase element still carries `.text-quote` (Cormorant Garamond, italic, 18/20px) and neither that class nor the markup has changed in git, so this is not a class swap. Two candidate causes, both unverified: the italic axis of Cormorant Garamond is **not** requested in `index.html` (`wght@400;500;600;700` only, no `ital`), so the browser has no true italic face to use; and hiding the score/tier row moved the phrase to the top of the card, where the missing italic reads as a different font.

### Plan
1. Verify first: inspect the rendered phrase's computed `font-family` and `font-style` on the live card and confirm which cause is real.
2. Fix accordingly — the expected change is to load the italic axis (`family=Cormorant+Garamond:ital,wght@0,400..700;1,400..700`) and, if needed, restate `font-headline italic` on the phrase element so it matches the reference screenshot.
3. No logic, backend, or layout changes beyond the phrase's own typography.

## Verification
- `tsgo`, the brief prompt-contract Deno tests, and the home component suites.
- Regenerate a live brief and confirm no `COACH` source appears.
- Visual check of the phrase against the supplied reference screenshot.