# Stage 1 — answers before building

## 1. Every subcategory A–H, with your last-365-day counts (distinct days)

Counts are distinct calendar days, cross-provider duplicates collapsed.
Anything not listed with a count has 0 days in the last year.

### A Board & Governance
| Subcategory | Covers | Your days |
|---|---|---|
| trustee | school / nonprofit / trustee board | 0 |
| board_meeting | main board meeting | **4** |
| board_committee | audit, remco, sub-committee | 1 |
| board_prep | prep session before a board | 0 |
| nonexec_board | NED / non-exec board | 0 |
| investor_meeting | investor update meeting | 0 |
| earnings_call | earnings / results call | 0 |
| qbr | quarterly business review | 0 |
| budget_review | budget / forecast review | 0 |
| ma_discussion | M&A discussion | 0 |
| strategy | strategy planning session | 0 |

**Recommend subtype level.** A board meeting, a committee and a budget review
carry very different stakes and preparation.

### B Influence & Persuasion
| Subcategory | Covers | Your days |
|---|---|---|
| pitch_competitive | competitive pitch / RFP | 0 |
| fundraising | fundraising / investor pitch | 2 |
| negotiation | negotiation, term discussions | 0 |
| client_presentation | client or customer presentation | 1 |

**Recommend subtype level.** A fundraise and a routine client presentation are
not the same demand.

### C Visibility & Communication
| Subcategory | Covers | Your days |
|---|---|---|
| roundtable | speaking on a roundtable | 0 |
| stakeholder_communication | formal stakeholder comms | 0 |
| media | media, press, podcast | 1 |
| town_hall | all-hands / town hall | 0 |
| speaking | keynote, conference panel | 0 |

**Recommend subtype level** — exactly your interview-vs-internal-update example.

### D Interpersonal High-Stakes
| Subcategory | Covers | Your days |
|---|---|---|
| executive_1on1 | 1:1 with an exec or peer | **7** |
| leadership_sync | exec / leadership team sync | 0 |
| performance_review | performance review | 0 |
| difficult_conversation | escalation, hard conversation | 0 |
| layoff | layoff / restructure | 0 |
| hiring_interview | interviewing a candidate | 1 |
| hiring_committee | hiring committee / being interviewed | 0 |
| crisis_decision | crisis or incident call | 0 |

**Recommend subtype level.** A 1:1 and a layoff conversation are incomparable.

### E Deep Work & Strategy
| Subcategory | Covers | Your days |
|---|---|---|
| community | member group / community session | **13** |
| routine_sync | catch-up, routine sync | **4** |
| learning | passive attendance, webinar | **3** |
| deep_work | protected focus block | 1 |
| product_launch | launch / go-live | 1 |
| review | BP / product / design / sprint review | 0 |
| compliance | compliance, legal, filing | 0 |

**Recommend subtype level.** A webinar and a launch are opposite ends of demand.

### F Conferences & External Events
| Subcategory | Covers | Your days |
|---|---|---|
| attendance | attending a conference / summit | 1 |
| event | award, summit, networking, multi-day event | 1 |
| workshop | off-site, retreat, workshop, open day | 0 |

**Recommendation: category level.** Note that speaking at a conference is not in
F at all — keynote and panel resolve to **C.speaking**. So everything left in F
is "being at an external event all day", one experience, exactly like Travel.
Your speaking-vs-attending distinction is preserved because it is a C-vs-F
distinction, not a within-F one.

### G Travel — category level (confirmed)
flight, long-haul flight, accommodation, travel day.

### H Daily Rhythm & Baseline — subtype level (confirmed)
| Subcategory | Covers | Your days |
|---|---|---|
| social | personal social | **5** |
| wellness_self_care | fasting, self-care | **5** |
| holiday | public / bank holiday | 1 |
| recreation | culture, recreation | 1 |
| wellness_fitness | training, exercise | 0 |
| wellness_health_check | check-up | 0 |
| wellness_medical | medical appointment | 0 |
| family | family / personal | 0 |
| pto | time off | 0 |

21 further days hold only events the resolver does not recognise; they count
toward no pattern.

**Reaching 3+ today:** E.community 13, D.executive_1on1 7, H.social 5,
H.wellness_self_care 5, A.board_meeting 4, E.routine_sync 4, E.learning 3, and
G Travel at category level (3). Not yet: B.fundraising 2, F 2, C.media 1.

## 2. Travel recounted by distinct day — including short-haul and day trips

A travel day is **one distinct local day** with travel evidence from any of
three sources, read from the existing travel modules (no new definition, no
edits to them):

1. a recorded trip window (`travel_state.meta.trips`, calendar- or
   location-sourced),
2. distance from home above the existing 50 km threshold on that day (this is
   what makes London → Oxford a travel day, same timezone, no flight),
3. travel-titled calendar evidence (flight, hotel, transit, offsite).

Flight + hotel + transit on the same day is one day, never three. Consecutive
days inside one trip each count as their own day, and the trip is never
double-counted.

What your stored data actually holds today:

- Calendar travel evidence: 9, 15, 17 August (one trip, 9–17 Aug).
- Recorded trip windows: 17 Sep (offsite) and 29 Sep (flight, upcoming). Note
  these windows only cover a rolling ±30 days, so older ones are gone.
- Location history: 138 position fixes across 25 days, starting 16 July, and
  currently 0.05 km from home.

So the honest count today is **5 distinct travel days** (9, 15, 17 Aug, 17 Sep,
and 29 Sep ahead). Your 1 September Oxford day trip left no stored evidence —
no calendar entry, no trip window, no position fix beyond home that day — so it
cannot be counted retrospectively. From now on the distance rule records days
like it automatically; I won't invent it backwards.

## 3. Sleep and recovery

Yes, both can be added in this run with no Insights risk, because they are new
keys written by the new pass and nothing existing is recalculated:

- **sleep** — mean sleep score on the nights following that subtype's events vs
  your own baseline.
- **recovery** — next-morning resting-heart-rate recovery (days to return within
  5% of baseline), which the engine already knows how to compute.

Caveat for your own account: you have no sleep data from the watch, so the sleep
key will be empty for you and is silently skipped — not an error.

## 4. Everything that reads `causality_findings`

| Reader | Reads | Effect of new keys |
|---|---|---|
| `performance-rhythm-insights` | `payload` + `signal_summary` for the Insights card | none — reads named fields only |
| `src/components/insights/PerformanceRhythmCard.tsx` | that function's response | none |
| `generate-mastery-plan` | `signal_summary` (3 places) | will be switched to the new keys |
| `compute-outer-readiness` (Brief) | `signal_summary` | will be switched to the new keys |
| `smart-nudges` | `signal_summary` | will be switched to the new keys |
| `_shared/jit/*` (select-jit, tactical-signals, load-jit-context, maturity-tier) | pattern summary passed in from the callers above | none — they receive a summary object and read named fields |
| `_shared/brief/deterministic-brief.ts` | pattern fields passed in | none |
| `src/utils/rules/calendarEvents.ts` | relationship weights derived from the summary | none |
| `admin-user-delete-preview` | row count for deletion preview | none |

Every reader accesses named fields, so an added key is ignored. None will break
or behave differently.

## 5. Data size, and the cap

Per occurrence: a date plus a title, roughly 60–80 bytes. Uncapped, an active
year could hold 60+ occurrences in a busy subtype across four measures — tens of
kilobytes per user per day, stored daily, which grows fast.

Proposed cap: **the 20 most recent occurrences per pattern**, titles truncated to
80 characters, and at most **12 subtype patterns per measure** (ranked by
strength). That lands at roughly **8–12 KB per user per day**. `n` always
reports the true total occurrence count even when the stored list is capped, so
the copy still says "your last 7 board meetings" correctly.

## 6. Exact structure (all inside `signal_summary`, no new column or table)

```text
signal_summary.subtype_patterns_365: {
  generatedAt: "2026-09-23T…",
  windowDays: 365,
  items: [
    // A–E and H: subtype level only
    {
      matchLevel: "subtype",
      categoryId: "A",
      subtypeId: "gov.board_meeting",
      subcategory: "board_meeting",
      label: "Board meeting",
      measure: "rhr" | "hrv" | "sleep" | "recovery",
      n: 4,                          // true total occurrences, never capped
      deltaPct: 18.2,                // signed, vs your own baseline (rhr/hrv/sleep)
      recoveryDays: null,            // used only when measure = "recovery"
      direction: "harm" | "recovery",
      confidence: "strong" | "emerging",
      lastSeen: "2026-09-02",
      qualifies: true,               // 3+ occurrences, harm, above threshold
      occurrences: [{ date: "2026-09-02", title: "OHS board meeting" }, …] // ≤20
    },

    // G and F: BOTH levels stored.
    // (a) subtype entries — stored for future Insights use, never surfaced now
    { matchLevel: "subtype", categoryId: "G", subtypeId: "trv.flight",
      subcategory: "flight", label: "Flight / Travel", surfaced: false, … },

    // (b) the category entry — the only one nudges, Plan and Brief read
    {
      matchLevel: "category",
      categoryId: "G",
      subtypeId: null,
      subcategory: null,
      label: "Travel",
      measure: "rhr",
      unit: "trip",                  // occurrences are trips, not days
      n: 2,                          // number of separate trips
      perDay:  { deltaPct: 12.4, n: 5 },   // avg change per travel day
      perTrip: { deltaPct: 14.1, recoveryDays: 2, n: 2 }, // whole-trip effect
      direction: "harm",
      confidence: "emerging",
      lastSeen: "2026-09-17",
      qualifies: false,              // fewer than 3 trips
      occurrences: [{ start: "2026-08-09", end: "2026-08-17", days: 3,
                      titles: ["Flight to New York (BA 183)", …] }, …]
    }
  ]
}
```

F Conferences uses the same two-level shape with `unit: "day"`. All existing
keys (`event_to_rhr`, `event_to_hrv`, `sleep_to_prs`, `consecutive_load`,
`performance_lift`, `event_to_cognition`) and `payload` are written exactly as
today.

## 7. Only the pattern clause switches — every `signal_summary` read

**generate-mastery-plan**

| Read | Purpose | Verdict |
|---|---|---|
| line ~250 fallback snapshot fetch | passes the raw summary through to shared context | unchanged |
| line ~4836/4854 main fetch | supplies the summary object to JIT selection | unchanged |
| line ~6241 `event_to_hrv` → `forceArcCategoryIds` | decides which arcs are forced | **unchanged** (day-shape/arc logic) |
| line ~8417 `patternSummary` for the why-line | quotes a pattern in copy | **switches** to `subtype_patterns_365` + shared check |

**compute-outer-readiness**

| Read | Purpose | Verdict |
|---|---|---|
| `performance_lift.hr_event_lift` (~7823) | prompt framing of positive lift | unchanged |
| `event_to_rhr` (~7860) | quotes a pattern to the brief | **switches** |
| `event_to_hrv` (~7878) | quotes a pattern to the brief | **switches** |
| `event_to_cognition` (~7894) | quotes a pattern to the brief | **switches** |
| `sleep_to_prs` (~7911) | sleep→score line, not event-typed | unchanged |
| `consecutive_load` (~7919) | back-to-back load line, not event-typed | unchanged |
| `performance_lift.category_lift` (~7928) | positive-events framing | unchanged |

**smart-nudges**

| Read | Purpose | Verdict |
|---|---|---|
| `hydratePatternStore` (~1461–1480) | builds the ctx object | unchanged; a new field is added alongside |
| `event_to_hrv` bpm lookup (~1538) | pill/context numbers | unchanged |
| `evaluatePatternAlert` top `event_to_hrv` (~4760) | the pattern nudge itself | **switches** |
| `consecutive_load` (~4798) | consecutive-load nudge, not event-typed | unchanged |
| `extractTopPattern` (~4838–4930) | the pattern nudge's text | **switches**; its `sleep_to_prs` / `consecutive_load` branches stay |

Nothing else in these functions changes.

## 8. Downstream readers — before and after

| Reader | Receives today | After |
|---|---|---|
| `_shared/jit/select-jit.ts` | `ctx.signalSummary` = the raw row summary | identical raw object. JIT rules unchanged. |
| `_shared/jit/tactical-signals.ts` | reads `event_to_hrv` / `event_to_rhr` off that object | identical — still the 60-day keys |
| `_shared/jit/maturity-tier.ts` | same object, for tier weights | identical |
| `_shared/jit/load-jit-context.ts` | fetches `signal_summary` itself | identical |
| `_shared/brief/deterministic-brief.ts` | `event_to_hrv` + `consecutive_load` passed in | `consecutive_load` identical; its one `event_to_hrv` sentence **is** a pattern citation, so it is gated by the shared check and fed from the 365 keys — and stays silent when nothing qualifies |
| `src/utils/rules/calendarEvents.ts` | `priority_tag_observation` relationship weights | identical, untouched |

The added key is additive, so every one of these keeps receiving exactly what it
receives today. If you would rather the deterministic brief's sentence stay on
the old data, say so and I will leave it alone.

## 9. Travel counted by trip — your real number

Trips on record: **9–17 August** (3 travel days) and **17 September** (1 day) —
so **2 completed trips**, plus 29 September ahead. Under the 3-trip rule,
Travel does **not** qualify today, which is exactly why the 22 September
reminder must be refused.

Measured both ways inside the category entry: per travel day (average change vs
your baseline across all travel days) and per trip (whole-trip change plus days
to return within 5% of baseline after the trip ends). Same rules apply to both
— 3+ trips, harm, above threshold — and a message may cite either with real
numbers only.

*Noted for a later run, not built now:* a post-trip observation sent after you
return, computed from that trip's own readings against your baseline, with no
3-trip requirement because it reports what happened rather than a pattern. It
would run off the closed trip window, compare the trip days and the days after
to your 14-day baseline, and send once within 48 hours of return.

## 10. Recovery threshold

The engine has no day-based harm threshold today — it only has a 7-day
look-ahead for recovery, so the 10%/15% rules genuinely don't apply. **My
proposal, not an existing rule:** recovery is measured as days until the measure
returns within 5% of your own baseline; **2+ days counts as meaningful harm
(emerging), 3+ days as strong**, and same-day or next-day return is not harm.
Tell me if you want different numbers.

## 11. Cap never drops a qualifying pattern

The 20-occurrence and 80-character caps stay. The 12-per-measure limit applies
**only to non-qualifying patterns**: everything with 3+ occurrences, harm and
above threshold is always kept, however many there are, and the cap trims the
remainder.


---

# Stage 2 — build rules (for your reference, not started)

- New 365-day pass runs **only after** the existing 60-day calculation has saved
  successfully; it lives in its own section and changes no existing setting,
  window or threshold.
- Nudges, Plan and Brief read **only** `subtype_patterns_365`, never the 60-day
  keys, for every A–H type.
- The 60-day calculation stays because Insights uses it. Later-run note: moving
  Insights onto the 365-day data would mean re-pointing
  `performance-rhythm-insights` and its card fields, then the 60-day pass can go.
- Failure isolation: the new pass has its own time limit well inside the engine's
  budget, and on any error, timeout or missing data it stops quietly, logs why,
  and the run still saves the existing results without the new keys.
- On/off switch: an environment setting disables the new pass with no redeploy;
  when off the engine behaves exactly as today.
- Then the approved shared check (`_shared/patterns/pattern-eligibility.ts`), the
  six rules, the engine's own 10% / 15% and 0.5 / 1.0 thresholds, the copy and
  the test list, all as previously approved.

# Stage 3 — test and deploy (as you specified)

Save today's engine output, dry-run the new engine without saving and show
existing-output-identical, new subtype results and run time before/after, full
test suite including the Insights identical test. Deploy the engine alone with
the previous version held ready, run once for your account, then confirm the next
scheduled all-user run is clean before smart-nudges, then generate-mastery-plan,
then compute-outer-readiness — with the 22 Sep dry run naming the rule that stops
the travel reminder.

---

# Stage 1 addendum — your latest eight points

Recovery threshold accepted as stated (2+ days emerging, 3+ strong, same/next
day not harm).

## 12. Signal pills — confirmed, they never cite an event pattern

Checked `_shared/signal-pills/derive-pills.ts`. The three pills are built only
from wearable readings and check-in answers. A pill is marked "pattern" in just
two cases — a 3-day resting-heart-rate trend and a sustained-deficit flag — both
of which are your own wearable trend against your own baseline, not an event
type. **No pill shows anything like "Travel +27%".** Pills stay on the 60-day
data, untouched.

## 13. JIT — what changes, what doesn't

JIT has exactly one pattern-to-copy path, and one scoring path:

- **Changes:** nothing inside JIT selection itself. The pattern text that
  reaches copy is produced by the Plan (`patternSummary`, line ~8417) and the
  Brief, and those two are the citations already switching to the 365 data
  through the shared check.
- **Unchanged:** `patternHit` in `_shared/jit/tactical-signals.ts` keeps reading
  the 60-day `event_to_hrv` / `event_to_rhr` for its 0–35 score,
  `maturity-tier.ts` keeps its tier weights, `select-jit.ts` keeps every
  threshold, exclusion, horizon and crisis rule, and `patternSignal` stays on
  each candidate for diagnostics. So scoring, ranking and timing are identical;
  only the sentence a reader sees is gated.

If you would rather JIT's *score* also moved onto the 365 data, that changes
which cards get picked — I would not do it in this run.

## 14. Brief and Plan — positive and negative

Positive data **does** record occurrence counts: every `performance_lift` entry
(`hr_event_lift`, `category_lift`, `subcategory_lift`, `sleep_to_peak`) carries
its own `n`. So the 3-occurrence minimum can be applied to positive framing with
no engine change — I just add the `n >= 3` filter where those lines are built.

- Positive framing: unchanged source, plus `n >= 3`.
- Negative framing: new, from the 365 data through the shared check.
- Both: 3+ occurrences, includes your latest occurrence, quoted only alongside
  their own event type, on the day or the day before.
- When an event has both, the negative line comes first and the positive is added
  only if the length limits allow.
- Nudges stay negative-only.

## 15. Cognition — confirmed

This run: the Brief's `event_to_cognition` sentence stays on its current data and
only gains the 3-occurrence minimum (it already filters `n >= 3`, so this is a
confirmation, not a change). No engine work for cognition now.

**Run 2 (written up, not built):** add cognition to the 365 pass using the
engine's existing 0.5 / 1.0 tier thresholds, same safety measures — existing
work saves first, new pass fails quietly with its own time limit, on/off switch,
dry run against saved output, Insights untouched, engine deployed alone then the
readers one at a time. Then move the cognition sentence onto the shared check.

## 16. Trip history is carried forward — confirmed

The 365 pass reads its own previous `subtype_patterns_365` result and merges the
trips it already recorded with whatever the travel modules currently expose, so a
trip found in September is still there in December even after the ±30-day window
has moved on. Dedupe is by start date. No changes to the travel modules, no
schema change.

## 17. Upcoming events — awareness only, confirmed

An upcoming event sets the "right time" rule and nothing else. It is never an
occurrence. A day becomes a travel occurrence only after it happens and is
confirmed on the day by distance from home over the existing 50 km threshold, a
trip window, or a location record. Planned travel that didn't happen never
counts. **Confirmed: the current count of 2 trips excludes 29 September.**

## 18. 17 September — both, and why

That day holds two different things:

- the calendar event "The AI:ROI Conference", which resolves to **F Conferences
  (attending)**, and
- a recorded trip window for 17 Sep with evidence "offsite", which makes it a
  **Travel** day too.

So it counts once under F and once under G. That is correct rather than
double-counting: they are separate patterns answering separate questions ("what
do conference days cost me?" and "what does being away cost me?"), and no single
message ever cites both for the same day.

## 19. Title reading — logged, not fixed here

"First Flight Innovation Forum" on 29 September is a forum hosted by First
Flight, not a flight. The resolver is reading the word "flight" in the title.
Noted as the next piece of work, not touched in this run. **Point 17 already
stops it from becoming a travel occurrence**, because a travel occurrence
requires same-day confirmation from distance, a trip window or a location record
— a title alone can never create one.

## 20. Notes for the later Insights run

- `forceArcCategoryIds` in generate-mastery-plan (line ~6241) uses the 60-day
  `event_to_hrv` with no occurrence minimum. Left exactly as is; to be revisited
  with the Insights migration.
- Moving Insights onto the 365 data means re-pointing
  `performance-rhythm-insights` and its card fields, after which the 60-day pass
  can be retired.
- Title misreading (point 19).
- Post-trip observation message (Stage 1, point 9).

