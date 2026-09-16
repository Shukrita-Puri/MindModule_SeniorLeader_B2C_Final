# Light day = stakes, not meeting count. Plus: lapsed users keep the full cadence

## Why today was classified as NOT a light day — and why that is wrong

Her run today recorded, verbatim:

```text
[availability] state=LIGHT_ROUTINE isRestDay=false reason=workday_light_routine country=GB
[light-day]    isLightDay=false meetings=3 reason=packed_day_meeting_count_gate
```

The light-day rule counts **timed meetings only** and hard-stops at two or more, regardless of what those meetings are. Her three (Future NEDs 12:30, Pitch Clinic 16:00, Chief UK In Transition 18:00) are all low-stakes educational sessions — informational load, nothing consequential — so the day should read as light. The count gate overrode that.

Consequence: her day went down the ordinary working-day path, her morning reminder was pinned to a window anchored 90 minutes before a 12:30 meeting, and nothing shipped all morning. On the light-day path she would have had a guaranteed morning and evening send.

## Change 1 — the light-day gate counts high-stakes meetings

In the shared light-day rule (`_shared/availability/light-day.ts`), replace the "2+ timed meetings is never light" gate with "2+ **high-stakes** timed meetings is never light":

- Stakes come from the single A–H event resolver already used everywhere — no new taxonomy, no title guessing in this file.
- Callers (reminders, plan, brief) already build the event array; they gain the resolved stakes/category per event, which they already resolve elsewhere in the same run.
- Everything else in the rule is untouched: travel days and all-day conferences still override; weekends, holidays and time off behave exactly as now; the last day of any off-run is still excluded and keeps week-ahead behaviour.
- Fail-safe: if stakes cannot be resolved for an event, it counts as high-stakes — i.e. the day falls back to today's behaviour rather than becoming light by accident.

Effect on her day: 0 high-stakes meetings → light day → guaranteed morning + evening.

## Change 2 — light day cadence is a blanket rule

Confirming and enforcing what we agreed, with no conditions attached:

- Every light day sends **morning and evening**. Always. It is habit formation, not information delivery.
- A high-stakes commitment in the morning or evening replaces that window's recovery send (still two). A high-stakes afternoon commitment adds an anchored afternoon send (three).
- One send per window; the daily ceiling is unchanged.
- The plan follows the same shape on a light day, as today.

## Change 3 — lapsed leaders get the same cadence, never less

She has not checked in since 10 September. Nothing in the engine treats that as a reason to send *more*, and several paths quietly send *less* when today's data is thin.

Rule: absence of a check-in never reduces or blocks a reminder. A leader who has been away receives exactly what they would receive if they had checked in — same slots, same guarantees.

- No tiers, no day-count thresholds, no separate win-back message type.
- Copy is built from whatever genuinely synced without the app being opened — calendar (Google/Outlook/Apple subscription feeds) syncs server-side, so meeting count, named meeting and day shape are always available.
- Data that only syncs when the app opens — Apple Health, and therefore heart-rate/sleep and the readiness score — is simply absent from the text. It is never a precondition for sending.
- The guaranteed last-resort text already exists behind every reminder, so a lapsed leader's day cannot end silent.

## Change 4 — the morning window must sit inside the morning

Her morning window was anchored 90 minutes before a 12:30 meeting (roughly 10:00–12:25 local) while a run only counts as "morning" below 12:00. Every 15-minute run today from 08:45 to 11:45 produced zero qualified reminders and nothing failed at delivery, so the window is the prime suspect — but the records don't log the computed window, so it isn't proven yet.

First step, additive only: record the morning-window decision (window start, window end, local time, the meeting it anchored on, and the reason nothing qualified). Then guarantee that the window always contains at least one usable slot inside the morning period, so a leader whose first meeting is at 12:30 still gets a morning reminder. The anchoring rule itself (60–90 minutes before the first meeting, never before 08:00) stays.

## Why her reminders carry no wearable / readiness / pattern context — confirmed

1. **Wearable data is six days stale** — newest daily summary dated 10 Sep, with no HRV and no sleep values. Stale data is treated as absent by design.
2. **No readiness score exists** — today's and yesterday's records read `awaiting`, both score fields empty.
3. **Her patterns don't match today's meetings** — stored: Travel (resting heart rate +26%, 2 occurrences), Influence & Persuasion (+10%, 2), Deep Work & Strategy (heart-rate lift 26 bpm, 3). Separately, that richest store — the heart-rate-lift findings Insights cites — is not read by the reminder context block at all.

Additive fix: let the reminder context block also read the heart-rate-lift findings, matched on the meeting's own category. Offered context, never required; with no data the text is exactly as today. Note the block only reaches AI-written copy — built-in text never carries it.

## Safety

- Change 1 touches a rule shared by reminders, plan and brief. It only ever moves days from "not light" to "light" for low-stakes days; no day that is light today stops being light. Verified by replaying real accounts before deploy.
- No schema change, no frontend change, no copy rewritten.
- `deno check` clean; existing light-day, plan, brief and reminder suites stay green.
- New tests: three low-stakes meetings → light day; two high-stakes meetings → not light; one high-stakes plus two low → light with an anchored window; unresolvable stakes → not light; a light day always yields morning + evening; a leader with no check-in for a week gets the same sends as one who checked in; a 12:30-first-meeting day has a morning window inside the morning period.
- Deploy order, each on its own: readiness/brief, plan, reminders — then read one live run per surface.
