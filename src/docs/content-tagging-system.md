# Content Tagging System - Complete Implementation Guide

## Overview

This document provides a comprehensive content tagging template for all Sanctuary content (soundbaths, guided practices, micro-practices) with structured tags mapped directly to the recommendation engine logic.

---

## 1. Structured Tags Schema

Each content item should have the following `structuredTags` object:

```typescript
structuredTags: {
  pillar: 'pause' | 'flow' | 'renewal',
  masterySubtypes: string[],
  goalTags: string[],
  physioTarget: string[],
  contextTags: string[],
  environmentSuitability: string[],
  equipment: string[],
  cognitiveLoadHelp: string[],
  socialTag: 'solo' | 'pair' | 'group',
  intensityLevel: 'low' | 'medium' | 'high',
  energyDirection: string
}
```

---

## 2. Recommendation Logic Mapping

### Energy Tiers → Mastery Types → Content Tags

**DEPLETED TIER (0-40)**
- **Stressed/Overwhelmed (Pause outcome)**
  - Primary: Pause → Composure (if high calendar pressure) OR Grounding (if low pressure)
  - Secondary: Renewal → Restore
  - **Content Tags**: `grounding`, `centering`, `cooling`, `gentle`, `release`, `calming`

- **Drained/Tired (Power-up outcome)**
  - Primary: Renewal → Restore
  - Secondary: Pause → Deep-Calm
  - **Content Tags**: `grounding`, `centering`, `water_up`, `balancing`, `moderate`, `gentle`, `cooling`

- **Scattered/Unfocused (Presence outcome)**
  - Primary: Pause → Grounding
  - Secondary: None
  - **Content Tags**: `grounding`, `centering`, `water_up`, `balancing`, `moderate`

**MANAGING TIER (41-60)**
- **Steady and Balanced**
  - Primary: Flow → Optimize (if high pressure) OR Pause → Composure (if high load)
  - Secondary: Varies
  - **Content Tags**: `centering`, `focus`, `mental_clarity`, `air_down`, `moderate`, `grounding`, `cooling`

- **Anxious/Tense (Calm outcome)**
  - Primary: Pause → Composure
  - Secondary: Flow → Optimize
  - **Content Tags**: `centering`, `focus`, `moderate`, `grounding`, `cooling`, `mental_clarity`

**STRONG TIER (61-75)**
- **Focused and Energized**
  - Primary: Flow → Optimize (if high load) OR Activate (if low load & high pressure)
  - **Content Tags**: `centering`, `focus`, `mental_clarity`, `air_down`, `activation`, `fire_up`, `pre-performance`, `energizing`

**PEAK TIER (76-100)**
- **Motivated and Ready**
  - Morning: Flow → Maintain-Peak + Renewal → Recharge
  - Afternoon/Evening: Flow → Optimize + Renewal → Refresh
  - **Content Tags**: `centering`, `balancing`, `moderate`, `focus`, `activation`, `pre-performance`, `energizing`, `gentle`, `cooling`

---

## 3. Mastery Subtypes → Content Tag Mapping

Based on `recommendationEngine.ts` getMasteryTags function:

### PAUSE Mastery
```typescript
'deep-calm': ['gentle', 'cooling', 'earth_up', 'grounding', 'release']
'grounding': ['grounding', 'centering', 'water_up', 'balancing', 'moderate']
'composure': ['centering', 'focus', 'moderate', 'grounding', 'cooling']
```

### RENEWAL Mastery
```typescript
'recharge': ['activation', 'moderate', 'pre-performance', 'energizing']
'restore': ['grounding', 'centering', 'water_up', 'balancing', 'moderate']
'refresh': ['gentle', 'cooling', 'moderate']
```

### FLOW Mastery
```typescript
'optimize': ['centering', 'focus', 'mental_clarity', 'air_down']
'activate': ['activation', 'fire_up', 'pre-performance', 'energizing']
'maintain-peak': ['centering', 'balancing', 'moderate', 'focus']
```

---

## 4. Complete Tag Vocabularies

### 4.1 Goal Tags (Functional Outcomes)
- `grounding` - Stabilize energy, feel present
- `breathing_regulation` - Regulate nervous system through breath
- `composure` - Maintain calm under pressure
- `focus` - Sustained attention
- `mental_clarity` - Clear thinking, decision-making
- `decision_readiness` - Prepare for important choices
- `stress_reduction` - Lower cortisol/tension
- `cognitive_unload` - Reduce mental overload
- `energize` - Increase vitality
- `sleep_prep` - Prepare for rest
- `deep_reset` - Full system restore
- `confidence` - Build self-assurance
- `motivation` - Increase drive
- `centering` - Return to center
- `calming` - Soothe nervous system
- `release` - Let go of tension
- `balancing` - Restore equilibrium

### 4.2 Physiological Targets
- `hrv_increase` - Increase heart rate variability
- `hr_decrease` - Lower heart rate
- `cortisol_reduce` - Lower stress hormones
- `alertness_increase` - Boost wakefulness
- `parasympathetic_activation` - Activate rest-and-digest
- `sympathetic_modulation` - Regulate fight-or-flight

### 4.3 Context Tags (When to Use)
- `pre-meeting` - Before important meetings
- `post-meeting` - After intense meetings
- `between-meetings` - During short breaks
- `morning_ritual` - Start of day
- `afternoon_slump` - Energy dip period
- `evening_winddown` - End of day
- `bedtime` - Before sleep
- `pre-performance` - Before high-stakes moments
- `commute` - During travel
- `lunch_break` - Midday reset
- `quick_reset` - Fast intervention

### 4.4 Environment Suitability
- `private` - Requires private space
- `shared_space` - Can do with others nearby
- `public` - Can do in public settings
- `on_the_go` - During movement/travel
- `office` - Office-appropriate
- `home` - Best at home

### 4.5 Equipment
- `headphones` - Requires audio privacy
- `none` - No equipment needed
- `speaker` - Can use speaker
- `watch` - Watch vibration compatible
- `phone` - Phone required
- `quiet_space` - Needs silence

### 4.6 Cognitive Load Help
- `lowers_cognitive_load` - Reduces mental burden
- `supports_decision` - Aids decision-making
- `improves_concentration` - Enhances focus
- `memory_consolidation` - Helps process information
- `creative_thinking` - Opens creative flow

### 4.7 Energy Direction
- `uplift` - Increase energy
- `stabilize` - Maintain steady energy
- `downshift` - Lower activation
- `clarify` - Clear mental fog
- `motivate` - Increase drive
- `restore` - Replenish reserves
- `activate` - Turn on alertness

### 4.8 Intensity Levels
- `low` - Gentle, soothing
- `medium` - Engaging, moderate
- `high` - Energizing, activating

---

## 5. Content Type Templates

### 5.1 SOUNDBATH Template

```typescript
{
  id: "example-soundbath",
  contentType: "soundbath",
  category: "pause", // or "power-up" or "presence"
  tags: ['gentle', 'grounding', 'calming'], // Legacy tags
  structuredTags: {
    pillar: 'pause',
    masterySubtypes: ['deep-calm', 'grounding'],
    goalTags: ['grounding', 'stress_reduction', 'deep_reset', 'breathing_regulation'],
    physioTarget: ['hrv_increase', 'hr_decrease', 'cortisol_reduce', 'parasympathetic_activation'],
    contextTags: ['evening_winddown', 'post-meeting', 'afternoon_slump'],
    environmentSuitability: ['private', 'home'],
    equipment: ['headphones', 'speaker'],
    cognitiveLoadHelp: ['lowers_cognitive_load'],
    socialTag: 'solo',
    intensityLevel: 'low',
    energyDirection: 'downshift'
  },
  voice: 'none',
  language: 'en',
  deliveryModality: ['headphones', 'speaker']
}
```

### 5.2 GUIDED PRACTICE Template

```typescript
{
  id: "example-guided-practice",
  contentType: "guided-practice",
  category: "power-up",
  tags: ['activation', 'energizing', 'pre-performance'],
  structuredTags: {
    pillar: 'flow',
    masterySubtypes: ['activate', 'optimize'],
    goalTags: ['energize', 'focus', 'confidence', 'decision_readiness'],
    physioTarget: ['alertness_increase', 'sympathetic_modulation'],
    contextTags: ['morning_ritual', 'pre-meeting', 'pre-performance'],
    environmentSuitability: ['private', 'shared_space'],
    equipment: ['headphones', 'none'],
    cognitiveLoadHelp: ['improves_concentration', 'supports_decision'],
    socialTag: 'solo',
    intensityLevel: 'medium',
    energyDirection: 'uplift'
  },
  voice: 'neutral',
  language: 'en',
  deliveryModality: ['headphones', 'speaker']
}
```

### 5.3 MICRO-PRACTICE Template

```typescript
{
  id: "example-micro-practice",
  contentType: "micro-practice",
  category: "presence",
  tags: ['centering', 'focus', 'quick_reset'],
  structuredTags: {
    pillar: 'flow',
    masterySubtypes: ['optimize', 'maintain-peak'],
    goalTags: ['centering', 'focus', 'mental_clarity', 'cognitive_unload'],
    physioTarget: ['hrv_increase', 'cortisol_reduce'],
    contextTags: ['between-meetings', 'quick_reset', 'pre-meeting'],
    environmentSuitability: ['office', 'shared_space', 'public', 'on_the_go'],
    equipment: ['none', 'watch'],
    cognitiveLoadHelp: ['lowers_cognitive_load', 'supports_decision'],
    socialTag: 'solo',
    intensityLevel: 'low',
    energyDirection: 'clarify'
  },
  voice: 'none',
  language: 'en',
  deliveryModality: ['phone', 'watch']
}
```

---

## 6. Complete Content Tagging Examples

### SOUNDBATHS (7 items)

#### 1. Energised Focus with Didgeridoo & Bowls (Power-Up)
```typescript
structuredTags: {
  pillar: 'flow',
  masterySubtypes: ['activate', 'optimize'],
  goalTags: ['energize', 'focus', 'mental_clarity', 'confidence'],
  physioTarget: ['alertness_increase', 'hrv_increase', 'sympathetic_modulation'],
  contextTags: ['morning_ritual', 'pre-meeting', 'pre-performance', 'afternoon_slump'],
  environmentSuitability: ['private', 'home'],
  equipment: ['headphones', 'speaker'],
  cognitiveLoadHelp: ['improves_concentration'],
  socialTag: 'solo',
  intensityLevel: 'medium',
  energyDirection: 'uplift'
},
voice: 'none',
language: 'en',
deliveryModality: ['headphones', 'speaker']
```

#### 2. Earth Resonance - Grounding Calm (Power-Up)
```typescript
structuredTags: {
  pillar: 'renewal',
  masterySubtypes: ['recharge', 'restore'],
  goalTags: ['grounding', 'energize', 'confidence', 'decision_readiness'],
  physioTarget: ['hrv_increase', 'alertness_increase'],
  contextTags: ['morning_ritual', 'pre-performance', 'lunch_break'],
  environmentSuitability: ['private', 'home'],
  equipment: ['headphones', 'speaker'],
  cognitiveLoadHelp: ['supports_decision'],
  socialTag: 'solo',
  intensityLevel: 'medium',
  energyDirection: 'stabilize'
},
voice: 'none',
language: 'en',
deliveryModality: ['headphones', 'speaker']
```

#### 3. Himalayan Monastery - Meditative Stillness (Pause)
```typescript
structuredTags: {
  pillar: 'pause',
  masterySubtypes: ['deep-calm', 'grounding'],
  goalTags: ['grounding', 'deep_reset', 'stress_reduction', 'calming', 'release'],
  physioTarget: ['hrv_increase', 'hr_decrease', 'cortisol_reduce', 'parasympathetic_activation'],
  contextTags: ['evening_winddown', 'post-meeting', 'afternoon_slump', 'bedtime'],
  environmentSuitability: ['private', 'home'],
  equipment: ['headphones', 'speaker'],
  cognitiveLoadHelp: ['lowers_cognitive_load'],
  socialTag: 'solo',
  intensityLevel: 'low',
  energyDirection: 'downshift'
},
voice: 'none',
language: 'en',
deliveryModality: ['headphones', 'speaker']
```

#### 4. Tibetan Singing Bowls - Deep Reset (Pause)
```typescript
structuredTags: {
  pillar: 'pause',
  masterySubtypes: ['deep-calm', 'grounding'],
  goalTags: ['grounding', 'deep_reset', 'breathing_regulation', 'stress_reduction', 'release'],
  physioTarget: ['hrv_increase', 'hr_decrease', 'cortisol_reduce', 'parasympathetic_activation'],
  contextTags: ['evening_winddown', 'post-meeting', 'afternoon_slump'],
  environmentSuitability: ['private', 'home', 'shared_space'],
  equipment: ['headphones', 'speaker'],
  cognitiveLoadHelp: ['lowers_cognitive_load', 'memory_consolidation'],
  socialTag: 'solo',
  intensityLevel: 'low',
  energyDirection: 'downshift'
},
voice: 'none',
language: 'en',
deliveryModality: ['headphones', 'speaker']
```

#### 5. Cathedral Choir Flow - Sacred Space (Presence)
```typescript
structuredTags: {
  pillar: 'flow',
  masterySubtypes: ['optimize', 'maintain-peak'],
  goalTags: ['centering', 'focus', 'mental_clarity', 'deep_reset'],
  physioTarget: ['hrv_increase', 'cortisol_reduce'],
  contextTags: ['morning_ritual', 'afternoon_slump', 'evening_winddown', 'pre-performance'],
  environmentSuitability: ['private', 'home'],
  equipment: ['headphones', 'speaker'],
  cognitiveLoadHelp: ['improves_concentration', 'creative_thinking'],
  socialTag: 'solo',
  intensityLevel: 'medium',
  energyDirection: 'clarify'
},
voice: 'none',
language: 'en',
deliveryModality: ['headphones', 'speaker']
```

#### 6. Harmonic Calm - Clarity & Presence (Presence)
```typescript
structuredTags: {
  pillar: 'flow',
  masterySubtypes: ['optimize', 'maintain-peak'],
  goalTags: ['centering', 'mental_clarity', 'focus', 'balancing'],
  physioTarget: ['hrv_increase', 'cortisol_reduce'],
  contextTags: ['pre-meeting', 'between-meetings', 'pre-performance'],
  environmentSuitability: ['private', 'home', 'office'],
  equipment: ['headphones', 'speaker'],
  cognitiveLoadHelp: ['improves_concentration', 'supports_decision'],
  socialTag: 'solo',
  intensityLevel: 'medium',
  energyDirection: 'clarify'
},
voice: 'none',
language: 'en',
deliveryModality: ['headphones', 'speaker']
```

#### 7. Monastic Resonance - Deep Calm (Presence)
```typescript
structuredTags: {
  pillar: 'pause',
  masterySubtypes: ['deep-calm', 'composure'],
  goalTags: ['grounding', 'centering', 'composure', 'mental_clarity'],
  physioTarget: ['hrv_increase', 'hr_decrease', 'cortisol_reduce'],
  contextTags: ['pre-meeting', 'post-meeting', 'evening_winddown'],
  environmentSuitability: ['private', 'home'],
  equipment: ['headphones', 'speaker'],
  cognitiveLoadHelp: ['lowers_cognitive_load', 'supports_decision'],
  socialTag: 'solo',
  intensityLevel: 'low',
  energyDirection: 'stabilize'
},
voice: 'none',
language: 'en',
deliveryModality: ['headphones', 'speaker']
```

### GUIDED PRACTICES (9 items)

#### 1. Flow State Priming (Power-Up)
```typescript
structuredTags: {
  pillar: 'flow',
  masterySubtypes: ['activate', 'optimize'],
  goalTags: ['energize', 'focus', 'confidence', 'decision_readiness', 'mental_clarity'],
  physioTarget: ['alertness_increase', 'hrv_increase', 'sympathetic_modulation'],
  contextTags: ['morning_ritual', 'pre-meeting', 'pre-performance'],
  environmentSuitability: ['private', 'home', 'office'],
  equipment: ['headphones', 'none'],
  cognitiveLoadHelp: ['improves_concentration', 'supports_decision'],
  socialTag: 'solo',
  intensityLevel: 'high',
  energyDirection: 'uplift'
},
voice: 'neutral',
language: 'en',
deliveryModality: ['headphones', 'speaker']
```

#### 2. Pre-Meeting Power Protocol (Power-Up)
```typescript
structuredTags: {
  pillar: 'flow',
  masterySubtypes: ['activate', 'optimize'],
  goalTags: ['energize', 'confidence', 'composure', 'decision_readiness', 'mental_clarity'],
  physioTarget: ['alertness_increase', 'sympathetic_modulation'],
  contextTags: ['pre-meeting', 'pre-performance'],
  environmentSuitability: ['private', 'office', 'shared_space'],
  equipment: ['headphones', 'none'],
  cognitiveLoadHelp: ['improves_concentration', 'supports_decision'],
  socialTag: 'solo',
  intensityLevel: 'medium',
  energyDirection: 'uplift'
},
voice: 'neutral',
language: 'en',
deliveryModality: ['headphones', 'none']
```

#### 3. Executive Energy Renewal (Power-Up)
```typescript
structuredTags: {
  pillar: 'renewal',
  masterySubtypes: ['recharge', 'restore'],
  goalTags: ['energize', 'grounding', 'confidence', 'balancing'],
  physioTarget: ['hrv_increase', 'alertness_increase'],
  contextTags: ['morning_ritual', 'afternoon_slump', 'lunch_break'],
  environmentSuitability: ['private', 'home', 'office'],
  equipment: ['none'],
  cognitiveLoadHelp: ['supports_decision', 'creative_thinking'],
  socialTag: 'solo',
  intensityLevel: 'medium',
  energyDirection: 'stabilize'
},
voice: 'neutral',
language: 'en',
deliveryModality: ['none']
```

#### 4. Executive Breathing (Pause)
```typescript
structuredTags: {
  pillar: 'pause',
  masterySubtypes: ['grounding', 'composure'],
  goalTags: ['grounding', 'breathing_regulation', 'composure', 'stress_reduction', 'centering'],
  physioTarget: ['hrv_increase', 'hr_decrease', 'cortisol_reduce', 'parasympathetic_activation'],
  contextTags: ['between-meetings', 'post-meeting', 'pre-meeting', 'quick_reset'],
  environmentSuitability: ['private', 'office', 'shared_space'],
  equipment: ['none', 'headphones'],
  cognitiveLoadHelp: ['lowers_cognitive_load', 'supports_decision'],
  socialTag: 'solo',
  intensityLevel: 'low',
  energyDirection: 'stabilize'
},
voice: 'neutral',
language: 'en',
deliveryModality: ['headphones', 'none']
```

#### 5. Box Breathing Reset (Pause)
```typescript
structuredTags: {
  pillar: 'pause',
  masterySubtypes: ['grounding', 'composure', 'deep-calm'],
  goalTags: ['breathing_regulation', 'grounding', 'centering', 'composure', 'stress_reduction'],
  physioTarget: ['hrv_increase', 'hr_decrease', 'cortisol_reduce', 'parasympathetic_activation'],
  contextTags: ['between-meetings', 'quick_reset', 'pre-meeting', 'post-meeting', 'afternoon_slump'],
  environmentSuitability: ['office', 'shared_space', 'public', 'on_the_go'],
  equipment: ['none', 'headphones', 'watch'],
  cognitiveLoadHelp: ['lowers_cognitive_load'],
  socialTag: 'solo',
  intensityLevel: 'low',
  energyDirection: 'downshift'
},
voice: 'neutral',
language: 'en',
deliveryModality: ['headphones', 'none', 'watch']
```

#### 6. Physiological Sigh (Pause)
```typescript
structuredTags: {
  pillar: 'pause',
  masterySubtypes: ['grounding', 'deep-calm'],
  goalTags: ['breathing_regulation', 'stress_reduction', 'grounding', 'release'],
  physioTarget: ['hr_decrease', 'cortisol_reduce', 'parasympathetic_activation'],
  contextTags: ['quick_reset', 'between-meetings', 'post-meeting'],
  environmentSuitability: ['office', 'shared_space', 'public', 'on_the_go'],
  equipment: ['none'],
  cognitiveLoadHelp: ['lowers_cognitive_load'],
  socialTag: 'solo',
  intensityLevel: 'low',
  energyDirection: 'downshift'
},
voice: 'neutral',
language: 'en',
deliveryModality: ['none']
```

#### 7. 5-4-3-2-1 Grounding (Presence)
```typescript
structuredTags: {
  pillar: 'pause',
  masterySubtypes: ['grounding', 'composure'],
  goalTags: ['grounding', 'centering', 'composure', 'mental_clarity', 'cognitive_unload'],
  physioTarget: ['hrv_increase', 'cortisol_reduce'],
  contextTags: ['between-meetings', 'pre-meeting', 'quick_reset', 'afternoon_slump'],
  environmentSuitability: ['office', 'shared_space', 'public', 'on_the_go'],
  equipment: ['none'],
  cognitiveLoadHelp: ['lowers_cognitive_load', 'supports_decision'],
  socialTag: 'solo',
  intensityLevel: 'low',
  energyDirection: 'stabilize'
},
voice: 'neutral',
language: 'en',
deliveryModality: ['none']
```

#### 8. Body Scan for Presence (Presence)
```typescript
structuredTags: {
  pillar: 'pause',
  masterySubtypes: ['grounding', 'deep-calm'],
  goalTags: ['grounding', 'centering', 'stress_reduction', 'release', 'balancing'],
  physioTarget: ['hrv_increase', 'hr_decrease', 'parasympathetic_activation'],
  contextTags: ['afternoon_slump', 'post-meeting', 'evening_winddown'],
  environmentSuitability: ['private', 'home', 'office'],
  equipment: ['none', 'headphones'],
  cognitiveLoadHelp: ['lowers_cognitive_load', 'memory_consolidation'],
  socialTag: 'solo',
  intensityLevel: 'low',
  energyDirection: 'downshift'
},
voice: 'neutral',
language: 'en',
deliveryModality: ['headphones', 'none']
```

#### 9. Confidence Visualization (Presence)
```typescript
structuredTags: {
  pillar: 'flow',
  masterySubtypes: ['activate', 'optimize'],
  goalTags: ['confidence', 'mental_clarity', 'focus', 'motivation'],
  physioTarget: ['alertness_increase', 'hrv_increase'],
  contextTags: ['pre-meeting', 'pre-performance', 'morning_ritual'],
  environmentSuitability: ['private', 'office'],
  equipment: ['none', 'headphones'],
  cognitiveLoadHelp: ['supports_decision', 'creative_thinking'],
  socialTag: 'solo',
  intensityLevel: 'medium',
  energyDirection: 'uplift'
},
voice: 'neutral',
language: 'en',
deliveryModality: ['headphones', 'none']
```

### MICRO-PRACTICES (15 items)

#### Mindset Micro-Practices (6 items)

#### 1. Cognitive Reset Button (Power-Up)
```typescript
structuredTags: {
  pillar: 'flow',
  masterySubtypes: ['optimize', 'maintain-peak'],
  goalTags: ['cognitive_unload', 'mental_clarity', 'centering', 'focus'],
  physioTarget: ['hrv_increase', 'cortisol_reduce'],
  contextTags: ['between-meetings', 'quick_reset', 'afternoon_slump'],
  environmentSuitability: ['office', 'shared_space', 'on_the_go'],
  equipment: ['none'],
  cognitiveLoadHelp: ['lowers_cognitive_load', 'supports_decision'],
  socialTag: 'solo',
  intensityLevel: 'low',
  energyDirection: 'clarify'
},
voice: 'none',
language: 'en',
deliveryModality: ['none']
```

#### 2. Clarity Lens (Pause)
```typescript
structuredTags: {
  pillar: 'flow',
  masterySubtypes: ['optimize'],
  goalTags: ['mental_clarity', 'focus', 'cognitive_unload', 'centering'],
  physioTarget: ['hrv_increase', 'cortisol_reduce'],
  contextTags: ['between-meetings', 'pre-meeting', 'quick_reset'],
  environmentSuitability: ['office', 'shared_space', 'on_the_go'],
  equipment: ['none'],
  cognitiveLoadHelp: ['lowers_cognitive_load', 'supports_decision', 'creative_thinking'],
  socialTag: 'solo',
  intensityLevel: 'low',
  energyDirection: 'clarify'
},
voice: 'none',
language: 'en',
deliveryModality: ['none']
```

#### 3. Neutral Observer (Pause)
```typescript
structuredTags: {
  pillar: 'pause',
  masterySubtypes: ['composure', 'grounding'],
  goalTags: ['composure', 'centering', 'grounding', 'stress_reduction', 'cognitive_unload'],
  physioTarget: ['hrv_increase', 'cortisol_reduce'],
  contextTags: ['pre-meeting', 'post-meeting', 'between-meetings', 'quick_reset'],
  environmentSuitability: ['office', 'shared_space', 'public', 'on_the_go'],
  equipment: ['none'],
  cognitiveLoadHelp: ['lowers_cognitive_load', 'supports_decision'],
  socialTag: 'solo',
  intensityLevel: 'low',
  energyDirection: 'stabilize'
},
voice: 'none',
language: 'en',
deliveryModality: ['none']
```

#### 4. Micro Zoom-Out (Pause)
```typescript
structuredTags: {
  pillar: 'pause',
  masterySubtypes: ['composure', 'grounding'],
  goalTags: ['centering', 'grounding', 'composure', 'mental_clarity', 'stress_reduction'],
  physioTarget: ['hrv_increase', 'cortisol_reduce'],
  contextTags: ['between-meetings', 'post-meeting', 'afternoon_slump', 'quick_reset'],
  environmentSuitability: ['office', 'shared_space', 'public', 'on_the_go'],
  equipment: ['none'],
  cognitiveLoadHelp: ['lowers_cognitive_load', 'supports_decision'],
  socialTag: 'solo',
  intensityLevel: 'low',
  energyDirection: 'clarify'
},
voice: 'none',
language: 'en',
deliveryModality: ['none']
```

#### 5. The Pause Anchor (Pause)
```typescript
structuredTags: {
  pillar: 'pause',
  masterySubtypes: ['grounding', 'composure'],
  goalTags: ['grounding', 'centering', 'composure', 'breathing_regulation'],
  physioTarget: ['hrv_increase', 'hr_decrease', 'cortisol_reduce'],
  contextTags: ['between-meetings', 'pre-meeting', 'quick_reset', 'post-meeting'],
  environmentSuitability: ['office', 'shared_space', 'public', 'on_the_go'],
  equipment: ['none'],
  cognitiveLoadHelp: ['lowers_cognitive_load'],
  socialTag: 'solo',
  intensityLevel: 'low',
  energyDirection: 'stabilize'
},
voice: 'none',
language: 'en',
deliveryModality: ['none']
```

#### 6. Micro Reset Question (Pause)
```typescript
structuredTags: {
  pillar: 'pause',
  masterySubtypes: ['composure', 'grounding'],
  goalTags: ['centering', 'mental_clarity', 'composure', 'cognitive_unload'],
  physioTarget: ['hrv_increase', 'cortisol_reduce'],
  contextTags: ['between-meetings', 'quick_reset', 'afternoon_slump'],
  environmentSuitability: ['office', 'shared_space', 'on_the_go'],
  equipment: ['none'],
  cognitiveLoadHelp: ['lowers_cognitive_load', 'supports_decision'],
  socialTag: 'solo',
  intensityLevel: 'low',
  energyDirection: 'clarify'
},
voice: 'none',
language: 'en',
deliveryModality: ['none']
```

#### Tool Micro-Practices (9 items)

#### 1. 4-7-8 Breathing (Presence)
```typescript
structuredTags: {
  pillar: 'pause',
  masterySubtypes: ['deep-calm', 'grounding'],
  goalTags: ['breathing_regulation', 'stress_reduction', 'grounding', 'calming', 'release'],
  physioTarget: ['hr_decrease', 'cortisol_reduce', 'parasympathetic_activation'],
  contextTags: ['quick_reset', 'between-meetings', 'evening_winddown', 'bedtime'],
  environmentSuitability: ['office', 'shared_space', 'public', 'on_the_go'],
  equipment: ['none'],
  cognitiveLoadHelp: ['lowers_cognitive_load'],
  socialTag: 'solo',
  intensityLevel: 'low',
  energyDirection: 'downshift'
},
voice: 'none',
language: 'en',
deliveryModality: ['none']
```

#### 2. Box Breathing (Presence)
```typescript
structuredTags: {
  pillar: 'pause',
  masterySubtypes: ['grounding', 'composure'],
  goalTags: ['breathing_regulation', 'grounding', 'centering', 'composure', 'stress_reduction'],
  physioTarget: ['hrv_increase', 'hr_decrease', 'cortisol_reduce'],
  contextTags: ['between-meetings', 'quick_reset', 'pre-meeting', 'post-meeting'],
  environmentSuitability: ['office', 'shared_space', 'public', 'on_the_go'],
  equipment: ['none', 'watch'],
  cognitiveLoadHelp: ['lowers_cognitive_load', 'supports_decision'],
  socialTag: 'solo',
  intensityLevel: 'low',
  energyDirection: 'stabilize'
},
voice: 'none',
language: 'en',
deliveryModality: ['none', 'watch']
```

#### 3. Triangle Breathing (Presence)
```typescript
structuredTags: {
  pillar: 'pause',
  masterySubtypes: ['grounding', 'composure'],
  goalTags: ['breathing_regulation', 'grounding', 'centering', 'stress_reduction'],
  physioTarget: ['hrv_increase', 'cortisol_reduce'],
  contextTags: ['between-meetings', 'quick_reset', 'pre-meeting'],
  environmentSuitability: ['office', 'shared_space', 'public', 'on_the_go'],
  equipment: ['none'],
  cognitiveLoadHelp: ['lowers_cognitive_load'],
  socialTag: 'solo',
  intensityLevel: 'low',
  energyDirection: 'stabilize'
},
voice: 'none',
language: 'en',
deliveryModality: ['none']
```

#### 4. Double Exhale Breathing (Presence)
```typescript
structuredTags: {
  pillar: 'pause',
  masterySubtypes: ['deep-calm', 'grounding'],
  goalTags: ['breathing_regulation', 'stress_reduction', 'grounding', 'release'],
  physioTarget: ['hr_decrease', 'cortisol_reduce', 'parasympathetic_activation'],
  contextTags: ['quick_reset', 'post-meeting', 'between-meetings'],
  environmentSuitability: ['office', 'shared_space', 'public', 'on_the_go'],
  equipment: ['none'],
  cognitiveLoadHelp: ['lowers_cognitive_load'],
  socialTag: 'solo',
  intensityLevel: 'low',
  energyDirection: 'downshift'
},
voice: 'none',
language: 'en',
deliveryModality: ['none']
```

---

## 7. Recommendation Engine Integration

### How Tags Flow Through the System

1. **User Check-In** → Energy Score (0-100) → Energy Tier (Depleted/Managing/Strong/Peak)
2. **Calendar Context** → Load (Low/Medium/High) + Pressure (Low/Medium/High)
3. **Wearable Data** → Function Level (Low/Medium/High)
4. **Recommendation Logic** → Primary Mastery + Subtype + Secondary Mastery + Subtype
5. **Tag Mapping** → `getMasteryTags()` converts mastery subtypes to content tags
6. **Content Matching** → `getContentByTags()` finds content with matching tags
7. **Ranking** → Content sorted by tag match score + user memory + effectiveness
8. **Delivery** → Top 3 recommendations (soundbath, guided practice, micro-practice)

### Tag Matching Priority

1. **Pillar Match** (Required): Content pillar must align with mastery type
2. **Mastery Subtype Match** (High Priority): Content should support the specific subtype
3. **Goal Tag Match** (High Priority): At least 2 goal tags should overlap
4. **Context Tag Match** (Medium Priority): Should fit the current context
5. **Intensity Match** (Medium Priority): Should match energy tier intensity needs
6. **Environment/Equipment Match** (Low Priority): Nice to have, not blocking

---

## 8. Implementation Checklist

### Phase 1: Schema Update ✓
- [x] Add `StructuredTags` interface
- [x] Add `structuredTags` field to `SanctuaryContent`
- [x] Add `voice`, `language`, `deliveryModality` fields
- [x] Add `metrics` field for computed data

### Phase 2: Content Tagging (In Progress)
- [ ] Tag all 7 soundbaths with structured tags
- [ ] Tag all 9 guided practices with structured tags
- [ ] Tag all 15 micro-practices with structured tags
- [ ] Verify all legacy `tags` arrays are preserved

### Phase 3: Recommendation Engine Update
- [ ] Update `getContentByTags()` to use structured tags
- [ ] Add tag matching scoring algorithm
- [ ] Add context-aware ranking
- [ ] Add user memory integration (Phase 1b)

### Phase 4: Database Schema
- [ ] Create `practice_self_reports` table
- [ ] Update `practice_sessions` with physio tracking
- [ ] Create `user_content_memory` table
- [ ] Create context signature system

### Phase 5: Analytics & Memory
- [ ] Implement nightly memory aggregation
- [ ] Track effectiveness by context
- [ ] Build recommendation quality metrics
- [ ] Create tag coverage dashboard

---

## 9. Next Steps

1. **Immediate**: Use this document to manually tag all 31 content items with `structuredTags`
2. **Week 1**: Update recommendation engine to read structured tags
3. **Week 2**: Implement pre/post self-reports and physio tracking
4. **Week 3**: Build user memory store and context signatures
5. **Week 4**: Launch Phase 1 and start collecting effectiveness data

---

## 10. Questions for Product Team

1. Should we allow content to have multiple pillar tags (e.g., works for both Pause AND Flow)?
2. What's the minimum tag coverage required before launching (e.g., must have ≥3 goal tags)?
3. Should we expose structured tags to users in the UI, or keep them backend-only?
4. How do we handle content that doesn't fit neatly into the mastery subtypes?
5. Should we build a tag management UI for content creators?

---

**Document Version**: 1.0  
**Last Updated**: November 14, 2025  
**Owner**: Product & Engineering  
**Status**: Phase 1 - Content Tagging Template Ready
