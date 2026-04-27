## Smart Nudges — Chief-of-Staff Copy Overhaul

### Scope (one file)
`supabase/functions/smart-nudges/index.ts` — copy generation only.

**Untouched**: trigger conditions, timing windows, daily cap (3), suppression stack (2hr gap, quiet hours, DND, in-meeting), engagement learning, APNs delivery, deep-link routing, signal-richness gate, artifact-first gating, all client code, all other edge functions.

### The Contract Every Nudge Must Follow

```
[USER CONTEXT — specific signal from this user's data]  +  [SPECIFIC APP CTA — exact action + screen]
```

Hard rules added to AI system prompt and enforced in fallbacks:
- Body must reference at least one **real** data point already in `NudgeContext`: `wearable.hrvDeltaPct`, `wearable.rhrElevated`, `wearable.sleepScore`, named meeting title, meeting count, completed/pending priority count, morning check-in outcome, consecutive-low pattern, or tomorrow's meetings.
- Body must end with a **specific app verb tied to a screen**: "open your brief", "open your plan", "build your prep plan", "recalibrate now", "close the day". Never "open the app", "check in when ready", "come back".
- If a referenced data field is null → fall through to next template. Never insert placeholder numbers (`?`, `N`, `--`).
- Truncate event titles to first 3 words if > 20 chars (new helper).
- Forbidden words (added to prompt + fallback lint): wellness, mindful, mindfulness, relax, breathe, calm, recharge, self-care, streak, day N, keep it up, well done, great job, productive, productivity, intent, strategy.
- Title: max 6 words (currently 5 — bump to 6 to fit the spec).
- Body: max 18 words.

### Files & Functions Changing

**1. `generateNudgeCopy` system prompt (line 798)**
Replace with a Chief-of-Staff prompt that explicitly states the `[CONTEXT] + [CTA]` formula, lists the only-allowed CTA verbs, lists forbidden words, and shows 3 gold-standard examples (HRV-3-day, board-meeting HR, Sunday week-prep) drawn directly from the user's brief.

**2. Per-type `userPrompt` blocks (lines 813–913)**
Each branch (`nudge_one_morning`, `nudge_one_jit`, `nudge_two_jit`, `nudge_two_priorities`, `nudge_two_recalibrate`, `nudge_two_reserves`, `nudge_three`) gets:
- An explicit "Required: name [signal X]. Required CTA: [verb Y → screen Z]" line.
- A list of context fields actually present in this tick (so the model can't reference a null).
- The 6:30–9:00 morning and 18:00–21:00 evening framing rules per spec.

**3. All `getFallback*` functions (lines 974–1071)** — rewritten in priority order:

| Function | New body (when signal present) |
|---|---|
| `getFallbackNudgeOneMorningCopy` (sleep<60) | "Sleep {N}/100 last night — open your brief to set today's posture" |
| (HRV ≤ -15%) | "HRV {N}% below baseline — build your prep plan before today starts" |
| (high-stakes today) | "{Event} today — open your brief to lock in decision readiness" |
| (heavy day ≥4 mtgs) | "{N} meetings today — open your plan to anchor mental sharpness" |
| (Saturday + meeting) | "Body slower today — open your brief before {Event}" |
| (calendar light) | "Light calendar — open your brief to decide where to spend capacity" |
| `getFallbackNudgeOneJitCopy` | "{Event} in {N} min — open your prep plan, it's queued" |
| `getFallbackNudgeTwoJitCopy` | "{Event} in {N} min — open your plan to anchor sharpness" |
| `getFallbackNudgeTwoPrioritiesCopy` | "{N} practices left on today's plan — open your plan to stay on track" |
| `getFallbackNudgeTwoRecalibrateCopy` | "Started low, {Event} ahead — recalibrate now in your brief" |
| `getFallbackNudgeTwoReservesCopy` (rhr) | "RHR elevated, {Event} ahead — recalibrate now before it starts" |
| (hrv) | "HRV {N}% below baseline, {Event} ahead — open your brief to recalibrate" |
| `getFallbackNudgeTwoConsecutiveLowCopy` | "HRV down {N} days running — open your brief to reset trajectory" |
| `getFallbackNudgeThreeCopy` Sun + tomorrow stakes | "{Event} tomorrow — use Sunday to build your prep plan now" |
| Sun + heavy Mon | "{N} meetings Monday — open your brief tonight to set the week" |
| Friday | "5-day load behind you — open your brief to close the week" |
| priorities remaining | "{N} practices still open — open your plan to close the day" |
| RHR elevated through day | "RHR ran high today — open your brief to recover into tomorrow" |
| heavy day done | "{N} meetings done — open your brief, 90-sec close protects tomorrow" |
| default close | "Open your brief — a 90-sec close protects tomorrow's reserves" |

**4. New helper `truncateEventTitle(title)`** — first 3 words if `length > 20`. Used in every fallback that interpolates an event title.

**5. Tighten `containsFabricatedWearableData`** — also reject AI bodies that contain a `%`, `ms`, "baseline", "HRV", "RHR", or "sleep score" when the corresponding field is null (currently only blanket-checks `hasWearableData`). Keeps the data-honesty contract.

**6. Update payload stamp**
Bump `architecture: 'cos-mind-v5'` → `'cos-mind-v6-cta'` so we can audit post-deploy that all fresh rows use the new copy contract.

**7. Update memory**
`mem://features/notifications/smart-nudges-mvp-framework.md` → record v6 copy contract: `[CONTEXT] + [CTA]`, allowed CTA verbs, forbidden words, 6-word title / 18-word body, fall-through-on-null rule.

### Validation After Deploy
1. Read latest 30 rows of `notification_log` where `payload->>'architecture' = 'cos-mind-v6-cta'`.
2. Assert each body: contains an allowed CTA verb, references a real signal, has no forbidden words, no `?`/`N`/`--` placeholders.
3. Re-run existing `v5_validation_test.ts` (already audits floor / cooldown / deep_link / cta_experiment) and extend it with the v6 forbidden-word + null-placeholder checks.

### Out of Scope
Triggers, timing, caps, suppression, engagement model, deep-link routes, APNs config, client UI, other edge functions, DB schema. Pure copy + prompt change.