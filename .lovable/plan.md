# 24x7 Continuous Tracking Audit (v2 — Expanded)

Read-only audit. No code changes. Proves the platform is **actually** tracking calendars + wearables continuously, with correct data, healthy recovery, and accurate connection-state semantics.

## Scope (5 sources, none excluded)

**Calendars:** Google Calendar · Microsoft Outlook · Apple iOS Calendar
**Wearables:** Apple Watch (HealthKit) · Oura Ring

Each source is audited even if it currently has 0 active connections (code path + cron + webhook lifecycle still inspected).

## 9-Layer Verdict Matrix (per source)

Each source gets ✅ / ⚠️ / ❌ + evidence on:

1. **Connect** — OAuth / HealthKit / Oura connect path persists a row.
2. **Foreground sync** — frontend hooks trigger on app open / route change.
3. **Background sync** — runs without the app open:
   - Google / MS: cron + push webhook (channel renewal)
   - Apple Calendar: iOS BGTask + EventKit observer (native bridge)
   - HealthKit: HKObserverQuery + BGTask + native outbox flush
   - Oura: cron pulling via stored refresh token
4. **Token refresh / re-auth resilience** — auto-refresh works; only true failures prompt reconnect.
5. **Freshness telemetry** — `last_successful_sync_at`, `last_data_received_at`, `last_provider_contact_at` all advance as expected; staleness is detectable.
6. **Data integrity** — payload→DB write is correct (see below).
7. **End-to-end trace** — one live connection per source traced from Provider → Trigger → Function → DB write → Freshness → UI hook.
8. **Recovery / backfill** — sync resumes correctly after 1h / 1d / 7d gaps; sync-token / delta-token / anchor / cursor recovery verified.
9. **Monitoring / silent-failure detection** — does an alert exist for webhook expiry, cron disabled, refresh failure cluster, write failures, queue backlog?

## Layer 6 — Data Integrity (deep checks)

**Calendars:** `provider_event_id` uniqueness · `updated_at` progression · deleted-event handling (cancelled status / tombstones) · recurring-event expansion · timezone preservation · cross-provider dedupe by title+startMs (already in `dedupeCalendarEvents`).

**Wearables:** sample/day uniqueness on `(user_id, summary_date)` · duplicate ingestion prevention · late-arriving sample handling · historical backfill correctness · canonical column writes (per `mem://integrations/wearable/database-schema-standard`).

## Layer 7 — End-to-End Trace (1 active connection per source)

For each source produce a pass/fail table:

```text
Stage                  Pass  Evidence
Provider reachable     ?     API status / 200 from gateway
Trigger fired          ?     cron.job_run_details / webhook log / BGTask
Function executed      ?     edge function log line
DB write succeeded     ?     row count delta in target table
Freshness updated      ?     last_*_at advanced
UI reflects state      ?     hook return value / syncStateModel output
```

If 0 active connections exist for a source, trace the **dry-run code path** instead (function compiles, cron registered, webhook handler reachable, token store callable).

## Layer 8 — Recovery Audit

- Google: incremental `syncToken` invalidation → full re-sync path.
- Microsoft: `deltaToken` invalidation → full re-sync path.
- Apple Calendar: EventKit change-token recovery after app reinstall.
- HealthKit: `HKAnchoredObjectQuery` anchor reset path (`anchor_state_reset` telemetry).
- Oura: historical pull window after gap; refresh-token rotation handling.

## Layer 9 — Connection State Accuracy (the false-disconnect problem)

Verify the system distinguishes **all 8 states**, and that "user not wearing device / battery dead / app not opened" does NOT silently flip the connection to disconnected or trigger reconnect prompts:

```text
State                                  Correctly identified?
Connected + receiving data             ?
Connected + no new data available      ?  ← Oura ring off, watch on charger
Connected + device offline             ?
Connected + user not wearing device    ?
Permission revoked (HealthKit/Oura)    ?
Token expired but refreshable          ?
Re-auth required                       ?
Fully disconnected                     ?
```

Confirm the schema/telemetry expresses these via **three distinct timestamps**, not a single `last_synced_at`:

- `last_successful_sync_at` — we reached the provider.
- `last_data_received_at` — we got new rows.
- `last_provider_contact_at` — last HTTP/observer event.

If only `last_synced_at` exists, flag it as a structural gap in `syncStateModel` and `check-connections-status` (no fix this pass — reported only).

## SQL probe scope (Question 1 — expanded as requested)

Read-only on any table/view/cron/queue/audit/log that participates in calendar or wearable sync, including (but not limited to):

`calendar_connections` · `calendar_events` · `calendar_event_classifications` · `oura_connections` · `wearable_data` · `wearable_signal_diagnostics` · `user_integrations` · `notification_log` · `audit_logs` · `processed_outbox_items` · `cron.job` · `cron.job_run_details` · `net.http_request_queue` · `net._http_response` · vault token rows (count only, never values) · `event_classifier_parity_log` · any `sync_state` / `sync_cursors` / `sync_runs` / `background_jobs` / `webhook_subscriptions` / `outbox` / `failed_jobs` / `retry_queue` tables if they exist.

Plus edge function logs for: `sync-calendar`, `sync-calendar-scheduled`, `refresh-calendar-tokens`, `calendar-webhook`, `sync-oura`, `persist-wearable-data`, `check-connections-status`, `process-orphaned-sessions`.

Plus client telemetry buffer (`mm_integration_telemetry_buffer_v1`) shape inspection via `src/utils/integrationTelemetry.ts`.

## User-sampling strategy (Question 2 — both)

- **Aggregate, anonymized:** counts/percentiles across all active users per source — catches systemic failures.
- **Deep-dive traces:** 1–3 representative users per source (IDs redacted as `linkedin|***4O` style in the report) — catches implementation failures.

## Deliverable

Single report with one section per source × 9 layers, plus:

- Cross-cutting findings (e.g. `last_synced_at` is the only timestamp → false-disconnect risk).
- Ranked blocker list (severity × blast radius).
- For each gap: smallest fix proposal — **deferred, no code changes this pass**.
- Explicit notes on anything that requires provider-side action (Google Cloud Console webhook channel renewal, Apple Developer HealthKit entitlement, Oura developer dashboard).

## Out of scope

- No changes to scoring / slot allocator / practice selector / why-line / B4 resolver / CORS / brief snapshot / MRS / frontend design.
- No new features. No UI work. No provider-console changes performed.
- Sources outside the 5 named above.

## Ready to run

All three questions answered (broad SQL ✅, calendars+wearables only ✅, exclude nothing ✅). On approval I will execute the audit and return the report in a single message.
