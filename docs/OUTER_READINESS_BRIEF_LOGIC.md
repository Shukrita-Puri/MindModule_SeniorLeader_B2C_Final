# Outer Readiness Brief — Complete Logic & Role Documentation

## Purpose

The Outer Readiness Brief is the single navigational frame that tells a leader **what to do right now and why**, by reading their inner state against their outer demands. It is not a status report. It is not a context dump. It is a **direction** grounded in evidence.

The brief answers one question: *Given who you are today — your readiness, your body, your patterns — and what the world is asking of you — your calendar, your stakes, your time of day — what is the highest-leverage orientation for this moment?*

---

## Architecture: Signal → Decision → Direction

```
┌─────────────────────────────────────────────────────────┐
│                    INPUT SIGNALS                        │
├──────────────────┬──────────────────┬───────────────────┤
│ Decision         │ Calendar         │ Wearable          │
│ Readiness Score  │ (load, pressure, │ (HRV, RHR,        │
│ (0–100)          │  density, stakes)│  Peak HR, Sleep)  │
│ + Energy Tier    │                  │                   │
│ (depleted →      │                  │                   │
│  managing →      │                  │                   │
│  strong → peak)  │                  │                   │
├──────────────────┼──────────────────┼───────────────────┤
│ Check-In Outcome │ Clarity Level    │ Confidence Level  │
│ (today's self-   │ (1–5 scale)      │ (1–5 scale)       │
│  reported state) │                  │                   │
├──────────────────┼──────────────────┼───────────────────┤
│ Archetype        │ Coach Insights   │ Time of Day       │
│ (e.g., adaptive- │ (strengths,      │ (morning,         │
│  navigator,      │  growth edges    │  afternoon,       │
│  reflective-     │  from coaching   │  evening)         │
│  strategist)     │  sessions)       │                   │
└──────────────────┴──────────────────┴───────────────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │   OUTER READINESS     │
              │   COMPUTATION         │
              │                       │
              │ 1. getTheme()         │
              │    → phrase + context │
              │                       │
              │ 2. getLeanOnWatchFor() │
              │    → leanOn + watchFor│
              │                       │
              │ 3. buildDataSources() │
              │    → attribution      │
              └───────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                  OUTPUT: THE BRIEF                      │
├─────────────────────────────────────────────────────────┤
│ PHRASE:    "Close with care."                           │
│ CONTEXT:   "You've navigated 4 meetings so far. 1      │
│            still ahead — closing with care means        │
│            bringing the same quality of attention to    │
│            what remains without borrowing from          │
│            tomorrow."                                   │
│ LEAN ON:   "Based on your coach conversation: Your     │
│            ability to read the room and adapt mid-      │
│            conversation. The day tested that capacity.  │
│            The day is done."                            │
│ WATCH FOR: "Based on your coach conversation:          │
│            Absorbing others' urgency as your own.      │
│            Replaying the day's demands instead of       │
│            releasing them."                             │
│ SOURCES:   "decision readiness score, calendar,        │
│            wearable data, coaching insights"            │
└─────────────────────────────────────────────────────────┘
```

---

## The Four Elements and Their Roles

### 1. PHRASE — The Directive

**Role:** A 2–5 word imperative that tells the user **what to do**. It is the headline, the single action-frame for this moment.

**Rules:**
- Always an imperative or directive statement ("Close with care", "Protect what's left", "Pace the remaining hours")
- Must be specific enough to act on, general enough to apply across the user's next hours
- Changes based on: Energy Tier × Calendar State × Time of Day × Body Signals
- Evening phrases must not use forward-looking language ("prepare", "get ready") — use "release", "restore", "close", "arrive"

**Examples by tier + time:**
| Tier | Morning | Evening (day done) | Evening (meetings ahead) |
|------|---------|-------------------|--------------------------|
| Depleted | "Pace from the start." | "Ground before tomorrow." | "Protect what's left." |
| Managing | "Set a sustainable pace." | "Close with care." | "Stay present for what's left." |
| Strong | "Protect the window." | "Close strong." | "Carry your edge forward." |
| Peak | "Protect the peak." | "Close with intention." | "Finish at your best." |

---

### 2. CONTEXT — The Why

**Role:** 1–3 sentences that explain **why this phrase is the right direction**, grounding it in the user's actual signals. The context is NOT a summary of the user's day. It connects observable evidence (calendar count, body strain, readiness tier) to the phrase directive.

**Pattern:** `[Acknowledge observable state] + [Frame the situation] + [Connect to why the phrase matters]`

**Rules:**
- Must reference the phrase's directive — not just describe the situation
- Uses **filtered meeting counts** (`meetingCount` / `remainingMeetings`) — excludes all-day blocks, personal holds, and multi-day events from user-facing text
- Raw `eventCount` is still used internally for load/pressure scoring (density should count all calendar entries)
- Evening context must distinguish "meetings still ahead" (Branch A) from "day is done" (Branch B)
- When meetings remain: acknowledge what's past, frame what's ahead, explain why the phrase matters now
- When day is done: acknowledge the day's weight, frame tomorrow if stakes exist, connect to restoration
- Never list context as standalone facts — always tie back to the directive

**Anti-patterns (WRONG):**
- ❌ "You've navigated 2 meetings so far. 1 still ahead — the day isn't done, but the hardest part may be behind you." (Describes, doesn't direct)
- ❌ "High-stakes moments ahead with a manageable schedule." (Generic, no connection to user's actual state)

**Correct patterns:**
- ✅ "You've navigated 4 meetings so far. 1 still ahead — closing with care means bringing the same quality of attention to what remains without borrowing from tomorrow."
- ✅ "You've spent most of today's reserves across 3 meetings. With Board Review still ahead and your reserves low, protecting what's left means deploying only where it genuinely matters."

---

### 3. LEAN ON — The Strength to Deploy

**Role:** Identifies the user's **specific, personal strength** that is most relevant right now and tells them to lean into it. This is not generic advice — it must come from actual knowledge about this user.

**Source Hierarchy (Personal-First):**
1. **Coach Insights (Priority 1):** Strengths identified across coaching conversations. Prefixed with "Based on your coach conversation:" for credibility.
2. **Archetype (Priority 2):** Strengths associated with the user's psychological archetype (e.g., adaptive-navigator → "reading the room"). Prefixed with archetype name attribution.
3. **Clarity × Confidence Modifier (Priority 3):** When clarity and/or confidence are notably high, reference that directional certainty as a resource.
4. **Tier Fallback (Priority 4):** Generic tier-based strengths when no personal data exists.

**Rules:**
- Must explicitly attribute the source ("Based on your coach conversation:", "As an adaptive navigator:")
- Must be a real strength the system has observed or inferred, not a platitude
- Evening variants should be retrospective ("That capacity served you today") not forward-looking ("Use that today")
- Followed by a **situational suffix** that grounds it in the current moment (e.g., "The day isn't done — that instinct still serves you." or "Today tested that capacity. The day is done.")

**Anti-pattern (WRONG):**
- ❌ "Your directional certainty. You know what matters today and why." (Generic, not attributed, could apply to anyone)

**Correct pattern:**
- ✅ "Based on your coach conversation: Your ability to read the room and adapt mid-conversation. The day tested that capacity. The day is done."

---

### 4. WATCH FOR — The Edge to Manage

**Role:** Names the user's **specific, personal vulnerability or tendency** that is most likely to surface given the current conditions. This is the growth edge — the pattern that could undermine their effectiveness if unchecked.

**Source Hierarchy (same as Lean On):**
1. **Coach Insights (Priority 1):** Growth edges identified across coaching conversations.
2. **Archetype (Priority 2):** Known vulnerabilities of the user's archetype.
3. **Clarity × Confidence Modifier (Priority 3):** Patterns associated with low clarity or low confidence.
4. **Tier Fallback (Priority 4):** Generic tier-based risks.

**Rules:**
- Must be a real pattern, not a generic caution
- Source attributed for credibility
- Evening variants should warn against post-day patterns ("Replaying today's decisions to find flaws") not work-day patterns ("Over-committing in meetings")
- Followed by a **situational suffix** grounded in the current moment

**Anti-pattern (WRONG):**
- ❌ "Over-extending into tomorrow's challenges before tonight's recovery is complete." (Generic, not personal)

**Correct pattern:**
- ✅ "Based on your coach conversation: Absorbing others' urgency as your own. Replaying the day's demands instead of releasing them."

---

## Time Windows

| Window | Hours | Character |
|--------|-------|-----------|
| Morning | 05:00–11:59 | Forward-looking. Sleep/recovery signals prominent. Frame the opening. |
| Afternoon | 12:00–17:59 | Mid-day. Accumulated strain signals. Pace the remaining hours. |
| Evening | 18:00–04:59 | Two sub-modes: **Events Ahead** (acknowledge past + frame remaining) or **Day Done** (retrospective + restoration). Tomorrow's calendar as recovery motivation. |

### Evening Sub-Modes

**Branch A: Meetings Still Ahead** (`remainingMeetings > 0`)
- Acknowledge past meetings navigated
- Frame remaining meetings (and remaining high-stakes if applicable)
- Connect to phrase: why this directive matters for the final stretch
- Tier-aware: depleted users protect, managing users sustain, strong users carry forward, peak users finish at best

**Branch B: Day is Done** (`remainingMeetings === 0`)
- Acknowledge what was carried today (todaySummary)
- If tomorrow has high-stakes: frame recovery as essential for tomorrow's demands
- If body stressed: frame physical cool-down
- Connect to phrase: why this restoration directive matters given their tier

---

## Calendar Metrics

### Raw vs Filtered Counts

| Metric | Used For | Includes |
|--------|----------|----------|
| `eventCount` | Internal load/pressure scoring | All calendar entries (meetings, blocks, all-day events) |
| `meetingCount` | User-facing text ("You've navigated X meetings") | Only actual meetings — excludes personal blocks, all-day holds, multi-day events |
| `remainingMeetings` | Evening Branch A/B split and user-facing remaining count | Filtered meetings that haven't started yet |
| `remainingEvents` | Internal remaining event tracking | All events that haven't started yet |

### Filtering Rules

Events excluded from `meetingCount`:
- Title matches `personalBlockPatterns`: Day Block, Focus Time, Prep Block, Hold, Blocked, DNB, No Meetings, Lunch, Break, Commute, Travel Time, Personal, Buffer
- Duration > 240 minutes AND attendees ≤ 1 (all-day blocks, multi-day calendar holds)

### Load & Pressure Scoring

**Load** (calendar density):
- Low: 0–2 events
- Medium: 3 events
- High: 4+ events (or 3+ with avg gap < 20 min)

**Pressure** (weighted scoring per event):
- Organizer: +2
- Attendees >5: +3, >2: +1
- Duration >60min: +2, ≥30min: +1
- Non-recurring: +1
- Prime time (9–12, 14–16): +1
- Back-to-back (<5min gap): +3, (<15min gap): +2
- Future events: full weight; past events: 50% weight

---

## Calendar Sync Strategy

The `sync-calendar` function syncs events from **start of today (user's local midnight)** through **8 days ahead**. This ensures:
- Past events from today are always captured (essential for evening retrospective context)
- A full 7-day rolling window is maintained
- The delete-and-replace strategy won't lose today's earlier meetings

Sync cadence: 6-hour intervals via pg_cron scheduled function.

---

## Data Source Attribution

The `dataSources` array in the response tells the user exactly what signals informed their brief:

| Source | When included |
|--------|--------------|
| `decision readiness score` | Always (core signal) |
| `today's check-in` | When a check-in exists for today |
| `calendar` | When calendar is connected and has events |
| `wearable data` | When Oura/wearable data exists |
| `coaching insights` | When coach-derived strength/growth insights exist |
| `your archetype` | When archetype is set and used for Lean On/Watch For |
| `clarity and confidence levels` | When C×C modifier is applied |

The **Coach Insight Age Label** shows how recent coaching insights are (e.g., "Coaching insight from 2 days ago" or "Coaching insight from this week") to set appropriate expectations about freshness.

---

## Integration Points

### Upstream Dependencies
- `computeEnergyState()` → provides Decision Readiness Score and Energy Tier
- `getTodayCheckin()` → provides clarity_level, confidence_level, outcome
- `getServerCalendarMetrics()` → provides load, pressure, event counts, high-stakes events
- `getWearableContext()` → provides HRV, RHR, Peak HR, Sleep Score
- Coach conversation data (from `coach_session_summaries`, `coach_pattern_observations`)
- User archetype (from `profiles.archetype`)

### Downstream Consumers
- `StrategicIntentionCard` — renders the brief on the Executive Home
- `useOuterReadiness` hook — caches the brief via react-query (5-min stale time)
- Coach context builder — references the brief for coaching conversation context

---

## Key Invariants

1. **The phrase is always a directive** — never a description or observation
2. **The context always connects to the phrase** — never standalone facts
3. **Lean On and Watch For are always personal** — never generic advice applicable to anyone
4. **Source attribution is always present** — builds credibility through transparency
5. **Evening always distinguishes remaining vs done** — never treats the day as finished when meetings remain
6. **Filtered meeting counts for user-facing text** — all-day blocks and personal holds never inflate "meetings navigated"
7. **No evening forward-looking language** — "restore", "release", "arrive", never "prepare", "plan", "get ready"
8. **Tomorrow as recovery motivation, not preparation** — framing tomorrow's demands as reason to recover, not to work more tonight
