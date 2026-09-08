# COS profile synthesis quality upgrade

## Scope

One file: `supabase/functions/synthesize-cos-profile/index.ts`. Only `SYSTEM_PROMPT` additions/replacements. No schema, pipeline, persistence, fallback, frontend, iOS/Android, or other Edge Function changes.

## What changes

Make four targeted edits to `SYSTEM_PROMPT`:

1. **Addition 1 — ON INFERENCE DEPTH**  
   Insert at the end of **STEP 2 · ANALYSE BEFORE YOU WRITE** (after the existing `ON ARCHETYPE` paragraph). Teaches the model to read freetext for three signals chips cannot provide: purpose language, declared professional interests, and forward-facing mission language.

2. **Addition 2 — QUALITY STANDARD**  
   Insert at the end of **STEP 3 · PORTRAY, DON'T CLASSIFY**, before **STEP 4** begins. Provides current-vs-useful examples for Identity, Leadership Style, Communication/What Lands, What Won't Land, Teal/Amber risk flags, External Persona, and Archetype, plus the general rule that every sentence must be traceable to the freetext.

3. **Addition 3 — RISK FLAG QUALITY STANDARD**  
   Insert in **STEP 4 · SECTION 5 · COGNITIVE RISK PROFILE**, after the existing `risk_flags` guidance and before `regulation_strengths`. Requires each flag to answer: (a) why this person is more susceptible than a typical executive, and (b) what the CoS will actually see before the flag fires. Also sets plain, memorable flag-name standard.

4. **Addition 4 — TONE rewrite**  
   Replace the existing **HOW TO WRITE — TONE AND LANGUAGE RULES** block with the new **HOW TO WRITE — THE STANDARD TO MATCH** block. Consolidates the Rishad benchmark sentences, plain-English rules, risk-flag leading-indicator examples, identity/communication/archetype rules, and the escaped-newline prohibition.

## Verification

1. `deno check` on the function.
2. Deploy only `synthesize-cos-profile`.
3. Force-regenerate the COS profile for user `google-oauth2|116390658289705811244`.
4. Read the stored `cos_profile` JSON and `cos_profile_html`. Check:
   - Section order remains correct.
   - Leadership style reads like a paragraph about a specific person with at least one memorable, non-technical sentence.
   - Risk flags describe observable leading indicators in plain English and explain the mechanism/origin.
   - `what_lands` / `what_wont_land` items are complete colleague-briefing sentences grounded in the user's own words.
   - Archetype description is readable in one pass and sounds like a person describing another person.
   - No literal `\n` or `\\n` characters in JSON string fields.
   - HTML length over 4,000 characters with all seven sections populated.

## Explicitly untouched

- `buildUserPrompt()`, `COS_TOOL` schema, fallback chain, quality gate, pipeline, persistence, email rendering, HTML class map.
- Frontend, iOS/Android, other Edge Functions, database schema and data.

## Note on preview runtime error

A frontend `TypeError: Importing a module script failed` is currently reported; it is unrelated to this backend-only prompt change. If it persists after this work, it will be investigated separately.
