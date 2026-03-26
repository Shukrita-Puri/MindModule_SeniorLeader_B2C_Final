

# Insights Page: 7 Fixes

## Task 1: Win Extraction — Only Use User Messages

**Root cause:** All 3 extraction locations (`self-mastery-coach`, `dialogue-session-manage`, `process-orphaned-sessions`) pass both user AND coach messages to the AI. The AI then sometimes extracts the coach's observations as wins.

**Fix:** In all 3 files, filter messages to only include `role: 'user'` before sending to the AI. The system prompt already provides context — the AI just needs to see what the user said, not what the coach said.

```typescript
// BEFORE (all 3 files)
const aiMessages = sessionMessages.map(m => ({
  role: m.sender_type === 'user' ? 'user' : 'assistant',
  content: m.content,
}));

// AFTER
const aiMessages = sessionMessages
  .filter(m => m.sender_type === 'user')
  .map(m => ({ role: 'user' as const, content: m.content }));
```

Also update the system prompt in all 3 to say: "You are given ONLY user messages from a coaching conversation. Every message is something the user said. Extract genuine wins — actions they took, achievements, growth moments."

Remove the `WIN_BLOCKLIST` from `self-mastery-coach` — it's no longer needed since coach messages won't be in the input.

**Files:** `self-mastery-coach/index.ts`, `dialogue-session-manage/index.ts`, `process-orphaned-sessions/index.ts`

---

## Task 2: Domain Tagging — Multi-Signal + Secondary Tags (Clarity/Renewal/Recalibration)

**Primary domain tagging** — improve the cascade in `Insights.tsx` (lines 878-890):

- **Resilience** first: `regulation_level === 'managed'|'composed'` OR content matches patience/strength/persisted/bounced/endured/despite
- **Leadership**: `primary_emotion === 'pride'|'confidence'` OR content matches led/delegated/mentored/inspired
- **Decision**: `agency_type === 'proactive'|'decisive'` OR content matches decided/chose/committed/pivoted (but NOT "is live", "launched" without a decision verb)
- **Growth**: `growth_signal === 'insight'|'progress'|'learning'|'breakthrough'` OR content matches learned/realized/grew/first time
- **Delivery** (default): everything else

**Secondary tags** — use the SAME definitions from Performance Patterns (`LeadershipPatternsCard`):

| Tag | Maps to | Source metric | Signal in win content |
|-----|---------|---------------|----------------------|
| Recalibration | `energyRegulation` | energy_balance check-in | regulated, recalibrated, managed energy, shifted, adjusted, stayed steady |
| Clarity | `focusRecovery` | clarity_level check-in | clarity, focused, cut through, clear thinking, mental precision |
| Renewal | `energyRenewal` | confidence_level check-in | recharged, recovered, rested, paused, grounded, renewed |

These are rendered as small secondary pills next to the primary domain tag. When a win is tagged with one of these, it conceptually contributes to that dimension in Performance Patterns (read-only attribution — no score mutation needed since the dimension scores come from check-in data, not wins).

**File:** `Insights.tsx`

---

## Task 3: Remove AI Observation from Performance Patterns

Delete lines 296-307 in `LeadershipPatternsCard.tsx` — the entire Section 1 block with the `Sparkles` icon and `data.aiObservation`.

**File:** `LeadershipPatternsCard.tsx`

---

## Task 4: Fix Rolling Weekly Heatmap — Future Days

The `isFuture = dateStr > todayStr` logic at line 740 of `PerformanceRhythmCard.tsx` should work, but need to verify there's no fallback to the composite grid. Ensure future days always render as greyed/empty regardless of data.

**File:** `PerformanceRhythmCard.tsx`

---

## Task 5: Merge Coach Impact into How You Show Up

Remove the separate "Coach Impact" headline block (lines 941-956 in `PerformanceRhythmCard.tsx`). When `causeEffectInsight` contains "coach", append it as a bullet inside the "How You Show Up" section (lines 884-913) using the `presenceActions` pattern. If no "How You Show Up" section is visible, render it in the default muted style without the "Coach Impact" headline.

**File:** `PerformanceRhythmCard.tsx`

---

## Task 6: Verify HRV × Calendar Cause-Effect (Auth + Dev)

Path A (line 337) requires `insightCalendarEvents.length >= 2 && wearableData.length >= 3`. The cascade is A→B→C→D→E→F with early `if (!causeEffectInsight && ...)` gates, so ordering is correct. Verify that:
- Auth users with calendar + wearable data see Path A fire
- Dev mode users with matching data also see it
- The rendering gate (`checkInCount >= 7`) is met for both paths

If Path A doesn't surface, it's because the data doesn't have matching event-day HRV readings or deviation < 10%. No code change needed if logic is correct — just verify.

**File:** `PerformanceRhythmCard.tsx` (verify only)

---

## Task 7: Fix "Under Pressure" Semantics

Replace "Under pressure" label and insight text in `Insights.tsx` (lines 847-870):

- Stat box label: "Under pressure" → "With composure"
- Insight text: "{pct}% of your wins came under pressure — that's your resilience pattern" → "{pct}% of your wins showed active self-regulation — that's your composure pattern"

**File:** `Insights.tsx`

---

## Files Modified

| File | Changes |
|------|---------|
| `self-mastery-coach/index.ts` | Filter to user-only messages; simplify prompt; remove blocklist |
| `dialogue-session-manage/index.ts` | Filter to user-only messages; update prompt |
| `process-orphaned-sessions/index.ts` | Filter to user-only messages; update prompt |
| `Insights.tsx` | Fix domain tagging cascade; add secondary Clarity/Renewal/Recalibration pills; fix "under pressure" → "with composure" |
| `LeadershipPatternsCard.tsx` | Remove AI observation section |
| `PerformanceRhythmCard.tsx` | Merge coach impact into How You Show Up; verify heatmap future-day logic |

No database changes needed.

