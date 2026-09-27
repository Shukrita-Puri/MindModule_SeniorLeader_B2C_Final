# Travel truth for notifications, and one shared "day profile"

## What actually happened (from your stored data)

| London time | What the system had | What it did |
|---|---|---|
| Sat 26, 08:30–14:00 | Calendar: "OHS- Open Day", location **Oxford, UK** (Google + Apple copies) | Calendar address was not used as travel evidence by notifications |
| Sat 26, 14:15 | Last phone location was an older at-home reading | Treated as a normal weekend |
| Sat 26, 14:16 | **First and only** phone location that day: Oxford, 80.9 km from home — correct, you were in Oxford | State became "arrived" / travel day |
| Sat 26, 18:00 | Travel day = true | Light Day ignored it and sent "First day off" weekend copy |
| Sun 27, 09:00 | No new phone location since Saturday 14:16; the Oxford reading was still under 24 h old | Sent "Travel today" — **wrong**, you were already home |
| Sun 27, 12:54 | Phone location at home | State cleared to not travelling at 13:36 (your 13:35 screenshot caught the last minute of "Returning") |

So there are three separate faults, not one:

1. **Travel lost to Light Day on Saturday.** Notifications compute travel correctly but never hand it to the Light Day check. The Brief has the same gap; the Plan does not.
2. **Travel was carried into Sunday.** One old away-reading kept Sunday marked as travel for up to 24 hours. Nothing confirmed you were still away.
3. **The hourly travel job cannot see where you are.** It only re-reads the last location the iPhone sent; it does not ask the phone. The iPhone only sends a location on a "significant move" or app open, which is why there was one reading on Saturday and none overnight. So "the job runs every hour" does not mean fresh location every hour.

The "En Route" you saw Saturday morning is not in the stored readings — the phone showed it, but that reading never reached the server. I'll confirm why in the fix (likely the app shows its local state before the upload finishes or fails).

## Changes

1. **Travel wins on every day of the week.** Notifications and Brief pass the travel verdict into the Light Day check, as the Plan already does. A weekend in Oxford gets travel copy.
2. **Calendar location counts, same day.** An event today with a physical address more than 50 km from home (like "Oxford, UK") marks the day as travel even before the phone reports in. Online events and addresses near home never do.
3. **No carry-over without proof.** Yesterday's away-reading alone cannot make today a travel day. Today counts as travel only with a location reading from today, a travel/away calendar entry covering today, or a multi-day trip whose end date includes today.
4. **Upload the "En Route" reading.** Find why the phone's morning state wasn't stored and make sure every reading the phone shows is sent to the server.

Not changing: the 50 km rule, A–H categories, pattern rules, caps, quiet hours, spacing, Week Ahead, Insights, JIT.

## Your design question: fewer ordered rules, and where an AI model belongs

You are right that a single ordered chain (Travel → Conference → packed → Light) is the root problem: one missing input and the wrong rule wins, and each surface re-runs the chain slightly differently.

**Recommended shape — facts first, then one day profile, then surfaces:**

```text
1. Collect facts (deterministic)     calendar, location, wearables, check-ins, holidays
2. Interpret ambiguous text (AI)     "First Flight Innovation Forum" is a forum, not a flight;
                                     "Open Day, Oxford" is an in-person visit away
3. Build ONE day profile (deterministic, stored once per day)
      travel: yes, in-person Oxford, source calendar+location
      load: light (1 meeting)
      weekend: first day
      high-stakes: none
4. Every surface reads the same profile   Plan, Brief, notifications, Insights
5. Learn from corrections              your fixes and outcomes improve step 2
```

Key difference: the day is a set of **facts that can all be true at once** (travel + weekend + light), not one winning label. Copy then picks the most important fact — travel beats light load — using one small, shared priority, computed in one place.

**Where AI should and should not be used**

- Use AI for: reading meaning from messy text — event titles, descriptions, attendee context, ambiguous locations. This is where fixed keyword lists fail today.
- Keep deterministic for: distances, counts, dates, time windows, caps, scores, readiness, pattern maths, and the final day profile. These must be exact, repeatable and cheap; an AI would give different answers on different runs.
- AI output is stored as a fact with a confidence, cached per event, and used only when the fixed rules are unsure — so cost stays low and results are repeatable.

I recommend we do the three travel fixes now, and design the day profile together as its own staged plan next, since it touches Plan, Brief, notifications and Insights.

## Verification

- Replay Saturday 26: travel copy, not "First day off".
- Replay Sunday 27 09:00 with no new reading: not a travel day.
- An online event with a far address: not travel. An in-person event in Oxford: travel.
- Existing travel, light-day and week-ahead tests unchanged.
- Deploy notifications first, then the Brief, checking each live before the next.
