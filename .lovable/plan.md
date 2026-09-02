# Launch-safe Smart Nudges truth and travel fix

## Goal

Make iOS Smart Nudges send one truthful notification in each morning, afternoon, and evening window on working and travel days. Gemini writes the preferred copy; a deterministic bank guarantees delivery when AI fails or data is temporarily missing. The Week Ahead invite occupies the evening slot, never a fourth notification.

## Confirmed audit findings

- Smart Nudges now reads `primary_calendar_events`, the unified Apple-first duplicate-collapsed feed. On 1 September the database contained one OHS event block from 10:00–15:00 London time (duplicated in Apple and Google, correctly collapsed to Apple), not two separate event rows.
- The 12:00 “morning state was low … is next” notification did not come from a low MRS/check-in. There was no 1 September check-in row. The ready-Plan afternoon projection routes every state fallback through `nudge_two_recalibrate`, whose AI prompt hardcodes “User started low” and “Next event,” even when the event is already underway.
- Morning meeting totals are simple event-row counts. They do not yet distinguish one multi-part full-day arc from separate meetings, and Smart Nudges does not apply the same load-bearing/FYI holiday filtering as the Brief/Plan load path.
- The “Travel → resting HR +23% … costing you” line came from an emerging historical finding. The generic pattern formatter accepts either RHR direction and appends “costing you” without a direction/confidence interpretation. Elevated RHR can be framed as higher physiological load; reduced RHR must never be framed as a cost. Weak/emerging samples must not make causal claims.
- Week Ahead already has shared triggers for home-country planning day, last PTO day, last applicable public holiday, and last long-weekend day, but dispatch currently bypasses the three-notification cap as a separate bucket.
- Oxford travel was not available to any feature: the last GPS fix was near home on 27 August, `travel_state` was `location_unknown`, location permission was `not_determined`, and there were no 1 September location pings. Additionally, the shared signal builder treats location-derived `awayFromHome` mainly as context, not as a positive travel trigger, so even a fresh same-timezone day trip can fail to become `travelDay`.
- Insights currently reads raw calendar rows and deduplicates in code; major counts are protected, but active-connection filtering and one canonical feed should be made explicit in the narrow calendar-consumer cleanup.

## Implementation

### 1. Create one Smart Nudge day-context contract

Build a pure, testable context projection inside the Smart Nudges/shared nudge layer that receives:

- unified deduplicated calendar events;
- event phase at send time: upcoming, underway, completed, or tomorrow;
- current-window MRS/check-in state with provenance;
- Availability SSOT result and locale weekend days;
- fresh location-derived travel state;
- canonical load shape and causality findings.

It will emit factual tokens only: meeting count, active full-day arc, next genuinely upcoming event, meetings remaining, readiness wording, travel state, day pillar, and missing-signal state. Both Gemini prompts and deterministic copy consume this same projection.

### 2. Guarantee morning, afternoon, and evening delivery

- Preserve one durable send per window and the overall three-send maximum.
- On working/travel days, always produce a candidate for the active unsent window.
- Keep truthful JIT/event/state/Plan anchors ahead of generic fallbacks.
- When calendar, HealthKit, readiness, or Plan data is absent/stale, send a specific “open the app to reconnect today’s signals” fallback rather than inventing state or silently skipping.
- Retain delivery safety: DND, disabled user preference, invalid/expired device token, and already-sent window remain legitimate suppressors. Two-hour suppression defers within the same window rather than deleting that window’s opportunity.
- Gemini remains the first copy path; deterministic copy is mandatory fallback. Handle AI 429/5xx with bounded backoff and treat terminal/configuration/credit errors as immediate deterministic fallback for the notification run.

### 3. Correct temporal and readiness language

- Remove all prompt assumptions that the user “started low.” State language may appear only when a real current-day check-in or current-window MRS tier supports it.
- Never translate a numeric score such as 86/100 into “low” through an unrelated check-in label.
- Select event wording by phase: “ahead/in X minutes,” “underway/until X,” “behind you,” or “tomorrow.” An underway OHS block at noon can never be called “next.”
- For an underway full-day block, use full-arc language and its remaining duration; do not count agenda sections hidden in description as separate meetings.
- Add a final deterministic and AI-output truth validator for event phase, count, named event, state provenance, and stale data before dispatch.

### 4. Correct metric polarity and pattern claims

- Introduce metric-specific interpretation: HRV up/down, RHR above/below personal baseline, sleep, and heart-rate load each get explicit favourable/unfavourable/neutral semantics.
- Require minimum sample/confidence gates before a pattern notification; label emerging associations as observations, never causes.
- Remove generic “costing you” language. Copy will state the measured association and direction without clinical diagnosis.
- Validate Gemini output against the underlying metric sign, sample count, and confidence; fall back deterministically on mismatch.

### 5. Put all seven day pillars through one selection matrix

Cover both Gemini and deterministic paths with precedence and expected cadence:

1. Travel day — morning orientation, afternoon transition/active-travel support, evening recovery/return framing.
2. Week Ahead — last weekend day (Sunday ROW, Saturday Gulf/Israel), last PTO/OOO day, last public holiday, and last long-weekend day.
3. Light day — protect useful space without calling it low demand when a long arc exists.
4. Holiday/rest day — Saturday/Sunday by locale plus applicable PTO/OOO/public holiday; reduced-touch policy only where explicitly intended.
5. Full-day arcs — conference, summit, training, external event, or meeting block; phase-aware throughout the day.
6. Load day — back-to-back meetings, short gaps, decision density, or context switching.
7. Mixed meeting day — factual count and transitions without forcing heavy/light language.

Week Ahead wins the eligible evening slot and uses the shared trigger reason; remove its current own-bucket fourth-send bypass. Update the stale Sunday-only contract documentation and tests.

### 6. Repair travel with strict cross-feature scope

Only change the shared travel relay and location liveness needed by Brief, Plan, Smart Nudges, and Insights:

- On iOS app resume/open, if location permission is already granted, restart monitoring and request one bounded fresh location fix; do not introduce a new surprise permission prompt.
- Check and log persistence failures instead of swallowing a failed ping.
- Apply the existing travel freshness policy to location state. A fresh, >50 km same-timezone `en_route`/`arrived` state becomes a positive `travelDay` signal even without a travel-titled calendar event.
- Carry that one fresh travel verdict into the existing shared context/snapshot consumed by Brief and Plan, the Smart Nudge context, and the executive/Insights day-type path. Do not alter scoring, MRS gating, Plan selection, Brief copy architecture, or historical Insights formulas.
- Keep stale/unknown location honest: never infer travel from an old fix. Missing permission/data drives the signal-refresh nudge, not fabricated travel copy.
- Add provenance telemetry (`gps_distance`, `timezone`, `calendar_title`, or `none`) and freshness timestamps so future misses are diagnosable.

### 7. Finish calendar parity without widening product scope

- Keep the unified `primary_calendar_events` feed as the read source for Smart Nudges, Brief, Plan, JIT, and active-day Insights consumers.
- Apply the existing load-bearing event filter before Smart Nudges computes meeting count/day type, excluding all-day FYI holiday markers and non-meeting personal blocks.
- Preserve Apple > Google > Microsoft only for true duplicate slots; never drop a provider wholesale.
- Change raw reads only where they affect these launch paths. Leave unrelated coach/content/admin calendar consumers for post-launch cleanup.

## Verification

- Unit matrix for all seven pillars across morning/afternoon/evening, ROW and Gulf/Israel weekends, Gemini acceptance and deterministic fallback.
- Regressions for: OHS underway at noon; 86/100 not called low; one five-hour block not called “next”; RHR +23% never rendered as improvement or causal “cost”; RHR decrease never rendered as harm; missing signals produce reconnect copy.
- Week Ahead tests for last PTO, OOO, public holiday, long weekend, Sunday ROW, Saturday Gulf/Israel, per-window dedupe, and absolute maximum of three pushes.
- Calendar fixtures spanning Apple/Google/Microsoft duplicate and unique events, FYI holidays, full-day arcs, and mixed meetings.
- Travel tests for Oxford-style >50 km/no timezone change, stale GPS, denied/unknown permission, same-day return, and no calendar travel title.
- Run Smart Nudges tests plus the affected shared travel/calendar tests, deploy only affected functions, execute a dry run for the affected user, then inspect notification payload/log provenance before enabling production delivery.

## Scope boundary

No UI redesign, no MRS formula/gating changes, no Plan recommendation changes, no Brief copy rewrite, and no Insights scoring redesign. Cross-feature edits are limited to fresh travel truth and unified calendar input plumbing required for the same facts to reach existing consumers.
