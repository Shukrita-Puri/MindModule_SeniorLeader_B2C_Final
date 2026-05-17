
## 0. Heads-up on attached docs

The two `.docx` files (`Proactive_Mastery_Plan_Documentation_v4.docx`, `Decision_Readiness_Brief_LLM_Prompt_v2.docx`) are not on the sandbox filesystem — only the `.md` siblings under `docs/`. I've referenced:

- `docs/PROACTIVE_MASTERY_PLAN_LOGIC.md` + `docs/MASTERY_PLAN_CONTEXT_LOGIC.md` (plan)
- `docs/PERFORMANCE_READINESS_BRIEF_LOGIC.md` (brief)
- `docs/SMART_NUDGES_COMPREHENSIVE_ARCHITECTURE.md` + `docs/SMART_NUDGES_ARCHITECTURE.md` + `docs/SMART_NUDGES_TECHNICAL_DOCUMENTATION.md` (nudges)
- `mem/architecture/ceo-behaviour-shared-module-ownership.md` (ownership ledger)

If you want the `.docx` versions diffed, re-upload and I'll cross-check before we ship.

---

## 1. Decisions captured from your replies

| # | Question | Decision |
|---|---|---|
| 1 | `moodDrained` composition | Stays in Edge/LLM — triangulation is not `.ts`. |
| 2 | HRV-as-mood OR-gate | Stays in Edge/LLM. |
| 3 | `personal_friction` wearable-null handling | Stays in Edge/LLM. Shared rule remains a typed stub. |
| 4 | `preFlightWindowMinutes` multi-leg travel | **First** travel event of the day owns the pre-flight window. Connection leg gets its **own in-flight nudge** only if the layover is short enough to be a true connection (assume WiFi for during-flight self-regulation). Long gap (≥ ~9–10h) → treat as separate working block: if a meeting is on the calendar in the gap → high-stakes prep fires; if not → assume personal/PTO and stay silent. |
| 4b | Offline / DND / airplane-mode deferral | **Moves INTO `_shared/ceo-behaviour/`** as a delivery-shape rule. Port the existing logic from smart-nudges edge/LLM into a new cluster file. |
| 5 | Parity logging destination | Deferred (Phase 4). Plain-English explanation in §5. |

These six decisions are the contract for everything below.

---

## 2. What "Phase 4 deferred" means concretely

We will **not** flip `SHARED_MODULES_ENABLED` in this PR series, and we will **not** delete the legacy detectors in `generate-mastery-plan` (~lines 3195–3485) or `smart-nudges` (~lines 937–1041 + `dayContext`/`buildDayShapeLine`). They keep running unchanged. Production behaviour does not move.

What we *will* do: finish `_shared/ceo-behaviour/` so it is the authoritative *rule-shape* library — so that when we are ready to flip the flag later, every rule already exists in `.ts` and the Edge/LLM layers only own triangulation, copy, and delivery.

---

## 3. The boundary (locking it in)

Add a new top-section to `mem/architecture/ceo-behaviour-shared-module-ownership.md`:

**Belongs in `_shared/ceo-behaviour/` (rule shapes):**
- Time-window predicates over already-computed signals
- Day-shape classification (weekday/weekend/PTO/holiday/conference/travel-day)
- Calendar taxonomy lookups (high-stakes, interpersonal, deep work, board-level outcome)
- Stable `copyHint` strings + practice-type boosts tied to a single rule firing
- **Delivery-shape predicates** (e.g. "user is offline → defer, fire on next online" / "DND window → suppress until window ends") — added per your latest reply
- Pure functions: `(RuleContext) => BehaviourFlag | null`

**Stays in Edge / LLM (triangulation + delivery execution):**
- Mood × energy × HRV fusion ("are they actually drained?")
- Wearable-absence policy (40% of users have no device — null vs false interpretation)
- Multi-signal severity arbitration when several rules fire
- Final LLM copy generation, V8 validators, CTA verb selection
- The *actual* push-queue mechanics that hold and re-fire deferred nudges (the rule says "defer until online"; the edge function owns the outbox, the APNS token lookup, and the retry side effect)
- Per-surface dedupe across brief/nudge/plan

---

## 4. Completing `_shared/ceo-behaviour/` (the actual work)

### 4a. Audit: legacy → shared

| Legacy concept | Current shared rule | Action |
|---|---|---|
| `veto_risk` | `vetoRisk` | ✅ ported |
| `circadian_travel` ±48h | `travelPreFlightMandatory` / `travelLandingOffload` / `longHaulRecovery` / `postTripReentry` | ✅ ported; add 1→4 mapping comment in `travel.ts` header |
| `decision_leakage` (24h drain window) | `decisionLeakageGuard` (4h) | **Add** `decisionLeakageGuardPlan` (24h, no mood gate — mood fusion stays in Edge). Plan-scope only. |
| `post_peak_hangover` | `postPeakHangover` | ✅ ported |
| `personal_friction` | `personalFrictionInference` (stub) | Stay stub. Edge populates `signals.personalFrictionWindow`. |
| `board_outcome` | `boardLevelOutcome` | ✅ ported |
| `public_holiday` / `personal_pto` | `holidayReducedTouch` / `ptoWithMeetingFallback` | ✅ ported |
| `preFlight` 60–240 min window | `travelPreFlightMandatory` fires on broad `signals.travelDay` | **Tighten**: rule fires only when `signals.preFlightWindowMinutes !== null`. Edge populates from the **first** travel event of the day. |
| `inFlight` window | none | **Add** `travelInFlightConnection` (nudge-scope). Fires when `signals.inFlightConnectionMinutes !== null`. Edge sets this only for a true connecting leg (short layover). Long gaps with a meeting in between fall through to `advancePrep24h` / high-stakes prep; long gaps without a meeting stay silent. |
| `postTravel` (yesterday travel-day) | `postTripReentry` | ✅ ported; add `signals.yesterdayWasTravelDay` if missing. |
| `ptoMode` (`away-day` / `ooo`) | `ptoWithMeetingFallback` | ✅ ported; add `signals.ptoModeToday` + `signals.ptoMeetingPresent`. |
| `buildDayShapeLine` prose | not in `.ts` | **Do NOT port the prose builder.** Each rule's `copyHint` is the contract; surfaces format. |
| Offline / DND / airplane-mode defer + re-fire | scattered in smart-nudges edge | **NEW cluster `delivery.ts`** — see §4c. |

### 4b. `SignalMatrix` additions (additive, types only)

In `brief-context.ts`:

```ts
// Travel shape
preFlightWindowMinutes: number | null;
inFlightConnectionMinutes: number | null;
nextTravelEventTitle: string | null;
yesterdayWasTravelDay: boolean;

// Day-shape
ptoModeToday: boolean;
ptoMeetingPresent: boolean;

// Triangulation-populated (Edge writes; .ts only reads)
personalFrictionWindow: "sun-pm" | "mon-am" | null;
emotionalDrainEventInNext24h: { title: string; minutesUntil: number } | null;

// Delivery shape (new)
deviceOnline: boolean | null;          // null = unknown
dndActive: boolean;
dndEndsInMinutes: number | null;
airplaneModeActive: boolean;
lastSeenOnlineMinutesAgo: number | null;
```

`brief-signal-coverage.ts` populates the mechanical (calendar / time-window) fields. Edge populates triangulation + delivery-telemetry fields before calling `evaluate()` once the flag flips.

### 4c. New cluster file: `_shared/ceo-behaviour/delivery.ts`

Ported from the offline/DND handling currently inside smart-nudges. Pure rule shapes only — no push-queue side effects.

Rules to add (nudge-scope only; brief and plan do not have delivery concerns):

- `nudgeDeferOffline` — fires when `signals.deviceOnline === false || signals.airplaneModeActive`. `copyHint: "defer-until-online"`. The edge function reads this flag and routes the nudge into its retry outbox instead of dispatching to APNS.
- `nudgeSuppressDND` — fires when `signals.dndActive === true && dndEndsInMinutes !== null`. `copyHint: "suppress-until-dnd-ends"`. Edge holds the nudge and re-evaluates at `dndEndsInMinutes`.
- `nudgeStaleSkip` — fires when the original anchor event has already passed by the time the user returns online (`lastSeenOnlineMinutesAgo` exceeds rule TTL). `copyHint: "drop-stale"`. Edge drops instead of firing a now-irrelevant push.
- `nudgeBatchOnReturn` — fires when more than one deferred nudge would land within a short window of the user coming back online. `copyHint: "batch-coalesce"`. Edge coalesces into one push.

These are pure predicates; the edge function still owns the outbox, APNS dispatch, and the actual side effects. Locking them as `.ts` rules means the *policy* lives in one place across all three surfaces (today nudges, tomorrow potentially brief delivery too).

### 4d. New cluster file additions for travel

- `_shared/ceo-behaviour/travel.ts` → add `travelInFlightConnection`
- `_shared/ceo-behaviour/workweek.ts` → add `decisionLeakageGuardPlan`
- `_shared/ceo-behaviour/index.ts` → register all new rules + `delivery.ts` rules with correct scopes
- `_shared/ceo-behaviour-batch4.test.ts` → unit tests for all new rules + tightened `travelPreFlightMandatory`

### 4e. Update ownership ledger

`mem/architecture/ceo-behaviour-shared-module-ownership.md` — add:
1. The boundary in §3 above (now including delivery shapes).
2. Decisions 1–4b from §1 with rationale.
3. A rule → doc-section cross-reference table.
4. Phase 4 pause note (flag flip + legacy deletion postponed pending triangulation work in Edge/LLM).

### 4f. Cross-reference appendix

New doc `docs/CEO_BEHAVIOUR_RULE_MAP.md` mapping each `.ts` rule to:
- Originating section in the three architecture docs (brief / plan / nudges).
- Signals consumed.
- Edge/LLM triangulation it depends on (so reviewers see the seam clearly).
- For delivery rules: the outbox / APNS handler that owns the side-effect.

This is the "have all the relevant edge functions and LLM prompts been referenced" deliverable.

---

## 5. Plain-English answer to Q5 (parity logging)

When we eventually flip `SHARED_MODULES_ENABLED = true`, the new shared rules will start driving brief/nudge/plan output. The old detectors will keep running silently in parallel for one week so we can compare "what the old code would have produced" vs "what the new code is producing." Any difference is a **diff** to investigate before we delete the old code.

Two ways to record diffs:

- **Console logs** — cheap, instantly visible in edge function logs, no DB writes. You grep through logs to count them.
- **`behaviour_parity_log` table** — every brief/nudge/plan call writes one row: `{ rule_id, legacy_fired, shared_fired, user_id, timestamp }`. ~3 rows per user per day. Queryable with SQL, but adds DB writes and a small migration.

Recommendation when we get to Phase 4: console for week 1 (zero risk); promote to table only if diffs appear that need quantifying. **No action needed now.**

---

## 6. PR breakdown

- **PR-1 — Types + signals only.** Extend `SignalMatrix` (travel + day-shape + delivery + triangulation-placeholder fields). Populate the mechanical fields in `brief-signal-coverage.ts`. Triangulation + delivery fields remain `null` in production. ~150 LOC, zero behaviour change.
- **PR-2 — Travel rule shapes.** Add `decisionLeakageGuardPlan`, `travelInFlightConnection`. Tighten `travelPreFlightMandatory`. Register in `index.ts`. Tests in `ceo-behaviour-batch4.test.ts`. Flag still OFF.
- **PR-3 — Delivery cluster.** Add `_shared/ceo-behaviour/delivery.ts` with the four delivery rules ported from smart-nudges edge. Register in `index.ts`. Tests added. Flag still OFF; edge function does not yet consume them. ~250 LOC + tests.
- **PR-4 — Docs.** `docs/CEO_BEHAVIOUR_RULE_MAP.md` + ownership-ledger update. Docs-only.

Each PR is independently mergeable and reversible. Production behaviour is unchanged across all four because the flag stays OFF.

---

## 7. Out of scope

- Flipping `SHARED_MODULES_ENABLED`
- Deleting legacy detectors in `generate-mastery-plan` / `smart-nudges`
- Implementing mood/HRV fusion or wearable-null policy in `.ts`
- Building the actual offline outbox / retry mechanism (the `.ts` rules describe the policy; the edge function still owns the side effects)
- Changing any LLM prompt, validator, V8 CTA verb, or copy contract

Phase 4 (flag flip + legacy deletion + parity logging) stays parked until you greenlight the triangulation-side work in Edge/LLM.
