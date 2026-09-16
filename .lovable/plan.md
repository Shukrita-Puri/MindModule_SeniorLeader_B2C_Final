# Why Shukrita got no morning reminder, and why reminders carry no wearable / readiness / pattern context

## What the data confirms

Her account: `google-oauth2|111878...691`, Europe/London, reminders all enabled, device tokens active (a silent background push at 03:45 UTC today was accepted).

Today (16 Sep, Wednesday) she has three meetings: 12:30, 16:00 and 18:00 local. Availability was classified `LIGHT_ROUTINE`, light-day cadence correctly OFF (`meetings=3`). No plan snapshot exists for today (the last one is 11 Sep), so the reminder engine used its legacy morning path. She has not checked in since 10 Sep, so nothing suppressed the morning reminder on those grounds.

Confirmed outcomes in her evaluation records today:
- 08:45 local: evaluated, nothing qualified.
- 09:00, 10:00, 11:45 local: evaluated; every 15-minute run for her produced zero qualified reminders.
- No morning reminder was written to the notification log; nothing failed at delivery. Every reminder that did ship today, to other users, was a light-day one.

## The morning window is the prime suspect — not yet proven

Her morning reminder time is anchored to her first meeting: 90 minutes before it, never before 08:00. With a 12:30 first meeting that puts her morning window at roughly 10:00–12:25 local. But the engine only treats a run as "morning" while the local hour is under 12:00, and the same window is also capped relative to the meeting time, so the usable overlap is narrow and depends on how the meeting's hour is read from her timezone.

That is consistent with both observations (nothing at 08:45 because the window had not opened; nothing later because the window closed or never opened as computed) — but the records do not currently log the computed window, so this is a strong hypothesis, not a confirmed cause. Her evaluation records carry no line saying "morning window 10:00–12:25, now 11:45".

Step 1 is therefore to make the engine record its own morning-window decision (window start, window end, local time, the meeting it anchored on, and the reason it returned nothing). That is additive logging only — no rule changes, nothing that can block a send. The next weekday run then names the cause outright, and the fix follows from it.

Expected fix once named: a late first meeting must not be able to push the morning window past the morning cut-off. The rule stays "anchor 60–90 minutes before the first meeting, never before 08:00", with a guarantee that the window always contains at least one usable slot inside the morning period, so a leader with a 12:30 first meeting still gets a morning reminder.

## Why no wearable, readiness or pattern context appears in her reminders — confirmed

Three separate reasons, all verified for her account:

1. **Her wearable data is six days stale.** The newest daily summary is 10 Sep (synced today, but dated 10 Sep), and it has no HRV or sleep values at all. The engine deliberately treats stale data as absent, so every heart-rate / sleep line is empty.
2. **Her readiness score does not exist.** Today's readiness record reads `awaiting` with both score fields empty — the same on 15 Sep. There is no score or state to name.
3. **Her patterns exist but do not match today's meetings.** Her stored patterns are: Travel (resting heart rate +26%, 2 occurrences), Influence & Persuasion (+10%, 2), and Deep Work & Strategy (heart-rate lift 26 bpm, 3). Today's meetings resolve to different categories, so nothing matches. Separately, the richest of those findings — the heart-rate-lift store that holds the "26 bpm on this kind of meeting" numbers — is not read by the reminder context block at all; only the two HRV/RHR lists are.

There is also a delivery-path reason: the context block only reaches the AI-written text. Every reminder shipped today was built-in text, which never carries it.

Proposed, additive: let the reminder context block also read the heart-rate-lift store (the same one Insights cites), matched on the meeting's own category rather than only the legacy buckets. It stays offered context, never required, so a reminder with no data still sends exactly as it does today.

## Technical notes

- Item 1 adds fields to the existing evaluator trace metadata in `supabase/functions/smart-nudges/index.ts` (`resolveMorningAnchorWindow` result, `localTime`, anchor event id/hour, and the null reason from `evaluateNudgeOne`). No gate changes in the same step.
- Item 2 extends `buildImmediateContextBlock` to read `signal_summary.performance_lift.hr_event_lift` / `subcategory_lift` via the existing A–H category resolver, with the same "only when the store holds it" guard and the same silent-empty behaviour.
- No schema change, no frontend change, no existing copy rewritten. `deno check` clean, full smart-nudges suite green, `smart-nudges` deployed on its own.
