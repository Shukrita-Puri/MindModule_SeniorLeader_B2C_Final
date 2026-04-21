

## Plan: Allow multiple per-window assessments/briefs/plans, suppress refresh-spam duplicates

### Intent (clarified)

A user can legitimately check in multiple times within one window (morning/afternoon/evening). Each genuine new assessment, each genuine new brief, and each genuine new plan should appear once in the sidebar. **Refreshes must NOT create new sidebar rows** — only a real state change (new check-in, new brief input signature, new plan composition) does.

### Current state (verified)

- **Assessments**: `daily_checkins` upserts on `(user_id, checkin_date, time_window)` → already 1 row per window (last write wins). The user's "evening at 17:52" overwrote any earlier evening row, so the sidebar already only sees one evening row. ✅ behaviour matches intent — no change needed beyond Issue 1's visibility fix from previous plan.
- **Briefs**: `brief_snapshots` is keyed on `(user_id, local_date, time_window, input_signature, prompt_version)`. A pure refresh produces the same `input_signature` → same snapshot row → same `briefId`. A genuine change (new check-in, new HRV, new event) produces a new signature → new snapshot. ✅ schema already correct.
- **Plans**: `generate-mastery-plan` caches by energy-state hash in sessionStorage; refresh reuses the cached plan. ✅ schema already correct.
- **Sidebar (`useRecentActivity`)**: already dedupes `brief_view` events by `metadata.brief_id`. ✅ correct.

### The actual remaining gap

The sidebar visibility fix and label clarity work from the previous plan **still needs to ship**. Nothing in the data model needs to change — the issue was purely how the sidebar fetches and renders.

### Files touched

| File | Change |
|---|---|
| `supabase/functions/daily-checkins/index.ts` | `GET_RECENT_CHECKINS` SELECT adds `time_window`, `created_at` |
| `src/hooks/useRecentActivity.ts` | Sort by `created_at` (fallback `checkin_date`); prepend `Morning · / Afternoon · / Evening ·` to assessment titles; raise merge cap from 10 → 15 |
| `supabase/functions/compute-outer-readiness/index.ts` | Reword `getCCModifier` deterministic labels: `"7-day low-energy streak"` / `"Treating chronic depletion as a one-off"` etc.; expand `LEXICON_PHYSIOLOGY` + `LEXICON_RESILIENCE` with `restoration, restore, recover, recovery, heart rate, pulse, sharpness, sharp, prepare, preparation, release` so valid LLM bodies stop being rejected |

### Behaviour after deploy

- One sidebar row per assessment per window — refreshes never create new rows. New check-ins within the same window replace the row in place (upsert).
- One sidebar row per unique brief snapshot — refreshes show no new entry; a real input change (new check-in or new event) shows exactly one new row.
- Plan rows: unchanged — already 1 per regeneration, sessionStorage cache prevents refresh-spam.
- Lean-on / Watch-for: when LLM falls back to deterministic, copy reads as a self-contained executive phrase (no more "Day 7 pattern"). Lexicon expansion keeps the LLM path winning more often.

### Verification

1. Refresh `/executive-home` 5×: sidebar `brief` rows count unchanged; assessment rows unchanged.
2. Submit a new evening assessment: existing evening row updates in place (no duplicate).
3. Trigger a real input change (new HRV sync or check-in edit): exactly one new brief row appears.
4. Force deterministic fallback: pill reads `LEAN ON 7-day low-energy streak · PATTERN`.
5. Edge logs: `attempt2_validation_body_no_lexicon_cluster` rejection rate drops to near zero on bodies that mention restoration/sharpness/preparation.

### Out of scope

- Any change to upsert keys or snapshot caching policy — already correct.
- Any change to plan caching — already correct.
- Cross-window dedupe (intentional: morning/afternoon/evening are distinct rows).

