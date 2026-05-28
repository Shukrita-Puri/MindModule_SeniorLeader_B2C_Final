## 1. Share button — move inside each card, per toggle

**Problem:** Share currently sits in a footer strip in `InsightDetail.tsx`, outside the card. User wants it visually contained inside each card. Multi-tab capture is already supported (the ref captures whatever is rendered), but the ref needs to live inside each card so each toggle stays in frame.

**Change:**
- Delete the footer `ShareCardButton` strip and the `captureRef` wrapping in `src/pages/InsightDetail.tsx`. Header stays back-button only.
- Add an inline `ShareCardButton` inside each detail card component, anchored to the card's own DOM. Each card forwards an internal ref (the outer card container) that the button captures.
  - `LeadershipPatternsCard.tsx`
  - `PerformanceRhythmCard.tsx`
  - `PerformanceCausalityCard.tsx`
  - `PracticeEffectiveness.tsx` (wrapped card in InsightDetail moves into the component, or we add a small share row at the top of the existing card)
- Placement inside the card: top-right, **left of the existing `i` tooltip** (`right-10 top-2`-style positioning relative to the card), so it never overlaps the tooltip and always sits within the card's visual frame. Because the capture target is now the same DOM node that contains the share button, the share button is excluded from the captured PNG via a temporary `data-share-hide` class that `shareInsightCard` already (or will) hide during capture.
- Add a 1-line `hideSelectors` option to `src/utils/shareInsightCard.ts` so the share button (and any element marked `data-share-hide`) is hidden during `html-to-image` capture and restored after. This keeps the button visually in-card but absent from the share image.
- Toggle support: because the ref is the card root, switching tabs/segments inside a card (Causality stress/burnout, Rhythm dimension toggle, Practice category toggle, etc.) is already captured live — verify each card's toggle re-renders inside the same ref'd container.

## 2. Inner Readiness Dial — fill past-day dots Mon→today

`src/components/insights/InnerReadinessDial.tsx`

The fallback to averaged `daily_checkins` is wired but dots still show empty because:
- `inner_readiness_scores` rows can have `composite_score === null`, and the current code falls through to `tierFor(0, …)` → red instead of using the check-in fallback.
- Rows from `inner_readiness_scores` take precedence even when the check-in average is the better signal.

**Fix (mandatory):**
- Treat an `inner_readiness_scores` row as valid only when `composite_score` is a finite number; otherwise fall through to the check-in composite for that day.
- When multiple `inner_readiness_scores` rows exist on the same day, **average them** (already implemented — keep).
- When multiple `daily_checkins` rows exist on the same day, **average their composites** (already implemented via `checkinComposite` + per-day grouping — keep, verify).
- Final per-day tier resolution: `today → live outer.innerReadinessScore`; `past day → avg(inner_readiness_scores valid) ?? avg(daily_checkins composite) ?? null`.
- Add a quick console.debug behind `DEV_MODE` listing the resolved score+source per Mon→Sun day so we can confirm Mon/Tue/Wed populate.

No backend/edge-function changes.

## 3. Performance Streaks card — non-clickable

`src/components/insights/PerformanceStreaks.tsx`

- Replace the wrapping `<button onClick={navigate(...)}>` with a `<div>` (same classes, drop `active:scale`, `onClick`, `aria-label` → `role="group"`).
- Remove the navigation import.

## 4. Peak / Friction thumbs — cumulative monthly count

`src/utils/dimensionTiers.ts`

Current logic counts a **consecutive** streak ending today and breaks on the first miss, so a user with any off-day shows 0. User asked for a cumulative monthly trend that resets on the 1st (consistent with the earlier "cumulative till end of the month and then resets" rule).

**Change `computeDimensionStreaks`:**
- For each dimension, iterate every in-month day with at least one check-in for that dimension.
- **Peak count** = number of in-month days where ANY slot value ≥ 4.
- **Friction count** = number of in-month days where ANY slot value ≤ 2.
- Neutral days (only value 3) count toward neither.
- A single day can contribute to **both** peak and friction (e.g. morning 5, evening 2) — this matches how the flame chips read independently.
- Resets implicitly on the 1st because the query window is `startOfMonth(now)`.

Add a short JSDoc note flagging the semantic change from "consecutive streak" → "monthly cumulative count" so future readers don't mistake the function for the flame-card streak (which stays consecutive in `LevelTrendCalendar`).

Copy under the card stays `Performance Streak · This Month` but the footer line becomes: `Counts reset on the 1st. Peak = any slot at level 4–5. Friction = any slot at level 1–2.`

## 5. Audit / verification

- Load `/insights` in dev mode, confirm Mon→today dots fill (with the dev `console.debug` printout from §2).
- Open each detail card (`/insights/leadership-patterns`, `performance-rhythm`, `performance-causality`, `practice-effectiveness`), toggle every segmented control, hit Share, confirm the captured PNG matches the visible toggle and excludes the share icon.
- Tap the Performance Streaks card on the summary — confirm no navigation.
- Spot-check thumbs counts for the current month against `daily_checkins` rows via a quick `supabase--read_query` for DEV_USER to confirm count arithmetic.

## Files touched
- `src/pages/InsightDetail.tsx` (remove footer share + capture wrapper)
- `src/components/insights/ShareCardButton.tsx` (accept `hideOnCapture` flag, default true)
- `src/utils/shareInsightCard.ts` (hide `[data-share-hide]` nodes during capture)
- `src/components/insights/LeadershipPatternsCard.tsx`
- `src/components/insights/PerformanceRhythmCard.tsx`
- `src/components/insights/PerformanceCausalityCard.tsx`
- `src/components/insights/PracticeEffectiveness.tsx` (or its InsightDetail wrapper)
- `src/components/insights/InnerReadinessDial.tsx`
- `src/components/insights/PerformanceStreaks.tsx`
- `src/utils/dimensionTiers.ts`
