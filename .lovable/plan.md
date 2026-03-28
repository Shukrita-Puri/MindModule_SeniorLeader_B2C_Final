

# Language Rebranding: Wellness → Performance Science Terminology

## Terminology Map

| Current Term | New Term | Rationale |
|---|---|---|
| Inner Readiness | Decision Readiness | Leaders think in decisions, not "readiness" |
| Inner Readiness Score | Decision Readiness Score | Consistent |
| Emotional State (user-facing) | Mental Sharpness | Performance framing; keep "emotional state" in internal AI prompts |
| Emotional & Cognitive State | Mental Sharpness State | Check-in sub-label |
| Wellness (outside Reset Studio) | Performance Recovery | Avoids "Protocol" which is Reset Studio's term |
| Today's Wellness | Today's Performance Vitals | WellnessCard title |
| wellness check | performance baseline | In description copy |
| wellness insights | performance insights | Privacy page |
| Emotional Awareness (onboarding) | Self-Awareness | Onboarding stage name |

**NOT changing:**
- "Protocol" usage inside Reset Studio / ProtocolCard (already correct)
- "emotional state" inside AI system prompts (dialogue-engine, self-mastery-coach) — these are internal processing terms, not user-facing
- Clarity & Confidence State — already performance-oriented
- Reset Studio language — stays wellness-adjacent by design

## Files to Modify

### 1. `src/components/home/TodayStateCard.tsx`
- Line 76: "Inner Readiness" → "Decision Readiness"
- Line 79: "How Your Inner Readiness Score is Calculated" → "How Your Decision Readiness Score is Calculated"
- Line 80: Replace all "Inner Readiness Score" → "Decision Readiness Score", "Not a wellness check" → "Not a status check", "Outer Readiness Brief" stays (outer is contextually different)

### 2. `src/components/home/StrategicIntentionCard.tsx`
- Line 59: "Inner Readiness Score" → "Decision Readiness Score" in description

### 3. `src/pages/ExecutiveHome.tsx`
- Line 223: "Inner Readiness Score" → "Decision Readiness Score" in Mastery Plan description

### 4. `src/components/home/WellnessCard.tsx`
- Line 48: "Today's Wellness" → "Today's Performance Vitals"
- Internal variable names (wellnessData, wellnessScrollRef, scrollWellness) — rename for consistency

### 5. `src/pages/DailyCheckIn.tsx`
- Line 246: "Emotional & Cognitive State" → "Mental Sharpness State"

### 6. `src/pages/CheckInDetail.tsx`
- Line 83: "Clarity & Confidence State" — **keep as-is** (already performance-oriented)

### 7. `src/pages/Privacy.tsx`
- Line 48: "emotional state, cognitive clarity" → "mental sharpness, cognitive clarity"
- Line 125: "general wellness" → "general performance optimisation"
- Line 147: "wellness insights" → "performance insights"

### 8. `src/pages/Terms.tsx`
- Line 125: "general wellness" → "general performance optimisation"

### 9. `src/pages/PoweredByAI.tsx`
- Line 42: "inner readiness state" → "decision readiness state"

### 10. `src/pages/onboarding/OnboardingFlow.tsx`
- Line 30: Comment "Emotional Awareness" → "Self-Awareness" (cosmetic)

### 11. `src/pages/onboarding/stages/Stage3EmotionalAwareness.tsx`
- Line 26: "I'm aware of my emotional state as it shifts" → "I'm aware of my internal state as it shifts"

### 12. `src/pages/GuidedPracticePlayer.tsx`
- Line 649: "Primal, empowered emotional state" → "Primal, empowered mental state" (this is in visualization content)

### 13. `src/components/insights/PerformanceRhythmCard.tsx`
- Line 872: "inner readiness" → "decision readiness" in explanation text

### 14. `src/utils/energyStateEngine.ts`
- Line 2: Comment update "Inner Readiness" → "Decision Readiness"

### 15. `src/utils/energyStateScoring.ts`
- Line 4: Comment update "Inner Readiness" → "Decision Readiness"

### 16. Edge functions (user-facing strings only)
- `compute-outer-readiness/index.ts` line 869: `'inner readiness score'` → `'decision readiness score'` (this surfaces in UI footer)
- `self-mastery-coach/index.ts`: "Inner Readiness Score" → "Decision Readiness Score" in system prompt context lines (3048) — this affects what the coach says to users
- `generate-dashboard-insight/index.ts` line 46: "emotional awareness" → "self-awareness"
- `generate-energy-insight/index.ts` line 48: "emotional awareness" → "self-awareness"

### Not touching
- `dialogue-engine/index.ts` — all "emotional state" references are internal AI persona mechanics
- `self-mastery-coach/index.ts` — "emotional state" in tracking sections are internal coaching framework, not user-facing
- `generate-onboarding-insight/index.ts` — comment-level "Emotional Awareness" is internal logic
- Reset Studio pages (PauseOutcomePage, PowerUpOutcomePage, PresenceOutcomePage) — "Protocol" stays
- `ProtocolCard.tsx` — stays as-is

## Estimated scope
~16 files, ~30 string replacements. No logic changes, no DB changes, no edge function redeployment needed except for the 4 edge functions with user-facing string updates.

