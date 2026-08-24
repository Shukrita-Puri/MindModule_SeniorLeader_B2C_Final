# Fix "What Restores Your Performance": missing wearable signal + missing Section 2

## What I found (verified against the live database)

The redesigned card is already in the code — the reason nothing shows is a data-source mismatch, not missing UI.

- `sanctuary_events` is the table the engine reads for practice completions. Its last row is **24 Apr 2026** (153 rows, all `event_type = 'session_complete'`). Nothing writes to it any more.
- Live practice completions now land in **`daily_ritual_completions`** (424 rows, latest today 24 Aug) and in **`content_relevance_feedback`** star-rating rows (latest today 18:47).
- Intraday HR exists and is current: 52 days with `hr_samples` in the last 30 days, latest 24 Aug. Calendar events are current too (351 rows).

Consequences, exactly matching the screenshot:
- `sessions` is 0 for every practice (`n=0` chips) because no completion falls in the 30-day window.
- `wearableSignal` is always null — there is no completion timestamp to build the HR before/during/after windows from.
- `dominantEventCategory` is always null, and because Section 2 is keyed off those categories, `section2` is empty and the whole block never renders.
- The category chips read `pause` / `presence` / `unknown` because `sanctuary_content.category` holds `pause`, `presence`, `power-up` — the spec's Pause / Flow / Energise names were never mapped.

## What changes

Two files, same two as the original redesign.

### 1. `supabase/functions/content-feedback/index.ts` (GET_PRACTICE_IMPACT only)

Replace the `sanctuary_events` read with a canonical completion list assembled from the tables that are actually written:

- Read `daily_ritual_completions` (`ritual_date, completed_practice_ids, session_period, soundscape_completed_at, guided_practice_completed_at, micro_exercise_completed_at`) over the session window, and expand `completed_practice_ids` into one completion per content id per day.
- Keep reading `content_relevance_feedback` (already in place) and use it to time-anchor completions: a completion's timestamp is the earliest post-practice star-rating `created_at` for that content id on that ritual date; if none exists, fall back to the slot `*_completed_at` column when present.
- If neither an anchor nor a slot timestamp exists, the completion still counts towards `sessions` but contributes **no** HR window and no event-category tally (honest null rather than a guessed midpoint).
- Duration comes from `sanctuary_content.duration_minutes` (the ledger's `practice.duration`) rather than the retired `sanctuary_events.duration_seconds`; default stays 20 minutes when absent.
- Also fold any CRF star-rating row that has no matching ritual-completion row into the completion list, so freshly rated practices count immediately.
- Map `sanctuary_content.category` to the canonical display names before the signal mapping runs: `pause → Pause`, `presence → Flow`, `power-up → Energise`, anything else → `Unknown`. The existing category-aware signal mapping (Pause = HR during drop, Flow = next-morning HRV, Energise = HR during rise + recovery) then resolves correctly instead of falling into the unknown branch.
- Everything downstream (bounded check-in pairing, `meanHrBetween`, thumbs excluding neutral, `dominantEventCategory` tally, `section2` aggregation, payload shape) stays exactly as built — it just receives real completions now.

### 2. `src/components/insights/PracticeEffectiveness.tsx`

- Chip styling keys off the canonical names (`Pause` blue, `Flow` emerald, `Energise` amber, default muted) — no more lowercase `presence` / `unknown` labels.
- No other structural change: the row layout, signal line, and the "Before Your Hardest Days" block already match the spec and will render as soon as the payload populates.

## Verification

- Typecheck plus the existing insights and edge-function test suites.
- Deploy `content-feedback`, then probe `GET_PRACTICE_IMPACT` for the account that completed practices today and confirm: `sessions > 0`, at least one non-null `wearableSignal` (HR windows overlap today's `hr_samples`), a non-null `dominantEventCategory`, and a non-empty `section2`.
- Re-check on the card that rows show `n>0`, a Pause/Flow/Energise chip, and that "Before Your Hardest Days" appears. Where HR windows genuinely have fewer than 2 samples, the slot stays absent rather than showing a fabricated number.
