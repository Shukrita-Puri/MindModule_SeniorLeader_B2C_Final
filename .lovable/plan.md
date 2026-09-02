# Launch-safe Smart Nudges truth + travel fix

One truthful notification per morning, afternoon and evening window. Gemini writes the preferred copy; a deterministic bank guarantees delivery. Week Ahead takes the evening slot instead of being a fourth push.

Point 5 (the seven-pillar selection matrix) is deferred to a separate pass, as requested. Nothing in this plan changes pillar precedence or cadence.

## What the code confirms today

- Smart Nudges already reads the unified `primary_calendar_events` feed (4 queries in `buildNudgeContext`), but meeting count is a plain row count after a title-based noise filter — no load-bearing / FYI-holiday filter, no full-day-arc collapse, and the `light/moderate/heavy` day type is a raw count threshold.
- The `nudge_two_recalibrate` prompt literally opens with "User started low; heavy afternoon ahead" and requires the model to name the event as "next", regardless of check-in presence or event phase. Its deterministic twin hardcodes "You started low. Recalibrate before <event>."
- Pattern copy appends "See what it is costing you" for every branch, and one branch fires on `rhrElevated` alone with no direction interpretation; `emerging` confidence only lowers priority, it does not soften the claim.
- Week Ahead dispatches in its own bucket **before** the daily cap, 2-hour suppression and slot cap, with a comment stating it bypasses them.
- `persist-travel-location` never checks the result of the ping insert or the `travel_state` upsert — a failed write is silent.
- `travelDay` in both Brief (`compute-outer-readiness`) and Plan (`generate-mastery-plan`) is derived from a timezone difference or a travel-titled event. A fresh >50 km same-timezone day trip cannot become a travel day. `travel_state` freshness rules already exist in `_shared/travel/freshness.ts` but only gate `awayFromHome`-style context.

## Work

### 1. One Smart Nudge day-context projection

New pure module in the shared nudge layer, consumed identically by the Gemini prompts and the deterministic bank. It takes deduplicated events, send-time clock, readiness state with provenance, availability result, travel verdict, load shape and causality findings, and emits factual tokens only:

- meeting count (load-bearing only), active full-day arc and its remaining duration, next genuinely upcoming event, meetings remaining, event phase per event (`upcoming` / `underway` / `completed` / `tomorrow`);
- readiness wording plus provenance (`checkin_today`, `mrs_current_window`, `none`);
- travel state with source, day pillar label, and an explicit missing-signal state.

`buildNudgeContext` populates it once; no evaluator recomputes calendar facts locally.

### 2. Guaranteed morning / afternoon / evening delivery

- Keep one durable send per window and the three-send daily maximum.
- Always produce a candidate for the active unsent window on working and travel days; truthful JIT / event / state / Plan anchors stay ahead of generic fallbacks.
- Absent or stale calendar, HealthKit, readiness or Plan data produces a specific "open the app to reconnect today's signals" nudge instead of invented state or silence.
- DND, disabled preference, invalid token and already-sent-this-window remain valid suppressors. The 2-hour rule defers inside the window rather than consuming it.
- Gemini first, deterministic bank mandatory on failure: bounded backoff for 429/5xx; credit, configuration and terminal errors switch the whole run to deterministic immediately.

### 3. Temporal and readiness truth

- Delete "User started low" from the `nudge_two_recalibrate` prompt and its deterministic twin. State language is emitted only when a real current-day check-in or current-window MRS tier backs it, and a numeric score is never relabelled "low" via an unrelated check-in field.
- Event wording is chosen by phase: "ahead / in X minutes", "underway / until X", "behind you", "tomorrow". An underway block is never "next".
- A full-day arc uses arc language and remaining duration; agenda sections inside a description are not separate meetings.
- A pre-dispatch validator checks both deterministic and Gemini output for event phase, meeting count, named event, state provenance and staleness; a mismatch falls back deterministically.

### 4. Metric polarity and pattern claims (severity: high)

An elevated RHR genuinely is a load on the body, so the observed "+23%" line was directionally right by accident — the formatter appends "costing you" to every branch, so the same code would render "RHR down 23% — costing you", which is clinically wrong and would mislead. The fix is a polarity lookup applied before copy selection, not a rewording of one string.

| Metric | Direction | Framing |
| --- | --- | --- |
| RHR | above personal baseline | load / cost language permitted |
| RHR | below personal baseline | recovery / benefit — never cost |
| HRV | higher | recovery / benefit |
| HRV | lower | load / depletion |
| Sleep score | higher | recovery |
| Sleep score | lower | depletion |
| Heart-rate load | higher | load |

- Polarity is resolved from the metric and the sign relative to the user's own baseline, then handed to copy as a `favourable` / `unfavourable` / `neutral` token. Copy states the measured association and direction; the generic "costing you" suffix is deleted.
- Minimum sample and confidence gates before any pattern nudge. Below the gate (n < 3 or confidence under the emerging threshold) the association is worded as an observation, never a cause.
- Gemini output is validated against the metric sign, sample count and confidence, and a mismatch falls back deterministically.

### 4b. LLM path vs deterministic path parity

Both paths must satisfy the same contract, so each item below is implemented once in the shared projection or validator and consumed by both.

LLM path: remove the hardcoded "User started low"; validate event phase, state provenance, RHR direction and pattern sample count before dispatch; add bounded backoff for 429/5xx. Gemini is currently a **single attempt** with immediate fallback to the static bank, so backoff is new work — credit, configuration and terminal errors keep going straight to deterministic.

Deterministic path: all-window candidate guarantee, event-phase selection, state-provenance check, the polarity table, specific reconnect copy in place of the generic fallback, and the load-bearing / FYI-holiday filter before meeting count.

Shared copy rules: the Chief-of-Staff persona is already imported from `_shared/copy-vocabulary.ts` and used in the system prompt, and the no-fabricated-values validator already exists; still to enforce are the long-em-dash ban, the two-beat context + CTA structure in the deterministic bank, and "any measured signal" rather than HRV-only anchoring.

Delivery windows: APNs already ships a per-intent `apns-expiration`, and the evening path uses a period-scoped TTL, but other intents fall back to a fixed six-hour TTL — so a morning push queued on an offline phone can still display in the afternoon. Make TTL uniformly end-of-window for every window.


### 5. Travel repair (shared, narrow)

- On iOS resume with permission already granted, restart monitoring and take one bounded fresh fix. No new permission prompt.
- `persist-travel-location` checks and logs both writes instead of swallowing failures.
- Apply the existing freshness policy to location state, and make a fresh, >50 km, same-timezone `en_route` / `arrived` state a positive `travelDay` signal even without a travel-titled event.
- Carry that single verdict into the shared context consumed by Brief and Plan, the nudge context, and the executive/Insights day-type path. No change to scoring, MRS gating, Plan selection, Brief copy architecture or Insights formulas.
- Stale or unknown location stays honest: never infer travel from an old fix; missing permission drives the reconnect nudge.
- Add provenance telemetry (`gps_distance`, `timezone`, `calendar_title`, `none`) plus freshness timestamps.

### 6. Week Ahead into the evening slot

Week Ahead stops dispatching in its own pre-cap bucket. It competes for — and wins — the eligible evening slot using the existing shared trigger reason, so the absolute maximum stays three pushes. Update the stale Sunday-only contract doc and its tests.

### 7. Calendar parity without scope creep

- `primary_calendar_events` stays the read source for Smart Nudges, Brief, Plan, JIT and active-day Insights consumers.
- Apply the existing load-bearing filter before meeting count and day type, excluding all-day FYI holiday markers and non-meeting personal blocks.
- Apple > Google > Microsoft only for true duplicate slots; never drop a provider wholesale.
- Only launch-path raw reads change; coach / content / admin consumers are left for post-launch.

## Verification

- Unit matrix across morning / afternoon / evening for Gemini acceptance and deterministic fallback.
- Regressions: OHS block underway at noon; 86/100 never called low; a single five-hour block never called "next"; RHR +23% never rendered as improvement or as a causal cost; an RHR decrease never rendered as harm; missing signals produce reconnect copy.
- Week Ahead: last PTO day, OOO, public holiday, long weekend, Sunday (ROW), Saturday (Gulf/Israel), per-window dedupe, hard cap of three.
- Calendar fixtures: Apple/Google/Microsoft duplicates and uniques, FYI holidays, full-day arcs, mixed meeting days.
- Travel: Oxford-style >50 km with no timezone change, stale GPS, denied/unknown permission, same-day return, no travel title on the calendar.
- Run the Smart Nudges Deno tests plus affected shared travel/calendar tests, deploy only affected functions, dry-run the affected user, and inspect payload and log provenance before enabling production delivery.

## Out of scope

No UI redesign, no MRS formula or gating change, no Plan recommendation change, no Brief copy rewrite, no Insights scoring redesign. Cross-feature edits are limited to fresh travel truth and unified calendar plumbing.
