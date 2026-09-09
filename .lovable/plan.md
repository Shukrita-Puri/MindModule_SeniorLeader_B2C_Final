# Recalibrate Content Analytics (Admin only)

A new admin-only page showing how the Recalibrate library is actually being used: which protocols get used, when, by whom, what never gets touched, and where the catalogue has gaps.

Per your note: usage is **not** anonymised. Every per-user row shows the real account ID and email address so usage ties back to a named person. This page stays behind the existing admin sign-in and never appears in the user-facing app.

## Where it lives

- New page at `/admin/recalibrate`, with a "Recalibrate" link in the admin sidebar.
- Read-only. No edit, update or delete actions anywhere on the page.

## What the page shows

1. **Header stats** — total sessions, unique users, average sessions per user, average session length.
2. **Category mix** — Pause / Presence / Power-Up (plus soundbath and guided practice) as simple bars with counts and percentages.
3. **Protocol usage table** — top 20 protocols by sessions: title, category, sessions, unique users, repeat rate, peak time of day, peak day, and a warning badge when someone used it 5+ times in one day. Sortable by clicking headers; expandable to the full list.
4. **Low and zero traction** — protocols with 1–3 sessions in a table, and a pill list of protocols never used at all.
5. **Timing** — bars for time of day and day of week, plus a highlighted "peak usage window" callout.
6. **Power users** — accounts with 10+ sessions: **email and account ID**, sessions, unique protocols, per-category counts, active days, most-used protocol, loop days (amber when above zero), average daily intensity.
7. **Loop / crisis signals** — collapsed by default: same protocol used 3+ times in one day, showing date, **email and account ID**, protocol, count, category. Max 50 rows, with a short explanation that repeats suggest an unmet need.
8. **Content gaps** — an insight card with plain-language bullets and suggested actions (under-used mornings, category imbalance, looped protocols with no alternative, high Friday load).

Plus a "last refreshed" time and a Refresh button.

## Technical notes

- New edge function `admin-recalibrate-analytics`, guarded by the existing `_shared/admin-guard.ts` (same pattern as `admin-dashboard-summary`), accepting `?days=90` (default 90). Read-only queries only.
- Data sources: `sanctuary_events` joined to `sanctuary_content` (title, category, sub_type, content_type); `profiles` joined on `user_id` for `email` and `full_name`. Sections A–H computed server-side exactly as specified in the brief, with `userId` returned in full and an added `email` (and `name`) field on every per-user row (Sections F and G) — no last-8-chars truncation.
- Function writes an admin audit entry via `writeAdminAudit` on load, consistent with other admin functions, since it exposes identified user data.
- Frontend fetches with bearer token from `getAuthToken()` against `https://${projectId}.supabase.co/functions/v1/admin-recalibrate-analytics`, same as `AdminDashboard.tsx`. Cards, badges and tables from shadcn/ui; bar charts are plain div widths, no charting library.
- Route registered in `src/App.tsx` behind the existing admin route guard; nav item added in `src/components/admin/AdminLayout.tsx`.
- No changes to `sanctuary_events`, `sanctuary_content`, any existing edge function, or any user-facing route or component. No schema changes.
