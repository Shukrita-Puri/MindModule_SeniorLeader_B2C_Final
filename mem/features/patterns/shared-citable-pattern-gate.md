---
name: Shared Citable Pattern Gate (365-day)
description: One gate decides whether a pattern may be quoted in nudges, Plan or Brief — 3+ occurrences, includes latest occurrence, negative (nudges), same event type today/tomorrow
type: feature
---
`_shared/patterns/pattern-eligibility.ts` is the ONLY place that decides whether a pattern sentence may be quoted. Nudges, generate-mastery-plan and compute-outer-readiness (Brief) all call it; they may never re-implement it.

Rules (all must hold):
1. `n >= 3` real occurrences. Never round down, never write "last 3" unless n is 3.
2. Includes the user's latest occurrence of that key — `latestOccurrenceByKey` from `_shared/patterns/latest-occurrences.ts` (resolveEvent over the last 365 days of calendar_events). No cadence table, no staleness ceiling, no day limits.
3. Direction is harm. Nudges pass `allowPositive: false`; Brief/Plan pass `true`.
4. Timing: that event type occurs today or starts tomorrow. Travel (G) timing comes from the travel SSOT, never from a title.
5. Context: subtype key `${categoryId}:${subcategory}` or, for F and G only, the category key. No category fallback elsewhere.

Ranking: confidence → most recent → biggest effect; negative beats positive.

Source store: `causality_findings.signal_summary.subtype_patterns_365` (written by `cause-effect-engine/subtype-365-pass.ts`, additive, env-switchable, runs only after the 60-day save). Every other `signal_summary` read — cognition, consecutive_load, sleep_to_prs, performance_lift, signal pills, JIT scoring/selection/timing — stays on the existing 60-day data.

Nudge copy: pattern bodies carry `namedContextTitles` (pattern label + stored occurrence titles) into `v8Ctx` so the V8 named-context lint passes; the CTA verb is appended by the A/B rewriter. Missing data always skips quietly.
