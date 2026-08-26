# Time-to-Event Awareness + Educational vs Real Investor Event

## Audit answers first

### 1. Which file is the A–H SSOT?

There is no single markdown doc — the SSOT is code, in three layers:

| Layer | File | Owns |
|---|---|---|
| Pillars A–H | `supabase/functions/_shared/events/event-categories.ts` | ids, display names, self-regulation focus, Pre/During/Post protocol |
| Sub-categories | `supabase/functions/_shared/events/event-subtypes.ts` | every subtype (`gov.investor_meeting`, `str.learning`, …), keywords, excludeKeywords, demand profile, JIT lead time |
| Resolution | `supabase/functions/_shared/events/resolve-event-category.ts` (`resolveEvent()`) + `classify-event-v2.ts` | the ONLY entry point every surface uses |
| Phases | `event-phase-map.ts` | per-phase prescriptions |
| Frontend mirror | `src/lib/events/categories.ts` | labels only, drift-tested |

Load Shape SSOT: `supabase/functions/_shared/load-shape/types.ts` + `classify.ts` (producer) → stored on `daily_context_snapshot.load_shape`, read via `load-shape/read.ts`; frontend mirror `src/lib/loadShape.ts`. The uploaded `FINAL_A_to_H_Schema_Summary` doc will be reconciled against `event-subtypes.ts` and any gaps recorded, but code stays the SSOT.

### 2. Is the brief deterministic? Yes.

`brief_snapshots` for today: `brief_source: deterministic`, `driver: morning`, written 10:50 UTC. Copy comes from `_shared/personas/ceo/behaviour-copy.ts` → `boardLevelOutcome`.

### 3. Why time-to-event awareness disappeared

- `boardLevelOutcome` in `ceo-behaviour/workweek.ts` **does** compute `anchor.minutesUntil` and puts it in `evidence`, but the copy template hardcodes the string `"is within 24 hours"`. The number is computed and then thrown away — that is the whole regression.
- Second cause: the card shown at 11:38 was the 10:50 **morning** snapshot. Afternoon snapshots exist for today but all have `brief_source: awaiting` (no body), so the stale morning text keeps rendering as the event passes.

### 4. Why the anchor is wrong

`resolveEvent("Why Investor Comms are so Important")` returns **A / gov.investor_meeting, confidence high, layer6_dictionary** — even `"Webinar: Why Investor Comms are so Important"` returns the same. Reason: `dictionaryV2Match` walks `EVENT_TYPES` in array order and returns the first keyword hit; `gov.investor_meeting` (keyword `investor`) sits ~500 lines above `str.learning` (keyword `webinar`), so position, not specificity, decides. Today's rows also carry `event_category: null`, so nothing is persisted or learned yet.

## What to build

### A. Restore time-to-event precision in the deterministic brief
1. Extend `BriefCopyContext.anchorEvent` to carry `minutesUntil` (already available from `brief-signal-coverage.ts`).
2. Add a shared `timeToAnchor(ctx)` helper producing bucketed, honest phrasing: `"in 45 minutes"`, `"in 2 hours"`, `"this afternoon"`, `"later today"`, `"tomorrow morning"`, `"within 24 hours"` only as the last resort when no time is known.
3. Use it in every copy entry that currently says "within 24 hours" / "today's calendar" / "approaching": `boardLevelOutcome`, `advancePrep24h`, `decisionLeakageGuard`, `interpersonalMeetingContext`, `stackedStakes`, `boardReadinessWindow`, `reportingUpwards`.
4. Freshness: make the brief re-render when the anchor crosses a time bucket — include the anchor bucket in the brief input signature so an hour-away event does not keep 5am phrasing.
5. Suppress "every choice today is a preparation input" once the anchor has already started; switch to the post/during framing.

### B. Educational vs real high-stakes event (learn the essence, not the keyword)
1. Add an **intent layer** ahead of the dictionary in `classify-event-v2.ts`: title-shape signals that mark an event as content/learning rather than a room the user is in —
   - interrogative or explainer openers: `why …`, `how to …`, `what … `, `the importance of`, `masterclass`, `webinar`, `panel`, `fireside`, `AMA`, `bootcamp`, `101`, `deep dive on`;
   - structural cues: no attendees or very large attendee count, `is_organizer = false`, registration/Zoom-webinar links in `event_metadata`, recurring public series.
   Two or more cues → route to `str.learning` (E) with `medium` confidence, unless a counter-cue is present (bracketed counterparty name, `term sheet`, `sign off`, `due diligence`, named fund, small attendee list where the user is a participant).
2. Corollary rule so real ones still land in A/B: `[Sequoia VC] – Term Sheet Sign off`, `[PlugPlayVC] – Funding Chat` keep `gov.investor_meeting` — bracketed-counterparty pattern is a counter-cue and is added to the dictionary as a positive signal.
3. Make dictionary precedence explicit rather than array-position: give subtype rows a `specificity` weight so multi-word/contextual keywords beat single generic tokens (`webinar` + `why` beats bare `investor`).
4. Persist and learn: write `event_category`, `event_subcategory`, `category_resolved_by`, `category_confidence` on classify so the same title is not re-guessed, and feed user corrections through the existing `event_category_confirmations` → `event_learned_tokens` loop, which already outranks the dictionary (layer 1/2).
5. Load Shape consistency: because an E/`str.learning` event carries low stakes weight, today's day shape stops being pulled toward "high-stakes" by an educational webinar — no change to `load-shape/classify.ts` is needed, it inherits the corrected categories.

### C. Tests
- Resolver cases: the four real titles from today's calendar plus `"Webinar: Why Investor Comms are so Important"`, asserting E vs A splits and confidence.
- Copy tests: `boardLevelOutcome` renders "in 45 minutes" at 45 min, "within 24 hours" only when `minutesUntil` is absent.
- Drift test unchanged: frontend mirrors stay in sync.

## Technical notes
- Files touched: `_shared/personas/ceo/behaviour-copy.ts`, `_shared/brief-context.ts`, `_shared/ceo-behaviour/workweek.ts`, `_shared/brief/deterministic-brief.ts`, `_shared/events/classify-event-v2.ts`, `_shared/events/event-subtypes.ts`, plus tests. Redeploy `compute-outer-readiness`, `generate-mastery-plan`, `smart-nudges`, `build-daily-context`.
- No UI changes; no schema changes (columns for persistence already exist on `calendar_events`).
- One-off backfill: re-resolve today's and the last 30 days' rows so persisted categories exist.
