# Outer Readiness Brief – Full Logic Documentation

## 1. Purpose

The Outer Readiness Brief answers: **"What does the world look like for you right now, and how should you meet it?"**

It produces four outputs:
- **Phrase** – 3–6 word directive (e.g., "Pace from the start.")
- **Context** – 1–3 sentence explanation connecting the user's state to the directive
- **Lean On** – The user's primary strength to leverage right now
- **Watch For** – The primary risk pattern to guard against

All logic lives in `supabase/functions/compute-outer-readiness/index.ts`.

---

## 2. Upstream Data Sources (Inputs)

All signals are fetched **server-side** using the service role key. The client sends only `timezoneOffset` plus the pre-computed inner readiness fields.

### 2.1 Client-Provided (via request body)

| Signal | Source | Description |
|--------|--------|-------------|
| `innerReadinessTier` | `computeEnergyState()` client-side | depleted / managing / strong / peak |
| `innerReadinessScore` | `computeEnergyState()` client-side | 0–100 numeric |
| `clarityLevel` | Today's check-in | 1–5 scale (null if no check-in) |
| `confidenceLevel` | Today's check-in | 1–5 scale (null if no check-in) |
| `checkInOutcome` | Today's check-in | thriving/steady/struggling/drained/scattered/etc. |
| `timezoneOffset` | `new Date().getTimezoneOffset()` | Minutes offset from UTC |

### 2.2 Server-Fetched (inside the edge function)

| Signal | Table/Source | Description |
|--------|-------------|-------------|
| Calendar events (today) | `calendar_events` | All events for user's local day, filtered by `calendar_connections.is_active` |
| Calendar events (tomorrow) | `calendar_events` | Fetched for evening periods (≥18:00) for forward-looking context |
| Calendar metrics | Computed from events | `load` (low/medium/high), `pressure` (low/medium/high), `eventCount`, `meetingCount`, `remainingMeetings`, `highStakesEvents`, `remainingHighStakes` |
| Wearable data | `wearable_data` | Latest row: `hrv`, `resting_heart_rate`, `heart_rate` (peak), `sleep_score`, `sleep_duration` |
| Coach insights | `user_coach_insights` | Active strength + growth_area insights (most recent, up to 5) |
| Archetype | `profiles.user_archetype` | User's onboarding-derived behavioral archetype |
| Recent check-ins (7 days) | `daily_checkins` | For pattern detection (consecutive low states, C×C trends) |

---

## 3. Context Statement Logic

### 3.1 Architecture Overview

```
getTheme() → returns { phrase, context, driver }
  ├── Time-of-day routing (evening / morning / afternoon)
  │   ├── Evening → buildWeekdayEveningTheme()
  │   ├── Morning → buildMorningTheme()
  │   └── Afternoon → buildAfternoonContext() wrapping base context
  └── Pressure × Load matrix (fallback for morning/afternoon)
```

### 3.2 Derived Signals

| Signal | Derivation | Thresholds |
|--------|-----------|------------|
| `hasMeaningfulDemand` | `highStakes.length > 0 OR load === 'high' OR pressure === 'high' OR meetingCount >= 3` | Boolean gate for "demands ahead" language |
| `bodyStressed` | `wearable.hrElevated OR wearable.hrvElevated` | Boolean |
| `poorSleep` | `sleepScore < 60 OR sleepDuration < 360min` | Boolean |
| `rhrElevated` | `resting_heart_rate > 75bpm` | Boolean |
| `hrvElevated` | `hrv < 30ms` | Boolean |
| `hrElevated` | `peakHR > 100 OR peakHR > 120% of RHR` | Boolean |

### 3.3 Morning Context (`buildMorningTheme`) – Priority Cascade

1. **Poor sleep + high-stakes events** → Tier-specific pacing directive
2. **Good recovery + high-stakes events** → Tier-specific protection directive
3. **Poor sleep only** → Sleep deficit awareness
4. **HRV elevated strain** → HRV strain acknowledgment
5. **RHR elevated only** → Resting HR above baseline
6. **High-stakes events, no wearable** → Tier-aware event prep
7. **Dense calendar (4+), no wearable/stakes** → Tier-aware volume pacing
8. **Default fallback** → Tier-aware, uses `hasMeaningfulDemand` to avoid "demands ahead" on light days

### 3.4 Evening Context (`buildWeekdayEveningTheme`)

**Branch A (remainingMeetings > 0):** A-1 remaining high-stakes, A-2 remaining + body strain, A-3 remaining no strain

**Branch B (day done):** P1 heavy today + tomorrow stakes → P2 heavy + body stressed → P3 light today + heavy tomorrow → P4 tomorrow stakes → P5 body stressed → P6 today acknowledgment → Default

### 3.5 Special Contexts

- **Sunday evening**: Monday-aware (fetches tomorrow's calendar)
- **Same-day state shift**: ≥15 energy_balance change between today's check-ins
- **"Strength without clarity" override**: strong/peak tier but clarity/confidence ≤ 2
- **Pattern override**: 3+ consecutive days at same outcome

---

## 4. Lean On / Watch For Logic

### 4.1 Priority Cascade

```
P-1: Wearable Recovery Override (feature-flagged OFF)
P0a: Sunday evening (after 9pm) → getSundayEveningInsights()
P0b: Late evening weekdays/Saturday (after 9pm) → getEveningInsights()
P1a: Coach insights ≤ 3 days old → "(coach)"
P1b: Coach insights 4–7 days old → "(coach, Xd ago)" (if no C×C contradiction)
P2:  C×C modifier (clarity × confidence) → "(check-in)"
P3:  Partial coach + archetype/tier fill → mixed tags
P4:  Archetype × Tier matrix → "(archetype)"
P5:  Tier fallback → "(readiness)"
```

### 4.2 C×C Modifier Patterns (8 patterns, time-aware)

| Pattern | Lean On | Watch For (Day) | Watch For (Evening) |
|---------|---------|-----------------|---------------------|
| Both low | Your self-honesty | Premature commitments | Forcing resolution tonight |
| Both high | Your alignment | Rigidity from conviction | Over-optimising what worked |
| High clarity + low confidence | Your clarity | Delaying action | Replaying doubt |
| Low clarity + high confidence | Your confidence | Moving without direction | Forcing clarity tonight |
| Low clarity only | Your discernment | Acting without anchor | Grinding open questions |
| Low confidence only | Your self-awareness | Projected confidence | Reviewing through doubt |
| High clarity only | Your direction | Crowding out perspectives | Replaying what held |
| High confidence only | Your conviction | Closing off inputs | Running past the close |

### 4.3 Archetype × Tier Matrix (5 archetypes × 4 tiers)

| Archetype | Depleted LeanOn | Peak WatchFor |
|-----------|----------------|---------------|
| grounded-leader | Stillness instinct | Tunnel focus |
| resilient-performer | Recovery wisdom | Spending peak too fast |
| clear-thinker | Economy of thought | Complexity for own sake |
| intensity-driver | Rest-as-fuel wisdom | Opening at full intensity |
| adaptive-navigator | Situational awareness | Complexity over decisiveness |

### 4.4 Context Enrichment Suffixes

After core Lean On/Watch For, situational suffixes from `buildDaytimeLeanOnSuffix` / `buildDaytimeWatchForSuffix` are appended based on body strain, high-stakes events, poor sleep, and remaining events (evening-aware).

---

## 5. Calendar Metrics

**Load**: 4+ events = high; 3 + avg gap < 20min = high; 3 = medium; < 3 = low
**Pressure**: Weighted scoring (organizer +2, attendees +1/+3, duration +1/+2, non-recurring +1, prime time +1, back-to-back +2/+3, density boost +3, intensity multiplier 1.5×). Total ≥ 6 = high; ≥ 3 = medium.
**High-stakes**: Non-recurring AND (attendees > 5 OR organizer+attendees > 2 OR duration > 60min). Excludes personal blocks and all-day blockers.
**meetingCount**: Excludes personal blocks and all-day blockers (used for user-facing text).
