# Wearable signal in "Your Most Effective Practices"

Two files: `src/components/insights/PracticeEffectiveness.tsx` (icon + confidence styling) and the `GET_PRACTICE_IMPACT` branch of `supabase/functions/content-feedback/index.ts` (signal rules). No layout or structural UI changes.

## What the user sees

- Every wearable signal is prefixed with a small heart icon (lucide `Heart`, `h-3 w-3`), inline before the percentage, in the same colour as the signal text. Nothing else in the row changes.
- The signal shown stays category-aware: Pause and Flow read as a calming direction, Energise reads as an activating direction, so a positive result always means "the practice did what it is meant to do".
- HR is always preferred; HRV is only used when HR windows cannot be resolved. A row shows wearable data whenever any tier has data.
- Signal confidence is legible from its colour: one session is faintest, two is dimmer, three or more is full emerald when the direction is positive.

## Engine changes (GET_PRACTICE_IMPACT only)

Current state verified in the function: the three HR windows (−15m / during / +15m) and the tier ordering (triple window → hour-of-day baseline → next-morning HRV) already exist. Gaps to close against the stated rules:

1. **Confound guard** — skip a session entirely when its `hrBefore` mean exceeds 100 bpm (user was active, not at rest). It contributes to neither the HR nor the baseline aggregate.
2. **Pause secondary** — add `secondarySignalPct = (meanHrBefore − meanHrAfter) / meanHrBefore × 100`, label `HR after` (tooltip/rollover only, not rendered in the row).
3. **Flow** — primary stays `HRV next AM` when the day/day+1 HRV pair exists, secondary `HR during`; when HRV is absent, primary falls back to `HR during` as today.
4. **Energise secondary label** — rename `HR recovered` to `HR recovery` to match the spec wording.
5. **Noise threshold** — return `wearableSignal: null` for a practice when the primary magnitude is below 3%, at every tier, so sub-noise readings are omitted rather than shown.
6. Percentages stay rounded to 1 decimal; `signalTier` and `timingSource` are unchanged.

## UI changes (PracticeEffectiveness.tsx)

- Import `Heart` from lucide-react and render it inside the existing wearable slot span, before the text.
- Replace the single `wearableEarly` check with three confidence buckets driven by `signal.n`: 1 → `text-muted-foreground/60`, 2 → `text-muted-foreground/80`, ≥3 → `text-emerald-700` when the direction is positive, otherwise `text-muted-foreground`.
- No changes to row layout, chips, thumbs slot, tier disclosures, or the "Before Your Hardest Days" section.

## Verification

- Typecheck plus the existing insights tests.
- Deploy `content-feedback`, then probe `GET_PRACTICE_IMPACT` for the live account and confirm: HR-tier rows win over HRV rows where HR windows exist, Pause/Flow signals read as drops, Energise reads as a rise, sessions with `hrBefore > 100` are excluded, and sub-3% signals return null.
- Re-check the card: heart icon on each wearable slot, confidence shading matching `n`.
