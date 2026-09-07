# COS profile: fix generation, storage and quality

## What the audit found (verified against the live database and code)

The COS profile is created by one function (`synthesize-cos-profile`), fired best-effort from the last onboarding screen. Eleven people have an onboarding row. Five never got a profile at all, six have one. Four real problems:

### 1. The personalisation write silently fails (root cause confirmed)

After the AI returns a profile, the function copies key fields onto the user's main profile record. That write is wrapped in a warning-only try/catch, and it is currently failing for everyone on a type mismatch: it writes a JSON text blob into `profiles.inferred_priorities`, which is a text array, and a plain sentence into `profiles.leadership_context`, which is JSON. Postgres rejects the whole statement, so *none* of the fields land.

Evidence: the most recent user has a good stored profile (role "Senior Academic Leader", archetype `clear-thinker`), yet on their profile record `user_archetype`, `archetype_title`, `identity_role` and `biggest_pressure` are all empty. Every downstream surface (Brief, Plan, Coach, Nudges) therefore reads a blank leader.

### 2. Completion runs before the profile exists, and writes the wrong shape

The final onboarding screen calls completion first, then fires synthesis. Completion writes `user_archetype` from a profile that does not exist yet — so it writes null — and when it does have one it writes the free-text name ("The Architect-Commander") rather than the canonical slug the rest of the system matches on. Only the newest row carries a `canonical_slug` at all.

### 3. Anything the AI returns is stored as "ready"

There is no validation. One stored "ready" profile is a 583-character shell reading "Profile Initialization Pending" with placeholder identity values (`[Role]`, `[Sector]`, "Unknown"). Recent profiles are 583–653 characters against 4,000–6,000 for earlier ones — a clear quality drop after the model change to `gemini-3.1-flash-lite`. Confidence values are also inconsistent free text ("medium", "Provisional", "Very Low").

### 4. The safety-net retry does not work

The background sweep calls the synthesis function with `{ userId }` in the body, but the function only ever reads the user from the auth token — so a service-role call cannot identify the user. The sweep also only looks at rows that already have a completion date, which excludes all five users who never finished. In practice nothing is ever recovered.

### Email

There is no email capability anywhere in the project — no provider, key, template or send call. Per your answer, email is out of scope for this piece of work; `no-reply@mindmodule.me` is recorded for when we do it.

## The plan

### A. Make the profile write actually land

- Write `inferred_priorities` and `leadership_context` in the types the columns expect (array and JSON respectively), and `pressure_profile` as JSON, not as a stringified blob.
- Verify the write instead of swallowing it: a failed personalisation write is logged as an error and reflected in the row's status, not hidden behind a warning.
- Write `user_archetype` as the canonical slug in both places (synthesis and completion), never the free-text display name — display name stays in `archetype_title`.

### B. Stop completion from blanking the profile

- Completion no longer writes archetype/identity fields when there is no generated profile yet, so it cannot overwrite good values with nulls.
- The last onboarding screen keeps its non-blocking behaviour, but synthesis is requested before completion clears out, so the profile is present when completion reads it.

### C. Quality gate with one retry, then `needs_input`

- Validate the AI output before storing: required sections present, no placeholder identity values (`[Role]`, "Unknown", "Not specified"), and a display section of real substance.
- If it fails, retry once with a stricter instruction. If it fails again, store the result but set the status to `needs_input` rather than `ready`, and record which inputs are missing.
- Normalise `confidence_overall` to a fixed set (high / medium / low / very_low) on the way in.
- Because most users provide only free text (LinkedIn URL scraping is disabled), the prompt is tightened to say plainly what to do with thin input rather than emitting placeholders.

### D. Fix the recovery sweep

- The synthesis function accepts a service-role call that names the user, alongside the normal signed-in path.
- The sweep also picks up users who have onboarding answers but no completion date, so abandoned sign-ups are recovered.

### E. Repair and regenerate existing users

- Repair pass: rewrite the personalisation fields on all six users who already have a stored profile, using the corrected types and canonical slug.
- Regenerate pass: re-run synthesis for the users whose stored profile is thin or placeholder-only, and for the five who never got one but have usable answers.

### F. Checks

Extend the existing onboarding/archetype test files (no new test files): the personalisation write uses column-correct types; completion does not null an existing archetype; a placeholder-heavy AI response is rejected by the gate; a service-role sweep call resolves the right user.

## Technical notes

- Files touched: `supabase/functions/synthesize-cos-profile/index.ts`, `supabase/functions/complete-onboarding/index.ts`, `supabase/functions/sync-calendar-scheduled/index.ts`, `src/pages/onboarding/stages/v8/StageDone.tsx`, plus assertions in `src/__tests__/archetypeSourceLabelContract.test.ts`.
- No schema migration: `cos_profile_status` is free text, so `needs_input` needs no database change. Column types are matched in code rather than altered.
- Repair and regeneration run as one-off passes; no historical data other than the affected profile fields is rewritten.

## Out of scope

Email delivery, LinkedIn scraping re-enablement, the model choice itself, and every surface that consumes the profile (Brief, Plan, Nudges, Insights) — those read the same fields and simply start receiving real values.
