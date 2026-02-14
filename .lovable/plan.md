

# Update Inner Readiness Labels and Tooltip

## Overview

Two changes: (1) Replace outcome-specific labels with pure tier-based labels driven by the final composite score, and (2) update the tooltip text to reference "Outer Readiness Brief" instead of "Theme for Today".

## Changes

### 1. Simplify `getStateLabel()` in `TodayStateCard.tsx`

Remove the outcome-specific branch entirely. The label is now determined solely by the `energyTier` (which comes from the composite score including check-in, C+C, wearable, and circadian):

| Tier | Label |
|---|---|
| depleted | Low Reserve |
| managing | Moderate Capacity |
| strong | Strong Readiness |
| peak | Peak Readiness |

This means a user who checks in as "focused" but has low Clarity+Confidence and low wearable (scoring 51) will see **"Moderate Capacity"** -- the label reflects the full composite truth, not just the check-in tap.

### 2. Update Tooltip in Both Components

Update MetricInfoModal description in `TodayStateCard.tsx` and `EnergyStateHeader.tsx` to use the exact provided text, with the final sentence referencing **"Outer Readiness Brief"**:

> Your Inner Readiness Score is a triangulated read of how resourced, clear, and confident you are before you engage with the demands of the day.
>
> It draws from three sources: your check-in - your felt state combined with your clarity and confidence in this moment; your internal readiness - how certain and grounded you feel in your judgment today; and your circadian context - the natural performance rhythm of the time of day and point in the week.
>
> If you have an Apple Watch connected, your HRV is added as a physiological signal - specifically how recovered your nervous system is relative to your own personal baseline. When your physiological data and your felt state diverge significantly, the score will surface that gap as an insight.
>
> This score does not measure how busy you are or what your calendar holds. That layer - how to deploy your current readiness against today's actual demands - lives in your Outer Readiness Brief

### Files Modified

- `src/components/home/TodayStateCard.tsx` -- simplify getStateLabel to tier-only + update tooltip
- `src/components/home/EnergyStateHeader.tsx` -- update tooltip only

No backend changes. No design changes. Text-only updates.

