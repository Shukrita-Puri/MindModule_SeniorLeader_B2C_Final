---
name: Smart Nudges v7 Framework
description: JIT-or-State anchoring, slot/anchor/signal comparator, prep-CTA contract, unified pattern store reads
type: feature
---
Every Smart Nudge MUST be either JIT-anchored (a specific calendar event from the user's morning plan / today / tomorrow) or STATE-anchored (a specific physiological, check-in, or plan-progress signal). If neither anchor is present, do not send.

**Slot priority (comparator step 1):** Morning > Evening > Afternoon. Mid-day generic lures are deprecated and gated behind `LEGACY_GENERIC_NUDGES_ENABLED = false`.

**Anchor priority (comparator step 2):** JIT outranks STATE.

**Signal strength (comparator step 3, descending):** pattern-cited JIT (3) > plain JIT (2) ≈ wearable-cited state (2) > generic state (1). Final tiebreaker: legacy `priority` ascending.

**Voice:** Trusted human Chief of Staff. CEO-friendly. Never mechanical: `decision posture`, `decision readiness`, `mental sharpness`, `performance state`, `reset trajectory`, `capacity`, `reserves`, `baseline` are forbidden.

**Copy contract V7 (`violatesCopyContractV7`):** body MUST end (modulo trailing punctuation) with one of: `open the app to prep`, `check into the app to prep`, `go to the app to prep`, `prep now`, `open the app to prep tonight`, `open the app to prep with a cool-down`. Hard ceilings: ≤16 words, ≤95 chars, no placeholder tokens, no forbidden words. (16-word allowance accommodates the JIT prefix and cool-down CTA; 95-char ceiling keeps the push to one line.)

**Proactive prefix:** when the JIT anchor is on the user's morning plan, the body must lead with `From your morning Plan:` or `From your plan:` — that prefix IS the proactive lure.

**Pattern citation:** when `findEventPattern(ctx.pattern, eventTitle)` returns a hit, briefly cite it with human language ("HR ran high last time"). Never quote percent or n.

**A/B CTA buckets (`CTA_PHRASES`):** all four variants are "prep" forms. Routing/deep-link is unchanged on payload — vocabulary stays in app language.

**Telemetry:** every payload is stamped `architecture: 'cos-mind-v7-jit-or-state'`.