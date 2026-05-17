
# Conference & Summit Cluster — Expansion Plan (v2)

Single source of truth: `supabase/functions/_shared/ceo-behaviour/conference.ts` for rule shapes; `supabase/functions/_shared/brief-signal-coverage.ts` for **all** signal coverage (brief + nudge + plan, despite the legacy "brief-" filename). Triangulation (mood/HRV fusion, social-load inference, organizer-role detection) stays in Edge. LLM stays craft-only. `SHARED_MODULES_ENABLED` remains OFF until Phase 4.

## v2 changes from your latest feedback

1. **Cross-surface by default.** Every conference rule fires across `brief`, `plan`, `nudge`. The single exception: `conferenceMidSessionReset` is `nudge`-only (in-the-moment somatic reset, no need to pull the user into brief/plan UI).
2. **Pre-action nudges drive into the app.** Where a rule has an actionable preparatory practice (morning-of, 45-min pre-stage, night-before-summit, post-conference re-entry), the nudge copy hint includes a CTA hand-off: "open brief → start plan." `conferenceMidSessionReset` is the only rule that fires the practice in-line without a brief/plan detour.
3. **Severity is engagement-type-led, day-count-amplified.**
   - Base by engagement type: `attend-only = low`, `attend + speaking = medium`, `speaking-only/drop-in = medium`, `speaking inside multi-day attend = high`.
   - Day-count amplifier: `+1 severity step per additional consecutive conference day` capped at `high`. So Day 1 attend-only = low; Day 3 attend-only = high. Day 1 speaking = medium; Day 2 speaking = high.
4. **`brief-signal-coverage.ts` is the universal signal builder.** Already shape-correct — re-label its ownership in the module header and in the ledger so future rules know to add their mechanical signals here regardless of consuming surface. No rename of the file (avoid churn across imports).
5. **Travel → Summit handoff.** Travel cluster still overrides on the travel day itself, but the conference cluster *acknowledges* prior-day travel fatigue. Specifically, `conferenceNightBeforeSummit` reads `signals.yesterdayWasTravelDay` (Edge-populated) and `signals.travelDay` for *today's* trailing hours, and escalates the evening Mindset-Pause + Somatic-Reenergise emphasis to "offload travel + ground for summit week" framing.

## Rule shapes (all in conference.ts)

| Rule | Scope | Trigger | Base severity | Day-count amplifier |
|---|---|---|---|---|
| `conferenceNightBeforeSummit` | brief, plan, nudge | Tomorrow is `conferenceDayNumber === 1` AND it's evening (local hour ≥ 17) | medium | +step if `yesterdayWasTravelDay` OR `travelDay` today |
| `conferenceDayAttend` | brief, plan, nudge | Conference day AND no speaking sub-block | low | +1 per consecutive day, cap high |
| `conferenceDayWithSpeaking` | brief, plan, nudge | Conference day AND `speakingBlocksToday.length >= 1` | high (attend+speak combo) | +step if day ≥ 2 |
| `dropInSpeakingHighStakes` | brief, plan, nudge | Standalone speaking block, no full-day wrapper | medium | n/a (single-event) |
| `conferenceMidSessionReset` | **nudge only** | Conference day AND first inter-session gap ≥ 30min | medium | n/a |
| `conferenceCarryFatigue` | brief, plan, nudge | `conferenceDaysInTrailing4 >= 1` AND today is not a conference day | scales with `trailingConferenceLoad` | already encoded in load |
| `postConferenceReentry` | brief, plan, nudge | Yesterday was last day of multi-day event (`conferenceDayNumberYesterday >= 2`) | medium | +step if `nextThreeDaysMeetingCount` ≥ 10 |
| `conferenceDepletion` (existing) | unchanged | Kept as the legacy day-N escalator other rules can read | — | — |

`copyHint` on every nudge-scope flag carries the phase ("morning-of intent", "pre-stage presence", "end-of-day offload", "night-before-summit travel-offload + ground", "re-entry close-out") **and** the CTA hand-off keyword (`open-brief` / `open-plan`) — except `conferenceMidSessionReset` which carries `inline-somatic` and no hand-off.

## Pre / During / Post mapping (slot + nudge orchestration)

| Phase | Trigger | Surface | Protocol/mode hint | Hand-off |
|---|---|---|---|---|
| PRE — night before Day 1 | `conferenceNightBeforeSummit` | evening slot + push | Mindset · Pause + Somatic · Reenergise (if travel-fatigued) | open-brief |
| PRE — morning of each conf day | `conferenceDayAttend` / `conferenceDayWithSpeaking` | morning slot + push | Mindset · Flow | open-plan |
| PRE — 45 min before speaking | `conferenceDayWithSpeaking` / `dropInSpeakingHighStakes` | JIT nudge at `minutesUntil ∈ [40,50]` | Mindset · Flow (presence + grounding) | open-plan |
| DURING — mid-session | `conferenceMidSessionReset` | nudge only (no UI handoff) | Somatic · Flow (inline) | none |
| POST — end of each conf day | `conferenceDayAttend` / `conferenceDayWithSpeaking` | evening slot + push | Somatic · Reenergise | open-plan |
| POST — re-entry | `postConferenceReentry` | next morning + evening slots + push | Mindset · Pause + Somatic · Reenergise | open-brief |

## SignalMatrix additions (brief-context.ts)

All optional/nullable, additive only. Populated mechanically by `brief-signal-coverage.ts`; triangulation fields written by Edge.

Mechanical (signal-coverage):
- `conferenceDayNumber: number | null`
- `conferenceDayNumberYesterday: number | null`
- `conferenceTotalDays: number | null`
- `conferenceEventTitle: string | null`
- `speakingBlocksToday: Array<{ title; minutesUntil; durationMinutes; kind }>`
- `hasFullDayConferenceWrapper: boolean`
- `firstSessionGapMinutesToday: number | null`
- `conferenceDaysInTrailing4: number`
- `trailingConferenceLoad: "low"|"medium"|"high"`
- `nextThreeDaysMeetingCount: number | null`
- `conferenceStartsTomorrow: boolean` — drives `conferenceNightBeforeSummit`

Triangulation (Edge writes; .ts only reads):
- `userTaggedConferenceToday: boolean`
- `userTaggedSpeakingToday: boolean`
- `conferenceSocialLoadHigh: boolean` (stub field, post-MVP)

Travel↔conference linkage already present: `yesterdayWasTravelDay`, `travelDay`. `conferenceNightBeforeSummit` reads both.

## brief-signal-coverage.ts changes

1. **Header re-label**: update OWNERSHIP comment to state explicitly "single source of mechanical signal coverage for brief, nudges, and plan — filename is legacy."
2. **Speaking regex (tier 1):** `SPEAKING_RX = /\b(panel|fireside|keynote|speaking|on stage|presenting|talk|moderat\w+|Q ?& ?A|address|remarks)\b/i` — applied to non-all-day blocks ≥ 15 min.
3. **Conference regex (tier 1):** `CONFERENCE_RX = /\b(summit|conference|convention|forum|expo|symposium|congress|offsite)\b/i` — applied to all-day blocks AND standalone blocks ≥ 4h.
4. **Day-N inference (tier 2):** group consecutive days with CONFERENCE_RX hits OR a stable normalized title repeating. Compute `conferenceDayNumber` and `conferenceTotalDays` for any chain spanning today.
5. **`conferenceStartsTomorrow`:** true when tomorrow has a Day-1 hit and today does not.
6. **Speaking blocks:** filter today's events through SPEAKING_RX; classify `kind`; expose minutes/duration.
7. **Trailing window (4d):** scan past 4 days; sum into `conferenceDaysInTrailing4`. Compose `trailingConferenceLoad` with `nextThreeDaysMeetingCount`:
   - high: trailing ≥ 2 AND next-3-day meetings ≥ 10
   - medium: trailing ≥ 1 AND next-3-day meetings ≥ 6
   - low: otherwise
8. **User-tag override:** if `userTaggedConferenceToday` true, force `conferenceDayNumber = max(1, derived)`. Same for speaking.

UI surface to set the user tag is **out of scope** for this plan (tracked as follow-up).

## Override / priority

- Travel cluster still beats conference **on the travel day itself**.
- `conferenceNightBeforeSummit` co-fires with travel rules when travel is today and summit starts tomorrow — evaluator dedupes by anchor; copy hint explicitly names the bridge.
- `conferenceDayWithSpeaking` suppresses `conferenceDayAttend` for the same day.
- `dropInSpeakingHighStakes` suppresses generic `advancePrep24h` for the same anchor event.
- `conferenceCarryFatigue` and `postConferenceReentry` can co-fire with `multiCalendarLoad` / `backToBackLoadOverride`; evaluator sorts by severity.

## conference.ts file layout

```text
- helpers: classifySpeakingKind(), engagementBaseSeverity(), amplifyByDayCount()
- conferenceNightBeforeSummit(ctx)
- conferenceDayAttend(ctx)
- conferenceDayWithSpeaking(ctx)
- dropInSpeakingHighStakes(ctx)
- conferenceMidSessionReset(ctx)        // nudge-scope only
- conferenceCarryFatigue(ctx)
- postConferenceReentry(ctx)
- conferenceDepletion(ctx)              // existing, kept as legacy escalator
```

All rules return `null` when their input field is null/false — flag-off safety preserved.

## index.ts registration

```ts
{ scopes: ["brief","plan","nudge"], fn: conferenceNightBeforeSummit },
{ scopes: ["brief","plan","nudge"], fn: conferenceDayWithSpeaking },   // before attend
{ scopes: ["brief","plan","nudge"], fn: conferenceDayAttend },
{ scopes: ["brief","plan","nudge"], fn: dropInSpeakingHighStakes },    // before advancePrep24h
{ scopes: ["nudge"],                fn: conferenceMidSessionReset },
{ scopes: ["brief","plan","nudge"], fn: conferenceCarryFatigue },
{ scopes: ["brief","plan","nudge"], fn: postConferenceReentry },
```

## MVP boundaries (explicit)

- No 24h advance prep for speaking — proximity-only (morning + 45-min + night-before-summit). Longer-horizon prep waits for Sparring Partner.
- No automatic presenting-vs-attending detection beyond regex + user override.
- No social-load / sensory-stim modeling yet — `conferenceSocialLoadHigh` stays a stub field.
- No UI to user-tag conference/speaking days (separate follow-up).
- Flag stays OFF; legacy detectors untouched.

## Tests (`ceo-behaviour-conference.test.ts`, new)

- Engagement-type base severity matrix: attend-only / attend+speaking / drop-in / speaking-multi-day.
- Day-count amplifier: Day 1/2/3 attend-only progression; cap at high.
- `conferenceNightBeforeSummit` fires only in evening + only when tomorrow is Day 1; escalates when `yesterdayWasTravelDay`.
- Attend + speaking → speaking rule wins, attend rule suppressed.
- Drop-in speaking → high-stakes path, no 24h advance prep co-fire.
- Mid-session gap: ≥ 30 min triggers; < 30 min suppressed; nudge-scope only.
- Trailing 4-day carry with high vs low next-3-day load.
- Re-entry on day after multi-day event; severity rises when next-3-day meetings ≥ 10.
- User-tag override forces detection when regex misses.
- All non-mid-session rules carry an `open-brief` or `open-plan` hand-off marker in `copyHint`.

## Out of scope

- Flipping `SHARED_MODULES_ENABLED`, removing legacy rules, prompt edits, validator/CTA changes.
- UI for user-tagging conference/speaking days.
- Social-load fusion implementation.
- Sparring Partner pre-day deep prep.

## Files touched

- `supabase/functions/_shared/brief-context.ts` — add SignalMatrix fields + 7 new BehaviourRule literals
- `supabase/functions/_shared/brief-signal-coverage.ts` — header re-label + speaking/conference regex + day-N inference + trailing window + tomorrow detection
- `supabase/functions/_shared/ceo-behaviour/conference.ts` — expand
- `supabase/functions/_shared/ceo-behaviour/index.ts` — register 7 new rules
- `supabase/functions/_shared/ceo-behaviour-conference.test.ts` — new
- `docs/CEO_BEHAVIOUR_RULE_MAP.md` — append conference cluster section (engagement-type matrix + handoff column)
- `mem/architecture/ceo-behaviour-shared-module-ownership.md` — record (a) conference expansion, (b) brief-signal-coverage as universal mechanical signal source, (c) nudge→brief/plan hand-off contract, (d) travel→summit bridge rule
