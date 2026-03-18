

# Plan: Create AI Transparency Page ("Powered by AI")

## What

Create a new `/powered-by-ai` page following the same structure and styling as Privacy and Terms pages. Add a footer link to it from the Front page, Privacy page, Terms page, and other relevant footers.

## Page Content

The page will disclose:

1. **AI Services Used** — Mind Module uses Google Gemini (via Lovable AI gateway) for all AI-powered features
2. **What AI Powers** — AI Coach conversations, energy insights, dashboard trend analysis, mastery plan generation, state pattern analysis, nudge recommendations, and daily check-in insights
3. **How AI Is Used** — All AI processing happens server-side via backend functions; no client-side AI calls; AI generates real-time responses based on user context
4. **Data Sent to AI** — Anonymised/contextual data (energy scores, check-in outcomes, calendar metadata, practice history) — never raw PII like email or passwords
5. **AI Limitations** — AI Coach is not a licensed professional; outputs are guidance only; no medical/health advice
6. **Human Oversight** — AI responses are not reviewed by humans unless user reports an issue
7. **User Control** — Users can delete conversation history; calendar/wearable integrations are optional

## Files to Create/Modify

| File | Change |
|------|--------|
| `src/pages/PoweredByAI.tsx` | **New** — AI Transparency page matching Privacy/Terms style |
| `src/App.tsx` | Add lazy import and route for `/powered-by-ai` |
| `src/pages/Front.tsx` | Add "Powered by AI" link near existing Privacy trust badge |
| `src/pages/Privacy.tsx` | Add link to AI Transparency page in footer |
| `src/pages/Terms.tsx` | Add link to AI Transparency page in footer |
| `src/components/home/PrivacyFooter.tsx` | Add "Powered by AI" link alongside existing Privacy link |
| `src/pages/onboarding/stages/Stage6Payment.tsx` | Add link in legal links section |
| `src/pages/onboarding/stages/Stage7ContextConnection.tsx` | Add link in legal links section |

## Build Errors

The 26 existing build errors are all in edge functions (type mismatches in `compute-outer-readiness`, `generate-mastery-plan`, `self-mastery-coach`, `state-patterns-insights`, `tiny-wins-insights`) and are **pre-existing** — unrelated to this change. They will not be addressed in this task.

