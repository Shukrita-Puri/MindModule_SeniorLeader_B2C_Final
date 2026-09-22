# Why the iPhone and the web disagree — and what to fix

## What the live data actually says (today, Shukrita's account)

The backend, not the iPhone, is the problem. For this morning the stored records say:

- **Readiness: awaiting.** All three signals are recorded as "missing" — no fresh wearable reading. Her watch data has written **only heart rate** since 20 September: no HRV, no sleep at all. Without those, readiness can never form.
- **Brief: published anyway.** A full morning brief was written at 06:31 and delivered, even though readiness was awaiting. Its text calls the 10:30 meeting a "strategy session" and then, in the same paragraph, "the catch up" — because the meeting *Shukrita x Melanie catch up* was filed as focus/strategy work instead of a one-to-one.
- **Plan: published, but generic.** Today's plan is labelled a **conference day** while the day shape says **light day**, and all three slots fall back to placeholder copy — one mentions "high-demand days", one "light days", one "heavy days". Nothing was anchored to a real meeting.
- **Duplicate meetings.** Every meeting exists twice (Google copy and Apple copy). Only the Apple copy gets categorised; the Google copy stays uncategorised, so the day shape says "1 further event could not be categorised and was excluded".
- **Notifications: none since 17 September.** The reminder job ran every 15 minutes and shipped reminders to other people; she qualified on none of them. Nothing failed at delivery — she was simply never selected.

So the web screen you sent is showing the truth (awaiting), and the iPhone is showing cards that the backend no longer considers formed — the App Store build carries a frozen, older version of the rule that decides when a card is allowed to show, and it never re-checks. Confirming the device build against the current rule is the first step.

## What to change

1. **Get HRV and sleep flowing again from the watch.** Find why only heart rate is being written and restore HRV and sleep. This single gap is what keeps readiness stuck on "awaiting" and strips every reminder and brief of real physiology.

2. **One rule for whether a card may show, applied everywhere.** The brief and plan must not publish finished content for a window where readiness is awaiting, and the iPhone must apply the same rule as the web rather than its own older copy of it. Either all three form together, or all three say awaiting — no mixed state again.

3. **Stop mislabelling meetings.** A "catch up" is a one-to-one, not a strategy session. Correct that mapping in the single place meeting types are decided, and make the brief describe a meeting only by its own title — never by an invented meeting type.

4. **Collapse duplicate meetings before anything reads them.** One meeting should count once, keeping the categorised copy, so nothing is silently "excluded" and the day shape counts correctly.

5. **Make the plan match the day.** The day label must come from the same stored day shape the rest of the app uses, so a light day can never be labelled a conference day. When no meeting-anchored slot exists, the three fallback slots must read consistently for *that* day instead of mixing light, heavy and high-demand language.

6. **Find out why she qualifies for no reminders.** Record the per-person reason each run, read it for her account, then fix the cause. Light days must still produce a morning and an evening reminder, as agreed.

## Verify before finishing

On her real account, iPhone first then web: readiness forms with HRV and sleep present; the three cards agree on both platforms; the 10:30 meeting is described as a catch-up; the plan's day label matches the light-day shape; and one morning reminder ships to her phone naming a meeting that still exists.

## Technical notes

- **Wearable:** `wearable_data` rows since 2026-09-20 carry `heart_rate` only (`hrv`, `total_sleep_minutes`, `sleep_score`, `resting_heart_rate` all null, source `apple-healthkit`). Trace the HealthKit read/normalise path (`ios/App/App/HealthKit/*`, `wearable-status-update`) and the sample types requested; confirm authorisation for HRV + sleep categories. All three pills carry `hiddenReason: "no_fresh_wearable"`, `isScoreBearing: false`, so `isMrsVisible`/`isRenderable` is false by design.
- **Card gating:** `executive_home_card_runs` shows `mrs_status: awaiting` with `brief_status: ready` for 21–22 Sep; `mastery_plan_snapshots` holds `status: ready` for 2026-09-22 while the same run recorded `plan_status: awaiting`. Align `build-executive-home-cards` so brief/plan publish only with a formed MRS, and confirm the shipped iOS bundle includes the `hasFreshScoreBearingSignal` gate in `useMrsSnapshot.ts` (Capacitor has no `server.url`, so the device runs build-time JS).
- **Taxonomy:** `calendar_events` for 2026-09-22 09:30Z resolves to `E` / `routine_sync` via `plan_resolver`; catch-up titles belong to the relational branch (`rhy.catchup` alias handling in `_shared/events/resolve-event-category.ts`). Google-provider duplicates have `event_category` null — dedupe by `identity_key`/time before load-shape and plan reads.
- **Plan:** `day_kind: conference_day` vs `load_shape.shapeId: light`; every priority carries `allocationReason: state_fallback_no_meaningful_jit`, `candidateCount: 0`. Derive `day_kind` from the stored `load_shape` and make the state-fallback why-lines day-consistent.
- **Nudges:** `notification_evaluator_runs` 21–22 Sep ran normally (7 then 4 shipped app-wide); her last non-silent `notification_log` row is 2026-09-17. Add per-user skip-reason logging in `smart-nudges` and read one live run before changing gates.
- Each backend function deployed on its own; no schema change required beyond what logging needs; no UI redesign.
