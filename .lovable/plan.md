## Smart Nudges — Signal-First Architecture (Completed)

### What Changed

Complete rewrite of `supabase/functions/smart-nudges/index.ts` from template-rotation to signal-first architecture.

### Architecture

1. **`buildNudgeContext()`** — single parallel query assembling all signals: calendar events (today + tomorrow), wearable data (HRV, RHR, sleep score + 30d baselines), coach commitments + patterns + stress signals, check-in state, mastery plan, JIT events, 30d performance correlations.

2. **Priority Cascade (P0–P7)**:
   - P0: Morning Preparation (calendar-aware timing — first event minus commute buffer, clamped 6:30–9:30am)
   - P1: JIT Pre-Event (score ≥ 55, 30–90 min window)
   - P2: Calendar Gap (≥20 min, fires 5 min into gap, post-gap load check)
   - P3: Coach Commitment + Meeting Match (semantic keyword match, stress signals)
   - P4: Performance + State-Aware (merged — feature performance correlation + afternoon state)
   - P5: Evening Cool-Down (references actual day, Sunday→Monday signals, soft weekend tone)
   - P6: Pattern Alert (consecutive low, recovery deficit, streak milestones)
   - P7: Daily Fallback (best available signal)

3. **`generateNudgeCopy()`** — AI copy via Lovable AI Gateway (gemini-2.5-flash-lite), 6s timeout, static fallbacks if AI unavailable.

4. **Hardened suppression**: quiet hours 10pm–6:30am, in-meeting skip, 30min app-open skip, 2h cooldown (JIT overrides), daily cap 3.

### Key Design Decisions
- P4/P7 merged: Feature Performance (coach lift > 20% + high-stakes upcoming) and State-Aware Afternoon (morning depleted + afternoon high-stakes) share one priority slot
- Evening/weekend copy uses softer "permission to stop" tone
- Sunday evening references Monday's calendar signals (event count, high-stakes)
- Every nudge references something specific — no generic copy possible
