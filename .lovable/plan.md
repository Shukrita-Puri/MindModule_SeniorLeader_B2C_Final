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

Frontend only, in `src/components/home/DecisionReadinessBrief.tsx` (plus one line of `index.html` if the font check confirms it). No logic, backend, or data changes.

### 2A. Diagnose the phrase font properly
The font-loading theory is not accepted as the cause — the italic face has always rendered before. So the fix starts with measurement, not a guess:

- Open the live Brief card in a headless browser and read the phrase element's computed `font-family`, `font-style`, `font-size`, and which class actually won the cascade.
- Compare that against the `.text-quote` definition in `src/index.css` (Cormorant Garamond, italic, 18px → 20px, weight 400).
- Check whether the phrase node is still the `.text-quote` `<p>` at all, or whether a different branch is rendering (copy-only-awaiting line, deterministic fallback line, or the failure block) — those three also use `.text-quote` but sit in different places in the card.
- Check whether any later rule (a card-level utility, `card-hero`, or a Tailwind class on the same element) is resetting `font-style` or `font-family`.

Whatever the measurement shows, the fix is the same shape: make the phrase element render in Cormorant Garamond italic again at the reference size, restating `font-headline italic` explicitly on the element so no cascade change can silently flip it back. If — and only if — the computed style shows a synthesised italic, the `ital` axis gets added to the Google Fonts URL in `index.html`.

### 2B. Spacing and body copy
- Increase the gap between the eyebrow row ("PERFORMANCE READINESS BRIEF") and the phrase. With the score/tier row hidden the phrase currently sits at `mt-2`; it moves to a comfortable `mt-5` so the card opens with breathing room instead of stacking two lines together. The same spacing applies to the awaiting, copy-only, and failure variants so every state opens consistently.
- Restore the body copy to its established treatment: `.text-body` (Inter, 16px → 17px, weight 400) with relaxed line height, in the secondary text token rather than the lighter muted token, so it reads as body prose again and sits clearly below the italic phrase rather than competing with it.
- Keep the phrase → body gap slightly tighter than the eyebrow → phrase gap so the phrase visually belongs to the paragraph it introduces.

## Verification
- `tsgo`, the brief prompt-contract Deno tests, and the home component suites.
- Regenerate a live brief and confirm no `COACH` source appears.
- Screenshot the Brief card before and after and compare the phrase, spacing, and body copy against the supplied reference (the 17:29 card).