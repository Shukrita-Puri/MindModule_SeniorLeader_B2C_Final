# COS profile: cheaper-model evaluation + three prompt fixes

## Scope

`supabase/functions/synthesize-cos-profile/index.ts` only.
- SYSTEM_PROMPT: three targeted additions.
- `AI_MODEL` constant: evaluate `google/gemini-3.1-flash-lite` (or cheaper alternative) against current `google/gemini-3.1-pro-preview`.
- No changes to `buildUserPrompt`, `COS_TOOL`, pipeline, persistence, quality gate, fallback chain, frontend, iOS/Android, schema, data, UI/UX, or flows.

## Part 1 — Model evaluation

Question: can the cheaper model match pro-preview quality for this prompt?

Approach:
1. After the prompt fixes are applied, force-regenerate the COS profile for user `google-oauth2|116390658289705811244` using the current `AI_MODEL` (`google/gemini-3.1-pro-preview`). Record output as baseline.
2. Force-regenerate the same user with `AI_MODEL` temporarily set to `google/gemini-3.1-flash-lite`. Record output as challenger.
3. Compare both outputs against the same quality rubric (see Verification).
4. Decision:
   - If flash-lite output passes all checks and is equivalent or better → switch primary model to `google/gemini-3.1-flash-lite`.
   - If flash-lite output degrades quality on any check → keep `google/gemini-3.1-pro-preview` as primary, document the finding, and leave flash-lite in the fallback chain only.

## Part 2 — Three SYSTEM_PROMPT fixes

### Issue A — Literal `\n\n` in JSON string fields

Move/add the plain-text instruction so it appears twice:

- Insert at the end of **STEP 4 · PRODUCE EACH SECTION** (after Section 7 block and before the STEP 5 divider):

```
PLAIN TEXT IN ALL JSON STRING FIELDS:
Write paragraph breaks as natural sentence endings followed by two spaces.
Do NOT emit the character sequence \n or \\n inside any string field value.
Not in style_description. Not in how_they_think. Not in descriptions.
Not anywhere. The HTML handles visual breaks via CSS.
```

- Keep the existing instruction at the end before the tool-call instruction (belt + braces).

### Issue B — `canonical_slug` mismatch

In **STEP 4 · SECTION 7 · PROVISIONAL ARCHETYPE**, after the existing `canonical_slug: closest match from the canonical slug list` line, add:

```
canonical_slug MUST match the archetype name you chose.
If the name is "The Grounded Navigator", the slug is "grounded-leader".
If the name is "The Adaptive Navigator", the slug is "adaptive-navigator".
Do not mix names and slugs from different archetypes. Check the match
before emitting.
```

### Issue C — Communication style section is thin

In **STEP 4 · SECTION 3 · COMMUNICATION STYLE**, add:

```
SECTION 3 DEPTH REQUIREMENT:
how_they_think must be at least two sentences that explain the specific
cognitive pattern — not a category label. Describe the actual process:
how they take in information, what they do with it before acting, and what
this means for how the Brief should structure its content.

how_they_communicate must be at least two sentences that describe the
observable register — vocabulary level, structure, what they expect in
return. Draw from freetext structure as evidence (e.g. "her freetext
breaks itself into headed sections — scope, leadership experience,
institutional perspective — before making any claims. That is cognitive
style made visible: she categorises before she reasons, and expects the
Brief to do the same.")

These two fields must not duplicate what_lands. They describe how the
person processes and speaks, not what content they prefer.
```

## Verification

After applying the prompt fixes and completing the model comparison:

1. `deno check` on the function passes.
2. Deploy only `synthesize-cos-profile`.
3. Force-regenerate for `google-oauth2|116390658289705811244` with the chosen primary model.
4. Confirm in the stored `cos_profile` JSON:
   - `leadership_style.style_description` contains no literal `\n` or `\\n`.
   - `communication_profile.how_they_think` is at least two full sentences describing cognitive process, not a bullet label.
   - `communication_profile.how_they_communicate` describes the observable register with at least one sentence of freetext evidence.
   - `provisional_archetype.canonical_slug` matches the archetype name (`grounded-leader` if name is "The Grounded Navigator", `adaptive-navigator` if "The Adaptive Navigator", etc.).
   - `display_html` renders the seven sections in the required order and is over 4,000 characters.
   - Section order remains: Identity → Leadership → Communication → What works/What doesn't/CoS rules → Cognitive Risk → External Persona → Archetype + Load map.
5. Document the model decision and the quality comparison result.

## Explicitly untouched

- `buildUserPrompt()`
- `COS_TOOL` schema
- Pipeline, trigger, persistence, quality gate, gap recording, email rendering
- Frontend, iOS, Android, other Edge Functions
- Database schema and data
- The existing `buildFallbackCosProfile` local fallback
