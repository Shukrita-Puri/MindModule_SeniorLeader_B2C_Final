---
name: Smart Nudges v8 Framework
description: JIT-or-State anchoring, slot/anchor/signal comparator, V8 meaning-forward + qualified mind-prep CTA contract, unified pattern store reads. V8 evolves ONLY copy principles — cascade, suppression, frequency, slot priority, comparator, routing, deep-links, scheduling are unchanged.
type: feature
---
Every Smart Nudge MUST be either JIT-anchored (a specific calendar event from the user's morning plan / today / tomorrow) or STATE-anchored (a specific physiological, check-in, or plan-progress signal). If neither anchor is present, do not send.

**Slot priority (comparator step 1):** Morning > Evening > Afternoon. Mid-day generic lures are deprecated and gated behind `LEGACY_GENERIC_NUDGES_ENABLED = false`.

**Anchor priority (comparator step 2):** JIT outranks STATE.

**Signal strength (comparator step 3, descending):** pattern-cited JIT (3) > plain JIT (2) ≈ wearable-cited state (2) > generic state (1). Final tiebreaker: legacy `priority` ascending.

**Voice:** Trusted human Chief of Staff. CEO-friendly. Never mechanical: `decision posture`, `decision readiness`, `mental sharpness`, `performance state`, `reset trajectory`, `capacity`, `reserves`, `baseline` are forbidden.

**Copy contract V8 (`violatesCopyContractV8`)** — three principles:
1. **Lead with meaning, not the data point.** First sentence translates what the data MEANS for the user's day. Raw metrics (e.g. `HRV -22% today`) NEVER lead — they sit inside the meaning sentence. Enforced by `violatesMeaningSentence`.
2. **Title = state or moment. Body = context + one clear action.** Title names a moment a CEO recognises ("Recovery in progress", "Starting from where you are"). Body delivers the so-what plus a specific in-app action.
3. **CTA always ends at a specific app screen via a "log in / check in / open" verb — and the prep is always MENTAL.** This is a mental-performance system; unqualified `prep` is banned (a CEO reads it as "prep the deck"). Allowed verbs (verbatim end of body): `log in to prep your mind` (+ `tonight` variant), `log in to prep your state`, `log in to recalibrate your mind`, `check in to recalibrate`, `check in to set your intention`, `check in to set tomorrow`, `check in to close the day`, `check in to close the week`, `check in to land the weekend`, `open your insights` (pattern alerts only).

**Banned verbs** (in `FORBIDDEN_WORDS_V6`, AI cannot regress to them):
- Passive consumption: `your prep is ready`, `your plan is ready`, `your brief is ready`, `see your prep`, `see your plan`, `see your readiness`, `tap to prep`.
- Unqualified V7 prep verbs: `open the app to prep`, `check into the app to prep`, `go to the app to prep`, `prep now`, `open the app to prep tonight`, `open the app to prep with a cool-down`.

**Named context required.** Body MUST cite at least one real token: an event title from the user's plan, a numeric physiological signal with unit, a countable today-state (`5 meetings`, `3 priorities`), a check-in outcome word the user logged, or a minutes-until / clock time for a real event. Enforced by `requiresNamedContextToken`.

**Hard ceilings:** ≤22 words, ≤140 chars, no placeholder tokens, no forbidden words. (Ceilings raised from V7's 16/95 — meaning-forward bodies are longer than metric-led ones; gold-standard examples run 18–22 words.)

**Proactive prefix:** when the JIT anchor is on the user's morning plan, the body must lead with `From your morning Plan:` or `From your plan:` — that prefix IS the proactive lure.

**Pattern citation:** when `findEventPattern(ctx.pattern, eventTitle)` returns a hit, briefly cite it with human language ("HR ran high last time"). Never quote percent or n.

**A/B CTA buckets (`CTA_PHRASES`):** all four variants are V8 qualified mind-prep verbs (see `cta-ab-experiment.md`, experiment id `cta-action-verb-v2`). Routing/deep-link is unchanged on payload — verbs imply destination but the system still controls the route.

**Telemetry:** every V8 payload is stamped `architecture: 'cos-mind-v8-meaning-forward'` and `cta_experiment: 'cta-action-verb-v2'`. V5–V7 rows remain in `notification_log` with their original stamps and must not be pooled with V8.