# Executive Home — End-to-End Verification Checklist

**Owner:** Sprint 12 (Phase 10 closeout). Use this before shipping any
change that touches MRS scoring, Brief generation, Plan generation, or
the delivery/history pipeline. This is a documented manual harness — a
fully-automated E2E would need to mint Auth0 sessions and seed
wearable/calendar/checkin data across many tables, which is out of
scope for Sprint 12.

Cross-reference: `EXECUTIVE_HOME_SSOT.md`, `MRS_V3_SPECIFICATION.md`,
`GENERATE_MASTERY_PLAN_SSOT.md`.

---

## 0. Pre-flight

Pick a test user (`$USER_ID` = Auth0 sub) and today's local date
(`$LOCAL_DATE`, ISO). Confirm they are onboarded and in your test env.

```sql
-- Confirm the test user exists and is subscribed / trialling.
SELECT id, email, subscription_status, trial_ends_at, home_timezone
FROM profiles WHERE id = '$USER_ID';
```

## 1. Trigger a full Executive Home build

Prefer the admin-triggered manual replay so we see the run row.

```bash
# Admin JWT required. Runs mode=manual_replay for one user.
curl -s -X POST \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -H "Content-Type: application/json" \
  https://<edge-host>/functions/v1/admin-jobs-summary \
  -d '{"action":"run_job","userId":"'$USER_ID'","window":"morning","localDate":"'$LOCAL_DATE'"}'
```

## 2. Verify the run row was recorded (order of operations)

```sql
SELECT
  run_id, window, status,
  mrs_status,      -- expect 'ready' | 'awaiting' | 'awaiting_no_score' | 'skipped'
  brief_status,    -- expect 'ready' | 'awaiting' | 'skipped'
  plan_status,     -- expect 'ready' | 'awaiting' | 'skipped_no_stage_one_signal' | 'error'
  skipped_reason, error, duration_ms, created_at
FROM executive_home_card_runs
WHERE user_id = '$USER_ID' AND local_date = '$LOCAL_DATE'
ORDER BY created_at DESC LIMIT 5;
```

**Contract:** MRS must resolve first, Brief second, Plan third. If
`mrs_status` is anything other than `ready` (e.g. `awaiting`,
`awaiting_no_score`) then `brief_status` must be `awaiting` and
`plan_status` must be `awaiting` or `skipped_no_stage_one_signal`.
Brief `brief_source='deterministic'` on `brief_snapshots` is only valid
when `brief_status='ready'` and the underlying signals are truly ready
— it must never rescue a true awaiting state.

## 3. Verify snapshot writes

```sql
SELECT window, refined_score, baseline_score, brief_source, driver, created_at
FROM brief_snapshots
WHERE user_id = '$USER_ID' AND local_date = '$LOCAL_DATE'
ORDER BY created_at DESC;

SELECT window, meta->>'restDay' AS rest_day,
       jsonb_array_length(horizon_modules) AS modules_count,
       created_at
FROM mastery_plan_snapshots
WHERE user_id = '$USER_ID' AND local_date = '$LOCAL_DATE'
ORDER BY created_at DESC;

SELECT window, wearable_coverage, checkin_coverage, calendar_signals_count,
       created_at
FROM daily_context_snapshot
WHERE user_id = '$USER_ID' AND local_date = '$LOCAL_DATE'
ORDER BY created_at DESC LIMIT 3;
```

## 4. Card readiness contracts

For each scenario below, run the build (§1) and inspect (§2, §3).

| Scenario | MRS | Brief | Plan | Expected UI |
|---|---|---|---|---|
| Calendar-only (no wearable, no checkin) | `awaiting` | `awaiting` (deterministic fallback NOT allowed) | `awaiting` (no ready Plan, no fake priorities) | Empty shell + check-in prompt |
| Check-in-only (no wearable pillar) | `awaiting` | `awaiting` | `awaiting` | Check-in cannot fabricate the wearable pillar |
| Wearable-backed (readiness + baseline present) | `ok` | `ok`/`deterministic` | `ok` | Full 3 priorities |
| Ready signals + LLM miss | `ok` | `deterministic` (`brief_source='deterministic'`) | `ok` | Full 3 priorities with deterministic body |
| Low/no-stakes calendar (only breaks / low-stakes) | `ok`/`awaiting` | as above | `ok` (no JIT event anchor) | No fake JIT event card |
| Rest day (`meta.restDay=true`, `horizon_modules=[]`) | `ok` | `ok` | `ok` | Rest-day panel, no numbered cards |

**Contract reminder (locked in Sprint 8):** The deterministic Brief
fallback is ONLY permitted when underlying readiness/signals are truly
ready and the LLM misses. It must NEVER rescue a true awaiting state.
Calendar-only and check-in-only users have no wearable pillar, so MRS
stays `awaiting`, Brief stays `awaiting` (no deterministic rescue), and
Plan stays `awaiting` — no fake priorities under any circumstance.

### Focused SQL checks per scenario

**Calendar-only must NOT produce a Plan:**

```sql
SELECT plan_status FROM executive_home_card_runs
WHERE user_id = '$USER_ID' AND local_date = '$LOCAL_DATE'
ORDER BY created_at DESC LIMIT 1;
-- expect: 'awaiting' or 'skipped', never 'ok'
```

**Deterministic Brief marker present when LLM missed:**

```sql
SELECT brief_source, driver
FROM brief_snapshots
WHERE user_id = '$USER_ID' AND local_date = '$LOCAL_DATE'
ORDER BY created_at DESC LIMIT 1;
-- deterministic path → brief_source='deterministic'
```

**Rest-day plan contract:**

```sql
SELECT
  meta->>'restDay'                     AS rest_day,
  meta->>'dayShape'                    AS day_shape,
  jsonb_array_length(horizon_modules)  AS modules
FROM mastery_plan_snapshots
WHERE user_id = '$USER_ID' AND local_date = '$LOCAL_DATE'
ORDER BY created_at DESC LIMIT 1;
-- rest_day='true' AND modules=0
```

## 5. Delivery tracking

Open Executive Home in the browser as `$USER_ID`. Each rendered card
should POST to `/functions/v1/executive-card-delivery`.

```sql
-- Confirm delivery event landed:
SELECT window, card_type, delivered_at
FROM brief_snapshots
WHERE user_id = '$USER_ID' AND local_date = '$LOCAL_DATE'
  AND delivered_at IS NOT NULL
ORDER BY delivered_at DESC;
```

Delivered-only history filter:

```bash
# brief-history scopes results to the JWT subject — the `userId` query
# param is IGNORED. Call it with the test user's own bearer token, not
# an admin token, and inspect `.briefs` (not `.rows`).
curl -s "https://<edge-host>/functions/v1/brief-history?delivered=1" \
  -H "Authorization: Bearer $USER_JWT" | jq '.briefs | length'
```

The count must equal `SELECT count(*) FROM brief_snapshots WHERE
delivered_at IS NOT NULL AND user_id = '$USER_ID'`. Undelivered rows
must never appear.

## 6. Log signatures to grep in Edge Function logs

Run `supabase functions logs <name>` (or the Logs tab) and grep:

- `[compute-outer-readiness][brief-fallback]` — deterministic path took over.
- `[generate-mastery-plan][slot-allocation-final]` — final slot list.
- `[generate-mastery-plan][ledger-evolution-context]` — ledger inputs.
- `[generate-mastery-plan][rest-day]` — rest-day branch selected.
- `[travel-state][consumer]` — a consumer read travel_state.
- `[travel-state-sync][auth-reject]` — auth guard rejected a caller.
- `[travel-state-sync][skip]` — skip-safe fail-open ran.

## 7. Travel-state consumer freshness (Sprint 11 SSOT)

Any consumer of `travel_state` MUST route through
`_shared/travel/freshness.ts::decideTravelFreshness`.
`meta.last_sync_at` = "checked", NEVER "fresh travel signal".
`updated_at` may be bumped by the skip-sync producer and is NOT proof
of freshness.

```bash
# One-liner scan: any suspicious consumer still reading updated_at
# as a freshness signal?
rg -n "travel_state[^)]*\.updated_at" supabase/functions
```

## 8. Rest-day UI manual pass (owed from Sprint 4)

1. Seed a rest-day snapshot for the test user:

```sql
INSERT INTO mastery_plan_snapshots
  (user_id, local_date, window, horizon_modules, meta, created_at)
VALUES
  ('$USER_ID', current_date, 'morning',
   '[]'::jsonb,
   jsonb_build_object('restDay', true, 'dayShape', 'rest_day'),
   now())
ON CONFLICT (user_id, local_date, window) DO UPDATE
SET horizon_modules = EXCLUDED.horizon_modules,
    meta = EXCLUDED.meta,
    created_at = now();
```

2. Log in as `$USER_ID`, open `/` (Executive Home).
3. Confirm:
   - Rest-day panel is visible.
   - Zero numbered priority cards.
   - No check-in prompt.
   - No JIT / calendar anchors.
   - No console remount loops (React DevTools → Profiler, or
     `console.log` in `TodayThreePriorities.tsx` should fire once).

If a real UI pass is not available, the seed SQL above + a screenshot
of the rest-day panel is acceptable evidence.

## 9. Admin cron visibility sanity check

`travel_state_sync` in the admin summary must now report an honest
status. Never `"idle"` when there is no run-log table.

```bash
curl -s "https://<edge-host>/functions/v1/admin-jobs-summary" \
  -H "Authorization: Bearer $ADMIN_JWT" \
  | jq '.jobs[] | select(.jobKey=="travel_state_sync")'
```

Expected shape:

```json
{
  "currentStatus": "observed_recently" | "stale_or_unknown" | "unknown" | "disabled",
  "runLogAvailable": false,
  "statusReason": "...",
  "lastObservedSyncAt": "…ISO… or null",
  "lastRunTime": null,
  "lastSuccessTime": null,
  "lastFailureTime": null
}
```

`runLogAvailable` must be `false` until a real
`travel_state_sync_runs` table exists.
