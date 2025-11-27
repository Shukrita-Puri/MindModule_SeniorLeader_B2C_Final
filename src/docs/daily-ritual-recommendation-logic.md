# Daily Ritual Recommendation Logic - Complete Documentation

## Overview
The Daily Ritual recommendation system generates personalized practice recommendations based on a user's current energy state, which is computed from multiple data sources. This document details the full logic and all permutation combinations used to determine recommendations.

---

## Data Sources & Scoring

### 1. Daily Check-In Score (Primary Input - 60-90% weight)
Maps user-selected statements to energy scores:

| Check-In Statement | Outcome | Score | Energy Tier |
|-------------------|---------|-------|-------------|
| "I'm stressed/overwhelmed" | `pause` | 10 | Depleted |
| "I'm drained/tired" | `power-up` | 20 | Depleted |
| "I'm anxious/tense" | `calm` | 25 | Depleted |
| "I'm scattered/unfocused" | `presence` | 55 | Managing |
| "I'm feeling steady and balanced" | `steady` | 50 | Managing |
| "I'm focused and energized" | `focused` | 70 | Strong |
| "I'm motivated and ready" | `ready` | 80 | Peak |

### 2. Wearable Function Score (0-30% weight when available)
Based on Oura readiness score:

| Readiness Range | Function | Score | Interpretation |
|----------------|----------|-------|----------------|
| < 50 | Low | 20 | Poor physiological readiness |
| 50-74 | Medium | 50 | Moderate readiness |
| ≥ 75 | High | 80 | Excellent readiness |

### 3. Calendar Scoring (Used for context, not energy score)

**Calendar Load** (number of meetings in next 4 hours):
- Low: 0-2 meetings
- Medium: 3-4 meetings  
- High: 5+ meetings

**Calendar Pressure** (cumulative scoring of):
- User is organizer: +2
- Large meeting (>5 attendees): +2
- Medium meeting (3-5 attendees): +1
- Long duration (>60 min): +2
- Standard duration (30-60 min): +1
- Non-recurring meeting: +1
- Prime hours (9am-12pm, 2-4pm): +1
- Back-to-back (<15 min gap): +1 per instance

**Pressure Levels**:
- Low: 0-2 total pressure points
- Medium: 3-5 pressure points
- High: 6+ pressure points

### 4. Circadian Adjustment (5-10% weight)
Time-of-day modifier:

| Time Range | Time of Day | Adjustment |
|-----------|-------------|------------|
| 6am-12pm | Morning | +5 (peak alertness) |
| 12pm-6pm | Afternoon | 0 (neutral) |
| 6pm-6am | Evening | -5 (natural dip) |

---

## Energy State Calculation

### Formula (Option B: Separate Energy from Context)

**Energy Score** = Internal state only (no calendar):
```
Energy Score = (CheckIn × W₁) + (Wearable × W₂) + (Circadian × W₃)
```

**Weight Distribution**:
- **With Wearable (Super Pro)**: CheckIn 65%, Wearable 30%, Circadian 5%
- **Without Wearable (Pro/Free)**: CheckIn 90%, Circadian 10%

**Energy Tiers** (based on Energy Score 0-100):
- **Depleted**: 0-39
- **Managing**: 40-59
- **Strong**: 60-74
- **Peak**: 75-100

**Sub-Tiers** (for finer granularity):
- Very Low: 0-15
- Low: 16-25
- Low-Mid: 26-35
- Mid: 36-55
- Mid-High: 56-65
- High: 66-75
- Very High: 76-100

---

## Recommendation Logic - Complete Permutation Matrix

### Core Recommendation Structure
Each recommendation includes:
- **Primary Mastery Type**: Main recommendation (Pause/Flow/Renewal)
- **Primary Subtype**: Specific approach within mastery
- **Secondary Mastery Type**: Supporting recommendation
- **Secondary Subtype**: Supporting approach
- **Context Statement**: Personalized explanation

### Mastery Types & Subtypes

**Pause Mastery**:
- `deep-calm` - Deep rest and restoration
- `grounding` - Stabilizing and centering
- `composure` - Maintaining calm under pressure

**Flow Mastery**:
- `activate` - Energizing and focusing
- `optimize` - Peak performance
- `maintain-peak` - Sustaining high energy

**Renewal Mastery**:
- `restore` - Deep recovery
- `recharge` - Gentle energizing
- `refresh` - Light renewal

---

## Complete Recommendation Permutations

### DEPLETED TIER (Energy 0-39)

#### Check-In: "Stressed/Overwhelmed" (`pause` outcome)
```
IF Pressure = HIGH:
  Primary: Pause (Composure)
  Secondary: Renewal (Restore)
  Context: "High demands require maintaining composure under stress"

IF Pressure = LOW/MEDIUM:
  Primary: Pause (Grounding)
  Secondary: Renewal (Restore)
  Context: "Ground yourself and restore your energy"
```

#### Check-In: "Drained/Tired" (`power-up` outcome)
```
IF Wearable = LOW AND Pressure ≠ HIGH:
  Primary: Pause (Deep Calm)
  Secondary: Renewal (Restore)
  Context: "Your body needs deep rest right now—recovery is essential"

ELSE (Needs gentle energizing):
  Primary: Renewal (Recharge)
  Secondary: Pause (Grounding)
  Context: "Gentle energizing with grounding support"
```

#### Check-In: "Scattered/Unfocused" (`presence` outcome)
```
Primary: Flow (Activate)
Secondary: Pause (Grounding)
Context: "Activate focus with grounding support"
```

#### Default Depleted (No specific check-in)
```
IF Sub-Tier = VERY LOW (0-15):
  IF Pressure = HIGH:
    Primary: Renewal (Restore)
    Secondary: Pause (Grounding)
    Context: "High demands require maintaining composure"
  ELSE:
    Primary: Renewal (Restore)
    Secondary: Pause (Deep Calm)
    Context: "Deep rest is your priority"

ELSE IF Sub-Tier = LOW (16-25):
  IF Pressure = LOW AND Wearable = LOW:
    Primary: Renewal (Restore)
    Secondary: Pause (Deep Calm)
    Context: "Deep rest before taking on anything else"
  ELSE:
    Primary: Renewal (Restore)
    Secondary: Pause (Grounding)
    Context: "Ground yourself before tackling demands"

ELSE (Low-Mid, 26-35):
  IF Pressure = HIGH OR Load = HIGH:
    Primary: Renewal (Restore)
    Secondary: Pause (Composure)
    Context: "Maintain composure under pressure"
  ELSE:
    Primary: Renewal (Restore)
    Secondary: Pause (Grounding)
    Context: "Grounding to restore focus"
```

---

### MANAGING TIER (Energy 40-59)

```
IF Calendar Load = HIGH:
  Primary: Pause (Composure)
  Secondary: Renewal (Refresh)
  Context: "Many meetings require maintaining composure and light renewal"

ELSE IF Calendar Load = MEDIUM:
  Primary: Pause (Grounding)
  Secondary: Flow (Activate)
  Context: "Balance grounding with gentle activation"

ELSE (Load = LOW):
  Primary: Flow (Activate)
  Secondary: Pause (Grounding)
  Context: "Activate flow with grounding support"
```

---

### STRONG TIER (Energy 60-74)

```
IF Calendar Pressure = HIGH:
  Primary: Flow (Optimize)
  Secondary: Pause (Composure)
  Context: "Optimize performance while maintaining composure"

ELSE (Pressure = LOW/MEDIUM):
  Primary: Flow (Activate)
  Secondary: Pause (Grounding)
  Context: "Lean into flow states with grounding"
```

---

### PEAK TIER (Energy 75-100)

```
IF Time of Day = MORNING:
  Primary: Flow (Optimize)
  Secondary: Pause (Composure)
  Context: "Optimize high performance this morning"

ELSE IF Time of Day = EVENING:
  Primary: Flow (Maintain Peak)
  Secondary: Renewal (Refresh)
  Context: "Sustain momentum with light renewal"

ELSE (Afternoon):
  Primary: Flow (Optimize)
  Secondary: Pause (Grounding)
  Context: "Optimize performance this afternoon"
```

---

## Practice Count Logic

The system determines how many practices to recommend based on the energy state:

### Low Energy States (Depleted)
- **Count**: 1-2 practices
- **Allowed Types**: Soundbaths + Guided Practices (no micro-exercises)
- **Reasoning**: "Low energy requires deep restoration practices only"

### Managing Energy
```
IF Calendar Load = HIGH:
  Count: 1-2 practices
  Types: Micro-exercises + Soundbaths
  Reasoning: "High load requires quick interventions"

ELSE IF Calendar Load = MEDIUM:
  Count: 2 practices
  Types: Guided practices + Soundbaths
  Reasoning: "Moderate load allows deeper practices"

ELSE:
  Count: 2-3 practices
  Types: All types
  Reasoning: "Low demands allow comprehensive ritual"
```

### Strong/Peak Energy
- **Count**: 2-3 practices
- **Types**: All types (prioritize flow-focused content)
- **Reasoning**: "High energy supports complete practice sequences"

---

## Content Matching Algorithm

Once mastery types are determined, the system:

1. **Retrieves all content** from practices database
2. **Filters by required tags** based on mastery subtype
3. **Scores each piece** based on:
   - Pillar match (pause/flow/renewal): +3 points
   - Subtype match: +2 points
   - Tag overlap: +1 point per matching tag
4. **Selects top recommendations** up to practice count
5. **Adds "Why Now" explanation** for each recommendation

### Tag Mapping Examples

**Pause → Grounding**:
- Required tags: `grounding`, `calm`, `stability`

**Flow → Activate**:
- Required tags: `energizing`, `focus`, `activation`

**Renewal → Restore**:
- Required tags: `restoration`, `recovery`, `deep-rest`

---

## Context Statement Generation

Format: 
```
"You mentioned you are [emotion]. Hence I understand your energy is [Tier] [time]. [Tier meaning]."
```

**Tier Meanings**:
- **Depleted** (Evening): "You need calming techniques to prepare for deep rest tonight"
- **Depleted** (Morning/Afternoon): "You need deep rest before taking on demands"
- **Managing**: "You need grounding and recovery to maintain performance"
- **Strong**: "You can lean into flow states with grounding support"
- **Peak**: "You can optimize high performance and sustain momentum"

---

## Summary Decision Tree

```
START → Compute Energy Score (Check-in + Wearable + Circadian)
      ↓
    Determine Energy Tier (Depleted/Managing/Strong/Peak)
      ↓
    Get Calendar Context (Load + Pressure)
      ↓
    Apply Recommendation Logic:
      - Depleted: Differentiate by check-in outcome
      - Managing: Differentiate by calendar load
      - Strong: Differentiate by calendar pressure
      - Peak: Differentiate by time of day
      ↓
    Determine Practice Count (based on tier + calendar)
      ↓
    Match Content (using tag scoring algorithm)
      ↓
    Generate Recommendations with explanations
```

---

## Implementation Files

- **Energy Calculation**: `src/utils/energyStateEngine.ts`
- **Scoring Logic**: `src/utils/energyStateScoring.ts`
- **Recommendation Generation**: `src/utils/recommendationEngine.ts`
- **UI Display**: `src/components/home/DailyRitual.tsx`
- **Content Database**: `src/data/practicesAndSoundscapes.ts`

---

## Testing Checklist

- [ ] Each check-in outcome produces correct recommendations
- [ ] Calendar load affects practice type and count
- [ ] Calendar pressure influences mastery subtypes
- [ ] Time of day modifies peak tier recommendations
- [ ] Wearable data (when available) influences depleted tier logic
- [ ] Context statements include check-in emotion when available
- [ ] Practice count respects energy tier constraints
- [ ] Content matching prioritizes correct tags for each subtype
