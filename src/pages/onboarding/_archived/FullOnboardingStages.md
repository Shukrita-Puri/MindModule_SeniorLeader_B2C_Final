# Archived Onboarding Stages (Full App)

These onboarding stages will be used once the full app is launched with role-playing features that address all three meta-skills (Adaptability, Communication/Social Intelligence, Self-Regulation).

## Current MVP Focus
The MVP focuses exclusively on **Self-Regulation** through the Recalibrate feature. The onboarding has been simplified accordingly.

## Stages to Restore for Full Launch

### Stage 2: Identity
- Questions about role, career stage, and professional context
- Helps personalize scenarios and content

### Stage 3: Behavioral Questions
Three behavioral questions that assess:
1. **Q1: Setback Response** → Maps to Adaptability/Learning
2. **Q2: Pressure Response** → Maps to Self-Regulation
3. **Q3: Communication Style** → Maps to Communication/Social Intelligence

### Stage 4: Self-Assessment
User self-selects their perceived strength:
- "I adapt well when things change" (ALA)
- "I connect well with others and read the room" (CSI)
- "I stay composed under pressure" (SRR)
- "I'm still building these capabilities"

### Stage 5: Results
Shows comprehensive results across all three meta-skills:
- Triangle/radar chart displaying all three scores (/10 scale)
- Profile type (e.g., "Balanced Developer", "Adaptive Communicator")
- Alignment check (comparing self-assessment with calculated scores)
- Pattern insights from behavioral responses
- Development path recommendations

## Notes for Full Launch
- Scoring algorithm in `src/utils/onboardingScoring.ts` already supports all three meta-skills
- Results page shows /10 scale for meta-skills
- Mental Fitness Score (0-100) is calculated separately and introduced after first practice
- When role-playing is added, use the lowest meta-skill score to determine primary practice focus
