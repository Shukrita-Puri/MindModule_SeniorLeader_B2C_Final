# Missing morning reminder, light-day classification, and a return rule for lapsed users

## First: today was NOT classified as a light day for her

Her run today recorded, verbatim:

```text
[availability] state=LIGHT_ROUTINE isRestDay=false reason=workday_light_routine country=GB
[light-day]    isLightDay=false kind=null lastDay=false meetings=3 prep=none
               reason=packed_day_meeting_count_gate
```

Two different labels are in play, and only the second one drives cadence:

- **Availability = LIGHT_ROUTINE.** This is the working-day *texture* label: a normal workday, not a rest day, not time off. It does not turn on light-day cadence on its own.
- **Light day = false.** The light-day rule is a hard gate: two or more timed meetings can never be a light day. She has three (12:30, 16:00, 18:00), so the gate fired with `packed_day_meeting_count_gate`.

So the morning-reminder gap has nothing to do with light-day logic. Her day went down the ordinary working-day path, and every reminder that actually shipped today, to other users, was a light-day one — which is why hers stands out as missing.

## Why her morning reminder never fired — prime suspect, not yet proven

Her morning reminder is anchored to her first meeting: 60–90 minutes before it, never before 08:00. With a 12:30 first meeting that puts the window at roughly 10:00–12:25 local — but a run only counts as "morning" while the local hour is under 12:00, and the window is also clamped against the meeting time. Her records show every 15-minute run today (08:45 through 11:45 local) produced zero qualified reminders, with nothing failing at delivery.

The records do not log the computed window, so the cause is not yet proven. Step 1 makes the engine record its own morning-window decision (window start, window end, local time, the meeting it anchored on, and the reason nothing qualified). Additive logging only — no rule change, nothing that can block a send. The next weekday run names the cause, and the fix follows: a late first meeting must never push the morning window past the morning cut-off, so a leader whose first meeting is at 12:30 still gets a morning reminder.

## New: a lapsed leader must be pulled back harder, not left quieter

She has not checked in since 10 September. Today the absence of a check-in only *unlocks* the ordinary morning reminder — it never raises priority, so on a day where the ordinary path fails she hears nothing at all for six days running.

Rule to add, on top of everything existing:

- Count days since the leader's last check-in (or last app open, whichever is later).
- **3+ days quiet** → the morning reminder is treated as first-touch priority: it wins the morning slot outright, and it is exempt from the two-hour spacing gate the same way the existing morning anchor already is.
- **7+ days quiet** → the day also guarantees an evening reminder if the morning one produced no send, so the day cannot end silent.
- The guaranteed last-resort text already exists, so a quiet-user reminder can never be dropped for lack of copy.
- Caps are respected: still at most one reminder per window and no more than the existing daily cap. This changes *priority and guarantee*, never volume beyond today's ceiling.
- The copy stays factual and uses what is real for that day (meeting count, named meeting, day shape). No "you've been away" shaming, no invented data.

## Light days: morning + evening, confirmed as intended

The light-day cadence already in the engine matches what we agreed and stays as-is: light days send **morning + evening** (cap 2); a high-stakes morning or evening commitment replaces that window's recovery send; a high-stakes afternoon commitment adds a third, anchored, afternoon send; the last day of a weekend/holiday/time-off run is excluded and keeps week-ahead behaviour. Nothing in this plan changes it. The quiet-user rule above applies to light days too, so a lapsed leader on a light day still gets both sends.

## Why her reminders carry no wearable / readiness / pattern context — confirmed

Three verified reasons for her account:

1. **Wearable data is six days stale.** Newest daily summary is dated 10 Sep and carries no HRV and no sleep values. Stale data is deliberately treated as absent, so those lines stay empty.
2. **No readiness score exists.** Today's and yesterday's readiness records read `awaiting` with both score fields empty.
3. **Her patterns don't match today's meetings.** Stored: Travel (resting heart rate +26%, 2 occurrences), Influence & Persuasion (+10%, 2), Deep Work & Strategy (heart-rate lift 26 bpm, 3). Today's three meetings resolve elsewhere. Separately, the richest store — the heart-rate-lift findings that hold the "26 bpm on this kind of meeting" numbers — is not read by the reminder context block at all.

Plus a delivery-path reason: the context block only reaches AI-written text; built-in text never carries it.

Additive fix: let the reminder context block also read the heart-rate-lift findings (the same ones Insights cites), matched on the meeting's own category. Offered context, never required — a reminder with no data sends exactly as it does today.

## Technical notes

- All work stays inside `supabase/functions/smart-nudges/index.ts` and its tests, deployed on its own.
- Item 1: add `resolveMorningAnchorWindow` output, `localTime`, anchor event id/hour and the `evaluateNudgeOne` null reason to the existing evaluator trace metadata.
- Quiet-user rule: derive `daysSinceLastCheckin` from the check-in rows already loaded onto the reminder context (plus last app-open from the notification engagement rows), and use it to set first-touch priority and the evening guarantee. No new table, no new notification type.
- Item on context: extend `buildImmediateContextBlock` to read `signal_summary.performance_lift.hr_event_lift` / `subcategory_lift` through the existing A–H resolver, same "only when the store holds it" guard, same silent-empty behaviour.
- No schema change, no frontend change, no existing copy rewritten. `deno check` clean, full smart-nudges suite green, plus new tests: a 12:30-first-meeting day yields a morning window inside the morning period; a 3-day-quiet and a 7-day-quiet leader both end the day with a send; caps still hold.
