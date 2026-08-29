# Brief Changes 1, 3, 4 — verified deltas only

Audit of `compute-outer-readiness/index.ts` shows Changes 1 and 3 are already
implemented in a richer form than the cards describe, and Change 4 is partially
implemented. So the work is narrower than the cards: three real gaps, all
additive, Brief-only, LLM path only, no scoring/schema/gating change.

## What already exists (confirmed by reading the code)

- Change 1: `causalitySignalSummary` is already declared and queried
  (`index.ts` ~6897–6920), non-blocking try/catch, with a timing log line. It is
  in the same scope as both the LLM prompt assembly and the deterministic
  fallback call (~9442), so Change 7 has its prerequisite already.
- Change 3: BUCKET 3 (~7220–7338) already renders HR × event, RHR × event,
  HRV × event, cognition × event, sleep → next-day, consecutive load and
  positive category lift — each with n, confidence, a today-match marker, and
  correct "next-morning recovery, not in-event" framing for HRV/RHR.
- Change 4: a `=== LEADER PROFILE ===` block already exists (~7466–7500) with
  goals, declared high-stakes events, provisional archetype and the CoS
  accountability note.

## Gap 1 — causality query can miss on any day the engine has not run yet

The query pins `computed_for_date = userLocalDate`. If the nightly cause-effect
engine has not written today's row (or ran late, or the user's local date is
ahead of the engine's run), the query returns nothing and the entire measured
pattern section silently disappears from the prompt.

Fix: drop the exact-date equality and take the most recent row instead —
`.order('computed_for_date', { ascending: false }).limit(1).maybeSingle()`.
Everything else stays: same table, same `pattern_kind`, same try/catch, same
non-blocking behaviour, same log line. Add the row's date to the existing log
line so staleness is visible.

## Gap 2 — RHR and cognition today-matching can never fire

The today-match set is built from event *buckets*
(`enrichOf(title).subtype?.bucket`), which is correct for the HR block because
`hr_event_lift` entries carry a `bucket` field. The RHR and cognition blocks
compare that same bucket set against `f.event_type`, which is a different
vocabulary — so those two blocks effectively never mark `← TODAY`.

Fix: build a second match set from the same titles keyed on the event-type
vocabulary those entries use (category name / subtype id, matched
case-insensitively), and use it for the RHR and cognition blocks. Ordering,
thresholds, caps and copy stay unchanged; only the marker becomes reachable.

## Gap 3 — Leader profile is missing the risk fields and the two directives

The existing block omits the fields Change 4 asks for, and omits the two
instructions that make the block actionable.

Add to the same block, guarded the same way (only rendered when present):

- `Cognitive risk pattern:` from `priors.cognitive_risk_profile.primary_risk`
- `Regulation strengths:` from
  `priors.cognitive_risk_profile.regulation_strengths`
- next to archetype: "use to calibrate posture and vocabulary — never name it
  in output"
- next to declared high-stakes: "when today's calendar contains these event
  types, treat them as the highest-stakes anchor regardless of A–H category"

Source of this data: the V8 onboarding steps (leadership context, cognitive
load, protect-goals, brief prefs), persisted on `onboarding_v8_responses` and
synthesised into `cos_profile` by `synthesize-cos-profile`. The Brief reads it
only through the existing `loadLeaderProfile()` resolver — no new query, no new
table, no onboarding change.

No new DB reads — `leaderProfile` is already loaded. `leaderVoiceBlock` and
`serverArchetype` are untouched.

## Out of scope, confirmed

No change to the deterministic path, validators, signal pills, window context
builders, event taxonomy, MRS, Plan, Nudges, Insights, cause-effect-engine, any
frontend file, or any migration. `BRIEF_PROMPT_VERSION` is not bumped — these
are data-availability and observability changes, not an output-contract change.

## Verification

- `deno test supabase/functions/_shared/brief` — green
- `deno test supabase/functions/_shared/personas` — green
- Golden-set fixtures unchanged (no fixture carries causality or profile data,
  so both blocks stay guarded off)
- Typecheck the edited function
- After deploying `compute-outer-readiness` only: read one live invocation's
  logs to confirm the `[brief][causality]` line reports `hit=yes` with a date,
  no new error lines, and no material latency change
- Inspect `payload_json` for one user with causality data to confirm a
  `← TODAY` marker now appears on a matching RHR or cognition entry, and for
  one user with a completed profile to confirm the risk fields render
- Confirm a user with neither dataset still generates a brief with both blocks
  absent
