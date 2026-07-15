# Pre-merge verification for PR2 — results + revised recommendation

Ran the three checks. Two of them return red flags that change the shape of PR2. Details below, then the revised proposal.

---

## Check 1 — `\bAway\b` and `\bday\s*off\b` false-positive stress test

Tested the proposed extended regex
`/\b(ooo|out\s*of\s*office|pto|vacation|annual\s+leave|on\s+leave|holiday|public\s+holiday|bank\s+holiday|national\s+holiday|day\s*off|away)\b/i`
against realistic exec-calendar titles.

### False positives on `\baway\b` (WORK titles wrongly classified as PTO)

| Title                            | Verdict | Real-world hit |
|----------------------------------|---------|----------------|
| `Team Away Day`                  | MATCH   | UK offsite (WORK) |
| `Away Day Q4`                    | MATCH   | UK offsite (WORK) |
| `Company away day`               | MATCH   | UK offsite (WORK) |
| `Away game vs Arsenal`           | MATCH   | Personal event, not PTO |
| `Away from desk 2pm`             | MATCH   | Focus block, not PTO |
| `Project Away kickoff`           | MATCH   | Project meeting |
| `Away Team sync`                 | MATCH   | Sales team sync |
| `Give-away campaign review`      | MATCH   | Marketing review |
| `Move it away from Friday`       | MATCH   | Scheduling note |

The UK-common phrase **"Team Away Day"** / **"Away Day"** is the killer — this is a work offsite, not PTO, and it's exactly the kind of high-stakes anchor event Brief and Plan must reason about. A widened regex marks the day as PTO and drops the event silently.

### False positives on `\bday\s*off\b`

| Title                       | Verdict | Real-world hit |
|-----------------------------|---------|----------------|
| `Day off-site`              | MATCH   | Work offsite |
| `Kick day off with standup` | MATCH   | Kickoff colloquial |
| `Round day off`             | MATCH   | Round-off / recap |
| `Sign day off checklist`    | MATCH   | Sign-off checklist |
| `Day off Tue`               | MATCH   | Legit PTO (true positive) |

The word-boundary matches trip on kickoff / sign-off / round-off phrasing that treats "day" and "off" as adjacent by coincidence.

### Verdict

Both proposed additions have real false-positive risk on realistic exec calendar titles. The `\bAway\b` case in particular is high-severity because `Team Away Day` is a common WORK anchor that would be silently reclassified. **The plan's Option A on decision point #1 needs to change.**

---

## Check 2 — Full existing SSOT test suite that must be green on PR2

Existing test files at `supabase/functions/_shared/availability/`:

- `availability-classifier.test.ts` (182 lines, 15+ test cases including regional holiday applicability, explicit PTO, travel-for-work overrides, FYI feeds)
- `availability-classifier-consolidation.test.ts` (95 lines, shim-import + SSOT round-trip)
- `availability-cross-surface.test.ts` (284 lines, Brief/Plan/Nudges cross-surface parity)

Total: 561 lines, 3 files. **All three must run green as a merge gate on PR2**, not just the new 6-row lock. Any change to `PTO_TITLE_RX` inherits into these existing cross-surface assertions and must not regress them.

---

## Check 3 — "Additive is safe" — actually verified

Searched Brief / Plan / Executive Home orchestrator for consumers that branch on `isPtoOrHolidayTitle` in ways that would silently change behaviour if the regex widens. Three real hits:

### 3a. `_shared/brief-signal-coverage.ts:203-211` — meeting exclusion filter

```ts
function isMeetingLikeEvt(e) {
  if (!isConfirmedEvt(e)) return false;
  if (e.isAllDay) return false;
  if (isTravelTitle(e.title)) return false;
  if (isPtoOrHolidayTitle(e.title)) return false;   // ← title-only, NOT gated by isAllDay
  ...
}
```

A timed 9-to-5 event titled `Team Away Day` — under the widened regex — would be silently **dropped from Brief's meeting count entirely.** Brief would show the CEO an empty calendar on their offsite.

### 3b. `build-executive-home-cards/day-type.ts:100-125` — real-meeting counter

`hasRealMeeting` and `realMeetingMinutes` both explicitly exclude events matching `isPtoOrHolidayTitle`, again title-only. Widening the regex means `Team Away Day` (a full-day timed offsite) drops out of the meeting-minutes tally → day flips to `light_day` → afternoon regen suppressed → orchestrator downgrades a high-stakes day to a light one.

### 3c. `build-executive-home-cards/index.ts:189` — consecutive-off-day lookback

Uses `isAllDay && isPtoOrHolidayTitle` so is gated correctly. Safe.

### Verdict

The "additive is safe" assumption is **falsified**. `isPtoOrHolidayTitle` is used as a title-only filter in Brief (3a) and Executive Home (3b), not just as a state classifier. Widening the regex silently changes what counts as a meeting on both surfaces. The Team-Away-Day case makes this concrete: a full-day offsite currently classified as WORK would silently become an off-day with no meetings, which is the exact failure mode the plan claimed monotonicity would prevent.

---

## Revised recommendation

The original PR2 plan (Option A on decision points 2b) is **not safe to ship as specced**. Two workable paths forward:

### Path A (recommended) — narrower SSOT extension + gate title-only filters on `isAllDay`

1. **Do NOT add bare `\baway\b`.** Replace it with either:
   - Drop the `away` addition entirely; accept that "Away" as a bare title reads as WORK (current SSOT behaviour). Real users type `PTO`, `Annual leave`, `On leave`, or `Holiday`. Lose almost nothing.
   - OR add a very narrow variant that requires a PTO-anchoring suffix: `\baway\s+(all\s*day|today|through|until|this\s+(week|month)|for\s+\d)\b`. Manually stress-test the new pattern against the same false-positive list before shipping. This is the "if we insist on catching informal titles" path.
2. **`\bday\s*off\b`** — narrow to a boundary that excludes kickoff/sign-off/round-off collisions. Options:
   - Title-anchored: `^(?:my\s+|taking\s+(?:a|the)\s+)?day\s*off\b` (matches "Day off", "Day off Tue", "Taking the day off"; rejects "Kick day off with standup", "Sign day off checklist").
   - Whole-title equality: `^\s*day\s*off\b`. Slightly stricter, same intent.
3. **Add an `isAllDay` gate to `isMeetingLikeEvt` (brief-signal-coverage.ts:208) and to `hasRealMeeting` / `realMeetingMinutes` (day-type.ts:100, 125)** — title-only exclusion is the actual bug. A timed 9-5 "PTO" is nonsense; if the SSOT title matches AND the event is all-day, exclude it; otherwise it's a meeting. This is a small, defensive fix that neutralises the entire class of widened-regex-drops-work-events problem regardless of future SSOT changes.
4. Land Path A behind a git-branch-only PR, run the full 561-line existing SSOT suite plus the new 6-row lock plus the `Team Away Day` / `Day off-site` fixtures added as false-positive locks, review, then merge.

### Path B — smaller, launch-safest cut

Skip the SSOT regex change entirely. C2 becomes: delete `AWAY_KEYWORDS`, `TRAVEL_KEYWORDS`, `OOO_KEYWORDS` from `event-classifier.ts` and rewrite `detectDayKindFromEvents` to call the SSOT as-is. Accept that:
- `Out of office` / `OOO` still work (already in SSOT).
- `Day off` / `Away` — previously suppressed nudges under old C2, will now behave as WORK under the SSOT. Document this as a semantic tightening in the mem doc. Real impact: nudges continue on informal PTO titles until the user retitles or the SSOT gets Path A step 1 later.
- No change to `PTO_TITLE_RX`, so Brief and Plan see zero behaviour delta from PR2. **This is the safest pre-launch shape.**

### My recommendation

Land **Path B** as PR2 now (contained, zero SSOT change, zero Brief/Plan behaviour delta). Do Path A as a separate PR3 **post-launch**, together with the `isAllDay`-gate defensive fix — that fix is worth doing on its own merit even if the SSOT never widens, because it closes a class of bug where any future regex loosening (deliberate or accidental) can silently drop work events.

Both C3/C4 stay as mem notes only. C1 stays branch-only until post-launch.

## Deliverables of THIS response

- Verification results above (evidence in the plan body, no code changed).
- If Path B is approved: revised PR2 spec with the 6-row lock updated so `Day off`, `Away`, `OOO`, `Out of office` rows document the intentional semantic tightening rather than a suppressed change.
- If Path A is approved instead: extended PR2 spec with the narrower regexes, the `isAllDay` gate fix, and the false-positive lock fixtures.
- Mem-doc addendum for C3/C4 (unchanged from prior turn).
- PR1 (C1) hold-until-post-launch note (unchanged from prior turn).

## Out of scope (unchanged)

- Physical move under `ceo-behaviour/`.
- Deletion of `holiday-applicability.ts` shim.
- Any change to consumer logic beyond the `isAllDay` gate in step 3 of Path A.

## Technical notes

- The stress-test fixtures are synthetic but drawn from patterns that appear literally in this repo's own strings (`Team away`, `Day off-site`, `sign-off`, `kickoff`). This is not hypothetical — the collision surface is real.
- `\bAway\b` on its own can never be safe in a title-only predicate: "Away Day" is idiomatic English for an offsite. The only way to keep it is to gate on `isAllDay` at the call site, which we should do anyway.
- The `isAllDay` gate fix is 3 lines across 2 files (`brief-signal-coverage.ts` and `day-type.ts`) and can ship independently of any SSOT change. Consider elevating it out of PR2 into its own tiny PR that lands first — it makes every subsequent SSOT change safer.
