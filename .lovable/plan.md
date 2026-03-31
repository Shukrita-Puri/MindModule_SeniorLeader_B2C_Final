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
   - P4: State-Aware Afternoon (morning depleted/managing + afternoon high-stakes)
   - P5: Evening Cool-Down (references actual day, Sunday→Monday signals, soft weekend tone)
   - P6: Pattern Alert + Feature Performance (consecutive low, recovery deficit, streak milestones, coach session readiness lift >20%)
   - P7: Daily Fallback (best available signal)

3. **`generateNudgeCopy()`** — AI copy via Lovable AI Gateway (gemini-2.5-flash-lite), 6s timeout, static fallbacks if AI unavailable.

4. **Hardened suppression**: quiet hours 10pm–6:30am, in-meeting skip, 30min app-open skip, 2h cooldown (JIT overrides), daily cap 3.

5. **Deep link routing**: each nudge type includes `deep_link_route` in APNs payload, routing users directly to the action:
   - morning_prep → /daily-check-in
   - pre_event_prep → /executive-home (JIT carousel)
   - calendar_gap → /daily-check-in
   - coach_meeting_match → /self-mastery-coach
   - state_aware_nudge → /recalibrate
   - evening_close → /daily-check-in
   - pattern_alert → /insights (feature_performance variant → /self-mastery-coach)
   - daily_fallback → /daily-check-in

### Key Design Decisions
- P4 is pure State-Aware Afternoon; Feature Performance moved into P6 Pattern Alert (both are data-driven observations)
- Evening/weekend copy uses softer "permission to stop" tone
- Sunday evening references Monday's calendar signals (event count, high-stakes)
- Every nudge references something specific — no generic copy possible
- Client reads `deep_link_route` from notification data, with type-based fallback
