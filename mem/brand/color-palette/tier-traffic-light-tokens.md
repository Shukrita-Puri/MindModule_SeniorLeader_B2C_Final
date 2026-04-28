---
name: Tier Traffic-Light Palette
description: Score-tier color tokens (--tier-low/moderate/strong/neutral) distinct from saffron CTA
type: design
---
Readiness score TIER LABELS use traffic-light tokens in `src/index.css`:
- `--tier-strong` (#5a8159 sage) — strong / peak
- `--tier-moderate` (#b8843d muted amber, NOT saffron) — managing
- `--tier-low` (#d8553f coral-red) — depleted
- `--tier-neutral` (warm graphite) — fallback

Rules:
- Saffron (`--saffron`) is reserved for CTAs only. Never use saffron for tier/score colouring.
- Big score number stays neutral (`text-foreground`). Only the tier WORD and signal pills carry traffic-light color.
- Applied in TodayStateCard, DecisionReadinessBrief, HistoricalBriefOverlay.
