# Make the Chief of Staff profile permissive, never blocking

Onboarding has many optional questions. The current depth check treats a thin
profile as unusable, which switches off personalisation for anyone who answered
lightly — or whose AI call fell back. That is the wrong trade: any profile built
from whatever the leader gave us is better than none, and the raw answers are
already what most features read.

## What changes for the leader

- Whatever they type, tick or skip is saved as-is; nothing is required.
- A profile is always formed from what exists and is always used by the Brief,
  Plan, nudges and insights — thin or rich.
- Depth is recorded as a quality note, not a gate. It only matters later, when
  we start emailing the profile out.

## The rules after this change

1. Every generated profile is stored as usable. The only non-usable states stay
   the honest ones: generation in progress, and hard failure (no profile object
   at all, or the save itself failed).
2. The depth checks stop being pass/fail. They become a recorded list of gaps
   plus a coarse quality label (`rich` / `partial` / `thin`) saved alongside the
   profile, so we can measure and improve over time and decide who is
   email-ready.
3. One stricter retry still runs when gaps are found, because a better profile
   is worth one extra call — but its outcome never changes usability.
4. "AI unavailable" today only means the model call failed (rate limit, credit
   limit, outage) or returned no usable answer. It tries the strong Gemini model
   then the fast one. A third, lighter attempt on `google/gemini-3.1-flash-lite`
   (the same model family the Brief uses) is added before giving up, so a real
   profile is written in nearly every case.
5. If all three attempts fail, the locally built fallback profile is still
   stored as usable, tagged `source = fallback` and `quality = thin` so it is
   distinguishable and can be re-run later.
6. Emails (when built) gate on quality, not on usability: only `rich`/`partial`
   get sent.


## Technical changes

- `supabase/functions/synthesize-cos-profile/index.ts`
  - `validateCosProfile()` keeps its checks but is reframed as advisory: it
    returns gaps, and a new `scoreProfileQuality(profile, gaps)` derives
    `rich | partial | thin`. Placeholder strings still count as gaps.
  - Status resolution becomes: profile object present → `'ready'`; otherwise
    `'failed'`. `'needs_input'` is no longer written by the success paths.
  - `persistProfile(profile, source, status, gaps)` also persists the quality
    label and gap list (into `cos_profile_quality` / existing
    `cos_profile_error` gap field — see migration below) instead of using them
    to downgrade status.
  - The AI-unavailable branch persists the fallback with `'ready'` +
    `quality: 'thin'`, and only after a third model attempt on
    `google/gemini-3.1-flash-lite` also fails.
  - Response payload keeps returning `quality_gaps` and adds `quality`.

- `supabase/functions/_shared/leader-profile-loader.ts`
  - Accepts any row that has a `cos_profile` object, regardless of status; only
    a missing/empty profile falls through to the null shell. Each field already
    resolves to `null` when absent, so partial profiles degrade field by field
    rather than all at once.
  - `meta` gains `quality` so a surface can choose to be lighter-touch on a thin
    profile, without ever being blocked.
- `src/utils/onboardingV8Resume.ts`
  - `toSynthesisStatus()` maps `needs_input` (legacy rows) to `ready`, not
    `not_started`, so resume never sends a finished leader backwards.
- Migration (one): add `cos_profile_quality text` to `onboarding_v8_responses`.
- Backfill (one): every existing row where `cos_profile_status = 'needs_input'`
  and `cos_profile is not null` becomes `'ready'` with quality derived from the
  stored gap list (default `thin`).
- Tests: extend the existing onboarding/profile contract test to assert a thin
  profile is stored as usable, that the loader returns a populated context for a
  thin profile, and that a missing profile object still yields `failed`.

## Out of scope

No changes to onboarding questions, UI, copy, the prompt, or any other feature.
No email sending is added.
