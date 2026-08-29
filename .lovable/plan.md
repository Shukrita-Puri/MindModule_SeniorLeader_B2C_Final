# CHANGE 5 — SILENT_REASONING additions (LLM system prompt)

## Goal

Three targeted additions to the existing `SILENT_REASONING` block in
`supabase/functions/_shared/brief/copy-vocabulary.ts`, LLM path only. No beat
renames, no output-contract change, no other file touched.

1. When a `⚑` flag appears in BUCKET 3, that pattern becomes the evidence anchor for beat (a), overriding generic wearable language.
2. Category H events can never anchor beat (c).
3. A clear six-item priority order for pattern sources (cause-effect engine first, lightweight correlation last).

## Current state (verified)

- `SILENT_REASONING` is `export const SILENT_REASONING = \`...\`` at line 210; it ends at line 287.
- `buildBriefSystemPrompt()` (line 628) embeds `SILENT_REASONING` as-is (line 655). No assembly change needed.
- No deployed function other than `compute-outer-readiness` consumes `SILENT_REASONING` (smart-nudges and `plan/why-llm.ts` import only `CHIEF_OF_STAFF_PERSONA` / `FORBIDDEN_NOTIFICATION_WORDS` from the wrapper — the edit is inert for them).
- Golden set is 174 fixtures, generated in-code from `FAMILIES × WINDOWS × BANDS` loops in `golden-set.test.ts` — untouched by this change, so the count cannot move.

## Edits (all inside `SILENT_REASONING`)

### Location A — end of the BUCKET 3 description, Step 1

The BUCKET 3 bullet block actually ends with `Coach insights — strength, growth area, pending commitment.` at line 252 (the "Consecutive low clarity" line the request names is its second-to-last bullet). There is currently no parenthetical after it — confirmed by `rg` (only line 252 matches). Two insertions happen after that line, before `STEP 2 — FIND THE TENSION` (line 254):

1. Add a parenthetical note scoped to the coach bullet (the Coach feature is not active, but growth areas and pending commitments currently come from Onboarding V8 — so the bullet is not fully skipped when V8 data exists):

```
    (Coach feature not yet active — no coach data will appear in BUCKET 3. Growth areas and
    pending commitments currently come from Onboarding V8; use those when present. Skip this
    bullet only when no V8 data exists.)
```

2. Add the pattern-priority rule immediately after that note:

```
  PATTERN PRIORITY RULE: If any entry in BUCKET 3 is flagged ⚑ TODAY'S CALENDAR —
  that pattern is the anchor for beat (a). It overrides generic wearable language.
  Name the event type, the n, and the measured delta. Be specific.
  CORRECT: "Your last 4 board sessions have moved recovery down 18% the morning after."
  WRONG: "High-stakes events affect your recovery."
  NOTE: event_to_hrv = next-morning recovery cost (not in-event). Do not say HRV drops
  "during" the meeting — say "the morning after" or "the day after."
```

### Location B — Step 4, after the A/B/C anchor line

Find: `If a [A], [B], or [C] event exists today, it anchors beat (c).` (line 267). Insert immediately after it:

```
Category H events (gym, run, social, family dinner, personal errands) are NEVER
beat (c) anchors — even when they are the only event on the calendar.
If only H events exist, beat (c) anchors to the day shape or the pillar state.
```

### Location C — Step 5, replace the priority order line

Find (lines 277-278):

```
Priority order: HRV×event correlation for today's event type → HR×event → cognition×event →
consecutive deficit streak → DOW pattern.
```

Replace with:

```
Priority order for pattern selection:
  1. causality_findings match (⚑ flagged in BUCKET 3) — highest priority, n≥3, measured
  2. HR×event correlation (in-event intraday signal, if available)
  3. Cognition×event impact (clarity/sharpness drop for this event type)
  4. Consecutive deficit streak (sustained load signal)
  5. DOW historical pattern (day-of-week baseline divergence)
  6. Lightweight hrvEventCorrelation (keyword match, lower confidence — use only if no ⚑ flag)
```

The following line `Skip entirely if nothing is clearly relevant — a generic pattern is worse than no pattern.` already exists and is kept as-is (no duplication).

All inserted text keeps the file's two-space bullet indentation; content is verbatim from the request.

## What NOT to change

- Beat names: evidence / the read / the work directive / the close — untouched.
- `BODY_FOUR_BEAT_CONTRACT`, `WORKED_EXAMPLES`, `OUTPUT_CONTRACT`, `HARD_CONSTRAINTS` — untouched.
- No new exports; `buildBriefSystemPrompt()` assembly unchanged.
- No `BRIEF_PROMPT_VERSION` bump. No other file edited (scope: `copy-vocabulary.ts` only).

## Verification

1. Code check — `rg` for the three additions and confirm each sits between the `SILENT_REASONING` template-literal delimiters; confirm the four beat names are byte-identical; confirm no new `export` lines were added.
2. Content check — `rg` for `PATTERN PRIORITY RULE`, `Category H events`, `Priority order for pattern selection`, and all six numbered items.
3. Regression — run, expect green:
   - `deno test supabase/functions/_shared/brief`
   - `deno test supabase/functions/_shared/personas`
   - `deno test supabase/functions/compute-outer-readiness/golden-set.test.ts` — fixture count printed in the test name must stay 174 (deterministic template logic is untouched, so it cannot change).
4. Scope check — `git diff --stat` must show only `supabase/functions/_shared/brief/copy-vocabulary.ts`.

## Deploy

`supabase functions deploy compute-outer-readiness` only. No other function redeployed; the change is system-prompt text consumed solely by that function.