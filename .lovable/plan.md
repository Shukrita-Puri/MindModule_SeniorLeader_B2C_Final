# Why a travel pattern reminder was sent on a non-travel day

## What actually happened (verified on the live account)

The 09:30 reminder on 22 Sep was `pattern_alert` (`FB-PATTERN::B`):
"Travel → resting HR +27% — an early observation in your data, not a conclusion yet."

The stored finding behind it (`causality_findings`, 21 Sep, `cause_effect_v2`):

```text
event_to_rhr: [{ event_type: "Travel", rhrDeltaPct: 27.3, n: 2, lastSeen: "2026-08-17", confidence: "emerging" }]
```

Two travel days, both five weeks old, sent on a day with no travel. The same
finding also fired on 16 Sep (+26%) and 23 Aug (+23%) — it keeps resurfacing.

Gaps that let it through:

1. `cause-effect-engine/index.ts:955` lowers the minimum from 3 to 2 for
   `resting_heart_rate` only, so 2 travel days became "emerging".
2. `extractTopPattern` in `smart-nudges/index.ts` (the `causality_findings`
   branch) applies no sample floor at all — the in-context branch requires
   `n >= 3`, this one accepts anything stamped strong/emerging.
3. No recency or relevance test: `lastSeen` is never read, and nothing asks
   whether today has anything to do with travel.
4. The copy is present tense, so a historical association reads as today's fact.

## Decision: occurrence-based relevance, not a day floor

Your alternative is the better rule and it is what this plan builds. A pattern is
assessed on its **latest N occurrences of that event type**, not on a calendar
window. Leadership meetings every Monday self-refresh; a board meeting held
quarterly is still judged on its last 3 boards rather than being disqualified for
being 90 days old. No arbitrary 21 or 30 day floor.

Frequency still matters, as a **staleness ceiling** only — a safety net for an
event type that has simply stopped happening. That ceiling is derived per A–H
type from typical cadence, not a single number for everything.

## 1. New file: `_shared/events/event-cadence.ts`

One typed table of expected cadence per A–H pillar, with subtype overrides where
cadence differs sharply inside a pillar (e.g. daily standup vs quarterly board):

```text
A Board & Governance        quarterly   ceiling ~12 months
B Influence & Persuasion    weekly      ceiling ~3 months   (investor call: weekly)
C Visibility & Communication monthly    ceiling ~6 months
D Interpersonal High-Stakes  weekly     ceiling ~3 months
E Deep Work & Strategy       daily      ceiling ~6 weeks
F Conferences & External     quarterly   ceiling ~12 months
G Travel                     monthly     ceiling ~6 months
H Daily Rhythm & Baseline    daily       ceiling ~4 weeks
```

Exports: `cadenceFor(categoryId, subtypeId?)`, `stalenessCeilingDays(...)`,
`isPatternStale(lastSeen, categoryId, subtypeId?)`. Pure module, no IO, unit
tested. Cadence values live here only — no consumer hardcodes a window.

## 2. Pattern eligibility for nudges, plan and brief only

A shared helper (`_shared/patterns/pattern-eligibility.ts`) applied by
`smart-nudges`, `generate-mastery-plan` and the brief:

- require `n >= 3` occurrences;
- require the finding not be stale by its own cadence ceiling;
- rank by confidence, then recency of `lastSeen`, then magnitude.

**Insights is explicitly unchanged.** The Insights page and its cards keep
reading `causality_findings` exactly as they do today, including 2-sample
emerging findings — no change to the engine's write path either, so nothing
disappears from the causality screen.

## 3. A pattern is only cited in its own context

A pattern about an A–H type may only be quoted when the surface is talking about
that type — that slot's anchor event, or a day that actually contains one. Read
through the single resolver (`resolveEvent`), so a Travel pattern cannot appear
on a day with no travel, and a conference pattern cannot appear on a day with no
conference.

Travel has one extra timing rule: travel copy is only valuable **on the travel
day itself or the evening/day before**, sourced from the existing travel SSOT
(`_shared/travel/travel-day.ts`) and persisted trip windows. Outside that, no
travel-anchored reminder.

## 4. Historical and forward framing

Copy states occurrence counts, not a vague era, and marks direction of time:

- past: "Previous 3 travel days your resting heart rate ran +27%."
- before an upcoming block: "2 travel days ahead — your past 3 showed +27% RHR."
- a run: "3 weeks of travel ahead — your past 3 travel periods ran +27% RHR."
- day-before recovery framing: "Heavy day, HRV at 18ms. Let this evening be
  recovery before tomorrow's travel."

All generated inside the existing copy gate (word/char limits, forbidden words,
qualified CTA verb), and only from real stored numbers.

## Technical notes

- `extractTopPattern` returns `event_type`, `categoryId`, `n` and `lastSeen`, and
  delegates the decision to the shared eligibility helper.
- `cause-effect-engine` keeps writing what it writes today (including the RHR
  n=2 exemption) so Insights is untouched; filtering happens at consumption.
- Every new read is failure-tolerant: missing cadence, `lastSeen` or travel state
  means the candidate is skipped, never an error.

## Safety and co-dependencies

- Isolated to the pattern-citation path. No schema change, no frontend change,
  no change to Insights behaviour.
- `smart-nudges` — only the pattern-alert branch and pattern-citation helper.
  Windows, quiet hours, daily cap, 2h spacing, silent-sync exclusion,
  week-ahead, light-day and JIT rules untouched.
- `generate-mastery-plan` / brief — only the clause that cites a pattern; day
  shape, arcs, readiness gate and all other why-line evidence unchanged.
- `_shared/travel/travel-day.ts` and `resolve-event-category.ts` are read only,
  not modified, so Brief, Plan, Week Ahead and Insights resolution are unaffected.
- New shared files are additive; nothing existing imports them until wired.

## Verification

- Unit tests: cadence table per pillar; n=2 rejected for nudges/plan/brief;
  quarterly board at 90 days still eligible, at 14 months stale; travel pattern
  rejected two days before travel, accepted the evening before and on the day;
  conference pattern rejected on a non-conference day; each framing string passes
  the copy gate.
- A test asserting the Insights read path is unchanged.
- Forced dry-run of `smart-nudges` for this account: the Travel pattern no longer
  qualifies and the suppression reason is logged.
- Full backend suite; deploy `smart-nudges`, then `generate-mastery-plan`, then
  `compute-outer-readiness`, one at a time, verifying each live before the next.
