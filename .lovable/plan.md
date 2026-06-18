## Scope

Isolated changes to the **Immediate axis** in `supabase/functions/_shared/jit/select-jit.ts`. Tactical, Strategic, tier weighting, sovereign tag layer, and `MIN_IMMEDIATE` threshold are **not** touched (except the documented side-effect on D-with-report).

Six sub-changes:

1. Re-rank `CATEGORY_BASE` (stakes-based ladder, B→**30**).
2. High-stakes interpersonal sub-bonus inside D.
3. Interview split: **media** vs **hiring (panel side)** vs **candidate (user being interviewed)** vs **bare/ambiguous**.
4. 1:1 seniority differentiation (boss/peer/report) — points wired now, LinkedIn resolver compatible.
5. Crisis detection → Smart Nudge only, excluded from Plan.
6. Confirm coverage of legacy labels (Ops, Internal Exec, All-hands) and patch a small list of identified blind spots.

---

## 1. New `CATEGORY_BASE` ladder

| Cat | Meaning | Now | New |
|---|---|---|---|
| A | High-Stakes Governance (board, investor, M&A, IPO, earnings) | 40 | **40** |
| C | Visibility & Communication (all-hands, media, keynote, town hall, panel) | 30 | **32** |
| B | Influence & Persuasion (pitch, negotiation, close, QBR-external) | 15 | **30** |
| D | People & Difficult Conversations (1:1s base; layoff/PIP gets +13 — see §2) | 20 | **22** |
| F | Conferences & External Events | 30 | **18** |
| G | Travel | 25 | **12** |
| E | Deep Work & Strategy | 10 | **10** |
| H | Daily Rhythm & Baseline | 5 | **5** |

## 2. High-stakes interpersonal sub-bonus

`interpersonalStakesBoost(title, categoryId, subtypeId)` — fires only when `categoryId === 'D'`. **+13** when title/subtype matches `layoff | restructure | termination | \bpip\b | (performance review .* (giving|deliver|delivering)) | difficult | escalation | conflict | critical negotiation`. D capped at 38 to prevent stacking with `stakesHint`.

## 3. Interview split — four buckets

The system needs to distinguish four interview shapes; here's how each is detected:

| Bucket | Detection signals | Immediate boost | Why |
|---|---|---|---|
| **Media interview** | title `\b(media\|press\|podcast\|cnbc\|bloomberg\|bbc\|ft\|wsj)\b.*interview` OR `subtypeId === 'media-publication'` OR resolved `categoryId === 'C'` | **+15** | Broadcast moment, reputational, unrepeatable |
| **User as candidate** (user being interviewed for a role) | title contains `(my\|with) interview at` OR `interview with .*(ceo\|founder\|partner\|chair)` OR title contains a company name + `interview` AND attendees ≥ 1 from that company's domain OR sovereign tag `my-interview` | **+18** | Highest personal-evaluative stakes — career-shaping, single shot |
| **Hiring (panel side)** — user interviewing a candidate | title `(candidate\|hire\|hiring\|panel interview\|loop)` OR attendees ≥ 2 with `subtypeId === 'hiring-loop'` OR title format `Interview: <Name> for <Role>` | **+6** (was +8) | Important but routine; bringing it slightly down vs candidate-side |
| **Bare ambiguous `interview`** | matches `\binterviews?\b` with no other signal | **+8** | Middle bet — covers most real-world calendar entries |

How the system tells **candidate-side** from **hiring-side** without an explicit tag:
- **Direction-of-evaluation signals** (in order of confidence):
  1. Sovereign tag `my-interview` → candidate-side (definitive).
  2. Title preposition: `Interview WITH <senior title at external company>` → candidate-side. `Interview: <Name> for <internal role>` → hiring-side.
  3. Attendee composition: if **majority of attendee domains ≠ user's own work domain** → candidate-side. If majority **===** user's domain (internal panel) → hiring-side.
  4. Calendar organizer: if the **organizer email is external** → candidate-side. If user or internal teammate → hiring-side.
  5. Recurrence: hiring loops often repeat as series (`Candidate panel — slot 2/4`); candidate-side interviews are one-offs.
- Fallback when no signal is decisive → bare/ambiguous bucket (+8).

Attendee gate stays: `attendeesCount ≥ 1`, else 0 (solo "interview prep" block excluded).

## 4. 1:1 seniority differentiation

`oneOnOneSeniorityAdjust(categoryId, dominantRole, attendeesCount)` — fires only when `categoryId === 'D'` AND `attendeesCount === 1`:

| Counterpart role | Adjust | Effective D |
|---|---|---|
| `boss` / `board_member` | +10 | 32 |
| `investor` / `client` | +8 | 30 |
| `peer` | 0 | 22 |
| `report` | −6 | 16 (drops below MIN_IMMEDIATE) |
| `unknown` | 0 | 22 (no penalty; LinkedIn resolver re-scores on next run) |

`dominantRole` flows through the existing `weightedDominantRole` path — no resolver work required in this change. LinkedIn results land as `AttendeeRoleSignal{ source: 'llm', confidence }` with no changes to `select-jit.ts`.

## 5. Crisis / Unplanned Escalation → routed to Smart Nudge

Plans take ~12 hours of lead time to be useful. Crises break that contract — the user needs a real-time nudge, not a Plan card. Detection rules in `isCrisisEvent(event, ctx)`:

An event is a crisis when **any** of:

1. **Title keyword**: `\b(urgent|crisis|emergency|escalation|incident|sev[- ]?[012]|p[012]|war ?room|all hands now|outage|breach|critical)\b`.
2. **Sovereign tag**: user-applied `crisis` or `urgent` (extend `sovereignTagAdjustment`).
3. **Lead-time heuristic**: `created_at` is **< 4 hours** before `start_time` AND categoryId resolves to A/B/C/D AND attendeesCount ≥ 2.
4. **Title-shift signal**: subject line contains `re-scheduled | moved up | bumped` AND new `start_time` is < 4 hours away.

**Behaviour:**
- Crisis events → pushed to `excluded` with `reason: 'crisis_route_to_nudge'`, plus surfaced on a new `crisisEvents: Array<{eventId, title, startMs, reasonDetail}>` on `SelectResult`.
- Plan never renders these.
- `generate-nudges` (separate plan) reads `crisisEvents` and emits an urgent push: *"URGENT block in 90 min — 2-minute Box Breath before you walk in."*

Plumbing required in `select-jit.ts`: new `createdAt?: string` on `SelectInputEvent`, threaded from `created_at` in `generate-mastery-plan/index.ts` loader.

---

## 6. Legacy label coverage + blind spots

### Legacy labels from the old Immediate axis — confirm they all map cleanly

| Old label | Maps to | Notes |
|---|---|---|
| Board | A | ✓ |
| Investor | A | ✓ |
| Deep Work | E | Demoted to base 10 ✓ |
| **All-hands / Leadership broadcast** | **C** | ✓ now correctly above B and Deep Work |
| 1:1 / Review | D | Now seniority-aware |
| **Internal Exec** (formerly B=15) | **B** (30) for pitch/negotiation; **D** for internal exec 1:1; **E** for strategy review | Was a single bucket; now split by intent. Title heuristics already do this via `event-classifier.ts`. |
| External / Client | B (pitch/negotiation/close) or C (broadcast) | Distinguished by `stakesHint` (+10) regardless of category landing |
| **Ops** (formerly E=10) | **H** (baseline) for standing ops review; **E** for strategy work | Old "Ops" lumped routine ops review and strategy — now routine ops sit in H, strategy in E. If neither fires, falls into H=5. |
| Misc | H | ✓ |

No legacy bucket is dropped. The mapping is tighter because `event-classifier.ts` already resolves subtypes — the Immediate axis just consumes them.

### Blind spots in the current Immediate axis (and how this plan patches them)

| Blind spot | Status | Fix in this plan |
|---|---|---|
| 1:1 with manager ≠ 1:1 with report | Currently flat D=20 | Patched (§4) |
| Candidate-side vs hiring-side interview | Currently identical | Patched (§3) |
| Media broadcast vs hiring panel | Currently identical | Patched (§3) |
| Layoff / PIP / termination same as standing 1:1 | Currently identical | Patched (§2) |
| Pitch / negotiation under-weighted | B=15 | Patched (§1, B→30) |
| Same-day crisis routes through Plan (useless) | Currently included | Patched (§5) |
| **Event duration ignored** — 4-hour offsite scored same as 30-min standup | Open | **Add as Phase-2** (separate plan): `durationBoost` (≥120min → +4, ≥240min → +8) |
| **Time-of-day fatigue** — last meeting of day scored same as first | Open | **Defer** — belongs in Tactical (pattern signal), not Immediate |
| **Back-to-back density** — 6th meeting in a row carries different load | Open | **Defer** — Tactical/contextual, not per-event |
| **First-instance vs recurring** — first board meeting vs 40th | Open | **Add as Phase-2**: `firstInstanceBoost` (+5 if `recurrence_index === 1`) |
| **Legal / regulatory / deposition** (testimony, court, regulator) | Currently no category | **Add now** — new keyword tier in `stakesHint`: `+15` for `\b(deposition|testimony|regulator|sec |ftc |doj |court hearing)\b` |
| **Earnings call** | Falls under A but not keyword-boosted | **Add now** — extend A keyword tier to include `earnings|quarterly results|guidance` |
| **Customer escalation** (named customer + escalation) | Partially via crisis | Covered by §5 crisis detection |
| **Speaking vs attending** at a conference | Currently flat F=18 | **Add now** — if title matches `\b(keynote|panel|speaking|fireside)\b` AND categoryId is F → route to C instead (more accurate category) |
| **Confidentiality / off-the-record** (`[CONF]`, `[CONFIDENTIAL]` in title) | No signal | **Defer** — needs UX decision (does Plan even render the title?) |
| **Health / therapy / family** (school play, surgery, partner anniversary) | Today filtered as personal_noise | **Keep as noise** — but flag for `isPersonalNoise` review separately; some users will tag them HIGH and that already works via sovereign tag layer |

The "Add now" items (legal/regulatory, earnings, speaking-vs-attending) are small constant additions inside `stakesHint` and a single category re-route — included in this implementation. Phase-2 items (duration, first-instance) are noted but not implemented to keep this PR isolated.

---

## 7. Tests (`supabase/functions/_shared/jit/select-jit.test.ts`)

Add ten cases:

1. `pitch_outranks_deep_work` — B(30) > E(10).
2. `all_hands_outranks_conference` — C(32) > F(18).
3. `layoff_gets_interpersonal_boost` — D≈35, ranks below A only.
4. `media_interview_scores_15` — CNBC interview → +15.
5. `candidate_side_interview_scores_18` — external organizer + `Interview with CEO at <co>` → +18.
6. `hiring_panel_interview_scores_6` — internal organizer + `Interview: Jane for SWE II` → +6.
7. `bare_interview_scores_8` — no disambiguator → +8.
8. `one_on_one_boss_vs_report` — boss=D+10 ranks, report=D−6 excluded.
9. `crisis_routed_to_nudge` — `URGENT: customer outage war room` excluded with `crisis_route_to_nudge`, present in `crisisEvents`.
10. `deposition_gets_stakes_boost` AND `speaking_at_conference_becomes_C` — combined keyword/route test.

Existing 17 tests must still pass; EY-vs-Chief-AI rebases to the candidate-side bucket if external (+18) or stays at +8 if ambiguous — ranking unchanged either way.

---

## What is NOT in scope

- LinkedIn / Firecrawl resolver implementation.
- `MIN_IMMEDIATE = 25` threshold.
- Tactical patternScore, sort tie-breaker, sovereign tag layer (beyond adding `crisis`/`urgent`/`my-interview` recognition).
- The Smart Nudge dispatch path (`generate-nudges`) — separate plan.
- Duration boost, first-instance boost, time-of-day fatigue — Phase-2.

## Files to touch

- `supabase/functions/_shared/jit/select-jit.ts` — re-rank constants, `interpersonalStakesBoost`, refactored `interviewBoost` (4-way), `oneOnOneSeniorityAdjust`, `isCrisisEvent`, `crisisEvents` on result, `createdAt` field, extended `stakesHint` keywords (legal/earnings), speaking-at-conference re-route.
- `supabase/functions/_shared/jit/tactical-signals.ts` — recognize `crisis` / `urgent` / `my-interview` in `sovereignTagAdjustment`.
- `supabase/functions/_shared/jit/select-jit.test.ts` — 10 new cases, baseline updates.
- `supabase/functions/generate-mastery-plan/index.ts` — pass `created_at` and calendar `organizer` / attendee domains into `SelectInputEvent` (for candidate-vs-hiring disambiguation).

## Follow-ups (separate plans)

- LinkedIn / Firecrawl resolver wiring into `AttendeeRoleSignal`.
- `generate-nudges` consumer of `crisisEvents`.
- Phase-2: duration boost, first-instance boost.
- Revisit `MIN_IMMEDIATE` after observing post-re-rank distribution.
