# Consolidate Mind Check-In onto Page 1 (Daily Check-In)

Isolated change to `/check-in` and `/check-in-detail`. Visual style, slider component, gradients, typography, and copy chrome all stay exactly as they are today. Only the **content** of Page 1 (sliders instead of icon buttons), the **DB columns** stored, and the **save flow** change. Page 2 is left unchanged in this iteration — body sliders will land in a follow-up.

---

## 1. Page 1 — `src/pages/DailyCheckIn.tsx` becomes "Mental Performance State Check"

Replace the current 5 vertical icon buttons (Overloaded / Drained / Scattered / Steady / Focused) with **4 sliders** rendered in the same glass card and same `Slider` component used today on Page 2 (so visuals are identical to the screenshot).

Eyebrow row inside the card (unchanged styling):
- Left: `Performance Readiness Assessment`
- Right: `Mental Performance State Check`

Sliders (top → bottom), all 1–5 step 1, reusing existing `variant` gradients so colour ramps stay neutral:

| # | Slider     | Variant (existing) | Min label | Mid labels                                 | Max label |
|---|------------|--------------------|-----------|--------------------------------------------|-----------|
| 1 | Clarity    | `clarity`          | Clouded   | Obscured, Neutral, Lucid                    | Crystal   |
| 2 | Emotion    | `confidence`*      | Reactive  | Unsettled, Balanced, Composed               | Open      |
| 3 | Pressure   | `sharpness`*       | Overloaded| Elevated, Manageable, Light                 | Spacious  |
| 4 | Regulation | `clarity`*         | Reactive  | Low, Holding, Strong                        | In Control|

\* Reusing existing variants so no new design tokens are introduced. (We can swap which variant goes with which slider during implementation if a different gradient reads more clearly — purely a visual tweak, no new colours.)

Inline CTA at the bottom of the card replaces the icon-tap auto-submit:
- Disabled until **all 4 sliders are touched** (mirrors Page 2's `allThreeTouched` pattern).
- Active label: **Continue to Today's Performance**.
- On Save → write all 4 levels + a derived `outcome` to `daily_checkins`, clear caches, navigate **straight to `/executive-home`** (skips Page 2 for this iteration since Page 2 still holds Sharpness/Clarity/Confidence and we don't want to double-prompt).

Removed from Page 1: the `outcomes` array, the radiogroup, `EngravedFill`, arrow-key handlers, and the auto-navigate-to-`/check-in-detail` flow.

Kept on Page 1: `TodayHero`, `TodayGreeting`, `TodayStepper current={1}`, `FirstSessionGuide`, sidebar layout, skip-to-home, all engagement tracking and cache-invalidation logic.

## 2. Page 2 — `src/pages/CheckInDetail.tsx` left as-is

No code changes this iteration. It still renders Sharpness/Clarity/Confidence but is no longer reached from Page 1 in normal flow. Body slider replacement comes in your follow-up brief. (Existing direct links / deep links keep working.)

## 3. DB — additive only

New nullable columns on `daily_checkins` (no drops, no NOT-NULL changes):

```
emotion_level      integer  CHECK (NULL OR 1..5)
pressure_level     integer  CHECK (NULL OR 1..5)
regulation_level   integer  CHECK (NULL OR 1..5)
```

`mental_sharpness_level`, `clarity_level`, `confidence_level`, `outcome`, `state_tags`, `energy_balance` all stay. Existing RLS policies cover the new columns automatically.

## 4. Outcome derivation (keeps `outcome` NOT NULL satisfied)

`outcome` stays NOT NULL so downstream brief / scoring / pattern code keeps working unchanged. We derive it client-side at save time from the 4 sliders so behaviour is identical to today's selection of one of: `overwhelmed | drained | scattered | steady | focused`.

Mapping (deterministic, used only to populate `outcome`):

```
avg = mean(clarity, emotion, pressure, regulation)   // 1..5
pressure==1 OR regulation==1            → overwhelmed
emotion<=2 AND pressure<=2              → drained
clarity<=2 AND emotion<=2               → scattered
avg >= 4 AND clarity>=4                 → focused
otherwise                                → steady
```

`state_tags` are still derived via the existing `mapCheckInToTags(outcome)` helper using the derived outcome, so the brief / energy state engine sees the same shape of input it sees today.

## 5. Save flow

`saveCheckin({ outcome: derivedOutcome, ... })` first (unchanged), then call the existing `daily-checkins` edge function action `UPDATE_CLARITY_CONFIDENCE` with three new optional fields (`emotion`, `pressure`, `regulation`) so all 4 slider values persist on the same row in one round-trip. Edge function gains pass-through writes for the new columns; existing fields stay intact for back-compat with Page 2.

## 6. Files touched

- `src/pages/DailyCheckIn.tsx` — replace icon list with 4 sliders + CTA + derived-outcome save.
- `src/utils/dailyCheckins.ts` — extend `CheckinData` type with 3 optional level fields (additive).
- `supabase/functions/daily-checkins/index.ts` — extend `UPDATE_CLARITY_CONFIDENCE` to accept `emotion / pressure / regulation` and write them when present (additive, fully back-compat).
- New migration — add 3 nullable integer columns + check constraints.

## 7. Explicitly NOT changed

- `CheckInDetail.tsx` (Page 2)
- Brief logic, scoring, energy state engine, mastery plan
- `outcome` enum values, NOT NULL constraint, `state_tags` mapping
- Slider component, gradients, typography, glass card styling, hero, greeting, stepper
- Any historical `daily_checkins` rows

## Out of scope (for the follow-up)

- Body sliders for Page 2 (awaiting your spec).
- Removing `outcome` / `mental_sharpness_level` / `confidence_level` columns (post-beta cleanup).
- Updating insights / brief surfaces to display the new emotion / pressure / regulation values directly.
