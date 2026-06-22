## Where past briefs are stored (your question)

**Table:** `public.brief_snapshots` — the only durable record of a delivered brief.
**Writer:** `supabase/functions/compute-outer-readiness/index.ts`. It only writes when the upstream MRS gate in `compute-inner-readiness` / `compute-outer-readiness` passes (wearable + calendar must be present per `docs/MRS_V3_SPECIFICATION.md` and `PERFORMANCE_READINESS_BRIEF_LOGIC.md`). A self check-in alone never produces a `brief_snapshots` row.

**Today's bug:** the sidebar reads `user_engagements.brief_view` events instead, which fire whenever any brief-shaped card renders — including the calendar-only fallback that should not count as a "real" brief.

---

## Scope — RECENT section only, no UI changes

### Fix A — Past Brief: swap data source, keep UI identical

- The card row, icon, title style, click target, navigation (`/executive-home?briefId=…`), grouping (Today / Yesterday / …), and dedupe all stay exactly as they are now. Only the source query changes.
- Add a new action `GET_RECENT_BRIEFS` to the existing `supabase/functions/brief-snapshots/index.ts` returning the latest 10 rows for the auth user:
  - `id, local_date, time_window, created_at, refined_phrase, baseline_phrase` (RLS already scopes to owner).
- In `src/hooks/useRecentActivity.ts`:
  - Delete the `GET_ENGAGEMENTS / brief_view` block.
  - Call `brief-snapshots / GET_RECENT_BRIEFS` instead.
  - Map each row → existing `Activity` shape: `type: 'brief'`, `title: refined_phrase ?? baseline_phrase ?? 'Brief'` (same 30-char truncation rule already in place), `date: created_at`, `briefId: id`.
- Net effect: if no brief was ever generated (wearable missing, etc.), no Past Brief row shows — by construction, with zero UI change.

### Fix B — Assessment row: 4 MRS v3 dimensions in readable language, same row height

User feedback: `Clar / Emo / Pres / Reg` is unreadable. Keep the existing single-word style that already works for clarity (`Clear`), extend it across MRS v3 in a fixed order so the eye learns the position. Each dim renders as `<arrow> <word>` (arrow is `▲`/`●`/`▼` per current `levelIcon` rule):

| Dim         | Word used in row |
| ----------- | ---------------- |
| Clarity     | **Clear**        |
| Emotion     | **Steady**       |
| Pressure    | **Ease**         |
| Regulation  | **Poised**       |

Why these four:
- All ≤ 6 chars → with arrow + comma separators the row fits inside the current sidebar width (tested against the longest grouping: `▲ Clear, ▲ Steady, ▲ Ease, ▲ Poised` ≈ 36 chars, comfortably below the current row's truncation point — same character budget the legacy 3-word format used).
- Single fixed positive-direction word per dim (same convention as today's "Clear"). The arrow carries the direction, so users read it as "high clarity, low pressure-relief", etc. — matches how Insights labels read.
- Drops the leading "Outcome" word (`Focused,` / `Overwhelmed,` …) which was forcing truncation and also duplicates information already in the brief. Outcome can be revisited later; out of scope here.

Implementation:
- `supabase/functions/daily-checkins/index.ts → GET_RECENT_CHECKINS` select list: replace `confidence_level, mental_sharpness_level` with `emotion_level, pressure_level, regulation_level`. Keep `clarity_level, id, checkin_date, time_window, created_at`. Drop the now-unused `outcome, energy_balance`.
- `src/hooks/useRecentActivity.ts`: rebuild the title from the 4 fields in fixed order, skip dims that are `null` (partial check-ins), no outcome prefix, no truncation hack.
- No CSS / no `RecentActivity.tsx` markup change → row height, icon, font, spacing identical.

### Out of scope
- Brief generation gating in `compute-inner-readiness` / `compute-outer-readiness` (already correct, not touched).
- Past Brief overlay, Plan, MRS scoring, any other surface that reads `daily_checkins` or `user_engagements`.

---

## Verification
1. SQL sanity: `SELECT count(*) FROM brief_snapshots WHERE user_id = '<shukrita>' AND created_at > now() - interval '14 days'` should equal the number of "brief" rows visible in RECENT (capped at 5).
2. A test user with no wearable connected sees zero Past Brief rows in RECENT, even after self check-ins.
3. Most recent assessment row for `shukrita@mindmodule.me` renders as e.g. `▲ Clear, ● Steady, ▼ Ease, ▲ Poised`, with the row not wrapping or expanding the sidebar.

## Files touched
- `supabase/functions/brief-snapshots/index.ts` — add `GET_RECENT_BRIEFS` action.
- `supabase/functions/daily-checkins/index.ts` — adjust `GET_RECENT_CHECKINS` select list.
- `src/hooks/useRecentActivity.ts` — title composer + brief source swap.
