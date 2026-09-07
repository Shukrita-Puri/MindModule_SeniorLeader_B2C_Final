# COS profile: depth, storage and correctness

Target: from whatever the user gives us in v8 onboarding, produce a profile with the depth of the Rishad example — leadership style with tags, how they think and talk, what lands / what won't, external persona, cognitive risk flags, what's missing, provisional archetype — degrading honestly when the inputs are thin. Stored so it can be sent as an email later without regeneration.

## What the audit found (verified against the live database and code)

Eleven people have an onboarding row. Five never got a profile, six have one. Five real problems.

### 1. The personalisation write silently fails (root cause confirmed)

After the AI returns a profile, the function copies key fields onto the user's main profile record. The write is wrapped in a warning-only catch and is currently failing for everyone on a type mismatch: a JSON text blob is written into `profiles.inferred_priorities`, which is a text array, and a plain sentence into `profiles.leadership_context`, which is JSON. Postgres rejects the whole statement, so none of the fields land.

Evidence: the newest user has a good stored profile (role "Senior Academic Leader", archetype `clear-thinker`) yet their profile record has `user_archetype`, `archetype_title`, `identity_role` and `biggest_pressure` all empty. Brief, Plan, Coach and Nudges therefore read a blank leader.

### 2. Completion runs before the profile exists, and writes the wrong shape

The last onboarding screen calls completion first, then fires synthesis. Completion writes the archetype from a profile that does not exist yet (so it writes nothing), and when it does exist it writes the free-text name ("The Architect-Commander") rather than the canonical slug the rest of the system matches on.

### 3. Depth and quality are far below the target, and anything is accepted as "ready"

There is no validation. One stored "ready" profile is a 583-character shell reading "Profile Initialization Pending" with placeholder values (`[Role]`, `[Sector]`, "Unknown"). Recent profiles are 583–653 characters against 4,000–6,000 for older ones, and against roughly 12,000 for the Rishad example. The prompt also does not ask for several sections the example has (style tags, the what-lands / what-won't split as separate lists, severity-coloured risk flags), and it does not tell the model how to infer depth from chips alone.

### 4. The safety-net retry does not work

The background sweep calls synthesis with `{ userId }` in the body, but the function only ever reads the user from the auth token, so a service-role call cannot identify anyone. It also only looks at rows that already have a completion date, excluding all five users who never finished.

### 5. Onboarding data capture — checked, mostly sound

Chips, goals, weekend preference, calendar and wearable selections, and home country all persist correctly. Two things to note:

- `brief_timing`, `preferred_practice_window` and `reset_modality` are null for every user. This is by design ("Use intelligence" is stored as null), but it means "let the system decide" is indistinguishable from "never answered". The step-status record will be used to tell them apart.
- LinkedIn URL scraping is disabled, and no one has uploaded a LinkedIn PDF, so external-persona depth currently has to come from free text. Only one of eleven users wrote any free text.

## The plan

### A. Make the profile write land

- Write `inferred_priorities`, `leadership_context` and `pressure_profile` in the types the columns actually expect.
- Treat a failed personalisation write as an error that is logged and reflected in the row status, not swallowed.
- Always store the canonical archetype slug in `user_archetype`; the display name stays in `archetype_title`.

### B. Stop completion blanking the profile

Completion no longer writes archetype/identity fields when no generated profile exists, so it cannot overwrite good values with nulls. Synthesis is requested before completion so the profile is present when completion reads it.

### C. Raise the profile to the target depth

- Rewrite the prompt around the example's structure, adding the sections it has and the current one lacks: style tags, separate "what lands" and "what won't land" lists, risk flags with a severity colour, external persona, five-item gap list, and a named provisional archetype with a one-line signature.
- Give the model explicit instructions for thin input: infer from the chip combinations (high-stakes events, load drivers, operating burdens, goals) and say plainly what is inference versus evidence — never emit placeholders like `[Role]`.
- Move synthesis onto a stronger model for this one call, since it runs once per user and quality matters more than cost.
- Emit the display HTML using the same class names as the example so one stylesheet renders it in-app and in email.

### D. Quality gate: retry once, then `needs_input`

- Validate before storing: required sections present, no placeholder identity values, minimum substance in the display section.
- Fail once → retry with a stricter instruction. Fail twice → store it but mark the status `needs_input` and record which inputs would lift it, rather than calling a hollow profile "ready".
- Normalise confidence to a fixed set (high / medium / low / very low) — today it varies between "medium", "Provisional" and "Very Low".

### E. Store it email-ready

- Keep the full profile JSON and the rendered HTML on the onboarding row (both already exist), and additionally store an email-ready HTML version with the styles inlined and the in-app-only button removed, plus a plain-text fallback and a short subject line drawn from the archetype.
- These are new columns on the existing onboarding table, so a later send is a lookup, not a regeneration. No email provider, key or send is added in this piece of work; when we do it, `no-reply@mindmodule.me` is the from-address.

### F. Fix the recovery sweep

Synthesis accepts a service-role call that names the user, and the sweep also picks up users who have answers but never completed, so abandoned sign-ups are recovered.

### G. Repair and regenerate existing users

- Repair: rewrite the personalisation fields for all six users who already have a stored profile.
- Regenerate: re-run synthesis for the thin/placeholder profiles and for the five users who have usable answers but no profile.

### H. Checks

Extend existing test files (no new ones): the personalisation write uses column-correct types; completion does not null an existing archetype; a placeholder-heavy response is rejected; the email-ready HTML is produced whenever a profile is stored; a service-role sweep call resolves the right user.

## Technical notes

- Files touched: `supabase/functions/synthesize-cos-profile/index.ts`, `complete-onboarding/index.ts`, `sync-calendar-scheduled/index.ts`, `src/pages/onboarding/stages/v8/StageDone.tsx`, plus assertions in `src/__tests__/archetypeSourceLabelContract.test.ts`.
- One migration: add `cos_profile_email_html`, `cos_profile_email_text`, `cos_profile_email_subject` to `onboarding_v8_responses` (service-role write, owner read — same policy as the existing profile columns). `cos_profile_status` is free text, so `needs_input` needs no schema change.
- The uploaded example is used as the prompt and HTML reference only; it is not added to the app as an asset.

## Out of scope

Sending email, re-enabling LinkedIn scraping, and the surfaces that consume the profile (Brief, Plan, Nudges, Insights) — they read the same fields and simply start receiving real values.
