## Why the current insights read as nonsense

Two bugs in `supabase/functions/performance-rhythm-insights/index.ts`:

### Bug 1 — "Suns / Fris / Weds" (broken English)

Line 17: `const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]`

These are **already** the abbreviated forms. The copy templates then pluralise by appending `s`:
- `${DAYS[worst.di]}s slip on …`  → `"Suns slip on Sharpness."`
- `${DAYS[best.di]}s run strong on …; ${DAYS[worst.di]}s drop off.` → `"Weds run strong on Sharpness; Suns drop off."`
- `${run} ${DAYS[di]}s in a row …` → `"3 Suns in a row you've shown up drained."`
- `${DAYS[topCell.di]} ${TIME_LABELS[topCell.tw].toLowerCase()}s are your sharpest …` → `"Sun mornings are your sharpest …"`

**Fix:** add a separate `DAYS_FULL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]` array and use it in **all user-facing `text` and `longText` strings**. Keep `DAYS` only for internal/log keys.

### Bug 2 — All the substantiating data was stripped from `text`

When we tightened the copy in the last pass, we moved every number / sample size / comparison into `longText` (reserved for the future weekly email) and left `text` as bald assertions:

| Now (broken) | Should be |
|---|---|
| `"Suns slip on Sharpness."` | `"Sundays slip on Sharpness — sharp only 28% vs your 68% baseline (last 6 Sundays)."` |
| `"Weds run strong on Sharpness; Suns drop off."` | `"Wednesdays run sharpest at 82%; Sundays drop to 28% (n=11)."` |
| `"Mornings are your peak Energy window (72%)."` | ✅ already has the number — keep this shape as the template for all four |
| `"Sun mornings are your sharpest Sharpness window — protect it."` | `"Sunday mornings are your sharpest window — sharp 85% across 6 check-ins."` |
| `"3 Suns in a row you've shown up drained."` | `"3 Sundays in a row you've shown up drained — last on {date}."` |

For a Chief-of-Staff brief, every line must carry **% rate + n + comparison** so the user can trust and act on it. No numbers = horoscope.

---

## Changes (one file)

`supabase/functions/performance-rhythm-insights/index.ts`

1. **Add `DAYS_FULL`** alongside `DAYS` (line 17 area).
2. **Rewrite the 5 user-facing `text` templates** in `mineSeries` (lines ~745, 775, 785, 811, 840/856) to:
   - Use `DAYS_FULL[...]` (no more "Suns/Fris/Weds").
   - Embed the substantiating stat — pct, n, or vs-baseline — inline.
   - Stay ≤ ~140 chars (slightly looser than the previous 110 cap, which was too tight to carry the data).
3. **Update the consecutive-run template** to also include the most recent date in the run (we already have `sorted` in scope — pass the last point's `dateStr` into the finding and format it as `Mon DD`).
4. **Leave `longText` unchanged** — it already carries the verbose stats for the future weekly email.
5. **No UI changes needed** — `PerformanceRhythmCard.tsx` already renders `f.text` flat, with the dimension tag appended. The fix is purely in the strings the edge function emits.

### Proposed final templates

```ts
// peak-window (time of day)
text: `${TIME_LABELS[best.tw]}s are your peak ${vocab.appLabel} window — ${pctBest}% vs ${pctWorst}% in the ${TIME_LABELS[worst.tw].toLowerCase()} (n=${best.n+worst.n}).`

// low-day (recurring trough)
text: `${DAYS_FULL[worst.di]}s slip on ${vocab.appLabel} — ${pctWorst}% vs your ${pctBest}% on ${DAYS_FULL[best.di]}s (last ${worst.n} ${DAYS_FULL[worst.di]}s).`

// peak-day (paired headline)
text: `${DAYS_FULL[best.di]}s run sharpest on ${vocab.appLabel} (${pctBest}%); ${DAYS_FULL[worst.di]}s drop to ${pctWorst}% (n=${best.n+worst.n}).`

// cell-peak (DOW × ToD)
text: `${DAYS_FULL[topCell.di]} ${TIME_LABELS[topCell.tw].toLowerCase()}s are your sharpest ${vocab.appLabel} window — ${pctCell}% across ${topCell.n} check-ins. Protect it.`

// consecutive-neg (active risk)
text: `${run} ${DAYS_FULL[di]}s in a row you've shown up ${vocab.negativePhrase} on ${vocab.appLabel} — last on ${formatShortDate(lastDate)}.`

// consecutive-pos (streak)
text: `${run} ${DAYS_FULL[di]}s in a row you've shown up ${vocab.positivePhrase} on ${vocab.appLabel} — through ${formatShortDate(lastDate)}.`
```

Where `formatShortDate('2026-04-19')` → `'Apr 19'` (one tiny helper).

---

## Validation

1. Deploy `performance-rhythm-insights`.
2. `supabase--curl_edge_functions` against the function as the logged-in user; confirm `mindRhythmPatterns.topThree[*].text` strings:
   - Contain a full day name (regex `/\b(Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)days?\b/`).
   - Contain at least one digit (`%` or `n=` or a date).
3. Reload `/insights` on the preview; confirm the three bullets read like real Chief-of-Staff observations with numbers and full day names.
4. Spot-check `longText` is unchanged (weekly email contract preserved).

## Files to edit

- `supabase/functions/performance-rhythm-insights/index.ts` — add `DAYS_FULL`, add `formatShortDate`, thread `lastDate` into consecutive-run findings, rewrite the six `text` templates to embed stats.

No UI, no DB, no memory updates needed (the rendering rule "show `text`, append dimension tag" is unchanged — the contract just gets honoured properly).
