

# Add Score & Friction Explainers to Performance Patterns

## Problem
1. Users don't understand how the dimension scores (Recalibration, Clarity, Renewal) are calculated
2. "Sustained friction" (and other friction labels) are unexplained jargon

## Approach
Use the existing `InsightInfoModal` (ⓘ tap-to-reveal) pattern — minimal cognitive load, no proprietary details exposed.

### Changes — `src/components/insights/LeadershipPatternsCard.tsx`

**1. Add ⓘ next to "Your Dimensions" section header**
- Explanation text: *"These three scores reflect how you show up over time — drawn from your check-ins, coach conversations, and practice data. Each dimension is scored 0–100. Your baseline was set during onboarding; the current score updates as you check in."*
- This tells users *what feeds the scores* without revealing weights or formulas.

**2. Add ⓘ next to "Friction" label (line 342)**
- Explanation text: *"Friction measures how often you report low-energy states like feeling drained, overwhelmed, or scattered. It's shown as a percentage of your check-ins over 30 days. Labels range from 'Low friction' (≤25%) to 'Sustained friction' (>75%), helping you see whether difficult states are occasional or persistent."*
- This explains all four labels in one sentence without exposing the scoring engine.

### Implementation Detail
- Import `InsightInfoModal` (already imported)
- Wrap the "Your Dimensions" label and the "Friction" label each in a flex row with `InsightInfoModal` inline
- No new components needed — reuses the existing blur-backdrop modal pattern

