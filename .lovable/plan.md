
# Smart Nudges Copy Evolution — V8 "Meaning-Forward, Mind-Prep CTA"

Isolated change to the **copy principle, prompt, validator, and fallback library**. No changes to cascade, anchoring, suppression, frequency, slot priority, signal-strength comparator, routing, deep-links, A/B bucketing, scheduling, or wearable/calendar/JIT logic.

## The three principles (the only thing being evolved)

1. **Lead with meaning, not the data point.** Raw metrics never lead. The body translates what the data *means for the user's day*. The number can appear inside the meaning sentence as evidence, but it never carries the message alone.
   - ❌ `HRV -22% today — log in to prep.`
   - ✅ `Your body's running below baseline (HRV -22%). Close the day before tomorrow loads up — log in to recalibrate your mind.`

2. **Title = state or moment. Body = context + one clear action.** Title names a moment a CEO recognises ("Recovery in progress", "Starting from where you are", "Recalibrating mid-day"). Body delivers the so-what plus a specific in-app action.

3. **CTA always ends at a specific app screen via a "log in / check in / open the app" verb — and the action is always *mental* prep, not strategic prep.** This is a mental-performance system; "prep" without qualifier is ambiguous (a CEO will read it as "prep the board deck"). Every CTA must qualify the prep as **mind / mental / state / recalibrate / close / set / land**, and route to a specific screen.

## The V8 CTA verb set (qualified, mind-anchored)

Each verb implies the destination but is phrased as a user action that requires opening the app:

| CTA verb (verbatim end of body) | Implied screen |
|---|---|
| `log in to prep your mind` | `/executive-home` (JIT plan) |
| `log in to prep your state` | `/executive-home` (JIT plan) |
| `log in to recalibrate your mind` | `/recalibrate` |
| `check in to recalibrate` | `/recalibrate` (mid-day reset) |
| `check in to set your intention` | `/daily-check-in` (morning) |
| `check in to close the day` | `/daily-check-in` (evening) |
| `check in to close the week` | `/daily-check-in` (Friday) |
| `check in to set tomorrow` | `/daily-check-in` (Sunday) |
| `check in to land the weekend` | `/daily-check-in` (Saturday) |
| `open your insights` | `/insights` (pattern alerts only) |

Banned (current V7 verbs that defeat the principle):
- `prep now`, `open the app to prep`, `check into the app to prep`, `go to the app to prep`, `open the app to prep tonight`, `open the app to prep with a cool-down` (unqualified — reads as strategic prep)
- `your prep is ready`, `your plan is ready`, `your brief is ready`, `see your prep`, `see your plan`, `see your readiness`, `tap to prep` (passive consumption — user thinks the work is done for them)

## V8 body contract

Body MUST satisfy ALL of:

- **Meaning sentence first.** First sentence is a human translation of the situation. The metric, if used, sits in parentheses or as a clause — never as the whole sentence.
- **At least one named context token** somewhere in the body — drawn from real ctx data:
  - a calendar event title from `ctx.morningPlan` / `ctx.todayEvents` / `ctx.tomorrowEvents`
  - a numeric physiological signal with unit (`HRV -22%`, `RHR +9 bpm`, `Sleep 62/100`)
  - a countable today-state (`5 meetings`, `3 priorities open`, `4 done`)
  - a check-in outcome word the user actually logged (`started low`, `managing`, `depleted`, `heavy`)
  - a specific minutes-until / clock time for a real event (`in 25 min`, `at 2pm`)
- **Ends with a V8 qualified-mind-prep CTA verb** (verbatim, modulo trailing punctuation).
- Length: ≤ 22 words, ≤ 140 chars (raised from V7's 16/95 — meaning-forward bodies are longer than metric-led ones; the gold-standard examples the user provided run 18–22 words).
- No forbidden words from V6/V7 list (wellness/mindful/etc. — unchanged).
- No placeholder tokens.

Title: ≤ 6 words, no emoji, names the state/moment.

JIT prefix `From your morning Plan:` / `From your plan:` — kept for plan-anchored bodies.

Pattern citation: kept — brief, human, no percent or n.

## Calibration: gold-standard examples (already correct in user's library)

Every example below is meaning-first, names the context, and ends in a qualified mind-prep CTA. The fallback library and AI prompt examples will be rewritten in this exact register:

| Slot / context | Title | Body |
|---|---|---|
| Evening · 7 meetings | Evening cool-down | `Seven meetings, no real break for your mind today. Close the day before it carries into tomorrow — log in to recalibrate your mind.` |
| Evening · HRV deficit | Recovery in progress | `Your body's running below baseline (HRV -22%). Close the day with a short reset before tomorrow loads up — log in to recalibrate your mind.` |
| Morning · yesterday depleted + heavy day | Starting from where you are | `Yesterday was heavy and today has 5 meetings ahead. Manage your energy instead of reacting to it — check in to set your intention.` |
| Morning · JIT board in 60m | Preparing mental performance | `Board Review in an hour. Walk in with the edge, not the anxiety — log in to prep your mind.` |
| Afternoon · morning was low | Mid-day reset window | `Your morning state was low and the afternoon is still ahead. This is the recovery window — check in to recalibrate.` |
| Afternoon · 3 more meetings | Recalibrating mid-day | `Halfway through with three more meetings ahead. Stay sharp instead of running on fumes — check in to recalibrate.` |
| Pre-event · investor 60m, peak | You're ready for this | `Investor meeting in an hour. Your mental prep is built for exactly this moment — log in to prep your mind.` |
| Pre-event · board 45m, depleted | Managing the moment | `Board presentation in 45 minutes and you're running low. Short, sharp, built for right now — log in to prep your state.` |
| Pre-event · hard conversation 30m | Preparing for a hard conversation | `Difficult conversation in 30 minutes. Lead it instead of surviving it — log in to prep your mind.` |
| Friday · week close | Week complete | `Five heavy days behind you. Close the week before you disconnect so it doesn't bleed into the weekend — check in to close the week.` |
| Sunday · heavy Monday | Monday is already mapped | `Tomorrow opens with Board Review and a full calendar. Three minutes of clarity tonight beats two hours of catch-up — check in to set tomorrow.` |
| Sunday · high-stakes Monday event | Big Monday — pre-loading now | `Tomorrow opens with a high-stakes moment. Wake up ahead instead of behind — log in to prep your mind tonight.` |
| Saturday · low HRV | The body's still catching up | `Recovery from the week isn't instant — your HRV is still below baseline. A short check-in tells you what kind of weekend you actually need — check in to land the weekend.` |
| Saturday · no agenda | No agenda today | `This one's yours. No goals, no output — just an honest signal for your own data — check in to land the weekend.` |
| Pattern · 3 days in red | Three days in the red | `You've been running depleted for three days in a row. That's a pattern worth looking at, not pushing through — open your insights.` |
| Pattern · board correlation | Spotting a pattern | `Board days have consistently shown up on your lowest-readiness days. Your data has something to tell you — open your insights.` |
| Pattern · recovery deficit | Recovery deficit detected | `Your body's been under-recovering for three days. That's a load signal, not a weakness — open your insights.` |
| Travel · timezone morning | New city, same standards | `Different timezone, same mental demands ahead. Your body may still be catching up but the day isn't waiting — check in to set your intention.` |
| Travel · long-haul evening | Travel takes a toll | `Long travel day — your body knows it even if the schedule doesn't. Close tonight before tomorrow's meetings — log in to recalibrate your mind.` |
| Travel · big meeting abroad next AM | Prepping across timezones | `Big meeting tomorrow and you're not in your home timezone. Front-load it tonight instead of in the morning rush — log in to prep your mind tonight.` |

## What does NOT change

- Slot priority (Morning > Evening > Afternoon), anchor priority (JIT > STATE), signal-strength comparator
- 3-nudge daily cap, 2h cooldown, quiet hours, DND, quiet days, in-meeting check
- pg_cron schedule, AI model, timeout
- Deep links / `ACTION_ROUTES` / payload routing — verbs imply destination but routing keys are unchanged
- Notification log schema, engagement tracking
- Cascade evaluators, JIT scoring, calendar event filtering, wearable/pattern reads
- Client (`usePushNotificationHandler`, `useNotificationEngagement`)

## Code changes (small, surgical, copy-only)

### `supabase/functions/smart-nudges/index.ts`

1. **`CTA_PHRASES`** (line ~333) — replace V7 strings with 4 V8 buckets, all qualified-mind-prep:
   - A control: `log in to prep your mind` / `log in to prep your mind`
   - B outcome: `check in to set your intention` / `log in to prep your state`
   - C urgency: `check in to recalibrate` / `log in to recalibrate your mind`
   - D close: `check in to close the day` / `check in to close the week`
2. **`applyCtaVariant` regex table** (lines ~389–396) — swap V7 phrase regexes for V8 phrase regexes so AI output is normalised onto the assigned bucket.
3. **`ALLOWED_CTA_VERBS_V7` → `ALLOWED_CTA_VERBS_V8`** (line ~962) — replace contents with the 10 V8 verbs above.
4. **`FORBIDDEN_WORDS_V6`** (line ~922) — append the V8 banned consumption verbs (`your prep is ready`, `prep is ready`, `your plan is ready`, `your brief is ready`, `see your prep`, `see your plan`, `see your readiness`, `tap to prep`) and the deprecated unqualified V7 verbs (`open the app to prep`, `check into the app to prep`, `go to the app to prep`, `prep now`, `open the app to prep tonight`, `open the app to prep with a cool-down`) so AI can't regress.
5. **New `requiresNamedContextToken(body, ctx)`** validator — body must contain at least one of: a real event title from ctx, a numeric token with HRV/RHR/Sleep/bpm/% unit, a `\d+\s+(meeting|meetings|priority|priorities|min|minutes|days?)` token, or a check-in outcome word from ctx.
6. **New `requiresMeaningSentence(body)`** lint — first sentence must NOT be a bare metric statement. Reject if first sentence matches `^(HRV|RHR|Sleep|HR)\s*[+\-]?\d` with nothing else, or if the body's only sentence is purely a number+unit clause. (Allows `Your body's running below baseline (HRV -22%)`; rejects `HRV -22% today`.)
7. **`violatesCopyContractV7` → `violatesCopyContractV8`** — same length/forbidden/placeholder gates, plus ends-with-V8-verb gate, plus `requiresNamedContextToken`, plus `requiresMeaningSentence`. Length ceilings raised to 22 words / 140 chars.
8. **System prompt** (lines ~1005–1048) — rewrite the principles, the gold-standard examples, and the rules block. Use the 20 calibration examples above as the gold-standard set in the prompt. Add explicit "this is a mental-performance system; `prep` ALWAYS means mental prep, never strategic / content prep" instruction. Examples and forbidden list both updated.
9. **Static fallback library** (lines ~1273–1370 — every `FB-N1*`, `FB-N2*`, `FB-N3*`) — rewrite each fallback body to the meaning-first shape, named-token kept, V7 suffix swapped for the slot-appropriate V8 qualified-mind-prep verb. (No new fallbacks added; one-for-one rewrite.)
10. **Telemetry** — bump `architecture` payload tag `cos-mind-v7-jit-or-state` → `cos-mind-v8-meaning-forward`. Bump `cta_experiment` id `cta-action-verb-v1` → `cta-action-verb-v2` so the new arms don't pool with the old ones.
11. **`v5_validation_test.ts`** — extend the assertion harness with V8 verbs, `requiresNamedContextToken`, `requiresMeaningSentence`, and the new 22-word / 140-char ceilings. Existing fixtures get their expected suffixes and lengths updated.

### Memory

- `mem/features/notifications/smart-nudges-mvp-framework.md` — replace the V7 copy-contract section with V8 wording (principles + verb list + meaning-first rule). Cascade/suppression/anchor/comparator language stays identical.
- `mem/features/notifications/cta-ab-experiment.md` — bump experiment id to `cta-action-verb-v2`, refresh the 4-arm verb list to V8.

### Docs

- `docs/SMART_NUDGES_TECHNICAL_DOCUMENTATION.md` and `docs/SMART_NUDGES_COMPREHENSIVE_ARCHITECTURE.md` — replace **only** the copy-library tables and the "Voice & copy contract" section with the V8 principles + the 20 calibration examples above. Suppression stack, signal assembly, cascade tables, KPI mapping, deferred types, weekend rules, time-of-day priority — untouched.

## Verification (after deploy)

1. `supabase--test_edge_functions` on `smart-nudges` — V8 contract tests pass; V7 fixtures fail and are updated to V8 expectations.
2. `supabase--curl_edge_functions` POST a dry-run for a known test user across N1/N2/N3 slots; inspect returned `title` / `body` / `payload.architecture` / `payload.cta_experiment`.
3. Tail `supabase--edge_function_logs` for `smart-nudges` for one cron tick — zero `violatesCopyContractV8` rejections expected; if any, refine prompt examples and redeploy.
4. SQL spot-check on the last 10 `notification_log` rows — every body contains a named token, every body's first sentence is a meaning sentence (not a bare metric), every body ends in one of the 10 V8 verbs.

## Out of scope (explicit)

- No changes to JIT scoring, calendar event filtering, wearable signal extraction, pattern-store reads, or the comparator.
- No changes to which screen each nudge deep-links to.
- No changes to MVP `MVP_POST_LAUNCH = false` deferred nudges.
- No client-side changes — routing keys and payload shape are unchanged.
- No changes to cron cadence, daily cap, or quiet-hours logic.
