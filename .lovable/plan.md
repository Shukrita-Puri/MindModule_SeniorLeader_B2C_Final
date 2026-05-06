## Plan v5.3 — Chief-of-Staff proactiveness, fixed-3-slot model, OR-fusion

Locks in your two clarifications and consolidates v5.1 + v5.2 into one buildable spec:

1. **3-slot ceiling is absolute.** Morning, Mid (1) and Evening. Travel, pattern-prevention, and look-ahead lanes are *contexts that ride existing slots* — never extra fires.
2. **No data-fusion AND-gate.** A nudge may fire on *any one* of:
   - **Immediate** — wearable, calendar, signal pills, today's check-in
   - **Tactical** — patterns from `causality_findings.signal_summary` (HRV/RHR per event bucket, sleep→PRS, consecutive load) or recent trend
   - **Strategic** — accountability/goal commitments
   Fusion *enriches copy* but is never a precondition to send.

---

### 1. Punctuality — `apns-expiration` per intent (no zombies)

| Slot / variant | TTL |
| --- | --- |
| `nudge_one` JIT pre-event (≤60 min) | 45 min |
| `nudge_one` morning anchor | 3 h |
| `nudge_two` mid-day recalibrate | 2 h |
| `nudge_two` in-flight reset | 90 min (only if a real-time act is still useful) |
| `nudge_three` evening close | 6 h |
| `nudge_three` Sunday / eve-of-high-stakes | 10 h |
| `test_push` | 1 h |

After expiry, APNs drops it. When the phone returns, the *next cron tick* re-evaluates against current state and current calendar — not a replay of the missed window.

### 2. Clean Desk — `apns-collapse-id`

`${family}-${userLocalDate}` so two ticks for the same family on the same day collapse to the latest. Travel uses an extra bucket `travel-${userLocalDate}` so pre-flight and in-flight collapse to the most recent within their slot.

### 3. Honest receipts — Notification Service Extension + telemetry

- New iOS target `ios/App/NotificationService/` posts `{notification_log_id, received_at}` to a new edge function `notification-receipt`.
- `notification_log` gets `delivered_at timestamptz`, `delivery_state text` (`accepted | delivered | expired_before_delivery | failed`). Backfill existing 200s as `accepted`.
- `usePushNotificationHandler` also calls `notification-receipt` on tap (web/preview fallback).
- Support SQL & a 7-day per-family threshold (>30% expired ⇒ revisit timing) documented in `docs/APNS_ENVIRONMENT_ALIGNMENT.md`.

### 4. Intelligent badging

`aps.badge` = open priorities in today's plan + unread brief + pending check-in for current window. Computed once per push; recomputed on next tick after delivery so cleared chores don't ghost.

### 5. Context overlays riding the 3 fixed slots

All overlays *replace* the default copy/anchor of their slot — they never add a 4th send.

#### 5a. Travel arc (STATE overlay)
`buildNudgeContext` derives, from existing `calendar_events`:

| Sub-flag | Detection | Rides slot |
| --- | --- | --- |
| `preFlight` | first travel event starts in 60–240 min | morning (`nudge_one`) |
| `inFlight` | now is inside a flight/travel event ≥ 90 min | mid (`nudge_two`) |
| `postArrival` | yesterday flight ≥ 4 h AND today's local TZ ≠ origin TZ | morning (`nudge_one`) |

Copy (V8, qualified mind-prep CTA, self-sufficient bodies so Wi-Fi isn't required):

- `preFlight` — `Flight in ~90 min — two minutes of paced breathing now keeps the body out of debt before takeoff. Log in to prep your state.`
- `inFlight` — `You're in the air. A short breath protocol now blunts the jet-lag tax — open in the app, or run it yourself: 4-in / 6-out for 2 minutes.`
- `postArrival` — existing recovery copy.

If the flight straddles morning + mid, both sub-flags are valid candidates *for their own slots* — but each slot still emits at most one push.

#### 5b. Pattern-driven pre-event prevention (Tactical → JIT)
Inside the existing JIT evaluator, allow `signal_summary.event_to_hrv` (or `event_to_rhr`) to **promote** an upcoming event to JIT-prep, without requiring today's state to confirm:

```
For each event in next 24 h:
  pattern = findEventPattern(signal, bucket)
  if pattern.confidence in ['emerging','strong']
     && (pattern.hrvDeltaPct <= -15 || pattern.rhrElevated)
     && minutesUntil between 90 and 240
  then candidate JIT (signalStrength = 3, anchor = JIT)
```
Today's wearable/check-in is used to *enrich copy* (down-weight urgency if state is green; sharpen it if amber/red), not to gate firing — per your "no AND-gate" rule.

#### 5c. Look-ahead lane (Tactical/Strategic, evening overlay)
Generalise the existing Sunday "eve-of-high-stakes" branch: any evening where tomorrow has a high-stakes event in the next 18 h gets the look-ahead variant in the existing `nudge_three` slot.

#### 5d. PTO / public-holiday / OOO suppression
`personal_pto` and `public_holiday` (already detected upstream) collapse the day to a single light-touch nudge in the morning slot; mid + evening are skipped. JIT pre-event prep never fires on PTO days. (This is consistent with the dayContext copy spec; we only need to wire the suppression.)

#### 5e. JIT silence when prep is already consumed
Before firing JIT pre-event, check `daily_ritual_completions.plan_ledger` for the matching priority — if completed, suppress and log `payload.suppressed_reason = 'prep_already_done'`.

#### 5f. Receipt feedback into qualification
If a user's previous family was `expired_before_delivery` 3 ticks in a row, stamp `payload.qualification_warnings = ['repeated_expiry']` so per-user timing issues are visible without changing global cadence.

### 6. OR-fusion contract (codified)

`evaluateCandidate` accepts a candidate where **any one** of these is true:
- Immediate signal (wearable/check-in/calendar in window) crosses threshold, OR
- Tactical pattern (signal_summary) hits with `confidence ≥ emerging`, OR
- Strategic accountability item from coach/goal store is due in window.

Other layers, when present, are appended as enrichment tokens on the copy prompt only. Suppression stack, comparator, slot priority, anchor priority, daily cap, 2 h cooldown, in-meeting block, DND/quiet hours — unchanged.

### 7. What is explicitly NOT changing

- Slot count and naming (`nudge_one/two/three`), 3-per-day cap, comparator, suppression stack.
- Copy contract V8 and `requiresNamedContextToken`.
- `APNS_ENVIRONMENT`/entitlements alignment; `notification_device_tokens` schema; cron `*/10 * * * *`.
- `LEGACY_GENERIC_NUDGES_ENABLED = false`.

### 8. Files to touch

- `supabase/functions/smart-nudges/index.ts`
  - `sendApnsPush`: accept `ttlSeconds` + `collapseId`; set `apns-expiration` and `apns-collapse-id`; write both into `notification_log.payload`.
  - `buildNudgeContext`: add `preFlight`/`inFlight` sub-flags; add badge computation.
  - JIT evaluator: pattern-promotion gate (5b); plan-ledger silence (5e).
  - State evaluator: travel sub-flag variants (5a); look-ahead overlay (5c); PTO collapse (5d).
  - Copy step: pattern enrichment + state-tone modulation.
  - Telemetry: receipt-feedback stamp (5f).
- `supabase/functions/test-push/index.ts` — mirror TTL + collapse-id (`test_push-${date}`, 1 h).
- `supabase/functions/notification-receipt/index.ts` — **new**; validates token belongs to user; updates `delivery_state`/`delivered_at`.
- `supabase/migrations/<ts>_notification_delivery_state.sql` — add columns + backfill.
- `ios/App/NotificationService/` — **new** Xcode target; doc the `npx cap sync ios` + Xcode target-add step in `docs/APNS_ENVIRONMENT_ALIGNMENT.md`.
- `src/hooks/usePushNotificationHandler.ts` — call `notification-receipt` on tap.
- Docs: `docs/SMART_NUDGES_COMPREHENSIVE_ARCHITECTURE.md`, `docs/APNS_ENVIRONMENT_ALIGNMENT.md`.
- Memory: `mem/features/notifications/smart-nudges-mvp-framework.md` (travel sub-stages, OR-fusion, pattern-promotion); `mem/architecture/unified-pattern-store.md` (one-line: signal_summary may *trigger* JIT, not just cite); `mem/infrastructure/apns-delivery-diagnostics.md` (new `delivery_state` recipe).

### 9. Verification

1. **TTL/collapse**: airplane mode → `/test-push` → row has `apns_expiration` ~1 h, `apns_collapse_id=test_push-<date>`, `delivery_state=accepted`. Reconnect within TTL → NSE flips to `delivered`. Re-fire twice offline → only latest appears.
2. **Pre-flight rides morning**: flight 90 min out → `nudge_one` fires with preFlight copy and 45-min TTL; *no* additional default morning anchor for that user.
3. **In-flight rides mid**: now = takeoff+30 on a 6 h flight → `nudge_two` fires with self-sufficient body and 90-min TTL.
4. **3-cap holds under travel**: travel day with preFlight + inFlight + evening close → exactly 3 rows, no fourth.
5. **Pattern promotion (no state gate)**: `event_to_hrv` strong-confidence -20% for "Board / governance", event 2 h out, PRS green → JIT still fires (OR-fusion); copy is calmer than the amber variant.
6. **PTO collapse**: today flagged `personal_pto` → only morning light-touch row, no mid/evening, no JIT.
7. **JIT silence**: matching priority marked completed in `plan_ledger` → JIT row absent, `suppressed_reason=prep_already_done` logged on a shadow entry for visibility.
8. **SQL spot-check**:
   ```sql
   select notification_type,
          payload->>'state_variant',
          payload->>'pattern_promoted',
          payload->>'suppressed_reason',
          payload->>'apns_expiration',
          payload->>'apns_collapse_id',
          delivery_state, delivered_at
   from notification_log
   where sent_at > now() - interval '24 hours'
   order by sent_at desc;
   ```
