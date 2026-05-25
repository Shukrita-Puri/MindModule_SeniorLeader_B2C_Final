
# Clean-Slate JIT Selection — Triangulated Importance Model (v2)

Goal: replace every JIT scoring path with a single selector that mirrors
how a Chief of Staff triages a CEO's day. **Aim: prevent and prepare so
the user performs at their cognitive peak at work.** Personal events
have zero weight. 24h MVP horizon. Single code path. Legacy deleted.

---

## 1. The three pillars

```text
IMMEDIATE  — does the framework care about this event, and who's in the room?
             • §3 category (A–H) base
             • RELATIONSHIP weight (user tag → cached LLM+LinkedIn → unknown)
             • explicit stakes hint from the title (board / external / investor)

TACTICAL   — has THIS user been knocked off-state by events like this?
             • HRV / RHR pattern hit from causality_findings (NOT recomputed)
             • USER PRIORITY TAG on the event
             • skipPenalty (past dismissals / "not relevant", cap −10)
             • followThroughBoost (past JIT completed + felt-better)

STRATEGIC  — does this event sit on a self-declared growth lane?
             • onboarding growth_intention, practicePriorityTag, coach growth_area
             → tiebreaker only; multiplied by 0 when Immediate < MIN_IMMEDIATE
```

Authority chain (immutable): **Immediate filters → Tactical ranks →
Strategic breaks ties.** Strategic never out-votes a sustained tactical
pattern; nothing rescues a personal event.

---

## 2. Adaptive weighting — patterns earn their authority over time

Tactical importance scales with how much truth we have on this user.
A brand-new user has no pattern history, so Immediate (framework +
relationship) must carry the day. Once patterns accumulate, Tactical
overtakes Immediate because **"important to this CEO"** is stronger
signal than **"important on paper"**.

Maturity is read directly off the user's existing
`causality_findings.signal_summary` (canonical pattern store per
`mem://architecture/unified-pattern-store`) — we do **not** recompute
patterns inside the JIT selector. We count distinct event-type buckets
present in `event_to_hrv` ∪ `event_to_rhr` with `n ≥ 3` and
`confidence ∈ {emerging, strong}`.

```text
maturity tier      day range   distinct patterns   immediate w   tactical w
─────────────────  ──────────  ──────────────────  ───────────   ──────────
cold     (T0)      day 1–7      0                  0.60          0.25
warming  (T1)      day 8–14     1–2                0.50          0.35
warm     (T2)      day 15–30    3–5                0.40          0.45
mature   (T3)      day 30+      6+                 0.35          0.50
```

Strategic weight stays at **0.15** across all tiers. Day-count is the
floor (a user can't enter T2 on day 3 even with patterns), pattern-count
is the ceiling (a 60-day user with zero patterns stays at T1).

The final formula becomes:

```text
importance = w_immediate * immediate
           + w_tactical  * tactical
           + w_strategic * strategic * strategicGate
```

`strategicGate = 1` iff raw `immediate >= MIN_IMMEDIATE`, else 0.

Worked intuition: at T0 a Board meeting wins because Immediate is heavy.
At T3, a 1:1 with the boss where HRV has dropped 3× in the last month
beats a generic Board sync — because the system now knows that *this*
1:1 is the one that costs *this* CEO regulation.

---

## 3. Noise gate (run before scoring)

Hard-reject titles matching the personal/non-work lexicon. Extends
existing `isNoiseEvent` / `isEducationalTitle`:

```text
personal_noise = [
  walk dog, dog walk, gym, workout, run, yoga class,
  school run, school pickup, school drop-off, kids,
  dentist, doctor, gp appointment, haircut, salon,
  grocery, shopping, lunch with family, family dinner,
  birthday, anniversary, date night, holiday, vacation,
  personal, errands, laundry, cleaner
]
education_noise = lunch & learn, course, training (when not organizer)
```

Tagged `reason="personal_noise"` for shadow-week audit.

---

## 4. Relationship resolver (inside Immediate)

User tag is sovereign. LLM+LinkedIn lookup fills gaps, async, cached.

```text
Resolution order per attendee:
  1. attendee_relationships.source = 'user_tag'   (authoritative)
  2. attendee_relationships.source = 'llm'        (cached, 90d TTL)
  3. role = 'unknown'                              (no penalty, no boost)

LLM+LinkedIn lookup (async edge function, never blocks plan):
  - Trigger: calendar sync writes a new attendee
  - Skip:    generic domains [gmail, hotmail, outlook.com, icloud, yahoo, proton]
  - Skip:    rate limit > 50 lookups / user / day  (revisit after week 1)
  - Model:   gemini-2.5-flash, web-grounded, public LinkedIn only
  - Roles:   boss | board_member | investor | client | vendor |
             peer | report | external_partner | unknown
```

---

## 5. Scoring components (single formula)

```text
immediate = categoryBase[category]              // 0..40  (A=40, C=30, F=30,
                                                           G=25, D=20, B=15,
                                                           E=10, H=5)
          + relationshipWeight[resolvedRole]    // 0..25  (boss=25, board=25,
                                                           investor=20, client=18,
                                                           external=15, peer=8,
                                                           vendor=5, report=5,
                                                           unknown=0)
          + stakesHint(title)                   // 0..15

tactical  = patternHit(category, role)          // 0..25  ← reads causality_findings
          + userPriorityTagBoost(event.tags)    // 0..20
          - skipPenalty                          // 0..10
          + followThroughBoost                  // 0..10

strategic = goalAlignment(event, user.goals)   // 0..15

importance = w_imm*immediate + w_tac*tactical
           + w_str*strategic*strategicGate      // tier weights from §2
```

`patternHit` looks up the event-type bucket in
`causality_findings.signal_summary.event_to_hrv` and
`event_to_rhr`; scales by `n`, `hrvDeltaPct` magnitude, and
`confidence` (strong=25, emerging=15, none=0).

`MIN_IMMEDIATE = 25` (provisional, revisit after shadow week).

Tie-breakers: `tactical desc`, `strategic desc`, `minutesUntilStart asc`.

**Deleted forever:** attendee count, organizer flag, recurring flag,
time-of-day, dimA/dimB gate, `JIT_THRESHOLD_UNIFIED`, +6/+3 relationship
boost.

---

## 6. Phase fan-out (unchanged)

`pickNextRankedCandidate`, `CATEGORY_MAX_SLOTS`, `phaseAlreadyAnchored`
consume the new ranked list. Pre/During/Post windows from
`events/event-phase-map.ts`. Only ranking changes.

---

## 7. Safe cutover

**PR 1 — shadow mode (no user-visible change)**
- New `_shared/jit/select-jit.ts` exporting `selectJitCandidates(events, ctx)`.
- New `_shared/jit/maturity-tier.ts` (reads `causality_findings`, returns weights).
- New async `resolve-attendee-relationship` edge function.
- New `attendee_relationships` table (RLS deny-by-default).
- Nullable `jit_event_context.shadow_v2_score` + `shadow_v2_components` + `shadow_v2_tier`.
- Behind `JIT_V2=shadow`: legacy still selects; new selector writes shadow rows.
- After 7 days: run `/mnt/documents/shadow-diff-week1.csv` to compare picks
  per user **and** tier distribution.

**PR 2 — flip + hard delete**
- `JIT_V2=on`. New selector is sole path.
- Delete: `scoreCalendarEventsLegacy`, `computeLegacyDimA/B`,
  `JIT_THRESHOLD_UNIFIED`, `getPreScoredEvents` bridge, weight block
  in `_shared/events/jit-candidates.ts`.
- `jit_event_context` becomes write-only observability.
- Drop `shadow_v2_*` columns once parity confirmed.
- Rollback = revert PR 2 commit.

---

## 8. Files

```text
supabase/functions/_shared/jit/
  select-jit.ts                 NEW   selector + scoring + tie-breakers
  maturity-tier.ts              NEW   tier resolver from causality_findings
  noise-filters.ts              NEW   personal/education noise lexicon
  relationship-weights.ts       NEW   role → weight table
  tactical-signals.ts           NEW   patternHit (reads causality_findings),
                                      priority tag, skip, follow-through
  goal-alignment.ts             NEW   strategic boost
  select-jit.test.ts            NEW   Imm/Tac/Str + noise + 4 tier fixtures

supabase/functions/resolve-attendee-relationship/
  index.ts                      NEW

supabase/migrations/<ts>_attendee_relationships.sql        NEW
supabase/migrations/<ts>_jit_event_context_shadow.sql      NEW (PR 1)
supabase/migrations/<ts>_jit_event_context_drop_shadow.sql NEW (PR 2)

supabase/functions/generate-mastery-plan/index.ts   wire selector (PR 1);
                                                    delete legacy (PR 2)
supabase/functions/_shared/events/jit-candidates.ts  weights deleted (PR 2)

mem://features/mastery-plan/jit-selection-v2        NEW — three pillars,
                                                    tier-weight table,
                                                    "patterns are read,
                                                    never recomputed",
                                                    personal noise list,
                                                    no attendee math
```

Memory prune (PR 2): remove any entry referencing attendee-count /
organizer / time-of-day scoring.

---

## 9. Confirmed open items

1. `MIN_IMMEDIATE = 25` — provisional; revisit after shadow week.
2. Generic-domain blocklist — confirmed (gmail/hotmail/outlook/icloud/yahoo/proton).
3. Cost guard 50 lookups/user/day — confirmed; tune after week 1.
4. Memory pruning of legacy-scoring references — confirmed.
5. Personal noise lexicon — confirmed.
6. Relationship in Immediate; user priority tag in Tactical — confirmed.
7. Skip penalty = past dismissals + "not relevant" feedback, cap −10.
8. **Tier weights shift Immediate → Tactical as patterns mature** (§2).
9. **Patterns are read from `causality_findings`, never recomputed in
   the JIT path** (per `mem://architecture/unified-pattern-store`).

Approve and I'll open PR 1 in build mode.
