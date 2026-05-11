## Goal
Shorten the description text under each card on the Connected Data Sources page to ≤140 chars, rewritten as a user-benefit statement.

## Edits — `src/pages/ConnectedData.tsx`

Replace the three `description` strings (lines ~1014, 1030, 1068) with the user-approved copy:

- **Google Calendar**: "Get a daily brief and nudges tuned to your real meeting load, decision density, and high stakes events - so practices land when they matter."
- **Microsoft Outlook Calendar**: "Tune your brief and nudges to your Outlook meeting load, decision density and high pressure events - so practices land before high-stakes moments."
- **Apple Health**: "Share HRV, resting HR, sleep, and HR so your readiness reflects your real physiology."

Apple Calendar copy ("Tune your brief and nudges to your real meeting load, decision density, and high pressure events - so practices land before high-stakes moments.") will be wired in only if/when an Apple Calendar card exists in this file; current source has Google, Microsoft, and Apple Health only.

## Out of scope
No layout, component, icon, or behavior changes. Card titles and "Last synced / Needs attention" lines stay as-is.
