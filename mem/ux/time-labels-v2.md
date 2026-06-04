---
name: Eyebrow Time Labels v2 (4-bucket)
description: Client eyebrow uses 4 buckets (Morning / Afternoon / Evening / Early Hours); server time windows remain on the 3-bucket model.
type: design
---

## Rule
- `getTimeLabel()` in `src/components/home/timeLabel.ts` returns:
  - `Morning` for local hour 05–11
  - `Afternoon` for local hour 12–17
  - `Evening` for local hour 18–23
  - `Early Hours` for local hour 00–04
- The Brief and Today's Performance Priorities eyebrow consume this helper so the label matches user perception even in the post-midnight tail of the server's Evening window (18–04:59).

## Why
- Server time windows stay 3-bucket so check-ins / brief windows / scoring do not change. The user-facing eyebrow needs a distinct word for "Early Hours" — labelling 00:12 as "Evening" caused confusion ("Board Meeting still ahead" reading like the meeting is later tonight when it is in fact 9 hours away tomorrow morning).

## Companion
- Brief copy uses `relativeEventPhrase()` (`_shared/text/sanitise.ts`) to resolve event references like "in the morning (≈9h away)" / "later today" / "tomorrow afternoon". Never emit bare "still ahead" without the relative phrase.