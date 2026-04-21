

## Plan: Historical Brief overlay + Sharpness fix

### Goal

When the user clicks a Brief item under "Recent" in the left sidebar, open the **selected day/window's brief** as a glass overlay on top of the live `/executive-home` page — visually consistent with the live brief card, dismissible from the top right. Also restore Mental Sharpness to assessment rows and clean up the tooltip.

---

### Part 1 — Historical Brief overlay (best option chosen)

Three options considered:

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| A. Dedicated `/brief/:id` route | Clean URL, deep-linkable | Loses the live home backdrop the user asked for | ✗ |
| B. **Glass overlay over `/executive-home`** | Matches user's described UX — same visual layer, hero + frame stay behind | Slightly more state plumbing | ✓ |
| C. Inline-replace today's brief with historical | Simple | Confusing — destroys the live "today" context | ✗ |

We use **Option B**. The historical brief renders as a frosted-glass card visually identical to the live `PerformanceReadinessBrief` (same eyebrow, score, tier, phrase, body, lean-on, watch-for layout), pulled directly from `brief_snapshots`. Pillar pills are not shown (they aren't reliably persisted in snapshots — the snapshot stores phrase/body/lean/watch/score/tier, which is the readable narrative the user is reviewing).

**UX behavior**

- Sidebar "Recent → Brief" row click → updates URL to `/executive-home?briefId=<uuid>` (uuid is more reliable than date because there can be multiple briefs per day across windows).
- ExecutiveHome reads `briefId` and mounts a `<HistoricalBriefOverlay briefId={...} />`.
- Overlay = full-viewport wash (`fixed inset-0 bg-background/40 backdrop-blur-md z-40`) with the historical brief card centered, scrollable on mobile.
- Top-right: minimal `×` close button → clears `briefId` query param → returns to live home.
- Top-left: existing `SidebarTrigger` remains visible/functional so the user can switch to another past brief without closing the overlay first.
- Eyebrow line reads `Performance Readiness Brief · Past · {Local date} · {Window}` so the user always knows they're looking at history, not today.
- No feedback row, no signal-pill expansion, no "act on this" CTAs — read-only.

**Data**

- New edge function action OR direct query: simplest is a small new edge function `brief-by-id` that takes `{ briefId }`, validates `user_id === auth.userId`, returns the snapshot row. (Mirrors `brief-history` pattern, keeps the historical fetch reusing the same auth guarantees as `brief-rating`.)
- New hook `useBriefSnapshot(briefId)` using React Query, key `['brief-snapshot', briefId]`, `staleTime: Infinity` (snapshots are immutable).

**New / changed files**

| File | Change |
|---|---|
| `supabase/functions/brief-by-id/index.ts` | NEW — `{briefId}` → returns one snapshot row scoped to caller |
| `src/hooks/useBriefSnapshot.ts` | NEW — fetch + cache by id |
| `src/components/home/HistoricalBriefOverlay.tsx` | NEW — glass overlay; renders eyebrow/score/tier/phrase/body/lean-on/watch-for; close `×` button |
| `src/pages/ExecutiveHome.tsx` | Read `briefId` from `useSearchParams`; render overlay when present |
| `src/components/navigation/RecentActivity.tsx` | Switch from `?briefDate=` to `?briefId=<uuid>`; requires brief id to be carried through `GET_ENGAGEMENTS` (already in `event.metadata` as `brief_id` if present, otherwise add a tiny enrichment) |
| `supabase/functions/user-events/index.ts` | Ensure `brief_view` engagement payloads include `brief_id` (read latest from `brief_snapshots` if missing) — small safety patch |

---

### Part 2 — Restore Mental Sharpness in the sidebar Assessment rows

**Root cause:** `daily-checkins/index.ts` `GET_RECENT_CHECKINS` selects only `id, checkin_date, outcome, energy_balance, clarity_level, confidence_level` — `mental_sharpness_level` is missing, so `RecentActivity.tsx` always renders without the Sharpness pill even though the column has data (verified in DB).

**Fix:** add `mental_sharpness_level` to the select. No client change needed (`useRecentActivity.ts` already reads `checkin.mental_sharpness_level`).

When the column is `null` for older check-ins (verified some pre-2026-04-19 rows lack it), the existing `levelIcon()` returns `''` and that pill is silently skipped — so older rows still render gracefully as `▲ Clarity, ● Confidence`.

---

### Part 3 — Sidebar tooltip cleanup

In `LeftSidebar.tsx`, the "Recent" tooltip currently shows:

```
Symbols
▲ High · ● Moderate · ▼ Low
Order: Clarity · Confidence · Mental Sharpness
```

Remove the "Order: ..." line entirely. Tooltip becomes:

```
Symbols
▲ High · ● Moderate · ▼ Low
```

---

### Verification

1. Click any "TODAY / SUNDAY / APR 18" Brief row → glass overlay opens with that brief's phrase + body + lean-on + watch-for + score, hero stays behind blurred.
2. Click `×` → URL drops `briefId`, overlay closes, live brief unchanged.
3. Open sidebar while overlay is open → can pick a different past brief without closing first.
4. Recent assessment rows now display Sharpness pill where the column has data (today's two rows: `▲ Clarity, ▲ Confidence, ▲ Sharpness`).
5. Hover the `i` icon next to "Recent" → tooltip shows only the symbol legend, no "Order: ..." line.

### Out of scope

- Pillar pills inside the historical view (snapshot doesn't store them; would require a second migration to persist `payload_json.executivePills`)
- Allowing rating/feedback on a past brief (read-only by design — feedback row stays only on the live brief)
- Deep-linking from outside the app (not needed; sidebar is the entry point)

