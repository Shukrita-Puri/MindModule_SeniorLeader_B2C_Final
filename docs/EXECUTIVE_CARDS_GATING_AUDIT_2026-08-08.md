# Executive Cards — Gating, Freshness & Latency Audit
Date: 2026-08-08 · Scope: MRS card, Brief card, Plan card · Audit only, no code changed.

---

## 0. One-paragraph verdict

The three cards are a **strict serial pipeline** — MRS → Brief → Plan — where each stage
re-verifies the previous stage from the database rather than trusting a forwarded flag.
That is safe but brittle: a single missing physiological or demand sub-signal collapses
all three cards to "Awaiting signals", even when a perfectly good deterministic read
already exists. Layered on top is a **server-side 15-minute cron with a 5-minute
per-user acceptance window**, and an **iOS data supply that has no guaranteed arrival
time at all**. The result is what the user experiences: cards that are correct but late,
and that intermittently regress from populated to awaiting.

---

## 1. What actually happened this morning (shukrita@mindmodule.me)

Hard evidence from the database (UTC; London = UTC+1):

| UTC | London | Event |
|---|---|---|
| 04:00:20 | 05:00 | Cron built morning brief — `deterministic`, score **41**, phrase "Holding steady" |
| 07:48:25 | 08:48 | Another `deterministic` brief written, score 41 |
| **07:49:16** | 08:49 | HealthKit persisted `wearable_data` for 2026-08-08 (**HRV 20.5, HR 97**) |
| **07:49:29** | 08:49 | Brief row rewritten with `brief_source = 'awaiting'`, phrase **empty** |
| **07:49:44** | 08:49 | Second `awaiting` brief row written |
| — | 08:50 | **User screenshot: MRS 41 renders, Brief + Plan = "Awaiting signals"** |
| 09:14:43 | 10:14 | Brief rebuilt `deterministic`, score **51**, "Holding steady" |
| 09:14:44 | 10:14 | **First** morning `mastery_plan_snapshots` row for today — `status = ready` |
| — | 10:14 | **User screenshot: all three cards populated** |

### Findings

**F1 — The wearable sync *caused* the awaiting state, it did not fix it.**
The two `awaiting` brief rows were written 13 and 28 seconds *after* the HealthKit
persist. A recompute fired on the back of the sync, evaluated freshness mid-write, and
**overwrote a valid deterministic brief with an empty awaiting row**. This is a
write-ordering regression: an awaiting result is allowed to clobber a better, already
published row for the same window. `docs/EXECUTIVE_HOME_WIRING_GUIDE.md` §11.6
explicitly forbids this ("Letting a weaker awaiting/pending row overwrite a better ready
row") — the rule is documented but not enforced in code.

**F2 — The Plan never ran in the morning window at all.**
There is no `mastery_plan_snapshots` row for 2026-08-08 morning before 09:14:44. The
05:00 and 07:48 cron passes produced a Brief but **skipped Plan** — consistent with
`build-executive-home-cards` setting `planStatus = "skipped_no_stage_one_signal"` when
`mrsIsReady` is false, and with the strict Brief↔Plan handshake. So the Plan card had
literally nothing to read. The 09:14 row appears to be a **manual/opportunistic
refresh**, not a scheduled morning build — the morning window band (05:00 ±5 min local)
was long gone.

**F3 — The 08-07 morning plan row is `status = 'awaiting'` and 08-05 afternoon too.**
Awaiting plan rows are persisted as first-class rows, so the reader can and does surface
them in preference to nothing — but they also occupy the window slot and interact with
`skipIfAlreadyBuilt`.

**F4 — The wearable data itself was never the problem.** HRV for 08-07 (18.7) was
present from 09:53 UTC the previous day, and 08-08 HRV landed at 07:49. Sleep and
sleep-efficiency are `null` on *every* row for this user (Apple Watch not worn overnight
or sleep not shared) — which is the real chronic driver of degraded reads.

---

## 2. Card 1 — Mental Readiness Score

### 2.1 What forms the score
`_shared/signal-engine/mrs-v4-compose.ts`. Weighted sum of per-window sub-components,
weights always normalise to 100. Two **required pillars**:

- **Physiological** — `hrvMorningDeviation`, `sleepDeviation`, `rhrTrend`,
  `intradayHrDeviation`, `eveningPhysioRead`
- **Demand** — `todayFullDayDemand`, `remainingDayDemand`, `realizedSoFarCost`,
  `todayRealizedDemand`, `tomorrowOpeningDemand`, `yesterdayCarryover`
- **Pattern** — additive context only; never gates, never absorbs weight.

### 2.2 The hard gate (`redistribute()`, lines 102-106)
```ts
const physiologicalAvailable = earnedCells.some(c => c.pillar === 'physiological');
const demandAvailable        = earnedCells.some(c => c.pillar === 'demand');
const awaitingSignals = !physiologicalAvailable || !demandAvailable;
```
`baseline = null` if either pillar has **zero** earned cells. Unearned weight
redistributes **intra-pillar only**.

Mirrored defensively in `compute-inner-readiness/index.ts:970-1045`
(`wearablePillarMet && demandPillarMet → bothPillarsMet`), and again in
`build-executive-home-cards/index.ts:824-838` (`mrsIsReady` also re-checks
`weightProvenance.awaiting_signals` and an empty `earned[]`).

### 2.3 Baseline vs Refined
- **Baseline** = the weighted composite (this is what "EARLY READ · check in to sharpen
  it" means on the card).
- **Refined** = baseline blended with the 4 Mind check-in dimensions, clamped to ±15.
- Refined is **only unlocked** when `wearableStatus === 'fresh' || hasCalendarSignal`
  (`compute-inner-readiness:1083-1095`). A check-in on its own can never produce a
  refined score, and can never synthesise a baseline.

### 2.4 Tier / band
`getEnergyTier()` / `getEnergySubTier()` on `clamp(score ?? 50)`. Tier is purely a
function of the number — there is no separate tier gate. Band valence and the phrase
("holding the line — solid, not your peak") are mirrored into
`daily_context_snapshot`.

### 2.5 Week-over-Week
`mental-fitness-scores/summarizeWeek()` — plain numeric mean of
`readiness_score_refined ?? readiness_score_baseline` across strict calendar-week
boundaries. Gated only by having at least one scored day in each week; renders collapsed
by default behind the "WEEK OVER WEEK" disclosure.

### 2.6 Zero-demand credit — important
A calendar in state `connected_no_events` is **earned data**, not missing data:
`ZERO_DEMAND_CREDIT = 0.6` (score 60). This is why MRS formed at 08:50 despite the
weekend having no events. A **disconnected** calendar (`not_connected`) fails the demand
pillar outright and kills MRS.

### 2.7 Wearable freshness rule (the single most consequential rule in the system)
`_shared/signal-engine/signal-freshness.ts:54-64`
```ts
maxWearableAgeDaysForWindow = window === "morning" ? 1 : 0;
wearableCurrent = hasWearableData && age >= 0 && age <= maxAge;
```
- **Morning** — yesterday's row is acceptable (age ≤ 1 day)
- **Afternoon** — same-day only (age = 0)
- **Evening** — same-day only (age = 0)

Age is a **local-date** difference (timezone-resolved, travel-aware) floored to whole
days. There is no hour-of-day component. Consequence: at 12:01 local, a user whose watch
last synced yesterday flips from "fresh" to "stale" instantly, and all three
physiological pills go Unread.

---

## 3. Card 2 — Performance Readiness Brief

### 3.1 The awaiting gate (`compute-outer-readiness/index.ts:9250-9327`)
```ts
hasStage1Signal            = hasFreshWearable || hasCalendarSignal;
awaitingSignals            = !hasStage1Signal;
briefHasCurrentPersonalSignal = briefWearableUsable || checkInCurrentForWindow;
briefAwaitingSignals       = !briefHasCurrentPersonalSignal;

briefMustAwait = briefAwaitingSignals
  || ((awaitingSignals || innerStateIsAwaiting)
      && !hasDeterministicBrief
      && typeof canonicalInnerScore !== "number");
```
**Critical asymmetry:** calendar demand can satisfy MRS and Plan but is *deliberately
excluded* from satisfying the Brief's "current personal signal" claim (comment at 9253).
So the Brief is strictly the **strictest** of the three cards.

### 3.2 Source precedence
`briefMustAwait` → `awaiting` (short-circuits everything) → cached snapshot's own
recorded source → fresh LLM → deterministic → awaiting. The deterministic builder has
its own identical gate (`deterministic-brief.ts:326-335`) and returns `null` with no
current wearable and no current check-in.

### 3.3 What suppresses copy
```ts
responsePhrase  = briefIsAwaiting ? null : (cached ?? llm ?? deterministic ?? finalPhrase);
rawResponseBody = briefIsAwaiting ? null : (…);
```
Single choke point at 9337-9343 — phrase and body are nulled together, which is why the
card never shows a phrase without a body.

### 3.4 Caching
Key = `(user_id, local_date, time_window, input_signature, prompt_version)`.
**Every** run persists a row, including awaiting runs. `briefMustAwait` is recomputed
live on every call and is *not* cached — so a cache hit can still be forced to awaiting
if freshness has lapsed since. This is correct in principle but is exactly the mechanism
that produced F1.

### 3.5 Signal pills (`_shared/signal-pills/derive-pills.ts`)

**Decision Readiness (Mind)** — HRV deviation / value, sleep duration, sleep score,
clarity check-in.
Fallback `rhr_proxy` fires only when: no tier yet **and** wearable fresh **and** HRV,
sleep duration and sleep score are *all* null **and** RHR present.
Supply-demand cap: high calendar load + body-down downgrades green → amber.

**Physical Reserves (Body)** — RHR value/deviation, HR value/deviation, 3-day RHR trend,
sustained-deficit boolean. **No sleep input, no proxy fallback, no check-in fallback.**
Additional gate at 598-625: if neither RHR nor HR is a finite number, the pill is forced
neutral regardless of any tier computed.

**Resilience Capacity (Reserve)** — sleep efficiency (primary) → `hr_elevated_proxy`
(only when sleep efficiency is null and wearable fresh) → graded
`sustainedDeficitSeverity` (14-day baseline, 3-sample mean over trailing 5 days, red
≤ −15%, amber ≤ −7%) → check-in overlays (emotion / regulation / pressure), with a
regulation-risk floor that downgrades green → amber.

**The shared Unread gate (510-563)** — the same rule for all three:
```ts
isScoreBearing = wearableFreshForGate && (hasWearableSrc || (hasCheckinSrc && checkInFreshForGate));
if (!wearableFreshForGate && checkInFreshForGate && hasCheckinSrc)  → check-in-only read
else if (!wearableFreshForGate)                                      → neutral / "Unread"
```
Because Physical Reserves has no check-in source, **it can never use the check-in-only
carve-out** — it goes Unread the moment the wearable is a day stale in the afternoon.
A second defensive pass at 566-596 re-asserts the same gate.

**Calendar pill** — there is no calendar pill in `derive-pills.ts`. The calendar chips
are `calendarPills` from `generate-mastery-plan` (top-2 filtered events), and the
"Calendar connected — no events found" state comes from
`useCalendarPillContext` → live `compute-outer-readiness?contextOnly=true`. This is the
only live edge-function call on the Home screen and the slowest one.

---

## 4. Card 3 — Today's Performance Priorities (Plan)

### 4.1 Gate chain (`generate-mastery-plan/index.ts`)
```ts
// 5390 — runs FIRST, before anything else
if (strictBriefHandshake && briefBehaviourSource === "absent")
  → awaiting, reason "brief_handshake_missing",
    message "Waiting for the Brief to publish for this window."

// 5464-5509
hasStage1Signal   = hasWearableData || hasCalendarSignal || hasCalendarConnected;
snapshotMrsAwaiting = <re-queried from daily_context_snapshot.readiness_state>;
requestMrsAwaiting  = mrsReadinessState==='awaiting' || score==null
                    || outerReadinessCache.awaitingSignals || briefMode==='cold-start';
canGeneratePlan   = hasStage1Signal && !(snapshotMrsAwaiting || requestMrsAwaiting);
```
Plus the orchestrator gate in `build-executive-home-cards:908-965`: Plan is **not even
invoked** unless `mrsIsReady`, except when `mode === "manual_refresh"`.

So the Plan is gated **four times**: orchestrator MRS check → Brief handshake →
Stage-1 signal → re-queried MRS state. Any one of the four produces the awaiting card.

### 4.2 Per-slot gates
- JIT Touch 1 = event 6–48h out; Touch 2 = 0–6h; > 48h surfaces nothing.
- `evaluateEventPriorityExclusion` per event (`dismissed_horizons`, `not_this_week`,
  `never`).
- Light Day rule: ≤ 1 filtered event with no high-stakes event → 3-slot arc.
- Rest day (`meta.restDay === true`) is a **valid ready** state with zero modules — not
  awaiting. Correctly implemented.

---

## 5. Every awaiting / no-data message the user can see

| Message | Where |
|---|---|
| "AWAITING SIGNALS Connect your wearable and calendar to get an early read, then check in to sharpen it." | `_shared/copy/awaiting.ts:8` + `src/constants/awaitingSignals.ts:5` — the universal fallback |
| "Apple Health access needs attention — reconnect it to restore your readiness read." | `awaiting.ts:62` (`permission_revoked`) |
| "Apple Health is connected, but the latest sync is delayed. We'll keep retrying." | `awaiting.ts:66` (`sync_delayed`) |
| "Apple Health is connected, but no new wearable data has arrived yet." | `awaiting.ts:78` |
| "Apple Calendar access needs attention — reconnect it to restore your day context." | `awaiting.ts:82` |
| "Calendar connected — no events found for this window." | `awaiting.ts:86` — **shown on the MRS card at 08:49 in the screenshot** |
| "Wearable signal received — connect calendar for a fuller read." | `awaiting.ts:90` |
| "Calendar signal received — sync wearable for a fuller read." | `awaiting.ts:94` |
| "Waiting for the Brief to publish for this window." | `generate-mastery-plan:5408` |
| "Sync your wearable and then complete a quick check-in to sharpen the picture." | `derive-pills.ts:198` (pill detail, no fresh wearable) |
| "Wearable read only. Complete a check-in to refine this pill." | `derive-pills.ts:200` |
| "Check-in read only. Wearable data hasn't synced yet." | `derive-pills.ts:202` |
| "Body detail not available for this reading." | `derive-pills.ts:622` |
| "Mind Unread" / "Body Unread" / "Reserve Unread" | `PILL_NEUTRAL_LABELS`, `derive-pills.ts:192` |
| "Awaiting signals" (tier/band label) | `compute-inner-readiness:1179,1193,1206` |
| "Read from your signals. Full brief prose is awaiting the latest signals." | `DecisionReadinessBrief.tsx:2632` |
| "We couldn't verify your session." / "Please refresh or sign in again." | `DecisionReadinessBrief.tsx:2648` |
| "Awaiting signals right now." / "Couldn't reach the readiness service. Retry to refresh." | `DecisionReadinessBrief.tsx:2655` |
| "Reading your signals…" (EngravedLoader) | `MrsPage.tsx:143` |
| "Updating" (pulsing dot) | Brief + MRS, background refetch of a renderable snapshot |

---

## 6. The gating hierarchy — answered directly

```text
TIER 0 — CONNECTION
  wearable integration row + HealthKit/Oura permission
  calendar_connections.is_active + native permission
        │  fail → per-integration reason-aware copy (awaiting.ts:62-94)
        ▼
TIER 1 — DATA PRESENCE + FRESHNESS   (per signal, per window)
  wearableCurrent = age <= (morning ? 1 : 0) days   [local-date diff]
  checkInCurrent  = check-in inside the current window
  calendarState   = not_connected | connected_no_events | active
        │
        ▼
TIER 2 — MRS CARD GATE   (dual pillar, hard)
  physiologicalAvailable AND demandAvailable
        │  fail → MRS "Awaiting signals" AND everything below is dead
        ▼
TIER 3 — BRIEF CARD GATE   (strictest)
  briefWearableUsable OR checkInCurrentForWindow      ← calendar does NOT count
  AND NOT innerStateIsAwaiting (unless a deterministic brief + numeric score exist)
        │  fail → Brief awaiting; pills forced neutral
        ▼
TIER 4 — PLAN CARD GATE   (four independent checks)
  orchestrator: mrsIsReady (bypassed on manual_refresh)
  strictBriefHandshake: same-window Brief snapshot must exist
  hasStage1Signal: wearable OR calendar events OR calendar connected
  re-queried daily_context_snapshot.readiness_state !== 'awaiting'
        │
        ▼
TIER 5 — FEATURE-LEVEL GATES (inside a card that is already rendering)
  per-pill freshness → "Mind/Body/Reserve Unread"
  Physical Reserves displayable-contributor gate (needs finite RHR or HR)
  MRS refined-vs-baseline: refined needs fresh wearable OR calendar signal
  Plan per-slot: JIT 6-48h / 0-6h horizons, exclusion evaluator, Light Day arc
  §3.2a severe-sleep-deficit cap (modifies magnitude, not existence)
```

**Answer to "is gating at card level or feature level?"** — Both, but the *cross-card*
gating is card-level and strictly serial. Your hypothetical is real: **if MRS does not
form, neither Brief nor Plan can form, regardless of their own data.** And Plan
additionally depends on Brief. There is no path where the Plan renders without the
Brief, or the Brief renders without MRS.

Each downstream stage **re-derives** the upstream state from the database rather than
trusting the forwarded flag (Brief re-checks `innerStateIsAwaiting`; Plan re-queries
`daily_context_snapshot`). Defensively correct, but it means a single stale row in
`daily_context_snapshot` silently kills two cards.

---

## 7. Time-to-populate after a cold app open

`HOME_SNAPSHOT_ONLY = true` (`src/config/homeSnapshotMode.ts:12`), so on cold open the
app **does not compute anything** — it reads three snapshot rows.

| Query | Key | staleTime | refetch behaviour | Typical latency |
|---|---|---|---|---|
| `get-mrs-snapshot` | `['mrs-snapshot', uid, date, window]` | 15 min | default (refetch on mount if stale) | 150-600 ms |
| `get-current-brief-snapshot` | `['current-brief-snapshot', uid, date, window, promptVersion]` | 15 min | **all refetch disabled** (`refetchOnMount:false`, no focus, no reconnect, no interval) | 200-900 ms |
| `get-mastery-plan-snapshot` | `['mastery-plan-snapshot', uid, planDate, window]` | 60 s | default | 150-600 ms |
| `compute-outer-readiness?contextOnly` | `['calendar-pill-context', uid]` | 10 min | focus/reconnect disabled | 400-1500 ms (live compute + cold start) |
| `useOuterReadiness` | `['outer-readiness', …]` | — | **`enabled: false`** under snapshot mode | never fires |

**Time to first paint of each card: ~0.2-1.0 s. Time to *fresh* data: 0 to 15 minutes,
bounded entirely by the last cron pass — not by anything the app does on open.**

### The invalidation gap (root cause of the "it fixed itself later" pattern)
On successful HealthKit sync, `useWearableSync.ts:140-147` calls:
```ts
clearEnergyStateCache();
clearOuterReadinessCache(user?.id);
```
`clearOuterReadinessCache` clears the in-memory outer-readiness cache, the
`prb-cache-v2` / `prb-awaiting-v2` localStorage rows, and sets a `prb-force-refresh:*`
marker. It does **not** call `queryClient.invalidateQueries` for
`['mrs-snapshot']`, `['current-brief-snapshot']` or `['mastery-plan-snapshot']` — the
three keys the visible cards actually read.

**So a completed wearable sync does not refresh any Executive card.** The card only
updates when the *server* cron rewrites the snapshot row and the client happens to
refetch. Brief is the worst case: `refetchOnMount: false` and no polling means, within a
window, it can only change on a full app remount, a window rollover, a prompt-version
bump, or the manual Retry button.

### Backfill on cold open
- HealthKit: `healthKitCapacitor.ts:255-280` re-reads a **fixed trailing 30 days** of
  HRV/RHR/HR/sleep on *every* sync (not incremental), bulk-POSTed to
  `persist-wearable-data` in one request (up to 30 rows). Sub-second to a few seconds.
- The sync only runs at all if `elapsed > AUTO_SYNC_INTERVAL_MS` (**30 minutes**,
  `useWearableSync.ts:38,212`). A cold open within 30 min of the last sync **skips the
  sync entirely**.
- Apple Calendar: no client backfill; a fire-and-forget native trigger with **no
  completion signal and no query invalidation**.
- Google/Microsoft: server-side; `fetchEvents` on the client selects
  `calendar_events` with **no date bound** (returns the full history — 133 rows for this
  user, but unbounded in principle).

---

## 8. Scheduling — who pulls what, and when

### Live pg_cron jobs (verified against `cron.job`)
| Job | Schedule (UTC) |
|---|---|
| `build-executive-home-cards` | `*/15 * * * *` |
| `oura-sync-every-15m` | `*/15 * * * *` |
| `smart-nudges-every-15m` | `*/15 * * * *` |
| `sync-calendar-scheduled` | `*/30 * * * *` |
| `refresh-calendar-tokens` | `*/10 * * * *` |
| `process-orphaned-sessions` | `*/10 * * * *` |
| `register-calendar-watch-daily` | `0 3 * * *` |
| `calendar-events-cleanup-nightly` | `0 4 * * *` |
| `cleanup-device-tokens-daily` | `17 3 * * *` |

Only `build-executive-home-cards` has a matching `cron.schedule()` in
`supabase/migrations`. The other eight exist **only in the live database** — infra drift,
not reproducible from source.

### The 15-vs-5 minute defect (high severity)
`build-executive-home-cards` fans out to **all onboarded users every 15 minutes**, then
per-user calls `resolveDueWindow()` (`scheduler.ts:221-253`), which accepts the user only
if their **local** clock is within **`dispatcherIntervalMinutes` = 5 minutes** of
05:00 / 12:00 / 18:00.

Cron fires only at :00 / :15 / :30 / :45 UTC. A user is therefore only ever built if
their local window boundary happens to land inside one of those four instants ± 5 min.
Users on non-15-minute offsets — **IST +5:30, Nepal +5:45, ACST +9:30, +10:30, Iran
+3:30, Newfoundland −3:30, Chatham +12:45**, and anyone on a DST transition day — can
**miss the window band entirely** and get no scheduled build for that window at all.

Additionally `maxUsersPerRun = 100`: users beyond the cap get `max_users_per_run_reached`
and, because the 5-minute band has elapsed by the next tick 15 minutes later, are
**silently skipped for the entire window**.

And `skipIfAlreadyBuilt: true` means that once a window's build has been *attempted* —
even if it produced an awaiting row — it will not retry until the next window boundary.
**This is why the morning Plan for 08-08 never ran: the 05:00 attempt claimed the slot,
Plan was skipped for no Stage-1 signal, and nothing retried it until a manual refresh at
10:14.**

### Apple HealthKit — why data lands at 19:51 UTC
Three triggers, none deterministic:
1. Foreground sync via the Capacitor bridge (`HealthKitSyncManager.runForegroundSync`),
   gated by the 30-minute client interval.
2. `HKObserverQuery` + `enableBackgroundDelivery(frequency: .hourly)`
   (`HealthKitSyncManager.swift:277`). `.hourly` is a **request ceiling, not an SLA** —
   iOS decides the wake instant from battery, motion, Low Power Mode and app-usage
   heuristics, and routinely bunches several hours of samples into one late wake.
3. `BGAppRefreshTask` id `com.moonshot.mindmoduleapp.refresh` with
   `earliestBeginDate = now + 15 min` (`AppDelegate.swift:83`) — again *earliest*, not
   *scheduled*. iOS delays these by hours for apps outside the user's top usage set.

Notably: **no `BGProcessingTask` is registered anywhere** (`rg BGProcessingTask` → no
hits), even though `Info.plist` declares the `processing` background mode.
`BGTaskSchedulerPermittedIdentifiers` contains only the refresh identifier. So the one
API designed for reliable, longer, wall-clock-anchored background work is declared but
unused.

### Oura
`oura-sync-fanout` is fully server-side and per-user, but **timezone-blind** — it syncs
every active connection on every tick, with no window logic and no per-run cap.

### Calendars
- **Apple** — device-only. `EKEventStoreChanged` (5 s debounce),
  `applicationDidBecomeActive`, `BGAppRefreshTask`. **Nothing runs pre-7am local.**
- **Google / Microsoft** — `sync-calendar-scheduled` every 30 min, reading a *stale*
  `profiles.timezone_offset` field rather than the `resolveEffectiveTimezone` helper used
  everywhere else. Gated by `calendar_quota_cooldowns` keyed on
  `provider:oauth_client_id` — **one user hitting a Google rate limit blocks every user
  sharing that OAuth client** until the cooldown expires.

### Is data pulling gated per user?
| Pipeline | Per-user gating |
|---|---|
| Executive cards | **Yes** — local timezone window, day allowlist, 100-user cap, skipIfAlreadyBuilt |
| Oura | Connection state only — uniform fleet-wide fanout |
| Google/MS calendar | Connection state + a **cross-user** quota cooldown |
| Apple Calendar | Device permission only; entirely opportunistic |
| HealthKit | Device permission only; entirely opportunistic |

So: **the pull is uniform, the build is per-user.** There is no mechanism today that
guarantees any user gets HealthKit or calendar data before a given local hour.

---

## 9. Findings summary (severity ordered)

| # | Finding | Severity |
|---|---|---|
| **1** | An `awaiting` result can overwrite an already-published `ready`/`deterministic` snapshot for the same window. Confirmed at 07:49 today. | **Critical** |
| **2** | `skipIfAlreadyBuilt` + a claimed window slot means a failed/partial build is never retried until the next window — the Plan simply doesn't exist for hours. | **Critical** |
| **3** | Completed HealthKit/calendar syncs do not invalidate `mrs-snapshot`, `current-brief-snapshot` or `mastery-plan-snapshot`. Fresh data is invisible until cron. | **Critical** |
| **4** | 15-min cron vs 5-min acceptance band: users on non-15-min UTC offsets can miss whole windows. `maxUsersPerRun=100` compounds it. | **High** |
| **5** | Serial MRS → Brief → Plan gating with four redundant re-checks: one stale `daily_context_snapshot` row silently kills two cards. | **High** |
| **6** | Brief excludes calendar from its "current personal signal" test, making it strictly stricter than MRS — so MRS-populated + Brief-awaiting is a *designed* state, and it looks broken to the user. | **High** |
| **7** | No `BGProcessingTask`; `processing` background mode declared but unused. No wall-clock-anchored early-morning pull exists on iOS. | **High** |
| **8** | Brief query has `refetchOnMount:false` + no polling: within a window it is effectively frozen once cached. | **Medium** |
| **9** | Afternoon/evening wearable freshness is same-day-only (age 0). At 12:01 local a yesterday-only syncer loses all three physiological pills. | **Medium** |
| **10** | Physical Reserves has no check-in fallback and no proxy — it is the first pill to go Unread and cannot recover from a check-in. | **Medium** |
| **11** | Cross-user Google/MS quota cooldown keyed on shared OAuth client. | **Medium** |
| **12** | 8 of 9 cron jobs are not in migrations — live-DB-only configuration. | **Medium** |
| **13** | `sync-calendar-scheduled` uses stale `profiles.timezone_offset` instead of `resolveEffectiveTimezone`. | **Low** |
| **14** | Client `fetchEvents` selects `calendar_events` with no date bound. | **Low** |
| **15** | Multiple duplicate brief rows per window (4 rows for 08-08 morning) — no single-row-per-window guarantee. | **Low** |

---

## 10. Recommendations

### A. Stop the regressions (highest value, lowest risk)

**A1 — Monotonic snapshot writes.** Never let an `awaiting` row supersede a published
`ready`/`deterministic` row for the same `(user, local_date, window)`. Enforce in the
writer: if a renderable row already exists for the window, an awaiting result is logged
and discarded, not written. This alone fixes today's 08:49 incident and is already the
documented rule in the wiring guide.

**A2 — Retry until ready, not until attempted.** Change `skipIfAlreadyBuilt` to
*skip-if-already-**ready***. A window whose Plan is `awaiting`/absent should be retried on
every subsequent 15-min tick until the window closes. Today's morning Plan would have
been built at 08:00 instead of 10:14.

**A3 — Wire sync completion to the cards.** On successful wearable/calendar persist,
invalidate `['mrs-snapshot']`, `['current-brief-snapshot']`, `['mastery-plan-snapshot']`
**and** fire a `build-executive-home-cards` call with `mode: 'manual_refresh'` for that
user. This converts "data arrived" into "cards updated" within seconds instead of up to
15 minutes.

**A4 — Give the Brief a refetch path.** `refetchOnMount: 'always'` plus a
`refetchInterval` while the snapshot is awaiting, so an awaiting Brief self-heals.

### B. Fix the scheduler

**B1 — Widen the acceptance band to ≥ 16 minutes**, or better, replace the "±N minutes of
a boundary" model with a **"has this user been built for this window yet?"** model: on
every tick, build any user whose local time is *past* the window start and who has no
ready snapshot for that window. That is idempotent, cron-cadence-independent, and
eliminates the non-15-min-offset class of bugs entirely.

**B2 — Remove or page past `maxUsersPerRun`.** Cursor through users so nobody is starved.

**B3 — Add a 05:00 local "CEO pre-dawn" window** in addition to morning/afternoon/evening,
so the first build lands before the user's day starts rather than at 05:00 *only if* the
cron tick aligns.

**B4 — Commit all cron schedules to migrations.**

### C. Get iOS data in early

**C1 — Register a `BGProcessingTask`** (the `processing` mode is already declared) with an
`earliestBeginDate` set to the user's **local 04:30**, requiring neither network nor
power. This is the only iOS API that gives you a realistic shot at a pre-dawn pull.

**C2 — Keep `BGAppRefreshTask` but reschedule it aggressively** — reschedule on every
completion *and* on every foreground, with `earliestBeginDate` targeting the next
local 05:00 rather than `now + 15 min`. iOS learns usage patterns; a CEO who opens the app
at 06:00 daily will start getting 05:30-ish wakes within a week.

**C3 — Silent push as the reliable trigger.** You already have APNs. Send a
`content-available: 1` silent push at the user's local 04:45. This is the *only*
mechanism that can wake the app at a wall-clock time you control. Pair it with the
existing smart-nudges scheduler which is already per-user timezone aware.

**C4 — Server-side pre-warm for Oura.** Oura is a cloud API — schedule its fanout at each
user's local 04:30 rather than blind 15-minute ticks, so Oura users never wait on a device.

**C5 — Ship the previous night's data as the morning anchor.** Morning already allows
age ≤ 1 day. Make that explicit in the UI ("read from last night's data") rather than
silently — it builds trust and removes the perception of staleness.

### D. Loosen gating without losing trust

The principle: **never show a partially-populated set of cards, but widen what counts as
enough signal to populate all three.**

**D1 — Let calendar satisfy the Brief.** Today calendar is explicitly excluded from
`briefHasCurrentPersonalSignal`. That is the single biggest cause of
"MRS formed, Brief awaiting". Allow `calendarState === 'active'` (real events) to satisfy
it, with the Brief clearly labelled as a demand-led read. Keep excluding
`connected_no_events`.

**D2 — Extend afternoon/evening wearable age from 0 to 1 day, with an explicit label.**
An age-1 read is honest and vastly better than Unread. Show "yesterday's read" in the pill
detail. This alone would have kept all three pills alive for this user across 08-07.

**D3 — Give Physical Reserves a check-in fallback.** It is currently the only pill with
no non-wearable path. A body-oriented check-in dimension should be able to produce a
non-score-bearing read rather than "Body Unread".

**D4 — Collapse the four Plan gates to two.** The orchestrator MRS check plus the
re-queried snapshot check are the same assertion; the Brief handshake plus the Stage-1
check are largely redundant with MRS. Fewer independent gates = fewer silent failures.

**D5 — Introduce an explicit "Early Read" card state distinct from "Awaiting".**
Awaiting should mean *genuinely nothing connected or worn*. Everything else — stale by a
day, calendar-only, wearable-only, no check-in — should render content with an honest
confidence qualifier. That is the difference between a user thinking "the app is broken"
and "the app is telling me it only has half the picture".

**D6 — Never render a partial trio.** Keep the all-or-nothing rule at the *card set*
level (your instinct is right: Brief without MRS erodes trust), but make the shared gate
D1-D5's looser one. The trio should go awaiting together only when Tier 0 fails.

### E. Observability

**E1** — Log, per card per build: user, local date, window, gate that failed, and the
input freshness values. Today you cannot answer "why was this awaiting" without a manual
DB trace like the one in §1.
**E2** — Alert on `awaiting → ready → awaiting` transitions within a single window; that
is always a bug.
**E3** — Track a per-user "awaiting minutes per day" metric. That is the real UX KPI here.
