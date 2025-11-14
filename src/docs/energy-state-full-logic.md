# Energy State System - Full Logic Documentation

## Overview

The Energy State System calculates a user's current energy level (0-100 balance score) based on multiple data sources, determines an energy tier, and provides personalized daily ritual recommendations.

---

## Data Sources & Weights

### Weight Distribution

| Data Source | Weight (Default) | Notes |
|-------------|------------------|-------|
| Daily Check-in | 60% | Only for Pro/Super Pro users |
| Wearable Function | 20% | Only for Super Pro users when available |
| Calendar (Load + Pressure) | 10% | Only for Super Pro users when available |
| Circadian (Time of Day) | 10-100% | Always available; 100% if only source |

### Dynamic Weight Adjustment

When certain data sources are unavailable, weights are redistributed:

- **Pro Users (Check-in only)**: Check-in = 90%, Circadian = 10%
- **Super Pro (Check-in + Calendar)**: Check-in = 70%, Calendar = 20%, Circadian = 10%
- **Super Pro (Check-in + Wearable)**: Check-in = 70%, Wearable = 20%, Circadian = 10%
- **Super Pro (All sources)**: Check-in = 60%, Wearable = 20%, Calendar = 10%, Circadian = 10%

---

## 1. Check-in Scoring

Users complete a daily check-in by selecting one of 6 statements. Each statement maps to a numerical score:

| Statement | Score (0–100) | Energy State Interpretation |
|-----------|---------------|----------------------------|
| I'm stressed/overwhelmed | 10 | Depleted - high cognitive/emotional strain |
| I'm drained/tired | 20 | Depleted - physical/mental exhaustion |
| I'm anxious/tense | 25 | Managing (low end) - elevated stress |
| I'm scattered/unfocused | 30 | Managing (low end) - cognitive fragmentation |
| I'm motivated/ready | 80 | Strong - high readiness |
| I'm good / take me to homepage | 90 | Peak - optimal state |

**Implementation**: Stored in localStorage as `dailyCheckIn` or `todayCheckIn` with timestamp validation.

---

## 2. Wearable Scoring

Wearable data (Oura Ring, Apple Watch) provides physiological readiness scores. We map readiness to three function levels:

| Wearable Function | Score Contribution (0–100) | Readiness Range |
|-------------------|----------------------------|-----------------|
| Low | 20 | < 60 |
| Medium | 50 | 60-79 |
| High | 80 | ≥ 80 |

**Calculation Logic**:
```typescript
if (readiness >= 80) return 'high';
if (readiness >= 60) return 'medium';
return 'low';
```

---

## 3. Calendar Scoring

Calendar data is analyzed using **metadata only** (no content) to calculate Load and Pressure scores.

### 3A. Pressure Score (Decision Density)

Each upcoming event contributes points based on these metadata signals:

| Metadata Signal | Points |
|----------------|--------|
| User is organizer | +2 |
| >5 attendees | +2 |
| >2 attendees | +1 |
| Event >60 min | +2 |
| Event 30–60 min | +1 |
| Non-recurring | +1 |
| External attendees | +2 |
| Back-to-back block | +1 per block |
| Event in prime hours (9am-5pm) | +1 |

**Mapping to Pressure Level**:
- **0-2 points**: Low Pressure → Score +5
- **3-5 points**: Medium Pressure → Score 0
- **6+ points**: High Pressure → Score -5

### 3B. Load Score (Volume of Events)

| Load Level | Score Contribution |
|------------|-------------------|
| Low (0-2 events) | +5 |
| Medium (3-5 events) | 0 |
| High (6+ events) | -5 |

### 3C. Final Calendar Score

```typescript
CalendarScore = (LoadWeight × LoadScore) + (PressureWeight × PressureScore)
```

Default weights: LoadWeight = 0.4, PressureWeight = 0.6

---

## 4. Circadian Scoring (Time of Day)

Time-of-day adjustments based on natural alertness cycles:

| Time of Day | Score Adjustment | Hours |
|-------------|------------------|-------|
| Morning | +5 | 5am - 11:59am |
| Afternoon | 0 | 12pm - 5:59pm |
| Evening | -5 | 6pm - 4:59am |

---

## 5. Energy State Score Calculation

### Formula (Super Pro Users - All Sources Available)

```
Energy State Score = 
  (0.6 × CheckInScore) + 
  (0.2 × WearableScore) + 
  (0.1 × CalendarScore) + 
  (0.1 × CircadianScore)
```

### Formula (Pro Users - Check-in + Circadian Only)

```
Energy State Score = 
  (0.9 × CheckInScore) + 
  (0.1 × CircadianScore)
```

### Example Calculations

**Example 1: Managing Tier (Pro User)**
- Check-in: "scattered/unfocused" → 30
- Time: 2pm (afternoon) → 0
- Calculation: (0.9 × 30) + (0.1 × 0) = **27**
- Tier: **Depleted** (27 falls in 0-40 range)

**Example 2: Strong Tier (Super Pro User)**
- Check-in: "motivated/ready" → 80
- Wearable: High function → 80
- Calendar: Low Load (+5), Medium Pressure (0) → 2
- Time: 9am (morning) → +5
- Calculation: (0.6 × 80) + (0.2 × 80) + (0.1 × 2) + (0.1 × 5) = 48 + 16 + 0.2 + 0.5 = **64.7**
- Tier: **Strong** (65 rounds up)

**Example 3: Peak Tier (Super Pro User)**
- Check-in: "good" → 90
- Wearable: High function → 80
- Calendar: Low Load (+5), Low Pressure (+5) → 5
- Time: 10am (morning) → +5
- Calculation: (0.6 × 90) + (0.2 × 80) + (0.1 × 5) + (0.1 × 5) = 54 + 16 + 0.5 + 0.5 = **71**
- Tier: **Strong** (close to Peak threshold)

---

## 6. Energy State Tiers

| Score Range | Tier | Description |
|-------------|------|-------------|
| 0–40 | **Depleted** | System needs deep rest and recovery |
| 41–60 | **Managing** | Holding steady, support helpful |
| 61–75 | **Strong** | Performing well, maintain with grounding |
| 76–100 | **Peak** | Optimal regulation, sustain excellence |

---

## 7. Daily Ritual Recommendation Matrix

### Decision Logic Dimensions

1. **Energy Tier**: Depleted / Managing / Strong / Peak
2. **Load vs Pressure**: Which dominates (or balanced)
3. **Wearable Function**: Low / Medium / High
4. **Check-in Outcome**: 6 types
5. **Time of Day**: Morning / Afternoon / Evening

### Recommendation Priority

| Primary Action | When to Recommend |
|----------------|-------------------|
| **Renewal Mastery** | Depleted tier (any condition) |
| **Pause Mastery** | Managing tier + Load > Pressure |
| **Flow Mastery** | Managing tier + Pressure > Load, Strong tier, Peak tier |

---

## 8. Full Recommendation Permutation Table

### 8A. Depleted Tier (0-40)

| Wearable | Calendar Load | Calendar Pressure | Primary | Secondary | Context Statement |
|----------|---------------|-------------------|---------|-----------|-------------------|
| Low | Low | Low | Renewal (reset-energy) | Pause (deep-calm) | "Energy is low. Focus on restoring resilience. Pause micro-practice can help maintain composure." |
| Low | High | High | Renewal (restore-resilience) | Pause (grounding) | "Energy is depleted with high load and pressure. Renew energy first; grounding will help maintain executive presence." |
| High | High | High | Renewal (restore-resilience) | Pause (grounding) | "Energy is low despite high physiological function. Use Renewal to reset; grounding can support composure under high demands." |
| High | Low | Low | Renewal (reset-energy) | Pause (deep-calm) | "Energy is low; even with high body function, start with Renewal and micro-calming practice." |

### 8B. Managing Tier (41-60)

| Condition | Primary | Secondary | Context Statement |
|-----------|---------|-----------|-------------------|
| Load > Pressure | Pause (grounding/clarity) | Flow (focus) | "Cognitive load dominates today. Pause practices will help maintain clarity; optional Flow micro-practice sustains focus." |
| Pressure > Load | Flow (executive-presence) | Pause (composure) | "High-pressure events require executive presence. Flow practices are primary; Pause can support calm composure." |
| Load = Pressure | Flow (focus) + Pause (clarity) | Renewal (if needed) | "Balanced cognitive and decision load. Mix Flow and Pause practices; Renewal optional if energy dips." |

### 8C. Strong Tier (61-75)

| Condition | Primary | Secondary | Context Statement |
|-----------|---------|-----------|-------------------|
| Load > Pressure | Flow (focus) + Pause (grounding) | — | "Energy is strong. Maintain clarity with combined Flow and grounding micro-practices to handle high load." |
| Pressure > Load | Flow (executive-presence) | Optional Pause micro-practice | "Energy is strong; high pressure requires Flow practices to sustain executive performance." |
| Load = Pressure | Flow (focus) + Pause (clarity) | — | "Balanced demands with sufficient energy. Use Flow and optional grounding micro-practices to sustain performance." |

### 8D. Peak Tier (76-100)

| Condition | Primary | Secondary | Context Statement |
|-----------|---------|-----------|-------------------|
| Any (Low Demand) | Flow (maintain-peak) | Optional Pause | "Energy is at peak. Flow practices maintain performance; optional micro-Pause or Renewal if upcoming load is high or end-of-day." |
| High Load + High Pressure | Flow (maintain-peak) | Optional Renewal | "Peak energy but high load & pressure. Focus on Flow for decision readiness; micro-Renewal can sustain energy for tomorrow." |

---

## 9. Mastery Types & Subtypes

### Pause Mastery
- **deep-calm**: For low-demand recovery
- **grounding**: For high-load situations
- **clarity**: For cognitive reset
- **composure**: For emotional regulation

### Flow Mastery
- **focus**: Sustained attention for tasks
- **executive-presence**: High-stakes decision-making
- **maintain-peak**: Sustain optimal performance

### Renewal Mastery
- **reset-energy**: Quick restoration
- **restore-resilience**: Deep recovery for depleted states

---

## 10. Implementation Files

| File | Purpose |
|------|---------|
| `src/utils/energyStateEngine.ts` | Main orchestration - fetches data, calculates balance, determines tier |
| `src/utils/energyStateScoring.ts` | Scoring logic for each data source + recommendation matrix |
| `src/utils/energyInsightEngine.ts` | Generates human-readable insights from energy state |
| `src/utils/contentRecommendationEngine.ts` | Maps mastery types/subtypes to specific content |
| `src/components/home/EnergyStateHeader.tsx` | Displays energy balance + context statement |
| `src/components/home/DailyRitualCard.tsx` | Displays recommended ritual + 3 content items |

---

## 11. Testing Checklist

### Check-in Detection
- [ ] Complete check-in at different times of day
- [ ] Verify "Sources" displays correctly (check-in + circadian)
- [ ] Test all 6 check-in outcomes

### Energy Balance Accuracy
- [ ] "stressed/overwhelmed" → Balance ~10-40 (Depleted)
- [ ] "drained/tired" → Balance ~20-40 (Depleted)
- [ ] "scattered/unfocused" → Balance ~30-50 (Managing)
- [ ] "motivated/ready" → Balance ~70-85 (Strong/Peak)
- [ ] "good" → Balance ~85-95 (Peak)

### Context Statement Quality
- [ ] Acknowledges check-in selection
- [ ] Mentions energy tier and balance
- [ ] References time of day
- [ ] Includes load/pressure context (if Super Pro)
- [ ] Provides clear recommendation

### Content Recommendations
- [ ] Depleted → Shows Renewal content (Forest Bathing, Recovery Breathing)
- [ ] Managing (High Load) → Shows Pause content (Tibetan Bowls, Grounding)
- [ ] Managing (High Pressure) → Shows Flow content (Cathedral Choir, Box Breathing)
- [ ] Strong/Peak → Shows Flow content (Monastic Resonance, Power Breathing)

---

## 12. Future Enhancements

1. **Machine Learning Integration**: Learn from user feedback to adjust scoring weights
2. **Historical Patterns**: Use 7-day energy trends to improve recommendations
3. **Context-Aware Timing**: Recommend rituals 30min before high-pressure events
4. **Effectiveness Tracking**: Correlate recommendations with post-session ratings
5. **Personalized Baselines**: Adjust tier thresholds based on individual patterns

---

**Last Updated**: 2025-01-14  
**Version**: 1.0  
**Authors**: Sanctuary Intelligence Team
