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
    {
      matchLevel: "subtype" | "category",   // category → G and F
      categoryId: "A",
      subtypeId: "gov.board_meeting",       // null when matchLevel = "category"
      subcategory: "board_meeting",         // null when matchLevel = "category"
      label: "Board meeting",
      measure: "rhr" | "hrv" | "sleep" | "recovery",
      n: 4,                                  // true total, never capped
      deltaPct: 18.2,                        // signed, vs your own baseline
      direction: "harm" | "recovery",
      confidence: "strong" | "emerging",
      lastSeen: "2026-09-02",
      occurrences: [{ date: "2026-09-02", title: "OHS board meeting" }, …]  // ≤20
    }
  ]
}
```

G Travel and F sit in the same `items` array with `matchLevel: "category"` and
null subtype fields, so the shared check can tell them apart without a second
location. All existing keys (`event_to_rhr`, `event_to_hrv`, `sleep_to_prs`,
`consecutive_load`, `performance_lift`, `event_to_cognition`) and `payload` are
written exactly as today.

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
