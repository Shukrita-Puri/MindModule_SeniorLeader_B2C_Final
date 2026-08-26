# Drop HRV from Practice Effectiveness; decide the "effective" verdict

Two files: `supabase/functions/content-feedback/index.ts` (`GET_PRACTICE_IMPACT` only) and `src/components/insights/PracticeEffectiveness.tsx`. No layout changes.

## Verified current state

- `buildWearableSignal` has four paths: Tier 1 triple-window HR, Tier 2 `HR vs baseline`, Tier 3 `HRV vs baseline` (next-morning HRV vs 30-day median), plus a day-over-day `HRV next AM` path.
- Flow explicitly prefers HRV as primary (`primarySignalPct: hrvLiftPct ?? hrDropPct`), which is why your Flow rows read `-3.4% HRV vs baseline`.
- Row ordering is server-side `compositeScore` = readiness delta + thumbs boost + favourite multiplier. Wearable signal does **not** affect ranking today; it only affects tier bucketing client-side (`tierOf` counts `wearableSignal.n`).

## Part 1 — HRV removed entirely

- Delete the HRV tiers and the HRV-primary Flow branch. `wearableSignal` can only ever be HR-derived.
- Tiers become: Tier 1 triple-window HR (before / during / after), Tier 2 HR-during vs the user's own hour-of-day baseline. Nothing else.
- Single user-facing label for both tiers: `HR vs baseline` — Tier 1's baseline is the user's own pre-practice 15 minutes, Tier 2's is their hour-of-day norm. `signalTier` still distinguishes them in the payload for diagnostics.
- Direction stays category-aware, so a positive number always means "the practice did what it is meant to do":
  - Pause: HR drop during (secondary: HR after, tooltip only)
  - Flow: HR drop during (secondary: HR after)
  - Energise: HR rise during (secondary: HR recovery)
- Unchanged: `hrBefore` mean > 100 bpm confound guard, 3% noise floor, 1-decimal rounding, `n` always equal to the sessions that actually contributed, absent signal stays absent.
- `hrvNextSum` / `hrvBaseSum` accumulators and their queries are removed from this branch only; other actions in the function are untouched.

## Part 2 — Which signal decides "effective"

Recommendation, consistent with how the rest of the app treats success (check-ins and thumbs are the felt-state source of truth; wearables are corroboration):

**Thumbs decide, HR corroborates.** Ranking stays subjective-led — a practice the user says worked is effective, even if HR disagrees. HR is never used to demote a practice or to hide it.

- Ranking: unchanged `compositeScore` (thumbs + readiness delta). No wearable term added.
- Display: show the HR signal whenever it exists, including when it contradicts the thumbs. Never suppress a negative HR reading on a thumbs-up practice — that honesty is the point of the card.
- Agreement earns emphasis, not the verdict: when thumbs are positive **and** HR is positive with `n >= 3`, the HR text renders full emerald (as today). Disagreement renders neutral `text-muted-foreground`, so it reads as information rather than a failure.
- Confidence shading by `n` stays: 1 → `/60`, 2 → `/80`, ≥3 → emerald when positive, else neutral.

So: effective if the felt signal is positive; the physiological signal is always shown alongside, whichever way it points.

## UI changes

- Keep the ❤️ emoji already in place before the signal text (no lucide `Heart`).
- Remove any HRV-specific formatting branches in `formatWearableSignal`; the only label rendered is `HR vs baseline`.
- Emerald only when thumbs and HR agree, per above. No other row, chip, disclosure or "Before your hardest days" change.

## Verification

- Typecheck plus `src/components/insights/__tests__/insightsAuditFixes.test.ts` and the insights suite.
- Deploy `content-feedback`, probe `GET_PRACTICE_IMPACT` for the live account and confirm: no row returns an HRV label or `hrv_next_day` tier, Flow rows now read as HR drops, Energise as HR rise, sub-3% and >100 bpm sessions still excluded.
- Rows with no resolvable HR window show no wearable text at all (expected for several practices on this account today) — I will report which rows lose their badge rather than substituting anything.
