---
name: Light Day cadence v2 (morning + evening)
description: Light days send two notifications (morning + evening recovery); a high-stakes commitment anchors its own window and adds an afternoon send only when the meeting is in the afternoon
type: feature
---

Light day (0–1 meeting, weekend, holiday, PTO/OOO — never the last day of a run):

- Baseline sends: **morning + evening** (cap 2), timed to the user's onboarding brief-timing choice.
- A high-stakes commitment:
  - morning meeting → replaces the morning recovery send (anchored), cap stays 2
  - evening meeting → replaces the evening recovery send (anchored), cap stays 2
  - afternoon meeting → **adds** an anchored afternoon send, cap 3
- One send per window: a slot already used today is skipped.
- Resolver: `resolveLightDaySends()` in `supabase/functions/smart-nudges/index.ts`.
- Plan arc on a light day with one real meeting: pre / during / post around that meeting (`light_day_single_commitment_debrief`); otherwise a recovery arc.
- Week-ahead behaviour is untouched: last day of a run never takes the light-day arc.
