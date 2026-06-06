# Brief LLM Prompt — Band-Gate, MRS-Consistency, Four-Beat, Hard Constraints

## Scope
Isolated to the Brief's system prompt SSOT: `supabase/functions/_shared/brief/copy-vocabulary.ts`.

No changes to:
- Scoring math, MRS computation, or band cut-points
- DB schemas, edge function wiring, or call sites
- Plan, Nudges, Insights, or any UI
- The existing `bandValence` plumbing in `compute-outer-readiness` (low/mid/high already flows in at line 3396–3404 and gates the post-validator at 4339–4365)

The user-message assembly, validators, and call sites all already consume `buildBriefSystemPrompt({ bandValence })` and `mrsConsistencyLine(bandValence)`. We only sharpen the strings those functions return.

## What's already landed (confirmed)
- `bandValenceDirective()` — present, mapped to low/mid/high
- `mrsConsistencyLine()` — present but terse (one line)
- `BODY_FOUR_BEAT_CONTRACT` — present with evidence → read → work → self-reg
- `HARD_CONSTRAINTS` — bans wellness/clinical/score-tier words, abstract system phrases, and "never tell the user how to raise their score"

The four addendum pieces are partly there but use 3-tier valence vocabulary (low/mid/high) instead of the 5-band names the user specified (FIRING/SHARP/STEADY/STRETCHED/DEPLETED), and the MRS-consistency block + tension-resolution example are missing.

## Changes (one file)

`supabase/functions/_shared/brief/copy-vocabulary.ts`

1. **Band-gate rewrite (`bandValenceDirective`)** — keep the `'low' | 'mid' | 'high'` input signature (so no caller changes), but rewrite each branch to use the 5-band vocabulary and the user's verbatim guidance:
   - `high` → covers FIRING / SHARP days. Directive must be permissive or focusing. Forbids protective/limiting language. Includes the "head took a minute to switch on" tension-resolution example.
   - `mid` → STEADY. Either permissive or protective allowed; no big push, no big retreat.
   - `low` → STRETCHED / DEPLETED. Protective or narrowing only ("reserve capacity", "execute, don't initiate"). Forbids push language.
   - All three branches add: "If a single signal seems to contradict the band, name the tension honestly but resolve it toward the band — the score already weighed that signal."

2. **MRS-consistency block (new constant + appended into system prompt)** — add `MRS_CONSISTENCY_BLOCK` with the user's verbatim paragraph: the score is the Brief's own read as a number from the same data; patterns and behaviour flags add perspective, never contradict; when score and a single signal disagree, the score already weighed that signal. Wire `buildBriefSystemPrompt()` to append this block after the band-gate.

3. **Four-beat body contract (`BODY_FOUR_BEAT_CONTRACT`)** — rewrite to the user's exact four-beat framing: EVIDENCE (2–3 inputs across different sources) → THE READ (judgment no single input states) → THE WORK DIRECTIVE (shape of engagement, never a practice or duration, never overlaps Plan) → THE SELF-REGULATION DIRECTIVE (one broader protective nudge that does not overlap Plan). Keep the existing ~40-word cap and lean-on/watch-for schema. Reinforce: "NON-REPETITION IS THE RULE: every beat must add something the others don't. If two beats say the same thing, cut one."

4. **Hard constraints (`HARD_CONSTRAINTS`)** — fold in the user's three reinforced bans (some already present, restated together for emphasis):
   - Never use abstract system-phrases ("come down clean", "hold the base", "mask the surge"). If a chief of staff wouldn't say it out loud, rewrite it.
   - Never tell the user how to raise their score or what actions to improve it — that is the Plan's job. The Brief names the state and the orientation; the Plan owns the how.
   - Never name the score, the band, or the state read in the output.

5. **`mrsConsistencyLine()`** — keep the short user-message line as-is (it's a per-call reminder inside the READINESS block, complementary to the new system-prompt block).

## Verification
- Re-read the assembled `buildBriefSystemPrompt()` output mentally to confirm: persona → voice → hard constraints → band-gate → MRS-consistency → pre-computed notice → priority → silent reasoning → four-beat body → examples → JSON contract.
- Confirm no caller imports broke: only `compute-outer-readiness/index.ts` consumes `buildBriefSystemPrompt`, `bandValenceDirective`, `mrsConsistencyLine` — signatures unchanged.
- Existing post-validator `body_valence_mismatch_*` guards (index.ts:4339–4365) still align: PUSH_TONE rejected on low, PROTECT_TONE rejected on high — consistent with the rewritten directive.

## Out of scope (explicit)
- No change to the 3-tier `ReadinessValence` type or the score→valence cut-points (50 / 65). The 5-band copy is rendered inside the directive text; the input contract stays 3-tier so no upstream rewrites are needed.
- No Plan, Nudges, or Insights changes.
- No new validator rules; existing tone-mismatch guards already enforce the band-gate.
