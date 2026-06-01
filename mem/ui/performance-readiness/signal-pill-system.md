---
name: Signal Pill System v3
description: Pill tier rules, priority order, baseline/refined badge, and bracketed qualifier contract for the 3 executive pills on the Performance Readiness Brief.
type: design
---

Three pills: Decision Readiness (Cognitive), Physical Reserves (Physiology), Resilience Capacity. Rendered in `DecisionReadinessBrief.tsx` via `buildExecutivePills` + `ExecutivePillCapsule`.

Tier rule (MOMENT-ONLY): Today's value alone drives the pill tier. Bracketed qualifiers (`delta3d`, `vsDow`, `peakStreak`, `vsBaselinePct`) are **display-only** perspective and never re-tier.

Bracketed format: `value (qualifier)` — e.g. `HRV 48ms (-6% vs baseline)`, `Clarity: Lucid [score 4/5] (5-day peak)`. Source is `outerBrief.pillQualifiers` built by the shared aggregator (see `mem://architecture/signal-engine/checkin-pattern-aggregator`). Identical numbers must appear in Insights Performance Patterns.

Header badge: small muted `(Baseline)` / `(Refined)` next to the tier label — wrapped in parentheses so users do not confuse it with the tier word.

Hover/long-press: `PillTooltip` (HoverCard) lists contributors + qualifiers + one-line "why this tier".
